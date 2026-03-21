export type Point = {
  x: number
  y: number
}

export type BoundingBox = {
  x: number
  y: number
  width: number
  height: number
}

export type FaceLandmarks = {
  leftEye: Point
  rightEye: Point
  nose: Point
  leftMouth: Point
  rightMouth: Point
}

export type FaceDetection = {
  bbox: BoundingBox
  landmarks: FaceLandmarks
  score: number
}

export type FaceMatch = {
  personId: string
  personName: string
  similarity: number
  matchMargin: number
  bbox: BoundingBox
  landmarks: FaceLandmarks
}

export type FaceProcessingResult = {
  detections: FaceDetection[]
  matches: FaceMatch[]
  unknownFaces: Array<{
    bbox: BoundingBox
    landmarks: FaceLandmarks
    embedding: Float32Array
  }>
  processingTimeMs: number
}

export type KnownFaceEntry = {
  personId: string
  personName: string
  embedding: Float32Array
}

export type AutoLearnResult = {
  learned: boolean
  personId: string
  reason:
    | 'stored'
    | 'too_similar'
    | 'cooldown'
    | 'max_reached'
    | 'replaced_oldest'
    | 'low_margin'
    | 'identity_mismatch'
    | 'low_quality'
    | 'error'
}
