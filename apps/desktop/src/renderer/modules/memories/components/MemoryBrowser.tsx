import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Brain,
  Inbox,
  LayoutList,
  Loader2,
  Pencil,
  Search,
  Trash2,
  X,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  MiniSidebarNav,
  type MiniSidebarNavItem,
  PageHeader,
  PageScroll,
  PageShell,
  PageToolbar,
  PageWorkspace,
} from '@/shared/components/PageLayout'
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { usePeopleStore } from '@/shared/stores/people.store'

type MemoryType = 'fact' | 'preference' | 'event' | 'relationship' | 'health' | 'routine' | 'other'

type PersonMemory = {
  id: string
  personId: string
  recordingId: string | null
  memoryText: string
  memoryType: MemoryType
  memoryDate: string
  confidence: number | null
  sourceQuote: string | null
  createdAt: string
}

const MEMORY_TYPES: MemoryType[] = ['fact', 'preference', 'event', 'relationship', 'health', 'routine', 'other']

const TYPE_SIDEBAR: MiniSidebarNavItem[] = [
  { id: 'all', label: 'All types', icon: LayoutList },
  ...MEMORY_TYPES.map((t) => ({ id: t, label: t })),
]

const TYPE_VARIANT: Record<MemoryType, 'default' | 'secondary' | 'outline'> = {
  fact: 'default',
  preference: 'secondary',
  event: 'outline',
  relationship: 'secondary',
  health: 'default',
  routine: 'outline',
  other: 'outline',
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <Inbox className="h-10 w-10 opacity-40" />
      <p className="text-sm">No memories found</p>
      <p className="max-w-[240px] text-center text-xs opacity-70">
        Memories extracted from conversations will appear here
      </p>
    </div>
  )
}

function MemoryRow({
  memory,
  personName,
  onEdit,
  onDelete,
}: {
  memory: PersonMemory
  personName: string
  onEdit: (memory: PersonMemory) => void
  onDelete: (memory: PersonMemory) => void
}): React.JSX.Element {
  return (
    <div className="group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Brain className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{personName}</span>
          <Badge variant={TYPE_VARIANT[memory.memoryType]} className="shrink-0 text-[10px]">
            {memory.memoryType}
          </Badge>
        </div>

        <p className="text-sm text-foreground">{memory.memoryText}</p>

        {memory.sourceQuote && (
          <p className="text-xs italic text-muted-foreground">"{memory.sourceQuote}"</p>
        )}

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{formatDate(memory.memoryDate)}</span>
          {memory.confidence !== null && (
            <span className="text-[10px] text-muted-foreground">
              {Math.round(memory.confidence * 100)}% confidence
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onEdit(memory)}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={() => onDelete(memory)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}

function EditMemoryDialog({
  memory,
  open,
  onOpenChange,
  onSave,
}: {
  memory: PersonMemory | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (id: string, input: { memoryText: string; memoryType: string; memoryDate: string }) => Promise<void>
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [type, setType] = useState<MemoryType>('fact')
  const [date, setDate] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (memory) {
      setText(memory.memoryText)
      setType(memory.memoryType)
      setDate(memory.memoryDate.split('T')[0])
    }
  }, [memory])

  const handleSave = async (): Promise<void> => {
    if (!memory || saving) return
    setSaving(true)
    try {
      await onSave(memory.id, { memoryText: text, memoryType: type, memoryDate: date })
      onOpenChange(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Memory</DialogTitle>
          <DialogDescription>Update the memory text, type, or date.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="memory-text">Memory</Label>
            <Textarea
              id="memory-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="min-h-20 resize-none"
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as MemoryType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex-1 space-y-2">
              <Label htmlFor="memory-date">Date</Label>
              <Input
                id="memory-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving || text.trim().length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteConfirmDialog({
  memory,
  open,
  onOpenChange,
  onConfirm,
}: {
  memory: PersonMemory | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (id: string) => Promise<void>
}): React.JSX.Element {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async (): Promise<void> => {
    if (!memory || deleting) return
    setDeleting(true)
    try {
      await onConfirm(memory.id)
      onOpenChange(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Memory</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete this memory? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {memory && (
          <p className="rounded-md border border-border bg-muted/30 p-3 text-sm">{memory.memoryText}</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MemoryBrowser(): React.JSX.Element {
  const people = usePeopleStore((s) => s.people)
  const [memories, setMemories] = useState<PersonMemory[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [personFilter, setPersonFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | MemoryType>('all')
  const [editTarget, setEditTarget] = useState<PersonMemory | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PersonMemory | null>(null)

  const personMap = new Map(people.map((p) => [p.id, p.name]))

  const filteredMemories = useMemo(() => {
    if (typeFilter === 'all') return memories
    return memories.filter((m) => m.memoryType === typeFilter)
  }, [memories, typeFilter])

  const typeNavItems = useMemo(
    () =>
      TYPE_SIDEBAR.map((item) => {
        if (item.id === 'all') {
          return { ...item, badge: String(memories.length) }
        }
        const count = memories.filter((m) => m.memoryType === item.id).length
        return { ...item, badge: String(count) }
      }),
    [memories],
  )

  const loadMemories = useCallback(async () => {
    setIsLoading(true)
    try {
      const personIds = personFilter !== 'all' ? [personFilter] : undefined
      const searchInput = {
        personIds,
        searchText: searchText.trim() || null,
        limit: 200,
      }
      const result = await window.emoryApi.conversation.searchMemories(searchInput)
      setMemories(result as PersonMemory[])
    } catch {
      toast.error('Failed to load memories')
    } finally {
      setIsLoading(false)
    }
  }, [personFilter, searchText])

  useEffect(() => {
    void loadMemories()
  }, [loadMemories])

  const handleSaveEdit = async (
    id: string,
    input: { memoryText: string; memoryType: string; memoryDate: string },
  ): Promise<void> => {
    const updated = await window.emoryApi.conversation.updateMemory(id, input)
    if (updated) {
      setMemories((prev) => prev.map((m) => (m.id === id ? (updated as PersonMemory) : m)))
      toast.success('Memory updated')
    } else {
      toast.error('Failed to update memory')
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    const success = await window.emoryApi.conversation.deleteMemory(id)
    if (success) {
      setMemories((prev) => prev.filter((m) => m.id !== id))
      toast.success('Memory deleted')
    } else {
      toast.error('Failed to delete memory')
    }
  }

  return (
    <PageShell>
      <PageHeader
        title="Memories"
        description="From conversations and recordings"
        actions={
          !isLoading ? (
            <span className="font-mono-ui text-xs text-muted-foreground tabular-nums">
              {filteredMemories.length} shown · {memories.length} loaded
            </span>
          ) : null
        }
      />

      <PageToolbar className="px-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search memories…"
              className="h-9 pl-8"
            />
            {searchText ? (
              <button
                type="button"
                onClick={() => setSearchText('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <Select value={personFilter} onValueChange={setPersonFilter}>
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue placeholder="All people" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All people</SelectItem>
              {people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageToolbar>

      {isLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : memories.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
          <EmptyState />
        </div>
      ) : (
        <PageWorkspace
          miniSidebar={
            <MiniSidebarNav
              label="Memory type"
              items={typeNavItems}
              activeId={typeFilter}
              onSelect={(id) => setTypeFilter(id as 'all' | MemoryType)}
            />
          }
        >
          {filteredMemories.length === 0 ? (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">No memories of this type.</p>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setTypeFilter('all')}>
                Show all types
              </Button>
            </div>
          ) : (
            <PageScroll maxWidth="4xl" innerClassName="space-y-0.5 pb-8 pt-1">
              {filteredMemories.map((memory) => (
                <MemoryRow
                  key={memory.id}
                  memory={memory}
                  personName={personMap.get(memory.personId) ?? 'Unknown'}
                  onEdit={setEditTarget}
                  onDelete={setDeleteTarget}
                />
              ))}
            </PageScroll>
          )}
        </PageWorkspace>
      )}

      <EditMemoryDialog
        memory={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => { if (!open) setEditTarget(null) }}
        onSave={handleSaveEdit}
      />

      <DeleteConfirmDialog
        memory={deleteTarget}
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}
        onConfirm={handleDelete}
      />
    </PageShell>
  )
}
