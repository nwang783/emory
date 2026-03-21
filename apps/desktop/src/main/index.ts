import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import path from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerFaceIpc, disposeFaceService } from './ipc/face.ipc.js'
import { registerDbIpc } from './ipc/db.ipc.js'
import { registerEncounterIpc } from './ipc/encounter.ipc.js'
import { registerUnknownIpc } from './ipc/unknown.ipc.js'
import { registerConversationIpc } from './ipc/conversation.ipc.js'
import { CleanupService } from './services/cleanup.service.js'
import { DeepgramService } from './services/deepgram.service.js'
import { MemoryExtractionService } from './services/memory-extraction.service.js'
import { ConversationProcessingService } from './services/conversation-processing.service.js'
import { loadEnvironment } from './services/env.service.js'

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
  loadEnvironment()
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

  const { peopleRepo, encounterRepo, unknownRepo, retentionRepo, conversationRepo } = registerDbIpc()

  const cleanupService = new CleanupService(retentionRepo, encounterRepo, unknownRepo)
  cleanupService.start()
  const deepgramService = new DeepgramService()
  const memoryExtractionService = new MemoryExtractionService()
  const conversationProcessingService = new ConversationProcessingService(
    conversationRepo,
    peopleRepo,
    deepgramService,
    memoryExtractionService,
  )

  const mainWindow = createWindow()
  registerFaceIpc(mainWindow, getModelsDir(), peopleRepo)
  registerEncounterIpc(mainWindow, encounterRepo)
  registerUnknownIpc(mainWindow, unknownRepo)
  registerConversationIpc(mainWindow, conversationProcessingService, conversationRepo)

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
