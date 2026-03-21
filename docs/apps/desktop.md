# @emory/desktop

Electron desktop application for the Emory face recognition system. Built with electron-vite, React 19, TypeScript, and Tailwind CSS.

## Overview

The desktop app is the primary Emory client: it captures webcam frames, runs SCRFD detection and ArcFace embedding extraction via `@emory/core`, matches against embeddings in `@emory/db`, and renders live overlays with a **sidebar-driven layout**: **Camera → People → Connections → Activity → Analytics → Embeddings → Settings**. `LivenessService` and `AppearanceService` from `@emory/core` are available for pipeline integration but are **not** invoked from the default `face:*` IPC handlers in this release.

**Active learning** (optional): when enabled, the renderer can request new embeddings for recognized faces at different poses; the main process enforces cooldown, diversity, and per-person caps before persisting rows with source `auto_learn` (see [Active learning](#active-learning)).

**Conversation audio** (automatic): while the camera is on, the renderer can capture microphone audio when a **locked** face identity is primary (largest bbox); segments are saved under userData and recorded in `conversation_recordings` via IPC. See [Conversation recording](../architecture/conversation-recording.md).

## Architecture

```
apps/desktop/
├── package.json
├── electron.vite.config.ts
├── tsconfig.json                     # Project references
├── tsconfig.node.json                # Main + preload config
├── tsconfig.web.json                 # Renderer config
└── src/
    ├── main/
    │   ├── index.ts                  # Electron main process entry
    │   ├── ipc/
    │   │   ├── db.ipc.ts             # Database IPC handlers
    │   │   ├── encounter.ipc.ts      # Encounter/session IPC handlers
    │   │   ├── face.ipc.ts           # Face processing IPC handlers
    │   │   ├── unknown.ipc.ts        # Unknown person tracking IPC handlers
    │   │   ├── conversation.ipc.ts   # Save/process recordings, list rows, query memories (audio)
    │   │   └── remote-ingest.ipc.ts  # Remote hub: get/apply config, status (Tailscale ingest Phase 0)
    │   └── services/
    │       ├── cleanup.service.ts    # Periodic data retention cleanup job
    │       ├── remote-ingest-settings.service.ts  # Persist remote-ingest-config.json
    │       ├── remote-ingest-server.service.ts   # HTTP /health + UDP discovery beacon
    │       ├── remote-ingest-network.ts          # Tailscale 100.x / bind helper
    │       ├── remote-ingest.types.ts            # Config + status types
    │       ├── conversation-storage.service.ts # Write audio files under userData/conversations
    │       ├── conversation-processing.service.ts # Audio -> transcript -> extracted memories
    │       ├── deepgram.service.ts   # STT for recordings and memory queries
    │       ├── memory-extraction.service.ts # Transcript -> structured memories
    │       ├── memory-query.service.ts # Query audio -> retrieval -> grounded answer
    │       ├── memory-query-understanding.service.ts # LLM query planning
    │       └── memory-answer.service.ts # LLM answer synthesis from retrieved evidence
    ├── preload/
    │   ├── index.ts                  # Context bridge API
    │   └── types.d.ts                # Window type augmentation
    └── renderer/
        ├── index.html                # HTML entry point
        ├── main.tsx                   # React root mount
        ├── index.css                  # Tailwind import
        ├── App.tsx                    # Shell: Header + Sidebar + main (ErrorBoundary) + StatusBar
        ├── components/ui/            # shadcn/ui primitives
        ├── modules/
        │   ├── camera/
        │   │   ├── components/
        │   │   │   ├── WebcamFeed.tsx     # Detection + identify loops, overlays, auto-learn, conversation recorder
        │   │   │   └── WhoIsThisButton.tsx # Voice announcement of identified people
        │   │   ├── hooks/
        │   │   │   ├── useWebcam.ts   # Webcam lifecycle management
        │   │   │   └── useConversationRecorder.ts # Mic + MediaRecorder driven by face tracks
        │   │   └── lib/
        │   │       └── primarySubject.ts # Largest-bbox primary among identified tracks
        │   ├── people/
        │   │   └── components/
        │   │       ├── PeopleList.tsx         # Grid of person cards; loading & empty states
        │   │       ├── PersonCard.tsx         # Individual person card with avatar, badges, actions
        │   │       ├── EditPersonModal.tsx    # Edit person details + rich profile dialog
        │   │       ├── TagListEditor.tsx      # Reusable string-list editor (badges + add/remove)
        │   │       ├── ImportantDateEditor.tsx # Editor for {label, date} pairs
        │   │       └── RegisterFaceModal.tsx  # New person registration: inline viewfinder + upload
        │   ├── settings/
        │   │   └── components/
        │   │       ├── SettingsPanel.tsx      # Recognition, display, performance, conversation storage, remote ingest, retention
    │   │       └── RemoteIngestSettings.tsx # Remote ingest hub (bind, port, beacon, copy connection kit)
        │   ├── activity/
        │   │   └── components/
        │   │       └── ActivityFeed.tsx       # Timestamped event log
        │   ├── analytics/
        │   │   ├── types.ts                   # Analytics domain types
        │   │   └── components/
        │   │       ├── AnalyticsDashboard.tsx  # Data loading, layout orchestration
        │   │       ├── SummaryCards.tsx        # Stat cards (people, encounters, unknowns)
        │   │       ├── FrequentVisitors.tsx    # Top visitors by encounter count (30 days)
        │   │       ├── RecentEncounters.tsx    # Last 20 encounters with confidence/duration
        │   │       └── UnknownSightings.tsx    # Unknown sighting list with status
        │   ├── connections/
        │   │   ├── components/
        │   │   │   └── ConnectionsGraph.tsx    # Ego-network graph (you at centre, canvas + force layout)
        │   │   └── lib/
        │   │       └── ego-subgraph.ts         # BFS reachable people from self for the graph
        │   └── embeddings/
        │       └── components/
        │           └── EmbeddingGallery.tsx    # Embeddings by person: thumbnails, reassign/delete
        └── shared/
            ├── components/
            │   ├── Header.tsx         # Top bar: branding, model status, settings
            │   ├── Sidebar.tsx        # Vertical tab navigation (aria-label + aria-current)
            │   ├── StatusBar.tsx      # Bottom status bar (FPS, faces, timing)
            │   └── ErrorBoundary.tsx  # Catches render errors in main content; Try again resets state
            ├── lib/
            │   └── voice.ts           # Web Speech API wrapper (speak, stop, status)
            └── stores/
                ├── face.store.ts       # Face detection state (Zustand)
                ├── people.store.ts     # People list state (Zustand)
                ├── settings.store.ts   # App settings + active tab (Zustand)
                └── activity.store.ts   # Activity event log (Zustand)
```

### Layers

| Layer | Responsibility |
|---|---|
| **Main Process** (`src/main/`) | Electron app lifecycle, IPC handler registration, service orchestration. Uses `@emory/core` for face processing and `@emory/db` for persistence. On **`before-quit`**, stops `CleanupService` and calls **`disposeFaceService()`** from `ipc/face.ipc.ts` to release ONNX `InferenceSession` instances (best-effort, fire-and-forget). |
| **Services** (`src/main/services/`) | Background jobs and pipelines. `CleanupService` applies `retention_config`. `ConversationStorageService` writes clips under **`userData/conversations/YYYY/MM/`**. `ConversationProcessingService` runs Deepgram + memory extraction on saved segments; extraction receives **graph** context via `RelationshipRepository.findBetween(self, target)` (not `people.relationship`). `MemoryQueryService` transcribes a query clip, plans retrieval, searches SQLite (`searchMemories` / `searchRecordings`), and synthesizes a grounded answer. |
| **IPC Handlers** (`src/main/ipc/`) | `db.ipc.ts` — people, embeddings, relationships, retention, **`ConversationRepository`**; **`conversation.ipc.ts`** — `save-and-process`, `process-recording`, listing handlers, **`conversation:query-memories`**; **`remote-ingest.ipc.ts`** — `remote-ingest:get-config`, `get-status`, `apply`; `encounter.ipc.ts`, `face.ipc.ts`, `unknown.ipc.ts` as above. |
| **Preload** (`src/preload/`) | Context bridge exposing `window.emoryApi` with typed methods. Converts `ArrayBuffer` to `Uint8Array` for IPC serialization. |
| **Renderer** (`src/renderer/`) | React UI. Domain modules (`camera`, `people`, `connections`, `embeddings`, `settings`, `activity`, `analytics`) plus shared layout components and Zustand stores. |

### Face engine shutdown

`src/main/index.ts` registers `app.on('before-quit', …)` which invokes **`disposeFaceService()`** from `ipc/face.ipc.ts`. That function awaits `FaceService.dispose()` (releases SCRFD and ArcFace ONNX sessions) and clears the module-level `faceService` reference. Errors are swallowed (`.catch(() => {})`) so quit is not blocked.

## Data retention

`CleanupService` (`src/main/services/cleanup.service.ts`) runs a periodic cleanup job in the Electron main process to delete old data based on user-configured retention policies.

### How it works

1. **Startup:** `CleanupService` is instantiated in `main/index.ts` after `registerDbIpc()` returns the repositories. It runs an immediate cleanup, then schedules a repeat every 24 hours.
2. **Shutdown:** The `before-quit` handler calls `cleanupService.stop()` to clear the interval timer.
3. **Per-run:** The service reads all rows from `retention_config` (via `RetentionRepository.getAll()`) and processes each:

| `entityType` | Repository method | Notes |
|---|---|---|
| `encounters` | `EncounterRepository.deleteOldEncounters(days, keepImportant)` | When `keepImportant` is true, encounters marked as important are preserved regardless of age |
| `unknown_sightings` | `UnknownSightingRepository.deleteOldSightings(days)` | Only deletes sightings with status other than `tracking` |

### Settings UI

The **Remote ingest** card (`RemoteIngestSettings.tsx`) exposes:

- **Enable** remote ingest HTTP listener; **bind** to Tailscale `100.x`, all interfaces, or loopback; **TCP port** (default 18763); **friendly name** for discovery; **UDP beacon** toggle and interval; placeholder for future **mDNS**.
- **Apply & restart server** persists `<userData>/remote-ingest-config.json` and restarts the HTTP + beacon services.
- **Copy connection details** puts health URLs and instance id on the clipboard for manual phone setup.

See [Remote ingest over Tailscale](../architecture/remote-ingest-tailscale.md) and [Remote discovery](../architecture/remote-discovery.md).

The **Data Retention** card in `SettingsPanel` exposes:

| Control | Range | Default | Persisted as |
|---|---|---|---|
| Encounter Retention (slider) | 7–365 days | 90 | `retention_config` row with `entity_type = 'encounters'` |
| Keep Important Encounters (toggle) | on/off | on | `keep_important` column on the `encounters` row |
| Unknown Sightings Retention (slider) | 7–90 days | 30 | `retention_config` row with `entity_type = 'unknown_sightings'` |

Changes are persisted immediately via `db:retention:upsert` IPC and take effect on the next cleanup run. The **Settings** retention card loads config with a `.catch` so a failed `db:retention:get-all` still marks the panel loaded (defaults apply); `upsert` failures are caught so sliders do not surface errors. **Analytics** wraps its parallel people / encounter / unknown loads in `try`/`finally` so a failed fetch clears the loading state without throwing to the console.

## Active learning

End-to-end flow:

1. **Detection loop** (`WebcamFeed`) calls `face:detect-only` on a short interval (`detectCooldownMs` from `settings.store`) to update face tracks and overlay FPS.
2. **Identification loop** runs on `identifyIntervalMs` and calls `face:process-frame` to match faces and update `matches`.
3. When **auto-learn** is enabled in settings, a matched track can trigger `face:extract-embedding` then `face:auto-learn` with the new vector. The renderer also requires a **per-track** minimum gap (~15s) and a similarity band (see `WebcamFeed.tsx` constants) before attempting extraction.
4. **Main process** (`face.ipc.ts`) applies:

| Rule | Value |
|---|---|
| Cooldown per `personId` | 10s between successful learn attempts |
| Embedding quality | `validateEmbedding` from `@emory/core`: reject invalid vectors (`reason: 'error'`); reject when `qualityScore < 0.5` (`reason: 'too_similar'`) |
| Diversity | **Manual** (registration) rows: skip if cosine similarity **≥ 0.85** to any such embedding. **Auto-learn** rows: skip if similarity **≥ 0.80** (0.85 − 0.05) to any `auto_learn` embedding — stricter separation from registration, slightly looser among auto-learned samples |
| Auto-learn cap | Max **15** embeddings with `source = auto_learn`; when full, **oldest** `auto_learn` row is deleted and replaced |
| Total cap | Max **20** embeddings per person across all sources; if at cap, new stores are rejected unless replacing an auto-learn slot as above |
| **Renderer gate (hardened)** | Auto-learn only when **similarity ≥ 0.60**, **match margin ≥ 0.06**, identity held **≥ 30s**, **5/8 vote consensus** for the same person, and track is **not** in the confused state (see [Recognition safety](#recognition-safety)). |
| **Server verification** | Before persist, re-match the new embedding against that person’s **existing** embeddings: require **min similarity ≥ 0.45** to at least one stored vector; **reject** if computed margin **< 0.06** (ambiguous vs other identities). |

Face **thumbnails** (128×128 JPEG, base64) and **quality scores** are stored on embedding rows when registration or auto-learn persists (see `@emory/db` schema V3).

Results are returned as `AutoLearnResult` from `@emory/core` (`learned`, `personId`, `reason`). Successful learns increment `activity.store` (`autoLearnCount`, `events`) and feed the **Activity** tab and **StatusBar** / camera badge.

## Recognition safety

Defaults in `@emory/core` (`face.service.ts`): **`DEFAULT_MATCH_THRESHOLD` is `0.45`** (raised from `0.4`). UI settings still sync `matchThreshold` via `face:update-thresholds`.

### Match margin in votes

Identity votes record **`matchMargin`** from each identification pass. **Instant lock** (high-confidence bypass) requires **margin ≥ 0.08**. **Vote-based lock** requires **margin ≥ 0.05** in addition to consistent votes.

### Confusion / oscillation

If **3+ distinct people** appear among the **last 8** identity votes, the track enters a **confused** state: **yellow “?” overlay** for **10 seconds**. Auto-learn is suppressed while confused.

### Faster unknown / unlock

- **`unknownStreak`** increments by **1.0** on weak matches and **2.0** on no match.
- **`IDENTITY_UNLOCK_VOTES`** is **4** (reduced from 5).

### Confident unknown

Matches with **similarity below 0.42** are treated as **no match** (same as “no candidate”): the overlay shows **“Unknown”** instead of **“Detecting…”**.

## Identity locking (v2)

Per-track identity in the camera overlay (`WebcamFeed.tsx`) uses a stricter locking model so labels do not stick on weak or ambiguous matches.

| Constant | Value | Role |
|---|---|---|
| `INSTANT_LOCK_THRESHOLD` | `0.55` | Only very high-confidence first matches bypass voting |
| `MIN_VOTES_TO_LOCK` | `3` | Minimum consistent votes required before locking identity |
| `WEAK_MATCH_THRESHOLD` | `0.48` | Matches below this do not count toward identity locking |
| `SIMILARITY_DECAY_THRESHOLD` | `0.45` | If recent match average drops below this, identity unlocks |
| `AUTO_LEARN_MIN_SIMILARITY` | `0.60` (with margin ≥ 0.06, time/vote gates — see [Active learning](#active-learning)) | Prevents auto-learning from low-quality or ambiguous matches |

**Correction:** If a different person starts winning votes, identity can switch to that person.

**Weak band:** Matches in **0.42–0.48** are still recorded on the track but treated as partial unknown evidence (they do not contribute like strong matches for lock progression). Below **0.42**, see [Confident unknown](#confident-unknown).

## Voice response ("Who is that?")

The camera view includes a **"Who is that?"** button that announces identified people using the Web Speech API.

### Flow

1. User clicks the button while the camera is active.
2. `WebcamFeed` maintains an `identifiedPeople` state array, updated at the end of every identification pass from the current face tracks.
3. `WhoIsThisButton` receives this array and builds a spoken announcement based on confidence tiers:

| Similarity | Announcement style |
|---|---|
| **≥ 0.65** | "That's **{name}**." (includes relationship if set) |
| **≥ 0.50** | "I think that's **{name}**." |
| **< 0.50** | "I'm not sure, but it might be **{name}**." |

4. If no one is identified: "I don't recognise anyone right now."
5. Clicking again while speech is active cancels it immediately.

### Voice service (`shared/lib/voice.ts`)

| Export | Purpose |
|---|---|
| `speak(text, rate?)` | Returns a `Promise<void>` that resolves when speech ends. Cancels any in-progress speech first. Prefers a local English voice. |
| `isSpeaking()` | Returns `true` while an utterance is active |
| `stopSpeaking()` | Cancels current speech immediately |

## Memory query pipeline

The desktop main process now supports a hackathon-grade spoken memory query flow:

1. Save or receive a short query audio clip.
2. Transcribe it with `DeepgramService`.
3. Convert the spoken question into a retrieval plan with `MemoryQueryUnderstandingService`.
4. Search SQLite using fuzzy person-name matching plus time-window and text filters in `ConversationRepository` / `PeopleRepository`. For each resolved person, **`MemoryQueryService`** always merges **`memory_type = relationship`** rows (graph-backed lines) via **`getRelationshipMemoriesForPersonIds`**, and loads **`RelationshipRepository.findBetween(self, person)`** so **`matchedGraphRelationships`** is passed into **`MemoryAnswerService`** as first-class evidence (not only the last N memories by date).
5. Synthesize a short grounded answer with `MemoryAnswerService` (prompt instructs using **`matchedGraphRelationships`** for “relationship to me” style questions).

This supports questions like:

- "Who is Ryan?"
- "What did I do at 2 PM today?"
- "What is Perry’s relationship to me?" (uses Connections graph edge + relationship memories)

Current limitation:

- self-timeline answers depend on self memories already being stored in `person_memories`
- conversation recordings are still keyed to the conversation partner, so self timeline queries rely on memory rows more than recording rows

## Future iPhone audio integration

The future mobile path should keep the desktop app as the memory authority:

1. iPhone app captures a short audio query from the glasses.
2. iPhone app sends that audio clip, plus timestamp metadata, to the desktop app over the local bridge.
3. Desktop runs the same `MemoryQueryService` pipeline described above.
4. Desktop returns a short answer text or synthesized audio.
5. iPhone app plays the response back to the glasses.

For the hackathon, the manual scripts stand in for that iPhone leg by accepting local audio files.

## Match margin

Each `FaceMatch` from `face:process-frame` includes **`matchMargin`** (see `@emory/core`):

- Computed as the similarity **gap** between the best match and the **second-best** match **among distinct people** (not among raw embedding rows).
- **Per-person aggregation:** each registered person may have multiple embeddings; matching first takes the **best** similarity per person, then ranks people and computes margin from the top two people.
- **Use:** Surfaces ambiguous cases where one face scores similarly against several registered identities (low margin), versus a clear winner (high margin).
- **Identity pipeline:** margin is **tracked per vote** and gates instant vs vote-based locks (see [Recognition safety](#recognition-safety)).

## IPC API

### Face Operations

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `face:initialize` | Renderer → Main | — | `{ success, error?, provider? }` |
| `face:detect-only` | Renderer → Main | `Uint8Array, width, height` | `{ detections, processingTimeMs }` |
| `face:process-frame` | Renderer → Main | `Uint8Array, width, height` | `FaceProcessingResult` |
| `face:register` | Renderer → Main | `personId, Uint8Array, width, height, source` | `{ success, embeddingId?, error?, similarWarning? }` |
| `face:auto-learn` | Renderer → Main | `personId, embedding: number[]` | `AutoLearnResult` |
| `face:extract-embedding` | Renderer → Main | `Uint8Array, width, height` | `{ embedding, bbox } \| null` |
| `face:get-embedding-count` | Renderer → Main | `personId` | `number` |
| `face:update-thresholds` | Renderer → Main | `detectionThreshold, matchThreshold` | `void` |

`source` for `face:register` is `'photo_upload' | 'live_capture'` (registration only). Auto-learned rows use `auto_learn` via `face:auto-learn`.

After extracting the embedding, registration compares it against all stored embeddings (excluding the same `personId`), taking the **best** similarity per other person. If any person reaches cosine similarity ≥ **0.55**, the response includes `similarWarning: { similarPersonId, similarPersonName, similarity }`. Registration still succeeds and the embedding is saved; the warning is for the UI to surface a “possibly duplicate identity” message.

### Database Operations

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `db:people:create` | Renderer → Main | `CreatePersonInput` | `Person` |
| `db:people:find-all` | Renderer → Main | — | `Person[]` |
| `db:people:find-by-id` | Renderer → Main | `id` | `Person \| null` |
| `db:people:update` | Renderer → Main | `id, UpdatePersonInput` | `Person \| null` |
| `db:people:delete` | Renderer → Main | `id` | `boolean` |
| `db:people:merge` | Renderer → Main | `keepId, mergeId` | `Person \| null` |
| `db:people:update-profile` | Renderer → Main | `id, { keyFacts?, conversationStarters?, importantDates?, lastTopics? }` | `Person \| null` |

### Relationship Operations

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `db:relationships:create` | Renderer → Main | `personAId, personBId, type, notes?` | `Relationship` |
| `db:relationships:get-by-person` | Renderer → Main | `personId` | `RelationshipWithPerson[]` |
| `db:relationships:get-all` | Renderer → Main | — | `Relationship[]` via `RelationshipRepository.findAll()` |
| `db:relationships:update` | Renderer → Main | `id, type?, notes?` | `Relationship \| null` |
| `db:relationships:delete` | Renderer → Main | `id` | `boolean` |

`db:relationships:create` and `db:relationships:update` accept a string `type` from the renderer; the main process normalises it to `RelationshipType` from `@emory/db` (`spouse`, `child`, `parent`, `sibling`, `friend`, `carer`, `neighbour`, `colleague`, `other`). Unknown values are stored as `other`.

**Connections → memories:** After a successful **`create`** or **`update`**, if **`people.findSelf()`** is set and the edge touches that person, main runs **`syncGraphRelationshipToMemory`** ([`relationship-memory-sync.service.ts`](../../apps/desktop/src/main/services/relationship-memory-sync.service.ts)) and upserts a **`person_memories`** row (`memory_type: relationship`, optional FK **`relationship_id`**) on the *other* person so Memory Browser and **`conversation:query-memories`** see the relationship. **`delete`** clears linked memory rows by `relationship_id` before removing the edge. No renderer changes.

### Embedding Operations (gallery / admin)

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `db:embeddings:get-by-person` | Renderer → Main | `personId` | Embeddings with metadata for one person |
| `db:embeddings:delete` | Renderer → Main | embedding id(s) | Success / updated rows |
| `db:embeddings:reassign` | Renderer → Main | embedding id, target `personId` | Updated embedding |
| `db:embeddings:get-all-grouped` | Renderer → Main | — | All embeddings grouped by person (for **Embeddings** tab) |

### Retention Operations

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `db:retention:get-all` | Renderer → Main | — | `RetentionConfig[]` |
| `db:retention:upsert` | Renderer → Main | `entityType, retentionDays, keepImportant` | `RetentionConfig` |

### Encounter Operations

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `encounter:start-session` | Renderer → Main | `deviceId?` | `{ success, session? , error? }` |
| `encounter:end-session` | Renderer → Main | — | `{ success, session?, error? }` |
| `encounter:get-active-session` | Renderer → Main | — | `string \| null` |
| `encounter:log` | Renderer → Main | `personId, confidence` | `Encounter \| null` |
| `encounter:end` | Renderer → Main | `personId` | `Encounter \| null` |
| `encounter:mark-important` | Renderer → Main | `encounterId, important` | `Encounter \| null` |
| `encounter:get-by-person` | Renderer → Main | `personId, limit?` | `EncounterWithPerson[]` |
| `encounter:get-recent` | Renderer → Main | `limit?` | `EncounterWithPerson[]` |
| `encounter:count-by-person` | Renderer → Main | `personId, sinceDays?` | `number` |

Session state is managed in-process: `encounter:start-session` stores the active session ID, and `encounter:log` / `encounter:end` operate against it. Only one session can be active at a time.

### Unknown Person Tracking Operations

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `unknown:track` | Renderer → Main | `tempId, embeddingData?: number[], confidence?` | `UnknownSighting \| null` |
| `unknown:get-active` | Renderer → Main | — | `UnknownSighting[]` |
| `unknown:get-all` | Renderer → Main | `limit?` | `UnknownSighting[]` |
| `unknown:get-active-count` | Renderer → Main | — | `number` |
| `unknown:dismiss` | Renderer → Main | `id` | `UnknownSighting \| null` |
| `unknown:name-as-person` | Renderer → Main | `id, personId` | `UnknownSighting \| null` |
| `unknown:find-by-id` | Renderer → Main | `id` | `UnknownSighting \| null` |

`unknown:track` is an upsert — if an active sighting with the given `tempId` exists, it updates it (incrementing sighting count and optionally improving the best embedding); otherwise it creates a new sighting. Embeddings are passed as plain `number[]` over IPC and reconstructed as `Float32Array` in the main process.

### Conversation recording operations

| Channel | Direction | Payload | Returns |
|---|---|---|---|
| `conversation:save-and-process` | Renderer → Main | `{ personId, recordedAt, mimeType, durationMs?, audioBytes }` | `{ success: true, recording, memories }` or `{ success: false, error }` |
| `conversation:process-recording` | Renderer → Main | `ProcessRecordingInput` (optional `recordingId` if row exists) | `{ success: true, recording, memories }` or `{ success: false, error }` |
| `conversation:get-recordings-by-person` | Renderer → Main | `personId, limit?` | `ConversationRecording[]` |
| `conversation:get-memories-by-person` | Renderer → Main | `personId, limit?` | `PersonMemory[]` |
| `conversation:query-memories` | Renderer → Main | `{ audioPath, mimeType, askedAt? }` | `QueryMemoriesResult` wrapped in `{ success: true, … }` or `{ success: false, error }` |

`save-and-process` writes the file, inserts the DB row, then runs **Deepgram transcription** and **memory extraction** (`ConversationProcessingService`). On failure after the row is created, the row is deleted and the file is removed. `encounter_id` is resolved from the active session when possible (see `getActiveSessionId` in `encounter.ipc.ts`).

| Preload method | Maps to |
|---|---|
| `emoryApi.conversation.saveAndProcess(input)` | `conversation:save-and-process` (`audioBytes` as `ArrayBuffer` → `Uint8Array` in preload) |
| `emoryApi.conversation.processRecording(input)` | `conversation:process-recording` |
| `emoryApi.conversation.getRecordingsByPerson(personId, limit?)` | `conversation:get-recordings-by-person` |
| `emoryApi.conversation.getMemoriesByPerson(personId, limit?)` | `conversation:get-memories-by-person` |
| `emoryApi.conversation.queryMemories(input)` | `conversation:query-memories` |

### Remote ingest (Phase 0)

| Channel | Direction | Returns |
|---|---|---|
| `remote-ingest:get-config` | Renderer → Main | `{ config, instanceId }` (persisted remote ingest settings) |
| `remote-ingest:get-status` | Renderer → Main | `RemoteIngestStatus` (listening, addresses, beacon, errors) |
| `remote-ingest:apply` | Renderer → Main | Partial config patch → `{ success, config?, status?, error? }` — saves file and restarts listener |

### App Operations

| Channel | Direction | Returns |
|---|---|---|
| `app:get-models-dir` | Renderer → Main | `string` (path to models directory) |
| `app:get-user-data-dir` | Renderer → Main | `string` (Electron userData path) |
| `app:get-conversations-dir` | Renderer → Main | `string` (absolute path to `<userData>/conversations`) |
| `app:open-conversations-folder` | Renderer → Main | `{ success: true }` or `{ success: false, error }` (creates root folder if missing, then `shell.openPath`) |

### Preload surface (`window.emoryApi`)

The preload script exposes `window.emoryApi` — `face`, `db` (people, relationships, retention, embeddings), `encounter`, `unknown`, **`conversation`**, **`remoteIngest`**, and `app` namespaces. Methods map 1:1 to channels in the tables above (including **`relationships.getAll`** → `db:relationships:get-all` and **`embeddings.*`** → `db:embeddings:*`).

| Method | Maps to |
|---|---|
| `emoryApi.face.initialize()` | `face:initialize` |
| `emoryApi.face.detectOnly(data, width, height)` | `face:detect-only` |
| `emoryApi.face.processFrame(data, width, height)` | `face:process-frame` |
| `emoryApi.face.register(personId, imageData, width, height, source)` | `face:register` |
| `emoryApi.face.autoLearn(personId, embedding)` | `face:auto-learn` |
| `emoryApi.face.extractEmbedding(data, width, height)` | `face:extract-embedding` |
| `emoryApi.face.getEmbeddingCount(personId)` | `face:get-embedding-count` |
| `emoryApi.face.updateThresholds(detectionThreshold, matchThreshold)` | `face:update-thresholds` |
| `emoryApi.db.people.create(input)` | `db:people:create` |
| `emoryApi.db.people.findAll()` | `db:people:find-all` |
| `emoryApi.db.people.findById(id)` | `db:people:find-by-id` |
| `emoryApi.db.people.update(id, input)` | `db:people:update` |
| `emoryApi.db.people.delete(id)` | `db:people:delete` |
| `emoryApi.encounter.startSession(deviceId?)` | `encounter:start-session` |
| `emoryApi.encounter.endSession()` | `encounter:end-session` |
| `emoryApi.encounter.getActiveSession()` | `encounter:get-active-session` |
| `emoryApi.encounter.log(personId, confidence)` | `encounter:log` |
| `emoryApi.encounter.end(personId)` | `encounter:end` |
| `emoryApi.encounter.markImportant(encounterId, important)` | `encounter:mark-important` |
| `emoryApi.encounter.getByPerson(personId, limit?)` | `encounter:get-by-person` |
| `emoryApi.encounter.getRecent(limit?)` | `encounter:get-recent` |
| `emoryApi.encounter.countByPerson(personId, sinceDays?)` | `encounter:count-by-person` |
| `emoryApi.db.people.merge(keepId, mergeId)` | `db:people:merge` |
| `emoryApi.db.people.updateProfile(id, profile)` | `db:people:update-profile` |
| `emoryApi.db.people.getSelf()` | `db:people:get-self` |
| `emoryApi.db.people.setSelf(personId \| null)` | `db:people:set-self` |
| `emoryApi.db.relationships.create(personAId, personBId, type, notes?)` | `db:relationships:create` |
| `emoryApi.db.relationships.getByPerson(personId)` | `db:relationships:get-by-person` |
| `emoryApi.db.relationships.getAll()` | `db:relationships:get-all` |
| `emoryApi.db.relationships.update(id, type?, notes?)` | `db:relationships:update` |
| `emoryApi.db.relationships.delete(id)` | `db:relationships:delete` |
| `emoryApi.db.embeddings.getByPerson(personId)` | `db:embeddings:get-by-person` |
| `emoryApi.db.embeddings.delete(...)` | `db:embeddings:delete` |
| `emoryApi.db.embeddings.reassign(...)` | `db:embeddings:reassign` |
| `emoryApi.db.embeddings.getAllGrouped()` | `db:embeddings:get-all-grouped` |
| `emoryApi.db.retention.getAll()` | `db:retention:get-all` |
| `emoryApi.db.retention.upsert(entityType, retentionDays, keepImportant)` | `db:retention:upsert` |
| `emoryApi.unknown.track(tempId, embeddingData?, confidence?)` | `unknown:track` |
| `emoryApi.unknown.getActive()` | `unknown:get-active` |
| `emoryApi.unknown.getAll(limit?)` | `unknown:get-all` |
| `emoryApi.unknown.getActiveCount()` | `unknown:get-active-count` |
| `emoryApi.unknown.dismiss(id)` | `unknown:dismiss` |
| `emoryApi.unknown.nameAsPerson(id, personId)` | `unknown:name-as-person` |
| `emoryApi.unknown.findById(id)` | `unknown:find-by-id` |
| `emoryApi.app.getModelsDir()` | `app:get-models-dir` |
| `emoryApi.app.getUserDataDir()` | `app:get-user-data-dir` |
| `emoryApi.app.getConversationsDir()` | `app:get-conversations-dir` |
| `emoryApi.app.openConversationsFolder()` | `app:open-conversations-folder` |
| `emoryApi.remoteIngest.getConfig()` | `remote-ingest:get-config` |
| `emoryApi.remoteIngest.getStatus()` | `remote-ingest:get-status` |
| `emoryApi.remoteIngest.apply(patch)` | `remote-ingest:apply` |

## IPC Data Serialization

`ArrayBuffer` does not survive Electron's IPC serialization natively. The preload bridge converts:

- **Outbound (renderer → main):** `ArrayBuffer` → `new Uint8Array(arrayBuffer)`
- **Inbound (main → preload):** `Uint8Array` → `Buffer.from(uint8Array)` in main process

`Float32Array` embeddings from `@emory/core` are serialized as plain arrays over IPC and reconstructed on the receiving side.

## Security Model

| Setting | Value | Reason |
|---|---|---|
| `contextIsolation` | `true` | Prevents renderer from accessing Node.js APIs |
| `nodeIntegration` | `false` | Standard security practice |
| `sandbox` | `false` | Required for native module access (better-sqlite3) in preload |

## UI Layout

The app uses a tab-based layout with **seven** views. **Sidebar order:** Camera → People → Connections → Activity → Analytics → Embeddings → Settings.

```
┌─────────────────────────────────────────────┐
│  Header (Brain icon, "Emory", model status) │
├────┬────────────────────────────────────────┤
│    │                                         │
│ S  │  Main Content                           │
│ i  │  camera → WebcamFeed (main) + People    │
│ d  │  people → PeopleList (grid)             │
│ e  │  connections → ConnectionsGraph         │
│ b  │  activity → ActivityFeed                │
│ a  │  analytics → AnalyticsDashboard         │
│ r  │  embeddings → EmbeddingGallery          │
│    │  settings → SettingsPanel               │
├────┴────────────────────────────────────────┤
│  StatusBar (fps, faces, processing time)    │
└─────────────────────────────────────────────┘
```

Subtitle under the product name: **Memory Assistant** (`Header.tsx`).

### Components

| Component | Path | Purpose |
|---|---|---|
| `Header` | `shared/components/Header.tsx` | Brain icon, **Emory** + **Memory Assistant**, model status badge, shortcut to Settings tab |
| `Sidebar` | `shared/components/Sidebar.tsx` | Vertical icon nav — Camera, People, Connections, Activity, Analytics, Embeddings, Settings |
| `StatusBar` | `shared/components/StatusBar.tsx` | Model status, FPS, face count, identified count, processing time, optional “identifying…”, optional auto-learn total, error line |
| `SettingsPanel` | `modules/settings/components/SettingsPanel.tsx` | Card sections: Recognition (thresholds, auto-learn), Display (overlays), Performance (intervals), **Conversation recordings** (path + open folder), **Remote ingest** (Tailscale hub), Data Retention (cleanup policies) |
| `PeopleList` | `modules/people/components/PeopleList.tsx` | People list with scroll area, loading skeletons, empty state. Accepts `fullWidth` prop for grid vs sidebar layout |
| `PersonCard` | `modules/people/components/PersonCard.tsx` | Person card: avatar initials, **graph** relationship badge (edge from self → person via `people.store` `graphEdgeToSelfByPersonId`), embedding count, relative last-seen time, edit/delete actions |
| `EditPersonModal` | `modules/people/components/EditPersonModal.tsx` | Dialog for **name** + rich profile (key facts, conversation starters, important dates, last topics). Relationship role / connection notes are edited in Connections (graph), not here. **This is me** toggle calls `db.people.setSelf` / `getSelf`. Saves via `db.people.update` (name only from this UI) + `db.people.updateProfile` |
| `TagListEditor` | `modules/people/components/TagListEditor.tsx` | Reusable string-list editor with badge display, add/remove, Enter-to-add. Used by EditPersonModal for key facts, conversation starters, last topics |
| `ImportantDateEditor` | `modules/people/components/ImportantDateEditor.tsx` | Editor for `{label, date}` pairs with side-by-side label + date inputs. Used by EditPersonModal for important dates |
| `RegisterFaceModal` | `modules/people/components/RegisterFaceModal.tsx` | Registration dialog with **name** only (relationships are added in Connections). Inline shared-stream viewfinder (countdown capture) and photo upload; persists **128×128 JPEG** thumbnail + **quality** on the new embedding (schema V3) |
| `ErrorBoundary` | `shared/components/ErrorBoundary.tsx` | Class boundary around `MainContent`; shows fallback UI and logs `componentDidCatch` |
| `WebcamFeed` | `modules/camera/components/WebcamFeed.tsx` | Camera view: `detectOnly` loop + `processFrame` on `identifyIntervalMs`, track smoothing, optional auto-learn (`extractEmbedding` → `autoLearn`), GraduationCap “learned” badge |
| `WhoIsThisButton` | `modules/camera/components/WhoIsThisButton.tsx` | Voice announcement button for identified people via Web Speech API |
| `ActivityFeed` | `modules/activity/components/ActivityFeed.tsx` | Scrollable log of recognition events, auto-learns, person additions/removals |
| `AnalyticsDashboard` | `modules/analytics/components/AnalyticsDashboard.tsx` | Analytics overview: summary stat cards, frequent visitors (30d), recent encounters, unknown sightings. Loads `encounter.getRecent`, `db.people.findAll`, `unknown.getAll`, plus **`getSelf` + `relationships.getAll`** to label frequent visitors from the graph |
| `SummaryCards` | `modules/analytics/components/SummaryCards.tsx` | Four stat cards: total people, total encounters, last-7-day encounters, active unknowns |
| `FrequentVisitors` | `modules/analytics/components/FrequentVisitors.tsx` | Ranked list of people by encounter count in the last 30 days with relationship badges |
| `RecentEncounters` | `modules/analytics/components/RecentEncounters.tsx` | Last 20 encounters showing person name, confidence badge, timestamp, duration |
| `UnknownSightings` | `modules/analytics/components/UnknownSightings.tsx` | Unknown sighting list with sighting count, status badge, first/last seen dates |
| `ConnectionsGraph` | `modules/connections/components/ConnectionsGraph.tsx` | **Ego network** from **`db.people.getSelf`**: only you and people reachable via relationship edges; **you** stay pinned at the viewport centre. Edge colours from **`relationships.relationship_type`**; node hues/subtitles from the **edge to self** (not `people.relationship`). **Double-click** a node opens **`GraphNodeEditDialog`**. **Add Relationship** defaults to **You → other person** when self is set. Onboarding if people exist but self is unset. Graph edges sync to **`person_memories`** via **`db.ipc`**. See [Connections graph](./connections-graph.md) |
| `GraphNodeEditDialog` | `modules/connections/components/GraphNodeEditDialog.tsx` | Rename person; list incident edges — change type/notes (**Apply**), **Remove edge**, or **Delete person** (cascades in SQLite). Refreshes graph + `loadPeople()` after changes |
| `EmbeddingGallery` | `modules/embeddings/components/EmbeddingGallery.tsx` | **Embeddings** tab: rows **grouped by person**, 128×128 face **thumbnails**, **source** badges (`photo_upload` / `live_capture` / `auto_learn`), per-row **delete** / **reassign**, **bulk selection** |

## State Management

Four Zustand stores provide reactive state without prop drilling:

### `face.store.ts`
- `detections` — current frame's face detections (from `face:detect-only`)
- `matches` — matched faces with person names, similarity, and `matchMargin` (from `face:process-frame`)
- `isProcessing` — true while an identification request is in flight
- `modelStatus` — `'idle' | 'loading' | 'ready' | 'error'`
- `error` — optional user-visible error string (e.g. init failure), also shown in `StatusBar`
- `fpsCount` — detection loop frames per second
- `processingTimeMs` — last detection pass duration

### `people.store.ts`
- `people` — list of registered people (`isSelf` from DB; **You** badge on `PersonCard`), plus optional profile fields: `keyFacts`, `conversationStarters`, `importantDates`, `lastTopics`
- `graphEdgeToSelfByPersonId` — map of person id → `{ relationshipType, notes }` for the edge between **designated self** and that person (from `relationships.getAll` + `getSelf`), used by `PersonCard`, `WebcamFeed` / `WhoIsThisButton`, etc.
- `ImportantDate` — `{ label: string, date: string }` type for date entries
- `PersonProfile` — grouped type for profile fields (`keyFacts`, `conversationStarters`, `importantDates`, `lastTopics`)
- `loadPeople()` — fetches people, self, and all relationships via IPC, then builds `graphEdgeToSelfByPersonId`
- `addPerson()` — creates person (name only from UI) and adds to local state
- `removePerson()` — deletes person and removes from local state

### `settings.store.ts`
- `activeTab` — current navigation tab (`'camera' | 'people' | 'connections' | 'activity' | 'analytics' | 'embeddings' | 'settings'`)
- Recognition settings: `autoLearnEnabled`, `detectionThreshold`, `matchThreshold`, `maxEmbeddingsPerPerson`
- Display settings: `showBoundingBoxes`, `showConfidence`, `showLandmarks`
- Performance settings: `identifyIntervalMs`, `detectCooldownMs`
- `resetToDefaults()` — restores all settings to factory values

### `activity.store.ts`
- `events` — capped list of recent activity events (max 100); `ActivityEvent` includes `type`, `personName`, `similarity`, `details`, etc.
- `autoLearnCount` — running count of successful auto-learns (session-oriented; cleared with events)
- `addEvent()` — appends a timestamped event
- `incrementAutoLearnCount()` — bumps the auto-learn counter (called from `WebcamFeed` on successful learn)
- `clearEvents()` — clears events **and** resets `autoLearnCount`

## Configuration

### Frame processing (`WebcamFeed` + `settings.store`)

Timing is **not** a single fixed “frame interval”: two loops run when the camera is active.

| Setting (default) | Role |
|---|---|
| `detectCooldownMs` (**50**) | Delay between `face:detect-only` calls (drives overlay tracks + FPS) |
| `identifyIntervalMs` (**1500**) | Interval for `face:process-frame` (identification + match updates) |

Other defaults: `autoLearnEnabled: true`, `detectionThreshold: 0.35`, `matchThreshold: 0.45` (aligned with `@emory/core` `DEFAULT_MATCH_THRESHOLD`; was `0.4`), `maxEmbeddingsPerPerson: 20` (UI; **main process** enforces hard caps for auto-learn as in [Active learning](#active-learning)).

`detectionThreshold` and `matchThreshold` from `settings.store` are synced to the main process via `face:update-thresholds` IPC. The store subscribes to its own state changes and pushes updated values whenever either threshold changes. The IPC handler stores these in module-level variables which are passed through to `faceService.detectFaces()` and `faceService.findBestMatch()` on every frame.

Webcam resolution: **640×480** ideal (`useWebcam`). While the camera is active, the UI shows **Camera:** plus `MediaStreamTrack.label` from the bound video track (same idea as conversation **Mic:** from the audio track).

### Models Directory
ONNX model files must be placed in `{userData}/models/`:
- `det_10g.onnx` — SCRFD face detection
- `w600k_r50.onnx` — ArcFace face recognition

### Build Externals
Native modules are externalized from the Vite bundle:
- `better-sqlite3` (SQLite)
- `onnxruntime-node` (ONNX Runtime)
- `sharp` (image processing)

`sharp`, `onnxruntime-node`, and `better-sqlite3` are also listed as **direct** dependencies in `apps/desktop/package.json` (alongside `@emory/core` / `@emory/db`). The main bundle externalizes them (`electron.vite.config.ts`); Node must resolve them from the desktop package at Electron runtime, so transitive-only hoisting can produce `ERR_MODULE_NOT_FOUND` for those imports.

### UI Stack
- **Tailwind CSS v4** with `@tailwindcss/vite` plugin (required for Vite-based CSS processing)
- **shadcn/ui** — tabs, tooltip, switch, slider, scroll-area, avatar, dropdown-menu, skeleton, progress, sheet, select, textarea, toggle, toggle-group, plus Button, Dialog, Input, Label, Badge, Card, Separator, Sonner, etc.
- **Zustand** for state management
- **Lucide React** for icons
- Dark theme via CSS variables (`.dark` class on `<html>`)

## Development

```bash
# From the monorepo root
bun install

# Run the desktop app
cd apps/desktop
bun run dev
```

The app uses `electron-vite` which provides:
- HMR for the renderer process
- Auto-restart for main process changes
- Proper externalization of native Node modules

**`dotenv` in the main process** is listed in `exclude` for `externalizeDepsPlugin` (see `electron.vite.config.ts`) so it is **bundled** into `out/main`. If it were left external, Node would resolve `import 'dotenv'` from `out/main/` and often fail with `ERR_MODULE_NOT_FOUND` when dependencies are hoisted to the monorepo root—`npm install dotenv` in the wrong folder does not fix that.
