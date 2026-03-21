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

// Match teammate's remote ingest port (18763) by default
const PORT = parseInt(process.env.PORT || '18763', 10)
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
    if (req.url?.split('?')[0] === '/health') {
      // Match teammate's remote-ingest health format + add bridge extras
      const body = JSON.stringify({
        ok: true,
        service: 'emory-ingest',
        protoVersion: 1,
        instanceId: 'bridge-server',
        friendlyName: 'Emory Bridge Server',
        signalingPort: PORT,
        // Bridge-specific extras
        faceReady,
        peopleCount: peopleRepo.getAll().length,
        wsReady: true,
      })
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      res.end(body)
      return
    }

    if (req.url?.split('?')[0] === '/') {
      // Simple frame viewer — open in browser to see incoming frames
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!DOCTYPE html>
<html><head><title>Emory Bridge</title>
<style>
  body { background: #111; color: #eee; font-family: system-ui; margin: 0; padding: 20px; }
  h1 { color: #4A90D9; font-size: 24px; }
  #status { color: #7BAE7F; margin: 10px 0; }
  #frame { max-width: 100%; border-radius: 12px; background: #222; }
  #info { font-family: monospace; font-size: 13px; color: #999; margin: 8px 0; }
  #matches { color: #7BAE7F; font-size: 18px; font-weight: bold; margin: 8px 0; }
</style>
</head><body>
<h1>Emory Bridge Server</h1>
<div id="status">Waiting for iOS connection...</div>
<div id="matches"></div>
<canvas id="frame" width="720" height="1280"></canvas>
<div id="info"></div>
<script>
const ws = new WebSocket('ws://' + location.host);
const canvas = document.getElementById('frame');
const ctx = canvas.getContext('2d');
let frameCount = 0;

ws.onopen = () => { document.getElementById('status').textContent = 'Connected — waiting for frames...'; };
ws.onclose = () => { document.getElementById('status').textContent = 'Disconnected'; };

ws.onmessage = (e) => {
  if (typeof e.data === 'string') {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'face_result' && msg.matches?.length > 0) {
        document.getElementById('matches').textContent =
          msg.matches.map(m => m.name + ' (' + Math.round(m.similarity * 100) + '%)').join(', ');
      }
      if (msg.type === 'viewer_frame') {
        const img = new Image();
        img.onload = () => {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);
          frameCount++;
          document.getElementById('info').textContent = 'Frame #' + frameCount + ' — ' + img.width + 'x' + img.height;
          document.getElementById('status').textContent = 'Receiving frames';
        };
        img.src = 'data:image/jpeg;base64,' + msg.jpeg;
      }
    } catch {}
  }
};
</script>
</body></html>`)
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('Not found\n')
  })

  // Create WebSocket server
  const wss = new WebSocketServer({ server })

  // Track browser viewer clients
  const viewerClients = new Set<import('ws').WebSocket>()

  wss.on('connection', (ws, req) => {
    // Browser clients connect with no binary messages — treat as viewers
    const isViewer = req.headers['sec-websocket-protocol'] === undefined

    // Track all connections; we'll figure out iOS vs viewer by message type
    let identifiedAsIOS = false

    // Create processors for this connection
    const frameProcessor = new FrameProcessor(peopleRepo, (result) => {
      const msg = {
        type: 'face_result',
        ts: result.timestamp,
        matches: result.matches,
        unknowns: result.unknowns,
        ms: Math.round(result.processingMs),
      }
      handler.send(msg)

      // Broadcast face results to browser viewers too
      const msgStr = JSON.stringify(msg)
      for (const viewer of viewerClients) {
        if (viewer.readyState === viewer.OPEN) {
          viewer.send(msgStr)
        }
      }

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

    // Forward frames to browser viewers (throttled to ~2fps to save bandwidth)
    let lastViewerFrameTime = 0
    handler.onFrame = (jpeg) => {
      identifiedAsIOS = true
      const now = Date.now()
      if (now - lastViewerFrameTime < 500) return // Max 2fps to viewers
      lastViewerFrameTime = now

      const viewerMsg = JSON.stringify({
        type: 'viewer_frame',
        jpeg: jpeg.toString('base64'),
      })
      for (const viewer of viewerClients) {
        if (viewer.readyState === viewer.OPEN) {
          viewer.send(viewerMsg)
        }
      }
    }

    ws.on('close', () => {
      viewerClients.delete(ws)
    })

    // If no binary messages received within 2 seconds, treat as viewer
    setTimeout(() => {
      if (!identifiedAsIOS) {
        viewerClients.add(ws)
        console.log(`[Bridge] Browser viewer connected (${viewerClients.size} viewers)`)
      }
    }, 2000)

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
