import { v4 as uuidv4 } from 'uuid'
import type { SqliteAdapter } from '../adapters/sqlite.adapter.js'
import type {
  Person,
  CreatePersonInput,
  UpdatePersonInput,
  ImportantDate,
  FaceEmbedding,
  FaceEmbeddingWithPerson,
  PersonRow,
  FaceEmbeddingRow,
  FaceEmbeddingWithPersonRow,
} from '../types.js'

function parseJsonArray<T>(value: string | null): T[] {
  if (!value) return []
  try {
    return JSON.parse(value) as T[]
  } catch {
    return []
  }
}

function rowToPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    relationship: row.relationship,
    notes: row.notes,
    photos: row.photos,
    firstMet: row.first_met,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
    isSelf: row.is_self === 1,
    keyFacts: parseJsonArray<string>(row.key_facts),
    conversationStarters: parseJsonArray<string>(row.conversation_starters),
    importantDates: parseJsonArray(row.important_dates),
    lastTopics: parseJsonArray<string>(row.last_topics),
  }
}

function rowToEmbedding(row: FaceEmbeddingRow): FaceEmbedding {
  return {
    id: row.id,
    personId: row.person_id,
    embedding: new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4),
    source: row.source as FaceEmbedding['source'],
    thumbnail: row.thumbnail ?? null,
    qualityScore: row.quality_score ?? null,
    createdAt: row.created_at,
  }
}

function rowToEmbeddingWithPerson(row: FaceEmbeddingWithPersonRow): FaceEmbeddingWithPerson {
  return {
    ...rowToEmbedding(row),
    personName: row.person_name,
  }
}

export class PeopleRepository {
  constructor(private adapter: SqliteAdapter) {}

  create(input: CreatePersonInput): Person {
    const db = this.adapter.getDb()
    const id = uuidv4()
    const now = new Date().toISOString()

    const stmt = db.prepare(`
      INSERT INTO people (id, name, relationship, notes, created_at)
      VALUES (?, ?, ?, ?, ?)
    `)

    stmt.run(id, input.name, input.relationship ?? null, input.notes ?? null, now)

    return this.findById(id) as Person
  }

  findById(id: string): Person | null {
    const db = this.adapter.getDb()
    const row = db.prepare('SELECT * FROM people WHERE id = ?').get(id) as PersonRow | undefined

    if (!row) return null
    return rowToPerson(row)
  }

  findAll(): Person[] {
    const db = this.adapter.getDb()
    const rows = db.prepare('SELECT * FROM people ORDER BY created_at DESC').all() as PersonRow[]

    return rows.map(rowToPerson)
  }

  searchByName(query: string, limit: number = 5): Person[] {
    const db = this.adapter.getDb()
    const normalized = query.trim().toLowerCase()
    if (!normalized) return []

    const likeValue = `%${normalized}%`
    const rows = db.prepare(`
      SELECT *
      FROM people
      WHERE lower(name) LIKE ?
      ORDER BY
        CASE
          WHEN lower(name) = ? THEN 0
          WHEN lower(name) LIKE ? THEN 1
          ELSE 2
        END,
        length(name) ASC,
        created_at DESC
      LIMIT ?
    `).all(likeValue, normalized, `${normalized}%`, limit) as PersonRow[]

    return rows.map(rowToPerson)
  }

  findSelf(): Person | null {
    const db = this.adapter.getDb()
    const row = db.prepare('SELECT * FROM people WHERE is_self = 1 LIMIT 1').get() as PersonRow | undefined
    return row ? rowToPerson(row) : null
  }

  setSelfPerson(personId: string | null): void {
    const db = this.adapter.getDb()

    if (personId === null) {
      db.prepare('UPDATE people SET is_self = 0').run()
      return
    }

    const exists = db.prepare('SELECT 1 FROM people WHERE id = ?').get(personId)
    if (!exists) {
      throw new Error('Person not found')
    }

    const apply = db.transaction(() => {
      db.prepare('UPDATE people SET is_self = 0').run()
      db.prepare('UPDATE people SET is_self = 1 WHERE id = ?').run(personId)
    })
    apply()
  }

  update(id: string, input: UpdatePersonInput): Person | null {
    const db = this.adapter.getDb()
    const existing = this.findById(id)

    if (!existing) return null

    const fields: string[] = []
    const values: unknown[] = []

    if (input.name !== undefined) {
      fields.push('name = ?')
      values.push(input.name)
    }

    if (input.relationship !== undefined) {
      fields.push('relationship = ?')
      values.push(input.relationship)
    }

    if (input.notes !== undefined) {
      fields.push('notes = ?')
      values.push(input.notes)
    }

    if (fields.length === 0) return existing

    values.push(id)

    const stmt = db.prepare(`UPDATE people SET ${fields.join(', ')} WHERE id = ?`)
    stmt.run(...values)

    return this.findById(id)
  }

  delete(id: string): boolean {
    const db = this.adapter.getDb()
    const result = db.prepare('DELETE FROM people WHERE id = ?').run(id)

    return result.changes > 0
  }

  countEmbeddings(personId: string): number {
    const db = this.adapter.getDb()
    const row = db
      .prepare('SELECT COUNT(*) as count FROM face_embeddings WHERE person_id = ?')
      .get(personId) as { count: number }
    return row.count
  }

  countEmbeddingsBySource(personId: string, source: string): number {
    const db = this.adapter.getDb()
    const row = db
      .prepare('SELECT COUNT(*) as count FROM face_embeddings WHERE person_id = ? AND source = ?')
      .get(personId, source) as { count: number }
    return row.count
  }

  deleteOldestEmbeddingBySource(personId: string, source: string): boolean {
    const db = this.adapter.getDb()
    const oldest = db
      .prepare('SELECT id FROM face_embeddings WHERE person_id = ? AND source = ? ORDER BY created_at ASC LIMIT 1')
      .get(personId, source) as { id: string } | undefined

    if (!oldest) return false
    const result = db.prepare('DELETE FROM face_embeddings WHERE id = ?').run(oldest.id)
    return result.changes > 0
  }

  addEmbedding(
    personId: string,
    embedding: Float32Array,
    source: 'photo_upload' | 'live_capture' | 'auto_learn',
    thumbnail?: string,
    qualityScore?: number,
  ): FaceEmbedding {
    const db = this.adapter.getDb()
    const id = uuidv4()
    const now = new Date().toISOString()
    const buffer = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength)

    const stmt = db.prepare(`
      INSERT INTO face_embeddings (id, person_id, embedding, source, thumbnail, quality_score, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)

    stmt.run(id, personId, buffer, source, thumbnail ?? null, qualityScore ?? null, now)

    return {
      id,
      personId,
      embedding,
      source,
      thumbnail: thumbnail ?? null,
      qualityScore: qualityScore ?? null,
      createdAt: now,
    }
  }

  getEmbeddings(personId: string): FaceEmbedding[] {
    const db = this.adapter.getDb()
    const rows = db
      .prepare('SELECT * FROM face_embeddings WHERE person_id = ? ORDER BY created_at DESC')
      .all(personId) as FaceEmbeddingRow[]

    return rows.map(rowToEmbedding)
  }

  getAllEmbeddings(): FaceEmbeddingWithPerson[] {
    const db = this.adapter.getDb()
    const rows = db
      .prepare(`
        SELECT fe.*, p.name as person_name
        FROM face_embeddings fe
        INNER JOIN people p ON fe.person_id = p.id
        ORDER BY fe.created_at DESC
      `)
      .all() as FaceEmbeddingWithPersonRow[]

    return rows.map(rowToEmbeddingWithPerson)
  }

  updateLastSeen(personId: string): void {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()

    db.prepare('UPDATE people SET last_seen = ? WHERE id = ?').run(now, personId)
  }

  updateProfile(
    id: string,
    profile: {
      keyFacts?: string[]
      conversationStarters?: string[]
      importantDates?: ImportantDate[]
      lastTopics?: string[]
    },
  ): Person | null {
    const db = this.adapter.getDb()
    const fields: string[] = []
    const values: unknown[] = []

    if (profile.keyFacts !== undefined) {
      fields.push('key_facts = ?')
      values.push(JSON.stringify(profile.keyFacts))
    }
    if (profile.conversationStarters !== undefined) {
      fields.push('conversation_starters = ?')
      values.push(JSON.stringify(profile.conversationStarters))
    }
    if (profile.importantDates !== undefined) {
      fields.push('important_dates = ?')
      values.push(JSON.stringify(profile.importantDates))
    }
    if (profile.lastTopics !== undefined) {
      fields.push('last_topics = ?')
      values.push(JSON.stringify(profile.lastTopics))
    }

    if (fields.length === 0) return this.findById(id)

    values.push(id)
    db.prepare(`UPDATE people SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.findById(id)
  }

  mergePeople(keepId: string, mergeId: string): Person | null {
    const db = this.adapter.getDb()
    const keep = this.findById(keepId)
    const merge = this.findById(mergeId)
    if (!keep || !merge) return null

    const mergeWasSelf = merge.isSelf

    const doMerge = db.transaction(() => {
      db.prepare('UPDATE face_embeddings SET person_id = ? WHERE person_id = ?').run(keepId, mergeId)
      db.prepare('UPDATE encounters SET person_id = ? WHERE person_id = ?').run(keepId, mergeId)
      db.prepare('UPDATE conversation_recordings SET person_id = ? WHERE person_id = ?').run(keepId, mergeId)
      db.prepare('UPDATE person_memories SET person_id = ? WHERE person_id = ?').run(keepId, mergeId)
      db.prepare(
        'UPDATE relationships SET person_a_id = ? WHERE person_a_id = ?'
      ).run(keepId, mergeId)
      db.prepare(
        'UPDATE relationships SET person_b_id = ? WHERE person_b_id = ?'
      ).run(keepId, mergeId)
      db.prepare('DELETE FROM relationships WHERE person_a_id = person_b_id').run()
      db.prepare(
        "UPDATE unknown_sightings SET named_as_person_id = ? WHERE named_as_person_id = ?"
      ).run(keepId, mergeId)
      db.prepare('DELETE FROM people WHERE id = ?').run(mergeId)
      if (mergeWasSelf) {
        db.prepare('UPDATE people SET is_self = 1 WHERE id = ?').run(keepId)
      }
    })

    doMerge()
    return this.findById(keepId)
  }

  findPotentialDuplicates(_threshold: number = 0.55): Array<{ personA: Person; personB: Person; similarity: number }> {
    return []
  }

  getEmbeddingById(embeddingId: string): FaceEmbedding | null {
    const db = this.adapter.getDb()
    const row = db.prepare('SELECT * FROM face_embeddings WHERE id = ?').get(embeddingId) as FaceEmbeddingRow | undefined
    return row ? rowToEmbedding(row) : null
  }

  deleteEmbedding(embeddingId: string): boolean {
    const db = this.adapter.getDb()
    const result = db.prepare('DELETE FROM face_embeddings WHERE id = ?').run(embeddingId)
    return result.changes > 0
  }

  reassignEmbedding(embeddingId: string, newPersonId: string): boolean {
    const db = this.adapter.getDb()
    const result = db.prepare('UPDATE face_embeddings SET person_id = ? WHERE id = ?').run(newPersonId, embeddingId)
    return result.changes > 0
  }

  getEmbeddingsWithMeta(personId: string): Array<Omit<FaceEmbedding, 'embedding'> & { personName: string }> {
    const db = this.adapter.getDb()
    const rows = db.prepare(`
      SELECT fe.id, fe.person_id, fe.source, fe.thumbnail, fe.quality_score, fe.created_at, p.name as person_name
      FROM face_embeddings fe
      INNER JOIN people p ON fe.person_id = p.id
      WHERE fe.person_id = ?
      ORDER BY fe.created_at DESC
    `).all(personId) as Array<{
      id: string; person_id: string; source: string; thumbnail: string | null
      quality_score: number | null; created_at: string; person_name: string
    }>

    return rows.map((r) => ({
      id: r.id,
      personId: r.person_id,
      source: r.source as FaceEmbedding['source'],
      thumbnail: r.thumbnail,
      qualityScore: r.quality_score,
      createdAt: r.created_at,
      personName: r.person_name,
    }))
  }

  getAllEmbeddingsGrouped(): Array<{
    personId: string
    personName: string
    embeddings: Array<Omit<FaceEmbedding, 'embedding'>>
  }> {
    const db = this.adapter.getDb()
    const rows = db.prepare(`
      SELECT fe.id, fe.person_id, fe.source, fe.thumbnail, fe.quality_score, fe.created_at, p.name as person_name
      FROM face_embeddings fe
      INNER JOIN people p ON fe.person_id = p.id
      ORDER BY p.name ASC, fe.created_at DESC
    `).all() as Array<{
      id: string; person_id: string; source: string; thumbnail: string | null
      quality_score: number | null; created_at: string; person_name: string
    }>

    const grouped = new Map<string, {
      personId: string
      personName: string
      embeddings: Array<Omit<FaceEmbedding, 'embedding'>>
    }>()

    for (const r of rows) {
      let group = grouped.get(r.person_id)
      if (!group) {
        group = { personId: r.person_id, personName: r.person_name, embeddings: [] }
        grouped.set(r.person_id, group)
      }
      group.embeddings.push({
        id: r.id,
        personId: r.person_id,
        source: r.source as FaceEmbedding['source'],
        thumbnail: r.thumbnail,
        qualityScore: r.quality_score,
        createdAt: r.created_at,
      })
    }

    return Array.from(grouped.values())
  }
}
