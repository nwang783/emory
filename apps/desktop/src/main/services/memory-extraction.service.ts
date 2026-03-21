import type { AppliesToPerson, ExtractedMemory, MemoryExtractionResult, MemoryType } from '@emory/db'

type OpenRouterChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
}

type ExtractMemoriesInput = {
  transcript: string
  selfPerson: { id: string; name: string; bio?: string | null } | null
  targetPerson: { id: string; name: string; relationship?: string | null }
  recordedAt: string
}

type UnknownRecord = Record<string, unknown>

const VALID_MEMORY_TYPES: MemoryType[] = ['fact', 'preference', 'event', 'relationship', 'health', 'routine', 'other']
const VALID_APPLIES_TO: AppliesToPerson[] = ['target_person', 'self_person', 'unknown']

const MEMORY_EXTRACTION_SCHEMA = {
  name: 'memory_extraction',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      summary: { type: 'string' },
      memories: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            memoryText: { type: 'string' },
            memoryType: {
              type: 'string',
              enum: VALID_MEMORY_TYPES,
            },
            memoryDate: { type: 'string' },
            confidence: { type: ['number', 'null'] },
            sourceQuote: { type: ['string', 'null'] },
            appliesToPerson: {
              type: 'string',
              enum: VALID_APPLIES_TO,
            },
          },
          required: ['memoryText', 'memoryType', 'memoryDate', 'confidence', 'sourceQuote', 'appliesToPerson'],
        },
      },
      uncertainItems: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            text: { type: 'string' },
            reason: { type: 'string' },
          },
          required: ['text', 'reason'],
        },
      },
    },
    required: ['summary', 'memories', 'uncertainItems'],
  },
} as const

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as UnknownRecord
}

function normalizeMemoryType(value: unknown): MemoryType {
  return VALID_MEMORY_TYPES.includes(value as MemoryType) ? value as MemoryType : 'other'
}

function normalizeAppliesTo(value: unknown): AppliesToPerson {
  return VALID_APPLIES_TO.includes(value as AppliesToPerson) ? value as AppliesToPerson : 'unknown'
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  return Math.max(0, Math.min(1, value))
}

function normalizeExtractedMemory(value: unknown, recordedAt: string): ExtractedMemory | null {
  const record = asRecord(value)
  if (!record) return null

  const memoryText = typeof record['memoryText'] === 'string' ? record['memoryText'].trim() : ''
  if (!memoryText) return null

  const memoryDate = typeof record['memoryDate'] === 'string' && record['memoryDate'].trim()
    ? record['memoryDate'].trim()
    : recordedAt

  const sourceQuote = typeof record['sourceQuote'] === 'string' ? record['sourceQuote'].trim() : null

  return {
    memoryText,
    memoryType: normalizeMemoryType(record['memoryType']),
    memoryDate,
    confidence: normalizeConfidence(record['confidence']),
    sourceQuote: sourceQuote || null,
    appliesToPerson: normalizeAppliesTo(record['appliesToPerson']),
  }
}

function normalizeExtractionResult(value: unknown, recordedAt: string): MemoryExtractionResult {
  const record = asRecord(value)
  if (!record) {
    throw new Error('LLM response was not a JSON object')
  }

  const summary = typeof record['summary'] === 'string' ? record['summary'].trim() : ''
  const memories = Array.isArray(record['memories'])
    ? record['memories']
      .map((item) => normalizeExtractedMemory(item, recordedAt))
      .filter((item): item is ExtractedMemory => item !== null)
    : []
  const uncertainItems = Array.isArray(record['uncertainItems'])
    ? record['uncertainItems']
      .map((item) => {
        const row = asRecord(item)
        if (!row) return null
        const text = typeof row['text'] === 'string' ? row['text'].trim() : ''
        const reason = typeof row['reason'] === 'string' ? row['reason'].trim() : ''
        if (!text || !reason) return null
        return { text, reason }
      })
      .filter((item): item is { text: string; reason: string } => item !== null)
    : []

  return { summary, memories, uncertainItems }
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

export class MemoryExtractionService {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string

  constructor(options?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env['OPENROUTER_API_KEY'] ?? ''
    this.baseUrl = options?.baseUrl ?? 'https://openrouter.ai/api/v1'
    this.model = options?.model ?? process.env['MEMORY_EXTRACTION_MODEL'] ?? 'openai/gpt-4.1-mini'
  }

  async extractMemories(input: ExtractMemoriesInput): Promise<MemoryExtractionResult> {
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
              'You extract structured memories from transcripts for a local-first assistant.',
              'The user is the app wearer. The target person is the person they are talking to.',
              'Extract useful memories about the target person and, when clearly supported, the wearer.',
              'Do not invent speaker turns or facts when the transcript is ambiguous.',
              'Set appliesToPerson to target_person, self_person, or unknown.',
              'Keep memoryText short, factual, and useful for future conversations.',
              'When the memory is about the wearer, phrase memoryText from the wearer perspective when natural, for example: "You had lunch with Ryan at 2 PM."',
              input.selfPerson?.bio ? `Background about the wearer: ${input.selfPerson.bio}` : '',
              'Resolve relative times like today, tomorrow, and this afternoon into ISO timestamps when the transcript makes the time clear. Otherwise use recordedAt.',
              'If there are no good memories, return an empty memories array.',
            ].filter(Boolean).join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify({
              selfPerson: input.selfPerson,
              targetPerson: input.targetPerson,
              recordedAt: input.recordedAt,
              transcript: input.transcript,
            }),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: MEMORY_EXTRACTION_SCHEMA,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Memory extraction failed (${response.status}): ${errorText}`)
    }

    const payload = await response.json() as OpenRouterChatCompletionResponse
    const content = getMessageContent(payload)
    if (!content) {
      throw new Error('Memory extraction returned empty content')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Memory extraction returned invalid JSON: ${message}`)
    }

    return normalizeExtractionResult(parsed, input.recordedAt)
  }
}
