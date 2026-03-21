import { TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import type { FrequentVisitor } from '../types'

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

type FrequentVisitorsProps = {
  visitors: FrequentVisitor[]
  loading: boolean
}

export function FrequentVisitors({ visitors, loading }: FrequentVisitorsProps): React.JSX.Element {
  return (
    <Card className="flex flex-col gap-0 py-0">
      <CardHeader className="py-4">
        <CardTitle className="flex items-center gap-2 text-sm">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          Most frequent — last 30 days
        </CardTitle>
      </CardHeader>

      <CardContent className="px-0 pb-0">
        {loading ? (
          <div className="flex flex-col gap-2 px-4 pb-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 rounded-md" />
            ))}
          </div>
        ) : visitors.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">No encounters recorded yet</p>
        ) : (
          <ScrollArea className="max-h-[280px]">
            <ul className="flex flex-col">
              {visitors.map((v, idx) => (
                <li
                  key={v.personId}
                  className="flex items-center gap-3 border-t border-border px-4 py-2.5 first:border-t-0"
                >
                  <span className="w-5 text-xs font-medium text-muted-foreground">{idx + 1}</span>
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{v.name}</span>
                      {v.relationship && (
                        <Badge variant="outline" className="shrink-0 text-[10px]">
                          {v.relationship}
                        </Badge>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      Last seen {formatRelativeTime(v.lastSeen)}
                    </span>
                  </div>
                  <span className="text-lg font-bold tabular-nums text-primary">{v.encounterCount}</span>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
