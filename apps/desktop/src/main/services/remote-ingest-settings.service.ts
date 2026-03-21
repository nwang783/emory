import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  REMOTE_INGEST_CONFIG_FILE,
  REMOTE_INGEST_DEFAULT_CONFIG,
  type RemoteIngestConfig,
} from './remote-ingest.types.js'

export type RemoteIngestPersisted = RemoteIngestConfig & {
  instanceId: string
}

function clampPort(p: number): number {
  if (!Number.isFinite(p)) return REMOTE_INGEST_DEFAULT_CONFIG.signalingPort
  return Math.min(65535, Math.max(1024, Math.round(p)))
}

function normalizeConfig(raw: unknown): RemoteIngestPersisted {
  const base = { ...REMOTE_INGEST_DEFAULT_CONFIG, instanceId: randomUUID() }
  if (!raw || typeof raw !== 'object') {
    return base
  }
  const o = raw as Record<string, unknown>
  const bindMode =
    o.bindMode === 'all' || o.bindMode === 'loopback' || o.bindMode === 'tailscale'
      ? o.bindMode
      : REMOTE_INGEST_DEFAULT_CONFIG.bindMode
  let instanceId = typeof o.instanceId === 'string' && o.instanceId.length > 0 ? o.instanceId : base.instanceId
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : REMOTE_INGEST_DEFAULT_CONFIG.enabled,
    bindMode,
    signalingPort: clampPort(typeof o.signalingPort === 'number' ? o.signalingPort : REMOTE_INGEST_DEFAULT_CONFIG.signalingPort),
    beaconEnabled:
      typeof o.beaconEnabled === 'boolean' ? o.beaconEnabled : REMOTE_INGEST_DEFAULT_CONFIG.beaconEnabled,
    beaconIntervalMs:
      typeof o.beaconIntervalMs === 'number'
        ? Math.min(60_000, Math.max(500, Math.round(o.beaconIntervalMs)))
        : REMOTE_INGEST_DEFAULT_CONFIG.beaconIntervalMs,
    mdnsEnabled:
      typeof o.mdnsEnabled === 'boolean' ? o.mdnsEnabled : REMOTE_INGEST_DEFAULT_CONFIG.mdnsEnabled,
    friendlyName:
      typeof o.friendlyName === 'string' && o.friendlyName.trim().length > 0
        ? o.friendlyName.trim().slice(0, 80)
        : REMOTE_INGEST_DEFAULT_CONFIG.friendlyName,
    instanceId,
  }
}

export class RemoteIngestSettingsService {
  private persisted: RemoteIngestPersisted | null = null

  constructor(private readonly userDataPath: string) {}

  private configPath(): string {
    return path.join(this.userDataPath, REMOTE_INGEST_CONFIG_FILE)
  }

  async load(): Promise<RemoteIngestPersisted> {
    if (this.persisted) return this.persisted
    try {
      const text = await readFile(this.configPath(), 'utf8')
      const parsed = JSON.parse(text) as unknown
      this.persisted = normalizeConfig(parsed)
    } catch {
      this.persisted = normalizeConfig(null)
    }
    return this.persisted
  }

  getSync(): RemoteIngestPersisted | null {
    return this.persisted
  }

  /**
   * Merge partial UI config; keeps instanceId unless this is first save.
   */
  async save(partial: Partial<RemoteIngestConfig>): Promise<RemoteIngestPersisted> {
    const current = await this.load()
    const next: RemoteIngestPersisted = {
      ...current,
      ...partial,
      instanceId: current.instanceId,
    }
    if (typeof partial.signalingPort === 'number') {
      next.signalingPort = clampPort(partial.signalingPort)
    }
    if (typeof partial.beaconIntervalMs === 'number') {
      next.beaconIntervalMs = Math.min(60_000, Math.max(500, Math.round(partial.beaconIntervalMs)))
    }
    if (typeof partial.friendlyName === 'string') {
      const t = partial.friendlyName.trim()
      next.friendlyName = t.length > 0 ? t.slice(0, 80) : REMOTE_INGEST_DEFAULT_CONFIG.friendlyName
    }
    await writeFile(this.configPath(), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    this.persisted = next
    return next
  }
}
