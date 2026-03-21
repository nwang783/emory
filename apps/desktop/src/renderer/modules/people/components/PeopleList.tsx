import { useState } from 'react'
import { Plus, UserRound } from 'lucide-react'
import type { Person } from '@/shared/stores/people.store'
import { usePeopleStore } from '@/shared/stores/people.store'
import { RegisterFaceModal } from './RegisterFaceModal'
import { EditPersonModal } from './EditPersonModal'
import { PersonCard } from './PersonCard'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { MiniSidebarPanel, PageHeader, PageShell, PageWorkspace } from '@/shared/components/PageLayout'
import { cn } from '@/lib/utils'

type PeopleListProps = {
  fullWidth?: boolean
}

function LoadingSkeleton({ compact }: { compact: boolean }): React.JSX.Element {
  return (
    <div className={cn('space-y-3', compact ? 'p-3' : 'px-6 py-5')}>
      {Array.from({ length: compact ? 3 : 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex min-h-[min(45vh,360px)] flex-col items-center justify-center gap-3 px-4 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <UserRound className="h-7 w-7 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-foreground">No people yet</p>
        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
          Add someone to start recognition and memories.
        </p>
      </div>
    </div>
  )
}

export function PeopleList({ fullWidth = false }: PeopleListProps): React.JSX.Element {
  const [showRegister, setShowRegister] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const people = usePeopleStore((s) => s.people)
  const isLoading = usePeopleStore((s) => s.isLoading)

  const addButton = (
    <Button size="sm" onClick={() => setShowRegister(true)}>
      <Plus className="h-4 w-4" />
      Add person
    </Button>
  )

  return (
    <PageShell>
      <PageHeader
        variant={fullWidth ? 'default' : 'compact'}
        title="People"
        description={
          fullWidth
            ? 'Profiles used for face recognition, relationships, and conversation memory.'
            : undefined
        }
        actions={addButton}
      />

      {fullWidth ? (
        <PageWorkspace
          miniSidebar={
            <MiniSidebarPanel label="Overview">
              <p className="font-mono-ui text-2xl font-semibold tabular-nums text-foreground">
                {isLoading ? '—' : people.length}
              </p>
              <p className="text-[11px] text-muted-foreground">People in directory</p>
              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
                Register faces from Camera, then edit names, “This is me,” and relationships here.
              </p>
            </MiniSidebarPanel>
          }
        >
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto max-w-7xl px-5 py-5 sm:px-6">
              {isLoading && <LoadingSkeleton compact={false} />}
              {!isLoading && people.length === 0 && <EmptyState />}
              {!isLoading && people.length > 0 && (
                <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {people.map((person) => (
                    <li key={person.id}>
                      <PersonCard person={person} onEdit={() => setEditingPerson(person)} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </ScrollArea>
        </PageWorkspace>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="p-3">
            {isLoading && <LoadingSkeleton compact />}
            {!isLoading && people.length === 0 && <EmptyState />}
            {!isLoading && people.length > 0 && (
              <ul className="flex list-none flex-col gap-2">
                {people.map((person) => (
                  <li key={person.id}>
                    <PersonCard person={person} onEdit={() => setEditingPerson(person)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </ScrollArea>
      )}

      <RegisterFaceModal open={showRegister} onOpenChange={setShowRegister} />
      <EditPersonModal
        person={
          editingPerson ? (people.find((p) => p.id === editingPerson.id) ?? editingPerson) : null
        }
        open={editingPerson !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingPerson(null)
        }}
      />
    </PageShell>
  )
}
