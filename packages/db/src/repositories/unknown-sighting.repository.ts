import { v4 as uuidv4 } from 'uuid'
import type { SqliteAdapter } from '../adapters/sqlite.adapter.js'
import type { UnknownSighting, UnknownSightingRow, UnknownSightingStatus } from '../types.js'

function rowToSighting(row: UnknownSightingRow): UnknownSighting {
  return {
    id: row.id,
    tempId: row.temp_id,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    sightingCount: row.sighting_count,
    bestEmbedding: row.best_embedding
      ? new Float32Array(row.best_embedding.buffer, row.best_embedding.byteOffset, row.best_embedding.byteLength / 4)
      : null,
    bestConfidence: row.best_confidence,
    thumbnailPath: row.thumbnail_path,
    status: row.status as UnknownSightingStatus,
    namedAsPersonId: row.named_as_person_id,
    createdAt: row.created_at,
  }
}

export class UnknownSightingRepository {
  constructor(private adapter: SqliteAdapter) {}

  create(tempId: string, embedding?: Float32Array, confidence?: number): UnknownSighting {
    const db = this.adapter.getDb()
    const id = uuidv4()
    const now = new Date().toISOString()
    const embeddingBuf = embedding ? Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength) : null

    db.prepare(`
      INSERT INTO unknown_sightings (id, temp_id, first_seen, last_seen, sighting_count, best_embedding, best_confidence, status, created_at)
      VALUES (?, ?, ?, ?, 1, ?, ?, 'tracking', ?)
    `).run(id, tempId, now, now, embeddingBuf, confidence ?? null, now)

    return this.findById(id)!
  }

  updateSighting(id: string, confidence?: number, embedding?: Float32Array): UnknownSighting | null {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()
    const existing = this.findById(id)
    if (!existing) return null

    const fields: string[] = ['last_seen = ?', 'sighting_count = sighting_count + 1']
    const values: unknown[] = [now]

    if (confidence && (!existing.bestConfidence || confidence > existing.bestConfidence)) {
      fields.push('best_confidence = ?')
      values.push(confidence)

      if (embedding) {
        fields.push('best_embedding = ?')
        values.push(Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength))
      }
    }

    values.push(id)
    db.prepare(`UPDATE unknown_sightings SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    return this.findById(id)
  }

  findById(id: string): UnknownSighting | null {
    const db = this.adapter.getDb()
    const row = db.prepare('SELECT * FROM unknown_sightings WHERE id = ?').get(id) as UnknownSightingRow | undefined
    return row ? rowToSighting(row) : null
  }

  findByTempId(tempId: string): UnknownSighting | null {
    const db = this.adapter.getDb()
    const row = db.prepare(
      "SELECT * FROM unknown_sightings WHERE temp_id = ? AND status = 'tracking' ORDER BY last_seen DESC LIMIT 1"
    ).get(tempId) as UnknownSightingRow | undefined
    return row ? rowToSighting(row) : null
  }

  findAllActive(): UnknownSighting[] {
    const db = this.adapter.getDb()
    const rows = db.prepare(
      "SELECT * FROM unknown_sightings WHERE status = 'tracking' ORDER BY last_seen DESC"
    ).all() as UnknownSightingRow[]
    return rows.map(rowToSighting)
  }

  findAll(limit: number = 50): UnknownSighting[] {
    const db = this.adapter.getDb()
    const rows = db.prepare(
      'SELECT * FROM unknown_sightings ORDER BY last_seen DESC LIMIT ?'
    ).all(limit) as UnknownSightingRow[]
    return rows.map(rowToSighting)
  }

  dismiss(id: string): UnknownSighting | null {
    const db = this.adapter.getDb()
    db.prepare("UPDATE unknown_sightings SET status = 'dismissed' WHERE id = ?").run(id)
    return this.findById(id)
  }

  nameAsPerson(id: string, personId: string): UnknownSighting | null {
    const db = this.adapter.getDb()
    db.prepare("UPDATE unknown_sightings SET status = 'named', named_as_person_id = ? WHERE id = ?").run(personId, id)
    return this.findById(id)
  }

  deleteOldSightings(olderThanDays: number): number {
    const db = this.adapter.getDb()
    const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString()
    const result = db.prepare("DELETE FROM unknown_sightings WHERE last_seen < ? AND status != 'tracking'").run(cutoff)
    return result.changes
  }

  getActiveCount(): number {
    const db = this.adapter.getDb()
    const row = db.prepare(
      "SELECT COUNT(*) as count FROM unknown_sightings WHERE status = 'tracking'"
    ).get() as { count: number }
    return row.count
  }
}
