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
 * IPv4 addresses to show in Settings / copy-paste / beacon (order matters for UX).
 * - `tailscale_lan`: Tailscale 100.x first, then other non-loopback LAN NICs (same machine).
 * - `all`: all non-internal IPv4 (OS order).
 */
export function buildEffectiveAddresses(bindMode: RemoteIngestBindMode): string[] {
  const tailscale = listTailscaleIpv4()
  const allLan = listLanIpv4()

  if (bindMode === 'loopback') {
    return ['127.0.0.1']
  }
  if (bindMode === 'tailscale') {
    return tailscale.length > 0 ? tailscale : []
  }
  if (bindMode === 'tailscale_lan') {
    const tsSet = new Set(tailscale)
    const rest = allLan.filter((a) => !tsSet.has(a))
    const merged = [...tailscale, ...rest]
    return merged.length > 0 ? merged : ['127.0.0.1']
  }
  return allLan.length > 0 ? allLan : ['127.0.0.1']
}

/**
 * Host to pass to `server.listen()` for the HTTP ingest server.
 */
export function resolveListenHost(bindMode: RemoteIngestBindMode): {
  host: string | null
  error: string | null
} {
  if (bindMode === 'all' || bindMode === 'tailscale_lan') {
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
        'No Tailscale IPv4 (100.x) found. Install Tailscale and connect, or use Bind: Tailscale + LAN / All interfaces / Loopback.',
    }
  }
  return { host: ts[0]!, error: null }
}

export function buildTailscaleMagicDnsHint(): string | null {
  const host = os.hostname()
  if (!host || host.length === 0) return null
  return `${host}.ts.net`
}
