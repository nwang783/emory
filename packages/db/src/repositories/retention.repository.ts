import type { SqliteAdapter } from '../adapters/sqlite.adapter.js'
import type { RetentionConfig, RetentionConfigRow } from '../types.js'

function rowToConfig(row: RetentionConfigRow): RetentionConfig {
  return {
    entityType: row.entity_type,
    retentionDays: row.retention_days,
    keepImportant: row.keep_important === 1,
  }
}

export class RetentionRepository {
  constructor(private adapter: SqliteAdapter) {}

  getAll(): RetentionConfig[] {
    const db = this.adapter.getDb()
    const rows = db.prepare('SELECT * FROM retention_config ORDER BY entity_type').all() as RetentionConfigRow[]
    return rows.map(rowToConfig)
  }

  getByEntityType(entityType: string): RetentionConfig | null {
    const db = this.adapter.getDb()
    const row = db.prepare('SELECT * FROM retention_config WHERE entity_type = ?').get(entityType) as RetentionConfigRow | undefined
    return row ? rowToConfig(row) : null
  }

  upsert(entityType: string, retentionDays: number, keepImportant: boolean): RetentionConfig {
    const db = this.adapter.getDb()
    db.prepare(`
      INSERT INTO retention_config (entity_type, retention_days, keep_important)
      VALUES (?, ?, ?)
      ON CONFLICT(entity_type) DO UPDATE SET retention_days = ?, keep_important = ?
    `).run(entityType, retentionDays, keepImportant ? 1 : 0, retentionDays, keepImportant ? 1 : 0)

    return this.getByEntityType(entityType)!
  }

  delete(entityType: string): boolean {
    const db = this.adapter.getDb()
    const result = db.prepare('DELETE FROM retention_config WHERE entity_type = ?').run(entityType)
    return result.changes > 0
  }
}
