# Remote (Ray-Ban / phone) camera via network ingest

When **Settings → Remote ingest** is **enabled** and **listening**, the **Camera** tab defaults to the **phone / glasses** path:

- **Default (low latency):** **`Prefer WebRTC video`** is on → renderer opens **`ws://{effectiveHost}:{port}/signaling?role=desktop`** and negotiates **WebRTC** with the phone on **`?role=mobile`** (offer from phone, answer from desktop). Frames come from `<video>` + capture canvas like local webcam.
- **Fallback:** If WebRTC is **off** in Settings, same host opens **`ws://…/ingest?role=viewer`** and displays **JPEG** relayed from a **publisher** (same binary protocol as [`apps/bridge-server`](../../apps/bridge-server/)).

Users can **Use computer camera** to force local `getUserMedia` (stored in `sessionStorage`).

## Implemented (desktop)

| Piece | Location |
|-------|-----------|
| Shared constants + binary parse | [`packages/ingest-protocol`](../../packages/ingest-protocol/) |
| HTTP `/health` **protoVersion 3** + `wsIngestPath` + `wsSignalingPath` | [`remote-ingest-server.service.ts`](../../apps/desktop/src/main/services/remote-ingest-server.service.ts) |
| WS `/ingest` relay (publisher → viewers) | Same |
| WS `/signaling` relay (JSON SDP/ICE between mobile + desktop roles) | Same |
| Persisted `webrtcVideoPreferred` | [`remote-ingest-settings.service.ts`](../../apps/desktop/src/main/services/remote-ingest-settings.service.ts), [`remote-ingest.types.ts`](../../apps/desktop/src/main/services/remote-ingest.types.ts) |
| Renderer store + IPC `remote-ingest:updated` | [`remote-ingest.store.ts`](../../apps/desktop/src/renderer/shared/stores/remote-ingest.store.ts), [`remote-ingest.ipc.ts`](../../apps/desktop/src/main/ipc/remote-ingest.ipc.ts), [`preload/index.ts`](../../apps/desktop/src/preload/index.ts) |
| `useCameraFeed` + `useRemoteIngestViewer` + `useRemoteIngestWebRtc` | [`useCameraFeed.ts`](../../apps/desktop/src/renderer/modules/camera/hooks/useCameraFeed.ts), [`useRemoteIngestViewer.ts`](../../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestViewer.ts), [`useRemoteIngestWebRtc.ts`](../../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestWebRtc.ts) |
| Camera UI | [`WebcamFeed.tsx`](../../apps/desktop/src/renderer/modules/camera/components/WebcamFeed.tsx) |
| Settings toggle | [`RemoteIngestSettings.tsx`](../../apps/desktop/src/renderer/modules/settings/components/RemoteIngestSettings.tsx) |

**Phone app:** for JPEG path, connect to `ws://{host}:{port}/ingest` as **publisher**. For WebRTC, connect to `ws://{host}:{port}/signaling?role=mobile` and send **`offer`** / **`ice`**; handle **`answer`** / **`ice`**. See [ios-remote-ingest-client.md](./ios-remote-ingest-client.md).

### Framerate and “smooth” preview (desktop)

| What you see | What limits it |
|--------------|----------------|
| **Live video motion** | **WebRTC** (`<video>`): typically as smooth as the phone encoder + network allow (often ~24–30+ fps). **JPEG `/ingest`**: only as fast as the **phone publishes** frames (each frame is decoded with `createImageBitmap` on the desktop — heavy at high res). |
| **Bounding boxes / overlay** | Drawn every **animation frame** (`requestAnimationFrame`), with **lerp** between detection results so motion looks smoother than raw detections. |
| **Face detection (SCRFD)** | Throttled by **Settings → Performance → Detection cooldown** (`detectCooldownMs`, default **50 ms** → up to ~**20** detection attempts/s if IPC keeps up). Actual FPS is often lower on large frames or under load — watch the live **FPS** indicator in the camera UI. |
| **Identification / matching** | **Settings → Identify interval** (default **1500 ms**) — does not change video smoothness, only how often embeddings run. |

For the **smoothest** remote experience: keep **Prefer WebRTC video** on, publish **steady 24–30 fps** from the phone, and avoid oversized JPEG-only streams if you must use `/ingest`.

**WebRTC publisher encoding (phone):** [remote-ingest-webrtc-encoding.md](./remote-ingest-webrtc-encoding.md).

---

## Original planning notes

This section kept the earlier design rationale. It ties together existing pieces: [`remote-ingest-server.service.ts`](../../apps/desktop/src/main/services/remote-ingest-server.service.ts), [`WebcamFeed.tsx`](../../apps/desktop/src/renderer/modules/camera/components/WebcamFeed.tsx), [`useWebcam.ts`](../../apps/desktop/src/renderer/modules/camera/hooks/useWebcam.ts), and [`apps/bridge-server`](../../apps/bridge-server/) wire protocol.

---

## Goals

| Goal | Detail |
|------|--------|
| **UX** | If remote ingest server is **enabled** and **listening**, Camera tab uses **remote** source by default; clear states: *Waiting for phone…*, *Connected (Ray-Ban / app)*, *Error / reconnect*. |
| **Pipeline** | Face detection / identification / conversation recorder still consume **raster frames** the same way (`captureFrame`-style path → existing `WebcamFeed` loop). |
| **Scope (v1)** | **Video first.** Remote **mic → conversation** can follow the same transport later ([conversation-recording.md](./conversation-recording.md)); do not block video on audio. |
| **Security** | Same stance as today: **tailnet / trusted LAN only** until pairing + tokens exist ([remote-ingest-tailscale.md](./remote-ingest-tailscale.md)). |

---

## Non-goals (initial slice)

- Replacing the standalone **`apps/bridge-server`** in one shot (it can remain for headless/server-side processing).
- Full **WebRTC** with TURN and production-grade pairing (can be **phase 2**).
- Changing **People** sidebar behavior beyond what falls out of the shared face pipeline.

---

## Current state (facts)

1. **Remote ingest (desktop)** — HTTP `GET /health` + optional UDP beacon; **no** video socket on the Electron app yet.
2. **Camera UI** — [`App.tsx`](../../apps/desktop/src/renderer/App.tsx) → `WebcamFeed` → [`useWebcam`](../../apps/desktop/src/renderer/modules/camera/hooks/useWebcam.ts): `getUserMedia` → `<video>` → hidden canvas `drawImage(video)` for `captureFrame`.
3. **Renderer does not cache ingest “enabled”** — Only [`RemoteIngestSettings.tsx`](../../apps/desktop/src/renderer/modules/settings/components/RemoteIngestSettings.tsx) calls `window.emoryApi.remoteIngest`. Camera view has **no** signal today.
4. **`bridge-server`** — Already implements **WebSocket + binary frames** (`MSG_VIDEO_FRAME` = JPEG + metadata) in [`protocol.ts`](../../apps/bridge-server/src/protocol.ts) / [`ws-handler.ts`](../../apps/bridge-server/src/ws-handler.ts). iOS can target the **same contract** against the desktop once the socket exists there.

---

## Recommended transport (v1): WebSocket + JPEG frames (bridge protocol)

**Why first:** Matches existing **bridge-server** and documented iOS direction; avoids inventing SDP/ICE until needed. Electron **renderer Chromium** can decode JPEGs to **`ImageBitmap` / `HTMLImageElement`** and draw to a canvas used like the current video path.

**Why WebRTC later:** Lower latency, better bitrate control, single `MediaStream` for `<video>` + simpler `captureFrame` if tracks are raw video; more moving parts (signaling, ICE on tailnet).

---

## Architecture options (where the socket lives)

| Approach | Pros | Cons |
|----------|------|------|
| **A. WebSocket server on main HTTP ingest server** | One port; phone hits `ws://100.x:port/ingest`; matches `/health` | Main must **forward** frames to renderer (IPC) **or** renderer opens WS to **self** `100.x` (works if bind includes that IP). |
| **B. Renderer opens `WebSocket` to desktop’s advertised address** | No per-frame IPC; renderer owns socket | Renderer needs **URL** (from `getStatus().effectiveHost` + port + path); must handle reconnect. |
| **C. WebRTC in renderer; signaling via WS on main** | Native `MediaStream` on `<video>` | More work on **iOS + desktop**; signaling spec must be written. |

**Recommendation:** **B** for v1 — extend **`remote-ingest:get-status`** (already has `effectiveHost`, `signalingPort`) so the renderer builds `ws://{effectiveHost}:{signalingPort}/ingest` (exact path TBD). The **HTTP server** in [`RemoteIngestServerService`](../../apps/desktop/src/main/services/remote-ingest-server.service.ts) upgrades connections on `/ingest` with **`ws`** (same pattern as `bridge-server`’s `createServer` + `WebSocketServer`).

**Bind-mode note:** In **Tailscale-only** bind, the machine’s **100.x** is reachable from the renderer on the same box; use **`effectiveHost` from status** (not hardcoded `127.0.0.1`). **Tailscale + local LAN** listens on **`0.0.0.0`** — renderer can still use **`effectiveHost`** (first of **`effectiveAddresses`**, usually 100.x when Tailscale is up) or a LAN IP from that list if you test same-Wi‑Fi. Loopback bind mode requires **`127.0.0.1`** for both health and WS.

---

## Implementation phases

### Phase 0 — Renderer knows “remote ingest mode”

1. **Shared state** (e.g. `useRemoteIngestStore` or a small slice on `useSettingsStore`):
   - `enabled: boolean`, `listening: boolean`, `effectiveHost: string | null`, `signalingPort: number`, `lastError: string | null`.
2. **Hydration:** On app load, call `window.emoryApi.remoteIngest.getConfig()` + `getStatus()` once; merge into store.
3. **Refresh after Apply:** When user clicks **Apply & restart** in settings, either:
   - **IPC event** `remote-ingest:changed` from main after successful `apply`, or
   - **Callback** from settings panel to re-fetch and update store.
4. **Optional:** Lightweight polling of `getStatus` every N seconds while Camera tab is focused (only if events are too heavy to wire first).

**Files:** new `remote-ingest.store.ts` (or extend settings store), [`preload`](../../apps/desktop/src/preload/index.ts) if adding events, [`remote-ingest.ipc.ts`](../../apps/desktop/src/main/ipc/remote-ingest.ipc.ts) + `main/index.ts` to emit after apply.

### Phase 1 — WebSocket endpoint on the ingest HTTP server

1. Attach **`WebSocketServer`** to the existing **`http.Server`** (see `apps/bridge-server/src/index.ts`).
2. Path: e.g. **`/ingest`** (document alongside `/health`).
3. **Protocol:** Reuse **`MSG_VIDEO_FRAME`** binary layout from [`bridge-server/src/protocol.ts`](../../apps/bridge-server/src/protocol.ts) (import shared types from a small **`packages/ingest-protocol`** or duplicate constants in desktop with a comment “keep in sync with bridge-server” — prefer **one shared module** long term).
4. **Single client v1:** If a second client connects, **close previous** or **reject** (define behavior); log structured line with `instanceId` context when you add pairing.
5. **Health JSON bump:** Add optional fields e.g. `wsIngestPath: "/ingest"`, `protoVersion: 2` when wire is live ([ios-remote-ingest-client.md](./ios-remote-ingest-client.md) checklist).

**Files:** `remote-ingest-server.service.ts`, possibly extract `IngestWsSession` class; types in `remote-ingest.types.ts` or shared package.

### Phase 2 — `useRemoteIngestCamera` (mirror `useWebcam` contract)

Expose a hook with the **same shape** as [`UseWebcamResult`](../../apps/desktop/src/renderer/modules/camera/hooks/useWebcam.ts) where practical:

- `videoRef` + `canvasRef` — For remote mode you can either:
  - **Option 1:** Keep a **hidden `<video>`** fed by a **`MediaStream` from `canvas.captureStream()`** (if frame rate stable enough), or
  - **Option 2 (simpler v1):** **`captureFrame`** reads from an **internal canvas** updated each JPEG (`drawImage` / `ImageBitmap`); **overlay** still composites on a **second canvas** over a **visible** `<canvas>` or `<img>` (replace `<video>` in JSX when remote).

**Minimum for face loop:** `isActive`, `error`, `cameraLabel` (e.g. `"Ray-Ban (remote)"`), `start` / `stop`, **`captureFrame(): ArrayBuffer | null`** with same RGBA layout as today.

**`start` when ingest enabled:**

- Validate `enabled && listening && effectiveHost` from store; else set friendly error.
- Open `WebSocket`, on `MSG_VIDEO_FRAME` decode JPEG, draw to buffer canvas, bump `frameVersion` or RAF-driven redraw for **visible** preview.

**`stop`:** Close WS, clear canvases, clear timers.

**Performance:** Cap decode rate (e.g. max 15–30 fps) if phone sends faster than needed; reuse **one** `ImageBitmap` / `Blob` URL pattern and revoke to avoid leaks.

### Phase 3 — `WebcamFeed` branching

1. Read **`remoteIngestMode`** from store: `config.enabled === true` (and optionally `status.listening`).
2. **If remote mode:** render **`useRemoteIngestCamera`** path:
   - Buttons: **“Start remote camera”** / **“Stop”** (or auto-start when tab focused — product choice).
   - Status line: **Connected / Waiting / Error** + host:port.
3. **Else:** keep existing **`useWebcam`** path unchanged.
4. **Override (recommended):** Small link **“Use this computer’s camera instead”** when ingest is on but user wants local `getUserMedia` (stores a **local preference** in `sessionStorage` or settings JSON).

**Files:** [`WebcamFeed.tsx`](../../apps/desktop/src/renderer/modules/camera/components/WebcamFeed.tsx), possibly split **`CameraPreview`** + **`CameraControls`** to stay under line limits.

### Phase 4 — iOS / Ray-Ban app

1. After `/health` succeeds, open **`WebSocket`** to `ws://host:port/ingest` (HTTP only today; WS is cleartext on tailnet — document risk).
2. Stream **JPEG frames** from the **existing wearables pipeline** using the **same binary envelope** as bridge-server.
3. **Session markers:** Send `MSG_SESSION_START` / `MSG_SESSION_END` if desktop should align conversation boundaries later.

Update **[ios-remote-ingest-client.md](./ios-remote-ingest-client.md)** with **WS URL, path, binary format**, and **version negotiation** via `protoVersion`.

### Phase 5 — Tests & docs

- **Unit:** Protocol parse (shared or copied), optional WS integration test in desktop main (mock client).
- **Manual QA matrix:** Tailscale on/off, wrong bind mode, disconnect mid-stream, tab switch, Stop/Start.
- **Docs:** This file + [`docs/CHANGELOG.md`](../CHANGELOG.md) + [`docs/apps/desktop.md`](./desktop.md) (Camera + IPC).

---

## Risks / decisions

| Topic | Decision to record |
|-------|---------------------|
| **Microphone** | Local mic can remain for conversation in v1; document that remote audio is **phase 2**. |
| **`sharedStream`** ([`shared-stream.ts`](../../apps/desktop/src/renderer/modules/camera/shared-stream.ts)) | If **RegisterFaceModal** or others use it, either **block** remote-only capture or **pipe** the same canvas stream — audit callers. |
| **Firewall** | WS uses same port as HTTP; Windows prompt already a concern for `0.0.0.0` bind. |
| **Concurrent bridge-server** | Same default port **18763** — do not run bridge-server and desktop ingest on one machine without changing port. |

---

## Optional Phase 2 (later): WebRTC

- Signaling: JSON over **`/signaling`** WebSocket (offer/answer/ICE).
- **Renderer** `RTCPeerConnection` as **receiver**; `<video srcObject>` → existing `captureFrame` unchanged.
- iOS: **WebRTC** publish from AVFoundation / Google WebRTC Swift package.

---

## Summary

1. **Sync remote ingest config/status into renderer state.**
2. **Add `/ingest` WebSocket to the existing ingest HTTP server** using the **bridge-server binary JPEG protocol**.
3. **Implement `useRemoteIngestCamera`** with the **same frame output contract** as `useWebcam`’s `captureFrame`.
4. **Branch `WebcamFeed`** when ingest is enabled, with an **escape hatch** to local webcam.
5. **Point the iOS / Ray-Ban pipeline** at the desktop WS endpoint and **document** the contract.

When this ships, bump **`protoVersion`** and update **[ios-remote-ingest-client.md](./ios-remote-ingest-client.md)** and **[remote-ingest-tailscale.md](./remote-ingest-tailscale.md)** accordingly.
