import { useEffect, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Person } from '@/shared/stores/people.store'
import { usePeopleStore } from '@/shared/stores/people.store'
import { formatGraphEdgeLabel } from '@/shared/lib/graph-relationship-labels'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type PersonCardProps = {
  person: Person
  onEdit: () => void
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime()
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

export function PersonCard({ person, onEdit }: PersonCardProps): React.JSX.Element {
  const [embeddingCount, setEmbeddingCount] = useState<number | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const removePerson = usePeopleStore((s) => s.removePerson)
  const graphEdgeToSelf = usePeopleStore((s) => s.graphEdgeToSelfByPersonId[person.id])

  useEffect(() => {
    window.emoryApi.face.getEmbeddingCount(person.id).then(setEmbeddingCount).catch(() => {})
  }, [person.id])

  async function handleDelete(): Promise<void> {
    const success = await removePerson(person.id)
    if (success) toast.success(`Removed ${person.name}`)
    setShowDeleteConfirm(false)
  }

  return (
    <>
      <article className="flex items-center gap-3 rounded-lg border border-border bg-card/50 p-3 transition-colors hover:bg-muted/50">
        <Avatar size="lg">
          <AvatarFallback className="bg-primary/15 text-primary font-medium">
            {getInitials(person.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-card-foreground">{person.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {person.isSelf && (
              <Badge variant="default" className="text-[10px]">
                You
              </Badge>
            )}
            {graphEdgeToSelf && (
              <Badge variant="secondary" className="text-[10px]">
                {formatGraphEdgeLabel(graphEdgeToSelf)}
              </Badge>
            )}
            {embeddingCount !== null && embeddingCount > 0 && (
              <Badge variant="outline" className="text-[10px]">
                {embeddingCount} face{embeddingCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          {person.lastSeen && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatRelativeTime(person.lastSeen)}
            </p>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onEdit}
                aria-label={`Edit ${person.name}`}
              >
                <Pencil />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Edit</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowDeleteConfirm(true)}
                aria-label={`Delete ${person.name}`}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete</TooltipContent>
          </Tooltip>
        </div>
      </article>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete {person.name}?</DialogTitle>
            <DialogDescription>
              This will permanently remove this person and all their face data. This action cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
