import type {
  ConversationRecording,
  ConversationRepository,
  PeopleRepository,
  Person,
  PersonMemory,
  RelationshipRepository,
} from '@emory/db'
import { DeepgramService } from './deepgram.service.js'
import {
  MemoryAnswerService,
  type MatchedGraphRelationship,
  type MemoryAnswerResult,
} from './memory-answer.service.js'
import {
  MemoryQueryUnderstandingService,
  type MemoryQueryPlan,
} from './memory-query-understanding.service.js'

export type QueryMemoriesInput = {
  audioPath: string
  mimeType: string
  askedAt?: string
}

export type QueryMemoriesFromTextInput = {
  queryText: string
  askedAt?: string
}

export type QueryMemoriesResult = {
  queryTranscript: string
  plan: MemoryQueryPlan
  matchedPeople: Person[]
  matchedGraphRelationships: MatchedGraphRelationship[]
  matchedMemories: PersonMemory[]
  matchedRecordings: ConversationRecording[]
  answer: MemoryAnswerResult
}

function uniquePeople(people: Person[]): Person[] {
  const seen = new Set<string>()
  return people.filter((person) => {
    if (seen.has(person.id)) return false
    seen.add(person.id)
    return true
  })
}

function uniqueMemories(memories: PersonMemory[]): PersonMemory[] {
  const seen = new Set<string>()
  return memories.filter((memory) => {
    if (seen.has(memory.id)) return false
    seen.add(memory.id)
    return true
  })
}

function uniqueRecordings(recordings: ConversationRecording[]): ConversationRecording[] {
  const seen = new Set<string>()
  return recordings.filter((recording) => {
    if (seen.has(recording.id)) return false
    seen.add(recording.id)
    return true
  })
}

export class MemoryQueryService {
  constructor(
    private conversationRepo: ConversationRepository,
    private peopleRepo: PeopleRepository,
    private relationshipRepo: RelationshipRepository,
    private deepgramService: DeepgramService,
    private understandingService: MemoryQueryUnderstandingService,
    private answerService: MemoryAnswerService,
  ) {}

  async queryFromAudio(input: QueryMemoriesInput): Promise<QueryMemoriesResult> {
    const transcript = await this.deepgramService.transcribeFile({
      audioPath: input.audioPath,
      mimeType: input.mimeType,
    })

    return this.queryFromText({
      queryText: transcript.text,
      askedAt: input.askedAt,
    })
  }

  async queryFromText(input: QueryMemoriesFromTextInput): Promise<QueryMemoriesResult> {
    const queryText = input.queryText.trim()
    if (!queryText) {
      throw new Error('Query transcript was empty')
    }

    const askedAt = input.askedAt ?? new Date().toISOString()
    const selfPerson = this.peopleRepo.findSelf()
    const plan = await this.understandingService.understandQuery({
      queryText,
      askedAt,
      selfName: selfPerson?.name ?? null,
    })

    const matchedPeople = this.resolveMatchedPeople(plan, selfPerson)
    const matchedGraphRelationships = this.resolveMatchedGraphRelationships(selfPerson, matchedPeople)
    const matchedMemories = this.resolveMatchedMemories(plan, selfPerson, matchedPeople)
    const matchedRecordings = this.resolveMatchedRecordings(plan, selfPerson, matchedPeople)
    const answer = await this.answerService.buildAnswer({
      askedAt,
      queryText,
      plan,
      selfPerson,
      matchedPeople,
      matchedMemories,
      matchedRecordings,
      matchedGraphRelationships,
    })

    return {
      queryTranscript: queryText,
      plan,
      matchedPeople,
      matchedGraphRelationships,
      matchedMemories,
      matchedRecordings,
      answer,
    }
  }

  private resolveMatchedPeople(plan: MemoryQueryPlan, selfPerson: Person | null): Person[] {
    const people: Person[] = []

    if (plan.personScope === 'self' && selfPerson) {
      people.push(selfPerson)
    }

    if (plan.personName) {
      people.push(...this.peopleRepo.searchByName(plan.personName, 3))
    }

    return uniquePeople(people)
  }

  private resolveMatchedGraphRelationships(
    selfPerson: Person | null,
    matchedPeople: Person[],
  ): MatchedGraphRelationship[] {
    if (!selfPerson) return []

    const out: MatchedGraphRelationship[] = []
    for (const person of matchedPeople) {
      if (person.id === selfPerson.id) continue
      const rel = this.relationshipRepo.findBetween(selfPerson.id, person.id)
      if (!rel) continue
      out.push({
        otherPersonId: person.id,
        otherPersonName: person.name,
        relationshipType: rel.relationshipType,
        notes: rel.notes,
      })
    }
    return out
  }

  private resolveMatchedMemories(plan: MemoryQueryPlan, selfPerson: Person | null, matchedPeople: Person[]): PersonMemory[] {
    const personIds = matchedPeople.map((person) => person.id)
    const memories: PersonMemory[] = []

    if (personIds.length > 0) {
      for (const personId of personIds) {
        memories.push(...this.conversationRepo.getMemoriesByPerson(personId, 12))
      }
      memories.push(...this.conversationRepo.getRelationshipMemoriesForPersonIds(personIds))
    } else if (plan.personScope === 'self' && selfPerson) {
      memories.push(...this.conversationRepo.getMemoriesByPerson(selfPerson.id, 8))
    } else {
      memories.push(...this.conversationRepo.searchMemories({ limit: 8 }))
    }

    for (const term of plan.searchTerms) {
      memories.push(...this.conversationRepo.searchMemories({
        personIds: personIds.length > 0 ? personIds : undefined,
        startAt: plan.startAt,
        endAt: plan.endAt,
        searchText: term,
        limit: 8,
      }))
    }

    if (plan.startAt || plan.endAt) {
      memories.push(...this.conversationRepo.searchMemories({
        personIds: personIds.length > 0 ? personIds : undefined,
        startAt: plan.startAt,
        endAt: plan.endAt,
        limit: 12,
      }))
    }

    return uniqueMemories(memories).slice(0, 12)
  }

  private resolveMatchedRecordings(plan: MemoryQueryPlan, selfPerson: Person | null, matchedPeople: Person[]): ConversationRecording[] {
    const personIds = matchedPeople.map((person) => person.id)
    const recordings: ConversationRecording[] = []

    if (personIds.length > 0) {
      for (const personId of personIds) {
        recordings.push(...this.conversationRepo.getRecordingsByPerson(personId, 5))
      }
    } else if (plan.personScope === 'self' && selfPerson) {
      recordings.push(...this.conversationRepo.searchRecordings({
        startAt: plan.startAt,
        endAt: plan.endAt,
        limit: 5,
      }))
    }

    for (const term of plan.searchTerms) {
      recordings.push(...this.conversationRepo.searchRecordings({
        personIds: personIds.length > 0 ? personIds : undefined,
        startAt: plan.startAt,
        endAt: plan.endAt,
        transcriptSearchText: term,
        limit: 5,
      }))
    }

    if ((plan.startAt || plan.endAt) && recordings.length === 0) {
      recordings.push(...this.conversationRepo.searchRecordings({
        personIds: personIds.length > 0 ? personIds : undefined,
        startAt: plan.startAt,
        endAt: plan.endAt,
        limit: 5,
      }))
    }

    return uniqueRecordings(recordings).slice(0, 8)
  }
}
