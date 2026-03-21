import type {
  ConversationRecording,
  ConversationRepository,
  PersonMemory,
  PeopleRepository,
} from '@emory/db'
import { DeepgramService } from './deepgram.service.js'
import { MemoryExtractionService } from './memory-extraction.service.js'

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

export class ConversationProcessingService {
  constructor(
    private conversationRepo: ConversationRepository,
    private peopleRepo: PeopleRepository,
    private deepgramService: DeepgramService,
    private memoryExtractionService: MemoryExtractionService,
  ) {}

  async processRecording(input: ProcessRecordingInput): Promise<ProcessRecordingResult> {
    const targetPerson = this.peopleRepo.findById(input.personId)
    if (!targetPerson) {
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
      recording = this.conversationRepo.setTranscript(recording.id, transcriptText, transcript.provider) ?? recording
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      recording = this.conversationRepo.markTranscriptFailed(recording.id, message) ?? recording
      return { recording, memories: [] }
    }

    if (!transcriptText.trim()) {
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
          relationship: targetPerson.relationship,
        },
        recordedAt: input.recordedAt,
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

      const memories = this.conversationRepo.addMemories(acceptedMemories)
      return { recording, memories }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      recording = this.conversationRepo.markExtractionFailed(recording.id, message) ?? recording
      return { recording, memories: [] }
    }
  }
}
