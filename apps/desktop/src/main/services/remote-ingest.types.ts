/** Bind address policy for the remote ingest HTTP listener. */
export type RemoteIngestBindMode = 'all' | 'loopback' | 'tailscale'

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
}

/** Runtime status returned to the renderer. */
export type RemoteIngestStatus = {
  listening: boolean
  /** Primary address string for display (e.g. first tailnet or loopback). */
  effectiveHost: string | null
  /** IPv4 candidates the phone may use (100.x, LAN, loopback). */
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
  bindMode: 'tailscale',
  signalingPort: 18763,
  beaconEnabled: true,
  beaconIntervalMs: 2000,
  mdnsEnabled: false,
  friendlyName: 'Emory home',
}

export const REMOTE_INGEST_CONFIG_FILE = 'remote-ingest-config.json'

/** Well-known multicast group for LAN/tailnet discovery beacons. */
export const REMOTE_INGEST_MULTICAST_ADDRESS = '239.255.73.73'
export const REMOTE_INGEST_MULTICAST_PORT = 18673
