import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type { EncounterRepository } from '@emory/db'

let activeSessionId: string | null = null

export function registerEncounterIpc(
  _mainWindow: BrowserWindow,
  encounterRepo: EncounterRepository,
): void {
  ipcMain.handle('encounter:start-session', (_event, deviceId?: string) => {
    try {
      const session = encounterRepo.createSession(deviceId)
      activeSessionId = session.id
      console.log(`[encounter] Session started: ${session.id}`)
      return { success: true, session }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('encounter:end-session', () => {
    if (!activeSessionId) return { success: false, error: 'No active session' }
    try {
      const session = encounterRepo.endSession(activeSessionId)
      console.log(`[encounter] Session ended: ${activeSessionId}`)
      activeSessionId = null
      return { success: true, session }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return { success: false, error: message }
    }
  })

  ipcMain.handle('encounter:get-active-session', () => {
    return activeSessionId
  })

  ipcMain.handle(
    'encounter:log',
    (_event, personId: string, confidence: number) => {
      if (!activeSessionId) return null
      try {
        const active = encounterRepo.findActiveEncounter(personId, activeSessionId)
        if (active) {
          return encounterRepo.updateEncounter(active.id, confidence)
        }
        return encounterRepo.createEncounter(personId, activeSessionId, confidence)
      } catch (err) {
        console.error('[encounter:log] Failed:', err instanceof Error ? err.message : String(err))
        return null
      }
    },
  )

  ipcMain.handle(
    'encounter:end',
    (_event, personId: string) => {
      if (!activeSessionId) return null
      try {
        const active = encounterRepo.findActiveEncounter(personId, activeSessionId)
        if (active) {
          return encounterRepo.endEncounter(active.id)
        }
        return null
      } catch {
        return null
      }
    },
  )

  ipcMain.handle(
    'encounter:mark-important',
    (_event, encounterId: string, important: boolean) => {
      try {
        return encounterRepo.markImportant(encounterId, important)
      } catch {
        return null
      }
    },
  )

  ipcMain.handle(
    'encounter:get-by-person',
    (_event, personId: string, limit?: number) => {
      try {
        return encounterRepo.getEncountersByPerson(personId, limit)
      } catch {
        return []
      }
    },
  )

  ipcMain.handle(
    'encounter:get-recent',
    (_event, limit?: number) => {
      try {
        return encounterRepo.getRecentEncounters(limit)
      } catch {
        return []
      }
    },
  )

  ipcMain.handle(
    'encounter:count-by-person',
    (_event, personId: string, sinceDays?: number) => {
      try {
        return encounterRepo.getEncounterCountByPerson(personId, sinceDays)
      } catch {
        return 0
      }
    },
  )
}

export function getActiveSessionId(): string | null {
  return activeSessionId
}
