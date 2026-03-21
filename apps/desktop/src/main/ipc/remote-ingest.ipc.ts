import { BrowserWindow, ipcMain } from 'electron'
import type { RemoteIngestSettingsService } from '../services/remote-ingest-settings.service.js'
import type { RemoteIngestServerService } from '../services/remote-ingest-server.service.js'
import type { RemoteIngestPersisted } from '../services/remote-ingest-settings.service.js'
import type { RemoteIngestConfig, RemoteIngestStatus } from '../services/remote-ingest.types.js'

function broadcastRemoteIngestUpdated(persisted: RemoteIngestPersisted, status: RemoteIngestStatus): void {
  const { instanceId, ...config } = persisted
  const payload = { config, instanceId, status }
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('remote-ingest:updated', payload)
  }
}

function isBindMode(v: unknown): v is RemoteIngestConfig['bindMode'] {
  return v === 'all' || v === 'loopback' || v === 'tailscale'
}

export function registerRemoteIngestIpc(
  settings: RemoteIngestSettingsService,
  server: RemoteIngestServerService,
): void {
  ipcMain.handle('remote-ingest:get-config', async () => {
    const p = await settings.load()
    const { instanceId, ...config } = p
    return { config, instanceId }
  })

  ipcMain.handle('remote-ingest:get-status', async () => {
    const p = await settings.load()
    return server.getStatus(p)
  })

  ipcMain.handle('remote-ingest:apply', async (_event, payload: unknown) => {
    if (!payload || typeof payload !== 'object') {
      return { success: false as const, error: 'Invalid payload' }
    }
    const o = payload as Record<string, unknown>
    const patch: Partial<RemoteIngestConfig> = {}
    if (typeof o.enabled === 'boolean') patch.enabled = o.enabled
    if (isBindMode(o.bindMode)) patch.bindMode = o.bindMode
    if (typeof o.signalingPort === 'number') patch.signalingPort = o.signalingPort
    if (typeof o.beaconEnabled === 'boolean') patch.beaconEnabled = o.beaconEnabled
    if (typeof o.beaconIntervalMs === 'number') patch.beaconIntervalMs = o.beaconIntervalMs
    if (typeof o.mdnsEnabled === 'boolean') patch.mdnsEnabled = o.mdnsEnabled
    if (typeof o.friendlyName === 'string') patch.friendlyName = o.friendlyName
    if (typeof o.webrtcVideoPreferred === 'boolean') patch.webrtcVideoPreferred = o.webrtcVideoPreferred

    try {
      const next = await settings.save(patch)
      const status = await server.apply(next)
      broadcastRemoteIngestUpdated(next, status)
      return {
        success: true as const,
        config: {
          enabled: next.enabled,
          bindMode: next.bindMode,
          signalingPort: next.signalingPort,
          beaconEnabled: next.beaconEnabled,
          beaconIntervalMs: next.beaconIntervalMs,
          mdnsEnabled: next.mdnsEnabled,
          friendlyName: next.friendlyName,
          webrtcVideoPreferred: next.webrtcVideoPreferred,
          instanceId: next.instanceId,
        },
        status,
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { success: false as const, error: message }
    }
  })
}
