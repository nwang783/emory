import { v4 as uuidv4 } from 'uuid'
import type { SqliteAdapter } from '../adapters/sqlite.adapter.js'
import type {
  AddPersonMemoryInput,
  ConversationRecording,
  ConversationRecordingRow,
  CreateConversationRecordingInput,
  MemorySourceType,
  ParseStatus,
  PersonMemory,
  PersonMemoryRow,
  TranscriptStatus,
} from '../types.js'

function rowToRecording(row: ConversationRecordingRow): ConversationRecording {
  return {
    id: row.id,
    personId: row.person_id,
    encounterId: row.encounter_id,
    recordedAt: row.recorded_at,
    audioPath: row.audio_path,
    mimeType: row.mime_type,
    durationMs: row.duration_ms,
    transcriptText: row.transcript_text,
    transcriptStatus: row.transcript_status as TranscriptStatus,
    transcriptProvider: row.transcript_provider,
    transcriptError: row.transcript_error,
    parseStatus: row.parse_status as ParseStatus,
    parseError: row.parse_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToMemory(row: PersonMemoryRow): PersonMemory {
  return {
    id: row.id,
    personId: row.person_id,
    recordingId: row.recording_id,
    memoryText: row.memory_text,
    memoryDate: row.memory_date,
    sourceType: row.source_type as MemorySourceType,
    createdAt: row.created_at,
  }
}

export class ConversationRepository {
  constructor(private adapter: SqliteAdapter) {}

  createRecording(input: CreateConversationRecordingInput): ConversationRecording {
    const db = this.adapter.getDb()
    const id = input.id ?? uuidv4()
    const now = new Date().toISOString()
    const encounterId = input.encounterId ?? null
    const durationMs = input.durationMs ?? null

    db.prepare(
      `
      INSERT INTO conversation_recordings (
        id, person_id, encounter_id, recorded_at, audio_path, mime_type, duration_ms,
        transcript_text, transcript_status, transcript_provider, transcript_error, parse_status, parse_error,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'pending', NULL, NULL, 'pending', NULL, ?, ?)
    `,
    ).run(
      id,
      input.personId,
      encounterId,
      input.recordedAt,
      input.audioPath,
      input.mimeType,
      durationMs,
      now,
      now,
    )

    return this.findRecordingById(id)!
  }

  findRecordingById(id: string): ConversationRecording | null {
    const db = this.adapter.getDb()
    const row = db.prepare('SELECT * FROM conversation_recordings WHERE id = ?').get(id) as
      | ConversationRecordingRow
      | undefined
    return row ? rowToRecording(row) : null
  }

  setTranscript(
    recordingId: string,
    transcriptText: string,
    provider?: string,
  ): ConversationRecording | null {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()
    const result = db
      .prepare(
        `
      UPDATE conversation_recordings
      SET transcript_text = ?, transcript_status = 'complete', transcript_provider = ?, transcript_error = NULL, updated_at = ?
      WHERE id = ?
    `,
      )
      .run(transcriptText, provider ?? null, now, recordingId)
    if (result.changes === 0) return null
    return this.findRecordingById(recordingId)
  }

  markTranscriptFailed(recordingId: string, error?: string): ConversationRecording | null {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()
    const result = db
      .prepare(
        `
      UPDATE conversation_recordings
      SET transcript_status = 'failed', transcript_error = ?, updated_at = ?
      WHERE id = ?
    `,
      )
      .run(error ?? null, now, recordingId)
    if (result.changes === 0) return null
    return this.findRecordingById(recordingId)
  }

  markParseComplete(recordingId: string): ConversationRecording | null {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()
    const result = db
      .prepare(
        `
      UPDATE conversation_recordings SET parse_status = 'complete', parse_error = NULL, updated_at = ? WHERE id = ?
    `,
      )
      .run(now, recordingId)
    if (result.changes === 0) return null
    return this.findRecordingById(recordingId)
  }

  markParseFailed(recordingId: string, error?: string): ConversationRecording | null {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()
    const result = db
      .prepare(
        `
      UPDATE conversation_recordings SET parse_status = 'failed', parse_error = ?, updated_at = ? WHERE id = ?
    `,
      )
      .run(error ?? null, now, recordingId)
    if (result.changes === 0) return null
    return this.findRecordingById(recordingId)
  }

  addMemories(inputs: AddPersonMemoryInput[]): PersonMemory[] {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()
    const insert = db.prepare(
      `
      INSERT INTO person_memories (id, person_id, recording_id, memory_text, memory_date, source_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )

    const out: PersonMemory[] = []
    const tx = db.transaction(() => {
      for (const input of inputs) {
        const id = uuidv4()
        insert.run(
          id,
          input.personId,
          input.recordingId ?? null,
          input.memoryText,
          input.memoryDate,
          input.sourceType,
          now,
        )
        const row = db.prepare('SELECT * FROM person_memories WHERE id = ?').get(id) as PersonMemoryRow
        out.push(rowToMemory(row))
      }
    })
    tx()
    return out
  }

  getMemoriesByPerson(personId: string, limit: number = 20): PersonMemory[] {
    const db = this.adapter.getDb()
    const rows = db
      .prepare(
        `
      SELECT * FROM person_memories
      WHERE person_id = ?
      ORDER BY memory_date DESC, created_at DESC
      LIMIT ?
    `,
      )
      .all(personId, limit) as PersonMemoryRow[]
    return rows.map(rowToMemory)
  }

  getRecordingsByPerson(personId: string, limit: number = 50): ConversationRecording[] {
    const db = this.adapter.getDb()
    const rows = db
      .prepare(
        `
      SELECT * FROM conversation_recordings
      WHERE person_id = ?
      ORDER BY recorded_at DESC
      LIMIT ?
    `,
      )
      .all(personId, limit) as ConversationRecordingRow[]
    return rows.map(rowToRecording)
  }
}
