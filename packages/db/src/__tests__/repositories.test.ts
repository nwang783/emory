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

  it('searches people by fuzzy name with exact match first', () => {
    repo.create({ name: 'Ryan' })
    repo.create({ name: 'Ryanne' })
    repo.create({ name: 'Bryan' })

    const matches = repo.searchByName('ryan')
    expect(matches.map((person) => person.name)).toEqual(['Ryan', 'Ryanne', 'Bryan'])
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

  it('allows clearing auto-generated key facts', () => {
    const person = repo.create({ name: 'Test' })
    repo.updateProfile(person.id, {
      keyFacts: ['Likes coffee'],
    })

    const updated = repo.updateProfile(person.id, {
      keyFacts: [],
    })

    expect(updated!.keyFacts).toEqual([])
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

describe('ConversationRepository', () => {
  let adapter: SqliteAdapter
  let peopleRepo: PeopleRepository
  let conversationRepo: ConversationRepository

  beforeEach(() => {
    adapter = createTestAdapter()
    peopleRepo = new PeopleRepository(adapter)
    conversationRepo = new ConversationRepository(adapter)
  })

  it('creates conversation tables and indexes', () => {
    const db = adapter.getDb()
    const tables = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name IN ('conversation_recordings', 'person_memories')
      ORDER BY name
    `).all() as Array<{ name: string }>

    const indexes = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index' AND name IN (
        'idx_conversation_recordings_person_id',
        'idx_conversation_recordings_recorded_at',
        'idx_conversation_recordings_person_recorded_at',
        'idx_person_memories_person_id',
        'idx_person_memories_memory_date',
        'idx_person_memories_person_memory_date',
        'idx_person_memories_relationship_id'
      )
      ORDER BY name
    `).all() as Array<{ name: string }>

    expect(tables.map((row) => row.name)).toEqual(['conversation_recordings', 'person_memories'])
    expect(indexes.map((row) => row.name)).toEqual([
      'idx_conversation_recordings_person_id',
      'idx_conversation_recordings_person_recorded_at',
      'idx_conversation_recordings_recorded_at',
      'idx_person_memories_memory_date',
      'idx_person_memories_person_id',
      'idx_person_memories_person_memory_date',
      'idx_person_memories_relationship_id',
    ])
  })

  it('creates a recording row with pending statuses', () => {
    const person = peopleRepo.create({ name: 'John' })
    const recording = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: '2026-03-21T15:10:00.000Z',
      audioPath: '/tmp/test.webm',
      mimeType: 'audio/webm',
      durationMs: 42_000,
    })

    expect(recording.personId).toBe(person.id)
    expect(recording.transcriptStatus).toBe('pending')
    expect(recording.extractionStatus).toBe('pending')
  })

  it('uses explicit id when provided', () => {
    const person = peopleRepo.create({ name: 'John' })
    const explicitId = '00000000-0000-4000-8000-000000000001'
    const recording = conversationRepo.createRecording({
      id: explicitId,
      personId: person.id,
      recordedAt: '2026-03-21T15:10:00.000Z',
      audioPath: '/tmp/explicit.webm',
      mimeType: 'audio/webm',
    })
    expect(recording.id).toBe(explicitId)
    expect(conversationRepo.findRecordingById(explicitId)?.audioPath).toBe('/tmp/explicit.webm')
  })

  it('stores encounter id when provided', () => {
    const person = peopleRepo.create({ name: 'Ann' })
    const encounterRepo = new EncounterRepository(adapter)
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
    const forA = conversationRepo.getRecordingsByPerson(a.id, 50)
    expect(forA.length).toBe(1)
    expect(forA[0].personId).toBe(a.id)
  })

  it('saves transcript successfully', () => {
    const person = peopleRepo.create({ name: 'John' })
    const recording = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: '2026-03-21T15:10:00.000Z',
      audioPath: '/tmp/test.webm',
      mimeType: 'audio/webm',
    })

    const updated = conversationRepo.setTranscript(recording.id, 'Hello there', 'deepgram')
    expect(updated!.transcriptRawText).toBe('Hello there')
    expect(updated!.transcriptProvider).toBe('deepgram')
    expect(updated!.transcriptStatus).toBe('complete')
  })

  it('marks transcript failure without deleting the row', () => {
    const person = peopleRepo.create({ name: 'John' })
    const recording = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: '2026-03-21T15:10:00.000Z',
      audioPath: '/tmp/test.webm',
      mimeType: 'audio/webm',
    })

    const updated = conversationRepo.markTranscriptFailed(recording.id, 'deepgram unavailable')
    expect(updated!.transcriptStatus).toBe('failed')
    expect(updated!.transcriptError).toContain('deepgram')
    expect(conversationRepo.findRecordingById(recording.id)).not.toBeNull()
  })

  it('saves extraction JSON successfully', () => {
    const person = peopleRepo.create({ name: 'John' })
    const recording = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: '2026-03-21T15:10:00.000Z',
      audioPath: '/tmp/test.webm',
      mimeType: 'audio/webm',
    })

    conversationRepo.setTranscript(recording.id, 'He started physical therapy.', 'deepgram')
    const updated = conversationRepo.setExtractionResult(recording.id, {
      summary: 'John discussed therapy.',
      memories: [{
        memoryText: 'John started physical therapy.',
        memoryType: 'health',
        memoryDate: '2026-03-21T15:10:00.000Z',
        confidence: 0.91,
        sourceQuote: 'I started physical therapy.',
        appliesToPerson: 'target_person',
      }],
      uncertainItems: [],
    })

    expect(updated!.extractionStatus).toBe('complete')
    expect(updated!.extractionJson?.summary).toBe('John discussed therapy.')
    expect(updated!.transcriptRawText).toBe('He started physical therapy.')
  })

  it('marks extraction failure while preserving transcript', () => {
    const person = peopleRepo.create({ name: 'John' })
    const recording = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: '2026-03-21T15:10:00.000Z',
      audioPath: '/tmp/test.webm',
      mimeType: 'audio/webm',
    })

    conversationRepo.setTranscript(recording.id, 'He started physical therapy.', 'deepgram')
    const updated = conversationRepo.markExtractionFailed(recording.id, 'schema validation failed')

    expect(updated!.extractionStatus).toBe('failed')
    expect(updated!.extractionError).toContain('schema')
    expect(updated!.transcriptRawText).toBe('He started physical therapy.')
  })

  it('inserts and queries memories by person newest first with limit', () => {
    const person = peopleRepo.create({ name: 'John' })
    const other = peopleRepo.create({ name: 'Jane' })
    const recording = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: '2026-03-21T15:10:00.000Z',
      audioPath: '/tmp/test.webm',
      mimeType: 'audio/webm',
    })

    const inserted = conversationRepo.addMemories([
      {
        personId: person.id,
        recordingId: recording.id,
        memoryText: 'John mentioned Emily is visiting next week.',
        memoryType: 'relationship',
        memoryDate: '2026-03-21T15:10:00.000Z',
        confidence: 0.92,
      },
      {
        personId: person.id,
        recordingId: recording.id,
        memoryText: 'John started physical therapy this month.',
        memoryType: 'health',
        memoryDate: '2026-03-22T15:10:00.000Z',
        confidence: 0.95,
      },
      {
        personId: other.id,
        memoryText: 'Jane likes tea.',
        memoryType: 'preference',
        memoryDate: '2026-03-23T15:10:00.000Z',
        confidence: 0.8,
      },
    ])

    expect(inserted.length).toBe(3)

    const memories = conversationRepo.getMemoriesByPerson(person.id, 1)
    expect(memories).toHaveLength(1)
    expect(memories[0].memoryText).toContain('physical therapy')
    expect(memories[0].recordingId).toBe(recording.id)
    expect(memories[0].relationshipId).toBeNull()
  })

  it('returns all memories for a person without a limit cap', () => {
    const john = peopleRepo.create({ name: 'John' })
    const jane = peopleRepo.create({ name: 'Jane' })
    const recording = conversationRepo.createRecording({
      personId: john.id,
      recordedAt: '2026-03-21T15:00:00.000Z',
      audioPath: '/tmp/test.wav',
      mimeType: 'audio/wav',
    })

    conversationRepo.addMemories([
      {
        personId: john.id,
        recordingId: recording.id,
        memoryText: 'John likes baseball.',
        memoryType: 'preference',
        memoryDate: '2026-03-21T15:10:00.000Z',
      },
      {
        personId: john.id,
        recordingId: recording.id,
        memoryText: 'John started physical therapy.',
        memoryType: 'health',
        memoryDate: '2026-03-22T15:10:00.000Z',
      },
      {
        personId: jane.id,
        recordingId: recording.id,
        memoryText: 'Jane likes tea.',
        memoryType: 'preference',
        memoryDate: '2026-03-23T15:10:00.000Z',
      },
    ])

    const memories = conversationRepo.getAllMemoriesByPerson(john.id)
    expect(memories).toHaveLength(2)
    expect(memories[0].memoryText).toContain('physical therapy')
    expect(memories[1].memoryText).toContain('baseball')
  })

  it('upserts graph relationship memory by relationship_id', () => {
    const me = peopleRepo.create({ name: 'Alex' })
    const other = peopleRepo.create({ name: 'Yiddy' })
    peopleRepo.setSelfPerson(me.id)
    const relRepo = new RelationshipRepository(adapter)
    const rel = relRepo.create(me.id, other.id, 'friend')

    const first = conversationRepo.upsertMemoryForGraphRelationship({
      relationshipId: rel.id,
      personId: other.id,
      memoryText: 'Alex is my friend.',
      memoryDate: '2026-01-01T00:00:00.000Z',
    })
    expect(first.relationshipId).toBe(rel.id)
    expect(first.personId).toBe(other.id)
    expect(first.memoryType).toBe('relationship')
    expect(first.recordingId).toBeNull()

    const second = conversationRepo.upsertMemoryForGraphRelationship({
      relationshipId: rel.id,
      personId: other.id,
      memoryText: 'Alex is my colleague.',
      memoryDate: '2026-06-01T00:00:00.000Z',
    })
    expect(second.id).toBe(first.id)
    expect(second.memoryText).toBe('Alex is my colleague.')
    expect(conversationRepo.getMemoriesByPerson(other.id, 10)).toHaveLength(1)
  })

  it('deleteMemoriesByRelationshipId removes linked memory', () => {
    const me = peopleRepo.create({ name: 'Alex' })
    const other = peopleRepo.create({ name: 'Yiddy' })
    peopleRepo.setSelfPerson(me.id)
    const relRepo = new RelationshipRepository(adapter)
    const rel = relRepo.create(me.id, other.id, 'friend')

    conversationRepo.upsertMemoryForGraphRelationship({
      relationshipId: rel.id,
      personId: other.id,
      memoryText: 'Alex is my friend.',
      memoryDate: '2026-01-01T00:00:00.000Z',
    })
    expect(conversationRepo.deleteMemoriesByRelationshipId(rel.id)).toBe(1)
    expect(conversationRepo.getMemoriesByPerson(other.id, 10)).toHaveLength(0)
  })

  it('gets recordings by person newest first', () => {
    const person = peopleRepo.create({ name: 'John' })

    conversationRepo.createRecording({
      personId: person.id,
      recordedAt: '2026-03-20T15:10:00.000Z',
      audioPath: '/tmp/older.webm',
      mimeType: 'audio/webm',
    })
    conversationRepo.createRecording({
      personId: person.id,
      recordedAt: '2026-03-21T15:10:00.000Z',
      audioPath: '/tmp/newer.webm',
      mimeType: 'audio/webm',
    })

    const recordings = conversationRepo.getRecordingsByPerson(person.id, 2)
    expect(recordings).toHaveLength(2)
    expect(recordings[0].audioPath).toBe('/tmp/newer.webm')
  })

  it('deleting a person cascades recordings and memories', () => {
    const person = peopleRepo.create({ name: 'John' })
    const recording = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: '2026-03-21T15:10:00.000Z',
      audioPath: '/tmp/test.webm',
      mimeType: 'audio/webm',
    })

    conversationRepo.addMemories([{
      personId: person.id,
      recordingId: recording.id,
      memoryText: 'John likes baseball.',
      memoryType: 'preference',
      memoryDate: '2026-03-21T15:10:00.000Z',
    }])

    expect(peopleRepo.delete(person.id)).toBe(true)
    expect(conversationRepo.findRecordingById(recording.id)).toBeNull()
    expect(conversationRepo.getMemoriesByPerson(person.id)).toHaveLength(0)
  })

  it('searches memories by person, time range, and text', () => {
    const self = peopleRepo.create({ name: 'Grandma Test' })
    const ryan = peopleRepo.create({ name: 'Ryan' })

    conversationRepo.addMemories([
      {
        personId: self.id,
        memoryText: 'You had lunch with Ryan at 2 PM.',
        memoryType: 'event',
        memoryDate: '2026-03-21T14:00:00.000Z',
      },
      {
        personId: self.id,
        memoryText: 'You watered the garden at 4 PM.',
        memoryType: 'routine',
        memoryDate: '2026-03-21T16:00:00.000Z',
      },
      {
        personId: ryan.id,
        memoryText: 'Ryan goes to UVA.',
        memoryType: 'fact',
        memoryDate: '2026-03-20T14:00:00.000Z',
      },
    ])

    const matches = conversationRepo.searchMemories({
      personIds: [self.id],
      startAt: '2026-03-21T13:30:00.000Z',
      endAt: '2026-03-21T14:30:00.000Z',
      searchText: 'lunch',
    })

    expect(matches).toHaveLength(1)
    expect(matches[0].memoryText).toContain('lunch with Ryan')
  })

  it('searches recordings by transcript text and time range', () => {
    const person = peopleRepo.create({ name: 'Ryan' })
    const older = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: '2026-03-21T13:00:00.000Z',
      audioPath: '/tmp/older.webm',
      mimeType: 'audio/webm',
    })
    const newer = conversationRepo.createRecording({
      personId: person.id,
      recordedAt: '2026-03-21T14:00:00.000Z',
      audioPath: '/tmp/newer.webm',
      mimeType: 'audio/webm',
    })

    conversationRepo.setTranscript(older.id, 'We talked about lunch plans.', 'deepgram')
    conversationRepo.setTranscript(newer.id, 'Ryan said UVA is going great.', 'deepgram')

    const matches = conversationRepo.searchRecordings({
      personIds: [person.id],
      startAt: '2026-03-21T13:30:00.000Z',
      endAt: '2026-03-21T14:30:00.000Z',
      transcriptSearchText: 'uva',
    })

    expect(matches).toHaveLength(1)
    expect(matches[0].id).toBe(newer.id)
  })
})
