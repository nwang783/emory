import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type {
  ConversationRepository,
} from '@emory/db'
import type {
  ConversationProcessingService,
  ProcessRecordingInput,
} from '../services/conversation-processing.service.js'
import type { ConversationIngestService } from '../services/conversation-ingest.service.js'
import type {
  MemoryQueryService,
  QueryMemoriesFromTextInput,
  QueryMemoriesInput,
} from '../services/memory-query.service.js'

type SaveAndProcessPayload = {
  personId: string
  recordedAt: string
  mimeType: string
  durationMs?: number | null
  audioBytes: Uint8Array
}

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
  _processingService: ConversationProcessingService,
  conversationIngestService: ConversationIngestService,
  conversationRepo: ConversationRepository,
  memoryQueryService: MemoryQueryService,
): void {
  ipcMain.handle(
    'conversation:save-and-process',
    async (_event, payload: unknown) => {
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
      return conversationIngestService.saveAndProcessBytes({
        personId: p.personId,
        recordedAt: p.recordedAt,
        mimeType: p.mimeType,
        durationMs: p.durationMs,
        audioBytes: bytes,
      })
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

  ipcMain.handle('conversation:get-all-memories', (_event, limit?: number) => {
    try {
      return conversationRepo.getAllMemories(limit ?? 50)
    } catch {
      return []
    }
  })

  ipcMain.handle(
    'conversation:search-memories',
    (
      _event,
      input: {
        personIds?: string[]
        startAt?: string | null
        endAt?: string | null
        searchText?: string | null
        limit?: number
      },
    ) => {
      console.log('[conversation:search-memories] input:', JSON.stringify(input))
      try {
        const result = conversationRepo.searchMemories(input)
        console.log('[conversation:search-memories] result count:', result.length)
        return result
      } catch (err) {
        console.error('[conversation:search-memories] error:', err)
        return []
      }
    },
  )

  ipcMain.handle(
    'conversation:update-memory',
    (_event, id: string, input: { memoryText?: string; memoryType?: string; memoryDate?: string }) => {
      if (typeof id !== 'string' || id.length === 0) return null
      try {
        return conversationRepo.updateMemory(id, input)
      } catch {
        return null
      }
    },
  )

  ipcMain.handle('conversation:delete-memory', (_event, id: string) => {
    if (typeof id !== 'string' || id.length === 0) return false
    try {
      return conversationRepo.deleteMemory(id)
    } catch {
      return false
    }
  })
}
