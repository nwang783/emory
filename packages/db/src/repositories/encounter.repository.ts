import { v4 as uuidv4 } from 'uuid'
import type { SqliteAdapter } from '../adapters/sqlite.adapter.js'
import type {
  Session,
  SessionRow,
  Encounter,
  EncounterRow,
  EncounterWithPerson,
  EncounterWithPersonRow,
} from '../types.js'

function rowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    deviceId: row.device_id,
    totalEncounters: row.total_encounters,
  }
}

function rowToEncounter(row: EncounterRow): Encounter {
  return {
    id: row.id,
    personId: row.person_id,
    sessionId: row.session_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    avgConfidence: row.avg_confidence,
    peakConfidence: row.peak_confidence,
    isImportant: row.is_important === 1,
    createdAt: row.created_at,
  }
}

function rowToEncounterWithPerson(row: EncounterWithPersonRow): EncounterWithPerson {
  return {
    ...rowToEncounter(row),
    personName: row.person_name,
  }
}

export class EncounterRepository {
  constructor(private adapter: SqliteAdapter) {}

  // --- Session methods ---

  createSession(deviceId?: string): Session {
    const db = this.adapter.getDb()
    const id = uuidv4()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO sessions (id, started_at, device_id, total_encounters)
      VALUES (?, ?, ?, 0)
    `).run(id, now, deviceId ?? null)

    return this.findSessionById(id)!
  }

  endSession(sessionId: string): Session | null {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()
    db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(now, sessionId)
    return this.findSessionById(sessionId)
  }

  findSessionById(id: string): Session | null {
    const db = this.adapter.getDb()
    const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined
    return row ? rowToSession(row) : null
  }

  getRecentSessions(limit: number = 10): Session[] {
    const db = this.adapter.getDb()
    const rows = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?').all(limit) as SessionRow[]
    return rows.map(rowToSession)
  }

  // --- Encounter methods ---

  createEncounter(personId: string, sessionId: string, confidence: number): Encounter {
    const db = this.adapter.getDb()
    const id = uuidv4()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO encounters (id, person_id, session_id, started_at, avg_confidence, peak_confidence, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, personId, sessionId, now, confidence, confidence, now)

    db.prepare('UPDATE sessions SET total_encounters = total_encounters + 1 WHERE id = ?').run(sessionId)

    return this.findEncounterById(id)!
  }

  updateEncounter(encounterId: string, confidence: number): Encounter | null {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()

    const existing = this.findEncounterById(encounterId)
    if (!existing) return null

    const newPeak = Math.max(existing.peakConfidence ?? 0, confidence)
    const currentAvg = existing.avgConfidence ?? confidence
    const newAvg = (currentAvg + confidence) / 2

    db.prepare(`
      UPDATE encounters SET ended_at = ?, avg_confidence = ?, peak_confidence = ? WHERE id = ?
    `).run(now, newAvg, newPeak, encounterId)

    return this.findEncounterById(encounterId)
  }

  endEncounter(encounterId: string): Encounter | null {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()
    db.prepare('UPDATE encounters SET ended_at = ? WHERE id = ?').run(now, encounterId)
    return this.findEncounterById(encounterId)
  }

  markImportant(encounterId: string, important: boolean): Encounter | null {
    const db = this.adapter.getDb()
    db.prepare('UPDATE encounters SET is_important = ? WHERE id = ?').run(important ? 1 : 0, encounterId)
    return this.findEncounterById(encounterId)
  }

  findEncounterById(id: string): Encounter | null {
    const db = this.adapter.getDb()
    const row = db.prepare('SELECT * FROM encounters WHERE id = ?').get(id) as EncounterRow | undefined
    return row ? rowToEncounter(row) : null
  }

  findActiveEncounter(personId: string, sessionId: string, withinMs: number = 30_000): Encounter | null {
    const db = this.adapter.getDb()
    const cutoff = new Date(Date.now() - withinMs).toISOString()

    const row = db.prepare(`
      SELECT * FROM encounters
      WHERE person_id = ? AND session_id = ? AND (ended_at IS NULL OR ended_at > ?)
      ORDER BY started_at DESC LIMIT 1
    `).get(personId, sessionId, cutoff) as EncounterRow | undefined

    return row ? rowToEncounter(row) : null
  }

  getEncountersByPerson(personId: string, limit: number = 50): EncounterWithPerson[] {
    const db = this.adapter.getDb()
    const rows = db.prepare(`
      SELECT e.*, p.name as person_name
      FROM encounters e
      INNER JOIN people p ON e.person_id = p.id
      WHERE e.person_id = ?
      ORDER BY e.started_at DESC LIMIT ?
    `).all(personId, limit) as EncounterWithPersonRow[]
    return rows.map(rowToEncounterWithPerson)
  }

  getRecentEncounters(limit: number = 50): EncounterWithPerson[] {
    const db = this.adapter.getDb()
    const rows = db.prepare(`
      SELECT e.*, p.name as person_name
      FROM encounters e
      INNER JOIN people p ON e.person_id = p.id
      ORDER BY e.started_at DESC LIMIT ?
    `).all(limit) as EncounterWithPersonRow[]
    return rows.map(rowToEncounterWithPerson)
  }

  getEncounterCountByPerson(personId: string, sinceDays?: number): number {
    const db = this.adapter.getDb()
    if (sinceDays) {
      const cutoff = new Date(Date.now() - sinceDays * 86_400_000).toISOString()
      const row = db.prepare(
        'SELECT COUNT(*) as count FROM encounters WHERE person_id = ? AND started_at > ?'
      ).get(personId, cutoff) as { count: number }
      return row.count
    }
    const row = db.prepare(
      'SELECT COUNT(*) as count FROM encounters WHERE person_id = ?'
    ).get(personId) as { count: number }
    return row.count
  }

  deleteOldEncounters(olderThanDays: number, keepImportant: boolean): number {
    const db = this.adapter.getDb()
    const cutoff = new Date(Date.now() - olderThanDays * 86_400_000).toISOString()
    const query = keepImportant
      ? 'DELETE FROM encounters WHERE started_at < ? AND is_important = 0'
      : 'DELETE FROM encounters WHERE started_at < ?'
    const result = db.prepare(query).run(cutoff)
    return result.changes
  }
}
