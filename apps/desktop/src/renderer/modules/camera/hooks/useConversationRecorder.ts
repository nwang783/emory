import { useEffect, useRef, useState, type RefObject } from 'react'
import { hasIdentityPresent, pickPrimarySubject, type IdentityTrack } from '../lib/primarySubject'

export type ConversationRecorderPhase = 'idle' | 'arming' | 'recording'

export const CAMERA_CONVERSATION_START_DEBOUNCE_MS = 400
export const CAMERA_CONVERSATION_STOP_DEBOUNCE_MS = 2000

const TICK_MS = 100
/** Let MediaRecorder `onstop` flush before tearing down the mic stream (effect cleanup order). */
const MIC_STREAM_RELEASE_DELAY_MS = 75

function pickRecorderMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm'
  if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return 'audio/webm;codecs=opus'
  if (MediaRecorder.isTypeSupported('audio/webm')) return 'audio/webm'
  return 'audio/webm'
}

type UseConversationRecorderResult = {
  phase: ConversationRecorderPhase
  error: string | null
  lastSavedRecordingId: string | null
  /** Chromium/OS default input when no `deviceId` is passed to getUserMedia; may be empty until stream opens. */
  micLabel: string | null
}

/**
 * Face-driven conversation capture: arm when a locked identity is primary (largest bbox),
 * record after start debounce, freeze personId for the segment, stop after stop debounce
 * when that person is absent from tracks.
 */
export function useConversationRecorder(
  isActive: boolean,
  tracksRef: RefObject<IdentityTrack[]>,
): UseConversationRecorderResult {
  const [phase, setPhase] = useState<ConversationRecorderPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastSavedRecordingId, setLastSavedRecordingId] = useState<string | null>(null)
  const [micLabel, setMicLabel] = useState<string | null>(null)

  const phaseRef = useRef<ConversationRecorderPhase>('idle')
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const frozenPersonIdRef = useRef<string | null>(null)
  const segmentStartedAtRef = useRef<number | null>(null)
  const armingPersonIdRef = useRef<string | null>(null)
  const armingSinceRef = useRef<number | null>(null)
  const absentSinceRef = useRef<number | null>(null)
  const stoppingRef = useRef(false)
  const chosenMimeRef = useRef<string>(pickRecorderMimeType())
  const micBlockedRef = useRef(false)

  const setPhaseBoth = (p: ConversationRecorderPhase): void => {
    phaseRef.current = p
    setPhase(p)
  }

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (!isActive) {
      micBlockedRef.current = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
      streamRef.current = null
      setMicLabel(null)
      phaseRef.current = 'idle'
      setPhase('idle')
      return
    }

    let cancelled = false
    setError(null)
    setMicLabel(null)
    micBlockedRef.current = false

    void navigator.mediaDevices
      .getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        for (const t of stream.getAudioTracks()) {
          t.enabled = true
        }
        streamRef.current = stream
        micBlockedRef.current = false
        const first = stream.getAudioTracks()[0]
        const label = first?.label?.trim()
        setMicLabel(label && label.length > 0 ? label : 'System default microphone')
      })
      .catch((err: unknown) => {
        micBlockedRef.current = true
        const message = err instanceof Error ? err.message : 'Microphone access denied'
        setError(message)
      })

    return () => {
      cancelled = true
      window.setTimeout(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }, MIC_STREAM_RELEASE_DELAY_MS)
    }
  }, [isActive])

  useEffect(() => {
    if (!isActive) return

    const uploadSegment = async (
      personId: string,
      startedAtMs: number,
      blob: Blob,
    ): Promise<void> => {
      const mimeType = blob.type || chosenMimeRef.current
      if (blob.size === 0) {
        setError(
          'Recording produced no audio data. Check that the microphone is not muted in Windows settings and that the correct input is the system default.',
        )
        return
      }
      const buffer = await blob.arrayBuffer()
      const recordedAt = new Date(startedAtMs).toISOString()
      const durationMs = Math.max(0, Math.round(Date.now() - startedAtMs))
      const result = await window.emoryApi.conversation.saveAndProcess({
        personId,
        recordedAt,
        mimeType,
        durationMs,
        audioBytes: buffer,
      })
      if (result.success) {
        setLastSavedRecordingId(result.recording.id)
      } else {
        setError(result.error)
      }
    }

    const resetAfterStop = (): void => {
      recorderRef.current = null
      chunksRef.current = []
      frozenPersonIdRef.current = null
      segmentStartedAtRef.current = null
      absentSinceRef.current = null
      armingPersonIdRef.current = null
      armingSinceRef.current = null
      stoppingRef.current = false
      setPhaseBoth('idle')
    }

    const stopRecorderAndUpload = (): void => {
      const rec = recorderRef.current
      const personId = frozenPersonIdRef.current
      const startedAt = segmentStartedAtRef.current
      if (!rec || rec.state === 'inactive' || !personId || startedAt == null) {
        resetAfterStop()
        return
      }

      stoppingRef.current = true
      rec.onstop = () => {
        const chunks = chunksRef.current
        chunksRef.current = []
        const blob = new Blob(chunks, { type: rec.mimeType || chosenMimeRef.current })
        void uploadSegment(personId, startedAt, blob).finally(resetAfterStop)
      }
      try {
        if (rec.state === 'recording') {
          try {
            rec.requestData()
          } catch {
            /* ignore */
          }
        }
        rec.stop()
      } catch {
        stoppingRef.current = false
        resetAfterStop()
      }
    }

    const startRecording = (personId: string): void => {
      const stream = streamRef.current
      if (!stream) return

      const mimeType = chosenMimeRef.current
      const options: MediaRecorderOptions = {}
      if (MediaRecorder.isTypeSupported(mimeType)) {
        options.mimeType = mimeType
      }
      if (typeof MediaRecorder !== 'undefined') {
        try {
          options.audioBitsPerSecond = 128_000
        } catch {
          /* optional */
        }
      }
      let recorder: MediaRecorder
      try {
        recorder =
          Object.keys(options).length > 0 ? new MediaRecorder(stream, options) : new MediaRecorder(stream)
      } catch {
        recorder = new MediaRecorder(stream)
      }

      chosenMimeRef.current = recorder.mimeType && recorder.mimeType.length > 0 ? recorder.mimeType : mimeType
      chunksRef.current = []
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data)
      }

      frozenPersonIdRef.current = personId
      segmentStartedAtRef.current = Date.now()
      absentSinceRef.current = null
      armingPersonIdRef.current = null
      armingSinceRef.current = null
      recorderRef.current = recorder
      try {
        // No timeslice: Chromium emits one `dataavailable` on `stop()`, avoiding empty blobs on short segments.
        recorder.start()
        setPhaseBoth('recording')
      } catch {
        frozenPersonIdRef.current = null
        segmentStartedAtRef.current = null
        recorderRef.current = null
        setPhaseBoth('idle')
      }
    }

    const id = window.setInterval(() => {
      if (stoppingRef.current) return

      const tracks = tracksRef.current
      const primary = pickPrimarySubject(tracks)
      const now = Date.now()
      const currentPhase = phaseRef.current

      if (currentPhase === 'recording') {
        const fid = frozenPersonIdRef.current
        if (!fid) return
        if (hasIdentityPresent(tracks, fid)) {
          absentSinceRef.current = null
          return
        }
        if (absentSinceRef.current == null) absentSinceRef.current = now
        if (now - absentSinceRef.current >= CAMERA_CONVERSATION_STOP_DEBOUNCE_MS) {
          stopRecorderAndUpload()
        }
        return
      }

      if (!primary) {
        armingPersonIdRef.current = null
        armingSinceRef.current = null
        if (currentPhase === 'arming') setPhaseBoth('idle')
        return
      }

      if (currentPhase === 'idle') {
        armingPersonIdRef.current = primary.personId
        armingSinceRef.current = now
        setPhaseBoth('arming')
        return
      }

      if (currentPhase === 'arming') {
        if (primary.personId !== armingPersonIdRef.current) {
          armingPersonIdRef.current = primary.personId
          armingSinceRef.current = now
          return
        }
        if (armingSinceRef.current == null) armingSinceRef.current = now
        if (now - armingSinceRef.current >= CAMERA_CONVERSATION_START_DEBOUNCE_MS) {
          if (!streamRef.current || micBlockedRef.current) return
          startRecording(primary.personId)
        }
      }
    }, TICK_MS)

    return () => {
      clearInterval(id)
      const rec = recorderRef.current
      if (rec && rec.state === 'recording' && !stoppingRef.current) {
        const personId = frozenPersonIdRef.current
        const startedAt = segmentStartedAtRef.current
        if (personId != null && startedAt != null) {
          stoppingRef.current = true
          rec.onstop = () => {
            const chunks = chunksRef.current
            chunksRef.current = []
            const blob = new Blob(chunks, { type: rec.mimeType || chosenMimeRef.current })
            void uploadSegment(personId, startedAt, blob).finally(() => {
              recorderRef.current = null
              frozenPersonIdRef.current = null
              segmentStartedAtRef.current = null
              absentSinceRef.current = null
              armingPersonIdRef.current = null
              armingSinceRef.current = null
              stoppingRef.current = false
              phaseRef.current = 'idle'
              setPhase('idle')
            })
          }
          try {
            if (rec.state === 'recording') {
              try {
                rec.requestData()
              } catch {
                /* ignore */
              }
            }
            rec.stop()
          } catch {
            stoppingRef.current = false
            recorderRef.current = null
            frozenPersonIdRef.current = null
            segmentStartedAtRef.current = null
            phaseRef.current = 'idle'
            setPhase('idle')
          }
          return
        }
      }
      recorderRef.current = null
      chunksRef.current = []
      frozenPersonIdRef.current = null
      segmentStartedAtRef.current = null
      absentSinceRef.current = null
      armingPersonIdRef.current = null
      armingSinceRef.current = null
      stoppingRef.current = false
      phaseRef.current = 'idle'
      setPhase('idle')
    }
  }, [isActive, tracksRef])

  return { phase, error, lastSavedRecordingId, micLabel }
}
