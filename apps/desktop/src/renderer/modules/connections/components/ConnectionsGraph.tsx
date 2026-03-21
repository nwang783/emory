import { useState, useEffect, useRef, useCallback } from 'react'
import { Plus, Network as NetworkIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useSettingsStore } from '@/shared/stores/settings.store'
import {
  MiniSidebarPanel,
  PageFill,
  PageHeader,
  PageShell,
  PageWorkspace,
} from '@/shared/components/PageLayout'
import { reachablePersonIdsFrom } from '../lib/ego-subgraph'

type PersonNode = {
  id: string
  name: string
  relationship: string | null
  isSelf: boolean
  x: number
  y: number
  vx: number
  vy: number
  connectionCount: number
}

type RelationshipEdge = {
  id: string
  sourceId: string
  targetId: string
  type: string
  personAName: string
  personBName: string
  notes: string | null
}

const TYPE_COLOURS: Record<string, string> = {
  spouse: '#f43f5e',
  child: '#fb923c',
  parent: '#a78bfa',
  sibling: '#34d399',
  friend: '#60a5fa',
  carer: '#fbbf24',
  neighbour: '#94a3b8',
  colleague: '#818cf8',
  other: '#6b7280',
}

const RELATIONSHIP_TYPES = [
  'spouse', 'child', 'parent', 'sibling', 'friend',
  'carer', 'neighbour', 'colleague', 'other',
] as const

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function getCategoryColour(relationship: string | null): string {
  if (!relationship) return '#6b7280'
  const lower = relationship.toLowerCase()
  if (['wife', 'husband', 'spouse', 'partner'].some((r) => lower.includes(r))) return '#f43f5e'
  if (['son', 'daughter', 'child', 'parent', 'mother', 'father', 'mum', 'dad'].some((r) => lower.includes(r))) return '#fb923c'
  if (['brother', 'sister', 'sibling'].some((r) => lower.includes(r))) return '#34d399'
  if (['friend'].some((r) => lower.includes(r))) return '#60a5fa'
  if (['carer', 'nurse', 'doctor'].some((r) => lower.includes(r))) return '#fbbf24'
  return '#94a3b8'
}

export function ConnectionsGraph(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const nodesRef = useRef<PersonNode[]>([])
  const edgesRef = useRef<RelationshipEdge[]>([])
  const rafRef = useRef<number | null>(null)
  const dragNodeRef = useRef<PersonNode | null>(null)
  const hoveredNodeRef = useRef<PersonNode | null>(null)
  const offsetRef = useRef({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const isPanningRef = useRef(false)
  const panStartRef = useRef({ x: 0, y: 0 })

  const [initialLoading, setInitialLoading] = useState(true)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([])
  const [addForm, setAddForm] = useState({ personAId: '', personBId: '', type: 'friend', notes: '' })
  const [nodeCount, setNodeCount] = useState(0)
  const [edgeCount, setEdgeCount] = useState(0)
  const [selfPersonId, setSelfPersonId] = useState<string | null>(null)
  const [needsSelfSetup, setNeedsSelfSetup] = useState(false)
  const [hasPeopleInDirectory, setHasPeopleInDirectory] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [peopleData, relData, selfRow] = await Promise.all([
        window.emoryApi.db.people.findAll(),
        window.emoryApi.db.relationships.getAll(),
        window.emoryApi.db.people.getSelf(),
      ])

      const ppl = peopleData as Array<{ id: string; name: string; relationship: string | null }>
      const rels = relData as Array<{
        id: string; personAId: string; personBId: string
        relationshipType: string; personAName: string; personBName: string; notes: string | null
      }>

      const directory = ppl.map((p) => ({ id: p.id, name: p.name }))
      setPeople(directory)
      setHasPeopleInDirectory(ppl.length > 0)

      if (ppl.length === 0) {
        nodesRef.current = []
        edgesRef.current = []
        setNodeCount(0)
        setEdgeCount(0)
        setSelfPersonId(null)
        setNeedsSelfSetup(false)
        return
      }

      const self = selfRow as { id: string } | null
      if (!self) {
        nodesRef.current = []
        edgesRef.current = []
        setNodeCount(0)
        setEdgeCount(0)
        setSelfPersonId(null)
        setNeedsSelfSetup(true)
        return
      }

      setNeedsSelfSetup(false)
      setSelfPersonId(self.id)

      const visibleIds = reachablePersonIdsFrom(
        self.id,
        rels.map((r) => ({ personAId: r.personAId, personBId: r.personBId })),
      )

      const visiblePpl = ppl.filter((p) => visibleIds.has(p.id))

      const connectionCounts = new Map<string, number>()
      for (const rel of rels) {
        if (!visibleIds.has(rel.personAId) || !visibleIds.has(rel.personBId)) continue
        connectionCounts.set(rel.personAId, (connectionCounts.get(rel.personAId) ?? 0) + 1)
        connectionCounts.set(rel.personBId, (connectionCounts.get(rel.personBId) ?? 0) + 1)
      }

      const container = containerRef.current
      const cx = container ? container.clientWidth / 2 : 400
      const cy = container ? container.clientHeight / 2 : 300

      const existingPositions = new Map(
        nodesRef.current.map((n) => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]),
      )

      const nonSelfVisible = visiblePpl.filter((p) => p.id !== self.id)

      const nodes: PersonNode[] = visiblePpl.map((p) => {
        const prev = existingPositions.get(p.id)
        const isSelfNode = p.id === self.id
        if (prev) {
          return {
            id: p.id,
            name: p.name,
            relationship: p.relationship,
            isSelf: isSelfNode,
            x: prev.x,
            y: prev.y,
            vx: prev.vx,
            vy: prev.vy,
            connectionCount: connectionCounts.get(p.id) ?? 0,
          }
        }
        if (isSelfNode) {
          return {
            id: p.id,
            name: p.name,
            relationship: p.relationship,
            isSelf: true,
            x: cx,
            y: cy,
            vx: 0,
            vy: 0,
            connectionCount: connectionCounts.get(p.id) ?? 0,
          }
        }
        const idx = nonSelfVisible.findIndex((x) => x.id === p.id)
        const ring = 160
        const angle = (2 * Math.PI * Math.max(idx, 0)) / Math.max(nonSelfVisible.length, 1)
        return {
          id: p.id,
          name: p.name,
          relationship: p.relationship,
          isSelf: false,
          x: cx + Math.cos(angle) * ring,
          y: cy + Math.sin(angle) * ring,
          vx: 0,
          vy: 0,
          connectionCount: connectionCounts.get(p.id) ?? 0,
        }
      })

      const edges: RelationshipEdge[] = rels
        .filter((r) => visibleIds.has(r.personAId) && visibleIds.has(r.personBId))
        .map((r) => ({
          id: r.id,
          sourceId: r.personAId,
          targetId: r.personBId,
          type: r.relationshipType,
          personAName: r.personAName,
          personBName: r.personBName,
          notes: r.notes,
        }))

      nodesRef.current = nodes
      edgesRef.current = edges
      setNodeCount(nodes.length)
      setEdgeCount(edges.length)
    } catch {
      toast.error('Failed to load connections')
    } finally {
      setInitialLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (showAddDialog && selfPersonId) {
      setAddForm((f) => ({
        ...f,
        personAId: selfPersonId,
        personBId: f.personBId === selfPersonId ? '' : f.personBId,
      }))
    }
  }, [showAddDialog, selfPersonId])

  const simulate = useCallback(() => {
    const nodes = nodesRef.current
    const edges = edgesRef.current
    if (nodes.length === 0) return

    const container = containerRef.current
    const centerX = container ? container.clientWidth / 2 : 400
    const centerY = container ? container.clientHeight / 2 : 300

    const REPULSION = 8000
    const SPRING_K = 0.005
    const IDEAL_LENGTH = 180
    const DAMPING = 0.85

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      if (a === dragNodeRef.current) continue

      if (a.isSelf) {
        a.x = centerX
        a.y = centerY
        a.vx = 0
        a.vy = 0
        continue
      }

      let fx = 0
      let fy = 0

      for (let j = 0; j < nodes.length; j++) {
        if (i === j) continue
        const b = nodes[j]
        const dx = a.x - b.x
        const dy = a.y - b.y
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const force = REPULSION / (dist * dist)
        fx += (dx / dist) * force
        fy += (dy / dist) * force
      }

      for (const edge of edges) {
        let other: PersonNode | null = null
        if (edge.sourceId === a.id) other = nodes.find((n) => n.id === edge.targetId) ?? null
        else if (edge.targetId === a.id) other = nodes.find((n) => n.id === edge.sourceId) ?? null
        if (!other) continue

        const dx = other.x - a.x
        const dy = other.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const displacement = dist - IDEAL_LENGTH
        fx += dx * SPRING_K * displacement
        fy += dy * SPRING_K * displacement
      }

      a.vx = (a.vx + fx) * DAMPING
      a.vy = (a.vy + fy) * DAMPING
      a.x += a.vx
      a.y += a.vy
    }
  }, [])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const container = containerRef.current
    if (container) {
      const dpr = window.devicePixelRatio || 1
      const cw = container.clientWidth
      const ch = container.clientHeight
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr
        canvas.height = ch * dpr
        canvas.style.width = `${cw}px`
        canvas.style.height = `${ch}px`
      }
    }

    const dpr = window.devicePixelRatio || 1
    ctx.setTransform(dpr, 0, 0, dpr, panRef.current.x * dpr, panRef.current.y * dpr)
    ctx.scale(scaleRef.current, scaleRef.current)
    ctx.clearRect(-10000, -10000, 20000, 20000)

    const nodes = nodesRef.current
    const edges = edgesRef.current
    const hovered = hoveredNodeRef.current

    for (const edge of edges) {
      const src = nodes.find((n) => n.id === edge.sourceId)
      const tgt = nodes.find((n) => n.id === edge.targetId)
      if (!src || !tgt) continue

      const isHighlighted = hovered && (hovered.id === src.id || hovered.id === tgt.id)
      const dimmed = hovered && !isHighlighted

      ctx.beginPath()
      ctx.moveTo(src.x, src.y)
      ctx.lineTo(tgt.x, tgt.y)
      ctx.strokeStyle = TYPE_COLOURS[edge.type] ?? '#6b7280'
      ctx.lineWidth = isHighlighted ? 3 : 1.5
      ctx.globalAlpha = dimmed ? 0.1 : isHighlighted ? 1 : 0.6
      ctx.stroke()

      const mx = (src.x + tgt.x) / 2
      const my = (src.y + tgt.y) / 2
      ctx.font = '10px system-ui, sans-serif'
      ctx.fillStyle = TYPE_COLOURS[edge.type] ?? '#6b7280'
      ctx.globalAlpha = dimmed ? 0.05 : isHighlighted ? 0.9 : 0.5
      ctx.textAlign = 'center'
      ctx.fillText(edge.type, mx, my - 4)
    }

    for (const node of nodes) {
      const isHovered = hovered?.id === node.id
      const isConnected = hovered && edges.some(
        (e) => (e.sourceId === hovered.id && e.targetId === node.id) ||
               (e.targetId === hovered.id && e.sourceId === node.id),
      )
      const dimmed = hovered && !isHovered && !isConnected

      const baseRadius = 20 + Math.min(node.connectionCount * 4, 16)
      const radius = isHovered ? baseRadius + 3 : baseRadius
      const colour = getCategoryColour(node.relationship)

      ctx.globalAlpha = dimmed ? 0.15 : 1

      ctx.beginPath()
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
      ctx.fillStyle = colour
      ctx.globalAlpha = (dimmed ? 0.15 : 1) * 0.2
      ctx.fill()
      ctx.strokeStyle = colour
      ctx.lineWidth = isHovered ? 3 : 2
      ctx.globalAlpha = dimmed ? 0.15 : 1
      ctx.stroke()

      if (node.isSelf) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2)
        ctx.strokeStyle = '#94a3b8'
        ctx.lineWidth = 2
        ctx.globalAlpha = dimmed ? 0.12 : 0.85
        ctx.stroke()
      }

      ctx.font = `bold ${radius > 28 ? 14 : 12}px system-ui, sans-serif`
      ctx.fillStyle = colour
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(getInitials(node.name), node.x, node.y)

      ctx.font = '11px system-ui, sans-serif'
      ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.85)'
      ctx.fillText(node.name, node.x, node.y + radius + 14)

      let subline = 26
      ctx.font = '9px system-ui, sans-serif'
      if (node.isSelf) {
        ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.55)'
        ctx.fillText('You', node.x, node.y + radius + subline)
        subline += 12
      }
      if (node.relationship) {
        ctx.fillStyle = dimmed ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.5)'
        ctx.fillText(node.relationship, node.x, node.y + radius + subline)
      }
    }

    ctx.globalAlpha = 1
  }, [])

  const animationLoop = useCallback(() => {
    simulate()
    draw()
    rafRef.current = requestAnimationFrame(animationLoop)
  }, [simulate, draw])

  useEffect(() => {
    if (initialLoading) return
    rafRef.current = requestAnimationFrame(animationLoop)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [initialLoading, animationLoop])

  function findNodeAt(clientX: number, clientY: number): PersonNode | null {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const x = (clientX - rect.left - panRef.current.x) / scaleRef.current
    const y = (clientY - rect.top - panRef.current.y) / scaleRef.current

    for (const node of nodesRef.current) {
      const radius = 20 + Math.min(node.connectionCount * 4, 16)
      const dx = node.x - x
      const dy = node.y - y
      if (dx * dx + dy * dy < radius * radius) return node
    }
    return null
  }

  function handleMouseDown(e: React.MouseEvent): void {
    const node = findNodeAt(e.clientX, e.clientY)
    if (node?.isSelf) {
      isPanningRef.current = true
      panStartRef.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y }
      return
    }
    if (node) {
      dragNodeRef.current = node
      const rect = canvasRef.current!.getBoundingClientRect()
      offsetRef.current = {
        x: (e.clientX - rect.left - panRef.current.x) / scaleRef.current - node.x,
        y: (e.clientY - rect.top - panRef.current.y) / scaleRef.current - node.y,
      }
    } else {
      isPanningRef.current = true
      panStartRef.current = { x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y }
    }
  }

  function handleMouseMove(e: React.MouseEvent): void {
    if (dragNodeRef.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect()
      dragNodeRef.current.x = (e.clientX - rect.left - panRef.current.x) / scaleRef.current - offsetRef.current.x
      dragNodeRef.current.y = (e.clientY - rect.top - panRef.current.y) / scaleRef.current - offsetRef.current.y
      dragNodeRef.current.vx = 0
      dragNodeRef.current.vy = 0
    } else if (isPanningRef.current) {
      panRef.current = { x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y }
    } else {
      hoveredNodeRef.current = findNodeAt(e.clientX, e.clientY)
    }
  }

  function handleMouseUp(): void {
    dragNodeRef.current = null
    isPanningRef.current = false
  }

  function handleWheel(e: React.WheelEvent): void {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    scaleRef.current = Math.max(0.3, Math.min(3, scaleRef.current * delta))
  }

  async function handleAddRelationship(): Promise<void> {
    const personAId = selfPersonId ?? addForm.personAId
    if (!personAId || !addForm.personBId || personAId === addForm.personBId) {
      toast.error('Select two different people')
      return
    }
    try {
      await window.emoryApi.db.relationships.create(
        personAId,
        addForm.personBId,
        addForm.type,
        addForm.notes || undefined,
      )
      toast.success('Relationship added')
      setShowAddDialog(false)
      setAddForm({
        personAId: selfPersonId ?? '',
        personBId: '',
        type: 'friend',
        notes: '',
      })
      await loadData()
    } catch (err) {
      toast.error('Failed to add relationship', {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  if (initialLoading) {
    return (
      <PageShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 py-12">
          <Skeleton className="h-64 w-64 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
      </PageShell>
    )
  }

  if (!hasPeopleInDirectory) {
    return (
      <PageShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <NetworkIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">No people yet</p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              Add people from the Camera or People tab to build a connection map.
            </p>
          </div>
        </div>
      </PageShell>
    )
  }

  if (needsSelfSetup) {
    return (
      <PageShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <NetworkIcon className="h-8 w-8 text-muted-foreground" />
          </div>
          <div className="max-w-md space-y-2">
            <p className="text-sm font-medium text-foreground">Mark who is you</p>
            <p className="text-xs text-muted-foreground">
              In People, edit your profile and enable{' '}
              <span className="font-medium text-foreground">This is me</span>. The graph is built from you outward.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              useSettingsStore.getState().setActiveTab('people')
            }}
          >
            Open People
          </Button>
        </div>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <PageHeader
        title="Connections"
        description={`${nodeCount} people · ${edgeCount} ${edgeCount === 1 ? 'link' : 'links'}`}
        actions={
          <Button size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4" />
            Add relationship
          </Button>
        }
      />

      <PageWorkspace
        miniSidebar={
          <MiniSidebarPanel label="Legend" position="end">
            <div className="flex flex-col gap-1.5">
              {Object.entries(TYPE_COLOURS).map(([type, colour]) => (
                <Badge
                  key={type}
                  variant="outline"
                  className="justify-start gap-2 py-1 text-[10px] font-normal"
                >
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colour }}
                  />
                  <span className="truncate">{type}</span>
                </Badge>
              ))}
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              Drag nodes to arrange. Scroll to zoom. Drag the canvas to pan.
            </p>
          </MiniSidebarPanel>
        }
      >
        <PageFill>
          <div ref={containerRef} className="relative h-full w-full">
            <canvas
              ref={canvasRef}
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            />
          </div>
        </PageFill>
      </PageWorkspace>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Relationship</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            {selfPersonId ? (
              <div className="grid gap-2">
                <Label>You</Label>
                <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
                  {people.find((p) => p.id === selfPersonId)?.name ?? 'You'}
                </p>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>Person A</Label>
                <Select value={addForm.personAId} onValueChange={(v) => setAddForm({ ...addForm, personAId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                  <SelectContent>
                    {people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label>{selfPersonId ? 'Connected person' : 'Person B'}</Label>
              <Select value={addForm.personBId} onValueChange={(v) => setAddForm({ ...addForm, personBId: v })}>
                <SelectTrigger><SelectValue placeholder="Select person" /></SelectTrigger>
                <SelectContent>
                  {people.filter((p) => p.id !== (selfPersonId ?? addForm.personAId)).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Relationship Type</Label>
              <Select value={addForm.type} onValueChange={(v) => setAddForm({ ...addForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RELATIONSHIP_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Input
                value={addForm.notes}
                onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                placeholder="Any notes about this relationship"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button onClick={handleAddRelationship}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  )
}
