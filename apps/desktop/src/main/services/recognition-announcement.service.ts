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

    const cachePath = path.join(this.cacheDir, `${fingerprint}.wav`)
    const cachedBytes = await this.readCache(cachePath)
    if (cachedBytes) {
      return {
        ...context,
        fingerprint,
        mimeType: 'audio/wav',
        audioBytes: cachedBytes,
      }
    }

    const result = await this.ttsService.synthesize({ text: context.announcementText })
    const targetPath = path.join(this.cacheDir, `${fingerprint}.${extensionFromMimeType(result.mimeType)}`)

    await mkdir(this.cacheDir, { recursive: true })
    await writeFile(targetPath, Buffer.from(result.audioBytes)).catch(() => {})

    return {
      ...context,
      fingerprint,
      mimeType: result.mimeType,
      audioBytes: result.audioBytes,
    }
  }

  private async readCache(cachePath: string): Promise<Uint8Array | null> {
    try {
      await access(cachePath)
      const data = await readFile(cachePath)
      return new Uint8Array(data)
    } catch {
      return null
    }
  }
}
