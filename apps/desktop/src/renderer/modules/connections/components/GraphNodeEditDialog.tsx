import { useEffect, useState } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { usePeopleStore } from '@/shared/stores/people.store'
import { RELATIONSHIP_TYPES } from '../lib/graph-constants'

type IncidentEdge = {
  id: string
  otherPersonId: string
  otherName: string
  relationshipType: string
  notes: string
}

type GraphNodeEditDialogProps = {
  personId: string | null
  personName: string
  isSelf: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onGraphChanged: () => Promise<void>
}

export function GraphNodeEditDialog({
  personId,
  personName,
  isSelf,
  open,
  onOpenChange,
  onGraphChanged,
}: GraphNodeEditDialogProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [edges, setEdges] = useState<IncidentEdge[]>([])
  const [loading, setLoading] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [deletingPerson, setDeletingPerson] = useState(false)
  const [edgeBusyId, setEdgeBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !personId) return

    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const [person, rels] = await Promise.all([
          window.emoryApi.db.people.findById(personId),
          window.emoryApi.db.relationships.getByPerson(personId),
        ])
        if (cancelled) return
        setName(person?.name ?? personName)
        const list = (rels as Array<{
          id: string
          personAId: string
          personBId: string
          personAName: string
          personBName: string
          relationshipType: string
          notes: string | null
        }>).map((r) => {
          const otherPersonId = r.personAId === personId ? r.personBId : r.personAId
          const otherName = r.personAId === personId ? r.personBName : r.personAName
          return {
            id: r.id,
            otherPersonId,
            otherName,
            relationshipType: r.relationshipType,
            notes: r.notes ?? '',
          }
        })
        setEdges(list)
      } catch {
        if (!cancelled) toast.error('Failed to load connections for this person')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, personId, personName])

  async function handleSaveName(): Promise<void> {
    if (!personId || !name.trim()) return
    setSavingName(true)
    try {
      await window.emoryApi.db.people.update(personId, { name: name.trim() })
      await usePeopleStore.getState().loadPeople()
      await onGraphChanged()
      toast.success('Name updated')
    } catch (err) {
      toast.error('Could not update name', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSavingName(false)
    }
  }

  async function handleUpdateEdge(edge: IncidentEdge): Promise<void> {
    setEdgeBusyId(edge.id)
    try {
      await window.emoryApi.db.relationships.update(edge.id, edge.relationshipType, edge.notes)
      await usePeopleStore.getState().loadPeople()
      await onGraphChanged()
      toast.success('Connection updated')
    } catch (err) {
      toast.error('Could not update connection', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setEdgeBusyId(null)
    }
  }

  async function handleDeleteEdge(edgeId: string): Promise<void> {
    setEdgeBusyId(edgeId)
    try {
      await window.emoryApi.db.relationships.delete(edgeId)
      setEdges((prev) => prev.filter((e) => e.id !== edgeId))
      await usePeopleStore.getState().loadPeople()
      await onGraphChanged()
      toast.success('Connection removed')
    } catch (err) {
      toast.error('Could not remove connection', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setEdgeBusyId(null)
    }
  }

  async function handleDeletePerson(): Promise<void> {
    if (!personId) return
    setDeletingPerson(true)
    try {
      const ok = await window.emoryApi.db.people.delete(personId)
      if (!ok) {
        toast.error('Person was not found')
        return
      }
      await usePeopleStore.getState().loadPeople()
      await onGraphChanged()
      toast.success('Person removed')
      onOpenChange(false)
    } catch (err) {
      toast.error('Could not remove person', {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setDeletingPerson(false)
    }
  }

  function updateEdgeLocal(id: string, patch: Partial<IncidentEdge>): void {
    setEdges((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{isSelf ? 'You' : 'Edit person'}</DialogTitle>
          <DialogDescription>
            {isSelf
              ? 'Rename yourself and manage your connections. Relationship roles and notes are stored on each connection.'
              : 'Rename this person, edit their connections, or remove them from your directory.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 overflow-y-auto py-2 pr-1">
          <div className="grid gap-2">
            <Label htmlFor="graph-edit-name">Name</Label>
            <div className="flex gap-2">
              <Input
                id="graph-edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading || savingName}
              />
              <Button
                type="button"
                variant="secondary"
                disabled={loading || savingName || !name.trim()}
                onClick={() => void handleSaveName()}
              >
                {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm font-medium">Connections</p>
            {loading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : edges.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No graph edges yet. Use Add to connect people.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {edges.map((edge) => (
                  <li
                    key={edge.id}
                    className="rounded-lg border border-border bg-muted/20 p-3 space-y-3"
                  >
                    <p className="text-xs text-muted-foreground">
                      With <span className="font-medium text-foreground">{edge.otherName}</span>
                    </p>
                    <div className="grid gap-2">
                      <Label>Type</Label>
                      <Select
                        value={edge.relationshipType}
                        onValueChange={(v) => updateEdgeLocal(edge.id, { relationshipType: v })}
                        disabled={edgeBusyId === edge.id}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {RELATIONSHIP_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Notes</Label>
                      <Input
                        value={edge.notes}
                        onChange={(e) => updateEdgeLocal(edge.id, { notes: e.target.value })}
                        placeholder="Optional notes on this connection"
                        disabled={edgeBusyId === edge.id}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={edgeBusyId === edge.id}
                        onClick={() => void handleUpdateEdge(edge)}
                      >
                        {edgeBusyId === edge.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Apply'
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        disabled={edgeBusyId === edge.id}
                        onClick={() => void handleDeleteEdge(edge.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove edge
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!isSelf && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <p className="text-sm font-medium text-destructive">Danger zone</p>
              <p className="text-xs text-muted-foreground">
                Deletes this person, their face embeddings, recordings linkages, and all graph edges
                involving them (SQLite cascades).
              </p>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deletingPerson || loading}
                onClick={() => void handleDeletePerson()}
              >
                {deletingPerson ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete person'}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
