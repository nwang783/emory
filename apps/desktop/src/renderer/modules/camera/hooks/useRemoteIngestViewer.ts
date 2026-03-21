import { useCallback, useEffect, useRef, useState } from 'react'
import { MSG_VIDEO_FRAME, parseBinaryMessage } from '@emory/ingest-protocol'

export type RemoteIngestViewerPhase =
  | 'idle'
  | 'connecting'
  | 'waiting_publisher'
  | 'streaming'
  | 'error'

const REMOTE_CAMERA_LABEL = 'Phone / glasses (remote ingest)'

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

export function useRemoteIngestViewer({
  armed,
  host,
  port,
}: UseRemoteIngestViewerArgs): UseRemoteIngestViewerResult {
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const decodeTokenRef = useRef(0)

  const [phase, setPhase] = useState<RemoteIngestViewerPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [frameWidth, setFrameWidth] = useState(640)
  const [frameHeight, setFrameHeight] = useState(480)

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
      return
    }
    stop()
    setError(null)
    setPhase('connecting')

    const url = `ws://${host}:${port}/ingest?role=viewer`
    const ws = new WebSocket(url)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws
    const token = decodeTokenRef.current

    ws.onopen = (): void => {
      if (decodeTokenRef.current !== token) return
      setPhase('waiting_publisher')
    }

    ws.onerror = (): void => {
      if (decodeTokenRef.current !== token) return
      setError('WebSocket error — check remote ingest is listening and the host is reachable')
      setPhase('error')
    }

    ws.onclose = (): void => {
      if (decodeTokenRef.current !== token) return
      if (wsRef.current === ws) {
        wsRef.current = null
      }
      setPhase((p) => (p === 'idle' ? 'idle' : 'error'))
      setError((prev) => prev ?? 'Remote ingest connection closed')
    }

    ws.onmessage = (ev: MessageEvent<ArrayBuffer | Blob>): void => {
      if (decodeTokenRef.current !== token) return

      void (async (): Promise<void> => {
        try {
          const ab =
            ev.data instanceof ArrayBuffer ? ev.data : await (ev.data as Blob).arrayBuffer()
          const u8 = new Uint8Array(ab)
          const parsed = parseBinaryMessage(u8)
          if (!parsed || parsed.messageType !== MSG_VIDEO_FRAME) {
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

          setFrameWidth(bw)
          setFrameHeight(bh)
          setPhase('streaming')
        } catch {
          if (decodeTokenRef.current === token) {
            setError('Failed to decode remote video frame')
            setPhase('error')
          }
        }
      })()
    }
  }, [armed, host, port, stop])

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
