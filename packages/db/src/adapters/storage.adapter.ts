export type SyncStatus = 'synced' | 'pending_upload' | 'pending_download' | 'conflict'

export type SyncMetadata = {
  lastSyncedAt: string | null
  deviceId: string
  syncStatus: SyncStatus
}

export type StorageAdapterConfig = {
  type: 'sqlite' | 'supabase'
  connectionString: string
  deviceId?: string
}

/**
 * Abstract storage adapter interface.
 * Implementations must handle data persistence and optionally synchronisation.
 * The SQLite adapter (default) stores everything locally.
 * Future Supabase adapter will add cloud sync capabilities.
 */
export type StorageAdapter = {
  initialize(): Promise<void> | void
  close(): Promise<void> | void
  getType(): string

  // Sync-related (optional, implemented by cloud adapters)
  getSyncMetadata?(): SyncMetadata
  triggerSync?(): Promise<void>
  resolveConflict?(entityType: string, entityId: string, resolution: 'local' | 'remote'): Promise<void>
}
