import { readFile } from 'node:fs/promises'

type DeepgramTranscriptResponse = {
  metadata?: unknown
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string
      }>
    }>
  }
}

export type DeepgramTranscriptResult = {
  text: string
  provider: 'deepgram'
  rawResponse: unknown
}

export class DeepgramService {
  private readonly apiKey: string
  private readonly baseUrl: string

  constructor(options?: { apiKey?: string; baseUrl?: string }) {
    this.apiKey = options?.apiKey ?? process.env['DEEPGRAM_API_KEY'] ?? ''
    this.baseUrl = options?.baseUrl ?? 'https://api.deepgram.com/v1'
  }

  async transcribeFile(input: { audioPath: string; mimeType: string }): Promise<DeepgramTranscriptResult> {
    if (!this.apiKey) {
      throw new Error('Missing DEEPGRAM_API_KEY')
    }

    const audioBuffer = await readFile(input.audioPath)
    const url = new URL('listen', this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`)
    url.searchParams.set('model', 'nova-3')
    url.searchParams.set('smart_format', 'true')
    url.searchParams.set('paragraphs', 'true')
    url.searchParams.set('punctuate', 'true')

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Token ${this.apiKey}`,
        'Content-Type': input.mimeType,
      },
      body: audioBuffer,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Deepgram transcription failed (${response.status}): ${errorText}`)
    }

    const payload = await response.json() as DeepgramTranscriptResponse
    const text = payload.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() ?? ''

    return {
      text,
      provider: 'deepgram',
      rawResponse: payload,
    }
  }
}
