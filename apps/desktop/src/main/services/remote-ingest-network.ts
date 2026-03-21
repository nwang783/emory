import os from 'node:os'
import type { RemoteIngestBindMode } from './remote-ingest.types.js'

/**
 * IPv4 addresses for UI hints. Tailscale interfaces typically use 100.64.0.0/10.
 */
export function listLanIpv4(): string[] {
  const out: string[] = []
  const ifaces = os.networkInterfaces()
  for (const infos of Object.values(ifaces)) {
    if (!infos) continue
    for (const info of infos) {
      if (info.family !== 'IPv4' || info.internal) continue
      out.push(info.address)
    }
  }
  return [...new Set(out)]
}

export function listTailscaleIpv4(): string[] {
  return listLanIpv4().filter((a) => a.startsWith('100.'))
}

/**
 * Host to pass to `server.listen()` for the HTTP ingest server.
 */
export function resolveListenHost(bindMode: RemoteIngestBindMode): {
  host: string | null
  error: string | null
} {
  if (bindMode === 'all') {
    return { host: '0.0.0.0', error: null }
  }
  if (bindMode === 'loopback') {
    return { host: '127.0.0.1', error: null }
  }
  const ts = listTailscaleIpv4()
  if (ts.length === 0) {
    return {
      host: null,
      error:
        'No Tailscale IPv4 (100.x) found. Install Tailscale and connect, or use Bind: All interfaces / Loopback.',
    }
  }
  return { host: ts[0]!, error: null }
}

export function buildTailscaleMagicDnsHint(): string | null {
  const host = os.hostname()
  if (!host || host.length === 0) return null
  return `${host}.ts.net`
}
