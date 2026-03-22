import { app } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export type SynthesizeSpeechInput = {
  text: string
}

export type SynthesizeSpeechResult = {
  audioBytes: Uint8Array
  mimeType: string
}

type CartesiaErrorResponse = {
  error?: {
    message?: string
  }
  message?: string
}

const CARTESIA_API_VERSION = '2026-03-01'
const DEFAULT_MODEL_ID = 'sonic-3'
const DEFAULT_VOICE_ID = '6ccbfb76-1fc6-48f7-b71d-91ac6298247b'
const TTS_ROOT_SEGMENT = 'tts'

export function getTtsRootDir(): string {
  return path.join(app.getPath('userData'), TTS_ROOT_SEGMENT)
}

function parseErrorMessage(payload: CartesiaErrorResponse): string | null {
  if (typeof payload.error?.message === 'string' && payload.error.message.trim()) {
    return payload.error.message.trim()
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim()
  }
  return null
}

function extensionFromMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase()
  if (normalized.includes('wav')) return 'wav'
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3'
  if (normalized.includes('ogg')) return 'ogg'
  return 'bin'
}

function slugifyText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'tts'
}

async function saveDebugAudio(input: { text: string; audioBytes: Uint8Array; mimeType: string }): Promise<void> {
  const now = new Date()
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const dir = path.join(getTtsRootDir(), year, month)
  await mkdir(dir, { recursive: true })

  const timestamp = now.toISOString().replaceAll(':', '-')
  const fileName = `${timestamp}-${slugifyText(input.text)}-${randomUUID()}.${extensionFromMimeType(input.mimeType)}`
  await writeFile(path.join(dir, fileName), Buffer.from(input.audioBytes))
}

export class CartesiaTtsService {
  private readonly apiKey: string
  private readonly modelId: string
  private readonly voiceId: string
  private readonly baseUrl: string
  private readonly saveDebugAudio: boolean

  constructor(options?: { apiKey?: string; modelId?: string; voiceId?: string; baseUrl?: string; saveDebugAudio?: boolean }) {
    this.apiKey = options?.apiKey ?? process.env['CARTESIA_API_KEY'] ?? ''
    this.modelId = options?.modelId ?? DEFAULT_MODEL_ID
    this.voiceId = options?.voiceId ?? DEFAULT_VOICE_ID
    this.baseUrl = options?.baseUrl ?? 'https://api.cartesia.ai'
    this.saveDebugAudio =
      options?.saveDebugAudio ?? (process.env['NODE_ENV'] !== 'production' || process.env['SAVE_TTS_DEBUG_AUDIO'] === '1')
  }

  getModelId(): string {
    return this.modelId
  }

  getVoiceId(): string {
    return this.voiceId
  }

  async synthesize(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechResult> {
    const text = input.text.trim()
    if (!text) {
      throw new Error('TTS text was empty')
    }
    if (!this.apiKey) {
      throw new Error('Missing CARTESIA_API_KEY')
    }
    if (!this.voiceId) {
      throw new Error('Missing CARTESIA_VOICE_ID')
    }

    console.log('[cartesia-tts] synthesize start', {
      textLength: text.length,
      textPreview: text.slice(0, 120),
      modelId: this.modelId,
      voiceId: this.voiceId,
      baseUrl: this.baseUrl,
    })

    const response = await fetch(`${this.baseUrl}/tts/bytes`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Cartesia-Version': CARTESIA_API_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: this.modelId,
        transcript: text,
        voice: {
          mode: 'id',
          id: this.voiceId,
        },
        language: 'en',
        output_format: {
          container: 'mp3',
          sample_rate: 44100,
          bit_rate: 128000,
        },
      }),
    })

    console.log('[cartesia-tts] synthesize response', {
      status: response.status,
      ok: response.ok,
      mimeType: response.headers.get('content-type') ?? 'unknown',
    })

    if (!response.ok) {
      let details = response.statusText
      try {
        const payload = await response.json() as CartesiaErrorResponse
        details = parseErrorMessage(payload) ?? details
      } catch {
        const textBody = await response.text().catch(() => '')
        if (textBody.trim()) details = textBody.trim()
      }
      throw new Error(`Cartesia TTS failed (${response.status}): ${details}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength === 0) {
      throw new Error('Cartesia TTS returned empty audio')
    }

    const result = {
      audioBytes: new Uint8Array(arrayBuffer),
      mimeType: response.headers.get('content-type') ?? 'audio/wav',
    }

    console.log('[cartesia-tts] synthesize complete', {
      bytes: result.audioBytes.byteLength,
      mimeType: result.mimeType,
    })

    if (this.saveDebugAudio) {
      await saveDebugAudio({
        text,
        audioBytes: result.audioBytes,
        mimeType: result.mimeType,
      }).catch(() => {})
    }

    return result
  }
}
