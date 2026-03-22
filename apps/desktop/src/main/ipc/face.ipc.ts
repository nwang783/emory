import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import sharp from 'sharp'
import { FaceService, ensureModels, validateEmbedding } from '@emory/core'
import type { FaceProcessingResult, KnownFaceEntry, FaceDetection, AutoLearnResult } from '@emory/core'
import type { PeopleRepository } from '@emory/db'

const AUTO_LEARN_MAX_EMBEDDINGS = 20
const AUTO_LEARN_MAX_AUTO = 15
const AUTO_LEARN_DIVERSITY_THRESHOLD = 0.85
const AUTO_LEARN_COOLDOWN_MS = 10_000
const AUTO_LEARN_MIN_MARGIN = 0.06
const AUTO_LEARN_VERIFY_THRESHOLD = 0.45
const SIMILAR_FACE_WARNING_THRESHOLD = 0.55
const autoLearnTimestamps = new Map<string, number>()

let faceService: FaceService | null = null

/** Main-process FaceService for remote ingest / bridge-live pipeline (null until `face:initialize` succeeds). */
export function getMainFaceService(): FaceService | null {
  return faceService
}
let activeDetectionThreshold = 0.35
let activeMatchThreshold = 0.45
let faceInitializationPromise: Promise<{ success: boolean; error?: string; provider?: string }> | null = null

export async function disposeFaceService(): Promise<void> {
  if (faceService) {
    await faceService.dispose()
    faceService = null
  }
}

function buildKnownEntries(peopleRepo: PeopleRepository): KnownFaceEntry[] {
  const allEmbeddings = peopleRepo.getAllEmbeddings()
  return allEmbeddings.map((e) => ({
    personId: e.personId,
    personName: e.personName,
    embedding: e.embedding,
  }))
}

export function registerFaceIpc(
  _mainWindow: BrowserWindow,
  modelsDir: string,
  peopleRepo: PeopleRepository,
): void {
  ipcMain.handle(
    'face:update-thresholds',
    (_event, detectionThreshold: number, matchThreshold: number): void => {
      activeDetectionThreshold = detectionThreshold
      activeMatchThreshold = matchThreshold
      console.log(`[face] Thresholds updated: detection=${detectionThreshold}, match=${matchThreshold}`)
    },
  )

  ipcMain.handle('face:initialize', async (): Promise<{ success: boolean; error?: string; provider?: string }> => {
    if (faceService) {
      return { success: true, provider: faceService.getActiveProvider() }
    }

    if (!faceInitializationPromise) {
      faceInitializationPromise = (async () => {
        try {
          await ensureModels(modelsDir, (modelName, percent) => {
            console.log(`[face:initialize] Downloading ${modelName}: ${percent}%`)
          })
          faceService = new FaceService(modelsDir)
          await faceService.initialize()
          return { success: true, provider: faceService.getActiveProvider() }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          console.error('[face:initialize] Failed:', message)
          return { success: false, error: message }
        } finally {
          faceInitializationPromise = null
        }
      })()
    }

    return faceInitializationPromise
  })

  ipcMain.handle(
    'face:detect-only',
    async (
      _event,
      frameBytes: Uint8Array,
      width: number,
      height: number,
    ): Promise<{ detections: FaceDetection[]; processingTimeMs: number }> => {
      if (!faceService) {
        return { detections: [], processingTimeMs: 0 }
      }

      const start = performance.now()
      try {
        const imageBuffer = Buffer.from(frameBytes)
        const detections = await faceService.detectFaces(imageBuffer, width, height, 4, activeDetectionThreshold)
        return { detections, processingTimeMs: performance.now() - start }
      } catch {
        return { detections: [], processingTimeMs: performance.now() - start }
      }
    },
  )

  ipcMain.handle(
    'face:process-frame',
    async (
      _event,
      frameBytes: Uint8Array,
      width: number,
      height: number,
    ): Promise<FaceProcessingResult> => {
      if (!faceService) {
        return { detections: [], matches: [], unknownFaces: [], processingTimeMs: 0 }
      }

      const start = performance.now()
      const imageBuffer = Buffer.from(frameBytes)

      let detections: FaceDetection[]
      try {
        detections = await faceService.detectFaces(imageBuffer, width, height, 4, activeDetectionThreshold)
      } catch {
        return { detections: [], matches: [], unknownFaces: [], processingTimeMs: performance.now() - start }
      }

      const knownEntries = buildKnownEntries(peopleRepo)
      const matches: FaceProcessingResult['matches'] = []
      const unknownFaces: FaceProcessingResult['unknownFaces'] = []

      for (const detection of detections) {
        try {
          const embedding = await faceService.extractEmbedding(imageBuffer, width, height, detection)
          const match = faceService.findBestMatch(embedding, knownEntries, activeMatchThreshold)

          if (match) {
            matches.push({
              ...match,
              bbox: detection.bbox,
              landmarks: detection.landmarks,
            })
            peopleRepo.updateLastSeen(match.personId)
          } else {
            unknownFaces.push({
              bbox: detection.bbox,
              landmarks: detection.landmarks,
              embedding,
            })
          }
        } catch {
          // Skip faces with embedding extraction errors
        }
      }

      return { detections, matches, unknownFaces, processingTimeMs: performance.now() - start }
    },
  )

  ipcMain.handle(
    'face:register',
    async (
      _event,
      personId: string,
      imageBytes: Uint8Array,
      width: number,
      height: number,
      source: 'photo_upload' | 'live_capture',
    ): Promise<{
      success: boolean
      embeddingId?: string
      error?: string
      similarWarning?: {
        similarPersonId: string
        similarPersonName: string
        similarity: number
      }
    }> => {
      if (!faceService) {
        return { success: false, error: 'Face service not initialized' }
      }

      try {
        const imageBuffer = Buffer.from(imageBytes)
        const detections: FaceDetection[] = await faceService.detectFaces(imageBuffer, width, height)

        if (detections.length === 0) {
          return { success: false, error: 'No face detected in the image' }
        }

        const primaryFace = detections[0]
        const embedding = await faceService.extractEmbedding(imageBuffer, width, height, primaryFace)

        const knownEntries = buildKnownEntries(peopleRepo)
        let similarWarning:
          | { similarPersonId: string; similarPersonName: string; similarity: number }
          | undefined

        const personBest = new Map<string, { similarity: number; name: string }>()
        for (const entry of knownEntries) {
          if (entry.personId === personId) continue
          const sim = FaceService.cosineSimilarity(embedding, entry.embedding)
          const existing = personBest.get(entry.personId)
          if (!existing || sim > existing.similarity) {
            personBest.set(entry.personId, { similarity: sim, name: entry.personName })
          }
        }

        for (const [pid, data] of personBest) {
          if (data.similarity >= SIMILAR_FACE_WARNING_THRESHOLD) {
            similarWarning = {
              similarPersonId: pid,
              similarPersonName: data.name,
              similarity: data.similarity,
            }
            console.log(
              `[face:register] Warning: new face similar to ${data.name} (${(data.similarity * 100).toFixed(1)}%)`,
            )
            break
          }
        }

        let thumbnailBase64: string | undefined
        try {
          const cropX = Math.max(0, Math.round(primaryFace.bbox.x))
          const cropY = Math.max(0, Math.round(primaryFace.bbox.y))
          const cropW = Math.max(1, Math.min(Math.round(primaryFace.bbox.width), width - cropX))
          const cropH = Math.max(1, Math.min(Math.round(primaryFace.bbox.height), height - cropY))
          const thumbBuffer = await sharp(imageBuffer, { raw: { width, height, channels: 4 } })
            .extract({ left: cropX, top: cropY, width: cropW, height: cropH })
            .resize(128, 128, { fit: 'cover' })
            .jpeg({ quality: 80 })
            .toBuffer()
          thumbnailBase64 = thumbBuffer.toString('base64')
        } catch {
          // Thumbnail generation failed, proceed without it
        }

        const qualityScore = validateEmbedding(embedding).qualityScore
        const saved = peopleRepo.addEmbedding(personId, embedding, source, thumbnailBase64, qualityScore)
        return { success: true, embeddingId: saved.id, similarWarning }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error('[face:register] Failed:', message)
        return { success: false, error: message }
      }
    },
  )

  ipcMain.handle(
    'face:auto-learn',
    async (
      _event,
      personId: string,
      embeddingData: number[],
      margin?: number,
      thumbnailBase64?: string,
    ): Promise<AutoLearnResult> => {
      if (!faceService) {
        return { learned: false, personId, reason: 'error' }
      }

      try {
        const now = Date.now()
        const lastLearn = autoLearnTimestamps.get(personId) ?? 0
        if (now - lastLearn < AUTO_LEARN_COOLDOWN_MS) {
          return { learned: false, personId, reason: 'cooldown' }
        }

        if (margin !== undefined && margin < AUTO_LEARN_MIN_MARGIN) {
          console.log(`[face:auto-learn] Rejected for ${personId}: margin ${(margin * 100).toFixed(1)}% < ${(AUTO_LEARN_MIN_MARGIN * 100).toFixed(1)}%`)
          return { learned: false, personId, reason: 'low_margin' }
        }

        const newEmbedding = new Float32Array(embeddingData)

        const validation = validateEmbedding(newEmbedding)
        if (!validation.valid) {
          return { learned: false, personId, reason: 'error' }
        }

        if (validation.qualityScore < 0.5) {
          return { learned: false, personId, reason: 'too_similar' }
        }

        const existingEmbeddings = peopleRepo.getEmbeddings(personId)

        // Identity verification: ensure embedding actually matches this person
        if (existingEmbeddings.length > 0) {
          let bestSelfSimilarity = 0
          for (const existing of existingEmbeddings) {
            const sim = FaceService.cosineSimilarity(newEmbedding, existing.embedding)
            if (sim > bestSelfSimilarity) bestSelfSimilarity = sim
          }
          if (bestSelfSimilarity < AUTO_LEARN_VERIFY_THRESHOLD) {
            console.log(`[face:auto-learn] Rejected for ${personId}: identity mismatch (best self-similarity: ${(bestSelfSimilarity * 100).toFixed(1)}%)`)
            return { learned: false, personId, reason: 'identity_mismatch' }
          }
        }

        const autoEmbeddings = existingEmbeddings.filter((e) => e.source === 'auto_learn')
        const manualEmbeddings = existingEmbeddings.filter((e) => e.source !== 'auto_learn')

        for (const existing of manualEmbeddings) {
          const similarity = FaceService.cosineSimilarity(newEmbedding, existing.embedding)
          if (similarity > AUTO_LEARN_DIVERSITY_THRESHOLD) {
            return { learned: false, personId, reason: 'too_similar' }
          }
        }

        const autoLearnDiversityThreshold = AUTO_LEARN_DIVERSITY_THRESHOLD - 0.05
        for (const existing of autoEmbeddings) {
          const similarity = FaceService.cosineSimilarity(newEmbedding, existing.embedding)
          if (similarity > autoLearnDiversityThreshold) {
            return { learned: false, personId, reason: 'too_similar' }
          }
        }

        const totalCount = peopleRepo.countEmbeddings(personId)
        const autoCount = peopleRepo.countEmbeddingsBySource(personId, 'auto_learn')

        if (autoCount >= AUTO_LEARN_MAX_AUTO) {
          peopleRepo.deleteOldestEmbeddingBySource(personId, 'auto_learn')
          peopleRepo.addEmbedding(personId, newEmbedding, 'auto_learn', thumbnailBase64, validation.qualityScore)
          autoLearnTimestamps.set(personId, now)
          console.log(`[face:auto-learn] Replaced oldest auto embedding for ${personId}`)
          return { learned: true, personId, reason: 'replaced_oldest' }
        }

        if (totalCount >= AUTO_LEARN_MAX_EMBEDDINGS) {
          return { learned: false, personId, reason: 'max_reached' }
        }

        peopleRepo.addEmbedding(personId, newEmbedding, 'auto_learn', thumbnailBase64, validation.qualityScore)
        autoLearnTimestamps.set(personId, now)
        console.log(`[face:auto-learn] Stored new embedding for ${personId} (total: ${totalCount + 1})`)
        return { learned: true, personId, reason: 'stored' }
      } catch (err) {
        console.error('[face:auto-learn] Failed:', err instanceof Error ? err.message : String(err))
        return { learned: false, personId, reason: 'error' }
      }
    },
  )

  ipcMain.handle(
    'face:extract-embedding',
    async (
      _event,
      frameBytes: Uint8Array,
      width: number,
      height: number,
    ): Promise<{ embedding: number[]; bbox: { x: number; y: number; width: number; height: number } } | null> => {
      if (!faceService) return null

      try {
        const imageBuffer = Buffer.from(frameBytes)
        const detections = await faceService.detectFaces(imageBuffer, width, height)
        if (detections.length === 0) return null

        const primary = detections[0]
        const embedding = await faceService.extractEmbedding(imageBuffer, width, height, primary)
        return { embedding: Array.from(embedding), bbox: primary.bbox }
      } catch {
        return null
      }
    },
  )

  ipcMain.handle(
    'face:get-embedding-count',
    (_event, personId: string): number => {
      return peopleRepo.countEmbeddings(personId)
    },
  )
}
