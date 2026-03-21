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
  "protoVersion": 3,
  "instanceId": "uuid-string",
  "friendlyName": "Emory home",
  "signalingPort": 18763,
  "wsIngestPath": "/ingest",
  "wsSignalingPath": "/signaling",
  "advertisedAddresses": ["100.x.y.z", "192.168.1.42"]
}
```

| Field | Type | Client use |
|-------|------|------------|
| `ok` | boolean | Must be `true` |
| `service` | string | Expect `"emory-ingest"` |
| `protoVersion` | number | **3** = health + JPEG `/ingest` + WebRTC signaling path advertised. **2** = WS ingest only. **1** = health only. If newer, decide whether to proceed or show “update app” |
| `wsIngestPath` | string (optional) | WebSocket path on **same TCP port** as HTTP (e.g. `/ingest`) |
| `wsSignalingPath` | string (optional) | WebSocket path for **JSON** WebRTC signaling (e.g. `/signaling`); same TCP port |
| `advertisedAddresses` | string[] (optional) | IPv4s to try for HTTP/WS (tailnet-first when desktop uses **Tailscale + LAN**); fall back to manual host if absent |
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
  "protoVersion": 3,
  "instanceId": "…",
  "friendlyName": "Emory home",
  "signalingPort": 18763,
  "httpHealthPath": "/health",
  "wsIngestPath": "/ingest",
  "wsSignalingPath": "/signaling",
  "bindHostAdvertised": "100.x.y.z",
  "advertisedAddresses": ["100.x.y.z", "192.168.1.42"]
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

## Phase 1 — WebSocket video ingest (implemented on desktop)

- **URL:** `ws://{host}:{signalingPort}/ingest` — same port as `GET /health`.
- **Publisher (phone):** connect without `role` or with `?role=publisher`. Send **binary** messages: **`MSG_VIDEO_FRAME`** (JPEG + JSON metadata header) per [`@emory/ingest-protocol`](../../packages/ingest-protocol/) (aligned with `apps/bridge-server`).
- **Viewer:** desktop Camera tab uses `?role=viewer`; the server relays publisher frames to all viewers.
- **Security:** still **tailnet / trusted LAN** only until pairing exists.

### WebRTC signaling (implemented on desktop — **mobile must implement publisher**)

For **lower latency** than JPEG-over-`/ingest`, the desktop Camera tab (when **Settings → Prefer WebRTC video** is on) connects as **signaling role `desktop`** and expects the phone to be **`mobile`**.

- **URL:** `ws://{host}:{signalingPort}{wsSignalingPath}?role=mobile` — e.g. `ws://100.x.y.z:18763/signaling?role=mobile`.
- **Wire format:** UTF-8 **JSON** messages (one object per WebSocket message), max size enforced on server (~512 KB).
- **Roles:** `?role=desktop` vs `?role=mobile` (anything other than `desktop` is treated as mobile). **One connection per role**; a new connection for the same role replaces the previous.

**Message types** (mirror desktop [`useRemoteIngestWebRtc.ts`](../../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestWebRtc.ts)):

| `type` | Direction | Payload | Notes |
|--------|-----------|---------|--------|
| `offer` | mobile → desktop | `{ "type": "offer", "sdp": "<string>" }` | **Phone creates the offer** (includes video `sendonly` or equivalent). Desktop sets remote description and replies with `answer`. |
| `answer` | desktop → mobile | `{ "type": "answer", "sdp": "<string>" }` | Response to `offer`. |
| `ice` | both | `{ "type": "ice", "candidate": RTCIceCandidateInit \| null }` | Trickle ICE; `candidate: null` marks end-of-candidates if you use that pattern. |

**STUN:** Desktop uses `stun:stun.l.google.com:19302`. Phone should use compatible ICE servers for tailnet/LAN.

**Fallback:** If WebRTC is disabled on desktop or not implemented on phone, use **JPEG `/ingest`** as publisher (Phase 1 above).

**Encoding for real-time video (publisher-side):** see [remote-ingest-webrtc-encoding.md](./remote-ingest-webrtc-encoding.md) — H.264 preference, bitrate/FPS/GOP, and ICE notes.

---

## Suggested Swift module layout

Place new code under `emory/emory/` to match existing structure:

```
emory/emory/
├── Services/
│   └── DesktopIngestClient.swift      # health, WS /ingest (JPEG), WebRTC + /signaling
│   └── DesktopDiscoveryService.swift  # UDP multicast listener (optional)
├── Models/
│   └── DesktopIngestEndpoint.swift    # host, port, Codable health DTO
└── Views/
    └── DesktopConnectView.swift       # manual + discovered list UI
```

Keep **Meta wearables** pipeline (`StreamViewModel`, `RealMetaWearablesService`) separate: **desktop connection** sends either **WebRTC** (preferred when desktop has WebRTC on) or **JPEG `/ingest`**; `/health` validates reachability and advertises paths.

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
- [remote-camera-desktop-plan.md](./remote-camera-desktop-plan.md) — **desktop UI + ingest server:** show phone/Ray-Ban feed in Camera tab when ingest is on (WS + JPEG v1, WebRTC later).
- [conversation-recording.md](./conversation-recording.md) — end state: remote audio should feed the same pipeline as local mic (future).

## Changelog

When you add WSS/WebRTC or change JSON fields, **bump `protoVersion` on the server** and update this document + [docs/CHANGELOG.md](../CHANGELOG.md).
