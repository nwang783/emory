import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type {
  ConversationRecording,
  ConversationRepository,
  EncounterRepository,
  PeopleRepository,
  PersonMemory,
} from '@emory/db'
import { ConversationStorageService } from '../services/conversation-storage.service.js'
import type {
  ConversationProcessingService,
  ProcessRecordingInput,
} from '../services/conversation-processing.service.js'
import type {
  MemoryQueryService,
  QueryMemoriesFromTextInput,
  QueryMemoriesInput,
} from '../services/memory-query.service.js'
import { getActiveSessionId } from './encounter.ipc.js'

type SaveAndProcessPayload = {
  personId: string
  recordedAt: string
  mimeType: string
  durationMs?: number | null
  audioBytes: Uint8Array
}

type SaveAndProcessSuccess = {
  success: true
  recording: ConversationRecording
  memories: PersonMemory[]
}

type SaveAndProcessFailure = { success: false; error: string }

function toUint8Array(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value
  if (value && typeof value === 'object' && 'buffer' in value && 'byteLength' in value) {
    try {
      return new Uint8Array(value as ArrayBufferView)
    } catch {
      return null
    }
  }
  return null
}

export function registerConversationIpc(
  _mainWindow: BrowserWindow,
  processingService: ConversationProcessingService,
  conversationRepo: ConversationRepository,
  encounterRepo: EncounterRepository,
  peopleRepo: PeopleRepository,
  memoryQueryService: MemoryQueryService,
): void {
  const storage = new ConversationStorageService()

  ipcMain.handle(
    'conversation:save-and-process',
    async (_event, payload: unknown): Promise<SaveAndProcessSuccess | SaveAndProcessFailure> => {
      if (!payload || typeof payload !== 'object') {
        return { success: false, error: 'Invalid payload' }
      }

      const p = payload as SaveAndProcessPayload
      if (typeof p.personId !== 'string' || p.personId.length === 0) {
        return { success: false, error: 'personId is required' }
      }
      if (typeof p.recordedAt !== 'string' || p.recordedAt.length === 0) {
        return { success: false, error: 'recordedAt is required' }
      }
      if (typeof p.mimeType !== 'string' || p.mimeType.length === 0) {
        return { success: false, error: 'mimeType is required' }
      }

      const bytes = toUint8Array(p.audioBytes)
      if (!bytes || bytes.byteLength === 0) {
        return { success: false, error: 'audioBytes is required' }
      }

      if (!peopleRepo.findById(p.personId)) {
        return { success: false, error: 'Person not found' }
      }

      const recordedAtDate = new Date(p.recordedAt)
      if (Number.isNaN(recordedAtDate.getTime())) {
        return { success: false, error: 'recordedAt must be a valid ISO date string' }
      }

      const durationMs =
        typeof p.durationMs === 'number' && Number.isFinite(p.durationMs) ? Math.round(p.durationMs) : null

      const recordingId = randomUUID()
      let audioPath: string | null = null

      try {
        const saved = await storage.saveRecording({
          recordingId,
          mimeType: p.mimeType,
          bytes,
          recordedAt: recordedAtDate,
        })
        audioPath = saved.audioPath
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: `Failed to save audio: ${message}` }
      }

      let encounterId: string | null = null
      const sessionId = getActiveSessionId()
      if (sessionId) {
        const active = encounterRepo.findActiveEncounter(p.personId, sessionId)
        encounterId = active?.id ?? null
      }

      let createdRecordingId: string | null = null
      try {
        const recording = conversationRepo.createRecording({
          id: recordingId,
          personId: p.personId,
          encounterId,
          recordedAt: p.recordedAt,
          audioPath: audioPath!,
          mimeType: p.mimeType,
          durationMs,
        })
        createdRecordingId = recording.id

        const processInput: ProcessRecordingInput = {
          recordingId: recording.id,
          personId: p.personId,
          encounterId,
          audioPath: audioPath!,
          mimeType: p.mimeType,
          durationMs,
          recordedAt: p.recordedAt,
        }

        const result = await processingService.processRecording(processInput)
        return { success: true, recording: result.recording, memories: result.memories }
      } catch (err) {
        if (createdRecordingId) {
          conversationRepo.deleteRecordingById(createdRecordingId)
        }
        if (audioPath) {
          await storage.removeFile(audioPath)
        }
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: `Failed to process recording: ${message}` }
      }
    },
  )

  ipcMain.handle('conversation:process-recording', async (_event, input: ProcessRecordingInput) => {
    try {
      const result = await processingService.processRecording(input)
      return { success: true, ...result }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('conversation:get-recordings-by-person', (_event, personId: string, limit?: number) => {
    if (typeof personId !== 'string' || personId.length === 0) return []
    try {
      return conversationRepo.getRecordingsByPerson(personId, limit ?? 50)
    } catch {
      return []
    }
  })

  ipcMain.handle('conversation:get-memories-by-person', (_event, personId: string, limit?: number) => {
    if (typeof personId !== 'string' || personId.length === 0) return []
    try {
      return conversationRepo.getMemoriesByPerson(personId, limit ?? 20)
    } catch {
      return []
    }
  })

  ipcMain.handle('conversation:query-memories', async (_event, input: QueryMemoriesInput) => {
    try {
      const result = await memoryQueryService.queryFromAudio(input)
      return { success: true, ...result }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('conversation:query-memories-from-text', async (_event, input: QueryMemoriesFromTextInput) => {
    try {
      const result = await memoryQueryService.queryFromText(input)
      return { success: true, ...result }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false, error: message }
    }
  })
}
