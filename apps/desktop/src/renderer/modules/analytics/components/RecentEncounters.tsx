import { Eye } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import type { AnalyticsEncounter } from '../types'

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = diffMs / 3_600_000

  if (diffHours < 24) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
  if (diffHours < 168) {
    return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function formatDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt).getTime()
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const seconds = Math.floor((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ${minutes % 60}m`
}

type RecentEncountersProps = {
  encounters: AnalyticsEncounter[]
  loading: boolean
}

export function RecentEncounters({ encounters, loading }: RecentEncountersProps): React.JSX.Element {
  const displayList = encounters.slice(0, 20)

  return (
    <Card className="flex flex-col gap-0 py-0">
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Eye className="h-4 w-4 text-muted-foreground" />
          Recent encounters
        </CardTitle>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {loading ? (
          <div className="flex flex-col gap-2 px-4 pb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : displayList.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">No encounters yet</p>
        ) : (
          <ScrollArea className="max-h-[280px]">
            <ul className="flex flex-col">
              {displayList.map((enc) => (
                <li
                  key={enc.id}
                  className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{enc.personName}</span>
                      {enc.avgConfidence !== null && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          {(enc.avgConfidence * 100).toFixed(0)}%
                        </Badge>
                      )}
                      {enc.isImportant && (
                        <Badge variant="default" className="shrink-0 text-[10px]">
                          Important
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{formatTimestamp(enc.startedAt)}</span>
                      <span>·</span>
                      <span>{formatDuration(enc.startedAt, enc.endedAt)}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
