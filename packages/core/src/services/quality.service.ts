import sharp from 'sharp'

export type FrameQualityResult = {
  blurScore: number
  brightness: number
  faceToFrameRatio: number
  estimatedYaw: number
  estimatedPitch: number
  overallScore: number
  reasons: string[]
}

type QualityThresholds = {
  minBlurScore: number
  minBrightness: number
  maxBrightness: number
  minFaceRatio: number
  maxYaw: number
  maxPitch: number
}

const DEFAULT_THRESHOLDS: QualityThresholds = {
  minBlurScore: 15,
  minBrightness: 40,
  maxBrightness: 240,
  minFaceRatio: 0.02,
  maxYaw: 45,
  maxPitch: 35,
}

export class QualityService {
  private thresholds: QualityThresholds

  constructor(thresholds?: Partial<QualityThresholds>) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds }
  }

  async assessFrameQuality(
    imageBuffer: Buffer,
    width: number,
    height: number,
    faceBbox: { x: number; y: number; width: number; height: number },
    landmarks?: { leftEye: { x: number; y: number }; rightEye: { x: number; y: number }; nose: { x: number; y: number } },
    channels: 3 | 4 = 4,
  ): Promise<FrameQualityResult> {
    const reasons: string[] = []

    const faceToFrameRatio = (faceBbox.width * faceBbox.height) / (width * height)

    const cropX = Math.max(0, Math.round(faceBbox.x))
    const cropY = Math.max(0, Math.round(faceBbox.y))
    const cropW = Math.max(1, Math.min(Math.round(faceBbox.width), width - cropX))
    const cropH = Math.max(1, Math.min(Math.round(faceBbox.height), height - cropY))

    const faceCrop = await sharp(imageBuffer, { raw: { width, height, channels } })
      .removeAlpha()
      .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
      .greyscale()
      .raw()
      .toBuffer()

    const blurScore = computeLaplacianVariance(faceCrop, cropW, cropH)
    const brightness = computeMeanBrightness(faceCrop)

    let estimatedYaw = 0
    let estimatedPitch = 0
    if (landmarks) {
      const faceCenter = { x: faceBbox.x + faceBbox.width / 2, y: faceBbox.y + faceBbox.height / 2 }
      const noseOffset = {
        x: (landmarks.nose.x - faceCenter.x) / (faceBbox.width / 2),
        y: (landmarks.nose.y - faceCenter.y) / (faceBbox.height / 2),
      }
      estimatedYaw = Math.abs(noseOffset.x) * 90
      estimatedPitch = Math.abs(noseOffset.y) * 90

      const eyeAngle = Math.abs(
        Math.atan2(
          landmarks.rightEye.y - landmarks.leftEye.y,
          landmarks.rightEye.x - landmarks.leftEye.x,
        ) * (180 / Math.PI),
      )
      if (eyeAngle > 15) {
        estimatedYaw = Math.max(estimatedYaw, eyeAngle)
      }

      const eyeDistance = Math.sqrt(
        Math.pow(landmarks.rightEye.x - landmarks.leftEye.x, 2) +
        Math.pow(landmarks.rightEye.y - landmarks.leftEye.y, 2),
      )
      const eyeRatio = eyeDistance / faceBbox.width
      if (eyeRatio < 0.2) {
        estimatedYaw = Math.max(estimatedYaw, 60)
      }
    }

    if (blurScore < this.thresholds.minBlurScore) reasons.push('blurry')
    if (brightness < this.thresholds.minBrightness) reasons.push('too_dark')
    if (brightness > this.thresholds.maxBrightness) reasons.push('overexposed')
    if (faceToFrameRatio < this.thresholds.minFaceRatio) reasons.push('face_too_small')
    if (estimatedYaw > this.thresholds.maxYaw) reasons.push('extreme_yaw')
    if (estimatedPitch > this.thresholds.maxPitch) reasons.push('extreme_pitch')

    let overallScore = 1.0
    overallScore *= Math.min(1, blurScore / (this.thresholds.minBlurScore * 3))
    overallScore *= Math.min(1, faceToFrameRatio / (this.thresholds.minFaceRatio * 5))
    if (estimatedYaw > 0) overallScore *= Math.max(0, 1 - estimatedYaw / 90)
    if (estimatedPitch > 0) overallScore *= Math.max(0, 1 - estimatedPitch / 90)
    const brightnessPenalty = brightness < this.thresholds.minBrightness
      ? brightness / this.thresholds.minBrightness
      : brightness > this.thresholds.maxBrightness
        ? this.thresholds.maxBrightness / brightness
        : 1
    overallScore *= brightnessPenalty

    return {
      blurScore,
      brightness,
      faceToFrameRatio,
      estimatedYaw,
      estimatedPitch,
      overallScore: Math.max(0, Math.min(1, overallScore)),
      reasons,
    }
  }

  isAcceptable(quality: FrameQualityResult): boolean {
    return quality.reasons.length === 0
  }

  async applyHistogramEqualisation(
    imageBuffer: Buffer,
    width: number,
    height: number,
    channels: 3 | 4 = 4,
  ): Promise<Buffer> {
    return sharp(imageBuffer, { raw: { width, height, channels } })
      .removeAlpha()
      .normalize()
      .raw()
      .toBuffer()
  }
}

function computeLaplacianVariance(greyscaleBuffer: Buffer, width: number, height: number): number {
  let sum = 0
  let sumSq = 0
  let count = 0

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const laplacian =
        greyscaleBuffer[idx - width] +
        greyscaleBuffer[idx - 1] +
        greyscaleBuffer[idx + 1] +
        greyscaleBuffer[idx + width] -
        4 * greyscaleBuffer[idx]

      sum += laplacian
      sumSq += laplacian * laplacian
      count++
    }
  }

  if (count === 0) return 0
  const mean = sum / count
  return sumSq / count - mean * mean
}

function computeMeanBrightness(greyscaleBuffer: Buffer): number {
  let sum = 0
  for (let i = 0; i < greyscaleBuffer.length; i++) {
    sum += greyscaleBuffer[i]
  }
  return greyscaleBuffer.length > 0 ? sum / greyscaleBuffer.length : 128
}
