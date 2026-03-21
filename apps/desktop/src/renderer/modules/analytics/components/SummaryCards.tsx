import { Users, Eye, Clock, HelpCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

type StatCardProps = {
  label: string
  value: number
  icon: React.ElementType
  accent?: string
}

function StatCard({ label, value, icon: Icon, accent = 'text-primary' }: StatCardProps): React.JSX.Element {
  return (
    <Card className="gap-3 py-4">
      <CardContent className="flex items-center gap-3 px-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-2xl font-bold tabular-nums tracking-tight">{value}</span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </CardContent>
    </Card>
  )
}

type SummaryCardsProps = {
  totalPeople: number
  totalEncounters: number
  recentEncounters: number
  activeUnknowns: number
  loading: boolean
}

export function SummaryCards({
  totalPeople,
  totalEncounters,
  recentEncounters,
  activeUnknowns,
  loading,
}: SummaryCardsProps): React.JSX.Element {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-xl" />
        ))}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="People registered" value={totalPeople} icon={Users} />
      <StatCard label="Total encounters" value={totalEncounters} icon={Eye} accent="text-blue-500" />
      <StatCard label="Last 7 days" value={recentEncounters} icon={Clock} accent="text-emerald-500" />
      <StatCard label="Active unknowns" value={activeUnknowns} icon={HelpCircle} accent="text-amber-500" />
    </div>
  )
}
