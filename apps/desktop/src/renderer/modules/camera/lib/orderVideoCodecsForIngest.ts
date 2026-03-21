/**
 * WebRTC ingest (desktop = viewer): codec ordering and transceiver mapping.
 * Encoding happens on the mobile publisher; we bias negotiation toward codecs that decode
 * efficiently in Chromium and work well for low-latency glass/phone video.
 */

function mimeBase(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase()
}

/**
 * Reorders receiver capabilities so H.264 (hardware-friendly on many devices) is tried first,
 * then VP8 / VP9 / AV1, then any remaining codecs (unchanged relative order within each bucket).
 */
export function orderVideoCodecsForIngest(codecs: RTCRtpCodecCapability[]): RTCRtpCodecCapability[] {
  const h264: RTCRtpCodecCapability[] = []
  const vp8: RTCRtpCodecCapability[] = []
  const vp9: RTCRtpCodecCapability[] = []
  const av1: RTCRtpCodecCapability[] = []
  const other: RTCRtpCodecCapability[] = []

  for (const c of codecs) {
    const base = mimeBase(c.mimeType)
    if (base === 'video/h264') {
      h264.push(c)
    } else if (base === 'video/vp8') {
      vp8.push(c)
    } else if (base === 'video/vp9') {
      vp9.push(c)
    } else if (base === 'video/av1') {
      av1.push(c)
    } else {
      other.push(c)
    }
  }

  return [...h264, ...vp8, ...vp9, ...av1, ...other]
}

/**
 * Maps each `m=video` line in remote SDP to the transceiver index (unified plan: transceivers
 * are ordered by m-line appearance).
 */
export function transceiverIndicesForVideoMlines(sdp: string): number[] {
  const indices: number[] = []
  let mIndex = 0
  for (const line of sdp.split(/\r?\n/)) {
    if (line.startsWith('m=')) {
      if (line.startsWith('m=video')) {
        indices.push(mIndex)
      }
      mIndex += 1
    }
  }
  return indices
}

/**
 * After `setRemoteDescription(offer)`, before `createAnswer()`, prefer realtime-friendly
 * video decode order on each video m-line. No-op if API missing or negotiation fails.
 */
export function applyIngestVideoCodecPreferences(pc: RTCPeerConnection): boolean {
  if (typeof RTCRtpReceiver.getCapabilities !== 'function') {
    return false
  }
  const caps = RTCRtpReceiver.getCapabilities('video')
  if (!caps?.codecs?.length) {
    return false
  }
  const ordered = orderVideoCodecsForIngest(caps.codecs)
  const sdp = pc.remoteDescription?.sdp
  if (!sdp) {
    return false
  }
  const transceivers = pc.getTransceivers()
  const videoIndices = transceiverIndicesForVideoMlines(sdp)
  let applied = false
  for (const i of videoIndices) {
    const t = transceivers[i]
    if (!t || t.stopped) {
      continue
    }
    try {
      t.setCodecPreferences(ordered)
      applied = true
    } catch {
      // Browser may reject if the list is not a strict subset of capabilities
    }
  }
  return applied
}
