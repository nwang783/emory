import type { ConversationRecording, ConversationRepository, PeopleRepository, Person, PersonMemory } from '@emory/db'
import { DeepgramService } from './deepgram.service.js'
import { MemoryAnswerService, type MemoryAnswerResult } from './memory-answer.service.js'
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

function summarizePerson(person: Person) {
  return {
    id: person.id,
    name: person.name,
    relationship: person.relationship,
  }
}

function summarizeMemory(memory: PersonMemory) {
  return {
    id: memory.id,
    personId: memory.personId,
    memoryType: memory.memoryType,
    memoryDate: memory.memoryDate,
    memoryText: memory.memoryText,
  }
}

function summarizeRecording(recording: ConversationRecording) {
  return {
    id: recording.id,
    personId: recording.personId,
    recordedAt: recording.recordedAt,
    transcriptStatus: recording.transcriptStatus,
    extractionStatus: recording.extractionStatus,
  }
}

export class MemoryQueryService {
  constructor(
    private conversationRepo: ConversationRepository,
    private peopleRepo: PeopleRepository,
    private deepgramService: DeepgramService,
    private understandingService: MemoryQueryUnderstandingService,
    private answerService: MemoryAnswerService,
  ) {}

  async queryFromAudio(input: QueryMemoriesInput): Promise<QueryMemoriesResult> {
    console.log('[memory-query] audio query start', {
      audioPath: input.audioPath,
      mimeType: input.mimeType,
      askedAt: input.askedAt ?? null,
    })

    const transcript = await this.deepgramService.transcribeFile({
      audioPath: input.audioPath,
      mimeType: input.mimeType,
    })

    console.log('[memory-query] audio transcript complete', {
      provider: transcript.provider,
      transcriptLength: transcript.text.length,
      transcriptPreview: transcript.text.slice(0, 160),
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
    console.log('[memory-query] text query start', {
      askedAt,
      queryText,
      selfPersonId: selfPerson?.id ?? null,
    })
    const plan = await this.understandingService.understandQuery({
      queryText,
      askedAt,
      selfName: selfPerson?.name ?? null,
    })

    console.log('[memory-query] plan resolved', {
      queryText,
      askedAt,
      plan,
    })

    const matchedPeople = this.resolveMatchedPeople(plan, selfPerson)
    const matchedMemories = this.resolveMatchedMemories(plan, selfPerson, matchedPeople)
    const matchedRecordings = this.resolveMatchedRecordings(plan, selfPerson, matchedPeople)
    console.log('[memory-query] retrieval complete', {
      matchedPeopleCount: matchedPeople.length,
      matchedMemoryCount: matchedMemories.length,
      matchedRecordingCount: matchedRecordings.length,
      matchedPeople: matchedPeople.map((person) => summarizePerson(person)),
      matchedMemories: matchedMemories.map((memory) => summarizeMemory(memory)),
      matchedRecordings: matchedRecordings.map((recording) => summarizeRecording(recording)),
    })
    const answer = await this.answerService.buildAnswer({
      askedAt,
      queryText,
      plan,
      selfPerson,
      matchedPeople,
      matchedMemories,
      matchedRecordings,
    })

    console.log('[memory-query] answer complete', {
      answerText: answer.answerText,
      citationsCount: answer.citations.length,
      confidence: answer.confidence,
    })

    return {
      queryTranscript: queryText,
      plan,
      matchedPeople,
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

  private resolveMatchedMemories(plan: MemoryQueryPlan, selfPerson: Person | null, matchedPeople: Person[]): PersonMemory[] {
    const personIds = matchedPeople.map((person) => person.id)
    const memories: PersonMemory[] = []

    if (personIds.length > 0) {
      for (const personId of personIds) {
        memories.push(...this.conversationRepo.getMemoriesByPerson(personId, 8))
      }
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
