# Cloud Sync Architecture

## Status: Foundation phase (interface designed, not implemented)

## Sync Protocol Design

### Principles
- Last-write-wins for person profiles, relationships, settings
- Append-only for encounters, activity logs, unknown sightings
- Binary blob storage for embeddings (Supabase Storage or S3)
- Conflict resolution: local changes win by default, with manual override

### Data Classification
| Data Type | Sync Strategy | Storage |
|-----------|--------------|---------|
| People (profiles) | Last-write-wins | DB row |
| Embeddings | Append + deduplicate | Blob storage |
| Encounters | Append-only | DB row |
| Unknown sightings | Append-only | DB row + blob |
| Relationships | Last-write-wins | DB row |
| Settings | Per-device, no sync | Local only |
| Retention config | Last-write-wins | DB row |

### Multi-device Conflict Resolution
1. Each device has a unique `deviceId`
2. All mutations include `deviceId` and `timestamp`
3. On sync: compare timestamps, latest wins
4. For embeddings: merge sets, deduplicate by cosine similarity > 0.95
5. For encounters: append from all devices, no dedup needed (different cameras)

### Future Supabase Adapter
- Tables mirror SQLite schema
- Real-time subscriptions for live updates across devices
- Embedding blobs stored in Supabase Storage buckets
- Auth: Clerk user ID maps to Supabase row-level security

### Migration Path
1. Current: SQLiteAdapter (local only)
2. Next: Add deviceId to all tables
3. Then: Implement SupabaseAdapter with same interface
4. Finally: Add sync UI (status indicator, manual sync button, conflict resolver)
