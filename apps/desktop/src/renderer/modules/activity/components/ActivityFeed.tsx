import { useMemo } from 'react'
import { Eye, GraduationCap, UserPlus, UserMinus, ScanFace, Inbox } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { useActivityStore, type ActivityEvent } from '@/shared/stores/activity.store'

const TYPE_CONFIG: Record<ActivityEvent['type'], { icon: React.ElementType; label: string; variant: 'default' | 'secondary' | 'outline' }> = {
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
    <div className="flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/50">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          {event.personName && (
            <span className="truncate text-sm font-medium">{event.personName}</span>
          )}
          <Badge variant={config.variant} className="shrink-0 text-[10px]">
            {config.label}
          </Badge>
        </div>

        <p className="truncate text-xs text-muted-foreground">{event.details}</p>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">
            {formatRelativeTime(event.timestamp)}
          </span>
          {event.similarity !== null && (
            <span className="text-[10px] text-muted-foreground">
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
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <Inbox className="h-10 w-10 opacity-40" />
      <p className="text-sm">No activity yet</p>
      <p className="max-w-[200px] text-center text-xs opacity-70">
        Recognition events and auto-learns will appear here
      </p>
    </div>
  )
}

export function ActivityFeed(): React.JSX.Element {
  const events = useActivityStore((s) => s.events)
  const clearEvents = useActivityStore((s) => s.clearEvents)
  const hasEvents = useMemo(() => events.length > 0, [events.length])

  return (
    <section className="flex h-full flex-col">
      <div className="flex items-center justify-between px-6 pt-6 pb-3">
        <h2 className="text-lg font-semibold tracking-tight">Activity</h2>
        {hasEvents && (
          <Button variant="ghost" size="sm" className="text-xs" onClick={clearEvents}>
            Clear
          </Button>
        )}
      </div>

      {hasEvents ? (
        <ScrollArea className="flex-1 px-3">
          <div className="flex flex-col gap-0.5 pb-4">
            {events.map((event) => (
              <ActivityItem key={event.id} event={event} />
            ))}
          </div>
        </ScrollArea>
      ) : (
        <EmptyState />
      )}
    </section>
  )
}
