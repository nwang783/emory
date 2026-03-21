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

type PeopleListProps = {
  fullWidth?: boolean
}

function LoadingSkeleton(): React.JSX.Element {
  return (
    <div className="space-y-3 p-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-lg border border-border p-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <UserRound className="h-7 w-7 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm font-medium text-card-foreground">No people registered</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add a person to start face recognition
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

  return (
    <section className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-card-foreground">People</h2>
        <Button size="sm" onClick={() => setShowRegister(true)}>
          <Plus className="h-4 w-4" />
          Add Person
        </Button>
      </header>

      <ScrollArea className="flex-1">
        {isLoading && <LoadingSkeleton />}
        {!isLoading && people.length === 0 && <EmptyState />}
        {!isLoading && people.length > 0 && (
          <div
            className={
              fullWidth
                ? 'grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3'
                : 'flex flex-col gap-2 p-3'
            }
          >
            {people.map((person) => (
              <PersonCard
                key={person.id}
                person={person}
                onEdit={() => setEditingPerson(person)}
              />
            ))}
          </div>
        )}
      </ScrollArea>

      <RegisterFaceModal open={showRegister} onOpenChange={setShowRegister} />
      <EditPersonModal
        person={
          editingPerson
            ? people.find((p) => p.id === editingPerson.id) ?? editingPerson
            : null
        }
        open={editingPerson !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setEditingPerson(null)
        }}
      />
    </section>
  )
}
