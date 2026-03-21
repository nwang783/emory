import { useEffect, useRef, useCallback, useState } from 'react'
import { Camera, CameraOff, GraduationCap, MessageSquareText, MonitorSmartphone } from 'lucide-react'
import { useCameraFeed } from '../hooks/useCameraFeed'
import { useFaceStore } from '@/shared/stores/face.store'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { useActivityStore } from '@/shared/stores/activity.store'
import { usePeopleStore } from '@/shared/stores/people.store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MemoryQueryPanel } from './MemoryQueryPanel'
import { WhoIsThisButton } from './WhoIsThisButton'
import { useConversationRecorder } from '../hooks/useConversationRecorder'

const TRACK_IOU_THRESHOLD = 0.25
const TRACK_EXPIRY_MS = 2000
const IDENTITY_UNLOCK_VOTES = 4
const LERP_SPEED = 0.35
const AUTO_LEARN_MIN_SIMILARITY = 0.60
const AUTO_LEARN_MAX_SIMILARITY = 0.92
const AUTO_LEARN_MIN_MARGIN = 0.06
const AUTO_LEARN_MIN_HOLD_MS = 30_000
const AUTO_LEARN_MIN_CONSENSUS = 5
const INSTANT_LOCK_THRESHOLD = 0.55
const INSTANT_LOCK_MIN_MARGIN = 0.08
const MIN_VOTES_TO_LOCK = 3
const VOTE_LOCK_MIN_MARGIN = 0.05
const WEAK_MATCH_THRESHOLD = 0.48
const SIMILARITY_DECAY_THRESHOLD = 0.45
const CONFIDENT_UNKNOWN_THRESHOLD = 0.42
const CONFUSION_PEOPLE_LIMIT = 3
const CONFUSION_COOLDOWN_MS = 10_000
const CONSENSUS_WINDOW = 8
const ENCOUNTER_LOG_COOLDOWN_MS = 60_000
const UNKNOWN_TRACK_COOLDOWN_MS = 30_000

type Rect = { x: number; y: number; w: number; h: number }

type IdentityVote = { label: string; personId: string; similarity: number; margin: number }

type FaceTrack = {
  id: number
  current: Rect
  target: Rect
  score: number
  lastSeenAt: number
  identity: { label: string; personId: string; colour: string; similarity: number } | null
  identityLockedAt: number
  identityVotes: IdentityVote[]
  unknownStreak: number
  lastAutoLearnAt: number
  confusedUntil: number
  lastEncounterLogAt: number
  lastUnknownTrackAt: number
}

let nextTrackId = 1

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function computeIoU(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const union = a.w * a.h + b.w * b.h - inter
  return union > 0 ? inter / union : 0
}

type DetInput = { bbox: { x: number; y: number; width: number; height: number }; score: number }

function matchDetectionsToTracks(
  detections: DetInput[],
  tracks: FaceTrack[],
): { matched: Array<[number, number]>; unmatchedDets: number[] } {
  const dets = detections.map((d) => ({ x: d.bbox.x, y: d.bbox.y, w: d.bbox.width, h: d.bbox.height }))
  const matched: Array<[number, number]> = []
  const usedDets = new Set<number>()
  const usedTracks = new Set<number>()

  const pairs: Array<{ di: number; ti: number; iou: number }> = []
  for (let di = 0; di < dets.length; di++) {
    for (let ti = 0; ti < tracks.length; ti++) {
      const iou = computeIoU(dets[di], tracks[ti].target)
      if (iou >= TRACK_IOU_THRESHOLD) pairs.push({ di, ti, iou })
    }
  }

  pairs.sort((a, b) => b.iou - a.iou)
  for (const { di, ti } of pairs) {
    if (usedDets.has(di) || usedTracks.has(ti)) continue
    matched.push([di, ti])
    usedDets.add(di)
    usedTracks.add(ti)
  }

  return {
    matched,
    unmatchedDets: detections.map((_, i) => i).filter((i) => !usedDets.has(i)),
  }
}

export function WebcamFeed(): React.JSX.Element {
  const {
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
    start,
    stop,
    captureFrame,
    frameWidth,
    frameHeight,
    videoRef,
    canvasRef,
    previewCanvasRef,
    webRtcVideoRef,
    webRtcCaptureCanvasRef,
  } = useCameraFeed()

  const overlayRef = useRef<HTMLCanvasElement | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const tracksRef = useRef<FaceTrack[]>([])
  const { phase: conversationPhase, error: conversationError, micLabel: conversationMicLabel } =
    useConversationRecorder(feedReady, tracksRef)
  const detectInFlightRef = useRef(false)
  const identifyInFlightRef = useRef(false)
  const [autoLearnCount, setAutoLearnCount] = useState(0)
  const [showMemoryQueryPanel, setShowMemoryQueryPanel] = useState(false)
  const [identifiedPeople, setIdentifiedPeople] = useState<
    Array<{
      label: string
      personId: string
      similarity: number
      graphRelationshipTypeToSelf?: string | null
    }>
  >([])
  const urgentIdentifyRef = useRef(false)
  const sessionIdRef = useRef<string | null>(null)

  const setDetections = useFaceStore((s) => s.setDetections)
  const setMatches = useFaceStore((s) => s.setMatches)
  const setIsProcessing = useFaceStore((s) => s.setIsProcessing)
  const setFpsCount = useFaceStore((s) => s.setFpsCount)
  const setProcessingTimeMs = useFaceStore((s) => s.setProcessingTimeMs)

  const frameCountRef = useRef(0)
  const fpsTimerRef = useRef(performance.now())

  const runIdentification = useCallback(async () => {
    if (identifyInFlightRef.current) return
    const frameData = captureFrame()
    if (!frameData) return
    const w = frameWidth
    const h = frameHeight
    if (w <= 0 || h <= 0) return

    const { autoLearnEnabled } = useSettingsStore.getState()
    const { addEvent, incrementAutoLearnCount } = useActivityStore.getState()

    identifyInFlightRef.current = true
    setIsProcessing(true)
    try {
      const result = await window.emoryApi.face.processFrame(frameData, w, h)
      setMatches(result.matches)

      const identDets = result.detections.map((d) => ({ bbox: d.bbox, score: d.score }))
      const { matched } = matchDetectionsToTracks(identDets, tracksRef.current)

      for (const [di, ti] of matched) {
        const det = result.detections[di]
        const track = tracksRef.current[ti]

        const match = result.matches.find(
          (m) =>
            Math.abs(m.bbox.x - det.bbox.x) < det.bbox.width * 0.4 &&
            Math.abs(m.bbox.y - det.bbox.y) < det.bbox.height * 0.4,
        )

        const now = Date.now()
        const isConfused = now < track.confusedUntil

        if (match) {
          // Confident unknown: match exists but similarity so low it's meaningless
          if (match.similarity < CONFIDENT_UNKNOWN_THRESHOLD) {
            track.unknownStreak += 2.0
            if (track.unknownStreak >= IDENTITY_UNLOCK_VOTES) {
              track.identity = null
              track.identityVotes = []
              track.identityLockedAt = 0
            }
          } else {
            const matchMargin = (match as { matchMargin?: number }).matchMargin ?? 0
            track.identityVotes.push({ label: match.personName, personId: match.personId, similarity: match.similarity, margin: matchMargin })
            if (track.identityVotes.length > 15) track.identityVotes.shift()

            // Oscillation detection: check for confusion
            const recentWindow = track.identityVotes.slice(-CONSENSUS_WINDOW)
            const uniquePeople = new Set(recentWindow.map((v) => v.personId))
            if (uniquePeople.size >= CONFUSION_PEOPLE_LIMIT && !isConfused) {
              track.confusedUntil = now + CONFUSION_COOLDOWN_MS
              track.identity = null
              track.identityVotes = []
              track.identityLockedAt = 0
              track.unknownStreak = 0
            } else if (!isConfused) {
              if (match.similarity < WEAK_MATCH_THRESHOLD || matchMargin < VOTE_LOCK_MIN_MARGIN) {
                track.unknownStreak += 1.0
              } else {
                track.unknownStreak = 0

                if (!track.identity && match.similarity >= INSTANT_LOCK_THRESHOLD && matchMargin >= INSTANT_LOCK_MIN_MARGIN) {
                  track.identity = { label: match.personName, personId: match.personId, colour: '#34d399', similarity: match.similarity }
                  track.identityLockedAt = now
                } else if (!track.identity) {
                  const strongVotes = track.identityVotes
                    .filter((v) => v.similarity >= WEAK_MATCH_THRESHOLD && v.margin >= VOTE_LOCK_MIN_MARGIN)
                    .slice(-MIN_VOTES_TO_LOCK)
                  if (strongVotes.length >= MIN_VOTES_TO_LOCK) {
                    const allSamePerson = strongVotes.every((v) => v.personId === match.personId)
                    const avgSim = strongVotes.reduce((s, v) => s + v.similarity, 0) / strongVotes.length
                    if (allSamePerson && avgSim >= WEAK_MATCH_THRESHOLD) {
                      track.identity = { label: match.personName, personId: match.personId, colour: '#34d399', similarity: avgSim }
                      track.identityLockedAt = now
                    }
                  }
                } else if (track.identity && match.personId !== track.identity.personId) {
                  const correctionVotes = track.identityVotes
                    .filter((v) => v.personId === match.personId && v.similarity >= WEAK_MATCH_THRESHOLD && v.margin >= VOTE_LOCK_MIN_MARGIN)
                    .slice(-MIN_VOTES_TO_LOCK)
                  if (correctionVotes.length >= MIN_VOTES_TO_LOCK) {
                    const avgSim = correctionVotes.reduce((s, v) => s + v.similarity, 0) / correctionVotes.length
                    track.identity = { label: match.personName, personId: match.personId, colour: '#34d399', similarity: avgSim }
                    track.identityLockedAt = now
                  }
                } else if (track.identity && match.personId === track.identity.personId) {
                  const recent = track.identityVotes.slice(-5)
                  track.identity.similarity = recent.reduce((s, v) => s + v.similarity, 0) / recent.length
                }
              }

              // Similarity decay check
              if (track.identity) {
                const recentSims = track.identityVotes.slice(-5)
                if (recentSims.length >= 3) {
                  const avg = recentSims.reduce((s, v) => s + v.similarity, 0) / recentSims.length
                  if (avg < SIMILARITY_DECAY_THRESHOLD) {
                    track.identity = null
                    track.identityVotes = []
                    track.identityLockedAt = 0
                  }
                }
              }

              // Auto-learn with hardened conditions
              const matchMarginForLearn = (match as { matchMargin?: number }).matchMargin ?? 0
              const identityHeldLongEnough = track.identityLockedAt > 0 && (now - track.identityLockedAt) >= AUTO_LEARN_MIN_HOLD_MS
              const consensusVotes = track.identityVotes
                .slice(-CONSENSUS_WINDOW)
                .filter((v) => v.personId === track.identity?.personId && v.similarity >= AUTO_LEARN_MIN_SIMILARITY)
              const hasConsensus = consensusVotes.length >= AUTO_LEARN_MIN_CONSENSUS

              if (
                autoLearnEnabled &&
                track.identity &&
                match.similarity >= AUTO_LEARN_MIN_SIMILARITY &&
                match.similarity < AUTO_LEARN_MAX_SIMILARITY &&
                matchMarginForLearn >= AUTO_LEARN_MIN_MARGIN &&
                identityHeldLongEnough &&
                hasConsensus &&
                now - track.lastAutoLearnAt > 15_000
              ) {
                triggerAutoLearn(frameData, w, h, match.personId, track, matchMarginForLearn)
                  .then((learned) => {
                    if (learned) {
                      incrementAutoLearnCount()
                      setAutoLearnCount((c) => c + 1)
                      addEvent({
                        type: 'auto_learn',
                        personName: match.personName,
                        similarity: match.similarity,
                        details: `Learned new angle (margin: ${(matchMarginForLearn * 100).toFixed(0)}%)`,
                      })
                    }
                  })
                  .catch(() => {})
              }
            }
          }
        } else {
          track.unknownStreak += 2.0
          if (track.unknownStreak >= IDENTITY_UNLOCK_VOTES) {
            track.identity = null
            track.identityVotes = []
            track.identityLockedAt = 0
          }
        }
      }
      const { graphEdgeToSelfByPersonId } = usePeopleStore.getState()
      const identified = tracksRef.current
        .filter((t) => t.identity)
        .map((t) => {
          const edge = graphEdgeToSelfByPersonId[t.identity!.personId]
          return {
            label: t.identity!.label,
            personId: t.identity!.personId,
            similarity: t.identity!.similarity,
            graphRelationshipTypeToSelf: edge?.relationshipType ?? null,
          }
        })
      setIdentifiedPeople(identified)

      const now = Date.now()
      for (const track of tracksRef.current) {
        if (track.identity && sessionIdRef.current) {
          if (now - track.lastEncounterLogAt > ENCOUNTER_LOG_COOLDOWN_MS) {
            track.lastEncounterLogAt = now
            window.emoryApi.encounter.log(track.identity.personId, track.identity.similarity).catch(() => {})

            addEvent({
              type: 'recognition',
              personName: track.identity.label,
              similarity: track.identity.similarity,
              details: 'Identified in live feed',
            })
          }
        } else if (!track.identity && track.unknownStreak >= IDENTITY_UNLOCK_VOTES) {
          if (now - track.lastUnknownTrackAt > UNKNOWN_TRACK_COOLDOWN_MS) {
            track.lastUnknownTrackAt = now
            window.emoryApi.unknown.track(
              `unknown-track-${track.id}`,
              [],
              track.score,
            ).catch(() => {})
          }
        }
      }
    } catch {
      // Identification failed silently
    } finally {
      identifyInFlightRef.current = false
      setIsProcessing(false)
    }
  }, [captureFrame, frameWidth, frameHeight, setMatches, setIsProcessing])

  const runDetection = useCallback(async () => {
    if (detectInFlightRef.current) return
    const frameData = captureFrame()
    if (!frameData) return
    const w = frameWidth
    const h = frameHeight
    if (w <= 0 || h <= 0) return

    detectInFlightRef.current = true
    try {
      const result = await window.emoryApi.face.detectOnly(frameData, w, h)
      setDetections(result.detections)
      setProcessingTimeMs(result.processingTimeMs)

      const now = Date.now()
      const { matched, unmatchedDets } = matchDetectionsToTracks(result.detections, tracksRef.current)

      for (const [di, ti] of matched) {
        const det = result.detections[di]
        const track = tracksRef.current[ti]
        track.target = { x: det.bbox.x, y: det.bbox.y, w: det.bbox.width, h: det.bbox.height }
        track.score = det.score
        track.lastSeenAt = now
      }

      let hasNewUnidentified = false
      for (const di of unmatchedDets) {
        const det = result.detections[di]
        const rect = { x: det.bbox.x, y: det.bbox.y, w: det.bbox.width, h: det.bbox.height }
        tracksRef.current.push({
          id: nextTrackId++,
          current: { ...rect },
          target: rect,
          score: det.score,
          lastSeenAt: now,
          identity: null,
          identityLockedAt: 0,
          identityVotes: [],
          unknownStreak: 0,
          lastAutoLearnAt: 0,
          confusedUntil: 0,
          lastEncounterLogAt: 0,
          lastUnknownTrackAt: 0,
        })
        hasNewUnidentified = true
      }

      // Also check for existing tracks that lost their identity
      if (!hasNewUnidentified) {
        hasNewUnidentified = tracksRef.current.some((t) => !t.identity && now - t.lastSeenAt < 300)
      }

      // Trigger immediate identification when unidentified faces appear
      if (hasNewUnidentified) {
        urgentIdentifyRef.current = true
      }

      tracksRef.current = tracksRef.current.filter((t) => now - t.lastSeenAt < TRACK_EXPIRY_MS)

      frameCountRef.current++
      const elapsed = performance.now() - fpsTimerRef.current
      if (elapsed >= 1000) {
        setFpsCount(Math.round((frameCountRef.current * 1000) / elapsed))
        frameCountRef.current = 0
        fpsTimerRef.current = performance.now()
      }
    } catch {
      // Detection failed silently
    } finally {
      detectInFlightRef.current = false
    }
  }, [captureFrame, frameWidth, frameHeight, setDetections, setFpsCount, setProcessingTimeMs])

  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    const ctx = overlay.getContext('2d')
    if (!ctx) return

    const vw = frameWidth > 0 ? frameWidth : 640
    const vh = frameHeight > 0 ? frameHeight : 480

    if (overlay.width !== vw) overlay.width = vw
    if (overlay.height !== vh) overlay.height = vh

    ctx.clearRect(0, 0, vw, vh)
    const { showBoundingBoxes, showConfidence, showLandmarks } = useSettingsStore.getState()

    for (const track of tracksRef.current) {
      track.current.x = lerp(track.current.x, track.target.x, LERP_SPEED)
      track.current.y = lerp(track.current.y, track.target.y, LERP_SPEED)
      track.current.w = lerp(track.current.w, track.target.w, LERP_SPEED)
      track.current.h = lerp(track.current.h, track.target.h, LERP_SPEED)

      const { x, y, w, h } = track.current
      const isTrackConfused = Date.now() < track.confusedUntil
      const label = isTrackConfused
        ? '?'
        : track.identity
          ? showConfidence
            ? `${track.identity.label} (${(track.identity.similarity * 100).toFixed(0)}%)`
            : track.identity.label
          : 'Unknown'
      const colour = isTrackConfused ? '#facc15' : track.identity?.colour ?? '#a3a3a3'

      const age = Date.now() - track.lastSeenAt
      const alpha = age > 500 ? Math.max(0.2, 1 - (age - 500) / TRACK_EXPIRY_MS) : 1
      ctx.globalAlpha = alpha

      if (showBoundingBoxes) {
        ctx.strokeStyle = colour
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, w, h)

        ctx.font = 'bold 13px system-ui, sans-serif'
        const textWidth = ctx.measureText(label).width
        const labelH = 22
        const labelY = y > labelH + 4 ? y - labelH - 2 : y + h + 2

        ctx.fillStyle = colour
        ctx.globalAlpha = alpha * 0.85
        ctx.beginPath()
        ctx.roundRect(x, labelY, textWidth + 12, labelH, 4)
        ctx.fill()

        ctx.globalAlpha = alpha
        ctx.fillStyle = track.identity ? '#0a0a0a' : '#fafafa'
        ctx.fillText(label, x + 6, labelY + 15)
      }

      if (showLandmarks) {
        ctx.fillStyle = '#60a5fa'
        ctx.globalAlpha = alpha * 0.8
        const dotR = 2.5
        const cx = x + w / 2
        const cy = y + h / 2
        const spread = w * 0.2
        for (const pt of [
          [cx - spread, cy - h * 0.1],
          [cx + spread, cy - h * 0.1],
          [cx, cy + h * 0.05],
          [cx - spread * 0.7, cy + h * 0.2],
          [cx + spread * 0.7, cy + h * 0.2],
        ]) {
          ctx.beginPath()
          ctx.arc(pt[0], pt[1], dotR, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    ctx.globalAlpha = 1
  }, [frameWidth, frameHeight])

  useEffect(() => {
    if (!feedReady) return

    let running = true
    const settings = useSettingsStore.getState()

    window.emoryApi.encounter.startSession().then((result) => {
      sessionIdRef.current = result?.success ? result.session.id : null
    }).catch(() => {})

    const detectLoop = async (): Promise<void> => {
      while (running) {
        await runDetection()

        if (urgentIdentifyRef.current && !identifyInFlightRef.current) {
          urgentIdentifyRef.current = false
          runIdentification()
        }

        await new Promise((r) => setTimeout(r, settings.detectCooldownMs))
      }
    }

    const renderLoop = (): void => {
      if (!running) return
      drawOverlay()
      rafIdRef.current = requestAnimationFrame(renderLoop)
    }

    detectLoop()
    const identifyTimer = setInterval(runIdentification, settings.identifyIntervalMs)
    rafIdRef.current = requestAnimationFrame(renderLoop)

    return () => {
      running = false
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current)
      clearInterval(identifyTimer)
      tracksRef.current = []

      if (sessionIdRef.current) {
        window.emoryApi.encounter.endSession().catch(() => {})
        sessionIdRef.current = null
      }
    }
  }, [feedReady, runDetection, runIdentification, drawOverlay])

  const switchToLocal = (): void => {
    setPreferLocalOverride(true)
    stop()
  }

  const switchToRemote = (): void => {
    setPreferLocalOverride(false)
    stop()
  }

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-y-auto p-4">
      <div className="relative overflow-hidden rounded-lg border border-border shadow-lg">
        {mode === 'remote' && remoteTransport === 'webrtc' ? (
          <video
            ref={webRtcVideoRef}
            className="max-h-[calc(100vh-10rem)] bg-muted"
            muted
            playsInline
            autoPlay
            aria-label="Remote WebRTC camera preview"
          />
        ) : mode === 'remote' ? (
          <canvas
            ref={previewCanvasRef}
            className="block max-h-[calc(100vh-10rem)] w-auto max-w-full bg-muted"
            aria-label="Remote camera preview"
          />
        ) : (
          <video ref={videoRef} className="max-h-[calc(100vh-10rem)] bg-muted" muted playsInline />
        )}
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" />
        {mode === 'local' ? <canvas ref={canvasRef} className="hidden" /> : null}
        {mode === 'remote' && remoteTransport === 'webrtc' ? (
          <canvas ref={webRtcCaptureCanvasRef} className="hidden" />
        ) : null}

        {isActive && autoLearnCount > 0 && (
          <div className="absolute top-3 right-3 z-10">
            <Badge variant="secondary" className="gap-1 text-[10px]">
              <GraduationCap className="h-3 w-3" />
              {autoLearnCount} learned
            </Badge>
          </div>
        )}
      </div>

      {mode === 'remote' && isActive && remotePhase === 'waiting_publisher' && (
        <p className="max-w-md text-center text-sm text-muted-foreground" role="status">
          Remote ingest connected — waiting for the phone app to publish video (
          <code className="font-mono-ui text-xs">?role=publisher</code> or omit role on WebSocket).
        </p>
      )}
      {mode === 'remote' && isActive && remotePhase === 'connecting' && (
        <p className="text-sm text-muted-foreground" role="status">
          Connecting to remote ingest…
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {conversationError && (
        <p className="text-sm text-destructive" role="status">
          Conversation audio: {conversationError}
        </p>
      )}
      {isActive && (
        <p className="text-muted-foreground text-xs" role="status">
          {cameraLabel ? (
            <>
              <span className="opacity-80">Camera: {cameraLabel}</span>
              <br />
            </>
          ) : null}
          {!conversationError ? (
            <>
              Conversation capture:{' '}
              {conversationPhase === 'idle' && 'waiting for a recognised face'}
              {conversationPhase === 'arming' && 'arming…'}
              {conversationPhase === 'recording' && 'recording'}
              {conversationMicLabel ? (
                <>
                  <br />
                  <span className="opacity-80">Mic: {conversationMicLabel}</span>
                </>
              ) : null}
            </>
          ) : null}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {!isActive ? (
          <Button onClick={() => void start()} size="lg">
            <Camera />
            {mode === 'remote' && remoteTransport === 'webrtc'
              ? 'Start remote camera (WebRTC)'
              : mode === 'remote'
                ? 'Start remote camera (JPEG)'
                : 'Start camera'}
          </Button>
        ) : (
          <>
            <Button variant="destructive" onClick={stop} size="lg">
              <CameraOff />
              Stop
            </Button>
            <WhoIsThisButton identifiedPeople={identifiedPeople} />
          </>
        )}
        {remoteIngestAvailable && mode === 'remote' ? (
          <Button type="button" variant="outline" size="lg" onClick={switchToLocal}>
            <MonitorSmartphone className="h-4 w-4" />
            Use computer camera
          </Button>
        ) : null}
        {remoteIngestAvailable && preferLocalOverride ? (
          <Button type="button" variant="outline" size="lg" onClick={switchToRemote}>
            <MonitorSmartphone className="h-4 w-4" />
            Use phone / glasses feed
          </Button>
        ) : null}
        <Button
          variant={showMemoryQueryPanel ? 'secondary' : 'outline'}
          size="lg"
          onClick={() => setShowMemoryQueryPanel((current) => !current)}
        >
          <MessageSquareText />
          {showMemoryQueryPanel ? 'Hide Query Simulator' : 'Show Query Simulator'}
        </Button>
      </div>

      {showMemoryQueryPanel ? <MemoryQueryPanel /> : null}
    </div>
  )
}

async function triggerAutoLearn(
  frameData: ArrayBuffer,
  width: number,
  height: number,
  personId: string,
  track: FaceTrack,
  margin: number,
): Promise<boolean> {
  try {
    const extracted = await window.emoryApi.face.extractEmbedding(frameData, width, height)
    if (!extracted) return false

    let thumbnailBase64: string | undefined
    try {
      const canvas = document.createElement('canvas')
      canvas.width = 128
      canvas.height = 128
      const ctx = canvas.getContext('2d')
      if (ctx) {
        const imgData = new ImageData(new Uint8ClampedArray(frameData), width, height)
        const srcCanvas = document.createElement('canvas')
        srcCanvas.width = width
        srcCanvas.height = height
        srcCanvas.getContext('2d')?.putImageData(imgData, 0, 0)
        const bbox = extracted.bbox
        ctx.drawImage(srcCanvas, bbox.x, bbox.y, bbox.width, bbox.height, 0, 0, 128, 128)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        thumbnailBase64 = dataUrl.split(',')[1]
      }
    } catch {
      // Thumbnail capture failed, proceed without
    }

    const result = await window.emoryApi.face.autoLearn(personId, extracted.embedding, margin, thumbnailBase64)
    if (result.learned) {
      track.lastAutoLearnAt = Date.now()
      return true
    }
    return false
  } catch {
    return false
  }
}
