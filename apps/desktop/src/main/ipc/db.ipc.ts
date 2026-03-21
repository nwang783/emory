import { app, ipcMain } from 'electron'
import path from 'node:path'
import {
  SqliteAdapter,
  PeopleRepository,
  EncounterRepository,
  UnknownSightingRepository,
  RelationshipRepository,
  RetentionRepository,
  ConversationRepository,
} from '@emory/db'
import type { CreatePersonInput, RelationshipType, UpdatePersonInput } from '@emory/db'
import { syncGraphRelationshipToMemory } from '../services/relationship-memory-sync.service.js'

const VALID_RELATIONSHIP_TYPES = [
  'spouse', 'child', 'parent', 'sibling', 'friend',
  'carer', 'neighbour', 'colleague', 'other',
] as const satisfies readonly RelationshipType[]

function normalizeRelationshipType(type: string): RelationshipType {
  return VALID_RELATIONSHIP_TYPES.includes(type as (typeof VALID_RELATIONSHIP_TYPES)[number])
    ? (type as RelationshipType)
    : 'other'
}

function normalizeRelationshipTypeOptional(type: string | undefined): RelationshipType | undefined {
  if (type === undefined) return undefined
  return normalizeRelationshipType(type)
}

type DbIpcResult = {
  adapter: SqliteAdapter
  peopleRepo: PeopleRepository
  encounterRepo: EncounterRepository
  unknownRepo: UnknownSightingRepository
  relationshipRepo: RelationshipRepository
  retentionRepo: RetentionRepository
  conversationRepo: ConversationRepository
}

export function registerDbIpc(): DbIpcResult {
  const dbPath = path.join(app.getPath('userData'), 'emory.db')
  const adapter = new SqliteAdapter(dbPath)
  adapter.initialize()

  const peopleRepo = new PeopleRepository(adapter)
  const encounterRepo = new EncounterRepository(adapter)
  const unknownRepo = new UnknownSightingRepository(adapter)
  const relationshipRepo = new RelationshipRepository(adapter)
  const retentionRepo = new RetentionRepository(adapter)
  const conversationRepo = new ConversationRepository(adapter)

  // --- People handlers ---

  ipcMain.handle('db:people:create', (_event, input: CreatePersonInput) => {
    return peopleRepo.create(input)
  })

  ipcMain.handle('db:people:find-all', () => {
    return peopleRepo.findAll()
  })

  ipcMain.handle('db:people:find-by-id', (_event, id: string) => {
    return peopleRepo.findById(id)
  })

  ipcMain.handle('db:people:update', (_event, id: string, input: UpdatePersonInput) => {
    return peopleRepo.update(id, input)
  })

  ipcMain.handle('db:people:delete', (_event, id: string) => {
    return peopleRepo.delete(id)
  })

  ipcMain.handle('db:people:merge', (_event, keepId: string, mergeId: string) => {
    return peopleRepo.mergePeople(keepId, mergeId)
  })

  ipcMain.handle('db:people:update-profile', (_event, id: string, profile: {
    keyFacts?: string[]
    conversationStarters?: string[]
    importantDates?: Array<{ label: string; date: string }>
    lastTopics?: string[]
  }) => {
    return peopleRepo.updateProfile(id, profile)
  })

  ipcMain.handle('db:people:get-self', () => {
    return peopleRepo.findSelf()
  })

  ipcMain.handle('db:people:set-self', (_event, personId: string | null) => {
    peopleRepo.setSelfPerson(personId)
  })

  // --- Relationship handlers ---

  ipcMain.handle('db:relationships:create', (_event, personAId: string, personBId: string, type: string, notes?: string) => {
    if (relationshipRepo.findBetween(personAId, personBId)) {
      throw new Error('A relationship already exists between these people')
    }
    const relType = normalizeRelationshipType(type)
    const relationship = relationshipRepo.create(personAId, personBId, relType, notes)
    syncGraphRelationshipToMemory({ peopleRepo, conversationRepo, relationship })
    return relationship
  })

  ipcMain.handle('db:relationships:get-by-person', (_event, personId: string) => {
    return relationshipRepo.findByPerson(personId)
  })

  ipcMain.handle('db:relationships:update', (_event, id: string, type?: string, notes?: string) => {
    const relType = normalizeRelationshipTypeOptional(type)
    const relationship = relationshipRepo.update(id, relType, notes)
    if (relationship) {
      syncGraphRelationshipToMemory({ peopleRepo, conversationRepo, relationship })
    }
    return relationship
  })

  ipcMain.handle('db:relationships:get-all', () => {
    return relationshipRepo.findAll()
  })

  ipcMain.handle('db:relationships:delete', (_event, id: string) => {
    conversationRepo.deleteMemoriesByRelationshipId(id)
    return relationshipRepo.delete(id)
  })

  // --- Embedding management handlers ---

  ipcMain.handle('db:embeddings:get-by-person', (_event, personId: string) => {
    return peopleRepo.getEmbeddingsWithMeta(personId)
  })

  ipcMain.handle('db:embeddings:delete', (_event, embeddingId: string) => {
    return peopleRepo.deleteEmbedding(embeddingId)
  })

  ipcMain.handle('db:embeddings:reassign', (_event, embeddingId: string, newPersonId: string) => {
    return peopleRepo.reassignEmbedding(embeddingId, newPersonId)
  })

  ipcMain.handle('db:embeddings:get-all-grouped', () => {
    return peopleRepo.getAllEmbeddingsGrouped()
  })

  // --- Retention handlers ---

  ipcMain.handle('db:retention:get-all', () => {
    return retentionRepo.getAll()
  })

  ipcMain.handle('db:retention:upsert', (_event, entityType: string, retentionDays: number, keepImportant: boolean) => {
    return retentionRepo.upsert(entityType, retentionDays, keepImportant)
  })

  app.on('before-quit', () => {
    adapter.close()
  })

  return { adapter, peopleRepo, encounterRepo, unknownRepo, relationshipRepo, retentionRepo, conversationRepo }
}
