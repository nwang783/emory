import { useCallback, useEffect, useState } from 'react'
import { Copy, Loader2, Radio, Server } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type BindMode = 'all' | 'loopback' | 'tailscale'

type ConfigForm = {
  enabled: boolean
  bindMode: BindMode
  signalingPort: number
  beaconEnabled: boolean
  beaconIntervalMs: number
  mdnsEnabled: boolean
  friendlyName: string
}

type StatusPayload = {
  listening: boolean
  effectiveHost: string | null
  effectiveAddresses: string[]
  signalingPort: number
  beaconActive: boolean
  lastError: string | null
  instanceId: string
  tailscaleHint: string | null
}

const REMOTE_INGEST_FORM_DEFAULT: ConfigForm = {
  enabled: false,
  bindMode: 'tailscale',
  signalingPort: 18763,
  beaconEnabled: true,
  beaconIntervalMs: 2000,
  mdnsEnabled: false,
  friendlyName: 'Emory home',
}

export function RemoteIngestSettings(): React.JSX.Element {
  const [form, setForm] = useState<ConfigForm>(REMOTE_INGEST_FORM_DEFAULT)
  const [instanceId, setInstanceId] = useState<string>('')
  const [status, setStatus] = useState<StatusPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState(false)

  const refresh = useCallback(async () => {
    const api = window.emoryApi.remoteIngest
    const [cfg, st] = await Promise.all([api.getConfig(), api.getStatus()])
    setForm({
      enabled: cfg.config.enabled,
      bindMode: cfg.config.bindMode,
      signalingPort: cfg.config.signalingPort,
      beaconEnabled: cfg.config.beaconEnabled,
      beaconIntervalMs: cfg.config.beaconIntervalMs,
      mdnsEnabled: cfg.config.mdnsEnabled,
      friendlyName: cfg.config.friendlyName,
    })
    setInstanceId(cfg.instanceId)
    setStatus(st as StatusPayload)
  }, [])

  useEffect(() => {
    setLoading(true)
    void refresh()
      .catch(() => {
        toast.error('Could not load remote ingest settings')
      })
      .finally(() => setLoading(false))
  }, [refresh])

  const apply = useCallback(async () => {
    setApplying(true)
    try {
      const result = await window.emoryApi.remoteIngest.apply({
        enabled: form.enabled,
        bindMode: form.bindMode,
        signalingPort: form.signalingPort,
        beaconEnabled: form.beaconEnabled,
        beaconIntervalMs: form.beaconIntervalMs,
        mdnsEnabled: form.mdnsEnabled,
        friendlyName: form.friendlyName,
      })
      if (
        result &&
        typeof result === 'object' &&
        'success' in result &&
        result.success === true &&
        'status' in result &&
        'config' in result
      ) {
        setStatus(result.status as StatusPayload)
        setInstanceId(String((result.config as { instanceId: string }).instanceId))
        toast.success('Remote ingest server updated')
      } else if (result && typeof result === 'object' && 'success' in result && result.success === false) {
        toast.error('error' in result ? String((result as { error?: string }).error) : 'Apply failed')
      } else {
        toast.error('Apply failed')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setApplying(false)
    }
  }, [form])

  const copyLines = useCallback(async () => {
    if (!status) return
    const port = form.signalingPort
    const lines: string[] = [
      `Emory remote ingest`,
      `Instance: ${instanceId}`,
      `Signaling / health port: ${port}`,
      '',
      'Try these base URLs on your phone (same Tailscale network):',
    ]
    const addrs = status.effectiveAddresses.length > 0 ? status.effectiveAddresses : ['127.0.0.1']
    for (const a of addrs) {
      lines.push(`  http://${a}:${port}/health`)
    }
    lines.push('', 'Video ingest (WebSocket — same port):')
    for (const a of addrs) {
      lines.push(`  ws://${a}:${port}/ingest`)
    }
    lines.push('  Phone / glasses app: publisher (default). Desktop Camera: viewer (?role=viewer).')
    if (status.tailscaleHint) {
      lines.push('')
      lines.push(`MagicDNS-style hint (verify in Tailscale admin): ${status.tailscaleHint}`)
    }
    const text = lines.join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Connection details copied')
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }, [form.signalingPort, instanceId, status])

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Server className="h-4 w-4 opacity-70" />
            Remote ingest
          </CardTitle>
          <CardDescription className="text-xs">Loading…</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-xs">Loading configuration</span>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Server className="h-4 w-4 opacity-70" />
              Remote ingest
            </CardTitle>
            <CardDescription className="text-xs">
              Stream glasses video from your phone over Tailscale: HTTP <code className="font-mono-ui">/health</code>,
              WebSocket <code className="font-mono-ui">/ingest</code> (binary JPEG frames, same protocol as the bridge
              server). The desktop Camera tab can subscribe as a viewer when ingest is enabled and listening.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {status?.listening ? (
              <Badge variant="default" className="font-normal">
                Listening
              </Badge>
            ) : form.enabled ? (
              <Badge variant="secondary" className="font-normal text-amber-600 dark:text-amber-400">
                Enabled — not listening
              </Badge>
            ) : (
              <Badge variant="outline" className="font-normal">
                Off
              </Badge>
            )}
            {status?.beaconActive ? (
              <Badge variant="outline" className="gap-1 font-normal">
                <Radio className="h-3 w-3" />
                Beacon
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {status?.lastError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
            {status.lastError}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="remote-ingest-enabled" className="text-sm">
              Enable remote ingest server
            </Label>
            <p className="text-xs text-muted-foreground">
              Opens HTTP + WebSocket on the chosen port. May trigger a Windows Firewall prompt the first time you
              use &quot;All interfaces&quot;.
            </p>
          </div>
          <Switch
            id="remote-ingest-enabled"
            checked={form.enabled}
            onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="remote-ingest-bind" className="text-sm">
            Bind to
          </Label>
          <p className="text-xs text-muted-foreground">
            <strong>Tailscale only</strong> uses your 100.x address (recommended). <strong>All interfaces</strong>{' '}
            listens on every NIC — use with strict Tailscale ACLs.
          </p>
          <Select
            value={form.bindMode}
            onValueChange={(v: BindMode) => setForm((f) => ({ ...f, bindMode: v }))}
          >
            <SelectTrigger id="remote-ingest-bind" className="w-full max-w-md">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="tailscale">Tailscale (100.x) only</SelectItem>
              <SelectItem value="all">All interfaces (0.0.0.0)</SelectItem>
              <SelectItem value="loopback">Loopback (127.0.0.1) — local dev</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="remote-ingest-port" className="text-sm">
            Signaling / health port
          </Label>
          <p className="text-xs text-muted-foreground">TCP port range 1024–65535. Default 18763.</p>
          <Input
            id="remote-ingest-port"
            type="number"
            min={1024}
            max={65535}
            className="max-w-xs font-mono text-sm"
            value={form.signalingPort}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (Number.isFinite(n)) setForm((f) => ({ ...f, signalingPort: n }))
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="remote-ingest-name" className="text-sm">
            Friendly server name
          </Label>
          <p className="text-xs text-muted-foreground">Shown in phone discovery lists. Not used for security.</p>
          <Input
            id="remote-ingest-name"
            className="max-w-md text-sm"
            value={form.friendlyName}
            onChange={(e) => setForm((f) => ({ ...f, friendlyName: e.target.value }))}
            maxLength={80}
          />
        </div>

        <Separator />

        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label htmlFor="remote-ingest-beacon" className="text-sm">
              UDP discovery beacon
            </Label>
            <p className="text-xs text-muted-foreground">
              Multicast advertisement so the iPhone app can find this PC without typing an IP. See docs for
              protocol details.
            </p>
          </div>
          <Switch
            id="remote-ingest-beacon"
            checked={form.beaconEnabled}
            onCheckedChange={(beaconEnabled) => setForm((f) => ({ ...f, beaconEnabled }))}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Beacon interval</Label>
            <span className="text-xs font-mono text-muted-foreground">{form.beaconIntervalMs} ms</span>
          </div>
          <Slider
            value={[form.beaconIntervalMs]}
            onValueChange={([v]) => setForm((f) => ({ ...f, beaconIntervalMs: v }))}
            min={500}
            max={10_000}
            step={250}
            disabled={!form.beaconEnabled}
          />
        </div>

        <div className="flex items-center justify-between gap-4 opacity-60">
          <div className="space-y-0.5">
            <Label className="text-sm">LAN mDNS (Bonjour)</Label>
            <p className="text-xs text-muted-foreground">Planned — not available in this build.</p>
          </div>
          <Switch checked={form.mdnsEnabled} disabled aria-readonly />
        </div>

        <Separator />

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" onClick={() => void apply()} disabled={applying} className="gap-2">
            {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Apply &amp; restart server
          </Button>
          <Button type="button" variant="secondary" className="gap-2" onClick={() => void copyLines()}>
            <Copy className="h-3.5 w-3.5" />
            Copy connection details
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Instance ID: <span className="font-mono">{instanceId || '—'}</span>
        </p>
      </CardContent>
    </Card>
  )
}
