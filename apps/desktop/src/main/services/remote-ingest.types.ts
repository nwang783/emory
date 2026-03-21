/** Wire format version in `/health` and discovery beacons; bump when ingest API changes. */
export const REMOTE_INGEST_PROTO_VERSION = 3

/** WebSocket path for binary ingest (publisher → server → viewers). Same port as HTTP. */
export const REMOTE_INGEST_WS_PATH = '/ingest'

/** WebSocket path for WebRTC SDP/ICE relay (JSON text). Same port as HTTP. */
export const REMOTE_INGEST_SIGNALING_PATH = '/signaling'

/** Bind address policy for the remote ingest HTTP listener. */
export type RemoteIngestBindMode = 'all' | 'loopback' | 'tailscale' | 'tailscale_lan'

/** User-editable remote ingest configuration (persisted under userData). */
export type RemoteIngestConfig = {
  enabled: boolean
  bindMode: RemoteIngestBindMode
  /** TCP port for HTTP health / future WSS signaling. */
  signalingPort: number
  /** Periodic UDP multicast advertisement (see docs/architecture/remote-discovery.md). */
  beaconEnabled: boolean
  beaconIntervalMs: number
  /** Reserved for Bonjour / DNS-SD (not implemented in Phase 0). */
  mdnsEnabled: boolean
  /** Shown in discovery UIs; not a security control. */
  friendlyName: string
  /**
   * When true (default), Camera uses WebRTC for remote video (lower latency).
   * When false, uses JPEG-over-WebSocket `/ingest` only.
   */
  webrtcVideoPreferred: boolean
}

/** Runtime status returned to the renderer. */
export type RemoteIngestStatus = {
  listening: boolean
  /** Primary address string for display (`effectiveAddresses[0]`). */
  effectiveHost: string | null
  /** IPv4 candidates the phone may use; order depends on bind mode (tailnet-first for `tailscale_lan`). */
  effectiveAddresses: string[]
  signalingPort: number
  beaconActive: boolean
  lastError: string | null
  /** Stable id for discovery deduplication (persisted with config). */
  instanceId: string
  /** Best-effort hint; verify in Tailscale admin (machine name + tailnet). */
  tailscaleHint: string | null
}

export const REMOTE_INGEST_DEFAULT_CONFIG: RemoteIngestConfig = {
  enabled: false,
  /** Listen on all interfaces; UI lists 100.x first then other LAN IPs (see `buildEffectiveAddresses`). */
  bindMode: 'tailscale_lan',
  signalingPort: 18763,
  beaconEnabled: true,
  beaconIntervalMs: 2000,
  mdnsEnabled: false,
  friendlyName: 'Emory home',
  webrtcVideoPreferred: true,
}

export const REMOTE_INGEST_CONFIG_FILE = 'remote-ingest-config.json'

/** Well-known multicast group for LAN/tailnet discovery beacons. */
export const REMOTE_INGEST_MULTICAST_ADDRESS = '239.255.73.73'
export const REMOTE_INGEST_MULTICAST_PORT = 18673
