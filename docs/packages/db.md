# @emory/db

SQLite database abstraction layer for the Emory Electron app using `better-sqlite3`.

## Overview

This package provides a typed repository pattern over a local SQLite database. It handles schema migrations, data access, and type conversion between SQLite storage formats and TypeScript domain types.

## Architecture

```
packages/db/src/
├── index.ts                          # Barrel exports
├── types.ts                          # Domain types + DB row types
├── adapters/
│   ├── storage.adapter.ts           # StorageAdapter contract (local + future cloud sync)
│   └── sqlite.adapter.ts            # SQLite implementation + schema migrations
└── repositories/
    ├── people.repository.ts         # People + face embeddings, merge
    ├── encounter.repository.ts      # Sessions + encounters
    ├── unknown-sighting.repository.ts
    ├── relationship.repository.ts
    ├── retention.repository.ts      # retention_config rows
    └── conversation.repository.ts   # conversation_recordings + person_memories
```

### Layers

| Layer | Responsibility |
|---|---|
| **Storage contract** (`StorageAdapter`) | Persistence (`initialize`, `close`, `getType`) and optional sync hooks (`getSyncMetadata`, `triggerSync`, `resolveConflict`). See [Cloud sync architecture](../architecture/cloud-sync.md). `SqliteAdapter.initialize()` is synchronous; the type allows `Promise` for future adapters. |
| **Adapter** (`SqliteAdapter`) | Implements `StorageAdapter`. Opens the SQLite connection, enables WAL mode, runs schema migrations. No business logic. |
| **Repositories** | One repository per aggregate area (see below). Each converts between DB rows (snake_case) and domain types (camelCase). |
| **Types** (`types.ts`) | Domain types (`Person`, `FaceEmbedding`, `Encounter`, …) and related unions. |

### Repositories

| Repository | File | Responsibility |
|---|---|---|
| `PeopleRepository` | `people.repository.ts` | People CRUD, **`findSelf`** / **`setSelfPerson`** (single `is_self` row), embeddings (add/list/delete/reassign/grouped metadata), merge two people (see [Merge behaviour](#merge-behaviour)), profile JSON fields |
| `EncounterRepository` | `encounter.repository.ts` | Sessions, encounters, recency queries, `deleteOldEncounters` for retention |
| `UnknownSightingRepository` | `unknown-sighting.repository.ts` | Unknown face upserts, status transitions, `deleteOldSightings` |
| `RelationshipRepository` | `relationship.repository.ts` | Links between people; **`findAll()`** for full graph loads |
| `RetentionRepository` | `retention.repository.ts` | Read/upsert `retention_config` |
| `ConversationRepository` | `conversation.repository.ts` | Conversation audio metadata, transcript/parse status transitions, person memories |

## Schema

### Version 1 (Phase 0A)

#### `schema_version`
Tracks applied migrations.

| Column | Type | Constraint |
|---|---|---|
| `version` | INTEGER | PRIMARY KEY |

#### `people`
Core person records.

| Column | Type | Constraint |
|---|---|---|
| `id` | TEXT | PRIMARY KEY (UUID v4) |
| `name` | TEXT | NOT NULL |
| `relationship` | TEXT | |
| `notes` | TEXT | |
| `photos` | TEXT | |
| `first_met` | TEXT | |
| `last_seen` | TEXT | |
| `created_at` | TEXT | NOT NULL (ISO 8601) |

#### `face_embeddings`
Face embedding vectors (ArcFace output length **512** floats) stored as BLOBs (`Float32Array`).

| Column | Type | Constraint |
|---|---|---|
| `id` | TEXT | PRIMARY KEY (UUID v4) |
| `person_id` | TEXT | NOT NULL, FK → people(id) ON DELETE CASCADE |
| `embedding` | BLOB | NOT NULL (Float32Array serialised as Buffer) |
| `source` | TEXT | NOT NULL (`'photo_upload'`, `'live_capture'`, or `'auto_learn'`) |
| `created_at` | TEXT | NOT NULL (ISO 8601) |

**Indexes:** `idx_face_embeddings_person_id` on `person_id`.

### Version 2 (Phase 1A)

V2 extends the schema with session tracking, encounter logging, unknown face tracking, appearance drift detection, relationship graphs, and retention policy configuration.

#### `people` — new columns

| Column | Type | Notes |
|---|---|---|
| `key_facts` | TEXT | JSON array of strings |
| `conversation_starters` | TEXT | JSON array of strings |
| `important_dates` | TEXT | JSON array of `{ label, date }` |
| `last_topics` | TEXT | JSON array of strings |

#### `sessions`
Groups encounters during a single app run.

| Column | Type | Constraint |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `started_at` | TEXT | NOT NULL (ISO 8601) |
| `ended_at` | TEXT | |
| `device_id` | TEXT | |
| `total_encounters` | INTEGER | NOT NULL, DEFAULT 0 |

#### `encounters`
A known person detected during a session.

| Column | Type | Constraint |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `person_id` | TEXT | NOT NULL, FK → people(id) ON DELETE CASCADE |
| `session_id` | TEXT | NOT NULL, FK → sessions(id) ON DELETE CASCADE |
| `started_at` | TEXT | NOT NULL (ISO 8601) |
| `ended_at` | TEXT | |
| `avg_confidence` | REAL | |
| `peak_confidence` | REAL | |
| `is_important` | INTEGER | NOT NULL, DEFAULT 0 |
| `created_at` | TEXT | NOT NULL (ISO 8601) |

**Indexes:** `person_id`, `session_id`, `started_at`.

#### `unknown_sightings`
Unidentified faces tracked over time until named or dismissed.

| Column | Type | Constraint |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `temp_id` | TEXT | NOT NULL |
| `first_seen` | TEXT | NOT NULL (ISO 8601) |
| `last_seen` | TEXT | NOT NULL (ISO 8601) |
| `sighting_count` | INTEGER | NOT NULL, DEFAULT 1 |
| `best_embedding` | BLOB | |
| `best_confidence` | REAL | |
| `thumbnail_path` | TEXT | |
| `status` | TEXT | NOT NULL, DEFAULT `'tracking'` (`'tracking'` / `'dismissed'` / `'named'`) |
| `named_as_person_id` | TEXT | FK → people(id) ON DELETE SET NULL |
| `created_at` | TEXT | NOT NULL (ISO 8601) |

**Indexes:** `status`, `temp_id`.

#### `appearance_changes`
Detected shifts in a person's look (glasses, hair, etc.).

| Column | Type | Constraint |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `person_id` | TEXT | NOT NULL, FK → people(id) ON DELETE CASCADE |
| `change_type` | TEXT | NOT NULL |
| `detected_at` | TEXT | NOT NULL (ISO 8601) |
| `old_centroid` | BLOB | |
| `new_centroid` | BLOB | |
| `auto_adapted` | INTEGER | NOT NULL, DEFAULT 0 |
| `notes` | TEXT | |
| `created_at` | TEXT | NOT NULL (ISO 8601) |

**Indexes:** `person_id`.

#### `relationships`
Bidirectional links between people.

| Column | Type | Constraint |
|---|---|---|
| `id` | TEXT | PRIMARY KEY |
| `person_a_id` | TEXT | NOT NULL, FK → people(id) ON DELETE CASCADE |
| `person_b_id` | TEXT | NOT NULL, FK → people(id) ON DELETE CASCADE |
| `relationship_type` | TEXT | NOT NULL |
| `notes` | TEXT | |
| `created_at` | TEXT | NOT NULL (ISO 8601) |

**Indexes:** `person_a_id`, `person_b_id`.

#### `retention_config`
Per-entity cleanup settings.

| Column | Type | Constraint |
|---|---|---|
| `entity_type` | TEXT | PRIMARY KEY |
| `retention_days` | INTEGER | NOT NULL |
| `keep_important` | INTEGER | NOT NULL, DEFAULT 1 |

**Default seeds:** `encounters` (90 days, keep important), `unknown_sightings` (30 days), `activity_log` (30 days). There is **no `activity_log` table** in schema v2 yet; the row reserves retention policy for a future activity persistence layer. The desktop `CleanupService` currently applies retention only for `encounters` and `unknown_sightings` (see `apps/desktop/src/main/services/cleanup.service.ts`).

### Version 3 (embedding gallery + quality)

Adds optional display and QC fields on **`face_embeddings`** (migration `migrateToV3()`; `CURRENT_SCHEMA_VERSION` includes **3**).

#### `face_embeddings` — new columns

| Column | Type | Notes |
|---|---|---|
| `thumbnail` | TEXT | Optional **128×128 JPEG** face crop as **base64** (registration + auto-learn) |
| `quality_score` | REAL | Optional numeric quality from validation / pipeline (e.g. `validateEmbedding` score) |

Existing rows may have `NULL` for these columns until backfilled or rewritten.

### Version 4 (query indexes)

Migration `migrateToV4()` bumps **`CURRENT_SCHEMA_VERSION` to 4**. It adds `CREATE INDEX IF NOT EXISTS` entries for common sort/filter columns (idempotent where indexes already existed from v2):

| Index | Table | Column(s) |
|---|---|---|
| `idx_people_created_at` | `people` | `created_at` |
| `idx_face_embeddings_created_at` | `face_embeddings` | `created_at` |
| `idx_sessions_started_at` | `sessions` | `started_at` |
| `idx_unknown_sightings_last_seen` | `unknown_sightings` | `last_seen` |
| `idx_encounters_person_id` | `encounters` | `person_id` |
| `idx_encounters_started_at` | `encounters` | `started_at` |
| `idx_relationships_person_a` | `relationships` | `person_a_id` |
| `idx_relationships_person_b` | `relationships` | `person_b_id` |

#### Types

Domain / row types expose **`thumbnail?: string`** and **`qualityScore?: number`** (or equivalent on `FaceEmbedding` / gallery DTOs) alongside `embedding`, `source`, and timestamps. See `types.ts` for the canonical shapes used by **`getEmbeddingsWithMeta`**, **`getEmbeddingById`**, and grouped gallery payloads.

### Version 5 (connection web — “me”)

Migration `migrateToV5()` bumps **`CURRENT_SCHEMA_VERSION` to 5**.

#### `people` — new column

| Column | Type | Notes |
|---|---|---|
| `is_self` | INTEGER | NOT NULL, DEFAULT **0**; at most one row should have **1** — the person who is the app user (centre of the Connections ego graph). Enforced in **`PeopleRepository.setSelfPerson`**. |

The domain type **`Person`** includes **`isSelf: boolean`** (derived from `is_self === 1`).

### Version 6 (conversation recordings + memories)

Migration `migrateToV6()` bumps **`CURRENT_SCHEMA_VERSION` to 6**.

#### `conversation_recordings`

Source row per captured audio segment: file path on disk, person link, optional encounter link, transcript fields, processing statuses.

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT | PRIMARY KEY (UUID) |
| `person_id` | TEXT | NOT NULL, FK → `people(id)` ON DELETE CASCADE |
| `encounter_id` | TEXT | FK → `encounters(id)` ON DELETE SET NULL |
| `recorded_at` | TEXT | NOT NULL (ISO 8601) |
| `audio_path` | TEXT | NOT NULL (absolute path under userData) |
| `mime_type` | TEXT | NOT NULL |
| `duration_ms` | INTEGER | |
| `transcript_raw_text` | TEXT | STT output (e.g. Deepgram) |
| `transcript_provider` | TEXT | e.g. `deepgram` |
| `transcript_status` | TEXT | NOT NULL: `pending` \| `complete` \| `failed` |
| `transcript_error` | TEXT | STT failure detail |
| `extraction_status` | TEXT | NOT NULL: `pending` \| `complete` \| `failed` |
| `extraction_json` | TEXT | Serialized **`MemoryExtractionResult`** (summary + memories + uncertain items) |
| `extraction_error` | TEXT | LLM / extraction failure detail |
| `created_at` / `updated_at` | TEXT | NOT NULL |

**Indexes:** `idx_conversation_recordings_person_id`, `idx_conversation_recordings_recorded_at`, `idx_conversation_recordings_person_recorded_at`.

#### `person_memories`

Short memory lines derived from transcripts (populated by desktop **`MemoryExtractionService`** after STT).

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT | PRIMARY KEY |
| `person_id` | TEXT | NOT NULL, FK → `people(id)` ON DELETE CASCADE |
| `recording_id` | TEXT | FK → `conversation_recordings(id)` ON DELETE SET NULL |
| `memory_text` | TEXT | NOT NULL |
| `memory_type` | TEXT | NOT NULL: `fact` \| `preference` \| `event` \| … (see **`MemoryType`**) |
| `memory_date` | TEXT | NOT NULL |
| `confidence` | REAL | Optional model confidence |
| `source_quote` | TEXT | Optional supporting quote from transcript |
| `created_at` | TEXT | NOT NULL |

**Indexes:** `idx_person_memories_person_id`, `idx_person_memories_memory_date`, `idx_person_memories_person_memory_date`.

`PeopleRepository.mergePeople` reparents **`conversation_recordings`** and **`person_memories`** from the merged person to the kept person (same pattern as `encounters`).

## Usage

```typescript
import { SqliteAdapter, PeopleRepository } from '@emory/db'

const adapter = new SqliteAdapter('/path/to/emory.db')
adapter.initialize()

const people = new PeopleRepository(adapter)

// Create a person
const person = people.create({ name: 'Alice', relationship: 'friend' })

// Add a face embedding
const embedding = new Float32Array(512) // ArcFace template length (see @emory/core)
people.addEmbedding(person.id, embedding, 'photo_upload')
// Active learning (desktop) may also use 'auto_learn'

// Get all embeddings for matching
const all = people.getAllEmbeddings()
// Returns FaceEmbeddingWithPerson[] (includes personName from JOIN)

// Clean up
adapter.close()
```

## `PeopleRepository` — embedding helpers

Beyond `addEmbedding` / `getEmbeddings` / `getAllEmbeddings`, the repository supports **counts and pruning** used by the desktop auto-learn pipeline, plus **gallery/admin** APIs:

| Method | Purpose |
|---|---|
| `countEmbeddings(personId)` | Total embeddings for a person |
| `countEmbeddingsBySource(personId, source)` | Count for a given `source` string (e.g. `'auto_learn'`) |
| `deleteOldestEmbeddingBySource(personId, source)` | Deletes the oldest row for that person+source (by `created_at`) — used when the auto-learn slot is full and a new angle replaces the oldest |
| `deleteEmbedding(id)` | Delete a single embedding row by id |
| `reassignEmbedding(id, newPersonId)` | Move an embedding to another person |
| `getEmbeddingsWithMeta(personId)` | Embeddings for one person including **thumbnail** / **quality** metadata |
| `getEmbeddingById(id)` | Single embedding row + meta |
| `getAllEmbeddingsGrouped()` | All embeddings **grouped by person** for the Embeddings UI |

`EmbeddingSource` in `types.ts` is `'photo_upload' | 'live_capture' | 'auto_learn'`.

## `RelationshipRepository` — graph load

| Method | Purpose |
|---|---|
| `findAll()` | Returns every relationship row (used by **Connections** graph + `db:relationships:get-all` preload) |

## Embedding Storage

`Float32Array` embeddings are converted to/from `Buffer` for SQLite BLOB storage:

- **Write:** `Buffer.from(float32.buffer, float32.byteOffset, float32.byteLength)`
- **Read:** `new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)`

## Migration System

The adapter uses a simple versioned migration system:

1. On `initialize()`, reads the current version from `schema_version`
2. Applies all migrations above the current version inside a transaction
3. Each migration bumps the version number

Each migration method (e.g. `migrateToV2()`, `migrateToV3()`, `migrateToV4()`) is idempotent — `CREATE TABLE IF NOT EXISTS` and try/catch around `ALTER TABLE` ensure safe re-runs. **V3** adds `thumbnail` and `quality_score` on `face_embeddings`. **V4** adds the indexes listed above. **V6** adds `conversation_recordings` and `person_memories` (see [Version 6](#version-6-conversation-recordings--memories)).

## Merge behaviour

`PeopleRepository.mergePeople(keepId, mergeId)` reassigns foreign keys from the merged person to the kept person, then deletes the merged row. After relationship columns are updated, both endpoints can point at the same person, producing **self-relationships** (`person_a_id === person_b_id`). The merge transaction therefore runs `DELETE FROM relationships WHERE person_a_id = person_b_id` before deleting the merged person.

If the **merged-away** person had **`is_self = 1`**, the kept person is updated to **`is_self = 1`** so the “me” marker is not lost.

## Testing

Unit tests use an in-memory SQLite database (`:memory:`) so they run fast with no file I/O. Each test gets a fresh adapter and schema via `beforeEach`.

### Running tests

```bash
# Single run
bun run test

# Watch mode
bun run test:watch
```

### Test structure

Tests live in `src/__tests__/repositories.test.ts` and cover all five repositories:

| Suite | Coverage |
|---|---|
| `PeopleRepository` | CRUD, **`findSelf` / `setSelfPerson`**, embeddings (incl. V3 thumbnail/quality), gallery helpers, profile fields, merge (incl. `is_self` handoff), last seen |
| `EncounterRepository` | Sessions, encounters, active encounter lookup, counts |
| `UnknownSightingRepository` | Create, find by temp ID, dismiss, active count |
| `RelationshipRepository` | Create, find by person, find between two people, **`findAll`** |
| `RetentionRepository` | Default config seeds, upsert |

### Native module note

`better-sqlite3` includes a native addon that must match the Node.js version running vitest. If tests fail with `NODE_MODULE_VERSION` errors after a Node upgrade, rebuild the module:

```bash
npx node-gyp rebuild --release --target=<your-node-version> --dist-url=https://nodejs.org/download/release/
```

Run from `node_modules/better-sqlite3/`.

## Configuration

- **WAL mode** is enabled for better concurrent read/write performance
- **Foreign keys** are enforced via `PRAGMA foreign_keys = ON`
- Default database path is `emory.db` in the working directory; pass the Electron `userData` path in production
