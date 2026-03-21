import type { ConversationRecording, Person, PersonMemory } from '@emory/db'
import type { MemoryQueryPlan } from './memory-query-understanding.service.js'

type OpenRouterChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>
    }
  }>
}

type UnknownRecord = Record<string, unknown>

export type MemoryAnswerResult = {
  answer: string
  confidence: 'high' | 'medium' | 'low'
}

export type MatchedGraphRelationship = {
  otherPersonId: string
  otherPersonName: string
  relationshipType: string
  notes: string | null
}

type BuildAnswerInput = {
  askedAt: string
  queryText: string
  plan: MemoryQueryPlan
  selfPerson: Person | null
  matchedPeople: Person[]
  matchedMemories: PersonMemory[]
  matchedRecordings: ConversationRecording[]
  /** Direct edges between the wearer (`selfPerson`) and each named person — authoritative for Connections graph. */
  matchedGraphRelationships: MatchedGraphRelationship[]
}

const MEMORY_ANSWER_SCHEMA = {
  name: 'memory_query_answer',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      answer: { type: 'string' },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
      },
    },
    required: ['answer', 'confidence'],
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

function normalizeAnswer(value: unknown): MemoryAnswerResult {
  const record = asRecord(value)
  if (!record) {
    throw new Error('Memory answer response was not a JSON object')
  }

  const answer = typeof record['answer'] === 'string' ? record['answer'].trim() : ''
  const confidence = record['confidence'] === 'high' || record['confidence'] === 'medium' || record['confidence'] === 'low'
    ? record['confidence']
    : 'low'

  if (!answer) {
    throw new Error('Memory answer response was empty')
  }

  return { answer, confidence }
}

export class MemoryAnswerService {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly model: string

  constructor(options?: { apiKey?: string; baseUrl?: string; model?: string }) {
    this.apiKey = options?.apiKey ?? process.env['OPENROUTER_API_KEY'] ?? ''
    this.baseUrl = options?.baseUrl ?? 'https://openrouter.ai/api/v1'
    this.model = options?.model ?? process.env['MEMORY_QUERY_MODEL'] ?? process.env['MEMORY_EXTRACTION_MODEL'] ?? 'openai/gpt-4.1-mini'
  }

  async buildAnswer(input: BuildAnswerInput): Promise<MemoryAnswerResult> {
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
              'You answer spoken memory questions for a local-first dementia assistant.',
              'Use only the evidence provided in the user message.',
              'Do not invent facts that are not present in the matched people, memories, or recordings.',
              'If matchedGraphRelationships is non-empty, it lists how the wearer is linked to someone in the Connections graph (relationshipType such as friend, parent, child). Prefer that for questions about relationship to me or how someone relates to the wearer.',
              'If evidence is weak or missing, say that clearly.',
              'Keep the answer short and easy to speak aloud, usually 1 to 3 sentences.',
            ].join(' '),
          },
          {
            role: 'user',
            content: JSON.stringify(input),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: MEMORY_ANSWER_SCHEMA,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Memory answer synthesis failed (${response.status}): ${errorText}`)
    }

    const payload = await response.json() as OpenRouterChatCompletionResponse
    const content = getMessageContent(payload)
    if (!content) {
      throw new Error('Memory answer synthesis returned empty content')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Memory answer synthesis returned invalid JSON: ${message}`)
    }

    return normalizeAnswer(parsed)
  }
}
