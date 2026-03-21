import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import { FaceService, ensureModels } from '@emory/core'
import { SqliteAdapter } from '@emory/db'
import { FrameProcessor } from './frame-processor.js'
import { AudioProcessor } from './audio-processor.js'
import { WsHandler } from './ws-handler.js'
import type { StatusMessage } from './protocol.js'

// MARK: - Bridge Server
// Lightweight WebSocket server that receives video frames + audio from the iOS app,
// runs face recognition and conversation processing, and sends results back.

const PORT = parseInt(process.env.PORT || '8385', 10)
const MODELS_DIR = process.env.MODELS_DIR || path.join(process.cwd(), 'models')

async function main(): Promise<void> {
  console.log('[Bridge] Starting Emory Bridge Server...')

  // Initialize database (same as desktop app)
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'emory.db')
  console.log(`[Bridge] Database: ${dbPath}`)
  const db = new SqliteAdapter(dbPath)
  const peopleRepo = db.people
  const peopleCount = peopleRepo.getAll().length
  console.log(`[Bridge] ${peopleCount} people in database`)

  // Initialize face service
  let faceService: FaceService | null = null
  let faceReady = false

  try {
    console.log('[Bridge] Downloading/checking face models...')
    await ensureModels(MODELS_DIR, (modelName, percent) => {
      if (percent % 25 === 0) console.log(`[Bridge] Downloading ${modelName}: ${percent}%`)
    })

    faceService = new FaceService(MODELS_DIR)
    await faceService.initialize()
    faceReady = true
    console.log('[Bridge] Face service ready!')
  } catch (err) {
    console.error('[Bridge] Face service failed to initialize:', err instanceof Error ? err.message : err)
    console.log('[Bridge] Server will run without face recognition')
  }

  // Create HTTP server
  const server = createServer((req, res) => {
    // Health check endpoint
    if (req.url === '/health') {
      const status: StatusMessage = {
        type: 'status',
        ready: true,
        faceReady,
        peopleCount: peopleRepo.getAll().length,
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(status))
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })

  // Create WebSocket server
  const wss = new WebSocketServer({ server })

  wss.on('connection', (ws) => {
    console.log('[Bridge] iOS client connected!')

    // Create processors for this connection
    const frameProcessor = new FrameProcessor(peopleRepo, (result) => {
      handler.send({
        type: 'face_result',
        ts: result.timestamp,
        matches: result.matches,
        unknowns: result.unknowns,
        ms: Math.round(result.processingMs),
      })

      if (result.matches.length > 0) {
        const names = result.matches.map((m) => m.name).join(', ')
        console.log(`[Bridge] Recognized: ${names} (${Math.round(result.processingMs)}ms)`)
      }
    })

    if (faceService) {
      frameProcessor.setFaceService(faceService)
    }

    const audioProcessor = new AudioProcessor((personId, text, memories) => {
      handler.send({
        type: 'transcript',
        personId,
        text,
        memories,
      })
      console.log(`[Bridge] Transcript for ${personId}: "${text.substring(0, 80)}..."`)
    })

    // TODO: Wire up Deepgram + memory extraction when teammate merges those services
    // audioProcessor.setTranscriber(...)
    // audioProcessor.setMemoryExtractor(...)

    const handler = new WsHandler(ws, frameProcessor, audioProcessor)

    // Send initial status
    handler.send({
      type: 'status',
      ready: true,
      faceReady,
      peopleCount: peopleRepo.getAll().length,
    })
  })

  // Start server
  server.listen(PORT, '0.0.0.0', () => {
    const localIP = getLocalIP()
    console.log('')
    console.log('='.repeat(50))
    console.log('  Emory Bridge Server Running!')
    console.log('')
    console.log(`  WebSocket: ws://${localIP}:${PORT}`)
    console.log(`  Health:    http://${localIP}:${PORT}/health`)
    console.log('')
    console.log('  Enter the WebSocket URL in the Emory iOS app')
    console.log('  Settings → Backend URL')
    console.log('='.repeat(50))
    console.log('')
  })
}

function getLocalIP(): string {
  const interfaces = networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address
      }
    }
  }
  return 'localhost'
}

main().catch((err) => {
  console.error('[Bridge] Fatal error:', err)
  process.exit(1)
})
