# Conversation recording (face-linked audio)

This document describes the **first slice** of the conversation memory pipeline: automatic microphone capture when a **recognised** person is primary in the camera feed, persisting audio on disk with a SQLite row keyed by `person_id`, optional `encounter_id`, and timestamps.

Full STT / LLM memory extraction is **out of scope** here; rows are created with `transcript_status` and `parse_status` both **`pending`** until a later processing step updates them.

## Layers

| Layer | Location | Role |
|--------|-----------|------|
| Renderer state machine | [`useConversationRecorder.ts`](../../apps/desktop/src/renderer/modules/camera/hooks/useConversationRecorder.ts) | Mic stream, `MediaRecorder`, start/stop debouncing, frozen `personId` per segment |
| Primary subject rule | [`primarySubject.ts`](../../apps/desktop/src/renderer/modules/camera/lib/primarySubject.ts) | Among tracks with locked `identity`, pick **largest bbox area**; tie-break **higher similarity** |
| IPC | [`conversation.ipc.ts`](../../apps/desktop/src/main/ipc/conversation.ipc.ts) | Validate payload, write file, insert DB row; resolve `encounter_id` from active session |
| File I/O | [`conversation-storage.service.ts`](../../apps/desktop/src/main/services/conversation-storage.service.ts) | `<userData>/conversations/YYYY/MM/<recordingId>.<ext>` |
| Persistence | [`ConversationRepository`](../../packages/db/src/repositories/conversation.repository.ts) | `conversation_recordings` + `person_memories` (memories unused until parse pipeline lands) |

## Behaviour (decisions)

1. **Start** — When a primary subject (see above) stays stable for **`CAMERA_CONVERSATION_START_DEBOUNCE_MS` (400 ms)**, start recording. Requires a working mic stream (`getUserMedia({ audio: { … }, video: false })`). **No `deviceId` is set** — Chromium uses the **OS default recording device** (same as the browser’s default mic). The live label from `MediaStreamTrack.label` is shown under the camera view as **Mic: …** when available.
2. **Frozen attribution** — The `person_id` stored for the file is fixed **at segment start**; mid-segment changes in who is “primary” do **not** switch attribution.
3. **Stop** — When **no** track has `identity.personId === frozenPersonId` for **`CAMERA_CONVERSATION_STOP_DEBOUNCE_MS` (2000 ms)**, stop `MediaRecorder` and upload. Same debounced stop applies when the user turns the camera off (effect cleanup finalises the segment).
4. **No unknowns** — Recording never starts without a locked identity on the chosen primary track (same product rule as “no recording tied to nobody”).
5. **Encounter link** — Main process sets `encounter_id` when `getActiveSessionId()` is set and `EncounterRepository.findActiveEncounter(personId, sessionId)` returns a row; otherwise `null`.
6. **Canonical name** — Only `person_id` is persisted; display names come from `people` via join when querying.

**Device labels on the camera tab** — **Camera:** is the video track label from `useWebcam` (preview `getUserMedia`). **Mic:** is the audio track label from conversation capture. Neither call passes `deviceId`. Chromium’s chosen camera can differ from Windows’ “default” camera when video constraints steer selection (for example `facingMode: 'user'` tends to prefer a built-in webcam over a virtual device such as Iriun).

## Who is “speaking”? (not in the folder path)

Attribution is **not** encoded in the directory layout.

| What | Where |
|------|--------|
| **Which person** this clip is for | SQLite **`conversation_recordings.person_id`** (UUID → `people.id`). Optional **`encounter_id`** links an active encounter when the camera session matches. |
| **When** recording started | **`recorded_at`** (ISO string) on the same row. |
| **File on disk** | **`audio_path`** on that row — under `<userData>/conversations/YYYY/MM/<recordingId>.webm`. The **`YYYY/MM`** segments are only **calendar sharding** for the file tree, **not** person identity. The **recording id** in the filename is unrelated to `person_id`. |

To know “who” for a file, join **`conversation_recordings`** → **`people`** on `person_id` (or read the DB row by `id`).

## MediaRecorder / WebM notes

- Recording uses **`MediaRecorder`** without a timeslice so a single `dataavailable` blob is produced on **`stop()`** (avoids empty files when segments are shorter than a 1s timeslice).
- If the blob is **0 bytes**, the UI shows an error (often OS mic muted, wrong default device, or exclusive use by another app).

## Schema (v6)

See [`docs/packages/db.md`](../packages/db.md) — tables **`conversation_recordings`** and **`person_memories`**, plus indexes. An extra **`transcript_error`** column stores STT failure messages without overloading `parse_error`.

## IPC

| Channel | Purpose |
|---------|---------|
| `conversation:save-and-process` | Save bytes to disk + `createRecording` (processing stub: statuses remain `pending`) |
| `conversation:get-recordings-by-person` | List recordings for a person |
| `conversation:get-memories-by-person` | List distilled memories (empty until parse pipeline inserts rows) |

Preload: `window.emoryApi.conversation.*`.

## Settings

**Settings → Conversation recordings** shows the absolute path to `<userData>/conversations` and an **Open folder** control (`app:get-conversations-dir`, `app:open-conversations-folder`).

## Risks / limits

- **IPC payload size** — Whole blob crosses IPC; very long sessions may need chunking or temp files later.
- **Permissions** — Mic denial surfaces as renderer error state under the camera view.

## Related fix

`WebcamFeed` previously called `encounter.log(sessionId, personId, confidence)` while preload only forwards `(personId, confidence)`, corrupting encounter rows. It now calls `encounter.log(personId, confidence)` (see changelog).
