export type LivenessResult = {
  isLive: boolean
  confidence: number
  checks: LivenessCheck[]
}

export type LivenessCheck = {
  method: 'texture' | 'motion' | 'depth'
  passed: boolean
  score: number
  detail: string
}

type FrameHistory = {
  landmarks: Array<{ x: number; y: number }>
  timestamp: number
}

export class LivenessService {
  private frameHistory: Map<string, FrameHistory[]> = new Map()
  private readonly maxHistory = 10

  assessLiveness(
    faceRegionGrey: Buffer,
    faceWidth: number,
    faceHeight: number,
    trackId: string,
    landmarks?: Array<{ x: number; y: number }>,
  ): LivenessResult {
    const checks: LivenessCheck[] = []

    const textureCheck = this.checkTexture(faceRegionGrey, faceWidth, faceHeight)
    checks.push(textureCheck)

    if (landmarks) {
      const motionCheck = this.checkLandmarkMotion(trackId, landmarks)
      checks.push(motionCheck)
    }

    const depthCheck = this.checkDepthFromFocus(faceRegionGrey, faceWidth, faceHeight)
    checks.push(depthCheck)

    const passedCount = checks.filter((c) => c.passed).length
    const totalScore = checks.reduce((sum, c) => sum + c.score, 0) / checks.length
    const isLive = passedCount >= 2 && totalScore >= 0.5

    return { isLive, confidence: totalScore, checks }
  }

  clearHistory(trackId: string): void {
    this.frameHistory.delete(trackId)
  }

  clearAllHistory(): void {
    this.frameHistory.clear()
  }

  private checkTexture(faceGrey: Buffer, width: number, height: number): LivenessCheck {
    let highFreqEnergy = 0
    let totalEnergy = 0

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x
        const dx = Math.abs(faceGrey[idx + 1] - faceGrey[idx - 1])
        const dy = Math.abs(faceGrey[idx + width] - faceGrey[idx - width])
        const gradient = dx + dy
        totalEnergy += gradient

        if (x > 1 && x < width - 2) {
          const dx2 = Math.abs(faceGrey[idx + 2] - faceGrey[idx]) - Math.abs(faceGrey[idx + 1] - faceGrey[idx])
          if (Math.abs(dx2) > 20) highFreqEnergy += Math.abs(dx2)
        }
      }
    }

    const pixelCount = (width - 2) * (height - 2)
    const highFreqRatio = pixelCount > 0 && totalEnergy > 0 ? highFreqEnergy / totalEnergy : 0

    // Real faces have moderate texture; screens show high-frequency moiré
    // Photos on paper tend to have very low high-frequency content
    const isScreen = highFreqRatio > 0.4
    const isPaper = totalEnergy / pixelCount < 5

    const passed = !isScreen && !isPaper
    const score = passed ? Math.min(1, 1 - highFreqRatio) : highFreqRatio > 0.4 ? 0.2 : 0.3

    let detail = 'normal_texture'
    if (isScreen) detail = 'screen_moire_detected'
    if (isPaper) detail = 'flat_texture_detected'

    return { method: 'texture', passed, score, detail }
  }

  private checkLandmarkMotion(trackId: string, landmarks: Array<{ x: number; y: number }>): LivenessCheck {
    const now = Date.now()
    const history = this.frameHistory.get(trackId) ?? []

    history.push({ landmarks, timestamp: now })
    if (history.length > this.maxHistory) history.shift()
    this.frameHistory.set(trackId, history)

    if (history.length < 3) {
      return { method: 'motion', passed: true, score: 0.5, detail: 'insufficient_frames' }
    }

    // Real faces show micro-movements; photos are perfectly still
    let totalMotion = 0
    let frames = 0

    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1].landmarks
      const curr = history[i].landmarks
      const dt = history[i].timestamp - history[i - 1].timestamp

      if (dt > 2000) continue

      let frameMotion = 0
      const pairs = Math.min(prev.length, curr.length)
      for (let j = 0; j < pairs; j++) {
        const dx = curr[j].x - prev[j].x
        const dy = curr[j].y - prev[j].y
        frameMotion += Math.sqrt(dx * dx + dy * dy)
      }

      if (pairs > 0) {
        totalMotion += frameMotion / pairs
        frames++
      }
    }

    const avgMotion = frames > 0 ? totalMotion / frames : 0

    // Real faces: small but non-zero motion (micro-saccades, breathing)
    // Photo: near-zero motion unless hand-held
    const tooStill = avgMotion < 0.3
    const passed = !tooStill
    const score = tooStill ? 0.2 : Math.min(1, 0.5 + avgMotion * 0.1)

    return {
      method: 'motion',
      passed,
      score,
      detail: tooStill ? 'no_micro_movement' : `avg_motion=${avgMotion.toFixed(2)}`,
    }
  }

  private checkDepthFromFocus(faceGrey: Buffer, width: number, height: number): LivenessCheck {
    const midX = Math.floor(width / 2)
    const midY = Math.floor(height / 2)
    const regionSize = Math.max(4, Math.floor(Math.min(width, height) / 6))

    const centerSharpness = computeRegionSharpness(faceGrey, width, height, midX, midY, regionSize)
    const leftSharpness = computeRegionSharpness(faceGrey, width, height, Math.floor(width * 0.2), midY, regionSize)
    const rightSharpness = computeRegionSharpness(faceGrey, width, height, Math.floor(width * 0.8), midY, regionSize)
    const topSharpness = computeRegionSharpness(faceGrey, width, height, midX, Math.floor(height * 0.2), regionSize)
    const bottomSharpness = computeRegionSharpness(
      faceGrey,
      width,
      height,
      midX,
      Math.floor(height * 0.8),
      regionSize,
    )

    const sharpnessValues = [centerSharpness, leftSharpness, rightSharpness, topSharpness, bottomSharpness]
    const maxSharpness = Math.max(...sharpnessValues)
    const minSharpness = Math.min(...sharpnessValues)

    // Real faces show depth-of-field variation; flat surfaces are uniform
    const sharpnessRange = maxSharpness > 0 ? (maxSharpness - minSharpness) / maxSharpness : 0

    const tooUniform = sharpnessRange < 0.05
    const passed = !tooUniform
    const score = passed ? Math.min(1, 0.5 + sharpnessRange * 2) : 0.3

    return {
      method: 'depth',
      passed,
      score,
      detail: tooUniform ? 'uniform_sharpness' : `sharpness_range=${sharpnessRange.toFixed(3)}`,
    }
  }
}

function computeRegionSharpness(
  buffer: Buffer,
  width: number,
  height: number,
  cx: number,
  cy: number,
  size: number,
): number {
  const half = Math.floor(size / 2)
  let sumSq = 0
  let count = 0

  for (let y = Math.max(1, cy - half); y < Math.min(height - 1, cy + half); y++) {
    for (let x = Math.max(1, cx - half); x < Math.min(width - 1, cx + half); x++) {
      const idx = y * width + x
      const lap = buffer[idx - width] + buffer[idx - 1] + buffer[idx + 1] + buffer[idx + width] - 4 * buffer[idx]
      sumSq += lap * lap
      count++
    }
  }

  return count > 0 ? sumSq / count : 0
}
