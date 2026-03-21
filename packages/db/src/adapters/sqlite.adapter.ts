import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import Database from 'better-sqlite3'
import type { Database as DatabaseType } from 'better-sqlite3'
import type { StorageAdapter } from './storage.adapter.js'

const CURRENT_SCHEMA_VERSION = 7
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

    this.db.exec('INSERT OR REPLACE INTO schema_version (version) VALUES (7)')
  }
}
