import { useCallback, useEffect, useRef, useState } from 'react'
import { applyIngestVideoCodecPreferences } from '../lib/orderVideoCodecsForIngest'
import { logRemoteIngest, logRemoteIngestTerminal } from '@/modules/camera/lib/remote-ingest-debug'

const HEARTBEAT_MS = 5000
const BOUNCE_SIGNALING_STALL_MS = 5000
const SIG_PING_DEADLINE_MS = 4000

/** Public STUN for NAT traversal; Tailscale paths often still benefit. */
const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  /** Single port for RTP/RTCP reduces setup latency on tailnet paths. */
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
}

const REMOTE_LABEL = 'Phone / glasses (WebRTC)'

export type RemoteIngestWebRtcPhase =
  | 'idle'
  | 'signaling'
  | 'negotiating'
  | 'streaming'
  | 'error'

type SigMessage =
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit | null }

type UseRemoteIngestWebRtcArgs = {
  armed: boolean
  host: string | null
  port: number
}

export type UseRemoteIngestWebRtcResult = {
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  isActive: boolean
  phase: RemoteIngestWebRtcPhase
  error: string | null
  cameraLabel: string | null
  start: () => Promise<void>
  stop: () => void
  captureFrame: () => ArrayBuffer | null
  frameWidth: number
  frameHeight: number
}

export function useRemoteIngestWebRtc({
  armed,
  host,
  port,
}: UseRemoteIngestWebRtcArgs): UseRemoteIngestWebRtcResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const sessionRef = useRef(0)

  const [phase, setPhase] = useState<RemoteIngestWebRtcPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [frameWidth, setFrameWidth] = useState(640)
  const [frameHeight, setFrameHeight] = useState(480)

  const pendingIceRef = useRef<RTCIceCandidateInit[]>([])

  const phaseRef = useRef<RemoteIngestWebRtcPhase>('idle')
  const signalingOpenedAtRef = useRef<number | null>(null)
  const signalingSessionRef = useRef(0)
  const startRef = useRef<() => Promise<void>>(async () => {})
  const pingSeqRef = useRef(0)
  const outstandingSigPingSeqRef = useRef<number | null>(null)
  const outstandingSigDeadlineRef = useRef<number | null>(null)
  const awaitingSigRelaySeqRef = useRef<number | null>(null)
  const sigRelayDeadlineRef = useRef<number | null>(null)

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  const closePeer = useCallback((): void => {
    pendingIceRef.current = []
    const pc = pcRef.current
    pcRef.current = null
    if (pc) {
      pc.ontrack = null
      pc.onicecandidate = null
      pc.onconnectionstatechange = null
      try {
        pc.close()
      } catch {
        // ignore
      }
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

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
    sessionRef.current += 1
    closeSocket()
    closePeer()
    signalingOpenedAtRef.current = null
    pingSeqRef.current = 0
    outstandingSigPingSeqRef.current = null
    outstandingSigDeadlineRef.current = null
    awaitingSigRelaySeqRef.current = null
    sigRelayDeadlineRef.current = null
    setPhase('idle')
    setError(null)
    setFrameWidth(640)
    setFrameHeight(480)
  }, [closePeer, closeSocket])

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

  const drainPendingIce = useCallback(async (pc: RTCPeerConnection): Promise<void> => {
    const pending = pendingIceRef.current
    pendingIceRef.current = []
    for (const c of pending) {
      if (c?.candidate) {
        try {
          await pc.addIceCandidate(c)
        } catch {
          // ignore invalid candidate
        }
      }
    }
  }, [])

  const handleSignalingMessage = useCallback(
    async (text: string, pc: RTCPeerConnection, ws: WebSocket, session: number): Promise<void> => {
      if (sessionRef.current !== session) return
      let msg: SigMessage
      try {
        msg = JSON.parse(text) as SigMessage
      } catch {
        return
      }

      if (msg.type === 'ice') {
        if (!msg.candidate?.candidate) return
        if (!pc.remoteDescription) {
          pendingIceRef.current.push(msg.candidate)
          return
        }
        try {
          await pc.addIceCandidate(msg.candidate)
        } catch {
          // ignore
        }
        return
      }

      if (msg.type === 'offer' && typeof msg.sdp === 'string') {
        if (sessionRef.current !== session) return
        setPhase('negotiating')
        try {
          await pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp })
          await drainPendingIce(pc)
          applyIngestVideoCodecPreferences(pc)
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          if (sessionRef.current !== session) return
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'answer', sdp: answer.sdp } satisfies SigMessage))
          }
        } catch (e) {
          if (sessionRef.current === session) {
            setError(e instanceof Error ? e.message : 'WebRTC negotiation failed')
            setPhase('error')
          }
        }
      }
    },
    [drainPendingIce],
  )

  const start = useCallback(async (): Promise<void> => {
    if (!armed || !host) return

    stop()
    const session = sessionRef.current
    setError(null)
    setPhase('signaling')

    const pc = new RTCPeerConnection(RTC_CONFIGURATION)
    pcRef.current = pc

    pc.ontrack = (ev: RTCTrackEvent): void => {
      if (sessionRef.current !== session) return
      const stream = ev.streams[0]
      const v = videoRef.current
      if (v && stream) {
        v.srcObject = stream
        void v.play().catch(() => {})
      }
      setPhase('streaming')
    }

    pc.onicecandidate = (ev: RTCPeerConnectionIceEvent): void => {
      if (sessionRef.current !== session) return
      const ws = wsRef.current
      if (!ws || ws.readyState !== WebSocket.OPEN) return
      const payload: SigMessage = {
        type: 'ice',
        candidate: ev.candidate ? ev.candidate.toJSON() : null,
      }
      ws.send(JSON.stringify(payload))
    }

    pc.onconnectionstatechange = (): void => {
      if (sessionRef.current !== session) return
      const st = pc.connectionState
      if (st === 'failed') {
        setError('WebRTC connection failed')
        setPhase('error')
      }
    }

    const url = `ws://${host}:${port}/signaling?role=desktop`
    logRemoteIngest('webrtc_sig_start', { url, host, port })
    const ws = new WebSocket(url)
    wsRef.current = ws
    signalingSessionRef.current = session
    signalingOpenedAtRef.current = null

    ws.onopen = (): void => {
      if (sessionRef.current !== session) return
      signalingOpenedAtRef.current = Date.now()
      logRemoteIngest('webrtc_sig_open', { url })
      setPhase('signaling')
    }

    ws.onmessage = (ev: MessageEvent<string>): void => {
      if (sessionRef.current !== session) return
      const text = String(ev.data)
      let control: { type?: string; seq?: number; mobileConnected?: boolean }
      try {
        control = JSON.parse(text) as { type?: string; seq?: number; mobileConnected?: boolean }
      } catch {
        void handleSignalingMessage(text, pc, ws, session)
        return
      }
      if (control.type === 'emory_sig_pong') {
        if (outstandingSigPingSeqRef.current === control.seq) {
          outstandingSigPingSeqRef.current = null
          outstandingSigDeadlineRef.current = null
        }
        logRemoteIngest('webrtc_sig_pong', {
          seq: control.seq ?? null,
          mobileConnected: control.mobileConnected ?? null,
        })
        if (control.mobileConnected === true) {
          awaitingSigRelaySeqRef.current = typeof control.seq === 'number' ? control.seq : null
          sigRelayDeadlineRef.current = Date.now() + SIG_PING_DEADLINE_MS
        } else {
          awaitingSigRelaySeqRef.current = null
          sigRelayDeadlineRef.current = null
        }
        return
      }
      if (control.type === 'emory_sig_pong_relay') {
        if (awaitingSigRelaySeqRef.current === control.seq) {
          awaitingSigRelaySeqRef.current = null
          sigRelayDeadlineRef.current = null
        }
        logRemoteIngest('webrtc_sig_pong_relay', { seq: control.seq ?? null })
        return
      }
      void handleSignalingMessage(text, pc, ws, session)
    }

    ws.onerror = (): void => {
      if (sessionRef.current !== session) return
      logRemoteIngestTerminal({
        action: 'webrtc_signaling_socket_error',
        host,
        port,
      })
      logRemoteIngest('webrtc_sig_socket_error', { url })
      setError('WebRTC signaling WebSocket error')
      setPhase('error')
    }

    ws.onclose = (): void => {
      if (sessionRef.current !== session) return
      logRemoteIngest('webrtc_sig_close', {})
      if (wsRef.current === ws) {
        wsRef.current = null
      }
      setPhase((p) => (p === 'idle' ? 'idle' : 'error'))
      setError((prev) => prev ?? 'WebRTC signaling closed')
    }
  }, [armed, host, port, stop, handleSignalingMessage])

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
      const openedAt = signalingOpenedAtRef.current
      const activeSession = signalingSessionRef.current

      logRemoteIngest('webrtc_sig_heartbeat', {
        phase: p,
        readyState: rs ?? null,
        host,
        port,
        msSinceSigOpen: openedAt ? now - openedAt : null,
      })

      const osd = outstandingSigDeadlineRef.current
      const osq = outstandingSigPingSeqRef.current
      if (osq !== null && osd !== null && now > osd) {
        logRemoteIngestTerminal({
          action: 'sig_ping_timeout',
          transport: 'webrtc-signaling',
          seq: osq,
          host,
          port,
          phase: p,
        })
        logRemoteIngest('webrtc_sig_ping_timeout', { seq: osq })
        outstandingSigPingSeqRef.current = null
        outstandingSigDeadlineRef.current = null
      }

      const srd = sigRelayDeadlineRef.current
      const asr = awaitingSigRelaySeqRef.current
      if (asr !== null && srd !== null && now > srd) {
        logRemoteIngestTerminal({
          action: 'sig_phone_relay_timeout',
          transport: 'webrtc-signaling',
          seq: asr,
          host,
          port,
          hint: 'Mobile signaling socket connected but no emory_sig_pong_relay (implement on iOS /signaling client).',
        })
        logRemoteIngest('webrtc_sig_relay_timeout', { seq: asr })
        awaitingSigRelaySeqRef.current = null
        sigRelayDeadlineRef.current = null
      }

      if (
        sessionRef.current === activeSession &&
        ws &&
        rs === WebSocket.OPEN &&
        p !== 'idle' &&
        p !== 'error' &&
        outstandingSigPingSeqRef.current === null
      ) {
        const seq = pingSeqRef.current + 1
        pingSeqRef.current = seq
        outstandingSigPingSeqRef.current = seq
        outstandingSigDeadlineRef.current = now + SIG_PING_DEADLINE_MS
        try {
          ws.send(JSON.stringify({ type: 'emory_sig_ping', seq }))
        } catch (e) {
          outstandingSigPingSeqRef.current = null
          outstandingSigDeadlineRef.current = null
          logRemoteIngestTerminal({
            action: 'sig_ping_send_failed',
            transport: 'webrtc-signaling',
            seq,
            host,
            port,
            message: e instanceof Error ? e.message : String(e),
          })
        }
      }

      if (
        sessionRef.current === activeSession &&
        (p === 'signaling' || p === 'negotiating') &&
        ws &&
        openedAt &&
        now - openedAt >= BOUNCE_SIGNALING_STALL_MS
      ) {
        logRemoteIngestTerminal({
          action: 'webrtc_sig_bounce',
          reason: 'signaling_stall',
          host,
          port,
          phase: p,
          msSinceOpen: now - openedAt,
        })
        logRemoteIngest('webrtc_sig_bounce', { reason: 'signaling_stall', msSinceOpen: now - openedAt })
        void startRef.current()
      }
    }, HEARTBEAT_MS)
    return () => window.clearInterval(id)
  }, [armed, host, port])

  const captureFrame = useCallback((): ArrayBuffer | null => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || phase !== 'streaming') return null

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    const w = video.videoWidth
    const h = video.videoHeight
    if (w <= 0 || h <= 0) return null

    canvas.width = w
    canvas.height = h
    ctx.drawImage(video, 0, 0)
    const imageData = ctx.getImageData(0, 0, w, h)
    return imageData.data.buffer
  }, [phase])

  useEffect(() => {
    if (phase !== 'streaming') return
    const v = videoRef.current
    if (!v) return

    const sync = (): void => {
      const w = v.videoWidth
      const h = v.videoHeight
      if (w > 0 && h > 0) {
        setFrameWidth(w)
        setFrameHeight(h)
      }
    }
    v.addEventListener('loadedmetadata', sync)
    sync()
    return () => {
      v.removeEventListener('loadedmetadata', sync)
    }
  }, [phase])

  const isActive = phase === 'signaling' || phase === 'negotiating' || phase === 'streaming'

  return {
    videoRef,
    canvasRef,
    isActive,
    phase,
    error,
    cameraLabel: phase === 'streaming' || phase === 'negotiating' ? REMOTE_LABEL : null,
    start,
    stop,
    captureFrame,
    frameWidth,
    frameHeight,
  }
}
