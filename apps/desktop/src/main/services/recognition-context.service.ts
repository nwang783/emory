import { createHash } from 'node:crypto'
import type {
  ConversationRecording,
  ConversationRepository,
  PeopleRepository,
  RelationshipRepository,
} from '@emory/db'

export type LatestConversationSummary = {
  summary: string | null
  recordedAt: string | null
}

export type RecognitionContext = {
  personId: string
  personName: string
  relationshipLabel: string | null
  latestConversationSummary: string | null
  latestConversationRecordedAt: string | null
  announcementText: string
  fingerprint: string
}

const DEFAULT_RECORDING_SCAN_LIMIT = 5
const MAX_SUMMARY_SPEECH_CHARS = 180

function normalizeWhitespace(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function stripOuterQuotes(value: string): string {
  return value.replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '').trim()
}

function ensureSentence(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/[.!?]$/.test(trimmed)) return trimmed
  return `${trimmed}.`
}

function lowercaseFirst(value: string): string {
  if (!value) return value
  return value[0]!.toLowerCase() + value.slice(1)
}

function truncateForSpeech(value: string, maxChars: number = MAX_SUMMARY_SPEECH_CHARS): string {
  if (value.length <= maxChars) return value

  const truncated = value.slice(0, maxChars)
  const lastSpace = truncated.lastIndexOf(' ')
  const safe = lastSpace >= Math.floor(maxChars * 0.6) ? truncated.slice(0, lastSpace) : truncated
  return `${safe.trimEnd()}...`
}

function normalizeSpeechFragment(value: string): string {
  return stripOuterQuotes(normalizeWhitespace(value))
}

function buildRelationshipSentence(relationshipLabel: string | null): string {
  const normalized = normalizeSpeechFragment(relationshipLabel ?? '')
  if (!normalized) return ''

  const lower = normalized.toLowerCase()
  if (lower.startsWith('your ') || lower.startsWith('my ') || lower.startsWith('our ') || lower.startsWith('the ')) {
    return ensureSentence(normalized[0]!.toUpperCase() + normalized.slice(1))
  }

  return ensureSentence(`Your ${lower}`)
}

function buildSummarySentence(summary: string | null): string {
  const normalized = normalizeSpeechFragment(summary ?? '')
  if (!normalized) return ''

  const truncated = truncateForSpeech(normalized)
  if (/^last time[, ]/i.test(truncated)) {
    return ensureSentence(truncated)
  }

  return ensureSentence(`Last time, ${lowercaseFirst(truncated)}`)
}

function buildFingerprint(parts: Array<string | null | undefined>): string {
  const hash = createHash('sha256')
  for (const part of parts) {
    hash.update(part ?? '')
    hash.update('\n')
  }
  return hash.digest('hex')
}

function getSummaryFromRecording(recording: ConversationRecording): string | null {
  if (recording.extractionStatus !== 'complete') return null
  const summary = normalizeSpeechFragment(recording.extractionJson?.summary ?? '')
  return summary || null
}

export function getLatestConversationSummary(
  conversationRepo: Pick<ConversationRepository, 'getRecordingsByPerson'>,
  personId: string,
  limit: number = DEFAULT_RECORDING_SCAN_LIMIT,
): LatestConversationSummary {
  const recordings = conversationRepo.getRecordingsByPerson(personId, limit)
  for (const recording of recordings) {
    const summary = getSummaryFromRecording(recording)
    if (summary) {
      return {
        summary,
        recordedAt: recording.recordedAt,
      }
    }
  }

  return {
    summary: null,
    recordedAt: null,
  }
}

export class RecognitionContextService {
  constructor(
    private readonly peopleRepo: Pick<PeopleRepository, 'findById' | 'findSelf'>,
    private readonly conversationRepo: Pick<ConversationRepository, 'getRecordingsByPerson'>,
    private readonly relationshipRepo: Pick<RelationshipRepository, 'findBetween'>,
  ) {}

  getContext(personId: string): RecognitionContext | null {
    const person = this.peopleRepo.findById(personId)
    if (!person) return null

    const latestConversation = getLatestConversationSummary(this.conversationRepo, personId)
    const relationshipLabel = this.resolveRelationshipLabel(personId)
    const announcementText = [
      ensureSentence(normalizeSpeechFragment(person.name)),
      buildRelationshipSentence(relationshipLabel),
      buildSummarySentence(latestConversation.summary),
    ]
      .filter(Boolean)
      .join(' ')

    return {
      personId: person.id,
      personName: person.name,
      relationshipLabel,
      latestConversationSummary: latestConversation.summary,
      latestConversationRecordedAt: latestConversation.recordedAt,
      announcementText,
      fingerprint: buildFingerprint([
        person.id,
        person.name,
        relationshipLabel,
        latestConversation.summary,
        latestConversation.recordedAt,
        announcementText,
      ]),
    }
  }

  private resolveRelationshipLabel(personId: string): string | null {
    const direct = normalizeSpeechFragment(this.peopleRepo.findById(personId)?.relationship ?? '')
    if (direct) return direct

    const self = this.peopleRepo.findSelf()
    if (!self) return null

    const graphRelationship = this.relationshipRepo.findBetween(self.id, personId)
    const graphLabel = normalizeSpeechFragment(graphRelationship?.relationshipType ?? '')
    return graphLabel || null
  }
}
