import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { registerFaceIpc, disposeFaceService } from './ipc/face.ipc.js'
import { registerDbIpc } from './ipc/db.ipc.js'
import { registerEncounterIpc } from './ipc/encounter.ipc.js'
import { registerUnknownIpc } from './ipc/unknown.ipc.js'
import { registerConversationIpc } from './ipc/conversation.ipc.js'
import { registerTtsIpc } from './ipc/tts.ipc.js'
import { CleanupService } from './services/cleanup.service.js'
import { CartesiaTtsService, getTtsRootDir } from './services/cartesia-tts.service.js'
import { getConversationsRootDir } from './services/conversation-storage.service.js'
import { DeepgramService } from './services/deepgram.service.js'
import { MemoryExtractionService } from './services/memory-extraction.service.js'
import { ConversationProcessingService } from './services/conversation-processing.service.js'
import { MemoryQueryUnderstandingService } from './services/memory-query-understanding.service.js'
import { MemoryAnswerService } from './services/memory-answer.service.js'
import { MemoryQueryService } from './services/memory-query.service.js'
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
  ipcMain.handle('app:get-conversations-dir', () => getConversationsRootDir())
  ipcMain.handle('app:get-tts-dir', () => getTtsRootDir())
  ipcMain.handle('app:open-conversations-folder', async () => {
    const dir = getConversationsRootDir()
    await mkdir(dir, { recursive: true })
    const err = await shell.openPath(dir)
    if (err === '') return { success: true as const }
    return { success: false as const, error: err }
  })
  ipcMain.handle('app:open-tts-folder', async () => {
    const dir = getTtsRootDir()
    await mkdir(dir, { recursive: true })
    const err = await shell.openPath(dir)
    if (err === '') return { success: true as const }
    return { success: false as const, error: err }
  })

  const { peopleRepo, encounterRepo, unknownRepo, retentionRepo, conversationRepo } = registerDbIpc()

  const cleanupService = new CleanupService(retentionRepo, encounterRepo, unknownRepo)
  cleanupService.start()
  const deepgramService = new DeepgramService()
  const cartesiaTtsService = new CartesiaTtsService()
  const memoryExtractionService = new MemoryExtractionService()
  const memoryQueryUnderstandingService = new MemoryQueryUnderstandingService()
  const memoryAnswerService = new MemoryAnswerService()
  const conversationProcessingService = new ConversationProcessingService(
    conversationRepo,
    peopleRepo,
    deepgramService,
    memoryExtractionService,
  )
  const memoryQueryService = new MemoryQueryService(
    conversationRepo,
    peopleRepo,
    deepgramService,
    memoryQueryUnderstandingService,
    memoryAnswerService,
  )

  const mainWindow = createWindow()
  registerFaceIpc(mainWindow, getModelsDir(), peopleRepo)
  registerEncounterIpc(mainWindow, encounterRepo)
  registerUnknownIpc(mainWindow, unknownRepo)
  registerTtsIpc(cartesiaTtsService)
  registerConversationIpc(
    mainWindow,
    conversationProcessingService,
    conversationRepo,
    encounterRepo,
    peopleRepo,
    memoryQueryService,
  )

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
