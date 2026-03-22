import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWebcam } from './useWebcam'
import { useRemoteIngestViewer, type RemoteIngestViewerPhase } from './useRemoteIngestViewer'
import { useRemoteIngestWebRtc, type RemoteIngestWebRtcPhase } from './useRemoteIngestWebRtc'
import { useRemoteIngestStore } from '@/shared/stores/remote-ingest.store'
import { logRemoteIngest } from '@/modules/camera/lib/remote-ingest-debug'

/** Active remote hook phase when using ingest WebSocket or WebRTC; null for local camera. */
export type RemoteIngestConnectionPhase = RemoteIngestViewerPhase | RemoteIngestWebRtcPhase

export type CameraFeedMode = 'local' | 'remote'

/** `ingest-ws` = `/ingest` binary relay, same protocol as `apps/bridge-server`. */
export type RemoteIngestTransport = 'webrtc' | 'ingest-ws'

const PREFER_LOCAL_STORAGE_KEY = 'emory-camera-prefer-local'

export type UseCameraFeedResult = {
  mode: CameraFeedMode
  preferLocalOverride: boolean
  setPreferLocalOverride: (value: boolean) => void
  remoteIngestAvailable: boolean
  remoteTransport: RemoteIngestTransport | null
  /**
   * True when face / conversation pipelines may run.
   * Remote: true once ingest session is active (connecting / waiting / streaming), not only after first frame.
   */
  feedReady: boolean
  isActive: boolean
  error: string | null
  cameraLabel: string | null
  remoteStatusHint: string | null
  /** Ingest WebSocket or WebRTC phase; null when `mode === 'local'`. */
  remotePhase: RemoteIngestConnectionPhase | null
  start: () => Promise<void>
  stop: () => void
  captureFrame: () => ArrayBuffer | null
  frameWidth: number
  frameHeight: number
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>
  webRtcVideoRef: React.RefObject<HTMLVideoElement | null>
  webRtcCaptureCanvasRef: React.RefObject<HTMLCanvasElement | null>
}

export function useCameraFeed(): UseCameraFeedResult {
  const hydrated = useRemoteIngestStore((s) => s.hydrated)
  const configEnabled = useRemoteIngestStore((s) => s.configEnabled)
  const listening = useRemoteIngestStore((s) => s.listening)
  const effectiveHost = useRemoteIngestStore((s) => s.effectiveHost)
  const signalingPort = useRemoteIngestStore((s) => s.signalingPort)
  const webrtcVideoPreferred = useRemoteIngestStore((s) => s.webrtcVideoPreferred)

  const [preferLocalOverride, setPreferLocalState] = useState(() => {
    try {
      return sessionStorage.getItem(PREFER_LOCAL_STORAGE_KEY) === '1'
    } catch {
      return false
    }
  })

  const setPreferLocalOverride = useCallback((value: boolean) => {
    try {
      if (value) {
        sessionStorage.setItem(PREFER_LOCAL_STORAGE_KEY, '1')
      } else {
        sessionStorage.removeItem(PREFER_LOCAL_STORAGE_KEY)
      }
    } catch {
      // ignore
    }
    setPreferLocalState(value)
  }, [])

  const remoteIngestAvailable =
    hydrated && configEnabled && listening && effectiveHost !== null && effectiveHost.length > 0

  const useRemote = remoteIngestAvailable && !preferLocalOverride
  const useWebrtc = useRemote && webrtcVideoPreferred
  const useIngestWs = useRemote && !webrtcVideoPreferred

  const local = useWebcam()
  const ingestWsRemote = useRemoteIngestViewer({
    armed: useIngestWs,
    host: effectiveHost,
    port: signalingPort,
  })
  const webrtcRemote = useRemoteIngestWebRtc({
    armed: useWebrtc,
    host: effectiveHost,
    port: signalingPort,
  })

  const stop = useCallback(() => {
    local.stop()
    ingestWsRemote.stop()
    webrtcRemote.stop()
  }, [local, ingestWsRemote, webrtcRemote])

  const start = useCallback(async () => {
    if (useRemote) {
      if (webrtcVideoPreferred) {
        await webrtcRemote.start()
      } else {
        await ingestWsRemote.start()
      }
    } else {
      await local.start()
    }
  }, [useRemote, webrtcVideoPreferred, webrtcRemote, ingestWsRemote, local])

  const mode: CameraFeedMode = useRemote ? 'remote' : 'local'

  const isActive = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.isActive
      : ingestWsRemote.isActive
    : local.isActive

  const feedReady =
    mode === 'local'
      ? local.isActive
      : webrtcVideoPreferred
        ? webrtcRemote.phase === 'streaming'
        : ingestWsRemote.phase === 'streaming'

  const remoteTransport: RemoteIngestTransport | null = useRemote
    ? webrtcVideoPreferred
      ? 'webrtc'
      : 'ingest-ws'
    : null

  const error = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.error
      : ingestWsRemote.error
    : local.error

  const cameraLabel = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.cameraLabel
      : ingestWsRemote.cameraLabel
    : local.cameraLabel

  const captureFrame = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.captureFrame
      : ingestWsRemote.captureFrame
    : local.captureFrame

  const frameWidth = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.frameWidth
      : ingestWsRemote.frameWidth
    : local.frameWidth

  const frameHeight = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.frameHeight
      : ingestWsRemote.frameHeight
    : local.frameHeight

  const remoteStatusHint = useMemo((): string | null => {
    if (!useRemote) return null
    if (webrtcVideoPreferred) {
      if (webrtcRemote.phase === 'signaling') {
        return 'WebRTC: waiting for the phone to send an offer on /signaling (not used by current Emory iOS).'
      }
      if (webrtcRemote.phase === 'negotiating') {
        return 'WebRTC: finishing handshake…'
      }
      return null
    }
    if (ingestWsRemote.phase === 'connecting') {
      return 'Connecting to /ingest (same binary protocol as bridge-server)…'
    }
    if (ingestWsRemote.phase === 'waiting_publisher') {
      return 'Waiting for video frames from the phone (publisher on /ingest).'
    }
    return null
  }, [useRemote, webrtcVideoPreferred, webrtcRemote.phase, ingestWsRemote.phase])

  const remotePhase: RemoteIngestConnectionPhase | null = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.phase
      : ingestWsRemote.phase
    : null

  useEffect(() => {
    if (mode !== 'remote') return
    logRemoteIngest('camera_feed_remote', {
      feedReady,
      isActive,
      remotePhase,
      remoteTransport,
      error: error ?? null,
    })
  }, [mode, feedReady, isActive, remotePhase, remoteTransport, error])

  return {
    mode,
    preferLocalOverride,
    setPreferLocalOverride,
    remoteIngestAvailable,
    remoteTransport,
    feedReady,
    isActive,
    error,
    cameraLabel,
    remoteStatusHint,
    remotePhase,
    start,
    stop,
    captureFrame,
    frameWidth,
    frameHeight,
    videoRef: local.videoRef,
    canvasRef: local.canvasRef,
    previewCanvasRef: ingestWsRemote.previewCanvasRef,
    webRtcVideoRef: webrtcRemote.videoRef,
    webRtcCaptureCanvasRef: webrtcRemote.canvasRef,
  }
}
