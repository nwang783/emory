import sharp from 'sharp'
import type { FaceService, FaceDetection, KnownFaceEntry } from '@emory/core'
import type { PeopleRepository } from '@emory/db'
import type { FaceMatchResult } from './protocol.js'

// MARK: - Frame Processor
// Newest-wins queue: always processes the most recent frame.
// Drops stale frames if a new one arrives during processing.

export class FrameProcessor {
  private faceService: FaceService | null = null
  private peopleRepo: PeopleRepository
  private pendingFrame: { jpeg: Buffer; width: number; height: number; timestamp: number } | null = null
  private processing = false
  private onResult: (result: FrameResult) => void
  private matchThreshold = 0.45
  private detectionThreshold = 0.35

  // Track currently visible people (for audio association)
  visiblePersonIds: Set<string> = new Set()
  private visibilityTimeout: Map<string, NodeJS.Timeout> = new Map()

  constructor(
    peopleRepo: PeopleRepository,
    onResult: (result: FrameResult) => void,
  ) {
    this.peopleRepo = peopleRepo
    this.onResult = onResult
  }

  setFaceService(service: FaceService): void {
    this.faceService = service
  }

  async enqueue(jpeg: Buffer, width: number, height: number, timestamp: number): Promise<void> {
    this.pendingFrame = { jpeg, width, height, timestamp }
    if (!this.processing) {
      await this.processNext()
    }
  }

  private async processNext(): Promise<void> {
    while (this.pendingFrame) {
      const frame = this.pendingFrame
      this.pendingFrame = null
      this.processing = true

      try {
        const result = await this.processFrame(frame.jpeg, frame.width, frame.height, frame.timestamp)
        this.onResult(result)
      } catch (err) {
        console.error('[FrameProcessor] Error:', err instanceof Error ? err.message : err)
      }
    }
    this.processing = false
  }

  private async processFrame(
    jpeg: Buffer,
    _hintWidth: number,
    _hintHeight: number,
    timestamp: number,
  ): Promise<FrameResult> {
    const start = performance.now()

    if (!this.faceService) {
      return { matches: [], unknowns: 0, processingMs: 0, timestamp }
    }

    // Decode JPEG to raw RGBA
    const decoded = await sharp(jpeg)
      .raw()
      .ensureAlpha()
      .toBuffer({ resolveWithObject: true })

    const { data: rgba, info } = decoded
    const width = info.width
    const height = info.height

    // Detect faces
    let detections: FaceDetection[]
    try {
      detections = await this.faceService.detectFaces(rgba, width, height, 4, this.detectionThreshold)
    } catch {
      return { matches: [], unknowns: 0, processingMs: performance.now() - start, timestamp }
    }

    // Build known entries from DB
    const allEmbeddings = this.peopleRepo.getAllEmbeddings()
    const knownEntries: KnownFaceEntry[] = allEmbeddings.map((e) => ({
      personId: e.personId,
      personName: e.personName,
      embedding: e.embedding,
    }))

    const matches: FaceMatchResult[] = []
    let unknowns = 0

    for (const detection of detections) {
      try {
        const embedding = await this.faceService.extractEmbedding(rgba, width, height, detection)
        const match = this.faceService.findBestMatch(embedding, knownEntries, this.matchThreshold)

        if (match) {
          // Look up relationship from DB
          const person = this.peopleRepo.findById(match.personId)
          matches.push({
            personId: match.personId,
            name: match.personName,
            relationship: person?.relationship ?? undefined,
            similarity: match.similarity,
            bbox: detection.bbox,
          })

          // Update visibility tracking
          this.markVisible(match.personId)
          this.peopleRepo.updateLastSeen(match.personId)
        } else {
          unknowns++
        }
      } catch {
        // Skip faces with embedding extraction errors
      }
    }

    return {
      matches,
      unknowns,
      processingMs: performance.now() - start,
      timestamp,
    }
  }

  private markVisible(personId: string): void {
    // Clear any pending removal timeout
    const existing = this.visibilityTimeout.get(personId)
    if (existing) clearTimeout(existing)

    this.visiblePersonIds.add(personId)

    // Remove after 5 seconds of not being seen
    const timeout = setTimeout(() => {
      this.visiblePersonIds.delete(personId)
      this.visibilityTimeout.delete(personId)
    }, 5000)
    this.visibilityTimeout.set(personId, timeout)
  }
}

export interface FrameResult {
  matches: FaceMatchResult[]
  unknowns: number
  processingMs: number
  timestamp: number
}
