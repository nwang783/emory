import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerFaceIpc, disposeFaceService } from './ipc/face.ipc.js'
import { registerDbIpc } from './ipc/db.ipc.js'
import { registerEncounterIpc } from './ipc/encounter.ipc.js'
import { registerUnknownIpc } from './ipc/unknown.ipc.js'
import { registerConversationIpc } from './ipc/conversation.ipc.js'
import { CleanupService } from './services/cleanup.service.js'
import { getConversationsRootDir } from './services/conversation-storage.service.js'

function getModelsDir(): string {
  return path.join(app.getPath('userData'), 'models')
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#0a0a0a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.emory.desktop')

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture']
    callback(allowed.includes(permission))
  })

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = ['media', 'mediaKeySystem', 'display-capture']
    return allowed.includes(permission)
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.handle('app:get-models-dir', () => getModelsDir())
  ipcMain.handle('app:get-user-data-dir', () => app.getPath('userData'))
  ipcMain.handle('app:get-conversations-dir', () => getConversationsRootDir())
  ipcMain.handle('app:open-conversations-folder', async () => {
    const dir = getConversationsRootDir()
    await mkdir(dir, { recursive: true })
    const err = await shell.openPath(dir)
    if (err === '') return { success: true as const }
    return { success: false as const, error: err }
  })

  const { peopleRepo, encounterRepo, unknownRepo, retentionRepo, conversationRepo } = registerDbIpc()

  const cleanupService = new CleanupService(retentionRepo, encounterRepo, unknownRepo)
  cleanupService.start()

  const mainWindow = createWindow()
  registerFaceIpc(mainWindow, getModelsDir(), peopleRepo)
  registerEncounterIpc(mainWindow, encounterRepo)
  registerUnknownIpc(mainWindow, unknownRepo)
  registerConversationIpc(conversationRepo, encounterRepo)

  app.on('before-quit', () => {
    cleanupService.stop()
    disposeFaceService().catch(() => {})
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
