import { useCallback, useState } from 'react'
import { useWebcam } from './useWebcam'
import { useRemoteIngestViewer } from './useRemoteIngestViewer'
import { useRemoteIngestStore } from '@/shared/stores/remote-ingest.store'

export type CameraFeedMode = 'local' | 'remote'

const PREFER_LOCAL_STORAGE_KEY = 'emory-camera-prefer-local'

export type UseCameraFeedResult = {
  mode: CameraFeedMode
  preferLocalOverride: boolean
  setPreferLocalOverride: (value: boolean) => void
  remoteIngestAvailable: boolean
  isActive: boolean
  error: string | null
  cameraLabel: string | null
  remotePhase: ReturnType<typeof useRemoteIngestViewer>['phase']
  start: () => Promise<void>
  stop: () => void
  captureFrame: () => ArrayBuffer | null
  frameWidth: number
  frameHeight: number
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>
}

export function useCameraFeed(): UseCameraFeedResult {
  const hydrated = useRemoteIngestStore((s) => s.hydrated)
  const configEnabled = useRemoteIngestStore((s) => s.configEnabled)
  const listening = useRemoteIngestStore((s) => s.listening)
  const effectiveHost = useRemoteIngestStore((s) => s.effectiveHost)
  const signalingPort = useRemoteIngestStore((s) => s.signalingPort)

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

  const local = useWebcam()
  const remote = useRemoteIngestViewer({
    armed: useRemote,
    host: effectiveHost,
    port: signalingPort,
  })

  const stop = useCallback(() => {
    local.stop()
    remote.stop()
  }, [local, remote])

  const start = useCallback(async () => {
    if (useRemote) {
      await remote.start()
    } else {
      await local.start()
    }
  }, [useRemote, remote, local])

  return {
    mode: useRemote ? 'remote' : 'local',
    preferLocalOverride,
    setPreferLocalOverride,
    remoteIngestAvailable,
    isActive: useRemote ? remote.isActive : local.isActive,
    error: useRemote ? remote.error : local.error,
    cameraLabel: useRemote ? remote.cameraLabel : local.cameraLabel,
    remotePhase: remote.phase,
    start,
    stop,
    captureFrame: useRemote ? remote.captureFrame : local.captureFrame,
    frameWidth: useRemote ? remote.frameWidth : local.frameWidth,
    frameHeight: useRemote ? remote.frameHeight : local.frameHeight,
    videoRef: local.videoRef,
    canvasRef: local.canvasRef,
    previewCanvasRef: remote.previewCanvasRef,
  }
}
