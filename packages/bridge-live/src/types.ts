/** Wire format for server → iOS `face_result` JSON (matches bridge-server protocol). */
export type FaceMatchResult = {
  personId: string
  name: string
  relationship?: string
  similarity: number
  bbox: { x: number; y: number; width: number; height: number }
}

export type FrameResult = {
  matches: FaceMatchResult[]
  unknowns: number
  processingMs: number
  timestamp: number
}
