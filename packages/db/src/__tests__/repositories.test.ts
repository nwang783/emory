import { describe, it, expect, beforeEach } from 'vitest'
import { SqliteAdapter } from '../adapters/sqlite.adapter.js'
import { PeopleRepository } from '../repositories/people.repository.js'
import { EncounterRepository } from '../repositories/encounter.repository.js'
import { UnknownSightingRepository } from '../repositories/unknown-sighting.repository.js'
import { RelationshipRepository } from '../repositories/relationship.repository.js'
import { RetentionRepository } from '../repositories/retention.repository.js'
import { ConversationRepository } from '../repositories/conversation.repository.js'

function createTestAdapter(): SqliteAdapter {
  const adapter = new SqliteAdapter(':memory:')
  adapter.initialize()
  return adapter
}

describe('PeopleRepository', () => {
  let adapter: SqliteAdapter
  let repo: PeopleRepository

  beforeEach(() => {
    adapter = createTestAdapter()
    repo = new PeopleRepository(adapter)
  })

  it('creates and retrieves a person', () => {
    const person = repo.create({ name: 'John', relationship: 'son', notes: 'Test' })
    expect(person.name).toBe('John')
    expect(person.relationship).toBe('son')
    expect(person.id).toBeTruthy()

    const found = repo.findById(person.id)
    expect(found).not.toBeNull()
    expect(found!.name).toBe('John')
  })

  it('finds all people', () => {
    repo.create({ name: 'Alice' })
    repo.create({ name: 'Bob' })
    const all = repo.findAll()
    expect(all.length).toBe(2)
  })

  it('updates a person', () => {
    const person = repo.create({ name: 'Old Name' })
    const updated = repo.update(person.id, { name: 'New Name' })
    expect(updated!.name).toBe('New Name')
  })

  it('deletes a person', () => {
    const person = repo.create({ name: 'ToDelete' })
    expect(repo.delete(person.id)).toBe(true)
    expect(repo.findById(person.id)).toBeNull()
  })

  it('manages embeddings', () => {
    const person = repo.create({ name: 'Test' })
    const emb = new Float32Array(512).fill(0.1)
    const saved = repo.addEmbedding(person.id, emb, 'photo_upload')
    expect(saved.id).toBeTruthy()

    const embeddings = repo.getEmbeddings(person.id)
    expect(embeddings.length).toBe(1)
    expect(repo.countEmbeddings(person.id)).toBe(1)
  })

  it('updates profile fields', () => {
    const person = repo.create({ name: 'Test' })
    const updated = repo.updateProfile(person.id, {
      keyFacts: ['Likes coffee'],
      conversationStarters: ['Ask about garden'],
      importantDates: [{ label: 'Birthday', date: '2000-01-01' }],
      lastTopics: ['Weather'],
    })
    expect(updated!.keyFacts).toEqual(['Likes coffee'])
    expect(updated!.importantDates).toEqual([{ label: 'Birthday', date: '2000-01-01' }])
  })

  it('merges two people', () => {
    const keep = repo.create({ name: 'Keep' })
    const merge = repo.create({ name: 'Merge' })
    repo.addEmbedding(merge.id, new Float32Array(512).fill(0.2), 'photo_upload')

    const result = repo.mergePeople(keep.id, merge.id)
    expect(result!.name).toBe('Keep')
    expect(repo.findById(merge.id)).toBeNull()
    expect(repo.countEmbeddings(keep.id)).toBe(1)
  })

  it('updates last seen', () => {
    const person = repo.create({ name: 'Test' })
    expect(person.lastSeen).toBeNull()
    repo.updateLastSeen(person.id)
    const updated = repo.findById(person.id)
    expect(updated!.lastSeen).not.toBeNull()
  })

  it('findSelf returns null when nobody is marked', () => {
    repo.create({ name: 'A' })
    expect(repo.findSelf()).toBeNull()
  })

  it('setSelfPerson marks one person and clears the previous', () => {
    const a = repo.create({ name: 'A' })
    const b = repo.create({ name: 'B' })
    repo.setSelfPerson(a.id)
    expect(repo.findSelf()?.id).toBe(a.id)
    expect(repo.findById(a.id)!.isSelf).toBe(true)
    expect(repo.findById(b.id)!.isSelf).toBe(false)

    repo.setSelfPerson(b.id)
    expect(repo.findSelf()?.id).toBe(b.id)
    expect(repo.findById(a.id)!.isSelf).toBe(false)
    expect(repo.findById(b.id)!.isSelf).toBe(true)
  })

  it('setSelfPerson(null) clears self', () => {
    const a = repo.create({ name: 'A' })
    repo.setSelfPerson(a.id)
    repo.setSelfPerson(null)
    expect(repo.findSelf()).toBeNull()
  })

  it('merging away the self person moves is_self to the kept row', () => {
    const keep = repo.create({ name: 'Keep' })
    const merge = repo.create({ name: 'Merge' })
    repo.setSelfPerson(merge.id)
    const result = repo.mergePeople(keep.id, merge.id)
    expect(result!.isSelf).toBe(true)
    expect(repo.findSelf()?.id).toBe(keep.id)
  })
})

describe('EncounterRepository', () => {
  let adapter: SqliteAdapter
  let encounterRepo: EncounterRepository
  let peopleRepo: PeopleRepository

  beforeEach(() => {
    adapter = createTestAdapter()
    encounterRepo = new EncounterRepository(adapter)
    peopleRepo = new PeopleRepository(adapter)
  })

  it('creates a session', () => {
    const session = encounterRepo.createSession('test-device')
    expect(session.id).toBeTruthy()
    expect(session.deviceId).toBe('test-device')
    expect(session.totalEncounters).toBe(0)
  })

  it('ends a session', () => {
    const session = encounterRepo.createSession()
    const ended = encounterRepo.endSession(session.id)
    expect(ended!.endedAt).not.toBeNull()
  })

  it('creates an encounter', () => {
    const person = peopleRepo.create({ name: 'John' })
    const session = encounterRepo.createSession()
    const encounter = encounterRepo.createEncounter(person.id, session.id, 0.85)
    expect(encounter.personId).toBe(person.id)
    expect(encounter.avgConfidence).toBe(0.85)
  })

  it('finds active encounter within window', () => {
    const person = peopleRepo.create({ name: 'John' })
    const session = encounterRepo.createSession()
    encounterRepo.createEncounter(person.id, session.id, 0.85)

    const active = encounterRepo.findActiveEncounter(person.id, session.id)
    expect(active).not.toBeNull()
  })

  it('counts encounters by person', () => {
    const person = peopleRepo.create({ name: 'John' })
    const session = encounterRepo.createSession()
    encounterRepo.createEncounter(person.id, session.id, 0.85)
    encounterRepo.createEncounter(person.id, session.id, 0.90)

    expect(encounterRepo.getEncounterCountByPerson(person.id)).toBe(2)
  })
})

describe('UnknownSightingRepository', () => {
  let adapter: SqliteAdapter
  let repo: UnknownSightingRepository

  beforeEach(() => {
    adapter = createTestAdapter()
    repo = new UnknownSightingRepository(adapter)
  })

  it('creates an unknown sighting', () => {
    const sighting = repo.create('unknown_001', new Float32Array(512).fill(0.1), 0.3)
    expect(sighting.tempId).toBe('unknown_001')
    expect(sighting.status).toBe('tracking')
    expect(sighting.sightingCount).toBe(1)
  })

  it('finds by temp id', () => {
    repo.create('temp_1')
    const found = repo.findByTempId('temp_1')
    expect(found).not.toBeNull()
    expect(found!.tempId).toBe('temp_1')
  })

  it('dismisses a sighting', () => {
    const sighting = repo.create('temp_1')
    const dismissed = repo.dismiss(sighting.id)
    expect(dismissed!.status).toBe('dismissed')
  })

  it('counts active sightings', () => {
    repo.create('temp_1')
    repo.create('temp_2')
    expect(repo.getActiveCount()).toBe(2)
  })
})

describe('RelationshipRepository', () => {
  let adapter: SqliteAdapter
  let relRepo: RelationshipRepository
  let peopleRepo: PeopleRepository

  beforeEach(() => {
    adapter = createTestAdapter()
    relRepo = new RelationshipRepository(adapter)
    peopleRepo = new PeopleRepository(adapter)
  })

  it('creates a relationship', () => {
    const a = peopleRepo.create({ name: 'John' })
    const b = peopleRepo.create({ name: 'Sarah' })
    const rel = relRepo.create(a.id, b.id, 'spouse')
    expect(rel.relationshipType).toBe('spouse')
  })

  it('finds relationships by person', () => {
    const a = peopleRepo.create({ name: 'John' })
    const b = peopleRepo.create({ name: 'Sarah' })
    relRepo.create(a.id, b.id, 'spouse')

    const rels = relRepo.findByPerson(a.id)
    expect(rels.length).toBe(1)
    expect(rels[0].personAName).toBe('John')
  })

  it('finds between two people', () => {
    const a = peopleRepo.create({ name: 'John' })
    const b = peopleRepo.create({ name: 'Sarah' })
    relRepo.create(a.id, b.id, 'spouse')

    const found = relRepo.findBetween(b.id, a.id)
    expect(found).not.toBeNull()
  })
})

describe('ConversationRepository', () => {
  let adapter: SqliteAdapter
  let conversationRepo: ConversationRepository
  let peopleRepo: PeopleRepository
  let encounterRepo: EncounterRepository

  beforeEach(() => {
    adapter = createTestAdapter()
    conversationRepo = new ConversationRepository(adapter)
    peopleRepo = new PeopleRepository(adapter)
    encounterRepo = new EncounterRepository(adapter)
  })

  it('creates a recording with pending statuses', () => {
    const person = peopleRepo.create({ name: 'Ann' })
    const rec = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: new Date().toISOString(),
      audioPath: '/tmp/a.webm',
      mimeType: 'audio/webm',
    })
    expect(rec.transcriptStatus).toBe('pending')
    expect(rec.parseStatus).toBe('pending')
    expect(rec.personId).toBe(person.id)
  })

  it('sets transcript and marks complete', () => {
    const person = peopleRepo.create({ name: 'Ann' })
    const rec = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: new Date().toISOString(),
      audioPath: '/tmp/a.webm',
      mimeType: 'audio/webm',
    })
    const updated = conversationRepo.setTranscript(rec.id, 'hello world', 'stub')
    expect(updated!.transcriptText).toBe('hello world')
    expect(updated!.transcriptStatus).toBe('complete')
    expect(updated!.transcriptProvider).toBe('stub')
  })

  it('marks transcript failed without removing row', () => {
    const person = peopleRepo.create({ name: 'Ann' })
    const rec = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: new Date().toISOString(),
      audioPath: '/tmp/a.webm',
      mimeType: 'audio/webm',
    })
    const updated = conversationRepo.markTranscriptFailed(rec.id, 'STT down')
    expect(updated!.transcriptStatus).toBe('failed')
    expect(updated!.transcriptError).toBe('STT down')
    expect(conversationRepo.findRecordingById(rec.id)).not.toBeNull()
  })

  it('marks parse failed but keeps transcript', () => {
    const person = peopleRepo.create({ name: 'Ann' })
    const rec = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: new Date().toISOString(),
      audioPath: '/tmp/a.webm',
      mimeType: 'audio/webm',
    })
    conversationRepo.setTranscript(rec.id, 'still here')
    const failed = conversationRepo.markParseFailed(rec.id, 'LLM error')
    expect(failed!.parseStatus).toBe('failed')
    expect(failed!.parseError).toBe('LLM error')
    expect(failed!.transcriptText).toBe('still here')
  })

  it('inserts memories and queries by person newest first', () => {
    const person = peopleRepo.create({ name: 'Ann' })
    const rec = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: new Date().toISOString(),
      audioPath: '/tmp/a.webm',
      mimeType: 'audio/webm',
    })
    conversationRepo.addMemories([
      {
        personId: person.id,
        recordingId: rec.id,
        memoryText: 'older',
        memoryDate: '2020-01-01T00:00:00.000Z',
        sourceType: 'conversation',
      },
      {
        personId: person.id,
        recordingId: rec.id,
        memoryText: 'newer',
        memoryDate: '2025-01-01T00:00:00.000Z',
        sourceType: 'conversation',
      },
    ])
    const memories = conversationRepo.getMemoriesByPerson(person.id, 10)
    expect(memories.length).toBe(2)
    expect(memories[0].memoryText).toBe('newer')
    expect(memories[1].memoryText).toBe('older')
  })

  it('getRecordingsByPerson returns only that person', () => {
    const a = peopleRepo.create({ name: 'A' })
    const b = peopleRepo.create({ name: 'B' })
    conversationRepo.createRecording({
      personId: a.id,
      recordedAt: '2024-01-01T00:00:00.000Z',
      audioPath: '/a.webm',
      mimeType: 'audio/webm',
    })
    conversationRepo.createRecording({
      personId: b.id,
      recordedAt: '2024-06-01T00:00:00.000Z',
      audioPath: '/b.webm',
      mimeType: 'audio/webm',
    })
    const forA = conversationRepo.getRecordingsByPerson(a.id)
    expect(forA.length).toBe(1)
    expect(forA[0].personId).toBe(a.id)
  })

  it('stores encounter id when provided', () => {
    const person = peopleRepo.create({ name: 'Ann' })
    const session = encounterRepo.createSession()
    const enc = encounterRepo.createEncounter(person.id, session.id, 0.9)
    const rec = conversationRepo.createRecording({
      personId: person.id,
      encounterId: enc.id,
      recordedAt: new Date().toISOString(),
      audioPath: '/tmp/a.webm',
      mimeType: 'audio/webm',
    })
    expect(rec.encounterId).toBe(enc.id)
  })

  it('deleting person cascades recordings and memories', () => {
    const person = peopleRepo.create({ name: 'Ann' })
    const rec = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: new Date().toISOString(),
      audioPath: '/tmp/a.webm',
      mimeType: 'audio/webm',
    })
    conversationRepo.addMemories([
      {
        personId: person.id,
        recordingId: rec.id,
        memoryText: 'm',
        memoryDate: new Date().toISOString(),
        sourceType: 'conversation',
      },
    ])
    peopleRepo.delete(person.id)
    expect(conversationRepo.findRecordingById(rec.id)).toBeNull()
    expect(conversationRepo.getMemoriesByPerson(person.id).length).toBe(0)
  })
})

describe('RetentionRepository', () => {
  let adapter: SqliteAdapter
  let repo: RetentionRepository

  beforeEach(() => {
    adapter = createTestAdapter()
    repo = new RetentionRepository(adapter)
  })

  it('reads default retention configs', () => {
    const all = repo.getAll()
    expect(all.length).toBe(3)
  })

  it('upserts retention config', () => {
    repo.upsert('encounters', 180, true)
    const config = repo.getByEntityType('encounters')
    expect(config!.retentionDays).toBe(180)
    expect(config!.keepImportant).toBe(true)
  })
})
