import { useCallback, useEffect, useRef, useState } from 'react'
import { MSG_VIDEO_FRAME, MSG_AUDIO_CHUNK, parseBinaryMessage } from '@emory/ingest-protocol'
import { logRemoteIngest, logRemoteIngestTerminal } from '@/modules/camera/lib/remote-ingest-debug'

export type RemoteIngestViewerPhase =
  | 'idle'
  | 'connecting'
  | 'waiting_publisher'
  | 'streaming'
  | 'error'

const REMOTE_CAMERA_LABEL = 'Phone / glasses (ingest WebSocket)'

/** Heartbeat, ping, and stuck-detection interval. */
const HEARTBEAT_MS = 5000
/** Re-open WS if OPEN but still no JPEG frames after this long (publisher may have missed attach). */
const BOUNCE_WAITING_PUBLISHER_MS = 5000
/** Re-open WS if stuck in browser CONNECTING state (rare tailnet / proxy stalls). */
const BOUNCE_STUCK_CONNECTING_MS = 10000
/** Expect `ingest_pong` from main-process server after `ingest_ping`. */
const PING_PONG_DEADLINE_MS = 4000

type UseRemoteIngestViewerArgs = {
  /** When false, WebSocket stays closed and start() is a no-op. */
  armed: boolean
  host: string | null
  port: number
}

export type UseRemoteIngestViewerResult = {
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>
  isActive: boolean
  phase: RemoteIngestViewerPhase
  error: string | null
  cameraLabel: string | null
  start: () => Promise<void>
  stop: () => void
  captureFrame: () => ArrayBuffer | null
  frameWidth: number
  frameHeight: number
  isMuted: boolean
  toggleMute: () => void
  /** MediaStream carrying decoded phone audio, suitable for MediaRecorder. Unaffected by mute. */
  remoteAudioStream: MediaStream | null
}

function readyStateLabel(readyState: number | undefined): string | null {
  if (readyState === undefined) return null
  if (readyState === WebSocket.CONNECTING) return 'CONNECTING'
  if (readyState === WebSocket.OPEN) return 'OPEN'
  if (readyState === WebSocket.CLOSING) return 'CLOSING'
  if (readyState === WebSocket.CLOSED) return 'CLOSED'
  return String(readyState)
}

export function useRemoteIngestViewer({
  armed,
  host,
  port,
}: UseRemoteIngestViewerArgs): UseRemoteIngestViewerResult {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const decodeTokenRef = useRef(0)

  const phaseRef = useRef<RemoteIngestViewerPhase>('idle')
  const connectStartedAtRef = useRef<number | null>(null)
  const wsOpenedAtRef = useRef<number | null>(null)
  const binaryMessagesRef = useRef(0)
  const nonVideoBinaryRef = useRef(0)
  const framesDecodedRef = useRef(0)
  const framesDroppedRef = useRef(0)
  const parseFailuresRef = useRef(0)
  const pingSeqRef = useRef(0)
  const outstandingPingSeqRef = useRef<number | null>(null)
  const outstandingPingDeadlineRef = useRef<number | null>(null)
  const awaitingRelaySeqRef = useRef<number | null>(null)
  const relayDeadlineRef = useRef<number | null>(null)
  const startRef = useRef<() => Promise<void>>(async () => {})

  // Newest-wins frame dropping: max one decode in flight at a time.
  const decodingRef = useRef(false)
  const pendingPayloadRef = useRef<Uint8Array | null>(null)
  const canvasWidthRef = useRef(0)
  const canvasHeightRef = useRef(0)

  // Audio playback via Web Audio API
  const audioCtxRef = useRef<AudioContext | null>(null)
  const nextPlayTimeRef = useRef(0)
  const mutedRef = useRef(false)
  const gainNodeRef = useRef<GainNode | null>(null)
  const streamDestRef = useRef<MediaStreamAudioDestinationNode | null>(null)

  const [phase, setPhase] = useState<RemoteIngestViewerPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [frameWidth, setFrameWidth] = useState(640)
  const [frameHeight, setFrameHeight] = useState(480)
  const [isMuted, setIsMuted] = useState(false)
  const [remoteAudioStream, setRemoteAudioStream] = useState<MediaStream | null>(null)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (phase === 'idle') return
    logRemoteIngest('jpeg_ws_phase', { phase, error: error ?? null })
  }, [phase, error])

  const closeSocket = useCallback((): void => {
    const ws = wsRef.current
    wsRef.current = null
    if (ws) {
      ws.onopen = null
      ws.onmessage = null
      ws.onerror = null
      ws.onclose = null
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
  }, [])

  const closeAudio = useCallback((): void => {
    if (audioCtxRef.current) {
      try {
        void audioCtxRef.current.close()
      } catch {
        // ignore
      }
      audioCtxRef.current = null
      gainNodeRef.current = null
      streamDestRef.current = null
    }
    nextPlayTimeRef.current = 0
    setRemoteAudioStream(null)
  }, [])

  const ensureAudioCtx = useCallback((): AudioContext => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      const ctx = new AudioContext()
      const gain = ctx.createGain()
      gain.gain.value = mutedRef.current ? 0 : 1
      gain.connect(ctx.destination)
      const streamDest = ctx.createMediaStreamDestination()
      audioCtxRef.current = ctx
      gainNodeRef.current = gain
      streamDestRef.current = streamDest
      setRemoteAudioStream(streamDest.stream)
      nextPlayTimeRef.current = 0
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }, [])

  const playAudioChunk = useCallback(
    (payload: Uint8Array, sampleRate: number, channels: number): void => {
      const ctx = ensureAudioCtx()
      const gain = gainNodeRef.current
      if (!gain) return

      const sampleCount = Math.floor(payload.byteLength / 2)
      const frameCount = channels > 0 ? Math.floor(sampleCount / channels) : sampleCount
      if (frameCount === 0) return

      const buffer = ctx.createBuffer(channels, frameCount, sampleRate)
      const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength)

      for (let ch = 0; ch < channels; ch++) {
        const channelData = buffer.getChannelData(ch)
        for (let i = 0; i < frameCount; i++) {
          const idx = (i * channels + ch) * 2
          if (idx + 1 < payload.byteLength) {
            channelData[i] = view.getInt16(idx, true) / 32768
          }
        }
      }

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(gain)
      if (streamDestRef.current) {
        source.connect(streamDestRef.current)
      }

      const now = ctx.currentTime
      if (nextPlayTimeRef.current < now) {
        nextPlayTimeRef.current = now + 0.01
      }
      source.start(nextPlayTimeRef.current)
      nextPlayTimeRef.current += buffer.duration
    },
    [ensureAudioCtx],
  )

  const toggleMute = useCallback((): void => {
    const next = !mutedRef.current
    mutedRef.current = next
    setIsMuted(next)
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = next ? 0 : 1
    }
  }, [])

  const stop = useCallback((): void => {
    decodeTokenRef.current += 1
    connectStartedAtRef.current = null
    wsOpenedAtRef.current = null
    closeSocket()
    closeAudio()
    setPhase('idle')
    setError(null)
    const c = previewCanvasRef.current
    if (c) {
      const ctx = c.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, c.width, c.height)
      }
    }
    outstandingPingSeqRef.current = null
    outstandingPingDeadlineRef.current = null
    awaitingRelaySeqRef.current = null
    relayDeadlineRef.current = null
    decodingRef.current = false
    pendingPayloadRef.current = null
    logRemoteIngest('jpeg_ws_stop', {})
  }, [closeSocket, closeAudio])

  useEffect(() => {
    if (!armed) {
      stop()
    }
  }, [armed, stop])

  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  const start = useCallback(async (): Promise<void> => {
    if (!armed || !host) {
      logRemoteIngest('jpeg_ws_start_skipped', { armed, hasHost: Boolean(host) })
      return
    }
    stop()
    binaryMessagesRef.current = 0
    nonVideoBinaryRef.current = 0
    framesDecodedRef.current = 0
    framesDroppedRef.current = 0
    parseFailuresRef.current = 0
    decodingRef.current = false
    pendingPayloadRef.current = null
    setError(null)
    setPhase('connecting')

    const url = `ws://${host}:${port}/ingest?role=viewer`
    logRemoteIngest('jpeg_ws_start', { url, host, port })
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws
    const token = decodeTokenRef.current
    connectStartedAtRef.current = Date.now()
    wsOpenedAtRef.current = null

    ws.onopen = (): void => {
      if (decodeTokenRef.current !== token) return
      wsOpenedAtRef.current = Date.now()
      logRemoteIngest('jpeg_ws_open', { url })
      setPhase('waiting_publisher')
    }

    ws.onerror = (): void => {
      if (decodeTokenRef.current !== token) return
      logRemoteIngest('jpeg_ws_socket_error', { url })
      setError('WebSocket error — check remote ingest is listening and the host is reachable')
      setPhase('error')
    }

    ws.onclose = (ev: CloseEvent): void => {
      if (decodeTokenRef.current !== token) return
      logRemoteIngest('jpeg_ws_close', {
        code: ev.code,
        reason: ev.reason || null,
        wasClean: ev.wasClean,
      })
      if (wsRef.current === ws) {
        wsRef.current = null
      }
      setPhase((p) => (p === 'idle' ? 'idle' : 'error'))
      setError((prev) => prev ?? 'Remote ingest connection closed')
    }

    ws.onmessage = (ev: MessageEvent<ArrayBuffer | Blob | string>): void => {
      if (decodeTokenRef.current !== token) return

      if (typeof ev.data === 'string') {
        try {
          const o = JSON.parse(ev.data) as {
            type?: string
            seq?: number
            publisherPresent?: boolean
            viewerCount?: number
          }
          if (o.type === 'ingest_pong') {
            if (outstandingPingSeqRef.current === o.seq) {
              outstandingPingSeqRef.current = null
              outstandingPingDeadlineRef.current = null
            }
            logRemoteIngest('jpeg_ws_ingest_pong', {
              seq: o.seq ?? null,
              publisherPresent: o.publisherPresent ?? null,
              viewerCount: o.viewerCount ?? null,
            })
            if (o.publisherPresent === true) {
              awaitingRelaySeqRef.current = typeof o.seq === 'number' ? o.seq : null
              relayDeadlineRef.current = Date.now() + PING_PONG_DEADLINE_MS
            } else {
              awaitingRelaySeqRef.current = null
              relayDeadlineRef.current = null
            }
            return
          }
          if (o.type === 'ingest_pong_relay') {
            if (awaitingRelaySeqRef.current === o.seq) {
              awaitingRelaySeqRef.current = null
              relayDeadlineRef.current = null
            }
            logRemoteIngest('jpeg_ws_ingest_pong_relay', { seq: o.seq ?? null })
            return
          }
        } catch {
          // not JSON
        }
        logRemoteIngest('jpeg_ws_text_message', {
          length: ev.data.length,
          preview: ev.data.slice(0, 160),
        })
        return
      }

      binaryMessagesRef.current += 1

      const ab =
        ev.data instanceof ArrayBuffer ? ev.data : null
      if (!ab) return
      const u8 = new Uint8Array(ab)
      const parsed = parseBinaryMessage(u8)
      if (!parsed) return

      if (parsed.messageType === MSG_AUDIO_CHUNK) {
        const meta = parsed.metadata as { sr?: number; ch?: number }
        const sr = typeof meta.sr === 'number' ? meta.sr : 16000
        const ch = typeof meta.ch === 'number' ? meta.ch : 1
        playAudioChunk(parsed.payload, sr, ch)
        return
      }

      if (parsed.messageType !== MSG_VIDEO_FRAME) {
        nonVideoBinaryRef.current += 1
        return
      }

      const payload = parsed.payload

      if (decodingRef.current) {
        pendingPayloadRef.current = payload
        framesDroppedRef.current += 1
        return
      }

      const decodeAndDraw = (jpegPayload: Uint8Array): void => {
        decodingRef.current = true
        const blob = new Blob([jpegPayload], { type: 'image/jpeg' })
        void createImageBitmap(blob).then((bmp) => {
          if (decodeTokenRef.current !== token) {
            bmp.close()
            decodingRef.current = false
            return
          }

          const canvas = previewCanvasRef.current
          const ctx = canvas?.getContext('2d')
          if (!canvas || !ctx) {
            bmp.close()
            decodingRef.current = false
            return
          }

          const bw = bmp.width
          const bh = bmp.height
          if (canvasWidthRef.current !== bw || canvasHeightRef.current !== bh) {
            canvas.width = bw
            canvas.height = bh
            canvasWidthRef.current = bw
            canvasHeightRef.current = bh
            setFrameWidth(bw)
            setFrameHeight(bh)
          }
          ctx.drawImage(bmp, 0, 0)
          bmp.close()

          framesDecodedRef.current += 1
          if (framesDecodedRef.current === 1) {
            logRemoteIngest('jpeg_ws_first_frame', { w: bw, h: bh })
          }
          setPhase('streaming')

          decodingRef.current = false
          const next = pendingPayloadRef.current
          if (next) {
            pendingPayloadRef.current = null
            decodeAndDraw(next)
          }
        }).catch((e) => {
          decodingRef.current = false
          parseFailuresRef.current += 1
          logRemoteIngest('jpeg_ws_decode_error', {
            message: e instanceof Error ? e.message : String(e),
          })
          const next = pendingPayloadRef.current
          if (next) {
            pendingPayloadRef.current = null
            decodeAndDraw(next)
          }
        })
      }

      decodeAndDraw(payload)
    }
  }, [armed, host, port, stop, playAudioChunk])

  useEffect(() => {
    startRef.current = start
  }, [start])

  useEffect(() => {
    if (!armed) return
    const id = window.setInterval(() => {
      const p = phaseRef.current
      if (p === 'idle') return

      const ws = wsRef.current
      const rs = ws?.readyState
      const now = Date.now()
      const openedAt = wsOpenedAtRef.current
      const connectAt = connectStartedAtRef.current

      logRemoteIngest('jpeg_ws_heartbeat', {
        phase: p,
        readyState: rs ?? null,
        readyStateLabel: readyStateLabel(rs),
        framesDecoded: framesDecodedRef.current,
        framesDropped: framesDroppedRef.current,
        binaryMessages: binaryMessagesRef.current,
        nonVideoBinary: nonVideoBinaryRef.current,
        parseFailures: parseFailuresRef.current,
        msSinceWsOpen: openedAt ? now - openedAt : null,
        msSinceConnectStart: connectAt ? now - connectAt : null,
        host,
        port,
      })

      const od = outstandingPingDeadlineRef.current
      const ops = outstandingPingSeqRef.current
      if (ops !== null && od !== null && now > od) {
        logRemoteIngestTerminal({
          action: 'ingest_ping_timeout',
          transport: 'ingest-ws',
          seq: ops,
          host,
          port,
          phase: p,
        })
        logRemoteIngest('jpeg_ws_ping_timeout', { seq: ops, host, port })
        outstandingPingSeqRef.current = null
        outstandingPingDeadlineRef.current = null
      }

      const rd = relayDeadlineRef.current
      const ars = awaitingRelaySeqRef.current
      if (ars !== null && rd !== null && now > rd) {
        logRemoteIngestTerminal({
          action: 'ingest_phone_relay_timeout',
          transport: 'ingest-ws',
          seq: ars,
          host,
          port,
          hint: 'Publisher socket was present but no ingest_pong_relay from phone (update iOS or check relay).',
        })
        logRemoteIngest('jpeg_ws_relay_timeout', { seq: ars })
        awaitingRelaySeqRef.current = null
        relayDeadlineRef.current = null
      }

      if (
        ws &&
        rs === WebSocket.OPEN &&
        p !== 'idle' &&
        p !== 'error' &&
        outstandingPingSeqRef.current === null
      ) {
        const seq = pingSeqRef.current + 1
        pingSeqRef.current = seq
        outstandingPingSeqRef.current = seq
        outstandingPingDeadlineRef.current = now + PING_PONG_DEADLINE_MS
        try {
          ws.send(JSON.stringify({ type: 'ingest_ping', seq }))
        } catch (e) {
          outstandingPingSeqRef.current = null
          outstandingPingDeadlineRef.current = null
          logRemoteIngestTerminal({
            action: 'ingest_ping_send_failed',
            transport: 'ingest-ws',
            seq,
            host,
            port,
            message: e instanceof Error ? e.message : String(e),
          })
        }
      }

      if (p === 'waiting_publisher' && ws && rs === WebSocket.OPEN && openedAt) {
        if (now - openedAt >= BOUNCE_WAITING_PUBLISHER_MS) {
          logRemoteIngestTerminal({
            action: 'jpeg_ws_bounce',
            reason: 'waiting_publisher_no_frames',
            host,
            port,
            msSinceOpen: now - openedAt,
          })
          logRemoteIngest('jpeg_ws_bounce', {
            reason: 'waiting_publisher_no_frames',
            msSinceOpen: now - openedAt,
          })
          void startRef.current()
        }
      }

      if (p === 'connecting' && ws && rs === WebSocket.CONNECTING && connectAt) {
        if (now - connectAt >= BOUNCE_STUCK_CONNECTING_MS) {
          logRemoteIngestTerminal({
            action: 'jpeg_ws_bounce',
            reason: 'connecting_stuck',
            host,
            port,
            msSinceConnectStart: now - connectAt,
          })
          logRemoteIngest('jpeg_ws_bounce', {
            reason: 'connecting_stuck',
            msSinceConnectStart: now - connectAt,
          })
          void startRef.current()
        }
      }
    }, HEARTBEAT_MS)
    return () => window.clearInterval(id)
  }, [armed, host, port])

  const captureFrame = useCallback((): ArrayBuffer | null => {
    const canvas = previewCanvasRef.current
    if (!canvas || canvas.width === 0 || canvas.height === 0) return null
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return imageData.data.buffer
  }, [])

  const isActive = phase === 'streaming' || phase === 'waiting_publisher' || phase === 'connecting'

  return {
    previewCanvasRef,
    isActive,
    phase,
    error,
    cameraLabel: phase === 'streaming' || phase === 'waiting_publisher' ? REMOTE_CAMERA_LABEL : null,
    start,
    stop,
    captureFrame,
    frameWidth,
    frameHeight,
    isMuted,
    toggleMute,
    remoteAudioStream,
  }
}
