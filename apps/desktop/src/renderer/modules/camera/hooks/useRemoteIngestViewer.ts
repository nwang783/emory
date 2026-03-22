import { useCallback, useEffect, useRef, useState } from 'react'
import { MSG_VIDEO_FRAME, parseBinaryMessage } from '@emory/ingest-protocol'
import { logRemoteIngest } from '@/modules/camera/lib/remote-ingest-debug'

export type RemoteIngestViewerPhase =
  | 'idle'
  | 'connecting'
  | 'waiting_publisher'
  | 'streaming'
  | 'error'

const REMOTE_CAMERA_LABEL = 'Phone / glasses (remote ingest)'

/** Heartbeat + stuck-detection interval (console visibility). */
const HEARTBEAT_MS = 3000
/** Re-open WS if OPEN but still no JPEG frames after this long (publisher may have missed attach). */
const BOUNCE_WAITING_PUBLISHER_MS = 6000
/** Re-open WS if stuck in browser CONNECTING state (rare tailnet / proxy stalls). */
const BOUNCE_STUCK_CONNECTING_MS = 12000

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
  const parseFailuresRef = useRef(0)
  const startRef = useRef<() => Promise<void>>(async () => {})

  const [phase, setPhase] = useState<RemoteIngestViewerPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [frameWidth, setFrameWidth] = useState(640)
  const [frameHeight, setFrameHeight] = useState(480)

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

  const stop = useCallback((): void => {
    decodeTokenRef.current += 1
    connectStartedAtRef.current = null
    wsOpenedAtRef.current = null
    closeSocket()
    setPhase('idle')
    setError(null)
    const c = previewCanvasRef.current
    if (c) {
      const ctx = c.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, c.width, c.height)
      }
    }
    logRemoteIngest('jpeg_ws_stop', {})
  }, [closeSocket])

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
    parseFailuresRef.current = 0
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
        logRemoteIngest('jpeg_ws_text_message', {
          length: ev.data.length,
          preview: ev.data.slice(0, 160),
        })
        return
      }

      void (async (): Promise<void> => {
        try {
          binaryMessagesRef.current += 1
          const ab =
            ev.data instanceof ArrayBuffer ? ev.data : await (ev.data as Blob).arrayBuffer()
          const u8 = new Uint8Array(ab)
          const parsed = parseBinaryMessage(u8)
          if (!parsed || parsed.messageType !== MSG_VIDEO_FRAME) {
            nonVideoBinaryRef.current += 1
            if (parsed) {
              logRemoteIngest('jpeg_ws_binary_skip', {
                messageType: parsed.messageType,
                payloadBytes: parsed.payload.byteLength,
              })
            }
            return
          }

          const blob = new Blob([parsed.payload], { type: 'image/jpeg' })
          const bmp = await createImageBitmap(blob)

          const canvas = previewCanvasRef.current
          const ctx = canvas?.getContext('2d')
          if (!canvas || !ctx || decodeTokenRef.current !== token) {
            bmp.close()
            return
          }

          const bw = bmp.width
          const bh = bmp.height
          canvas.width = bw
          canvas.height = bh
          ctx.drawImage(bmp, 0, 0)
          bmp.close()

          framesDecodedRef.current += 1
          if (framesDecodedRef.current === 1) {
            logRemoteIngest('jpeg_ws_first_frame', { w: bw, h: bh })
          }

          setFrameWidth(bw)
          setFrameHeight(bh)
          setPhase('streaming')
        } catch (e) {
          parseFailuresRef.current += 1
          logRemoteIngest('jpeg_ws_decode_error', {
            message: e instanceof Error ? e.message : String(e),
          })
          if (decodeTokenRef.current === token) {
            setError('Failed to decode remote video frame')
            setPhase('error')
          }
        }
      })()
    }
  }, [armed, host, port, stop])

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
        binaryMessages: binaryMessagesRef.current,
        nonVideoBinary: nonVideoBinaryRef.current,
        parseFailures: parseFailuresRef.current,
        msSinceWsOpen: openedAt ? now - openedAt : null,
        msSinceConnectStart: connectAt ? now - connectAt : null,
        host,
        port,
      })

      if (p === 'waiting_publisher' && ws && rs === WebSocket.OPEN && openedAt) {
        if (now - openedAt >= BOUNCE_WAITING_PUBLISHER_MS) {
          logRemoteIngest('jpeg_ws_bounce', {
            reason: 'waiting_publisher_no_frames',
            msSinceOpen: now - openedAt,
          })
          void startRef.current()
        }
      }

      if (p === 'connecting' && ws && rs === WebSocket.CONNECTING && connectAt) {
        if (now - connectAt >= BOUNCE_STUCK_CONNECTING_MS) {
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
  }
}
