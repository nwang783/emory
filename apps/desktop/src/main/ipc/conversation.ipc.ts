import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type { ConversationRepository } from '@emory/db'
import type { ProcessRecordingInput } from '../services/conversation-processing.service.js'
import type { ConversationProcessingService } from '../services/conversation-processing.service.js'
import type { MemoryQueryService, QueryMemoriesInput } from '../services/memory-query.service.js'

export function registerConversationIpc(
  _mainWindow: BrowserWindow,
  processingService: ConversationProcessingService,
  conversationRepo: ConversationRepository,
  memoryQueryService: MemoryQueryService,
): void {
  ipcMain.handle(
    'conversation:process-recording',
    async (_event, input: ProcessRecordingInput) => {
      try {
        const result = await processingService.processRecording(input)
        return { success: true, ...result }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle(
    'conversation:get-recordings-by-person',
    (_event, personId: string, limit?: number) => {
      try {
        return conversationRepo.getRecordingsByPerson(personId, limit)
      } catch {
        return []
      }
    },
  )

  ipcMain.handle(
    'conversation:get-memories-by-person',
    (_event, personId: string, limit?: number) => {
      try {
        return conversationRepo.getMemoriesByPerson(personId, limit)
      } catch {
        return []
      }
    },
  )

  ipcMain.handle(
    'conversation:query-memories',
    async (_event, input: QueryMemoriesInput) => {
      try {
        const result = await memoryQueryService.queryFromAudio(input)
        return { success: true, ...result }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, error: message }
      }
    },
  )
}
