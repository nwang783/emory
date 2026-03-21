import { useState, useEffect, useCallback } from 'react'
import {
  Trash2,
  ArrowRightLeft,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronRight,
  ImageOff,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type EmbeddingMeta = {
  id: string
  personId: string
  source: 'photo_upload' | 'live_capture' | 'auto_learn'
  thumbnail: string | null
  qualityScore: number | null
  createdAt: string
}

type EmbeddingGroup = {
  personId: string
  personName: string
  embeddings: EmbeddingMeta[]
}

type PersonOption = {
  id: string
  name: string
}

const SOURCE_LABELS: Record<string, string> = {
  photo_upload: 'Upload',
  live_capture: 'Manual',
  auto_learn: 'Auto',
}

const SOURCE_COLOURS: Record<string, string> = {
  photo_upload: 'bg-purple-500/10 text-purple-400',
  live_capture: 'bg-green-500/10 text-green-400',
  auto_learn: 'bg-blue-500/10 text-blue-400',
}

function ThumbnailImage({ thumbnail }: { thumbnail: string | null }): React.JSX.Element {
  if (!thumbnail) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <ImageOff className="h-6 w-6 text-muted-foreground/40" />
      </div>
    )
  }
  return (
    <img
      src={`data:image/jpeg;base64,${thumbnail}`}
      alt="Face crop"
      className="h-full w-full object-cover"
      draggable={false}
    />
  )
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function EmbeddingGallery(): React.JSX.Element {
  const [groups, setGroups] = useState<EmbeddingGroup[]>([])
  const [people, setPeople] = useState<PersonOption[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filterSource, setFilterSource] = useState<string>('all')

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    action: 'delete' | 'reassign'
    ids: string[]
    targetPersonId?: string
  }>({ open: false, action: 'delete', ids: [] })

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [groupedData, peopleData] = await Promise.all([
        window.emoryApi.db.embeddings.getAllGrouped(),
        window.emoryApi.db.people.findAll(),
      ])
      setGroups(groupedData as EmbeddingGroup[])
      setPeople((peopleData as PersonOption[]).map((p) => ({ id: p.id, name: p.name })))
      setExpandedGroups(new Set((groupedData as EmbeddingGroup[]).map((g) => g.personId)))
    } catch {
      toast.error('Failed to load embeddings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  function toggleGroup(personId: string): void {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }

  function toggleSelect(embeddingId: string): void {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(embeddingId)) next.delete(embeddingId)
      else next.add(embeddingId)
      return next
    })
  }

  function selectAllInGroup(group: EmbeddingGroup): void {
    const filtered = getFilteredEmbeddings(group.embeddings)
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const allSelected = filtered.every((e) => next.has(e.id))
      if (allSelected) {
        for (const e of filtered) next.delete(e.id)
      } else {
        for (const e of filtered) next.add(e.id)
      }
      return next
    })
  }

  function getFilteredEmbeddings(embeddings: EmbeddingMeta[]): EmbeddingMeta[] {
    if (filterSource === 'all') return embeddings
    return embeddings.filter((e) => e.source === filterSource)
  }

  async function handleDelete(ids: string[]): Promise<void> {
    try {
      for (const id of ids) {
        await window.emoryApi.db.embeddings.delete(id)
      }
      toast.success(`Deleted ${ids.length} embedding${ids.length > 1 ? 's' : ''}`)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        for (const id of ids) next.delete(id)
        return next
      })
      await loadData()
    } catch {
      toast.error('Failed to delete embeddings')
    }
  }

  async function handleReassign(ids: string[], targetPersonId: string): Promise<void> {
    try {
      for (const id of ids) {
        await window.emoryApi.db.embeddings.reassign(id, targetPersonId)
      }
      const targetName = people.find((p) => p.id === targetPersonId)?.name ?? 'Unknown'
      toast.success(`Reassigned ${ids.length} embedding${ids.length > 1 ? 's' : ''} to ${targetName}`)
      setSelectedIds(new Set())
      await loadData()
    } catch {
      toast.error('Failed to reassign embeddings')
    }
  }

  const totalEmbeddings = groups.reduce((sum, g) => sum + g.embeddings.length, 0)
  const selectedCount = selectedIds.size

  return (
    <section className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Face Embeddings</h2>
          <p className="text-xs text-muted-foreground">
            {totalEmbeddings} embedding{totalEmbeddings !== 1 ? 's' : ''} across{' '}
            {groups.length} {groups.length === 1 ? 'person' : 'people'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterSource} onValueChange={setFilterSource}>
            <SelectTrigger className="h-8 w-[120px] text-xs">
              <SelectValue placeholder="Filter" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              <SelectItem value="photo_upload">Upload</SelectItem>
              <SelectItem value="live_capture">Manual</SelectItem>
              <SelectItem value="auto_learn">Auto</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedCount > 0 && (
        <div className="flex items-center gap-2 border-y border-border bg-muted/50 px-6 py-2">
          <span className="text-xs font-medium">{selectedCount} selected</span>
          <Button
            size="sm"
            variant="destructive"
            className="h-7 text-xs"
            onClick={() => setConfirmDialog({ open: true, action: 'delete', ids: Array.from(selectedIds) })}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Delete
          </Button>
          <Select
            onValueChange={(personId) =>
              setConfirmDialog({ open: true, action: 'reassign', ids: Array.from(selectedIds), targetPersonId: personId })
            }
          >
            <SelectTrigger className="h-7 w-[160px] text-xs">
              <ArrowRightLeft className="mr-1 h-3 w-3" />
              <SelectValue placeholder="Reassign to..." />
            </SelectTrigger>
            <SelectContent>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <Separator />

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 px-6 py-4">
          {loading &&
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-border p-4">
                <Skeleton className="mb-3 h-5 w-32" />
                <div className="flex gap-2">
                  {Array.from({ length: 4 }).map((__, j) => (
                    <Skeleton key={j} className="h-24 w-24 rounded" />
                  ))}
                </div>
              </div>
            ))}

          {!loading && groups.length === 0 && (
            <div className="py-16 text-center">
              <ImageOff className="mx-auto h-12 w-12 text-muted-foreground/30" />
              <p className="mt-3 text-sm text-muted-foreground">No face embeddings yet</p>
              <p className="text-xs text-muted-foreground">Register a face from the Camera tab to get started</p>
            </div>
          )}

          {!loading &&
            groups.map((group) => {
              const filtered = getFilteredEmbeddings(group.embeddings)
              if (filtered.length === 0) return null
              const isExpanded = expandedGroups.has(group.personId)

              return (
                <div key={group.personId} className="rounded-lg border border-border">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-muted/50"
                    onClick={() => toggleGroup(group.personId)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="font-medium text-sm">{group.personName}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {filtered.length}
                    </Badge>
                    <div className="flex-1" />
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px]"
                      onClick={(e) => {
                        e.stopPropagation()
                        selectAllInGroup(group)
                      }}
                    >
                      {filtered.every((e) => selectedIds.has(e.id)) ? (
                        <><CheckSquare className="mr-1 h-3 w-3" /> Deselect All</>
                      ) : (
                        <><Square className="mr-1 h-3 w-3" /> Select All</>
                      )}
                    </Button>
                  </button>

                  {isExpanded && (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2 border-t border-border px-4 py-3">
                      {filtered.map((emb) => {
                        const isSelected = selectedIds.has(emb.id)
                        return (
                          <div
                            key={emb.id}
                            className={`group relative cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${
                              isSelected ? 'border-primary ring-1 ring-primary' : 'border-transparent hover:border-border'
                            }`}
                            onClick={() => toggleSelect(emb.id)}
                          >
                            <div className="aspect-square">
                              <ThumbnailImage thumbnail={emb.thumbnail} />
                            </div>
                            <div className="absolute top-1 right-1">
                              <Badge
                                variant="secondary"
                                className={`text-[9px] px-1 py-0 ${SOURCE_COLOURS[emb.source] ?? ''}`}
                              >
                                {SOURCE_LABELS[emb.source] ?? emb.source}
                              </Badge>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1.5 py-1">
                              <p className="truncate text-[9px] text-white/80">
                                {formatDate(emb.createdAt)}
                              </p>
                              {emb.qualityScore != null && (
                                <p className="text-[8px] text-white/50">
                                  Q: {(emb.qualityScore * 100).toFixed(0)}%
                                </p>
                              )}
                            </div>

                            {isSelected && (
                              <div className="absolute top-1 left-1">
                                <CheckSquare className="h-4 w-4 text-primary" />
                              </div>
                            )}

                            <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                size="sm"
                                variant="destructive"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setConfirmDialog({ open: true, action: 'delete', ids: [emb.id] })
                                }}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </ScrollArea>

      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open) setConfirmDialog({ open: false, action: 'delete', ids: [] })
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmDialog.action === 'delete' ? 'Delete Embeddings' : 'Reassign Embeddings'}
            </DialogTitle>
            <DialogDescription>
              {confirmDialog.action === 'delete'
                ? `Are you sure you want to delete ${confirmDialog.ids.length} embedding${confirmDialog.ids.length > 1 ? 's' : ''}? This cannot be undone.`
                : `Move ${confirmDialog.ids.length} embedding${confirmDialog.ids.length > 1 ? 's' : ''} to ${people.find((p) => p.id === confirmDialog.targetPersonId)?.name ?? 'the selected person'}?`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog({ open: false, action: 'delete', ids: [] })}>
              Cancel
            </Button>
            <Button
              variant={confirmDialog.action === 'delete' ? 'destructive' : 'default'}
              onClick={async () => {
                if (confirmDialog.action === 'delete') {
                  await handleDelete(confirmDialog.ids)
                } else if (confirmDialog.targetPersonId) {
                  await handleReassign(confirmDialog.ids, confirmDialog.targetPersonId)
                }
                setConfirmDialog({ open: false, action: 'delete', ids: [] })
              }}
            >
              {confirmDialog.action === 'delete' ? 'Delete' : 'Reassign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
