# Documentation changelog

## 2026-03-22 — Conversation recorder uses phone audio in remote mode

- **Renderer** — [`useRemoteIngestViewer.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestViewer.ts): adds a `MediaStreamAudioDestinationNode` alongside the speaker `GainNode`. Each decoded audio chunk connects to both destinations — the gain node (mutable speaker output) and the stream destination (always full volume). Exposes `remoteAudioStream: MediaStream | null` for downstream consumers.
- **Renderer** — [`useConversationRecorder.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useConversationRecorder.ts): accepts optional `remoteAudioStream` parameter. When provided with active audio tracks, uses it directly instead of calling `getUserMedia()` for the local Windows microphone. Mic label changes to "Remote (phone / glasses)". Does not stop remote stream tracks on cleanup (they are owned by the audio context).
- **Renderer** — [`useCameraFeed.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useCameraFeed.ts): threads `remoteAudioStream` (from `ingestWsRemote`) through to consumers; null when in local mode.
- **UI** — [`WebcamFeed.tsx`](../apps/desktop/src/renderer/modules/camera/components/WebcamFeed.tsx): passes `remoteAudioStream` to `useConversationRecorder`.

## 2026-03-22 — iOS: configurable audio source (iPhone mic vs Ray-Ban glasses)

- **Model** — [`AppSettings.swift`](../emory/emory/Models/AppSettings.swift): new `audioSource` setting (`AudioSource` enum: `.iphone` / `.rayBans`), persisted via `UserDefaults`. Defaults to iPhone mic.
- **UI** — [`SettingsView.swift`](../emory/emory/Views/SettingsView.swift): dropdown picker in the APPLICATION section to select which microphone streams to the desktop.
- **Service** — [`MicrophoneCaptureService.swift`](../emory/emory/Services/MicrophoneCaptureService.swift): `start(audioSource:)` now calls `AVAudioSession.setPreferredInput` — selects built-in mic for `.iphone`, or the Bluetooth HFP/A2DP Meta glasses input for `.rayBans` (falls back to any Bluetooth input if no Meta device name match). Added `.allowBluetoothA2DP` session option.
- **ViewModel** — [`StreamViewModel.swift`](../emory/emory/ViewModels/StreamViewModel.swift): reads `AppSettings.shared.audioSource` when starting mic capture in both full session and mic-only modes.

## 2026-03-22 — Remote audio playback with mute/unmute

- **Renderer** — [`useRemoteIngestViewer.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestViewer.ts): handles `MSG_AUDIO_CHUNK` (type 2) binary messages — decodes PCM16 payload to Float32 and plays via Web Audio API with gapless scheduling (`AudioBufferSourceNode` chain). Audio is muted/unmuted via a `GainNode` so playback timing stays in sync. Exposes `isMuted` / `toggleMute`.
- **Renderer** — [`useCameraFeed.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useCameraFeed.ts): threads `isMuted` / `toggleMute` through from the ingest viewer hook.
- **UI** — [`WebcamFeed.tsx`](../apps/desktop/src/renderer/modules/camera/components/WebcamFeed.tsx): mute/unmute button (Volume2/VolumeOff icons) visible in remote mode when streaming. Defaults to unmuted.

## 2026-03-22 — Video streaming: 30fps target, quality bump, newest-wins frame dropping

- **iOS** — [`RealMetaWearablesService.swift`](../emory/emory/Services/RealMetaWearablesService.swift): SDK `frameRate` **15 → 30**. [`MockMetaWearablesService.swift`](../emory/emory/Services/MockMetaWearablesService.swift): mock sleep **66ms → 33ms** (~30fps). [`BridgeServerService.swift`](../emory/emory/Services/BridgeServerService.swift): JPEG `compressionQuality` **0.3 → 0.7** for decent quality on the wire.
- **Desktop renderer** — [`useRemoteIngestViewer.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestViewer.ts): **newest-wins frame dropping** — max one `createImageBitmap` decode in flight at a time; incoming frames while decoding overwrite a single pending slot (previous pending frames are dropped). Canvas dimensions only update when they change (no per-frame reallocation). Heartbeat now reports `framesDropped`.
- **Viewer HTML** — [`remote-ingest-server.service.ts`](../apps/desktop/src/main/services/remote-ingest-server.service.ts) `/viewer` page: same newest-wins decode pattern with live FPS and dropped-frame counters.

## 2026-03-21 — Remote ingest: bridge-server parity copy + `ingest-ws` transport label

- **Settings** — [`RemoteIngestSettings.tsx`](../apps/desktop/src/renderer/modules/settings/components/RemoteIngestSettings.tsx): WebRTC toggle reframed as **experimental**; copy states default **`/ingest`** matches **`apps/bridge-server`** and current iOS does not open **`/signaling`**.
- **Camera** — [`useCameraFeed.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useCameraFeed.ts): transport **`jpeg-ws` → `ingest-ws`**; internal **`ingestWsRemote`**; status hints. [`useRemoteIngestViewer.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestViewer.ts) terminal **`transport: ingest-ws`**. [`WebcamFeed.tsx`](../apps/desktop/src/renderer/modules/camera/components/WebcamFeed.tsx) start button **ingest / bridge**.
- **Types** — [`remote-ingest.types.ts`](../apps/desktop/src/main/services/remote-ingest.types.ts) comment on **`webrtcVideoPreferred`** aligned with bridge vs WebRTC.
- **Docs** — [`apps/desktop.md`](./apps/desktop.md), [`remote-ingest-tailscale.md`](./architecture/remote-ingest-tailscale.md), [`ios-remote-ingest-client.md`](./architecture/ios-remote-ingest-client.md).
- **iOS** — [`SettingsView.swift`](../emory/emory/Views/SettingsView.swift) Desktop URL hint matches desktop wording (bridge **`/ingest`**, WebRTC off).

## 2026-03-21 — WebRTC signaling: clear ping state on `stop`

- **Renderer** — [`useRemoteIngestWebRtc.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestWebRtc.ts): `stop()` now resets **`signalingOpenedAtRef`**, **`pingSeqRef`**, and outstanding sig ping / relay deadline refs so **`sig_ping_timeout`** does not fire for a stale seq after **`signaling_stall`** bounce or reconnect.

## 2026-03-21 — `@emory/bridge-live`: bridge face pipeline inside Electron `/ingest`

- **Package** — [`packages/bridge-live`](../packages/bridge-live/): **`FrameProcessor`** (JPEG → face detect/match → DB), shared by standalone bridge and desktop.
- **Bridge server** — [`apps/bridge-server`](../apps/bridge-server/): depends on `@emory/bridge-live`; removed local `frame-processor.ts`.
- **Desktop main** — [`remote-ingest-server.service.ts`](../apps/desktop/src/main/services/remote-ingest-server.service.ts): on **`MSG_VIDEO_FRAME`** from publisher, runs same pipeline and sends **`face_result`** JSON to the phone; still relays binary to viewers. [`face.ipc.ts`](../apps/desktop/src/main/ipc/face.ipc.ts) **`getMainFaceService()`**; [`index.ts`](../apps/desktop/src/main/index.ts) wires `peopleRepo` + face getter. [`electron.vite.config.ts`](../apps/desktop/electron.vite.config.ts) bundles `@emory/bridge-live`.
- **Docs** — [bridge-live-and-desktop.md](./architecture/bridge-live-and-desktop.md); [bridge-server README](../apps/bridge-server/README.md) code index.

## 2026-03-21 — Troubleshooting: `better-sqlite3` Node ABI mismatch

- **Docs** — [better-sqlite3-node-version.md](./troubleshooting/better-sqlite3-node-version.md); [apps/bridge-server/README.md](../apps/bridge-server/README.md) short fix + link.
- **Root** — `package.json` script **`rebuild:better-sqlite3`**: `npm rebuild better-sqlite3` (run from repo root for bridge-server / Node).
- **Electron** — `scripts/rebuild-electron-native.cjs` runs `electron-rebuild` with **repo root** cwd; root **`postinstall`** and **`rebuild:electron-native`** use it so hoisted `better-sqlite3` matches Electron’s ABI (fixes `NODE_MODULE_VERSION` when desktop ran rebuild from `apps/desktop` only).

## 2026-03-21 — Remote ingest: ping/pong, 5s bounce, terminal logs, WebRTC parity

- **Desktop main** — [`remote-ingest-server.service.ts`](../apps/desktop/src/main/services/remote-ingest-server.service.ts): JSON **`ingest_ping` / `ingest_pong` / `ingest_ping_relay` / `ingest_pong_relay`** on **`/ingest`**; **`emory_sig_ping` / `emory_sig_pong` / `emory_sig_ping_relay` / `emory_sig_pong_relay`** on **`/signaling`**; terminal JSON for viewer/publisher/signaling open/close and pings.
- **Desktop IPC** — [`remote-ingest.ipc.ts`](../apps/desktop/src/main/ipc/remote-ingest.ipc.ts) **`remote-ingest:log-terminal-event`**; [`preload`](../apps/desktop/src/preload/index.ts) **`remoteIngest.logTerminalEvent`** for renderer failures (ping timeout, bounce, relay timeout).
- **Renderer** — [`useRemoteIngestViewer.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestViewer.ts): **5s** heartbeat + **`ingest_ping`**, **5s** bounce waiting publisher / **10s** stuck connecting; [`useRemoteIngestWebRtc.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestWebRtc.ts): same ping pattern + **5s** signaling stall bounce; [`remote-ingest-debug.ts`](../apps/desktop/src/renderer/modules/camera/lib/remote-ingest-debug.ts) **`logRemoteIngestTerminal`**.
- **iOS** — [`BridgeServerService.swift`](../../emory/emory/Services/BridgeServerService.swift): responds to **`ingest_ping_relay`** with **`ingest_pong_relay`** (round-trip with desktop viewer).
- **Docs** — [remote-ingest-camera-debug.md](./apps/remote-ingest-camera-debug.md) (HTTP → `ws://host:port/ingest` flow, e.g. `10.0.0.237:18763`).

## 2026-03-21 — Camera: remote JPEG debug + `feedReady` while waiting

- **Renderer** — [`useRemoteIngestViewer.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestViewer.ts): **`console.info`** lines prefixed **`[Emory:RemoteIngest]`** (phase, open/close/errors, **3s heartbeat**, frame counters, **`jpeg_ws_bounce`** reconnect if **`waiting_publisher`** ≥ 6s or **`CONNECTING`** ≥ 12s). [`remote-ingest-debug.ts`](../apps/desktop/src/renderer/modules/camera/lib/remote-ingest-debug.ts).
- **Renderer** — [`useCameraFeed.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useCameraFeed.ts): **`feedReady`** for remote uses **`isActive`** (not only `phase === 'streaming'`) so **WebcamFeed** detection/overlay loops run while waiting for the first JPEG; detection still skips until `captureFrame()` has pixels.
- **Docs** — [remote-ingest-camera-debug.md](./apps/remote-ingest-camera-debug.md).

## 2026-03-21 — iOS video ingest: HTTP Settings → WebSocket `/ingest`

- **iOS** — [`StreamViewModel.swift`](../../emory/emory/ViewModels/StreamViewModel.swift): derive **`ws://…/ingest?role=publisher`** from **`http(s)://`** Desktop URL when starting stream (no separate `ws://` in Settings required). [`SettingsView`](../../emory/emory/Views/SettingsView.swift) copy updated.
- **Desktop** — Default **`webrtcVideoPreferred: false`** so **Camera** uses **JPEG `/ingest`** viewer with current iOS publisher; turn **Prefer WebRTC video** on when the phone implements **`/signaling`**. [`remote-ingest.types.ts`](../apps/desktop/src/main/services/remote-ingest.types.ts), [`RemoteIngestSettings.tsx`](../apps/desktop/src/renderer/modules/settings/components/RemoteIngestSettings.tsx), [`remote-ingest.store.ts`](../apps/desktop/src/renderer/shared/stores/remote-ingest.store.ts).

## 2026-03-21 — Remote ingest default: LAN-first (`all`), iOS ATS plist fix

- **Desktop** — Default **`bindMode`** is **`all`** (`0.0.0.0`, no Tailscale required for same-Wi‑Fi). [`remote-ingest.types.ts`](../apps/desktop/src/main/services/remote-ingest.types.ts), [`RemoteIngestSettings.tsx`](../apps/desktop/src/renderer/modules/settings/components/RemoteIngestSettings.tsx) form default aligned.
- **iOS** — [`Info.plist`](../../emory/emory/Info.plist): single **`NSAppTransportSecurity`** dict with **`NSAllowsLocalNetworking`** + **`NSAllowsArbitraryLoads`** (removed duplicate key that overwrote the first). [`SettingsView`](../../emory/emory/Views/SettingsView.swift): stress **http://** vs **https://** TLS errors.

## 2026-03-21 — iOS Desktop URL guidance + connection logging

- **iOS** — [`SettingsView.swift`](../../emory/emory/Views/SettingsView.swift): clarify **http://** base URL (LAN e.g. `10.0.0.237:18763`), not `ws://`. [`DesktopApiClient.swift`](../../emory/emory/Services/DesktopApiClient.swift): trim trailing `/`, reject non-http(s) schemes with a clear error. [`DesktopConnectionStore.swift`](../../emory/emory/ViewModels/DesktopConnectionStore.swift): **`os.Logger`** on Test Connection.
- **Desktop** — [`remote-ingest-server.service.ts`](../apps/desktop/src/main/services/remote-ingest-server.service.ts): structured JSON log line for **`GET /health`** and **`GET /api/v1/*`** (`mobile_http_hit`).
- **Docs** — [ios-remote-ingest-client.md](./architecture/ios-remote-ingest-client.md) “Desktop URL” table.

## 2026-03-21 — Camera: `remotePhase` from `useCameraFeed`

- **Renderer** — [`useCameraFeed.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useCameraFeed.ts) exposes **`remotePhase`** (JPEG or WebRTC ingest phase); [`WebcamFeed.tsx`](../apps/desktop/src/renderer/modules/camera/components/WebcamFeed.tsx) destructures it for “waiting for publisher” / “connecting” UI (fixes undefined `remotePhase`).

## 2026-03-21 — Remote ingest: Tailscale + local LAN bind mode

- **Desktop** — [`remote-ingest.types.ts`](../apps/desktop/src/main/services/remote-ingest.types.ts): bind mode **`tailscale_lan`** (default): listen **`0.0.0.0`**, list **100.x then other LAN** IPv4s via [`buildEffectiveAddresses`](../apps/desktop/src/main/services/remote-ingest-network.ts). [`GET /health`](../apps/desktop/src/main/services/remote-ingest-server.service.ts) + UDP beacon include **`advertisedAddresses`**. Settings + IPC + preload + store updated.
- **Docs** — [remote-ingest-tailscale.md](./architecture/remote-ingest-tailscale.md), [remote-discovery.md](./architecture/remote-discovery.md), [ios-remote-ingest-client.md](./architecture/ios-remote-ingest-client.md).

## 2026-03-21 — WebRTC: open questions (documented doubts)

- **[remote-ingest-webrtc-encoding.md](./architecture/remote-ingest-webrtc-encoding.md)** — “Open questions / documented doubts”: iOS stack choice (WebRTC.framework vs Meta/custom), HEVC vs H.264, TURN need, untuned bitrate/FPS defaults.

## 2026-03-21 — WebRTC: codec preferences + encoding guide

- **Desktop** — [`orderVideoCodecsForIngest.ts`](../apps/desktop/src/renderer/modules/camera/lib/orderVideoCodecsForIngest.ts), [`useRemoteIngestWebRtc.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestWebRtc.ts): before `createAnswer()`, prefer **H.264 → VP8 → VP9 → AV1** on video m-lines; `max-bundle` + `rtcpMuxPolicy: require`. Unit tests (pure SDP/codec ordering): [`orderVideoCodecsForIngest.test.ts`](../apps/desktop/src/renderer/modules/camera/lib/orderVideoCodecsForIngest.test.ts) — `bun run test:camera-codecs` in `apps/desktop`.
- **Docs** — [remote-ingest-webrtc-encoding.md](./architecture/remote-ingest-webrtc-encoding.md) (mobile encoder checklist: FPS, bitrate, GOP, degradation).
- **Tooling** — [`apps/desktop/tsconfig.web.json`](../apps/desktop/tsconfig.web.json) excludes `**/*.test.ts` from renderer typecheck.

## 2026-03-21 — Camera: remote overlay + detection dimensions

- **Renderer** — [`WebcamFeed.tsx`](../apps/desktop/src/renderer/modules/camera/components/WebcamFeed.tsx): `runDetection` and overlay sizing use **`frameWidth` / `frameHeight`** from the active feed (local, JPEG remote, or WebRTC) instead of the local-only `videoRef`, so boxes and `detectOnly` run correctly for remote ingest.
- **Docs** — [remote-camera-desktop-plan.md](./architecture/remote-camera-desktop-plan.md) “Framerate and smooth preview”.

## 2026-03-21 — Remote ingest: WebRTC `/signaling` + proto 3

- **Desktop** — [`remote-ingest-server.service.ts`](../apps/desktop/src/main/services/remote-ingest-server.service.ts): second WebSocket **`/signaling`** for JSON **SDP/ICE** relay; roles **`?role=desktop`** (renderer) vs **`?role=mobile`** (phone). `/health` + UDP beacon **`protoVersion` 3** + `wsSignalingPath`.
- **Config** — `webrtcVideoPreferred` in persisted config + IPC + preload; **Settings → Prefer WebRTC video** ([`RemoteIngestSettings.tsx`](../apps/desktop/src/renderer/modules/settings/components/RemoteIngestSettings.tsx)).
- **Renderer** — [`useRemoteIngestWebRtc.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestWebRtc.ts), [`useCameraFeed.ts`](../apps/desktop/src/renderer/modules/camera/hooks/useCameraFeed.ts): default to WebRTC when preferred; JPEG `/ingest` when off.
- **Docs** — [ios-remote-ingest-client.md](./architecture/ios-remote-ingest-client.md), [remote-ingest-tailscale.md](./architecture/remote-ingest-tailscale.md), [remote-discovery.md](./architecture/remote-discovery.md), [remote-camera-desktop-plan.md](./architecture/remote-camera-desktop-plan.md), [apps/desktop.md](./apps/desktop.md).

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
