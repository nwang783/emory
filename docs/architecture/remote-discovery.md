# Remote discovery (UDP beacon)

The desktop can **advertise** an Emory ingest service so the **iPhone app** can discover it without typing an IP. **Discovery is not authentication** — pairing (planned) still required before WebRTC/signaling.

## Multicast

| Constant | Value |
|----------|--------|
| **Multicast group** | `239.255.73.73` |
| **UDP port** | `18673` |

Payload: **UTF-8 JSON**, sent periodically (default **2000 ms** when enabled in Settings).

### Example payload

```json
{
  "service": "emory-ingest",
  "protoVersion": 3,
  "instanceId": "<uuid>",
  "friendlyName": "Emory home",
  "signalingPort": 18763,
  "httpHealthPath": "/health",
  "wsIngestPath": "/ingest",
  "wsSignalingPath": "/signaling",
  "bindHostAdvertised": "100.x.y.z"
}
```

- **`bindHostAdvertised`** — best-effort address the phone should use for HTTP/WSS (Tailscale IP when bound to `0.0.0.0`, else the bind address).
- **`protoVersion`** — bump when fields change; clients should ignore unknown versions or degrade gracefully.

## Toggle

**Settings → Remote ingest → UDP discovery beacon**

When off, only **manual** connection (hostname/IP + port) applies.

## Limitations

- **Multicast** may be **blocked** on some Wi‑Fi or VPN paths; **manual configuration** remains first-class.
- **mDNS / Bonjour** on LAN is **planned** but not implemented yet (Settings shows a disabled placeholder).
- **iOS** may require **Local Network** permission for listeners; document in the iOS app when the client is built.

## Related

- [remote-ingest-tailscale.md](./remote-ingest-tailscale.md)
- [ios-remote-ingest-client.md](./ios-remote-ingest-client.md) — iOS listener + manual fallback
