# Remote ingest over Tailscale

This document describes how the **Electron desktop app** exposes a **remote ingest** endpoint so an **iPhone relay** (Ray-Ban Meta glasses → phone → PC) can reach the home computer over **Tailscale**.

## Status (implemented vs planned)

| Piece | Status |
|-------|--------|
| **HTTP `GET /health`** on configurable TCP port | Implemented (Phase 0) |
| **Persisted settings** (`remote-ingest-config.json` in app userData) | Implemented |
| **Settings UI** (bind mode, port, beacon, friendly name) | Implemented |
| **WSS / WebRTC signaling** | Planned |
| **Pairing + session tokens** | Planned |

## Topology

1. **Tailscale** on iPhone and PC — same tailnet, devices get `100.x` addresses (and optional MagicDNS names).
2. **Emory desktop** enables **Remote ingest** in **Settings** and listens on a **TCP port** (default **18763**).
3. **Bind modes**
   - **Tailscale (100.x) only** — binds to the first IPv4 address in `100.0.0.0/8` found on the machine. Fails gracefully with an error if Tailscale is not connected.
   - **All interfaces (`0.0.0.0`)** — listens everywhere; **use strict Tailscale ACLs** so only trusted peers can reach the port. Windows may show a **Firewall** prompt.
   - **Loopback** — `127.0.0.1` for local development.

## HTTP API (Phase 0)

- **`GET /health`** — JSON: `{ ok, service, protoVersion, instanceId, friendlyName, signalingPort }`.
- **`GET /`** — short plain-text pointer to `/health`.

No authentication on `/health` yet; keep the port **tailnet-only** via ACLs until pairing ships.

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
- [ios-remote-ingest-client.md](./ios-remote-ingest-client.md) — **iOS app implementation guide** (health check, discovery, future signaling).
- [conversation-recording.md](./conversation-recording.md) — local mic pipeline (parity target for remote audio).
