import type {
  ConversationRecording,
  ConversationRepository,
  PersonMemory,
  PeopleRepository,
  RelationshipRepository,
} from '@emory/db'
import { DeepgramService } from './deepgram.service.js'
import { MemoryExtractionService } from './memory-extraction.service.js'
import { ProfileKeyFactsService } from './profile-key-facts.service.js'

export type ProcessRecordingInput = {
  personId: string
  encounterId?: string | null
  audioPath: string
  mimeType: string
  durationMs?: number | null
  recordedAt: string
  /** When set, the row already exists (e.g. after `save-and-process` wrote the file). */
  recordingId?: string
}

export type ProcessRecordingResult = {
  recording: ConversationRecording
  memories: PersonMemory[]
}

const MEMORY_CONFIDENCE_THRESHOLD = 0.65

function summarizeMemory(memory: {
  memoryText: string
  memoryType: string
  confidence: number | null
  appliesToPerson?: string
  personId?: string
}) {
  return {
    memoryText: memory.memoryText,
    memoryType: memory.memoryType,
    confidence: memory.confidence,
    appliesToPerson: memory.appliesToPerson,
    personId: memory.personId,
  }
}

function relationshipContextFromGraph(
  relationshipRepo: RelationshipRepository,
  selfId: string | undefined,
  targetPersonId: string,
): string | null {
  if (!selfId) return null
  const rel = relationshipRepo.findBetween(selfId, targetPersonId)
  if (!rel) return null
  const n = rel.notes?.trim()
  return n ? `${rel.relationshipType} (${n})` : rel.relationshipType
}

export class ConversationProcessingService {
  constructor(
    private conversationRepo: ConversationRepository,
    private peopleRepo: PeopleRepository,
    private relationshipRepo: RelationshipRepository,
    private deepgramService: DeepgramService,
    private memoryExtractionService: MemoryExtractionService,
    private profileKeyFactsService: ProfileKeyFactsService,
  ) {}

  async processRecording(input: ProcessRecordingInput): Promise<ProcessRecordingResult> {
    console.log('[memory-processing] start', {
      recordingId: input.recordingId ?? null,
      personId: input.personId,
      encounterId: input.encounterId ?? null,
      audioPath: input.audioPath,
      mimeType: input.mimeType,
      durationMs: input.durationMs ?? null,
      recordedAt: input.recordedAt,
    })

    const targetPerson = this.peopleRepo.findById(input.personId)
    if (!targetPerson) {
      console.error('[memory-processing] target person not found', {
        personId: input.personId,
        recordingId: input.recordingId ?? null,
      })
      throw new Error('Target person not found')
    }
    const selfPerson = this.peopleRepo.findSelf()

    let recording: ConversationRecording
    if (input.recordingId) {
      const existing = this.conversationRepo.findRecordingById(input.recordingId)
      if (!existing) {
        throw new Error('Recording not found')
      }
      if (existing.personId !== input.personId) {
        throw new Error('Recording does not belong to this person')
      }
      recording = existing
    } else {
      recording = this.conversationRepo.createRecording({
        personId: input.personId,
        encounterId: input.encounterId ?? null,
        recordedAt: input.recordedAt,
        audioPath: input.audioPath,
        mimeType: input.mimeType,
        durationMs: input.durationMs ?? null,
      })
    }

    let transcriptText = ''
    try {
      const transcript = await this.deepgramService.transcribeFile({
        audioPath: input.audioPath,
        mimeType: input.mimeType,
      })
      transcriptText = transcript.text
      console.log('[memory-processing] transcript complete', {
        recordingId: recording.id,
        provider: transcript.provider,
        transcriptLength: transcriptText.length,
      })
      recording = this.conversationRepo.setTranscript(recording.id, transcriptText, transcript.provider) ?? recording
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[memory-processing] transcript failed', {
        recordingId: recording.id,
        personId: input.personId,
        error: message,
      })
      recording = this.conversationRepo.markTranscriptFailed(recording.id, message) ?? recording
      return { recording, memories: [] }
    }

    if (!transcriptText.trim()) {
      console.log('[memory-processing] transcript empty, skipping extraction', {
        recordingId: recording.id,
        personId: input.personId,
      })
      const extraction = {
        summary: '',
        memories: [],
        uncertainItems: [],
      }
      recording = this.conversationRepo.setExtractionResult(recording.id, extraction) ?? recording
      return { recording, memories: [] }
    }

    try {
      const extraction = await this.memoryExtractionService.extractMemories({
        transcript: transcriptText,
        selfPerson: selfPerson
          ? {
              id: selfPerson.id,
              name: selfPerson.name,
              bio: selfPerson.bio,
            }
          : null,
        targetPerson: {
          id: targetPerson.id,
          name: targetPerson.name,
          relationship: relationshipContextFromGraph(
            this.relationshipRepo,
            selfPerson?.id,
            targetPerson.id,
          ),
        },
        recordedAt: input.recordedAt,
      })

      console.log('[memory-processing] extraction complete', {
        recordingId: recording.id,
        summaryLength: extraction.summary.length,
        extractedMemoryCount: extraction.memories.length,
        uncertainItemCount: extraction.uncertainItems.length,
      })

      recording = this.conversationRepo.setExtractionResult(recording.id, extraction) ?? recording

      const acceptedMemories = extraction.memories
        .filter((memory) => memory.confidence === null || memory.confidence >= MEMORY_CONFIDENCE_THRESHOLD)
        .flatMap((memory) => {
          const ownerPersonId = memory.appliesToPerson === 'target_person'
            ? input.personId
            : memory.appliesToPerson === 'self_person'
              ? selfPerson?.id ?? null
              : null

          if (!ownerPersonId) return []

          return [{
            personId: ownerPersonId,
            recordingId: recording.id,
            memoryText: memory.memoryText,
            memoryType: memory.memoryType,
            memoryDate: memory.memoryDate,
            confidence: memory.confidence,
            sourceQuote: memory.sourceQuote,
          }]
        })

      const rejectedMemories = extraction.memories.filter(
        (memory) => memory.confidence !== null && memory.confidence < MEMORY_CONFIDENCE_THRESHOLD,
      )

      console.log('[memory-processing] memory selection complete', {
        recordingId: recording.id,
        threshold: MEMORY_CONFIDENCE_THRESHOLD,
        acceptedCount: acceptedMemories.length,
        rejectedCount: rejectedMemories.length,
      })

      const memories = this.conversationRepo.addMemories(acceptedMemories)
      console.log('[memory-processing] memory insert complete', {
        recordingId: recording.id,
        insertedCount: memories.length,
      })

      const affectedPersonIds = [...new Set(memories.map((memory) => memory.personId))]
      for (const personId of affectedPersonIds) {
        const person = this.peopleRepo.findById(personId)
        if (!person) continue

        try {
          const allMemories = this.conversationRepo.getAllMemoriesByPerson(personId)
          const keyFacts = await this.profileKeyFactsService.synthesizeKeyFacts({
            personName: person.name,
            memories: allMemories.map((memory) => ({
              memoryText: memory.memoryText,
              memoryType: memory.memoryType,
              memoryDate: memory.memoryDate,
              confidence: memory.confidence,
            })),
          })

          this.peopleRepo.updateProfile(personId, { keyFacts })
          console.log('[memory-processing] key facts updated', {
            recordingId: recording.id,
            personId,
            memoryCount: allMemories.length,
            keyFactCount: keyFacts.length,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error('[memory-processing] key fact synthesis failed', {
            recordingId: recording.id,
            personId,
            error: message,
          })
        }
      }

      return { recording, memories }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[memory-processing] extraction failed', {
        recordingId: recording.id,
        personId: input.personId,
        error: message,
      })
      recording = this.conversationRepo.markExtractionFailed(recording.id, message) ?? recording
      return { recording, memories: [] }
    }
  }
}
