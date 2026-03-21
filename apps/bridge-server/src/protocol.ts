// MARK: - Wire Protocol Types
// Binary messages: iOS → Server
// JSON messages: Server → iOS

// Binary message type IDs (first 4 bytes of binary message)
export const MSG_VIDEO_FRAME = 1
export const MSG_AUDIO_CHUNK = 2
export const MSG_SESSION_START = 3
export const MSG_SESSION_END = 4

// Metadata embedded in binary messages (JSON after the 8-byte header)
export interface FrameMetadata {
  ts: number   // Unix timestamp (seconds)
  w: number    // Width
  h: number    // Height
}

export interface AudioChunkMetadata {
  ts: number   // Unix timestamp
  dur: number  // Duration in samples
  sr: number   // Sample rate
  ch: number   // Channels
}

// Server → iOS (JSON text messages)
export interface FaceMatchResult {
  personId: string
  name: string
  relationship?: string
  similarity: number
  bbox: { x: number; y: number; width: number; height: number }
}

export interface FaceResultMessage {
  type: 'face_result'
  ts: number
  matches: FaceMatchResult[]
  unknowns: number
  ms: number
}

export interface TranscriptMessage {
  type: 'transcript'
  personId: string
  text: string
  memories: { text: string; type?: string }[]
}

export interface StatusMessage {
  type: 'status'
  ready: boolean
  faceReady: boolean
  peopleCount: number
}

export interface ErrorMessage {
  type: 'error'
  message: string
}

export type OutgoingMessage = FaceResultMessage | TranscriptMessage | StatusMessage | ErrorMessage

// Parse a binary message from iOS
export function parseBinaryMessage(data: Buffer): {
  messageType: number
  metadata: Record<string, unknown>
  payload: Buffer
} | null {
  if (data.length < 8) return null

  const messageType = data.readUInt32LE(0)
  const metadataLength = data.readUInt32LE(4)

  if (data.length < 8 + metadataLength) return null

  const metadataStr = data.subarray(8, 8 + metadataLength).toString('utf-8')
  let metadata: Record<string, unknown> = {}
  try {
    metadata = JSON.parse(metadataStr || '{}')
  } catch {
    // Empty metadata is fine for session_start/end
  }

  const payload = data.subarray(8 + metadataLength)
  return { messageType, metadata, payload }
}
