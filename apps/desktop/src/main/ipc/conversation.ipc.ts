import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import type { ConversationRecording, ConversationRepository, EncounterRepository } from '@emory/db'
import { ConversationStorageService } from '../services/conversation-storage.service.js'
import { getActiveSessionId } from './encounter.ipc.js'

type SaveAndProcessPayload = {
  personId: string
  recordedAt: string
  mimeType: string
  durationMs?: number | null
  audioBytes: Uint8Array
}

type SaveAndProcessSuccess = { success: true; recording: ConversationRecording }
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
  conversationRepo: ConversationRepository,
  encounterRepo: EncounterRepository,
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

      try {
        let encounterId: string | null = null
        const sessionId = getActiveSessionId()
        if (sessionId) {
          const active = encounterRepo.findActiveEncounter(p.personId, sessionId)
          encounterId = active?.id ?? null
        }

        const recording = conversationRepo.createRecording({
          id: recordingId,
          personId: p.personId,
          encounterId,
          recordedAt: p.recordedAt,
          audioPath,
          mimeType: p.mimeType,
          durationMs,
        })

        return { success: true, recording }
      } catch (err) {
        if (audioPath) {
          await storage.removeFile(audioPath)
        }
        const message = err instanceof Error ? err.message : String(err)
        return { success: false, error: `Failed to create recording row: ${message}` }
      }
    },
  )

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
}
