import { useState, useEffect, useMemo } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { SummaryCards } from './SummaryCards'
import { FrequentVisitors } from './FrequentVisitors'
import { RecentEncounters } from './RecentEncounters'
import { UnknownSightings } from './UnknownSightings'
import type { AnalyticsPerson, AnalyticsEncounter, AnalyticsUnknown, FrequentVisitor } from '../types'
import {
  buildGraphEdgesToSelf,
  formatGraphEdgeLabel,
  type RelationshipEndpointRow,
} from '@/shared/lib/graph-relationship-labels'

const SEVEN_DAYS_MS = 7 * 86_400_000
const THIRTY_DAYS_MS = 30 * 86_400_000

function computeFrequentVisitors(
  encounters: AnalyticsEncounter[],
  people: AnalyticsPerson[],
  graphLabelByPersonId: Record<string, string>,
): FrequentVisitor[] {
  const cutoff = Date.now() - THIRTY_DAYS_MS
  const recentEncounters = encounters.filter((e) => new Date(e.startedAt).getTime() > cutoff)

  const countMap = new Map<string, number>()
  for (const enc of recentEncounters) {
    countMap.set(enc.personId, (countMap.get(enc.personId) ?? 0) + 1)
  }

  const peopleMap = new Map(people.map((p) => [p.id, p]))

  return Array.from(countMap.entries())
    .map(([personId, count]) => {
      const person = peopleMap.get(personId)
      return {
        personId,
        name: person?.name ?? 'Unknown',
        relationship: graphLabelByPersonId[personId] ?? null,
        encounterCount: count,
        lastSeen: person?.lastSeen ?? null,
      }
    })
    .sort((a, b) => b.encounterCount - a.encounterCount)
    .slice(0, 10)
}

export function AnalyticsDashboard(): React.JSX.Element {
  const [people, setPeople] = useState<AnalyticsPerson[]>([])
  const [encounters, setEncounters] = useState<AnalyticsEncounter[]>([])
  const [unknowns, setUnknowns] = useState<AnalyticsUnknown[]>([])
  const [graphLabelByPersonId, setGraphLabelByPersonId] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const [p, e, u, self, rels] = await Promise.all([
          window.emoryApi.db.people.findAll(),
          window.emoryApi.encounter.getRecent(1000),
          window.emoryApi.unknown.getAll(50),
          window.emoryApi.db.people.getSelf(),
          window.emoryApi.db.relationships.getAll(),
        ])
        setPeople(p as AnalyticsPerson[])
        setEncounters(e as AnalyticsEncounter[])
        setUnknowns(u as AnalyticsUnknown[])
        const edges = buildGraphEdgesToSelf(self as { id: string } | null, rels as RelationshipEndpointRow[])
        const labels: Record<string, string> = {}
        for (const [pid, edge] of Object.entries(edges)) {
          labels[pid] = formatGraphEdgeLabel(edge)
        }
        setGraphLabelByPersonId(labels)
      } catch {
        // Analytics load failed
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const recentSevenDays = useMemo(() => {
    const cutoff = Date.now() - SEVEN_DAYS_MS
    return encounters.filter((e) => new Date(e.startedAt).getTime() > cutoff).length
  }, [encounters])

  const activeUnknowns = useMemo(
    () => unknowns.filter((s) => s.status === 'tracking').length,
    [unknowns],
  )

  const frequentVisitors = useMemo(
    () => computeFrequentVisitors(encounters, people, graphLabelByPersonId),
    [encounters, people, graphLabelByPersonId],
  )

  return (
    <section className="flex h-full flex-col">
      <div className="px-6 pt-6 pb-2">
        <h2 className="text-lg font-semibold tracking-tight">Analytics</h2>
        <p className="text-xs text-muted-foreground">Overview of recognition activity and sightings</p>
      </div>

      <Separator />

      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-5 px-6 py-5">
          <SummaryCards
            totalPeople={people.length}
            totalEncounters={encounters.length}
            recentEncounters={recentSevenDays}
            activeUnknowns={activeUnknowns}
            loading={loading}
          />

          <div className="grid gap-5 lg:grid-cols-2">
            <FrequentVisitors visitors={frequentVisitors} loading={loading} />
            <RecentEncounters encounters={encounters} loading={loading} />
          </div>

          <UnknownSightings sightings={unknowns} loading={loading} />
        </div>
      </ScrollArea>
    </section>
  )
}
