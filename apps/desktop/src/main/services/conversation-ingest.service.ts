import { randomUUID } from 'node:crypto'
import type {
  ConversationRecording,
  ConversationRepository,
  EncounterRepository,
  PeopleRepository,
  PersonMemory,
} from '@emory/db'
import type {
  ConversationProcessingService,
  ProcessRecordingInput,
} from './conversation-processing.service.js'

type ConversationStorage = {
  saveRecording(input: {
    recordingId: string
    mimeType: string
    bytes: Uint8Array
    recordedAt: Date
  }): Promise<{ audioPath: string; mimeType: string }>
  removeFile(audioPath: string): Promise<void>
}

export type SaveAndProcessBytesInput = {
  personId: string
  recordedAt: string
  mimeType: string
  durationMs?: number | null
  audioBytes: Uint8Array
}

export type SaveAndProcessBytesSuccess = {
  success: true
  recording: ConversationRecording
  memories: PersonMemory[]
}

export type SaveAndProcessBytesFailure = {
  success: false
  error: string
}

export type SaveAndProcessBytesResult = SaveAndProcessBytesSuccess | SaveAndProcessBytesFailure

export class ConversationIngestService {
  constructor(
    private readonly processingService: ConversationProcessingService,
    private readonly conversationRepo: ConversationRepository,
    private readonly encounterRepo: EncounterRepository,
    private readonly peopleRepo: PeopleRepository,
    private readonly getActiveSessionId: () => string | null,
    private readonly storage: ConversationStorage,
  ) {}

  async saveAndProcessBytes(input: SaveAndProcessBytesInput): Promise<SaveAndProcessBytesResult> {
    if (typeof input.personId !== 'string' || input.personId.length === 0) {
      return { success: false, error: 'personId is required' }
    }
    if (typeof input.recordedAt !== 'string' || input.recordedAt.length === 0) {
      return { success: false, error: 'recordedAt is required' }
    }
    if (typeof input.mimeType !== 'string' || input.mimeType.length === 0) {
      return { success: false, error: 'mimeType is required' }
    }
    if (!(input.audioBytes instanceof Uint8Array) || input.audioBytes.byteLength === 0) {
      return { success: false, error: 'audioBytes is required' }
    }
    if (!this.peopleRepo.findById(input.personId)) {
      return { success: false, error: 'Person not found' }
    }

    const recordedAtDate = new Date(input.recordedAt)
    if (Number.isNaN(recordedAtDate.getTime())) {
      return { success: false, error: 'recordedAt must be a valid ISO date string' }
    }

    const durationMs =
      typeof input.durationMs === 'number' && Number.isFinite(input.durationMs)
        ? Math.max(0, Math.round(input.durationMs))
        : null

    const recordingId = randomUUID()
    let audioPath: string | null = null

    try {
      const saved = await this.storage.saveRecording({
        recordingId,
        mimeType: input.mimeType,
        bytes: input.audioBytes,
        recordedAt: recordedAtDate,
      })
      audioPath = saved.audioPath
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: `Failed to save audio: ${message}` }
    }

    let encounterId: string | null = null
    const sessionId = this.getActiveSessionId()
    if (sessionId) {
      const active = this.encounterRepo.findActiveEncounter(input.personId, sessionId)
      encounterId = active?.id ?? null
    }

    let createdRecordingId: string | null = null
    try {
      const recording = this.conversationRepo.createRecording({
        id: recordingId,
        personId: input.personId,
        encounterId,
        recordedAt: input.recordedAt,
        audioPath: audioPath!,
        mimeType: input.mimeType,
        durationMs,
      })
      createdRecordingId = recording.id

      const processInput: ProcessRecordingInput = {
        recordingId: recording.id,
        personId: input.personId,
        encounterId,
        audioPath: audioPath!,
        mimeType: input.mimeType,
        durationMs,
        recordedAt: input.recordedAt,
      }

      const result = await this.processingService.processRecording(processInput)
      return { success: true, recording: result.recording, memories: result.memories }
    } catch (err) {
      if (createdRecordingId) {
        this.conversationRepo.deleteRecordingById(createdRecordingId)
      }
      if (audioPath) {
        await this.storage.removeFile(audioPath)
      }
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: `Failed to process recording: ${message}` }
    }
  }
}
