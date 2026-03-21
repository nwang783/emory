import { describe, expect, test } from 'bun:test'
import { orderVideoCodecsForIngest, transceiverIndicesForVideoMlines } from './orderVideoCodecsForIngest'

function cap(mimeType: string, sdpFmtpLine?: string): RTCRtpCodecCapability {
  return {
    mimeType,
    clockRate: 90000,
    channels: undefined,
    sdpFmtpLine,
  }
}

describe('orderVideoCodecsForIngest', () => {
  test('orders H264 before VP8', () => {
    const ordered = orderVideoCodecsForIngest([cap('video/VP8'), cap('video/H264', 'packetization-mode=1')])
    expect(ordered[0].mimeType.toLowerCase().startsWith('video/h264')).toBe(true)
    expect(ordered[1].mimeType.toLowerCase().startsWith('video/vp8')).toBe(true)
  })

  test('preserves multiple H264 fmtp variants in relative order', () => {
    const a = cap('video/H264', 'profile-level-id=42e01f')
    const b = cap('video/H264', 'profile-level-id=640c1f')
    const ordered = orderVideoCodecsForIngest([b, a])
    expect(ordered[0]).toBe(b)
    expect(ordered[1]).toBe(a)
  })
})

describe('transceiverIndicesForVideoMlines', () => {
  test('single video after audio', () => {
    const sdp = [
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'a=mid:0',
      'm=video 9 UDP/TLS/RTP/SAVPF 96',
      'a=mid:1',
    ].join('\r\n')
    expect(transceiverIndicesForVideoMlines(sdp)).toEqual([1])
  })

  test('LF newlines', () => {
    const sdp = 'm=audio 9 UDP/TLS/RTP/SAVPF 0\nm=video 9 UDP/TLS/RTP/SAVPF 96'
    expect(transceiverIndicesForVideoMlines(sdp)).toEqual([1])
  })
})
