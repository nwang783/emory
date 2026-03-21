import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type { UnknownSightingRepository } from '@emory/db'

export function registerUnknownIpc(
  _mainWindow: BrowserWindow,
  unknownRepo: UnknownSightingRepository,
): void {
  ipcMain.handle(
    'unknown:track',
    (_event, tempId: string, embeddingData?: number[], confidence?: number) => {
      try {
        const existing = unknownRepo.findByTempId(tempId)
        if (existing) {
          const embedding = embeddingData ? new Float32Array(embeddingData) : undefined
          return unknownRepo.updateSighting(existing.id, confidence, embedding)
        }
        const embedding = embeddingData ? new Float32Array(embeddingData) : undefined
        return unknownRepo.create(tempId, embedding, confidence)
      } catch (err) {
        console.error('[unknown:track] Failed:', err instanceof Error ? err.message : String(err))
        return null
      }
    },
  )

  ipcMain.handle('unknown:get-active', () => {
    try {
      return unknownRepo.findAllActive()
    } catch {
      return []
    }
  })

  ipcMain.handle('unknown:get-all', (_event, limit?: number) => {
    try {
      return unknownRepo.findAll(limit)
    } catch {
      return []
    }
  })

  ipcMain.handle('unknown:get-active-count', () => {
    try {
      return unknownRepo.getActiveCount()
    } catch {
      return 0
    }
  })

  ipcMain.handle('unknown:dismiss', (_event, id: string) => {
    try {
      return unknownRepo.dismiss(id)
    } catch {
      return null
    }
  })

  ipcMain.handle('unknown:name-as-person', (_event, id: string, personId: string) => {
    try {
      return unknownRepo.nameAsPerson(id, personId)
    } catch {
      return null
    }
  })

  ipcMain.handle('unknown:find-by-id', (_event, id: string) => {
    try {
      return unknownRepo.findById(id)
    } catch {
      return null
    }
  })
}
