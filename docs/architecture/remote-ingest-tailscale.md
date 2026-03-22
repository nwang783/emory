# Remote ingest over Tailscale

This document describes how the **Electron desktop app** exposes a **remote ingest** endpoint so an **iPhone relay** (Ray-Ban Meta glasses → phone → PC) can reach the home computer over **Tailscale**.

## Status (implemented vs planned)

| Piece | Status |
|-------|--------|
| **HTTP `GET /health`** on configurable TCP port | Implemented (`protoVersion` **3**; optional **`advertisedAddresses`**) |
| **HTTP upgrade → WebSocket `/ingest`** — publisher → viewers (binary relay) | Implemented |
| **HTTP upgrade → WebSocket `/signaling`** — JSON WebRTC signaling (`?role=desktop` \| `mobile`) | Implemented |
| **Persisted settings** (`remote-ingest-config.json` in app userData) | Implemented |
| **Settings UI** (bind mode, port, beacon, friendly name, **WebRTC video (experimental)** toggle) | Implemented |
| **Camera tab** remote viewer (`?role=viewer` on `/ingest`) or WebRTC (`/signaling?role=desktop`) | Implemented |
| **WebRTC on iOS** | Phone app must publish offer + ICE; see [ios-remote-ingest-client.md](./ios-remote-ingest-client.md) |
| **Pairing + session tokens** | Planned |

## Topology

1. **Tailscale (optional)** — if installed on iPhone and PC, same tailnet gives `100.x` addresses (and optional MagicDNS names). Not required for **same Wi‑Fi LAN**.
2. **Same Wi‑Fi LAN** — phone and PC can also use private IPv4 (e.g. `192.168.x.x`) when the listener accepts those interfaces.
3. **Emory desktop** enables **Remote ingest** in **Settings** and listens on a **TCP port** (default **18763**).
4. **Bind modes**
   - **All interfaces (default)** — listens on **`0.0.0.0`**. **`advertisedAddresses`** follow OS NIC order. **No Tailscale required** for same-Wi‑Fi LAN (e.g. `http://192.168.x.x:18763` / `10.x.x.x:18763` from the phone).
   - **Tailscale + local LAN** — same listen address as **All**; lists **100.x first**, then other LAN IPs in **Copy** / beacon / **`GET /health`**. Use when you switch between tailnet and LAN and want tailnet-first hints.
   - **Tailscale (100.x) only** — binds only to the first `100.x` address. Fails if Tailscale is not connected. Does **not** accept direct `192.168.x` connections to another NIC.
   - **Loopback** — `127.0.0.1` for local development.

## HTTP API (Phase 0)

- **`GET /health`** — JSON: `{ ok, service, protoVersion, instanceId, friendlyName, signalingPort, wsIngestPath, wsSignalingPath, advertisedAddresses? }`. **`advertisedAddresses`**: string array of IPv4s the client may try (order matches bind mode; tailnet-first when **Tailscale + LAN**).
- **`GET /`** — short plain-text pointer to `/health`, `/ingest`, and `/signaling`.
- **`WS /ingest`** — same TCP port; **`?role=viewer`** (desktop) or publisher (default / `?role=publisher`). Relay only; see [remote-camera-desktop-plan.md](./remote-camera-desktop-plan.md).
- **`WS /signaling`** — same TCP port; UTF-8 JSON (`offer` / `answer` / `ice`). **`?role=desktop`** (Electron renderer) vs **`?role=mobile`** (phone). See [ios-remote-ingest-client.md](./ios-remote-ingest-client.md).

No authentication on `/health` yet. With **Tailscale + LAN** or **All interfaces**, the port is reachable on **local LAN** too — use **host firewall**, router isolation, or **Tailscale-only** bind mode if you need to avoid LAN exposure until pairing ships.

## Persistence

Path: **`<userData>/remote-ingest-config.json`**

Fields mirror the Settings UI plus a stable **`instanceId`** for discovery deduplication.

## IPC (preload → main)

| Channel | Purpose |
|---------|---------|
| `remote-ingest:get-config` | Load persisted config + `instanceId` |
| `remote-ingest:get-status` | Listener state, addresses, errors, beacon state |
| `remote-ingest:apply` | Save partial config and **restart** HTTP + beacon |

## Security checklist (operators)

- Restrict the signaling port in **Tailscale ACLs** to known devices/tags.
- Do not expose the port to the **public internet** without TLS + auth.
- Prefer **Tailscale-only bind** on home PCs when possible.

## Related

- [remote-discovery.md](./remote-discovery.md) — UDP multicast beacon.
- [ios-remote-ingest-client.md](./ios-remote-ingest-client.md) — **iOS app implementation guide** (health check, discovery, signaling).
- [remote-ingest-webrtc-encoding.md](./remote-ingest-webrtc-encoding.md) — **WebRTC publisher encoding** (FPS, bitrate, GOP) + desktop codec prefs.
- [conversation-recording.md](./conversation-recording.md) — local mic pipeline (parity target for remote audio).
