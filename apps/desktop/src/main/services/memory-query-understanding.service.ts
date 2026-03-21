type OpenRouterChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
}

export type MemoryQueryIntent = 'person_lookup' | 'timeline_lookup' | 'general_lookup'
export type MemoryQueryPersonScope = 'self' | 'other' | 'unknown'

export type MemoryQueryPlan = {
  intent: MemoryQueryIntent
  personScope: MemoryQueryPersonScope
  personName: string | null
  startAt: string | null
  endAt: string | null
  searchTerms: string[]
}

type UnderstandQueryInput = {
  queryText: string
  askedAt: string
  selfName: string | null
}

type UnknownRecord = Record<string, unknown>

const VALID_INTENTS: MemoryQueryIntent[] = ['person_lookup', 'timeline_lookup', 'general_lookup']
const VALID_PERSON_SCOPES: MemoryQueryPersonScope[] = ['self', 'other', 'unknown']

const MEMORY_QUERY_PLAN_SCHEMA = {
  name: 'memory_query_plan',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: {
        type: 'string',
        enum: VALID_INTENTS,
      },
      personScope: {
        type: 'string',
        enum: VALID_PERSON_SCOPES,
      },
      personName: {
        type: ['string', 'null'],
      },
      startAt: {
        type: ['string', 'null'],
      },
      endAt: {
        type: ['string', 'null'],
      },
      searchTerms: {
        type: 'array',
        items: {
          type: 'string',
        },
      },
    },
    required: ['intent', 'personScope', 'personName', 'startAt', 'endAt', 'searchTerms'],
  },
} as const

function asRecord(value: unknown): UnknownRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as UnknownRecord
}

function normalizeEnum<T extends string>(value: unknown, validValues: T[], fallback: T): T {
  return validValues.includes(value as T) ? value as T : fallback
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

function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>()
  const output: string[] = []
  for (const value of values) {
    const normalized = value.trim().toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    output.push(value.trim())
  }
  return output
}

function normalizePlan(value: unknown): MemoryQueryPlan {
  const record = asRecord(value)
  if (!record) {
    throw new Error('Query understanding response was not a JSON object')
  }

  const personName = typeof record['personName'] === 'string' && record['personName'].trim()
    ? record['personName'].trim()
    : null
  const startAt = typeof record['startAt'] === 'string' && record['startAt'].trim()
    ? record['startAt'].trim()
    : null
  const endAt = typeof record['endAt'] === 'string' && record['endAt'].trim()
    ? record['endAt'].trim()
    : null
  const searchTerms = Array.isArray(record['searchTerms'])
    ? uniqueTerms(record['searchTerms'].filter((item): item is string => typeof item === 'string'))
    : []

  return {
    intent: normalizeEnum(record['intent'], VALID_INTENTS, 'general_lookup'),
    personScope: normalizeEnum(record['personScope'], VALID_PERSON_SCOPES, 'unknown'),
    personName,
    startAt,
    endAt,
    searchTerms,
  }
}

export class MemoryQueryUnderstandingService {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string

  constructor(options?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env['OPENROUTER_API_KEY'] ?? ''
    this.baseUrl = options?.baseUrl ?? 'https://openrouter.ai/api/v1'
    this.model = options?.model ?? process.env['MEMORY_QUERY_MODEL'] ?? process.env['MEMORY_EXTRACTION_MODEL'] ?? 'openai/gpt-4.1-mini'
  }

  async understandQuery(input: UnderstandQueryInput): Promise<MemoryQueryPlan> {
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
              'You convert spoken memory questions into a small retrieval plan.',
              'The app wearer may ask about a person, about their own day, or about recent memories.',
              'If the question is about what the wearer did, set personScope to self.',
              'If the question names another person, set personScope to other and fill personName.',
              'For questions about how someone relates to the wearer (relationship to me, are they my friend, family, carer), set personScope to other and personName to that other person\'s name; include searchTerms like relationship, friend, family if helpful.',
              'If a time is stated, resolve it to ISO timestamps in startAt and endAt using askedAt as the reference clock.',
              'Use a narrow window for specific times, usually around one hour unless the question implies a larger span like this morning or today.',
              'Put only useful retrieval keywords into searchTerms.',
              'Do not invent names or times.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify(input),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: MEMORY_QUERY_PLAN_SCHEMA,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Memory query understanding failed (${response.status}): ${errorText}`)
    }

    const payload = await response.json() as OpenRouterChatCompletionResponse
    const content = getMessageContent(payload)
    if (!content) {
      throw new Error('Memory query understanding returned empty content')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Memory query understanding returned invalid JSON: ${message}`)
    }

    return normalizePlan(parsed)
  }
}
