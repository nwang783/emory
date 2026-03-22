# Remote ingest — Camera debug (desktop renderer)

Use this when the **Camera** page shows “connected” but **no JPEG preview** or **no face loop activity**.

## Phone → desktop URL (HTTP base → video WebSocket)

When **Settings** on iOS uses a **plain HTTP base URL** (no path), the app builds the **publisher** socket from the **same host and port**:

- Example: `http://10.0.0.237:18763` → `ws://10.0.0.237:18763/ingest?role=publisher` (see [`StreamViewModel.webSocketIngestURL`](../../emory/emory/ViewModels/StreamViewModel.swift)).

Use a **colon** between host and port (`10.0.0.237:18763`), not a dot.

## Where logic lives

| Concern | Location |
|--------|-----------|
| JPEG WebSocket viewer (`/ingest?role=viewer`) | [`useRemoteIngestViewer.ts`](../../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestViewer.ts) |
| WebRTC signaling viewer (`/signaling?role=desktop`) | [`useRemoteIngestWebRtc.ts`](../../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestWebRtc.ts) |
| Ingest + signaling relay, JSON ping handling | [`remote-ingest-server.service.ts`](../../apps/desktop/src/main/services/remote-ingest-server.service.ts) |
| Renderer → **Electron terminal** JSON logs | [`remote-ingest.ipc.ts`](../../apps/desktop/src/main/ipc/remote-ingest.ipc.ts) **`remote-ingest:log-terminal-event`**, [`preload` `logTerminalEvent`](../../apps/desktop/src/preload/index.ts) |
| Feed selection (local vs remote, JPEG vs WebRTC) | [`useCameraFeed.ts`](../../apps/desktop/src/renderer/modules/camera/hooks/useCameraFeed.ts) |
| Face / overlay loops | [`WebcamFeed.tsx`](../../apps/desktop/src/renderer/modules/camera/components/WebcamFeed.tsx) |
| Console prefix | [`remote-ingest-debug.ts`](../../apps/desktop/src/renderer/modules/camera/lib/remote-ingest-debug.ts) — **`[Emory:RemoteIngest]`** |

## `feedReady` vs `isActive` (remote)

- **`isActive`** — Ingest session is live: `connecting`, `waiting_publisher`, or `streaming` (JPEG) or WebRTC equivalents.
- **`feedReady`** — Same as **`isActive`** for remote feeds so **detection + overlay loops start while waiting for the first frame**; `runDetection` still **no-ops** until `captureFrame()` returns data (empty canvas).

## Application ping / pong (proves paths)

### JPEG `/ingest` (main process)

1. **Viewer** (renderer) sends text JSON: `{ "type": "ingest_ping", "seq": <n> }` on **`/ingest`** (every **5s** while the socket is open, one outstanding ping at a time).
2. **Server** logs **`ingest_ping`** to the **terminal** (JSON line, `service: "remote-ingest"`).
3. **Server → viewer**: `{ "type": "ingest_pong", "seq", "publisherPresent", "viewerCount" }` (proves **renderer ↔ desktop ingest service**).
4. If **`publisherPresent`**, server **→ phone** (publisher socket): `{ "type": "ingest_ping_relay", "seq" }`.
5. **Phone** (iOS [`BridgeServerService`](../../emory/emory/Services/BridgeServerService.swift)) replies `{ "type": "ingest_pong_relay", "seq" }` → server **→ all viewers** (proves **phone ↔ server** on `/ingest`).

If **`ingest_pong`** does not arrive within **4s**, the renderer logs a **terminal** line: `action: "ingest_ping_timeout"`.  
If **`publisherPresent`** but no **`ingest_pong_relay`** within **4s**, terminal: `action: "ingest_phone_relay_timeout"` (old app build or publisher not running).

### WebRTC `/signaling` (main process)

1. **Desktop** sends `{ "type": "emory_sig_ping", "seq" }` (same **5s** / **4s** deadline pattern).
2. **Server** logs **`sig_ping`**, responds **`emory_sig_pong`** with **`mobileConnected`**, and forwards **`emory_sig_ping_relay`** to the **mobile** signaling socket when connected.
3. **Mobile** should reply **`emory_sig_pong_relay`** (forwarded to desktop). *iOS signaling client not wired yet — expect `sig_phone_relay_timeout` in the terminal until implemented.*

### Terminal lines (Electron main)

Filter stdout for `"remote-ingest"`. Examples:

| `action` | Meaning |
|----------|---------|
| `ingest_viewer_open` / `ingest_publisher_open` | Socket attached (includes `remoteAddress`). |
| `ingest_ping` | Ping received from viewer or publisher. |
| `ingest_pong_relay` | Relay from publisher → viewers. |
| `sig_desktop_open` / `sig_mobile_open` | WebRTC signaling peers. |
| `sig_ping` / `sig_pong_relay` | Signaling ping path. |

Renderer-sourced lines include **`"source":"renderer"`** (ping timeouts, bounces, send failures).

## Bounce (reconnect) — **5s**

| Transport | Condition |
|-----------|-----------|
| JPEG | **`waiting_publisher`** for **≥ 5s** after WebSocket **OPEN**, or **CONNECTING** for **≥ 10s**. |
| WebRTC | **`signaling`** or **`negotiating`** for **≥ 5s** after signaling socket **OPEN** (does not apply while **`streaming`**). |

Bounces log to the **terminal** (`jpeg_ws_bounce`, `webrtc_sig_bounce`) and to the devtools console (`[Emory:RemoteIngest]`).

## Console events (filter: `Emory:RemoteIngest`)

| Message | Meaning |
|--------|---------|
| `camera_feed_remote` | Remote **`feedReady` / `isActive` / `remotePhase` / transport** changed. |
| `jpeg_ws_*` / `webrtc_sig_*` | Phase, heartbeat, ping/pong, bounce (see hook files for full set). |

Constants: **`HEARTBEAT_MS`** (5s), **`BOUNCE_*`**, **`PING_PONG_DEADLINE_MS`** / **`SIG_PING_DEADLINE_MS`** (4s) in the hooks.

## Interpreting heartbeats

- **`phase: waiting_publisher`**, **`readyState: OPEN`**, **`framesDecoded: 0`** — Desktop viewer is up; **no JPEG frames** yet from the phone.
- **`nonVideoBinary` rising** — Binary on `/ingest` is not a video frame.
- **`parseFailures` rising** — JPEG decode failed.

## Index / entry

Renderer bootstrap: [`main.tsx`](../../apps/desktop/src/renderer/main.tsx), [`index.html`](../../apps/desktop/src/renderer/index.html). Camera route composes **`WebcamFeed`** → **`useCameraFeed`** → **`useRemoteIngestViewer`** or **`useRemoteIngestWebRtc`**.
