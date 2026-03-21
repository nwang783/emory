import http from 'node:http'
import dgram from 'node:dgram'
import type { RemoteIngestPersisted } from './remote-ingest-settings.service.js'
import {
  REMOTE_INGEST_MULTICAST_ADDRESS,
  REMOTE_INGEST_MULTICAST_PORT,
  type RemoteIngestStatus,
} from './remote-ingest.types.js'
import {
  buildTailscaleMagicDnsHint,
  listLanIpv4,
  listTailscaleIpv4,
  resolveListenHost,
} from './remote-ingest-network.js'

const SERVICE_VERSION = 1

export class RemoteIngestServerService {
  private httpServer: http.Server | null = null
  private beaconSocket: dgram.Socket | null = null
  private beaconTimer: ReturnType<typeof setInterval> | null = null
  private lastError: string | null = null

  getStatus(persisted: RemoteIngestPersisted): RemoteIngestStatus {
    const listening = this.httpServer !== null && this.httpServer.listening
    const tailscale = listTailscaleIpv4()
    const allLan = listLanIpv4()
    const { error: bindError } = resolveListenHost(persisted.bindMode)

    let effectiveAddresses: string[] = []
    if (persisted.bindMode === 'all') {
      effectiveAddresses = allLan.length > 0 ? allLan : ['127.0.0.1']
    } else if (persisted.bindMode === 'loopback') {
      effectiveAddresses = ['127.0.0.1']
    } else {
      effectiveAddresses = tailscale.length > 0 ? tailscale : []
    }

    const effectiveHost = effectiveAddresses[0] ?? null

    const configError =
      persisted.enabled && persisted.bindMode === 'tailscale' && tailscale.length === 0 ? bindError : null

    return {
      listening,
      effectiveHost,
      effectiveAddresses,
      signalingPort: persisted.signalingPort,
      beaconActive: this.beaconTimer !== null,
      lastError: this.lastError ?? configError,
      instanceId: persisted.instanceId,
      tailscaleHint: buildTailscaleMagicDnsHint(),
    }
  }

  async stop(): Promise<void> {
    this.stopBeacon()
    if (this.httpServer) {
      await new Promise<void>((resolve, reject) => {
        this.httpServer!.close((err) => {
          if (err) reject(err)
          else resolve()
        })
      }).catch(() => {})
      this.httpServer = null
    }
  }

  private stopBeacon(): void {
    if (this.beaconTimer) {
      clearInterval(this.beaconTimer)
      this.beaconTimer = null
    }
    if (this.beaconSocket) {
      try {
        this.beaconSocket.close()
      } catch {
        // ignore
      }
      this.beaconSocket = null
    }
  }

  /**
   * (Re)start HTTP listener and optional beacon from persisted config.
   */
  async apply(persisted: RemoteIngestPersisted): Promise<RemoteIngestStatus> {
    this.lastError = null
    await this.stop()

    if (!persisted.enabled) {
      return this.getStatus(persisted)
    }

    const { host, error } = resolveListenHost(persisted.bindMode)
    if (host === null) {
      this.lastError = error ?? 'Cannot resolve bind address'
      return this.getStatus(persisted)
    }

    const server = http.createServer((req, res) => {
      if (req.method === 'GET' && req.url?.split('?')[0] === '/health') {
        const body = JSON.stringify({
          ok: true,
          service: 'emory-ingest',
          protoVersion: SERVICE_VERSION,
          instanceId: persisted.instanceId,
          friendlyName: persisted.friendlyName,
          signalingPort: persisted.signalingPort,
        })
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
        })
        res.end(body)
        return
      }
      if (req.method === 'GET' && req.url?.split('?')[0] === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
        res.end('Emory remote ingest — use GET /health\n')
        return
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('Not found\n')
    })

    this.httpServer = server

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(persisted.signalingPort, host as string, () => {
        server.removeListener('error', reject)
        resolve()
      })
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err)
      this.lastError = message
      this.httpServer = null
      try {
        server.close()
      } catch {
        // ignore
      }
    })

    if (persisted.beaconEnabled && this.httpServer?.listening) {
      this.startBeacon(persisted, host)
    }

    return this.getStatus(persisted)
  }

  private startBeacon(persisted: RemoteIngestPersisted, boundHost: string): void {
    this.stopBeacon()
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    this.beaconSocket = socket

    const payload = (): string =>
      JSON.stringify({
        service: 'emory-ingest',
        protoVersion: SERVICE_VERSION,
        instanceId: persisted.instanceId,
        friendlyName: persisted.friendlyName,
        signalingPort: persisted.signalingPort,
        httpHealthPath: '/health',
        bindHostAdvertised: boundHost === '0.0.0.0' ? listTailscaleIpv4()[0] ?? listLanIpv4()[0] ?? '127.0.0.1' : boundHost,
      })

    socket.on('error', (err) => {
      console.warn('[RemoteIngest] Beacon socket error:', err.message)
    })

    try {
      socket.bind(0, () => {
        try {
          socket.setMulticastTTL(128)
        } catch {
          // ignore
        }
        const send = (): void => {
          const msg = Buffer.from(payload(), 'utf8')
          socket.send(
            msg,
            0,
            msg.length,
            REMOTE_INGEST_MULTICAST_PORT,
            REMOTE_INGEST_MULTICAST_ADDRESS,
            (err) => {
              if (err) {
                console.warn('[RemoteIngest] Beacon send failed:', err.message)
              }
            },
          )
        }
        send()
        this.beaconTimer = setInterval(send, persisted.beaconIntervalMs)
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.warn('[RemoteIngest] Beacon bind failed:', message)
      this.stopBeacon()
    }
  }
}
