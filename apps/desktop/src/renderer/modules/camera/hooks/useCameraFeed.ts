import { useCallback, useEffect, useMemo, useState } from 'react'
import { useWebcam } from './useWebcam'
import { useRemoteIngestViewer, type RemoteIngestViewerPhase } from './useRemoteIngestViewer'
import { useRemoteIngestWebRtc, type RemoteIngestWebRtcPhase } from './useRemoteIngestWebRtc'
import { useRemoteIngestStore } from '@/shared/stores/remote-ingest.store'
import { logRemoteIngest } from '@/modules/camera/lib/remote-ingest-debug'

/** Active remote hook phase when using ingest (JPEG or WebRTC); null for local camera. */
export type RemoteIngestConnectionPhase = RemoteIngestViewerPhase | RemoteIngestWebRtcPhase

export type CameraFeedMode = 'local' | 'remote'

export type RemoteIngestTransport = 'webrtc' | 'jpeg-ws'

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
  /** JPEG/WebRTC connection phase; null when `mode === 'local'`. */
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
  const useJpeg = useRemote && !webrtcVideoPreferred

  const local = useWebcam()
  const jpegRemote = useRemoteIngestViewer({
    armed: useJpeg,
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
    jpegRemote.stop()
    webrtcRemote.stop()
  }, [local, jpegRemote, webrtcRemote])

  const start = useCallback(async () => {
    if (useRemote) {
      if (webrtcVideoPreferred) {
        await webrtcRemote.start()
      } else {
        await jpegRemote.start()
      }
    } else {
      await local.start()
    }
  }, [useRemote, webrtcVideoPreferred, webrtcRemote, jpegRemote, local])

  const mode: CameraFeedMode = useRemote ? 'remote' : 'local'

  const isActive = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.isActive
      : jpegRemote.isActive
    : local.isActive

  const feedReady =
    mode === 'local'
      ? local.isActive
      : webrtcVideoPreferred
        ? webrtcRemote.phase === 'streaming'
        : jpegRemote.phase === 'streaming'

  const remoteTransport: RemoteIngestTransport | null = useRemote
    ? webrtcVideoPreferred
      ? 'webrtc'
      : 'jpeg-ws'
    : null

  const error = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.error
      : jpegRemote.error
    : local.error

  const cameraLabel = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.cameraLabel
      : jpegRemote.cameraLabel
    : local.cameraLabel

  const captureFrame = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.captureFrame
      : jpegRemote.captureFrame
    : local.captureFrame

  const frameWidth = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.frameWidth
      : jpegRemote.frameWidth
    : local.frameWidth

  const frameHeight = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.frameHeight
      : jpegRemote.frameHeight
    : local.frameHeight

  const remoteStatusHint = useMemo((): string | null => {
    if (!useRemote) return null
    if (webrtcVideoPreferred) {
      if (webrtcRemote.phase === 'signaling') {
        return 'WebRTC: waiting for the phone to send an offer (same /signaling WebSocket).'
      }
      if (webrtcRemote.phase === 'negotiating') {
        return 'WebRTC: finishing handshake…'
      }
      return null
    }
    if (jpegRemote.phase === 'connecting') {
      return 'Connecting to JPEG ingest WebSocket…'
    }
    if (jpegRemote.phase === 'waiting_publisher') {
      return 'Waiting for JPEG frames from the phone (/ingest publisher).'
    }
    return null
  }, [useRemote, webrtcVideoPreferred, webrtcRemote.phase, jpegRemote.phase])

  const remotePhase: RemoteIngestConnectionPhase | null = useRemote
    ? webrtcVideoPreferred
      ? webrtcRemote.phase
      : jpegRemote.phase
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
    previewCanvasRef: jpegRemote.previewCanvasRef,
    webRtcVideoRef: webrtcRemote.videoRef,
    webRtcCaptureCanvasRef: webrtcRemote.canvasRef,
  }
}
