# iOS client: connect to Emory desktop over Tailscale

This document is for **another engineer or coding agent** implementing the **iPhone companion app** side of remote ingest. The **desktop server** (Electron) is partially implemented; this guide describes **what exists today** and **what to build next**, with contracts and file pointers.

## Repository layout

| Area | Path | Role |
|------|------|------|
| **Desktop server** | `apps/desktop/` | HTTP `/health`, UDP beacon, Settings — **source of truth** for ports and JSON shapes |
| **iOS app** | `emory/emory/` | SwiftUI app: Meta wearables, `StreamViewModel`, services — **add** desktop connection here |

There is **no** shared protobuf package yet; use **JSON** and version fields as documented.

---

## Prerequisites (user + device)

1. **Tailscale** installed on **iPhone** and **home PC**, same **tailnet**, both **connected**.
2. **Emory desktop** → **Settings → Remote ingest** → **Enable** → **Apply & restart server**.
3. Note the PC’s **`100.x.y.z`** address (Tailscale app) or use **discovery** (below).
4. Default **TCP port** is **18763** unless changed on desktop.

**Important:** Until **TLS + pairing** exist, treat the service as **trusted tailnet only**. Do not expose the port to the public internet.

---

## Phase 0 — Implemented server behavior (implement first on iOS)

### 1) Reachability: HTTP health check

Use **`URLSession`** (or Swift 6 async `URLSession.shared.data`).

**Request**

```http
GET http://{host}:{signalingPort}/health HTTP/1.1
Host: {host}
```

- **`host`**: IPv4 literal `100.x.y.z`, or a MagicDNS-style hostname if iOS resolves it on the tailnet (verify with `getaddrinfo` / URLSession).
- **`signalingPort`**: from user input, from beacon (`signalingPort`), or default **18763**.

**Success response:** `200`, `Content-Type: application/json`

**JSON body (exact keys as of desktop implementation)**

```json
{
  "ok": true,
  "service": "emory-ingest",
  "protoVersion": 1,
  "instanceId": "uuid-string",
  "friendlyName": "Emory home",
  "signalingPort": 18763
}
```

| Field | Type | Client use |
|-------|------|------------|
| `ok` | boolean | Must be `true` |
| `service` | string | Expect `"emory-ingest"` |
| `protoVersion` | number | **1** today; if newer, decide whether to proceed or show “update app” |
| `instanceId` | string | Stable server identity; dedupe discovery list |
| `friendlyName` | string | Display label |
| `signalingPort` | number | Should match requested port; use for later WSS on same port unless spec changes |

**iOS implementation checklist**

- [ ] Build URL as `http://\(host):\(port)/health` (HTTP only for Phase 0).
- [ ] Set a **reasonable timeout** (e.g. 5–10 s) — Tailscale may be slow on cellular.
- [ ] Parse JSON defensively; surface **actionable** errors (host unreachable, wrong service, version mismatch).
- [ ] **Do not** assume ATS allows arbitrary HTTP: ensure **`NSAppTransportSecurity`** / **`NSAllowsLocalNetworking`** / per-domain exceptions as needed for **local / tailnet** HTTP. Prefer documenting **Info.plist** keys in the iOS target README when you add them.

**Reference (server):** `apps/desktop/src/main/services/remote-ingest-server.service.ts` — handler for `GET /health`.

---

### 2) Discovery: UDP multicast beacon (optional but recommended)

When the desktop has **UDP discovery beacon** enabled, it periodically sends **UTF-8 JSON** to:

| Constant | Value |
|----------|--------|
| Multicast group | `239.255.73.73` |
| UDP port | `18673` |

**Payload shape** — see [remote-discovery.md](./remote-discovery.md). Example:

```json
{
  "service": "emory-ingest",
  "protoVersion": 1,
  "instanceId": "…",
  "friendlyName": "Emory home",
  "signalingPort": 18763,
  "httpHealthPath": "/health",
  "bindHostAdvertised": "100.x.y.z"
}
```

**iOS implementation notes**

- Use **`Network.framework`** (`NWConnection` / multicast group) or **BSD sockets** via a small C/ Swift wrapper.
- Join group **`239.255.73.73:18673`**, listen for UDP datagrams, parse JSON.
- **Deduplicate** by `instanceId`; refresh “last seen” time.
- **Multicast is often flaky** on some networks — **manual entry** of `host` + `port` must remain **first-class** in the UI.
- **Local Network** permission: add **`NSLocalNetworkUsageDescription`** (and **`NSBonjourServices`** if you add Bonjour later) in **Info.plist** when the listener or certain discovery paths require it.

**Reference:** [remote-discovery.md](./remote-discovery.md)

---

### 3) Manual configuration UX (required)

Provide:

- **Host** (text field): `100.x.y.z` or hostname.
- **Port** (number): default **18763**.
- **Test connection** button → `GET /health` → show success + `friendlyName` + `instanceId`.
- **Saved profiles** (optional): `[{ label, host, port, lastInstanceId? }]` in UserDefaults or Keychain for sensitive tags.

Desktop **Copy connection details** (Settings) pastes URLs like `http://100.x.y.z:18763/health` — parsing that format on paste is a nice UX win.

---

## Phase 1+ — Not implemented on desktop yet (contract placeholders)

Coordinate with desktop changes before relying on these in production.

### WebSocket signaling (planned)

- **WSS** `wss://{host}:{port}/signaling` (path TBD) — JSON messages for SDP/ICE, pairing.
- **Pairing:** short code or QR → **session token** → `Authorization: Bearer …` on WSS.

### WebRTC (planned)

- **Phone** publishes **video + audio** tracks; **PC** is **receiver**.
- Likely **one `RTCPeerConnection`**, **Data Channel** for PC → phone cues.
- Native stack: **Google WebRTC** (Swift package) or vendor SDK; **Electron** side needs a **native WebRTC** peer (separate task).

When desktop ships signaling, update this doc with **message schemas** and **state machine** (connecting → paired → streaming → reconnect).

---

## Suggested Swift module layout

Place new code under `emory/emory/` to match existing structure:

```
emory/emory/
├── Services/
│   └── DesktopIngestClient.swift      # health check, future WSS
│   └── DesktopDiscoveryService.swift  # UDP multicast listener (optional)
├── Models/
│   └── DesktopIngestEndpoint.swift    # host, port, Codable health DTO
└── Views/
    └── DesktopConnectView.swift       # manual + discovered list UI
```

Keep **Meta wearables** pipeline (`StreamViewModel`, `RealMetaWearablesService`) separate: **desktop connection** decides *where to send* encoded streams once WebRTC exists; today it only *validates* the path via `/health`.

---

## Testing matrix (iOS QA)

| Scenario | Expected |
|----------|----------|
| Tailscale **off** on phone | Clear error; optional link to open Tailscale |
| Wrong IP | Timeout or connection refused |
| Desktop ingest **disabled** | Connection refused |
| **Health** OK | Show `friendlyName`, store `instanceId` |
| Beacon on / off | List populates or empty; manual still works |
| Cellular + Tailscale | Same as Wi‑Fi if Tailscale uses exit node correctly |

---

## Related desktop docs

- [remote-ingest-tailscale.md](./remote-ingest-tailscale.md) — server topology, bind modes, persistence file name.
- [remote-discovery.md](./remote-discovery.md) — beacon packet format.
- [conversation-recording.md](./conversation-recording.md) — end state: remote audio should feed the same pipeline as local mic (future).

## Changelog

When you add WSS/WebRTC or change JSON fields, **bump `protoVersion` on the server** and update this document + [docs/CHANGELOG.md](../CHANGELOG.md).
