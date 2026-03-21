import { useRef, useState, useCallback, useEffect } from 'react'
import { sharedStream } from '../shared-stream'

type UseWebcamResult = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  isActive: boolean
  error: string | null
  /** Label from `MediaStreamTrack` after the stream opens; empty labels fall back to a generic string. */
  cameraLabel: string | null
  start: () => Promise<void>
  stop: () => void
  captureFrame: () => ArrayBuffer | null
}

export function useWebcam(): UseWebcamResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isActive, setIsActive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cameraLabel, setCameraLabel] = useState<string | null>(null)

  const start = useCallback(async () => {
    try {
      setError(null)
      setCameraLabel(null)

      const [cameraPermission, microphonePermission] = await Promise.all([
        window.emoryApi.app.ensureMediaAccess('camera'),
        window.emoryApi.app.ensureMediaAccess('microphone'),
      ])

      if (!cameraPermission.granted) {
        setError(`Camera access is ${cameraPermission.status}. Enable it in macOS Privacy & Security settings.`)
        return
      }

      if (!microphonePermission.granted) {
        setError(`Microphone access is ${microphonePermission.status}. Enable it in macOS Privacy & Security settings.`)
        return
      }

      const devices = await navigator.mediaDevices.enumerateDevices()
      const videoDevices = devices.filter((d) => d.kind === 'videoinput')
      console.log('[Webcam] Available video devices:', videoDevices.length, videoDevices)

      if (videoDevices.length === 0) {
        setError('No camera found on this device')
        return
      }

      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false,
        })
      } catch (firstErr) {
        console.warn('[Webcam] Preferred constraints failed, trying bare video:true', firstErr)
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      }

      streamRef.current = stream
      sharedStream.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      const videoTrack = stream.getVideoTracks()[0]
      const label = videoTrack?.label?.trim()
      setCameraLabel(label && label.length > 0 ? label : 'Default camera (no label)')

      setIsActive(true)
    } catch (err) {
      const name = err instanceof Error ? err.name : 'Unknown'
      const message = err instanceof Error ? err.message : 'Failed to access webcam'
      console.error('[Webcam] getUserMedia failed:', name, message)
      setError(`${name}: ${message}`)
      setIsActive(false)
      setCameraLabel(null)
    }
  }, [])

  const stop = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop()
      }
      streamRef.current = null
      sharedStream.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setIsActive(false)
    setCameraLabel(null)
  }, [])

  const captureFrame = useCallback((): ArrayBuffer | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !isActive) return null

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    return imageData.data.buffer
  }, [isActive])

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop()
        }
      }
    }
  }, [])

  return { videoRef, canvasRef, isActive, error, cameraLabel, start, stop, captureFrame }
}
