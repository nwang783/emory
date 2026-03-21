import { create } from 'zustand'

type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

type FaceDetectionResult = {
  bbox: { x: number; y: number; width: number; height: number }
  landmarks: {
    leftEye: { x: number; y: number }
    rightEye: { x: number; y: number }
    nose: { x: number; y: number }
    leftMouth: { x: number; y: number }
    rightMouth: { x: number; y: number }
  }
  score: number
}

type FaceMatchResult = {
  personId: string
  personName: string
  similarity: number
  bbox: { x: number; y: number; width: number; height: number }
  landmarks: FaceDetectionResult['landmarks']
}

type FaceState = {
  detections: FaceDetectionResult[]
  matches: FaceMatchResult[]
  isProcessing: boolean
  fpsCount: number
  modelStatus: ModelStatus
  error: string | null
  processingTimeMs: number
}

type FaceActions = {
  setDetections: (detections: FaceDetectionResult[]) => void
  setMatches: (matches: FaceMatchResult[]) => void
  setIsProcessing: (isProcessing: boolean) => void
  setFpsCount: (fps: number) => void
  setModelStatus: (status: ModelStatus) => void
  setError: (error: string | null) => void
  setProcessingTimeMs: (ms: number) => void
  reset: () => void
}

const initialState: FaceState = {
  detections: [],
  matches: [],
  isProcessing: false,
  fpsCount: 0,
  modelStatus: 'idle',
  error: null,
  processingTimeMs: 0,
}

export const useFaceStore = create<FaceState & FaceActions>((set) => ({
  ...initialState,

  setDetections: (detections) => set({ detections }),
  setMatches: (matches) => set({ matches }),
  setIsProcessing: (isProcessing) => set({ isProcessing }),
  setFpsCount: (fpsCount) => set({ fpsCount }),
  setModelStatus: (modelStatus) => set({ modelStatus }),
  setError: (error) => set({ error }),
  setProcessingTimeMs: (processingTimeMs) => set({ processingTimeMs }),
  reset: () => set(initialState),
}))
