import { useState, useEffect, useMemo } from 'react'
import { LayoutDashboard, UserRound, UserX } from 'lucide-react'
import { SummaryCards } from './SummaryCards'
import { FrequentVisitors } from './FrequentVisitors'
import { RecentEncounters } from './RecentEncounters'
import { UnknownSightings } from './UnknownSightings'
import type { AnalyticsPerson, AnalyticsEncounter, AnalyticsUnknown, FrequentVisitor } from '../types'
import {
  MiniSidebarNav,
  type MiniSidebarNavItem,
  PageHeader,
  PageScroll,
  PageShell,
  PageWorkspace,
} from '@/shared/components/PageLayout'

const SEVEN_DAYS_MS = 7 * 86_400_000
const THIRTY_DAYS_MS = 30 * 86_400_000

function computeFrequentVisitors(
  encounters: AnalyticsEncounter[],
  people: AnalyticsPerson[],
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
        relationship: person?.relationship ?? null,
        encounterCount: count,
        lastSeen: person?.lastSeen ?? null,
      }
    })
    .sort((a, b) => b.encounterCount - a.encounterCount)
    .slice(0, 10)
}

type AnalyticsSection = 'summary' | 'relations' | 'unknowns'

const ANALYTICS_NAV: MiniSidebarNavItem[] = [
  { id: 'summary', label: 'Overview', icon: LayoutDashboard },
  { id: 'relations', label: 'People', icon: UserRound },
  { id: 'unknowns', label: 'Unknowns', icon: UserX },
]

export function AnalyticsDashboard(): React.JSX.Element {
  const [section, setSection] = useState<AnalyticsSection>('summary')
  const [people, setPeople] = useState<AnalyticsPerson[]>([])
  const [encounters, setEncounters] = useState<AnalyticsEncounter[]>([])
  const [unknowns, setUnknowns] = useState<AnalyticsUnknown[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const [p, e, u] = await Promise.all([
          window.emoryApi.db.people.findAll(),
          window.emoryApi.encounter.getRecent(1000),
          window.emoryApi.unknown.getAll(50),
        ])
        setPeople(p as AnalyticsPerson[])
        setEncounters(e as AnalyticsEncounter[])
        setUnknowns(u as AnalyticsUnknown[])
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
    () => computeFrequentVisitors(encounters, people),
    [encounters, people],
  )

  return (
    <PageShell>
      <PageHeader
        title="Analytics"
        description="Encounters, frequent visitors, and unknown sightings."
      />

      <PageWorkspace
        miniSidebar={
          <MiniSidebarNav
            label="Views"
            items={ANALYTICS_NAV}
            activeId={section}
            onSelect={(id) => setSection(id as AnalyticsSection)}
          />
        }
      >
        <PageScroll maxWidth="7xl" innerClassName="flex flex-col gap-8 pb-8">
          {section === 'summary' ? (
            <>
              <SummaryCards
                totalPeople={people.length}
                totalEncounters={encounters.length}
                recentEncounters={recentSevenDays}
                activeUnknowns={activeUnknowns}
                loading={loading}
              />
              <div className="grid gap-6 lg:grid-cols-2">
                <FrequentVisitors visitors={frequentVisitors} loading={loading} />
                <RecentEncounters encounters={encounters} loading={loading} />
              </div>
            </>
          ) : null}

          {section === 'relations' ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <FrequentVisitors visitors={frequentVisitors} loading={loading} />
              <RecentEncounters encounters={encounters} loading={loading} />
            </div>
          ) : null}

          {section === 'unknowns' ? (
            <UnknownSightings sightings={unknowns} loading={loading} />
          ) : null}
        </PageScroll>
      </PageWorkspace>
    </PageShell>
  )
}
