/** Binary message type IDs (first 4 bytes LE). Keep in sync with `apps/bridge-server/src/protocol.ts`. */

export const MSG_VIDEO_FRAME = 1
export const MSG_AUDIO_CHUNK = 2
export const MSG_SESSION_START = 3
export const MSG_SESSION_END = 4

export type FrameMetadata = {
  ts?: number
  w?: number
  h?: number
}

export type ParsedBinaryMessage = {
  messageType: number
  metadata: Record<string, unknown>
  /** JPEG bytes for MSG_VIDEO_FRAME */
  payload: Uint8Array
}

/**
 * Parse bridge-style binary WebSocket messages (Node Buffer or browser ArrayBuffer/Uint8Array).
 */
export function parseBinaryMessage(data: Uint8Array): ParsedBinaryMessage | null {
  if (data.length < 8) return null

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const messageType = view.getUint32(0, true)
  const metadataLength = view.getUint32(4, true)

  if (metadataLength < 0 || data.length < 8 + metadataLength) return null

  const metaStart = 8
  const metaEnd = metaStart + metadataLength
  const metadataStr = new TextDecoder().decode(data.subarray(metaStart, metaEnd))

  let metadata: Record<string, unknown> = {}
  try {
    metadata = metadataStr ? (JSON.parse(metadataStr) as Record<string, unknown>) : {}
  } catch {
    metadata = {}
  }

  const payload = data.subarray(metaEnd)
  return { messageType, metadata, payload }
}
