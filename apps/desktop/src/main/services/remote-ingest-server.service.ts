import http from 'node:http'
import type { Socket } from 'node:net'
import dgram from 'node:dgram'
import { WebSocketServer, WebSocket, type RawData } from 'ws'
import type { FaceService } from '@emory/core'
import type { PeopleRepository } from '@emory/db'
import { FrameProcessor } from '@emory/bridge-live'
import { MSG_VIDEO_FRAME, parseBinaryMessage } from '@emory/ingest-protocol'
import type { RemoteIngestPersisted } from './remote-ingest-settings.service.js'
import {
  REMOTE_INGEST_MULTICAST_ADDRESS,
  REMOTE_INGEST_MULTICAST_PORT,
  REMOTE_INGEST_PROTO_VERSION,
  REMOTE_INGEST_SIGNALING_PATH,
  REMOTE_INGEST_WS_PATH,
  type RemoteIngestStatus,
} from './remote-ingest.types.js'
import {
  buildEffectiveAddresses,
  buildTailscaleMagicDnsHint,
  listTailscaleIpv4,
  resolveListenHost,
} from './remote-ingest-network.js'
import { MobileApiService } from './mobile-api.service.js'
import { PersonFocusService, type PersonFocusMessage } from './person-focus.service.js'
import type { ConversationIngestService } from './conversation-ingest.service.js'

const MAX_SIGNALING_MESSAGE_BYTES = 512_000
const MAX_CONVERSATION_UPLOAD_BYTES = 25 * 1024 * 1024
const DEFAULT_CONVERSATION_UPLOAD_PATH = '/api/v1/conversations/upload'

function rawDataToUtf8(data: RawData): string {
  if (Buffer.isBuffer(data)) return data.toString('utf8')
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8')
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
  return String(data)
}

function remoteIngestClientIp(req: http.IncomingMessage): string {
  const xff = req.headers['x-forwarded-for']
  if (typeof xff === 'string' && xff.trim().length > 0) {
    return xff.split(',')[0]!.trim()
  }
  const a = req.socket.remoteAddress
  return a ?? 'unknown'
}

function isLoopbackClient(req: http.IncomingMessage): boolean {
  const address = req.socket.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

/** Standalone HTML page served at GET /viewer for browser-based debug of the raw video feed. */
function VIEWER_HTML(hostPort: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Emory — live viewer</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#111;color:#eee;font-family:system-ui,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh}
canvas{max-width:100vw;max-height:90vh;border:1px solid #333;background:#000}
#status{padding:8px 16px;font-size:14px;color:#888}
#stats{padding:4px 16px;font-size:12px;color:#555}
</style></head><body>
<canvas id="feed" width="640" height="480"></canvas>
<div id="status">Connecting…</div>
<div id="stats"></div>
<script>
const canvas=document.getElementById('feed'),ctx=canvas.getContext('2d');
const status=document.getElementById('status'),stats=document.getElementById('stats');
let frames=0,dropped=0,bytes=0,startTime=Date.now(),ws;
let decoding=false,pending=null,cw=0,ch=0;

function decodeAndDraw(payload){
  decoding=true;
  const blob=new Blob([payload],{type:'image/jpeg'});
  createImageBitmap(blob).then(bmp=>{
    if(cw!==bmp.width||ch!==bmp.height){cw=bmp.width;ch=bmp.height;canvas.width=cw;canvas.height=ch;}
    ctx.drawImage(bmp,0,0);bmp.close();
    frames++;bytes+=payload.byteLength;
    const elapsed=(Date.now()-startTime)/1000;
    const fps=Math.round(frames/elapsed);
    status.textContent='Streaming ('+cw+'\\u00d7'+ch+') '+fps+' fps';
    stats.textContent=frames+' drawn | '+dropped+' dropped | '+(bytes/1024/1024).toFixed(1)+' MB';
    decoding=false;
    if(pending){const p=pending;pending=null;decodeAndDraw(p);}
  }).catch(()=>{decoding=false;if(pending){const p=pending;pending=null;decodeAndDraw(p);}});
}

function connect(){
  status.textContent='Connecting\\u2026';
  ws=new WebSocket('ws://'+location.host+'/ingest?role=viewer');
  ws.binaryType='arraybuffer';

  ws.onopen=()=>{status.textContent='Connected \\u2014 waiting for publisher\\u2026';};
  ws.onclose=()=>{status.textContent='Disconnected \\u2014 reconnecting in 2s\\u2026';setTimeout(connect,2000);};
  ws.onerror=()=>{};

  ws.onmessage=(ev)=>{
    if(typeof ev.data==='string'){
      try{const j=JSON.parse(ev.data);
        if(j.type==='ingest_pong'){
          status.textContent=j.publisherPresent?'Publisher connected \\u2014 waiting for frames\\u2026':'Connected \\u2014 no publisher';
        }
      }catch{}
      return;
    }
    const u8=new Uint8Array(ev.data);
    if(u8.length<8)return;
    const dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength);
    if(dv.getUint32(0,true)!==1)return;
    const metaLen=dv.getUint32(4,true);
    const payload=u8.subarray(8+metaLen);
    if(decoding){pending=payload;dropped++;return;}
    decodeAndDraw(payload);
  };
}
connect();
setInterval(()=>{if(ws&&ws.readyState===1)ws.send(JSON.stringify({type:'ingest_ping',seq:Date.now()}));},3000);
</script></body></html>`
}

/** Same face pipeline as `apps/bridge-server` (Meta Ray-Bans live); runs on `/ingest` publisher in Electron. */
export type RemoteIngestBridgeLiveDeps = {
  peopleRepo: PeopleRepository
  getFaceService: () => FaceService | null
}

export class RemoteIngestServerService {
  private httpServer: http.Server | null = null
  private ingestWss: WebSocketServer | null = null
  private signalingWss: WebSocketServer | null = null
  private publisher: WebSocket | null = null
  private readonly viewers = new Set<WebSocket>()
  private desktopSig: WebSocket | null = null
  private mobileSig: WebSocket | null = null
  private beaconSocket: dgram.Socket | null = null
  private beaconTimer: ReturnType<typeof setInterval> | null = null
  private lastError: string | null = null
  private bridgeProcessor: FrameProcessor | null = null
  private readonly personFocusService: PersonFocusService | null

  constructor(
    private readonly mobileApiService?: MobileApiService,
    private readonly bridgeLive?: RemoteIngestBridgeLiveDeps,
    private readonly conversationIngestService?: ConversationIngestService,
  ) {
    this.personFocusService = bridgeLive
      ? new PersonFocusService(bridgeLive.peopleRepo, (message) => this.broadcastPersonFocus(message))
      : null
  }

  private broadcastPersonFocus(message: PersonFocusMessage): void {
    const mobile = this.mobileSig
    if (!mobile || mobile.readyState !== WebSocket.OPEN) return
    try {
      mobile.send(JSON.stringify(message))
    } catch {
      // ignore send errors while sockets are closing
    }
  }

  private disposeBridgeProcessor(): void {
    if (this.bridgeProcessor) {
      this.bridgeProcessor.dispose()
      this.bridgeProcessor = null
    }
  }

  private initBridgeProcessorForPublisher(): void {
    this.disposeBridgeProcessor()
    if (!this.bridgeLive) return

    const proc = new FrameProcessor(this.bridgeLive.peopleRepo, (result) => {
      const payload = {
        type: 'face_result' as const,
        ts: result.timestamp,
        matches: result.matches,
        unknowns: result.unknowns,
        ms: Math.round(result.processingMs),
      }
      const pub = this.publisher
      if (pub && pub.readyState === WebSocket.OPEN) {
        try {
          pub.send(JSON.stringify(payload))
        } catch {
          // ignore send errors (socket closing)
        }
      }
      this.personFocusService?.observe({
        timestamp: result.timestamp,
        matches: result.matches,
      })
    })
    proc.setFaceService(this.bridgeLive.getFaceService())
    this.bridgeProcessor = proc
  }

  private handleIngestControlText(ws: WebSocket, req: http.IncomingMessage, fromViewer: boolean, text: string): void {
    let msg: { type?: string; seq?: number }
    try {
      msg = JSON.parse(text) as { type?: string; seq?: number }
    } catch {
      return
    }
    const seq = typeof msg.seq === 'number' ? msg.seq : 0

    if (msg.type === 'ingest_ping') {
      const publisherPresent = this.publisher !== null && this.publisher.readyState === WebSocket.OPEN
      const viewerCount = this.viewers.size
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'ingest_pong',
            seq,
            publisherPresent,
            viewerCount,
          }),
        )
      }
      if (fromViewer && publisherPresent && this.publisher && this.publisher.readyState === WebSocket.OPEN) {
        this.publisher.send(JSON.stringify({ type: 'ingest_ping_relay', seq }))
      }
      return
    }

    if (msg.type === 'ingest_pong_relay') {
      const body = JSON.stringify({ type: 'ingest_pong_relay', seq })
      for (const v of this.viewers) {
        if (v.readyState === WebSocket.OPEN) {
          v.send(body)
        }
      }
      return
    }
  }

  private readonly handleHttpUpgrade = (req: http.IncomingMessage, socket: Socket, head: Buffer): void => {
    const path = req.url?.split('?')[0]
    if (path === REMOTE_INGEST_WS_PATH && this.ingestWss) {
      this.ingestWss.handleUpgrade(req, socket, head, (ws) => {
        this.attachIngestSocket(ws, req)
      })
      return
    }
    if (path === REMOTE_INGEST_SIGNALING_PATH && this.signalingWss) {
      this.signalingWss.handleUpgrade(req, socket, head, (ws) => {
        this.attachSignalingSocket(ws, req)
      })
      return
    }
    // Bare-path fallback: bridge-server accepted ws://host:port with no path.
    // Treat as publisher so old iOS clients (or ws:// URLs without /ingest) still work.
    if ((path === '/' || path === '') && this.ingestWss) {
      console.log(
        JSON.stringify({
          service: 'remote-ingest',
          action: 'upgrade_bare_path_fallback',
          remoteAddress: remoteIngestClientIp(req),
          originalUrl: req.url ?? '',
        }),
      )
      this.ingestWss.handleUpgrade(req, socket, head, (ws) => {
        this.attachIngestSocket(ws, req)
      })
      return
    }
    socket.destroy()
  }

  private attachIngestSocket(ws: WebSocket, req: http.IncomingMessage): void {
    const url = new URL(req.url ?? REMOTE_INGEST_WS_PATH, 'http://127.0.0.1')
    const isViewer = url.searchParams.get('role') === 'viewer'

    if (isViewer) {
      this.viewers.add(ws)
      console.log(
        JSON.stringify({
          service: 'remote-ingest',
          action: 'ingest_viewer_open',
          remoteAddress: remoteIngestClientIp(req),
          viewerCount: this.viewers.size,
        }),
      )
      ws.on('message', (data, isBinary) => {
        if (isBinary) return
        this.handleIngestControlText(ws, req, true, rawDataToUtf8(data))
      })
      ws.on('close', () => {
        this.viewers.delete(ws)
        console.log(
          JSON.stringify({
            service: 'remote-ingest',
            action: 'ingest_viewer_close',
            remoteAddress: remoteIngestClientIp(req),
            viewerCount: this.viewers.size,
          }),
        )
      })
      ws.on('error', () => {
        this.viewers.delete(ws)
      })
      return
    }

    if (this.publisher && this.publisher.readyState === WebSocket.OPEN) {
      this.disposeBridgeProcessor()
      try {
        this.publisher.close(1000, 'replaced')
      } catch {
        // ignore
      }
    }
    this.publisher = ws
    this.initBridgeProcessorForPublisher()
    console.log(
      JSON.stringify({
        service: 'remote-ingest',
        action: 'ingest_publisher_open',
        remoteAddress: remoteIngestClientIp(req),
        bridgeLive: Boolean(this.bridgeLive),
      }),
    )

    let publisherMessageCount = 0
    let publisherBinaryCount = 0
    let publisherTextCount = 0

    ws.on('message', (data, isBinary) => {
      publisherMessageCount++
      if (!isBinary) {
        publisherTextCount++
        this.handleIngestControlText(ws, req, false, rawDataToUtf8(data))
        return
      }
      publisherBinaryCount++
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
      for (const v of this.viewers) {
        if (v.readyState === WebSocket.OPEN) {
          v.send(buf, { binary: true })
        }
      }

      if (!this.bridgeProcessor || !this.bridgeLive) return

      const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
      const parsed = parseBinaryMessage(u8)
      if (!parsed || parsed.messageType !== MSG_VIDEO_FRAME) return

      this.bridgeProcessor.setFaceService(this.bridgeLive.getFaceService())
      const meta = parsed.metadata as { w?: number; h?: number; ts?: number }
      void this.bridgeProcessor.enqueue(
        Buffer.from(parsed.payload),
        meta.w ?? 720,
        meta.h ?? 1280,
        typeof meta.ts === 'number' ? meta.ts : Date.now() / 1000,
      )
    })

    const clearPublisher = (reason: string): void => {
      console.log(
        JSON.stringify({
          service: 'remote-ingest',
          action: 'ingest_publisher_close',
          reason,
          remoteAddress: remoteIngestClientIp(req),
          binaryFramesReceived: publisherBinaryCount,
          textMessagesReceived: publisherTextCount,
          isCurrent: this.publisher === ws,
        }),
      )
      if (this.publisher === ws) {
        this.disposeBridgeProcessor()
        this.personFocusService?.clear('publisher_closed')
        this.publisher = null
      }
    }
    ws.on('close', () => clearPublisher('ws_close'))
    ws.on('error', () => clearPublisher('ws_error'))
  }

  private attachSignalingSocket(ws: WebSocket, req: http.IncomingMessage): void {
    const url = new URL(req.url ?? REMOTE_INGEST_SIGNALING_PATH, 'http://127.0.0.1')
    const isDesktop = url.searchParams.get('role') === 'desktop'

    if (isDesktop) {
      if (this.desktopSig && this.desktopSig.readyState === WebSocket.OPEN) {
        try {
          this.desktopSig.close(1000, 'replaced')
        } catch {
          // ignore
        }
      }
      this.desktopSig = ws
      console.log(
        JSON.stringify({
          service: 'remote-ingest',
          action: 'sig_desktop_open',
          remoteAddress: remoteIngestClientIp(req),
          mobileConnected: !!(this.mobileSig && this.mobileSig.readyState === WebSocket.OPEN),
        }),
      )
      ws.on('message', (data, isBinary) => {
        if (isBinary) return
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
        if (buf.length > MAX_SIGNALING_MESSAGE_BYTES) return
        const text = buf.toString('utf8')
        let control: { type?: string; seq?: number; mobileConnected?: boolean }
        try {
          control = JSON.parse(text) as { type?: string; seq?: number; mobileConnected?: boolean }
        } catch {
          if (this.mobileSig && this.mobileSig.readyState === WebSocket.OPEN) {
            this.mobileSig.send(text)
          }
          return
        }
        if (control.type === 'emory_sig_ping') {
          const seq = typeof control.seq === 'number' ? control.seq : 0
          const mobileConnected = !!(this.mobileSig && this.mobileSig.readyState === WebSocket.OPEN)
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'emory_sig_pong', seq, mobileConnected }))
          }
          if (mobileConnected && this.mobileSig && this.mobileSig.readyState === WebSocket.OPEN) {
            this.mobileSig.send(JSON.stringify({ type: 'emory_sig_ping_relay', seq }))
          }
          return
        }
        if (this.mobileSig && this.mobileSig.readyState === WebSocket.OPEN) {
          this.mobileSig.send(text)
        }
      })
      const clear = (): void => {
        if (this.desktopSig === ws) {
          this.desktopSig = null
          console.log(
            JSON.stringify({
              service: 'remote-ingest',
              action: 'sig_desktop_close',
              remoteAddress: remoteIngestClientIp(req),
            }),
          )
        }
      }
      ws.on('close', clear)
      ws.on('error', clear)
      return
    }

    if (this.mobileSig && this.mobileSig.readyState === WebSocket.OPEN) {
      try {
        this.mobileSig.close(1000, 'replaced')
      } catch {
        // ignore
      }
    }
    this.mobileSig = ws
    console.log(
      JSON.stringify({
        service: 'remote-ingest',
        action: 'sig_mobile_open',
        remoteAddress: remoteIngestClientIp(req),
        desktopConnected: !!(this.desktopSig && this.desktopSig.readyState === WebSocket.OPEN),
      }),
    )
    const currentFocus = this.personFocusService?.getCurrentFocus()
    if (currentFocus && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(currentFocus))
      } catch {
        // ignore send errors while sockets are closing
      }
    }
    ws.on('message', (data, isBinary) => {
      if (isBinary) return
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer)
      if (buf.length > MAX_SIGNALING_MESSAGE_BYTES) return
      const text = buf.toString('utf8')
      let control: { type?: string; seq?: number }
      try {
        control = JSON.parse(text) as { type?: string; seq?: number }
      } catch {
        if (this.desktopSig && this.desktopSig.readyState === WebSocket.OPEN) {
          this.desktopSig.send(text)
        }
        return
      }
      if (control.type === 'emory_sig_pong_relay') {
        if (this.desktopSig && this.desktopSig.readyState === WebSocket.OPEN) {
          this.desktopSig.send(text)
        }
        return
      }
      if (this.desktopSig && this.desktopSig.readyState === WebSocket.OPEN) {
        this.desktopSig.send(text)
      }
    })
    const clear = (): void => {
      if (this.mobileSig === ws) {
        this.mobileSig = null
        console.log(
          JSON.stringify({
            service: 'remote-ingest',
            action: 'sig_mobile_close',
            remoteAddress: remoteIngestClientIp(req),
          }),
        )
      }
    }
    ws.on('close', clear)
    ws.on('error', clear)
  }

  getStatus(persisted: RemoteIngestPersisted): RemoteIngestStatus {
    const listening = this.httpServer !== null && this.httpServer.listening
    const tailscale = listTailscaleIpv4()
    const { error: bindError } = resolveListenHost(persisted.bindMode)

    const effectiveAddresses = buildEffectiveAddresses(persisted.bindMode)

    const effectiveHost = effectiveAddresses[0] ?? null

    const configError =
      persisted.enabled && persisted.bindMode === 'tailscale' && tailscale.length === 0 ? bindError : null

    return {
      listening,
      effectiveHost,
      effectiveAddresses,
      signalingPort: persisted.signalingPort,
      beaconActive: this.beaconTimer !== null,
      lastError: this.lastError ?? configError,
      instanceId: persisted.instanceId,
      tailscaleHint: buildTailscaleMagicDnsHint(),
    }
  }

  private closeWebSockets(): void {
    if (this.publisher) {
      this.disposeBridgeProcessor()
      try {
        this.publisher.close()
      } catch {
        // ignore
      }
      this.publisher = null
    }
    for (const v of [...this.viewers]) {
      try {
        v.close()
      } catch {
        // ignore
      }
    }
    this.viewers.clear()
    if (this.desktopSig) {
      try {
        this.desktopSig.close()
      } catch {
        // ignore
      }
      this.desktopSig = null
    }
    if (this.mobileSig) {
      try {
        this.mobileSig.close()
      } catch {
        // ignore
      }
      this.mobileSig = null
    }
    if (this.ingestWss) {
      try {
        this.ingestWss.close()
      } catch {
        // ignore
      }
      this.ingestWss = null
    }
    if (this.signalingWss) {
      try {
        this.signalingWss.close()
      } catch {
        // ignore
      }
      this.signalingWss = null
    }
  }

  async stop(): Promise<void> {
    this.stopBeacon()
    this.closeWebSockets()
    if (this.httpServer) {
      this.httpServer.removeListener('upgrade', this.handleHttpUpgrade)
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      }).catch(() => {})
      this.httpServer = null
    }
  }

  private stopBeacon(): void {
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer)
      this.beaconTimer = null
    }
    if (this.beaconSocket) {
      try {
        this.beaconSocket.close()
      } catch {
        // ignore
      }
      this.beaconSocket = null
    }
  }

  /**
   * (Re)start HTTP listener and optional beacon from persisted config.
   */
  async apply(persisted: RemoteIngestPersisted): Promise<RemoteIngestStatus> {
    this.lastError = null
    await this.stop()

    if (!persisted.enabled) {
      return this.getStatus(persisted)
    }

    const { host, error } = resolveListenHost(persisted.bindMode)
    if (host === null) {
      this.lastError = error ?? 'Cannot resolve bind address'
      return this.getStatus(persisted)
    }

    const server = http.createServer((req, res) => {
      const baseUrl = `http://${req.headers.host ?? '127.0.0.1'}`
      const url = new URL(req.url ?? '/', baseUrl)
      const pathname = url.pathname

      if (req.method === 'GET' && pathname === '/health') {
        const body = JSON.stringify({
          ok: true,
          service: 'emory-ingest',
          protoVersion: REMOTE_INGEST_PROTO_VERSION,
          instanceId: persisted.instanceId,
          friendlyName: persisted.friendlyName,
          signalingPort: persisted.signalingPort,
          wsIngestPath: REMOTE_INGEST_WS_PATH,
          wsSignalingPath: REMOTE_INGEST_SIGNALING_PATH,
          conversationUploadPath: DEFAULT_CONVERSATION_UPLOAD_PATH,
          advertisedAddresses: buildEffectiveAddresses(persisted.bindMode),
        })
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(body)
        return
      }

      if (req.method === 'POST' && pathname === DEFAULT_CONVERSATION_UPLOAD_PATH) {
        void this.handleConversationUpload(req, res, url)
        return
      }

      const debugFocusMatch = pathname.match(/^\/api\/v1\/debug\/person-focus\/([^/]+)$/)
      if (isLoopbackClient(req) && req.method === 'POST' && debugFocusMatch) {
        const personId = decodeURIComponent(debugFocusMatch[1] ?? '')
        const message = this.personFocusService?.forceFocusPerson(personId)
        if (!message) {
          this.sendJson(res, 404, { error: 'Person not found or focus service unavailable' })
          return
        }
        this.sendJson(res, 200, { ok: true, event: message })
        return
      }

      if (isLoopbackClient(req) && req.method === 'DELETE' && pathname === '/api/v1/debug/person-focus') {
        const message = this.personFocusService?.clear('manual_clear')
        this.sendJson(res, 200, { ok: true, event: message })
        return
      }

      if (req.method === 'GET' && pathname === '/api/v1/people') {
        this.sendJson(res, 200, this.mobileApiService?.getPeople() ?? { people: [] })
        return
      }

      if (req.method === 'GET' && pathname === '/api/v1/memories') {
        this.sendJson(
          res,
          200,
          this.mobileApiService?.getMemoriesGroupedByPerson(this.parseLimit(url.searchParams.get('limitPerPerson'))) ?? {
            groups: [],
          },
        )
        return
      }

      if (req.method === 'GET' && pathname === '/api/v1/encounters/recent') {
        this.sendJson(res, 200, this.mobileApiService?.getRecentEncounters(this.parseLimit(url.searchParams.get('limit'))) ?? { encounters: [] })
        return
      }

      if (req.method === 'GET' && pathname === '/api/v1/home') {
        this.sendJson(
          res,
          200,
          this.mobileApiService?.getHome(this.parseLimit(url.searchParams.get('limit'))) ?? {
            self: null,
            people: [],
            recentEncounters: [],
          },
        )
        return
      }

      const personDetailMatch = pathname.match(/^\/api\/v1\/people\/([^/]+)$/)
      if (req.method === 'GET' && personDetailMatch) {
        const personId = decodeURIComponent(personDetailMatch[1] ?? '')
        const result = this.mobileApiService?.getPersonDetail(
          personId,
          this.parseLimit(url.searchParams.get('memoryLimit')),
          this.parseLimit(url.searchParams.get('encounterLimit')),
        )
        if (!result) {
          this.sendJson(res, 404, { error: 'Person not found' })
          return
        }
        this.sendJson(res, 200, result)
        return
      }

      const personMemoriesMatch = pathname.match(/^\/api\/v1\/people\/([^/]+)\/memories$/)
      if (req.method === 'GET' && personMemoriesMatch) {
        const personId = decodeURIComponent(personMemoriesMatch[1] ?? '')
        const result = this.mobileApiService?.getPersonMemories(personId, this.parseLimit(url.searchParams.get('limit')))
        if (!result) {
          this.sendJson(res, 404, { error: 'Person not found' })
          return
        }
        this.sendJson(res, 200, result)
        return
      }

      if (req.method === 'GET' && pathname === '/viewer') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
        res.end(VIEWER_HTML(req.headers.host ?? '127.0.0.1:' + String(persisted.signalingPort)))
        return
      }

      if (req.method === 'GET' && pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end(
          `Emory remote ingest — GET /health — GET /viewer (debug) — WS ${REMOTE_INGEST_WS_PATH}?role=viewer|publisher — WS ${REMOTE_INGEST_SIGNALING_PATH}?role=desktop|mobile\n`,
        )
        return
      }

      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found\n')
    })

    this.httpServer = server
    this.ingestWss = new WebSocketServer({ noServer: true })
    this.signalingWss = new WebSocketServer({ noServer: true })
    server.on('upgrade', this.handleHttpUpgrade)

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(persisted.signalingPort, host as string, () => {
        server.removeListener('error', reject)
        resolve()
      })
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      this.lastError = message
      if (this.httpServer) {
        this.httpServer.removeListener('upgrade', this.handleHttpUpgrade)
      }
      this.closeWebSockets()
      if (this.httpServer) {
        try {
          server.close()
        } catch {
          // ignore
        }
        this.httpServer = null
      }
    })

    if (persisted.beaconEnabled && this.httpServer?.listening) {
      this.startBeacon(persisted, host)
    }

    return this.getStatus(persisted)
  }

  private startBeacon(persisted: RemoteIngestPersisted, boundHost: string): void {
    this.stopBeacon()
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.beaconSocket = socket

    const payload = (): string => {
      const addrs = buildEffectiveAddresses(persisted.bindMode)
      const primary = boundHost === '0.0.0.0' ? (addrs[0] ?? '127.0.0.1') : boundHost
      return JSON.stringify({
        service: 'emory-ingest',
        protoVersion: REMOTE_INGEST_PROTO_VERSION,
        instanceId: persisted.instanceId,
        friendlyName: persisted.friendlyName,
        signalingPort: persisted.signalingPort,
        httpHealthPath: '/health',
        wsIngestPath: REMOTE_INGEST_WS_PATH,
        wsSignalingPath: REMOTE_INGEST_SIGNALING_PATH,
        bindHostAdvertised: primary,
        advertisedAddresses: addrs,
      })
    }

    socket.on('error', (err) => {
      console.warn('[RemoteIngest] Beacon socket error:', err.message)
    })

    try {
      socket.bind(0, () => {
        try {
          socket.setMulticastTTL(128)
        } catch {
          // ignore
        }
        const send = (): void => {
          const msg = Buffer.from(payload(), 'utf8')
          socket.send(
            msg,
            0,
            msg.length,
            REMOTE_INGEST_MULTICAST_PORT,
            REMOTE_INGEST_MULTICAST_ADDRESS,
            (err) => {
              if (err) {
                console.warn('[RemoteIngest] Beacon send failed:', err.message)
              }
            },
          )
        }
        send()
        this.beaconTimer = setInterval(send, persisted.beaconIntervalMs)
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.warn('[RemoteIngest] Beacon bind failed:', message)
      this.stopBeacon()
    }
  }

  private sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    })
    res.end(JSON.stringify(body))
  }

  private async handleConversationUpload(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    url: URL,
  ): Promise<void> {
    if (!this.conversationIngestService) {
      this.sendJson(res, 503, { success: false, error: 'Conversation ingest is unavailable' })
      return
    }

    const personId = url.searchParams.get('personId') ?? ''
    const recordedAt = url.searchParams.get('recordedAt') ?? ''
    const durationRaw = url.searchParams.get('durationMs')
    const durationMs = durationRaw == null ? null : Number(durationRaw)
    const mimeType = req.headers['content-type']?.split(';')[0]?.trim() ?? ''

    let bytes: Buffer
    try {
      bytes = await this.readRequestBody(req, MAX_CONVERSATION_UPLOAD_BYTES)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(
        JSON.stringify({
          service: 'remote-ingest',
          action: 'conversation_upload_rejected',
          remoteAddress: remoteIngestClientIp(req),
          personId,
          recordedAt,
          mimeType,
          durationMs: Number.isFinite(durationMs) ? durationMs : null,
          error: message,
        }),
      )
      this.sendJson(res, 413, { success: false, error: message })
      return
    }

    console.log(
      JSON.stringify({
        service: 'remote-ingest',
        action: 'conversation_upload_received',
        remoteAddress: remoteIngestClientIp(req),
        personId,
        recordedAt,
        mimeType,
        durationMs: Number.isFinite(durationMs) ? durationMs : null,
        byteLength: bytes.length,
      }),
    )

    const result = await this.conversationIngestService.saveAndProcessBytes({
      personId,
      recordedAt,
      mimeType,
      durationMs: Number.isFinite(durationMs) ? durationMs : null,
      audioBytes: new Uint8Array(bytes),
    })
    console.log(
      JSON.stringify({
        service: 'remote-ingest',
        action: result.success ? 'conversation_upload_processed' : 'conversation_upload_failed',
        remoteAddress: remoteIngestClientIp(req),
        personId,
        recordedAt,
        mimeType,
        durationMs: Number.isFinite(durationMs) ? durationMs : null,
        byteLength: bytes.length,
        success: result.success,
        recordingId: result.success ? result.recording.id : null,
        memoryCount: result.success ? result.memories.length : 0,
        transcriptStatus: result.success ? result.recording.transcriptStatus : null,
        extractionStatus: result.success ? result.recording.extractionStatus : null,
        error: result.success ? null : result.error,
      }),
    )
    this.sendJson(res, result.success ? 200 : 400, result)
  }

  private readRequestBody(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let total = 0

      req.on('data', (chunk: Buffer | string) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        total += buffer.length
        if (total > maxBytes) {
          reject(new Error(`Upload exceeds ${maxBytes} bytes`))
          req.destroy()
          return
        }
        chunks.push(buffer)
      })
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
      req.on('aborted', () => reject(new Error('Upload aborted')))
    })
  }

  private parseLimit(raw: string | null): number | undefined {
    if (!raw) return undefined
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) ? parsed : undefined
  }
}
