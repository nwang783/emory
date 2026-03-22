import type {
  ConversationRepository,
  EncounterRepository,
  PeopleRepository,
  Person,
  EncounterWithPerson,
  PersonMemory,
} from '@emory/db'
import type {
  MobileApiEncounter,
  MobileApiHomeResponse,
  MobileApiMemoryGroupsResponse,
  MobileApiMemoriesResponse,
  MobileApiPeopleResponse,
  MobileApiPerson,
  MobileApiPersonDetail,
  MobileApiRecentEncountersResponse,
} from './mobile-api.types.js'
import { getLatestConversationSummary } from './recognition-context.service.js'

function clampLimit(limit: number | undefined, fallback: number, max: number): number {
  if (!Number.isFinite(limit)) return fallback
  return Math.max(1, Math.min(max, Math.floor(limit as number)))
}

export class MobileApiService {
  constructor(
    private readonly peopleRepo: PeopleRepository,
    private readonly encounterRepo: EncounterRepository,
    private readonly conversationRepo: ConversationRepository,
  ) {}

  getPeople(): MobileApiPeopleResponse {
    return {
      people: this.peopleRepo.findAll().map((person) => this.mapPerson(person)),
    }
  }

  getPersonDetail(personId: string, memoryLimit?: number, encounterLimit?: number): MobileApiPersonDetail | null {
    const person = this.peopleRepo.findById(personId)
    if (!person) return null
    const latestConversation = getLatestConversationSummary(this.conversationRepo, personId)

    return {
      person: this.mapPerson(person),
      recentMemories: this.conversationRepo
        .getMemoriesByPerson(personId, clampLimit(memoryLimit, 20, 100))
        .map((memory) => this.mapMemory(memory)),
      recentEncounters: this.encounterRepo
        .getEncountersByPerson(personId, clampLimit(encounterLimit, 10, 100))
        .map((encounter) => this.mapEncounter(encounter)),
      latestConversationSummary: latestConversation.summary,
      latestConversationRecordedAt: latestConversation.recordedAt,
    }
  }

  getPersonMemories(personId: string, limit?: number): MobileApiMemoriesResponse | null {
    const person = this.peopleRepo.findById(personId)
    if (!person) return null

    return {
      memories: this.conversationRepo
        .getMemoriesByPerson(personId, clampLimit(limit, 20, 100))
        .map((memory) => this.mapMemory(memory)),
    }
  }

  getMemoriesGroupedByPerson(limitPerPerson?: number): MobileApiMemoryGroupsResponse {
    const limit = clampLimit(limitPerPerson, 10, 50)

    return {
      groups: this.peopleRepo
        .findAll()
        .map((person) => ({
          person: this.mapPerson(person),
          memories: this.conversationRepo.getMemoriesByPerson(person.id, limit).map((memory) => this.mapMemory(memory)),
        }))
        .filter((group) => group.memories.length > 0),
    }
  }

  getRecentEncounters(limit?: number): MobileApiRecentEncountersResponse {
    return {
      encounters: this.encounterRepo
        .getRecentEncounters(clampLimit(limit, 20, 100))
        .map((encounter) => this.mapEncounter(encounter)),
    }
  }

  getHome(limit?: number): MobileApiHomeResponse {
    const people = this.peopleRepo.findAll()
    const self = this.peopleRepo.findSelf()

    return {
      self: self ? this.mapPerson(self) : null,
      people: people.map((person) => this.mapPerson(person)),
      recentEncounters: this.encounterRepo
        .getRecentEncounters(clampLimit(limit, 10, 100))
        .map((encounter) => this.mapEncounter(encounter)),
    }
  }

  private mapPerson(person: Person): MobileApiPerson {
    const latestThumbnail = this.peopleRepo.getEmbeddingsWithMeta(person.id).find((embedding) => Boolean(embedding.thumbnail))

    return {
      id: person.id,
      name: person.name,
      relationship: person.relationship,
      notes: person.notes,
      bio: person.bio,
      lastSeen: person.lastSeen,
      createdAt: person.createdAt,
      isSelf: person.isSelf,
      keyFacts: person.keyFacts,
      conversationStarters: person.conversationStarters,
      importantDates: person.importantDates,
      lastTopics: person.lastTopics,
      faceThumbnail: latestThumbnail?.thumbnail ?? null,
    }
  }

  private mapEncounter(encounter: EncounterWithPerson): MobileApiEncounter {
    return {
      id: encounter.id,
      personId: encounter.personId,
      personName: encounter.personName,
      startedAt: encounter.startedAt,
      endedAt: encounter.endedAt,
      avgConfidence: encounter.avgConfidence,
      peakConfidence: encounter.peakConfidence,
      isImportant: encounter.isImportant,
      createdAt: encounter.createdAt,
    }
  }

  private mapMemory(memory: PersonMemory) {
    return {
      id: memory.id,
      personId: memory.personId,
      memoryText: memory.memoryText,
      memoryType: memory.memoryType,
      memoryDate: memory.memoryDate,
      confidence: memory.confidence,
      createdAt: memory.createdAt,
    }
  }
}
