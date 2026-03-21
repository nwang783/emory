# Documentation changelog

## 2026-03-21 — Remote ingest: WS `/ingest` + Camera viewer

- **Desktop** — [`remote-ingest-server.service.ts`](../apps/desktop/src/main/services/remote-ingest-server.service.ts): WebSocket **`/ingest`** relays binary frames from **publisher** (phone) to **viewers** (desktop). `/health` **`protoVersion` 2** + `wsIngestPath`. [`@emory/ingest-protocol`](../packages/ingest-protocol/) shared parse/constants.
- **Renderer** — [`useCameraFeed`](../apps/desktop/src/renderer/modules/camera/hooks/useCameraFeed.ts), [`remote-ingest.store.ts`](../apps/desktop/src/renderer/shared/stores/remote-ingest.store.ts), IPC **`remote-ingest:updated`**, [`WebcamFeed`](../apps/desktop/src/renderer/modules/camera/components/WebcamFeed.tsx): remote JPEG preview + face pipeline when ingest on; **Use computer camera** override (`sessionStorage`).
- **Docs** — [remote-camera-desktop-plan.md](./architecture/remote-camera-desktop-plan.md), [ios-remote-ingest-client.md](./architecture/ios-remote-ingest-client.md), [remote-ingest-tailscale.md](./architecture/remote-ingest-tailscale.md), [remote-discovery.md](./architecture/remote-discovery.md), [apps/desktop.md](./apps/desktop.md).

## 2026-03-21 — Desktop in-page mini sidebars

- **Layout** — [`PageLayout.tsx`](../apps/desktop/src/renderer/shared/components/PageLayout.tsx): `PageWorkspace` (main + rail), `MiniSidebarNav` (section / filter list with optional icons and counts), `MiniSidebarPanel` (static rail content, e.g. legend).
- **Modules** — **Settings** uses category rail + one panel per category; **Activity** filter rail; **Analytics** view switcher; **Embeddings** people jump list (scroll + expand); **Memories** memory-type rail; **People** (full width) overview rail; **Connections** right-hand legend rail. **Camera** people column slightly narrower with translucent card.
- **Chrome** — Primary sidebar ~196px; header height 11; light backdrop blur on header / page titles where used.
- **Fix** — `EmbeddingGallery` closed with matching `PageScroll` (was a stray `</ScrollArea>`). **MemoryBrowser** debug `console.log` / `console.error` removed.
- **Docs** — [apps/desktop-ui.md](./apps/desktop-ui.md) updated for mini-sidebar pattern.

## 2026-03-21 — Desktop module page layouts (`PageLayout`)

- **Shared primitives** — [`PageLayout.tsx`](../apps/desktop/src/renderer/shared/components/PageLayout.tsx): `PageShell`, `PageHeader`, `PageToolbar`, `PageScroll`, `PageFill`.
- **Modules** — Activity, Analytics, People, Settings, Connections, **Embeddings** (`EmbeddingGallery`), **Memories** (`MemoryBrowser`) compose these for consistent headers, toolbars, and scroll vs full-bleed canvas.
- **Connections** — Legend row uses `PageToolbar`; graph uses `PageFill`. Closing tag aligned to `PageShell`.
- **Docs** — [apps/desktop-ui.md](./apps/desktop-ui.md) “Page layout primitives” section.

## 2026-03-21 — Desktop UI: anti–“vibecode” pass

- **Restraint** — Flat main surface (no radial meshes); near-neutral `oklch` palette; desaturated primary; cards use border only (no ring stack).
- **Chrome** — Header: solid bar, simple bordered logo tile; sidebar: no tooltips on labeled items, active = `accent` only; status bar: semantic `foreground` instead of arbitrary colors; sentence case labels.
- **Type** — Module titles default to **Inter** semibold; **Plus Jakarta** limited to app name + Settings H1; see [desktop-ui.md](./apps/desktop-ui.md).

## 2026-03-21 — Desktop UI refresh (Vercel / Tailscale–inspired)

- **Renderer** — Wider **grouped sidebar** (Workspace / Insights / System), refined **header** (gradient mark, mono status chips), **status bar** with JetBrains Mono, main area **`app-main-surface`** gradient wash; camera rail uses translucent card treatment.
- **Theme** — Cool dark `oklch` neutrals + indigo primary in [`index.css`](../apps/desktop/src/renderer/index.css); **Inter Variable**, **Plus Jakarta Sans** (`font-heading`), **JetBrains Mono** (`font-mono-ui`) via fontsource packages.
- **Modules** — Consistent page headers (border + `font-heading`) on Activity, Analytics, Connections, Embeddings, Memories, People, Settings.
- **Docs** — [apps/desktop-ui.md](./apps/desktop-ui.md), link from [apps/desktop.md](./apps/desktop.md).

## 2026-03-21 — gitignore `.agents/`

- **`.gitignore`** — Ignore **`.agents/`** entirely (local gstack clone + skills, not committed). Removed narrower `.agents/...` rules superseded by this.
- **[agents/gstack.md](./agents/gstack.md)**, **[`CLAUDE.md`](../CLAUDE.md)** — Document local-only install (clone + `./setup --host codex` + optional Cursor stubs).

## 2026-03-21 — gstack agent skills

- **gstack** — [garrytan/gstack](https://github.com/garrytan/gstack) (MIT); install under **`.agents/skills/gstack/`** (see [agents/gstack.md](./agents/gstack.md)), run `./setup --host codex` from Git Bash for browse + Playwright. Optional **`gstack-*`** / **`gstack-workflow`** stubs under `.agents/skills/` for Cursor discovery.
- **[agents/gstack.md](./agents/gstack.md)** — Layout, teammate setup, telemetry note, `setup` sidecar quirk.
- **Root [`CLAUDE.md`](../CLAUDE.md)** — gstack section and slash-command list for agents.

## 2026-03-21 — iOS remote ingest implementer guide

- **[architecture/ios-remote-ingest-client.md](./architecture/ios-remote-ingest-client.md)** — For agents/devs building the Swift app: Tailscale prerequisites, `GET /health` JSON contract (field table), UDP beacon integration notes, manual config UX, Info.plist / Local Network, suggested `emory/` file layout, QA matrix, placeholders for future WSS/WebRTC.

## 2026-03-21 — Remote ingest (Phase 0) + docs

- **Desktop** — Settings card **Remote ingest**: enable server, bind mode (Tailscale / all / loopback), signaling port, friendly name, UDP beacon interval, **Apply & restart**, **Copy connection details**. Main: `remote-ingest-settings.service.ts`, `remote-ingest-server.service.ts`, `remote-ingest-network.ts`, `remote-ingest.ipc.ts`; HTTP `GET /health` + optional multicast beacon per [remote-discovery.md](./architecture/remote-discovery.md).
- **Docs** — [architecture/remote-ingest-tailscale.md](./architecture/remote-ingest-tailscale.md), [architecture/remote-discovery.md](./architecture/remote-discovery.md); [apps/desktop.md](./apps/desktop.md) IPC + Settings updates.

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
