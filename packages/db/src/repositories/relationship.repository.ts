import { v4 as uuidv4 } from 'uuid'
import type { SqliteAdapter } from '../adapters/sqlite.adapter.js'
import type { Relationship, RelationshipRow, RelationshipType, RelationshipWithPerson } from '../types.js'

function rowToRelationship(row: RelationshipRow): Relationship {
  return {
    id: row.id,
    personAId: row.person_a_id,
    personBId: row.person_b_id,
    relationshipType: row.relationship_type as RelationshipType,
    notes: row.notes,
    createdAt: row.created_at,
  }
}

export class RelationshipRepository {
  constructor(private adapter: SqliteAdapter) {}

  create(personAId: string, personBId: string, type: RelationshipType, notes?: string): Relationship {
    const db = this.adapter.getDb()
    const id = uuidv4()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO relationships (id, person_a_id, person_b_id, relationship_type, notes, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, personAId, personBId, type, notes ?? null, now)

    return this.findById(id)!
  }

  findById(id: string): Relationship | null {
    const db = this.adapter.getDb()
    const row = db.prepare('SELECT * FROM relationships WHERE id = ?').get(id) as RelationshipRow | undefined
    return row ? rowToRelationship(row) : null
  }

  findByPerson(personId: string): RelationshipWithPerson[] {
    const db = this.adapter.getDb()
    const rows = db.prepare(`
      SELECT r.*,
        pa.name as person_a_name,
        pb.name as person_b_name
      FROM relationships r
      INNER JOIN people pa ON r.person_a_id = pa.id
      INNER JOIN people pb ON r.person_b_id = pb.id
      WHERE r.person_a_id = ? OR r.person_b_id = ?
      ORDER BY r.created_at DESC
    `).all(personId, personId) as Array<RelationshipRow & { person_a_name: string; person_b_name: string }>

    return rows.map((row) => ({
      ...rowToRelationship(row),
      personAName: row.person_a_name,
      personBName: row.person_b_name,
    }))
  }

  findAll(): RelationshipWithPerson[] {
    const db = this.adapter.getDb()
    const rows = db.prepare(`
      SELECT r.*,
        pa.name as person_a_name,
        pb.name as person_b_name
      FROM relationships r
      INNER JOIN people pa ON r.person_a_id = pa.id
      INNER JOIN people pb ON r.person_b_id = pb.id
      ORDER BY r.created_at DESC
    `).all() as Array<RelationshipRow & { person_a_name: string; person_b_name: string }>

    return rows.map((row) => ({
      ...rowToRelationship(row),
      personAName: row.person_a_name,
      personBName: row.person_b_name,
    }))
  }

  findBetween(personAId: string, personBId: string): Relationship | null {
    const db = this.adapter.getDb()
    const row = db.prepare(`
      SELECT * FROM relationships
      WHERE (person_a_id = ? AND person_b_id = ?) OR (person_a_id = ? AND person_b_id = ?)
      LIMIT 1
    `).get(personAId, personBId, personBId, personAId) as RelationshipRow | undefined
    return row ? rowToRelationship(row) : null
  }

  update(id: string, type?: RelationshipType, notes?: string): Relationship | null {
    const db = this.adapter.getDb()
    const fields: string[] = []
    const values: unknown[] = []

    if (type !== undefined) {
      fields.push('relationship_type = ?')
      values.push(type)
    }
    if (notes !== undefined) {
      fields.push('notes = ?')
      values.push(notes)
    }
    if (fields.length === 0) return this.findById(id)

    values.push(id)
    db.prepare(`UPDATE relationships SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.findById(id)
  }

  delete(id: string): boolean {
    const db = this.adapter.getDb()
    const result = db.prepare('DELETE FROM relationships WHERE id = ?').run(id)
    return result.changes > 0
  }

  deleteByPerson(personId: string): number {
    const db = this.adapter.getDb()
    const result = db.prepare('DELETE FROM relationships WHERE person_a_id = ? OR person_b_id = ?').run(personId, personId)
    return result.changes
  }
}
