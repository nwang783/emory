import { v4 as uuidv4 } from 'uuid'
import type { SqliteAdapter } from '../adapters/sqlite.adapter.js'
import type {
  ConversationRecording,
  ConversationRecordingRow,
  CreateConversationRecordingInput,
  CreatePersonMemoryInput,
  ExtractionStatus,
  MemoryExtractionResult,
  PersonMemory,
  PersonMemoryRow,
  TranscriptStatus,
} from '../types.js'

function parseExtractionJson(value: string | null): MemoryExtractionResult | null {
  if (!value) return null

  try {
    return JSON.parse(value) as MemoryExtractionResult
  } catch {
    return null
  }
}

function rowToConversationRecording(row: ConversationRecordingRow): ConversationRecording {
  return {
    id: row.id,
    personId: row.person_id,
    encounterId: row.encounter_id,
    recordedAt: row.recorded_at,
    audioPath: row.audio_path,
    mimeType: row.mime_type,
    durationMs: row.duration_ms,
    transcriptRawText: row.transcript_raw_text,
    transcriptProvider: row.transcript_provider,
    transcriptStatus: row.transcript_status as TranscriptStatus,
    transcriptError: row.transcript_error,
    extractionStatus: row.extraction_status as ExtractionStatus,
    extractionJson: parseExtractionJson(row.extraction_json),
    extractionError: row.extraction_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function rowToPersonMemory(row: PersonMemoryRow): PersonMemory {
  return {
    id: row.id,
    personId: row.person_id,
    recordingId: row.recording_id,
    memoryText: row.memory_text,
    memoryType: row.memory_type as PersonMemory['memoryType'],
    memoryDate: row.memory_date,
    confidence: row.confidence,
    sourceQuote: row.source_quote,
    createdAt: row.created_at,
  }
}

export class ConversationRepository {
  constructor(private adapter: SqliteAdapter) {}

  createRecording(input: CreateConversationRecordingInput): ConversationRecording {
    const db = this.adapter.getDb()
    const id = input.id ?? uuidv4()
    const now = new Date().toISOString()

    db.prepare(`
      INSERT INTO conversation_recordings (
        id,
        person_id,
        encounter_id,
        recorded_at,
        audio_path,
        mime_type,
        duration_ms,
        transcript_status,
        extraction_status,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 'pending', ?, ?)
    `).run(
      id,
      input.personId,
      input.encounterId ?? null,
      input.recordedAt,
      input.audioPath,
      input.mimeType,
      input.durationMs ?? null,
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
    return row ? rowToConversationRecording(row) : null
  }

  /** Removes the recording row (e.g. rollback after failed pipeline). */
  deleteRecordingById(id: string): boolean {
    const db = this.adapter.getDb()
    const result = db.prepare('DELETE FROM conversation_recordings WHERE id = ?').run(id)
    return result.changes > 0
  }

  setTranscript(recordingId: string, transcriptRawText: string, provider: string): ConversationRecording | null {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()

    const result = db
      .prepare(`
      UPDATE conversation_recordings
      SET transcript_raw_text = ?,
          transcript_provider = ?,
          transcript_status = 'complete',
          transcript_error = NULL,
          updated_at = ?
      WHERE id = ?
    `)
      .run(transcriptRawText, provider, now, recordingId)

    if (result.changes === 0) return null
    return this.findRecordingById(recordingId)
  }

  markTranscriptFailed(recordingId: string, error?: string): ConversationRecording | null {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()

    const result = db
      .prepare(`
      UPDATE conversation_recordings
      SET transcript_status = 'failed',
          transcript_error = ?,
          updated_at = ?
      WHERE id = ?
    `)
      .run(error ?? null, now, recordingId)

    if (result.changes === 0) return null
    return this.findRecordingById(recordingId)
  }

  setExtractionResult(recordingId: string, extraction: MemoryExtractionResult): ConversationRecording | null {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()

    const result = db
      .prepare(`
      UPDATE conversation_recordings
      SET extraction_status = 'complete',
          extraction_json = ?,
          extraction_error = NULL,
          updated_at = ?
      WHERE id = ?
    `)
      .run(JSON.stringify(extraction), now, recordingId)

    if (result.changes === 0) return null
    return this.findRecordingById(recordingId)
  }

  markExtractionFailed(recordingId: string, error?: string): ConversationRecording | null {
    const db = this.adapter.getDb()
    const now = new Date().toISOString()

    const result = db
      .prepare(`
      UPDATE conversation_recordings
      SET extraction_status = 'failed',
          extraction_error = ?,
          updated_at = ?
      WHERE id = ?
    `)
      .run(error ?? null, now, recordingId)

    if (result.changes === 0) return null
    return this.findRecordingById(recordingId)
  }

  addMemories(input: CreatePersonMemoryInput[]): PersonMemory[] {
    const db = this.adapter.getDb()
    const insert = db.prepare(`
      INSERT INTO person_memories (
        id,
        person_id,
        recording_id,
        memory_text,
        memory_type,
        memory_date,
        confidence,
        source_quote,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const insertedIds: string[] = []
    const now = new Date().toISOString()
    const tx = db.transaction((items: CreatePersonMemoryInput[]) => {
      for (const item of items) {
        const id = uuidv4()
        insertedIds.push(id)
        insert.run(
          id,
          item.personId,
          item.recordingId ?? null,
          item.memoryText,
          item.memoryType,
          item.memoryDate,
          item.confidence ?? null,
          item.sourceQuote ?? null,
          now,
        )
      }
    })

    tx(input)

    if (insertedIds.length === 0) return []

    const placeholders = insertedIds.map(() => '?').join(', ')
    const rows = db
      .prepare(`
      SELECT *
      FROM person_memories
      WHERE id IN (${placeholders})
      ORDER BY created_at DESC
    `)
      .all(...insertedIds) as PersonMemoryRow[]

    return rows.map(rowToPersonMemory)
  }

  getMemoriesByPerson(personId: string, limit: number = 20): PersonMemory[] {
    const db = this.adapter.getDb()
    const rows = db
      .prepare(`
      SELECT *
      FROM person_memories
      WHERE person_id = ?
      ORDER BY memory_date DESC, created_at DESC
      LIMIT ?
    `)
      .all(personId, limit) as PersonMemoryRow[]

    return rows.map(rowToPersonMemory)
  }

  getRecordingsByPerson(personId: string, limit: number = 50): ConversationRecording[] {
    const db = this.adapter.getDb()
    const rows = db
      .prepare(`
      SELECT *
      FROM conversation_recordings
      WHERE person_id = ?
      ORDER BY recorded_at DESC, created_at DESC
      LIMIT ?
    `)
      .all(personId, limit) as ConversationRecordingRow[]

    return rows.map(rowToConversationRecording)
  }
}
