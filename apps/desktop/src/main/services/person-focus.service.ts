import type { PeopleRepository } from '@emory/db'

export type PersonFocusMatch = {
  personId: string
  name: string
  relationship?: string | null
  similarity: number
  bbox: { width: number; height: number }
}

export type PersonFocusObservation = {
  timestamp: number
  matches: PersonFocusMatch[]
}

export type PersonFocusPayload = {
  id: string
  name: string
  relationship: string | null
  similarity: number
  faceThumbnail: string | null
}

export type PersonFocusMessage = {
  type: 'person_focus_changed'
  sequence: number
  ts: number
  reason: 'stable_match' | 'focus_cleared' | 'publisher_closed' | 'manual_test' | 'manual_clear'
  person: PersonFocusPayload | null
}

type PersonFocusOptions = {
  framesToConfirm?: number
  clearAfterSeconds?: number
}

type CandidateFocus = {
  personId: string
  frames: number
  match: PersonFocusMatch
}

function pickPrimaryMatch(matches: readonly PersonFocusMatch[]): PersonFocusMatch | null {
  let best: PersonFocusMatch | null = null
  let bestArea = -1

  for (const match of matches) {
    const area = match.bbox.width * match.bbox.height
    if (!best || area > bestArea || (area === bestArea && match.similarity > best.similarity)) {
      best = match
      bestArea = area
    }
  }

  return best
}

export class PersonFocusService {
  private readonly framesToConfirm: number
  private readonly clearAfterSeconds: number
  private readonly emit: (message: PersonFocusMessage) => void

  private sequence = 0
  private active: PersonFocusMessage | null = null
  private candidate: CandidateFocus | null = null
  private lastActiveSeenAt: number | null = null

  constructor(
    private readonly peopleRepo: Pick<PeopleRepository, 'findById' | 'getEmbeddingsWithMeta'>,
    emit: (message: PersonFocusMessage) => void,
    options: PersonFocusOptions = {},
  ) {
    this.emit = emit
    this.framesToConfirm = Math.max(1, Math.floor(options.framesToConfirm ?? 2))
    this.clearAfterSeconds = Math.max(0, options.clearAfterSeconds ?? 2)
  }

  observe(result: PersonFocusObservation): void {
    const primary = pickPrimaryMatch(result.matches)

    if (primary) {
      if (this.active?.person?.id === primary.personId) {
        this.lastActiveSeenAt = result.timestamp
        this.candidate = null
        return
      }

      if (this.candidate?.personId === primary.personId) {
        this.candidate = {
          personId: primary.personId,
          frames: this.candidate.frames + 1,
          match: primary,
        }
      } else {
        this.candidate = {
          personId: primary.personId,
          frames: 1,
          match: primary,
        }
      }

      if (this.candidate.frames >= this.framesToConfirm) {
        this.lastActiveSeenAt = result.timestamp
        this.publishFocus(this.candidate.match, result.timestamp, 'stable_match')
        this.candidate = null
      }

      return
    }

    this.candidate = null

    if (
      this.active &&
      this.lastActiveSeenAt !== null &&
      result.timestamp - this.lastActiveSeenAt >= this.clearAfterSeconds
    ) {
      this.clear('focus_cleared', result.timestamp)
    }
  }

  forceFocusPerson(personId: string, timestamp: number = Date.now() / 1000): PersonFocusMessage | null {
    const person = this.peopleRepo.findById(personId)
    if (!person) return null

    const latestThumbnail = this.peopleRepo.getEmbeddingsWithMeta(personId).find((embedding) => Boolean(embedding.thumbnail))
    const message: PersonFocusMessage = {
      type: 'person_focus_changed',
      sequence: ++this.sequence,
      ts: timestamp,
      reason: 'manual_test',
      person: {
        id: person.id,
        name: person.name,
        relationship: person.relationship ?? null,
        similarity: 1,
        faceThumbnail: latestThumbnail?.thumbnail ?? null,
      },
    }

    this.active = message
    this.candidate = null
    this.lastActiveSeenAt = timestamp
    this.emit(message)
    return message
  }

  clear(
    reason: PersonFocusMessage['reason'] = 'focus_cleared',
    timestamp: number = Date.now() / 1000,
  ): PersonFocusMessage | null {
    if (!this.active) return null

    const message: PersonFocusMessage = {
      type: 'person_focus_changed',
      sequence: ++this.sequence,
      ts: timestamp,
      reason,
      person: null,
    }

    this.active = null
    this.candidate = null
    this.lastActiveSeenAt = null
    this.emit(message)
    return message
  }

  getCurrentFocus(): PersonFocusMessage | null {
    return this.active
  }

  private publishFocus(match: PersonFocusMatch, timestamp: number, reason: PersonFocusMessage['reason']): void {
    const payload = this.buildPayload(match)
    const message: PersonFocusMessage = {
      type: 'person_focus_changed',
      sequence: ++this.sequence,
      ts: timestamp,
      reason,
      person: payload,
    }

    this.active = message
    this.emit(message)
  }

  private buildPayload(match: PersonFocusMatch): PersonFocusPayload {
    const person = this.peopleRepo.findById(match.personId)
    const latestThumbnail = this.peopleRepo.getEmbeddingsWithMeta(match.personId).find((embedding) => Boolean(embedding.thumbnail))

    return {
      id: match.personId,
      name: person?.name ?? match.name,
      relationship: person?.relationship ?? match.relationship ?? null,
      similarity: match.similarity,
      faceThumbnail: latestThumbnail?.thumbnail ?? null,
    }
  }
}
