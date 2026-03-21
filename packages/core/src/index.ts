export { FaceService, ModelLoadError, ARCFACE_TEMPLATE } from './services/face.service.js'
export { ensureModels, downloadModel, ModelDownloadError } from './services/model-downloader.service.js'
export { QualityService } from './services/quality.service.js'
export type { FrameQualityResult } from './services/quality.service.js'
export { validateEmbedding } from './services/embedding-validator.service.js'
export type { EmbeddingValidationResult } from './services/embedding-validator.service.js'
export { gradeIdentity } from './services/graded-identity.service.js'
export type { IdentityGrade, GradedIdentityResult } from './services/graded-identity.service.js'
export { AppearanceService } from './services/appearance.service.js'
export type { EmbeddingCluster, AppearanceShiftResult } from './services/appearance.service.js'
export { LivenessService } from './services/liveness.service.js'
export type { LivenessResult, LivenessCheck } from './services/liveness.service.js'
export type {
  Point,
  BoundingBox,
  FaceLandmarks,
  FaceDetection,
  FaceMatch,
  FaceProcessingResult,
  KnownFaceEntry,
  AutoLearnResult,
} from './types/face.js'
