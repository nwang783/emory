import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import type { StorageAdapter } from './storage.adapter.js'

const CURRENT_SCHEMA_VERSION = 10
const require = createRequire(import.meta.url)
const betterSqlite3Root = dirname(require.resolve('better-sqlite3/package.json'))
const betterSqlite3NativeBinding = join(betterSqlite3Root, 'build', 'Release', 'better_sqlite3.node')

export class SqliteAdapter implements StorageAdapter {
  private db: DatabaseType

  constructor(dbPath: string = 'emory.db') {
    this.db = new Database(dbPath, { nativeBinding: betterSqlite3NativeBinding })
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
  }

  initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
      )
    `)

    const row = this.db
      .prepare('SELECT MAX(version) as version FROM schema_version')
      .get() as { version: number | null } | undefined

    const currentVersion = row?.version ?? 0

    if (currentVersion < CURRENT_SCHEMA_VERSION) {
      this.applyMigrations(currentVersion)
    }

    // v9+ may run outside the main migration transaction (PRAGMA foreign_keys).
    if (currentVersion < 9) {
      this.migrateToV9()
    }
    if (currentVersion < 10) {
      this.migrateToV10()
    }
  }

  getDb(): DatabaseType {
    return this.db
  }

  close(): void {
    this.db.close()
  }

  getType(): string {
    return 'sqlite'
  }

  private applyMigrations(fromVersion: number): void {
    const migrate = this.db.transaction(() => {
      if (fromVersion < 1) {
        this.migrateToV1()
      }
      if (fromVersion < 2) {
        this.migrateToV2()
      }
      if (fromVersion < 3) {
        this.migrateToV3()
      }
      if (fromVersion < 4) {
        this.migrateToV4()
      }
      if (fromVersion < 5) {
        this.migrateToV5()
      }
      if (fromVersion < 6) {
        this.migrateToV6()
      }
      if (fromVersion < 7) {
        this.migrateToV7()
      }
      if (fromVersion < 8) {
        this.migrateToV8()
      }
    })

    migrate()
  }

  private migrateToV1(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS people (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        relationship TEXT,
        notes TEXT,
        photos TEXT,
        first_met TEXT,
        last_seen TEXT,
        created_at TEXT NOT NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS face_embeddings (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        embedding BLOB NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_face_embeddings_person_id
        ON face_embeddings(person_id)
    `)

    this.db.exec(`
      INSERT OR REPLACE INTO schema_version (version) VALUES (1)
    `)
  }

  private migrateToV2(): void {
    const alterStatements = [
      'ALTER TABLE people ADD COLUMN key_facts TEXT',
      'ALTER TABLE people ADD COLUMN conversation_starters TEXT',
      'ALTER TABLE people ADD COLUMN important_dates TEXT',
      'ALTER TABLE people ADD COLUMN last_topics TEXT',
    ]

    for (const sql of alterStatements) {
      try {
        this.db.exec(sql)
      } catch {
        // Column may already exist on re-run
      }
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        device_id TEXT,
        total_encounters INTEGER NOT NULL DEFAULT 0
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS encounters (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        avg_confidence REAL,
        peak_confidence REAL,
        is_important INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `)

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_encounters_person_id ON encounters(person_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_encounters_session_id ON encounters(session_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_encounters_started_at ON encounters(started_at)')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS unknown_sightings (
        id TEXT PRIMARY KEY,
        temp_id TEXT NOT NULL,
        first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL,
        sighting_count INTEGER NOT NULL DEFAULT 1,
        best_embedding BLOB,
        best_confidence REAL,
        thumbnail_path TEXT,
        status TEXT NOT NULL DEFAULT 'tracking',
        named_as_person_id TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (named_as_person_id) REFERENCES people(id) ON DELETE SET NULL
      )
    `)

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_unknown_sightings_status ON unknown_sightings(status)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_unknown_sightings_temp_id ON unknown_sightings(temp_id)')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS appearance_changes (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        change_type TEXT NOT NULL,
        detected_at TEXT NOT NULL,
        old_centroid BLOB,
        new_centroid BLOB,
        auto_adapted INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
      )
    `)

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_appearance_changes_person_id ON appearance_changes(person_id)')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS relationships (
        id TEXT PRIMARY KEY,
        person_a_id TEXT NOT NULL,
        person_b_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (person_a_id) REFERENCES people(id) ON DELETE CASCADE,
        FOREIGN KEY (person_b_id) REFERENCES people(id) ON DELETE CASCADE
      )
    `)

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_relationships_person_a ON relationships(person_a_id)')
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_relationships_person_b ON relationships(person_b_id)')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS retention_config (
        entity_type TEXT PRIMARY KEY,
        retention_days INTEGER NOT NULL,
        keep_important INTEGER NOT NULL DEFAULT 1
      )
    `)

    this.db.exec(`INSERT OR IGNORE INTO retention_config (entity_type, retention_days, keep_important) VALUES ('encounters', 90, 1)`)
    this.db.exec(`INSERT OR IGNORE INTO retention_config (entity_type, retention_days, keep_important) VALUES ('unknown_sightings', 30, 0)`)
    this.db.exec(`INSERT OR IGNORE INTO retention_config (entity_type, retention_days, keep_important) VALUES ('activity_log', 30, 0)`)

    this.db.exec('INSERT OR REPLACE INTO schema_version (version) VALUES (2)')
  }

  private migrateToV3(): void {
    const alterStatements = [
      'ALTER TABLE face_embeddings ADD COLUMN thumbnail TEXT',
      'ALTER TABLE face_embeddings ADD COLUMN quality_score REAL',
    ]

    for (const sql of alterStatements) {
      try {
        this.db.exec(sql)
      } catch {
        // Column may already exist on re-run
      }
    }

    this.db.exec('INSERT OR REPLACE INTO schema_version (version) VALUES (3)')
  }

  private migrateToV4(): void {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_people_created_at ON people(created_at);
      CREATE INDEX IF NOT EXISTS idx_face_embeddings_created_at ON face_embeddings(created_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
      CREATE INDEX IF NOT EXISTS idx_unknown_sightings_last_seen ON unknown_sightings(last_seen);
      CREATE INDEX IF NOT EXISTS idx_encounters_person_id ON encounters(person_id);
      CREATE INDEX IF NOT EXISTS idx_encounters_started_at ON encounters(started_at);
      CREATE INDEX IF NOT EXISTS idx_relationships_person_a ON relationships(person_a_id);
      CREATE INDEX IF NOT EXISTS idx_relationships_person_b ON relationships(person_b_id);
    `)
    this.db.exec('INSERT OR REPLACE INTO schema_version (version) VALUES (4)')
  }

  private migrateToV5(): void {
    try {
      this.db.exec('ALTER TABLE people ADD COLUMN is_self INTEGER NOT NULL DEFAULT 0')
    } catch {
      // Column may already exist on re-run
    }

    this.db.exec('INSERT OR REPLACE INTO schema_version (version) VALUES (5)')
  }

  private migrateToV6(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_recordings (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        encounter_id TEXT NULL,
        recorded_at TEXT NOT NULL,
        audio_path TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        duration_ms INTEGER NULL,
        transcript_raw_text TEXT NULL,
        transcript_provider TEXT NULL,
        transcript_status TEXT NOT NULL,
        transcript_error TEXT NULL,
        extraction_status TEXT NOT NULL,
        extraction_json TEXT NULL,
        extraction_error TEXT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
        FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE SET NULL
      )
    `)

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS person_memories (
        id TEXT PRIMARY KEY,
        person_id TEXT NOT NULL,
        recording_id TEXT NULL,
        memory_text TEXT NOT NULL,
        memory_type TEXT NOT NULL,
        memory_date TEXT NOT NULL,
        confidence REAL NULL,
        source_quote TEXT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
        FOREIGN KEY (recording_id) REFERENCES conversation_recordings(id) ON DELETE SET NULL
      )
    `)

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_conversation_recordings_person_id
        ON conversation_recordings(person_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_recordings_recorded_at
        ON conversation_recordings(recorded_at);
      CREATE INDEX IF NOT EXISTS idx_conversation_recordings_person_recorded_at
        ON conversation_recordings(person_id, recorded_at);
      CREATE INDEX IF NOT EXISTS idx_person_memories_person_id
        ON person_memories(person_id);
      CREATE INDEX IF NOT EXISTS idx_person_memories_memory_date
        ON person_memories(memory_date);
      CREATE INDEX IF NOT EXISTS idx_person_memories_person_memory_date
        ON person_memories(person_id, memory_date);
    `)

    this.db.exec('INSERT OR REPLACE INTO schema_version (version) VALUES (6)')
  }

  private migrateToV7(): void {
    try {
      this.db.exec('ALTER TABLE people ADD COLUMN bio TEXT')
    } catch {
      // Column may already exist on re-run
    }
    try {
      this.db.exec(`
        ALTER TABLE person_memories ADD COLUMN relationship_id TEXT
          REFERENCES relationships(id) ON DELETE CASCADE
      `)
    } catch {
      // Column may already exist on re-run
    }
    try {
      this.db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_person_memories_relationship_id
          ON person_memories(relationship_id)
          WHERE relationship_id IS NOT NULL
      `)
    } catch {
      // Index may already exist on re-run
    }

    this.db.exec('INSERT OR REPLACE INTO schema_version (version) VALUES (7)')
  }

  /**
   * Repair `conversation_recordings` when an older or partial table existed before v6:
   * `CREATE TABLE IF NOT EXISTS` does not add new columns, so some DBs lack transcript/extraction fields.
   */
  private migrateToV8(): void {
    const addColumnStatements = [
      'ALTER TABLE conversation_recordings ADD COLUMN encounter_id TEXT',
      'ALTER TABLE conversation_recordings ADD COLUMN duration_ms INTEGER',
      'ALTER TABLE conversation_recordings ADD COLUMN transcript_raw_text TEXT',
      'ALTER TABLE conversation_recordings ADD COLUMN transcript_provider TEXT',
      "ALTER TABLE conversation_recordings ADD COLUMN transcript_status TEXT NOT NULL DEFAULT 'pending'",
      'ALTER TABLE conversation_recordings ADD COLUMN transcript_error TEXT',
      "ALTER TABLE conversation_recordings ADD COLUMN extraction_status TEXT NOT NULL DEFAULT 'pending'",
      'ALTER TABLE conversation_recordings ADD COLUMN extraction_json TEXT',
      'ALTER TABLE conversation_recordings ADD COLUMN extraction_error TEXT',
    ]

    for (const sql of addColumnStatements) {
      try {
        this.db.exec(sql)
      } catch {
        // Column already present
      }
    }

    this.db.exec('INSERT OR REPLACE INTO schema_version (version) VALUES (8)')
  }

  /**
   * Older `conversation_recordings` schemas used `parse_status`, `transcript_text`, `source_type`.
   * v8 only ADD COLUMN, so legacy NOT NULL columns (e.g. `parse_status`) remained and broke INSERTs.
   * Rebuild the table into the canonical v6 shape when legacy columns are present.
   *
   * Runs outside `applyMigrations`'s transaction so `PRAGMA foreign_keys = OFF` is allowed for DROP.
   */
  private migrateToV9(): void {
    const db = this.db
    const exists =
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'conversation_recordings'`)
        .get() !== undefined

    const bump = (): void => {
      db.exec('INSERT OR REPLACE INTO schema_version (version) VALUES (9)')
    }

    if (!exists) {
      bump()
      return
    }

    const infoRows = db.prepare('PRAGMA table_info(conversation_recordings)').all() as Array<{ name: string }>
    const colByLower = new Map(infoRows.map((r) => [r.name.toLowerCase(), r.name]))

    const findCol = (...candidates: string[]): string | null => {
      for (const c of candidates) {
        const orig = colByLower.get(c.toLowerCase())
        if (orig !== undefined) return `"${orig.replace(/"/g, '""')}"`
      }
      return null
    }

    const lower = new Set(infoRows.map((r) => r.name.toLowerCase()))
    const hasLegacy =
      lower.has('parse_status') || lower.has('transcript_text') || lower.has('source_type')

    if (!hasLegacy) {
      bump()
      return
    }

    const id = findCol('id')
    const personId = findCol('person_id')
    const recordedAt = findCol('recorded_at')
    const audioPath = findCol('audio_path')
    const mimeType = findCol('mime_type')
    const createdAt = findCol('created_at')
    const updatedAt = findCol('updated_at') ?? createdAt

    if (!id || !personId || !recordedAt || !audioPath || !mimeType || !createdAt || !updatedAt) {
      bump()
      return
    }

    const encounterId = findCol('encounter_id') ?? 'NULL'
    const durationMs = findCol('duration_ms') ?? 'NULL'
    const transcriptRaw = findCol('transcript_raw_text', 'transcript_text') ?? 'NULL'
    const transcriptProvider = findCol('transcript_provider', 'source_type') ?? 'NULL'
    const transcriptStatus = findCol('transcript_status', 'parse_status') ?? `'pending'`
    const transcriptError = findCol('transcript_error') ?? 'NULL'
    const extractionStatus = findCol('extraction_status') ?? `'pending'`
    const extractionJson = findCol('extraction_json') ?? 'NULL'
    const extractionError = findCol('extraction_error') ?? 'NULL'

    const fkPragma = db.pragma('foreign_keys', { simple: true })
    const prevFkOn = fkPragma === 1 || fkPragma === true
    db.pragma('foreign_keys = OFF')

    try {
      const tx = db.transaction(() => {
        db.exec('DROP TABLE IF EXISTS conversation_recordings__v9')

        db.exec(`
          CREATE TABLE conversation_recordings__v9 (
            id TEXT PRIMARY KEY,
            person_id TEXT NOT NULL,
            encounter_id TEXT NULL,
            recorded_at TEXT NOT NULL,
            audio_path TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            duration_ms INTEGER NULL,
            transcript_raw_text TEXT NULL,
            transcript_provider TEXT NULL,
            transcript_status TEXT NOT NULL,
            transcript_error TEXT NULL,
            extraction_status TEXT NOT NULL,
            extraction_json TEXT NULL,
            extraction_error TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
            FOREIGN KEY (encounter_id) REFERENCES encounters(id) ON DELETE SET NULL
          )
        `)

        db.exec(`
          INSERT INTO conversation_recordings__v9 (
            id, person_id, encounter_id, recorded_at, audio_path, mime_type, duration_ms,
            transcript_raw_text, transcript_provider, transcript_status, transcript_error,
            extraction_status, extraction_json, extraction_error, created_at, updated_at
          )
          SELECT
            ${id}, ${personId}, ${encounterId}, ${recordedAt}, ${audioPath}, ${mimeType}, ${durationMs},
            ${transcriptRaw}, ${transcriptProvider}, ${transcriptStatus}, ${transcriptError},
            ${extractionStatus}, ${extractionJson}, ${extractionError}, ${createdAt}, ${updatedAt}
          FROM conversation_recordings
        `)

        db.exec('DROP TABLE conversation_recordings')
        db.exec('ALTER TABLE conversation_recordings__v9 RENAME TO conversation_recordings')

        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_conversation_recordings_person_id
            ON conversation_recordings(person_id);
          CREATE INDEX IF NOT EXISTS idx_conversation_recordings_recorded_at
            ON conversation_recordings(recorded_at);
          CREATE INDEX IF NOT EXISTS idx_conversation_recordings_person_recorded_at
            ON conversation_recordings(person_id, recorded_at);
        `)

        db.exec('INSERT OR REPLACE INTO schema_version (version) VALUES (9)')
      })
      tx()
    } finally {
      db.pragma(prevFkOn ? 'foreign_keys = ON' : 'foreign_keys = OFF')
    }
  }

  /**
   * Repair `person_memories` when an older or partial table predates the full v6 column list.
   * Same root cause as `conversation_recordings`: `CREATE TABLE IF NOT EXISTS` never upgrades
   * existing tables. Missing `memory_type` / `source_quote`
   * breaks inserts and `searchMemories` (COALESCE(source_quote)).
   */
  private migrateToV10(): void {
    const db = this.db
    try {
      db.exec('ALTER TABLE people ADD COLUMN bio TEXT')
    } catch {
      // Already present (e.g. v7 on other branch added bio only)
    }
    const exists =
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'person_memories'`).get() !==
      undefined

    const bump = (): void => {
      db.exec('INSERT OR REPLACE INTO schema_version (version) VALUES (10)')
    }

    if (!exists) {
      bump()
      return
    }

    const infoRows = db.prepare('PRAGMA table_info(person_memories)').all() as Array<{ name: string }>
    const colByLower = new Map(infoRows.map((r) => [r.name.toLowerCase(), r.name]))
    const lower = new Set(infoRows.map((r) => r.name.toLowerCase()))

    const findCol = (...candidates: string[]): string | null => {
      for (const c of candidates) {
        const orig = colByLower.get(c.toLowerCase())
        if (orig !== undefined) return `"${orig.replace(/"/g, '""')}"`
      }
      return null
    }

    const hasFullV6Shape =
      lower.has('id') &&
      lower.has('person_id') &&
      lower.has('recording_id') &&
      lower.has('memory_text') &&
      lower.has('memory_type') &&
      lower.has('memory_date') &&
      lower.has('confidence') &&
      lower.has('source_quote') &&
      lower.has('created_at')

    if (hasFullV6Shape) {
      try {
        db.exec(`
          ALTER TABLE person_memories ADD COLUMN relationship_id TEXT
            REFERENCES relationships(id) ON DELETE CASCADE
        `)
      } catch {
        // already present
      }
      db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_person_memories_relationship_id
          ON person_memories(relationship_id)
          WHERE relationship_id IS NOT NULL
      `)
      bump()
      return
    }

    const id = findCol('id')
    const personId = findCol('person_id')
    const createdAt = findCol('created_at')
    if (!id || !personId || !createdAt) {
      bump()
      return
    }

    const recordingId = findCol('recording_id') ?? 'NULL'
    const relationshipId = findCol('relationship_id') ?? 'NULL'

    const memoryTextCol = findCol('memory_text', 'text', 'content', 'body')
    const memoryTextSql = memoryTextCol ? `COALESCE(${memoryTextCol}, '(migrated)')` : `'(migrated)'`

    const memoryTypeCol = findCol('memory_type', 'type', 'kind', 'category')
    const memoryTypeSql = memoryTypeCol ?? `'other'`

    const memoryDateCol = findCol('memory_date', 'date', 'at', 'recorded_at')
    const memoryDateSql = memoryDateCol ? `COALESCE(${memoryDateCol}, ${createdAt})` : createdAt

    const confidenceSql = findCol('confidence') ?? 'NULL'
    const sourceQuoteCol = findCol('source_quote', 'quote', 'snippet', 'transcript_snippet')
    const sourceQuoteSql = sourceQuoteCol ?? 'NULL'

    const fkPragma = db.pragma('foreign_keys', { simple: true })
    const prevFkOn = fkPragma === 1 || fkPragma === true
    db.pragma('foreign_keys = OFF')

    try {
      const tx = db.transaction(() => {
        db.exec('DROP TABLE IF EXISTS person_memories__v10')

        db.exec(`
          CREATE TABLE person_memories__v10 (
            id TEXT PRIMARY KEY,
            person_id TEXT NOT NULL,
            recording_id TEXT NULL,
            relationship_id TEXT NULL,
            memory_text TEXT NOT NULL,
            memory_type TEXT NOT NULL,
            memory_date TEXT NOT NULL,
            confidence REAL NULL,
            source_quote TEXT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
            FOREIGN KEY (recording_id) REFERENCES conversation_recordings(id) ON DELETE SET NULL,
            FOREIGN KEY (relationship_id) REFERENCES relationships(id) ON DELETE CASCADE
          )
        `)

        db.exec(`
          INSERT INTO person_memories__v10 (
            id, person_id, recording_id, relationship_id,
            memory_text, memory_type, memory_date, confidence, source_quote, created_at
          )
          SELECT
            ${id}, ${personId}, ${recordingId}, ${relationshipId},
            ${memoryTextSql}, ${memoryTypeSql}, ${memoryDateSql}, ${confidenceSql}, ${sourceQuoteSql}, ${createdAt}
          FROM person_memories
        `)

        db.exec('DROP TABLE person_memories')
        db.exec('ALTER TABLE person_memories__v10 RENAME TO person_memories')

        db.exec(`
          CREATE INDEX IF NOT EXISTS idx_person_memories_person_id ON person_memories(person_id);
          CREATE INDEX IF NOT EXISTS idx_person_memories_memory_date ON person_memories(memory_date);
          CREATE INDEX IF NOT EXISTS idx_person_memories_person_memory_date
            ON person_memories(person_id, memory_date);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_person_memories_relationship_id
            ON person_memories(relationship_id)
            WHERE relationship_id IS NOT NULL;
        `)

        db.exec('INSERT OR REPLACE INTO schema_version (version) VALUES (10)')
      })
      tx()
    } finally {
      db.pragma(prevFkOn ? 'foreign_keys = ON' : 'foreign_keys = OFF')
    }
  }
}
