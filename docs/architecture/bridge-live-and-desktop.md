# Bridge live (Meta Ray-Bans) ↔ Electron desktop

## Purpose

**`apps/bridge-server`** is the standalone **Emory Live Bridge**: WebSocket server that receives the same binary protocol from the iOS app as it streams Meta Ray-Bans video, runs **face recognition** against the local SQLite DB, and sends **`face_result`** JSON back to the phone.

The **Electron desktop** app already exposed **remote ingest** on **`/ingest?role=publisher|viewer`** (relay + desktop Camera preview). This doc describes how the **bridge face pipeline** is now **shared** and **runs inside Electron** when a phone publishes to `/ingest`, so you do not need a separate bridge process for that path.

## Layout index

### Standalone bridge (`apps/bridge-server`)

| Path | Role |
|------|------|
| [`src/index.ts`](../../apps/bridge-server/src/index.ts) | HTTP `/`, `/health`, WebSocket server, viewer fan-out (raw JPEG to browsers), wires `WsHandler` + `FrameProcessor` |
| [`src/ws-handler.ts`](../../apps/bridge-server/src/ws-handler.ts) | Parses binary frames (`MSG_VIDEO_FRAME`, audio, session); drives `FrameProcessor` / `AudioProcessor` |
| [`src/protocol.ts`](../../apps/bridge-server/src/protocol.ts) | Message type constants + server → client JSON shapes (`face_result`, `status`, …) |
| [`src/audio-processor.ts`](../../apps/bridge-server/src/audio-processor.ts) | Mic chunks (transcript path stub) |

**URL shape (Ray-Bans / iOS today):** `ws://<host>:<port>/` (root WebSocket).  
**Desktop ingest URL shape:** `ws://<host>:<port>/ingest?role=publisher` (see [`StreamViewModel`](../../emory/emory/ViewModels/StreamViewModel.swift)).

Both use the **same binary framing** as [`@emory/ingest-protocol`](../../packages/ingest-protocol/).

### Shared face queue (`packages/bridge-live`)

| Path | Role |
|------|------|
| [`src/frame-processor.ts`](../../packages/bridge-live/src/frame-processor.ts) | JPEG → Sharp RGBA → `FaceService.detectFaces` / embeddings → DB match → `face_result` callback |
| [`src/types.ts`](../../packages/bridge-live/src/types.ts) | `FaceMatchResult`, `FrameResult` |

**Consumers:**

- `@emory/bridge-server` (standalone)
- `@emory/desktop` **`RemoteIngestServerService`** (main process) on **`/ingest` publisher** video frames

### Electron integration

| Path | Role |
|------|------|
| [`remote-ingest-server.service.ts`](../../apps/desktop/src/main/services/remote-ingest-server.service.ts) | Relays binary publisher → viewers; parses `MSG_VIDEO_FRAME`; runs `@emory/bridge-live` **`FrameProcessor`**; sends **`face_result`** JSON to **publisher** socket (same as bridge) |
| [`face.ipc.ts`](../../apps/desktop/src/main/ipc/face.ipc.ts) | **`getMainFaceService()`** — main-process `FaceService` after `face:initialize` (renderer) |
| [`index.ts`](../../apps/desktop/src/main/index.ts) | Constructs `RemoteIngestServerService(mobileApi, { peopleRepo, getFaceService: getMainFaceService })` |

## Behaviour summary

1. **Phone** connects as **`/ingest?role=publisher`** and sends **binary** video frames (and optional audio/session messages).
2. **Desktop** forwards each binary message **unchanged** to **viewers** (Camera page JPEG preview).
3. For **`MSG_VIDEO_FRAME`**, desktop also enqueues JPEG into **`FrameProcessor`** (same logic as bridge-server).
4. **`FaceService`** comes from the **same** ONNX stack as the Camera tab (`getMainFaceService()`). Until the renderer has called **`face:initialize`**, matches will be empty (same as bridge without models).
5. **`face_result`** JSON is sent on the **publisher** WebSocket so **iOS `BridgeServerService`** can consume it like the standalone bridge.

## When to still run `apps/bridge-server`

- **Root-path** WebSocket (`ws://host:port/` without `/ingest`) as configured in some setups.
- **Headless** server without Electron (CI, lightweight host).
- **Different DB path** (`DB_PATH` / `emory.db` next to bridge) vs desktop **userData** DB.

For **“phone → same machine as Emory desktop”** with **`http://…/ingest`**, prefer **desktop remote ingest** only.

## Related docs

- [remote-ingest-camera-debug.md](../apps/remote-ingest-camera-debug.md) — viewer ping, `feedReady`, dev logging  
- [ios-remote-ingest-client.md](./ios-remote-ingest-client.md) — iOS URLs and roles  
- [packages/ingest-protocol](../packages/ingest-protocol/) — binary wire format  
