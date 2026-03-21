# Documentation changelog

## 2026-03-21 — Camera device label in camera view

- **`useWebcam` + `WebcamFeed`** — After `getUserMedia`, the first video track’s `label` is shown as **Camera: …** above conversation/mic status. Helps verify which device Chromium actually bound (vs Windows “default” camera).

## 2026-03-21 — Settings: conversation recordings folder

- **Settings** — “Conversation recordings” card: shows storage path and **Open folder** (IPC `app:get-conversations-dir`, `app:open-conversations-folder`). Root path helper `getConversationsRootDir()` in `conversation-storage.service.ts`.

## 2026-03-21 — Encounter logging fix

- **`WebcamFeed` + `encounter.log`** — The renderer was passing `(sessionId, personId, similarity)` while the preload API only forwards `(personId, confidence)`, so the session UUID was incorrectly stored as `person_id`. Calls now use `(personId, similarity)` so encounter rows match the recognised person.

## 2026-03-21 — Conversation recording (face-linked audio)

- **Schema v6** — `conversation_recordings` and `person_memories` tables, `ConversationRepository`, merge reparenting for both tables.
- **Main** — `ConversationStorageService`, `conversation.ipc.ts` (`save-and-process`, get-by-person queries), registration from `main/index.ts`; `registerDbIpc` exposes `conversationRepo`.
- **Renderer** — `useConversationRecorder` + `primarySubject` (largest bbox primary, start/stop debounce, frozen `personId`); `WebcamFeed` shows capture status and mic errors.
- **Docs** — `docs/architecture/conversation-recording.md`, updates to `docs/apps/desktop.md`, `docs/packages/db.md`, `docs/README.md`.
- **Vitest** — `packages/db/vitest.config.ts` import fixed (`vitest/config`). Repository tests require a **native `better-sqlite3` build** matching the local Node/Bun ABI.


## 2026-03-21 — Production polish + integration wiring

- **Encounter logging** — `WebcamFeed` starts/ends sessions on camera start/stop, logs encounters with cooldown when faces are recognised.
- **Unknown tracking** — `WebcamFeed` calls `unknown.track()` for unidentified faces persisted past the unlock threshold.
- **Activity events** — Recognition events and registration events now logged to the activity feed (previously only auto-learn).
- **Relationship voice** — `WhoIsThisButton` receives relationship data from people store for context-aware announcements.
- **AutoLearnResult type** — Added `low_margin`, `identity_mismatch`, and `low_quality` reasons to the union type in `@emory/core`.
- **ConnectionsGraph fix** — Preserves node positions on reload; no skeleton flash when adding relationships.
- **Schema v4** — Added 8 database indexes on frequently queried columns.
- **Merge safety** — `mergePeople` deletes self-relationships after reparenting.
- **IPC validation** — Relationship type normalised via `VALID_RELATIONSHIP_TYPES` (no more `as any`).
- **Error handling** — `AnalyticsDashboard`, `RetentionSettings`, `people.store`, and `App.boot()` all wrapped in try/catch.
- **ErrorBoundary** — `shared/components/ErrorBoundary.tsx` wraps `MainContent` in `App.tsx` for graceful crash recovery.
- **Accessibility** — Sidebar nav buttons expose `aria-label` and `aria-current="page"`.
- **Dead code** — Removed unused `WebcamCapture.tsx`.

## 2026-03-21 — Recognition hardening + Embedding gallery + Connections graph

- **Recognition safety** — Documented raised match threshold (0.45), margin-gated identity locking, confusion detection, hardened auto-learn (6 conditions), server-side identity verification, faster unknown clearing, confident unknown path.
- **Schema v3** — Added `thumbnail` and `quality_score` columns to `face_embeddings` table documentation.
- **Embedding gallery** — Documented new Embeddings tab (7th sidebar tab), `EmbeddingGallery` component, IPC handlers (`db:embeddings:*`), preload API (`db.embeddings.*`), and new repository methods (`deleteEmbedding`, `reassignEmbedding`, `getEmbeddingsWithMeta`, `getAllEmbeddingsGrouped`).
- **Connections graph** — Documented new Connections tab (3rd sidebar tab), `ConnectionsGraph` component, `RelationshipRepository.findAll()`, and `db:relationships:get-all` IPC handler.
- **Sidebar** — Updated from 5 tabs to 7 tabs: Camera, People, Connections, Activity, Analytics, Embeddings, Settings.

## 2026-03-21 — v2 documentation pass

- **`docs/README.md`** — Full doc index, quick reference (structure, services, Phase 0A features), links to `architecture/cloud-sync.md`.
- **`README.md` (repo root)** — Project summary and pointer to `docs/README.md`.
- **`docs/packages/db.md`** — All five repositories, `StorageAdapter` details, schema v2 tables, 512-dim embeddings, `activity_log` retention seed vs. cleanup behaviour.
- **`docs/packages/core.md`** — Liveness and appearance services in layout and exports; graded identity / embedding length notes.
- **`docs/apps/desktop.md`** — Preload completeness (`app.*`, `db.people.*`), five-tab layout, `activeTab` + default identify interval, liveness/appearance not in default IPC.
