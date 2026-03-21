import * as ort from 'onnxruntime-node'
import sharp from 'sharp'
import path from 'node:path'

import type {
  FaceDetection,
  FaceMatch,
  BoundingBox,
  FaceLandmarks,
  KnownFaceEntry,
} from '../types/face.js'

const SCRFD_INPUT_SIZE = 640
const ARCFACE_INPUT_SIZE = 112
const DETECTION_THRESHOLD = 0.35
const NMS_THRESHOLD = 0.4
const DEFAULT_MATCH_THRESHOLD = 0.45
const STRIDES = [8, 16, 32] as const
const FEAT_MAP_SIZES = STRIDES.map((s) => Math.floor(SCRFD_INPUT_SIZE / s))
const PIXEL_MEAN = 127.5
const PIXEL_SCALE = 128.0
// FACE_CROP_MARGIN removed: using landmark-based alignment instead

// Standard 5-point alignment template for 112x112 ArcFace input
// Used for full affine alignment (Phase 0 uses simpler crop+resize)
export const ARCFACE_TEMPLATE: ReadonlyArray<[number, number]> = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
]

export class ModelLoadError extends Error {
  constructor(
    public readonly modelName: string,
    cause: unknown,
  ) {
    super(`Failed to load model "${modelName}": ${cause instanceof Error ? cause.message : String(cause)}`)
    this.name = 'ModelLoadError'
  }
}

export class FaceService {
  private scrfdSession: ort.InferenceSession | null = null
  private arcfaceSession: ort.InferenceSession | null = null
  private readonly modelsDir: string
  private activeProvider: string = 'cpu'

  constructor(modelsDir: string) {
    this.modelsDir = modelsDir
  }

  private async createSession(modelPath: string): Promise<ort.InferenceSession> {
    // DirectML (GPU via DirectX 12) with CPU fallback
    const providers: Array<{ name: string; label: string }> = [
      { name: 'dml', label: 'DirectML (GPU)' },
      { name: 'cpu', label: 'CPU' },
    ]

    for (const { name, label } of providers) {
      try {
        const session = await ort.InferenceSession.create(modelPath, {
          executionProviders: [name],
        })
        this.activeProvider = label
        return session
      } catch {
        console.warn(`[FaceService] ${label} provider not available, trying next...`)
      }
    }

    throw new Error(`No execution provider available for ${modelPath}`)
  }

  getActiveProvider(): string {
    return this.activeProvider
  }

  async initialize(): Promise<void> {
    const scrfdPath = path.join(this.modelsDir, 'det_10g.onnx')
    const arcfacePath = path.join(this.modelsDir, 'w600k_r50.onnx')

    const scrfdStart = performance.now()
    try {
      this.scrfdSession = await this.createSession(scrfdPath)
    } catch (err) {
      throw new ModelLoadError('det_10g.onnx (SCRFD)', err)
    }
    const scrfdMs = (performance.now() - scrfdStart).toFixed(1)
    console.log(`[FaceService] SCRFD model loaded in ${scrfdMs}ms [${this.activeProvider}]`)

    const arcfaceStart = performance.now()
    try {
      this.arcfaceSession = await this.createSession(arcfacePath)
    } catch (err) {
      throw new ModelLoadError('w600k_r50.onnx (ArcFace)', err)
    }
    const arcfaceMs = (performance.now() - arcfaceStart).toFixed(1)
    console.log(`[FaceService] ArcFace model loaded in ${arcfaceMs}ms [${this.activeProvider}]`)
  }

  isInitialized(): boolean {
    return this.scrfdSession !== null && this.arcfaceSession !== null
  }

  async dispose(): Promise<void> {
    if (this.scrfdSession) {
      await this.scrfdSession.release()
      this.scrfdSession = null
    }
    if (this.arcfaceSession) {
      await this.arcfaceSession.release()
      this.arcfaceSession = null
    }
    console.log('[FaceService] Disposed ONNX sessions')
  }

  async detectFaces(
    imageBuffer: Buffer,
    width: number,
    height: number,
    channels: 3 | 4 = 4,
    detectionThreshold?: number,
  ): Promise<FaceDetection[]> {
    if (!this.scrfdSession) {
      throw new Error('FaceService not initialized — call initialize() first')
    }

    const { tensor, scaleX, scaleY } = await this.preprocessForScrfd(imageBuffer, width, height, channels)
    const inputName = this.scrfdSession.inputNames[0]
    const feeds: Record<string, ort.Tensor> = { [inputName]: tensor }
    const results = await this.scrfdSession.run(feeds)

    const grouped = groupScrfdOutputs(results)

    const allDetections: Array<{ bbox: BoundingBox; landmarks: FaceLandmarks; score: number }> = []

    for (let strideIdx = 0; strideIdx < STRIDES.length; strideIdx++) {
      const stride = STRIDES[strideIdx]
      const featSize = FEAT_MAP_SIZES[strideIdx]

      const group = grouped[strideIdx]
      const scoresData = group.scores
      const bboxData = group.bboxes
      const landmarkData = group.landmarks

      const numAnchors = 2

      for (let row = 0; row < featSize; row++) {
        for (let col = 0; col < featSize; col++) {
          for (let anchor = 0; anchor < numAnchors; anchor++) {
            const idx = (row * featSize + col) * numAnchors + anchor
            const score = scoresData[idx]
            const threshold = detectionThreshold ?? DETECTION_THRESHOLD

            if (score < threshold) continue

            const anchorCx = col * stride
            const anchorCy = row * stride

            const bboxOffset = idx * 4
            const rawX1 = (anchorCx - bboxData[bboxOffset] * stride) * scaleX
            const rawY1 = (anchorCy - bboxData[bboxOffset + 1] * stride) * scaleY
            const rawX2 = (anchorCx + bboxData[bboxOffset + 2] * stride) * scaleX
            const rawY2 = (anchorCy + bboxData[bboxOffset + 3] * stride) * scaleY

            const x1 = Math.max(0, Math.min(rawX1, width))
            const y1 = Math.max(0, Math.min(rawY1, height))
            const x2 = Math.max(0, Math.min(rawX2, width))
            const y2 = Math.max(0, Math.min(rawY2, height))

            const bboxW = x2 - x1
            const bboxH = y2 - y1
            if (bboxW < 1 || bboxH < 1) continue

            const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(v, hi))
            const lmOffset = idx * 10
            const landmarks: FaceLandmarks = {
              leftEye: {
                x: clamp((anchorCx + landmarkData[lmOffset] * stride) * scaleX, 0, width),
                y: clamp((anchorCy + landmarkData[lmOffset + 1] * stride) * scaleY, 0, height),
              },
              rightEye: {
                x: clamp((anchorCx + landmarkData[lmOffset + 2] * stride) * scaleX, 0, width),
                y: clamp((anchorCy + landmarkData[lmOffset + 3] * stride) * scaleY, 0, height),
              },
              nose: {
                x: clamp((anchorCx + landmarkData[lmOffset + 4] * stride) * scaleX, 0, width),
                y: clamp((anchorCy + landmarkData[lmOffset + 5] * stride) * scaleY, 0, height),
              },
              leftMouth: {
                x: clamp((anchorCx + landmarkData[lmOffset + 6] * stride) * scaleX, 0, width),
                y: clamp((anchorCy + landmarkData[lmOffset + 7] * stride) * scaleY, 0, height),
              },
              rightMouth: {
                x: clamp((anchorCx + landmarkData[lmOffset + 8] * stride) * scaleX, 0, width),
                y: clamp((anchorCy + landmarkData[lmOffset + 9] * stride) * scaleY, 0, height),
              },
            }

            allDetections.push({
              bbox: { x: x1, y: y1, width: bboxW, height: bboxH },
              landmarks,
              score,
            })
          }
        }
      }
    }

    return nms(allDetections, NMS_THRESHOLD)
  }

  async extractEmbedding(
    imageBuffer: Buffer,
    width: number,
    height: number,
    detection: FaceDetection,
    channels: 3 | 4 = 4,
  ): Promise<Float32Array> {
    if (!this.arcfaceSession) {
      throw new Error('FaceService not initialized — call initialize() first')
    }

    const tensor = await this.preprocessForArcface(imageBuffer, width, height, detection, channels)
    const inputName = this.arcfaceSession.inputNames[0]
    const feeds: Record<string, ort.Tensor> = { [inputName]: tensor }
    const results = await this.arcfaceSession.run(feeds)
    const outputName = Object.keys(results)[0]
    const rawEmbedding = results[outputName].data as Float32Array

    return l2Normalize(rawEmbedding)
  }

  static cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB)
    if (denom === 0) return 0
    return dot / denom
  }

  findBestMatch(
    embedding: Float32Array,
    knownEmbeddings: ReadonlyArray<KnownFaceEntry>,
    threshold: number = DEFAULT_MATCH_THRESHOLD,
  ): FaceMatch | null {
    const personBest = new Map<string, { similarity: number; entry: KnownFaceEntry }>()

    for (const entry of knownEmbeddings) {
      const similarity = FaceService.cosineSimilarity(embedding, entry.embedding)
      const existing = personBest.get(entry.personId)
      if (!existing || similarity > existing.similarity) {
        personBest.set(entry.personId, { similarity, entry })
      }
    }

    const sorted = Array.from(personBest.values()).sort((a, b) => b.similarity - a.similarity)

    if (sorted.length === 0 || sorted[0].similarity < threshold) return null

    const best = sorted[0]
    const secondBest = sorted.length > 1 ? sorted[1].similarity : -1
    const matchMargin = secondBest >= 0 ? best.similarity - secondBest : best.similarity

    return {
      personId: best.entry.personId,
      personName: best.entry.personName,
      similarity: best.similarity,
      matchMargin,
      bbox: { x: 0, y: 0, width: 0, height: 0 },
      landmarks: {
        leftEye: { x: 0, y: 0 },
        rightEye: { x: 0, y: 0 },
        nose: { x: 0, y: 0 },
        leftMouth: { x: 0, y: 0 },
        rightMouth: { x: 0, y: 0 },
      },
    }
  }

  findTopMatches(
    embedding: Float32Array,
    knownEmbeddings: ReadonlyArray<KnownFaceEntry>,
    topN: number = 3,
    threshold: number = DEFAULT_MATCH_THRESHOLD,
  ): Array<{ personId: string; personName: string; similarity: number }> {
    const personBest = new Map<string, { similarity: number; name: string }>()

    for (const entry of knownEmbeddings) {
      const similarity = FaceService.cosineSimilarity(embedding, entry.embedding)
      const existing = personBest.get(entry.personId)
      if (!existing || similarity > existing.similarity) {
        personBest.set(entry.personId, { similarity, name: entry.personName })
      }
    }

    return Array.from(personBest.entries())
      .map(([personId, { similarity, name }]) => ({ personId, personName: name, similarity }))
      .filter((m) => m.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topN)
  }

  // --- Private preprocessing ---

  private async preprocessForScrfd(
    imageBuffer: Buffer,
    width: number,
    height: number,
    channels: 3 | 4,
  ): Promise<{ tensor: ort.Tensor; scaleX: number; scaleY: number }> {
    const maxDim = Math.max(width, height)
    const scaleToInput = SCRFD_INPUT_SIZE / maxDim

    const resizedW = Math.round(width * scaleToInput)
    const resizedH = Math.round(height * scaleToInput)

    const paddedBuffer = await sharp(imageBuffer, { raw: { width, height, channels } })
      .resize(resizedW, resizedH, { fit: 'fill' })
      .extend({
        top: 0,
        bottom: SCRFD_INPUT_SIZE - resizedH,
        left: 0,
        right: SCRFD_INPUT_SIZE - resizedW,
        background: { r: 0, g: 0, b: 0 },
      })
      .removeAlpha()
      .raw()
      .toBuffer()

    const pixelCount = SCRFD_INPUT_SIZE * SCRFD_INPUT_SIZE
    const float32 = new Float32Array(3 * pixelCount)

    // InsightFace models expect BGR channel order (trained with OpenCV)
    for (let i = 0; i < pixelCount; i++) {
      float32[i] = (paddedBuffer[i * 3 + 2] - PIXEL_MEAN) / PIXEL_SCALE
      float32[pixelCount + i] = (paddedBuffer[i * 3 + 1] - PIXEL_MEAN) / PIXEL_SCALE
      float32[2 * pixelCount + i] = (paddedBuffer[i * 3] - PIXEL_MEAN) / PIXEL_SCALE
    }

    const tensor = new ort.Tensor('float32', float32, [1, 3, SCRFD_INPUT_SIZE, SCRFD_INPUT_SIZE])

    const scaleX = maxDim / SCRFD_INPUT_SIZE
    const scaleY = maxDim / SCRFD_INPUT_SIZE

    return { tensor, scaleX, scaleY }
  }

  private async preprocessForArcface(
    imageBuffer: Buffer,
    width: number,
    height: number,
    detection: FaceDetection,
    channels: 3 | 4,
  ): Promise<ort.Tensor> {
    const srcPoints: Array<[number, number]> = [
      [detection.landmarks.leftEye.x, detection.landmarks.leftEye.y],
      [detection.landmarks.rightEye.x, detection.landmarks.rightEye.y],
      [detection.landmarks.nose.x, detection.landmarks.nose.y],
      [detection.landmarks.leftMouth.x, detection.landmarks.leftMouth.y],
      [detection.landmarks.rightMouth.x, detection.landmarks.rightMouth.y],
    ]

    const transform = estimateSimTransform(srcPoints, ARCFACE_TEMPLATE)

    const rgbBuffer = await sharp(imageBuffer, { raw: { width, height, channels } })
      .removeAlpha()
      .raw()
      .toBuffer()

    const pixelCount = ARCFACE_INPUT_SIZE * ARCFACE_INPUT_SIZE
    const float32 = new Float32Array(3 * pixelCount)
    const det = transform.a * transform.a + transform.b * transform.b

    for (let v = 0; v < ARCFACE_INPUT_SIZE; v++) {
      for (let u = 0; u < ARCFACE_INPUT_SIZE; u++) {
        const du = u - transform.tx
        const dv = v - transform.ty
        const srcX = (transform.a * du + transform.b * dv) / det
        const srcY = (-transform.b * du + transform.a * dv) / det

        const x0 = Math.floor(srcX)
        const y0 = Math.floor(srcY)
        const fx = srcX - x0
        const fy = srcY - y0

        let r = 0, g = 0, b = 0
        for (let dy = 0; dy <= 1; dy++) {
          for (let dx = 0; dx <= 1; dx++) {
            const px = Math.max(0, Math.min(width - 1, x0 + dx))
            const py = Math.max(0, Math.min(height - 1, y0 + dy))
            const w = (dx === 0 ? 1 - fx : fx) * (dy === 0 ? 1 - fy : fy)
            const idx = (py * width + px) * 3
            r += rgbBuffer[idx] * w
            g += rgbBuffer[idx + 1] * w
            b += rgbBuffer[idx + 2] * w
          }
        }

        // BGR order for InsightFace
        const outIdx = v * ARCFACE_INPUT_SIZE + u
        float32[outIdx] = (b - PIXEL_MEAN) / PIXEL_SCALE
        float32[pixelCount + outIdx] = (g - PIXEL_MEAN) / PIXEL_SCALE
        float32[2 * pixelCount + outIdx] = (r - PIXEL_MEAN) / PIXEL_SCALE
      }
    }

    return new ort.Tensor('float32', float32, [1, 3, ARCFACE_INPUT_SIZE, ARCFACE_INPUT_SIZE])
  }
}

// --- Utility functions ---

type StrideGroup = {
  scores: Float32Array
  bboxes: Float32Array
  landmarks: Float32Array
  anchorCount: number
}

function groupScrfdOutputs(results: ort.InferenceSession.OnnxValueMapType): StrideGroup[] {
  const entries = Object.entries(results).map(([name, tensor]) => ({
    name,
    data: tensor.data as Float32Array,
    dims: tensor.dims as readonly number[],
    lastDim: (tensor.dims as readonly number[])[(tensor.dims as readonly number[]).length - 1],
    elements: (tensor.data as Float32Array).length,
  }))

  // Identify by last dimension: scores=1, bboxes=4, landmarks=10
  const scoreTensors = entries.filter((e) => e.lastDim === 1).sort((a, b) => b.elements - a.elements)
  const bboxTensors = entries.filter((e) => e.lastDim === 4).sort((a, b) => b.elements - a.elements)
  const landmarkTensors = entries.filter((e) => e.lastDim === 10).sort((a, b) => b.elements - a.elements)

  if (scoreTensors.length !== 3 || bboxTensors.length !== 3 || landmarkTensors.length !== 3) {
    console.error(
      '[SCRFD] Unexpected output structure:',
      entries.map((e) => `${e.name}: dims=${JSON.stringify(e.dims)}, elements=${e.elements}`),
    )
    throw new Error(`SCRFD model has unexpected outputs: expected 9 (3 scores, 3 bboxes, 3 landmarks), got ${entries.length}`)
  }

  return STRIDES.map((_, i) => ({
    scores: scoreTensors[i].data,
    bboxes: bboxTensors[i].data,
    landmarks: landmarkTensors[i].data,
    anchorCount: scoreTensors[i].elements,
  }))
}

function estimateSimTransform(
  src: ReadonlyArray<[number, number]>,
  dst: ReadonlyArray<[number, number]>,
): { a: number; b: number; tx: number; ty: number } {
  const n = src.length

  let srcMx = 0, srcMy = 0, dstMx = 0, dstMy = 0
  for (let i = 0; i < n; i++) {
    srcMx += src[i][0]; srcMy += src[i][1]
    dstMx += dst[i][0]; dstMy += dst[i][1]
  }
  srcMx /= n; srcMy /= n; dstMx /= n; dstMy /= n

  let numA = 0, numB = 0, den = 0
  for (let i = 0; i < n; i++) {
    const sx = src[i][0] - srcMx
    const sy = src[i][1] - srcMy
    const dx = dst[i][0] - dstMx
    const dy = dst[i][1] - dstMy

    numA += sx * dx + sy * dy
    numB += sx * dy - sy * dx
    den += sx * sx + sy * sy
  }

  const a = numA / den
  const b = numB / den
  const tx = dstMx - a * srcMx + b * srcMy
  const ty = dstMy - b * srcMx - a * srcMy

  return { a, b, tx, ty }
}

function l2Normalize(vec: Float32Array): Float32Array {
  let sumSq = 0
  for (let i = 0; i < vec.length; i++) {
    sumSq += vec[i] * vec[i]
  }
  const norm = Math.sqrt(sumSq)
  if (norm === 0) return vec

  const result = new Float32Array(vec.length)
  for (let i = 0; i < vec.length; i++) {
    result[i] = vec[i] / norm
  }
  return result
}

function iou(a: BoundingBox, b: BoundingBox): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.width, b.x + b.width)
  const y2 = Math.min(a.y + a.height, b.y + b.height)

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const areaA = a.width * a.height
  const areaB = b.width * b.height
  const union = areaA + areaB - intersection

  return union > 0 ? intersection / union : 0
}

function nms(
  detections: FaceDetection[],
  threshold: number,
): FaceDetection[] {
  const sorted = [...detections].sort((a, b) => b.score - a.score)
  const kept: FaceDetection[] = []
  const suppressed = new Set<number>()

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue
    kept.push(sorted[i])

    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue
      if (iou(sorted[i].bbox, sorted[j].bbox) > threshold) {
        suppressed.add(j)
      }
    }
  }

  return kept
}
