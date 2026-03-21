import { useMemo, useState } from 'react'
import { Eye, GraduationCap, UserPlus, UserMinus, ScanFace, Inbox, LayoutList } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useActivityStore, type ActivityEvent } from '@/shared/stores/activity.store'
import {
  MiniSidebarNav,
  type MiniSidebarNavItem,
  PageHeader,
  PageScroll,
  PageShell,
  PageWorkspace,
} from '@/shared/components/PageLayout'

const TYPE_CONFIG: Record<
  ActivityEvent['type'],
  { icon: React.ElementType; label: string; variant: 'default' | 'secondary' | 'outline' }
> = {
  recognition: { icon: Eye, label: 'Recognised', variant: 'default' },
  auto_learn: { icon: GraduationCap, label: 'Auto-learn', variant: 'secondary' },
  registration: { icon: ScanFace, label: 'Registered', variant: 'secondary' },
  person_added: { icon: UserPlus, label: 'Added', variant: 'outline' },
  person_removed: { icon: UserMinus, label: 'Removed', variant: 'outline' },
}

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 5) return 'just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

function ActivityItem({ event }: { event: ActivityEvent }): React.JSX.Element {
  const config = TYPE_CONFIG[event.type]
  const Icon = config.icon

  return (
    <div className="flex items-start gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/40">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-center gap-2">
          {event.personName && (
            <span className="truncate text-sm font-medium text-foreground">{event.personName}</span>
          )}
          <Badge variant={config.variant} className="shrink-0 text-[10px]">
            {config.label}
          </Badge>
        </div>

        <p className="text-xs text-muted-foreground">{event.details}</p>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[10px] text-muted-foreground">{formatRelativeTime(event.timestamp)}</span>
          {event.similarity !== null && (
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {(event.similarity * 100).toFixed(0)}% match
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState(): React.JSX.Element {
  return (
    <div className="flex min-h-[min(50vh,420px)] flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
      <Inbox className="h-10 w-10 opacity-40" />
      <div>
        <p className="text-sm font-medium text-foreground">No activity yet</p>
        <p className="mt-1 max-w-xs text-xs">Recognition, registration, and auto-learn events will show here.</p>
      </div>
    </div>
  )
}

type ActivityFilter = 'all' | ActivityEvent['type']

const FILTER_NAV: MiniSidebarNavItem[] = [
  { id: 'all', label: 'All', icon: LayoutList },
  { id: 'recognition', label: 'Recognised', icon: Eye },
  { id: 'auto_learn', label: 'Auto-learn', icon: GraduationCap },
  { id: 'registration', label: 'Registered', icon: ScanFace },
  { id: 'person_added', label: 'Added', icon: UserPlus },
  { id: 'person_removed', label: 'Removed', icon: UserMinus },
]

export function ActivityFeed(): React.JSX.Element {
  const events = useActivityStore((s) => s.events)
  const clearEvents = useActivityStore((s) => s.clearEvents)
  const [filter, setFilter] = useState<ActivityFilter>('all')

  const filteredEvents = useMemo(() => {
    if (filter === 'all') return events
    return events.filter((e) => e.type === filter)
  }, [events, filter])

  const hasEvents = events.length > 0
  const hasFiltered = filteredEvents.length > 0

  const navItems = useMemo(
    () =>
      FILTER_NAV.map((item) => {
        if (item.id === 'all') {
          return { ...item, badge: String(events.length) }
        }
        const count = events.filter((e) => e.type === item.id).length
        return { ...item, badge: String(count) }
      }),
    [events],
  )

  return (
    <PageShell>
      <PageHeader
        title="Activity"
        description="Recent recognition and profile events, newest first."
        actions={
          hasEvents ? (
            <Button variant="outline" size="sm" className="text-xs" onClick={clearEvents}>
              Clear all
            </Button>
          ) : undefined
        }
      />

      <PageWorkspace
        miniSidebar={
          <MiniSidebarNav
            label="Filter"
            items={navItems}
            activeId={filter}
            onSelect={(id) => setFilter(id as ActivityFilter)}
          />
        }
      >
        <PageScroll maxWidth="3xl">
          {hasFiltered ? (
            <div className="flex flex-col gap-1 pb-6">
              {filteredEvents.map((event) => (
                <ActivityItem key={event.id} event={event} />
              ))}
            </div>
          ) : hasEvents ? (
            <div className="flex min-h-[min(40vh,280px)] flex-col items-center justify-center gap-2 py-10 text-center">
              <p className="text-sm text-muted-foreground">No events in this category.</p>
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => setFilter('all')}>
                Show all
              </Button>
            </div>
          ) : (
            <EmptyState />
          )}
        </PageScroll>
      </PageWorkspace>
    </PageShell>
  )
}
