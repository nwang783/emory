export type AnalyticsPerson = {
  id: string
  name: string
  relationship: string | null
  lastSeen: string | null
}

export type AnalyticsEncounter = {
  id: string
  personId: string
  personName: string
  startedAt: string
  endedAt: string | null
  avgConfidence: number | null
  peakConfidence: number | null
  isImportant: boolean
}

export type AnalyticsUnknown = {
  id: string
  firstSeen: string
  lastSeen: string
  sightingCount: number
  status: 'tracking' | 'dismissed' | 'named'
  bestConfidence: number | null
}

export type FrequentVisitor = {
  personId: string
  name: string
  relationship: string | null
  encounterCount: number
  lastSeen: string | null
}
