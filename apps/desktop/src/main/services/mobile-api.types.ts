export type MobileApiImportantDate = {
  label: string
  date: string
}

export type MobileApiPerson = {
  id: string
  name: string
  relationship: string | null
  notes: string | null
  bio: string | null
  lastSeen: string | null
  createdAt: string
  isSelf: boolean
  keyFacts: string[]
  conversationStarters: string[]
  importantDates: MobileApiImportantDate[]
  lastTopics: string[]
  faceThumbnail: string | null
}

export type MobileApiMemory = {
  id: string
  personId: string
  memoryText: string
  memoryType: string
  memoryDate: string
  confidence: number | null
  createdAt: string
}

export type MobileApiEncounter = {
  id: string
  personId: string
  personName: string
  startedAt: string
  endedAt: string | null
  avgConfidence: number | null
  peakConfidence: number | null
  isImportant: boolean
  createdAt: string
}

export type MobileApiPeopleResponse = {
  people: MobileApiPerson[]
}

export type MobileApiPersonDetail = {
  person: MobileApiPerson
  recentMemories: MobileApiMemory[]
  recentEncounters: MobileApiEncounter[]
  latestConversationSummary: string | null
  latestConversationRecordedAt: string | null
}

export type MobileApiMemoriesResponse = {
  memories: MobileApiMemory[]
}

export type MobileApiMemoryGroup = {
  person: MobileApiPerson
  memories: MobileApiMemory[]
}

export type MobileApiMemoryGroupsResponse = {
  groups: MobileApiMemoryGroup[]
}

export type MobileApiRecentEncountersResponse = {
  encounters: MobileApiEncounter[]
}

export type MobileApiHomeResponse = {
  self: MobileApiPerson | null
  people: MobileApiPerson[]
  recentEncounters: MobileApiEncounter[]
}
