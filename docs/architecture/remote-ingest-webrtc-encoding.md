# WebRTC: real-time encoding (mobile) + desktop viewer

The **desktop Electron app** is the **viewer** (it answers the SDP offer and plays `MediaStream` in a `<video>`). **All encoding** (codec, bitrate, resolution, FPS) is decided on the **phone / glasses publisher**. This doc is the contract for **doing that properly** so the stream feels real-time and smooth on the PC.

**Code pointers**

| Role | Location |
|------|-----------|
| Desktop viewer + signaling | [`useRemoteIngestWebRtc.ts`](../../apps/desktop/src/renderer/modules/camera/hooks/useRemoteIngestWebRtc.ts) |
| Codec preference before `createAnswer()` | [`orderVideoCodecsForIngest.ts`](../../apps/desktop/src/renderer/modules/camera/lib/orderVideoCodecsForIngest.ts) (H.264 → VP8 → VP9 → AV1) |
| Signaling wire format | [ios-remote-ingest-client.md](./ios-remote-ingest-client.md) |

---

## What the desktop already does

- **`RTCPeerConnection`** with **STUN** (`stun:stun.l.google.com:19302`), **`bundlePolicy: max-bundle`**, **`rtcpMuxPolicy: require`**.
- After **`setRemoteDescription(offer)`**, **`applyIngestVideoCodecPreferences(pc)`** reorders **receiver** codec capabilities so answers **prefer H.264**, then VP8, VP9, AV1 (Chromium still intersects with the offer — the phone’s advertised codecs win if the desktop doesn’t support them).
- **Trickle ICE**: JSON `{ type: 'ice', candidate }` in both directions; **`candidate: null`** is valid for end-of-candidates.

---

## Publisher checklist (iOS / WebRTC stack)

Implement on the **mobile** side (e.g. Google **WebRTC.framework** in Swift, or equivalent):

### 1. Offer first, video send-only

- Create **`RTCPeerConnection`** with the same STUN server (and optional TURN later).
- Add a **camera** `MediaStreamTrack` (from `AVCaptureSession` or your Meta pipeline).
- Add a **video transceiver** in **`sendonly`** (or `sendrecv` if you also expect return video — not required today).
- Call **`createOffer` → setLocalDescription → send `offer` JSON** over `ws://…/signaling?role=mobile`.

### 2. Prefer hardware H.264 on the phone

- iOS hardware encoders are built around **H.264** / **HEVC**. For **maximum compatibility** with Chromium desktop, **negotiate H.264** in the offer (Baseline / Constrained Baseline profiles are widely decoded on PC).
- If the offer only lists **VP8/VP9**, the desktop will still work; you may pay more CPU/battery on one side or the other.

### 3. Real-time encoding parameters (the important part)

Set **sender** parameters so the encoder targets **steady frame rate** and **bounded latency** (exact API names differ by WebRTC build):

| Goal | Practical starting point |
|------|---------------------------|
| Smooth motion | **24–30 fps** sustained (`maxFramerate` / equivalent). |
| 720p-class picture | **1280×720** or **960×540** if the uplink is weak. |
| Bitrate | **~1.5–3 Mbps** for 720p30 glass video on Tailscale; increase if quality is starved, decrease if the network drops. |
| Latency | Prefer **CBR-ish cap** + **short GOP** (e.g. **1–2 s** keyframe interval, not 5–10 s). Shorter GOP = slightly more bits, **much** better recovery and perceived lag. |
| Under congestion | Prefer **maintain framerate** over **maintain resolution** (`degradationPreference` in Web APIs; analogs exist in native WebRTC) so motion stays smooth. |

**Do not** rely on default sender params for a custom ingest — defaults are tuned for conferencing, not necessarily your glasses pipeline.

### 4. ICE

- Gather **host** candidates on the phone (Tailscale gives you **100.x**). **STUN** helps some NAT cases; **TURN** is only needed if you later support paths without direct IP reachability.
- Send each candidate as **`{ type: 'ice', candidate: <RTCIceCandidateInit> }`**; send **`candidate: null`** when gathering completes (desktop tolerates this).

### 5. Audio

- Not part of the current desktop camera pipeline for ingest. You can omit audio m-lines or disable the track until [conversation-recording.md](./conversation-recording.md) defines remote mic.

---

## Verification

- **Desktop:** open Camera → **Start remote camera (WebRTC)** → confirm phase **streaming** and `<video>` plays smoothly.
- **Chrome WebRTC internals** (if you run the renderer in a browser for debugging): check inbound codec (expect **H264** when negotiated), packet flow, and frame rate.
- **Network:** on Tailscale, latency should be low; if frames stall, reduce resolution/bitrate on the phone first.

---

## Open questions / documented doubts

These are **explicit unknowns** so a new developer (or future us) does not assume we already decided them.

| Doubt | Why it matters | Resolution (when known) |
|--------|----------------|-------------------------|
| **Which WebRTC stack on iOS?** | **Google `WebRTC.framework`** vs **Meta / custom pipeline** feeding a **custom video capturer** changes *where* you set bitrate, FPS, resolution, and keyframe interval — the APIs and file layout differ. This repo’s desktop side is agnostic; the **Swift implementation guide** in [ios-remote-ingest-client.md](./ios-remote-ingest-client.md) stays high-level until the iOS target is chosen. | Pick one stack for v1; add a short “Implementation choice” subsection to this doc + link to real Swift types. |
| **HEVC (H.265) in the offer?** | iOS hardware often likes **HEVC**; **Chromium/Electron** decode support and SDP intersection with our **H.264-first** desktop prefs are **not verified** for every build/OS. Safer default for cross-platform v1 is **H.264** in the mobile offer unless we test HEVC end-to-end. | After QA on Windows + macOS desktop builds, document “HEVC allowed” or “H.264 only”. |
| **TURN required or not?** | Today we assume **Tailscale `100.x` reachability** + **STUN**. Corporate Wi‑Fi, CGNAT-only paths, or non-Tailscale LANs might need **TURN**; we have **no** TURN URLs in desktop config yet. | Add optional TURN env/config and document operator setup when a real user hits ICE `failed`. |
| **Exact sender parameter defaults** | The doc gives **starting** numbers (e.g. 1.5–3 Mbps, 24–30 fps); they are **not** measured against Ray-Ban / Meta glass resolution or phone thermal limits. | Tune from field tests; replace ranges with “recommended presets” once measured. |

---

## Related

- [ios-remote-ingest-client.md](./ios-remote-ingest-client.md) — health, beacon, `/signaling` message types.
- [remote-camera-desktop-plan.md](./remote-camera-desktop-plan.md) — desktop UI + transport choice.
- [remote-ingest-tailscale.md](./remote-ingest-tailscale.md) — bind modes and security.
