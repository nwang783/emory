import { HelpCircle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import type { AnalyticsUnknown } from '../types'

const STATUS_VARIANT: Record<AnalyticsUnknown['status'], 'default' | 'secondary' | 'outline'> = {
  tracking: 'default',
  dismissed: 'outline',
  named: 'secondary',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

type UnknownSightingsProps = {
  sightings: AnalyticsUnknown[]
  loading: boolean
}

export function UnknownSightings({ sightings, loading }: UnknownSightingsProps): React.JSX.Element {
  const activeCount = sightings.filter((s) => s.status === 'tracking').length

  return (
    <Card className="flex flex-col gap-0 py-0">
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HelpCircle className="h-4 w-4 text-muted-foreground" />
          Unknown sightings
          {activeCount > 0 && (
            <Badge variant="default" className="text-[10px]">
              {activeCount} active
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {loading ? (
          <div className="flex flex-col gap-2 px-4 pb-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : sightings.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">No unknown sightings</p>
        ) : (
          <ScrollArea className="max-h-[280px]">
            <ul className="flex flex-col">
              {sightings.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium tabular-nums">
                        {s.sightingCount} sighting{s.sightingCount !== 1 ? 's' : ''}
                      </span>
                      <Badge variant={STATUS_VARIANT[s.status]} className="shrink-0 text-[10px]">
                        {s.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>First: {formatDate(s.firstSeen)}</span>
                      <span>·</span>
                      <span>Last: {formatDate(s.lastSeen)}</span>
                    </div>
                  </div>
                  {s.bestConfidence !== null && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {(s.bestConfidence * 100).toFixed(0)}%
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
