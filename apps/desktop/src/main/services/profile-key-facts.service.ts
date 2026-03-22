import type { PersonMemory } from '@emory/db'

type OpenRouterChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
}

type KeyFactSourceMemory = Pick<PersonMemory, 'memoryText' | 'memoryType' | 'memoryDate' | 'confidence'>

type SynthesizeKeyFactsInput = {
  personName: string
  memories: KeyFactSourceMemory[]
}

type UnknownRecord = Record<string, unknown>

const KEY_FACTS_SCHEMA = {
  name: 'profile_key_facts',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      keyFacts: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['keyFacts'],
  },
} as const

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as UnknownRecord
}

function getMessageContent(payload: OpenRouterChatCompletionResponse): string {
  const content = payload.choices?.[0]?.message?.content
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((part) => (part?.type === 'text' ? part.text ?? '' : ''))
      .join('')
      .trim()
  }
  return ''
}

function normalizeKeyFacts(value: unknown): string[] {
  const record = asRecord(value)
  if (!record) {
    throw new Error('LLM response was not a JSON object')
  }

  if (!Array.isArray(record['keyFacts'])) return []

  const seen = new Set<string>()
  const keyFacts: string[] = []

  for (const item of record['keyFacts']) {
    if (typeof item !== 'string') continue
    const fact = item.trim()
    if (!fact) continue
    const normalized = fact.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    keyFacts.push(fact)
    if (keyFacts.length >= 8) break
  }

  return keyFacts
}

export class ProfileKeyFactsService {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string

  constructor(options?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env['OPENROUTER_API_KEY'] ?? ''
    this.baseUrl = options?.baseUrl ?? 'https://openrouter.ai/api/v1'
    this.model = options?.model
      ?? process.env['MEMORY_KEY_FACTS_MODEL']
      ?? process.env['MEMORY_EXTRACTION_MODEL']
      ?? 'openai/gpt-4.1-mini'
  }

  async synthesizeKeyFacts(input: SynthesizeKeyFactsInput): Promise<string[]> {
    if (!this.apiKey) {
      throw new Error('Missing OPENROUTER_API_KEY')
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: [
              'You distill durable profile key facts from stored conversation memories.',
              'Prefer stable facts, preferences, routines, relationships, and ongoing life updates over transient recent topics.',
              'Avoid speculation and avoid repeating the same idea twice.',
              'Write short, factual bullet-style lines that are useful on a profile card.',
              'Use only the supplied memories. If there are no reliable durable facts, return an empty keyFacts array.',
              'Return at most 8 key facts.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              personName: input.personName,
              memories: input.memories,
            }),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: KEY_FACTS_SCHEMA,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Profile key facts failed (${response.status}): ${errorText}`)
    }

    const payload = await response.json() as OpenRouterChatCompletionResponse
    const content = getMessageContent(payload)
    if (!content) {
      throw new Error('Profile key facts returned empty content')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Profile key facts returned invalid JSON: ${message}`)
    }

    return normalizeKeyFacts(parsed)
  }
}
