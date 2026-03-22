import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { CartesiaTtsService } from './cartesia-tts.service.js'
import type { RecognitionContext, RecognitionContextService } from './recognition-context.service.js'

export type RecognitionAnnouncement = RecognitionContext & {
  mimeType: string
  audioBytes: Uint8Array
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('wav')) return 'wav'
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3'
  if (normalized.includes('ogg')) return 'ogg'
  return 'bin'
}

function buildAudioFingerprint(contextFingerprint: string, modelId: string, voiceId: string): string {
  const hash = createHash('sha256')
  hash.update(contextFingerprint)
  hash.update('\n')
  hash.update(modelId)
  hash.update('\n')
  hash.update(voiceId)
  return hash.digest('hex')
}

export class RecognitionAnnouncementService {
  constructor(
    private readonly contextService: RecognitionContextService,
    private readonly ttsService: Pick<CartesiaTtsService, 'synthesize' | 'getModelId' | 'getVoiceId'>,
    private readonly cacheDir: string,
  ) {}

  getContext(personId: string): RecognitionContext | null {
    return this.contextService.getContext(personId)
  }

  async getAnnouncement(personId: string): Promise<RecognitionAnnouncement | null> {
    const context = this.contextService.getContext(personId)
    if (!context) return null

    const fingerprint = buildAudioFingerprint(
      context.fingerprint,
      this.ttsService.getModelId(),
      this.ttsService.getVoiceId(),
    )

    const cached = await this.readCache(fingerprint)
    if (cached) {
      console.log('[recognition-announcement] cache hit', {
        personId,
        fingerprint,
        mimeType: cached.mimeType,
        bytes: cached.audioBytes.byteLength,
        cachePath: cached.path,
      })
      return {
        ...context,
        fingerprint,
        mimeType: cached.mimeType,
        audioBytes: cached.audioBytes,
      }
    }

    console.log('[recognition-announcement] cache miss', {
      personId,
      fingerprint,
      textLength: context.announcementText.length,
      textPreview: context.announcementText.slice(0, 120),
    })
    const result = await this.ttsService.synthesize({ text: context.announcementText })
    const targetPath = path.join(this.cacheDir, `${fingerprint}.${extensionFromMimeType(result.mimeType)}`)

    await mkdir(this.cacheDir, { recursive: true })
    await writeFile(targetPath, Buffer.from(result.audioBytes)).catch(() => {})
    console.log('[recognition-announcement] synthesized', {
      personId,
      fingerprint,
      mimeType: result.mimeType,
      bytes: result.audioBytes.byteLength,
      targetPath,
    })

    return {
      ...context,
      fingerprint,
      mimeType: result.mimeType,
      audioBytes: result.audioBytes,
    }
  }

  private async readCache(fingerprint: string): Promise<{ path: string; mimeType: string; audioBytes: Uint8Array } | null> {
    const candidates = [
      {
        path: path.join(this.cacheDir, `${fingerprint}.mp3`),
        mimeType: 'audio/mpeg',
      },
      {
        path: path.join(this.cacheDir, `${fingerprint}.wav`),
        mimeType: 'audio/wav',
      },
    ]

    for (const candidate of candidates) {
      try {
        await access(candidate.path)
        const data = await readFile(candidate.path)
        return {
          path: candidate.path,
          mimeType: candidate.mimeType,
          audioBytes: new Uint8Array(data),
        }
      } catch {
        continue
      }
    }

    return null
  }
}
