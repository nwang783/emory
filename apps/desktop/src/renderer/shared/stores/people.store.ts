import { create } from 'zustand'
import { toast } from 'sonner'
import {
  buildGraphEdgesToSelf,
  type GraphEdgeToSelf,
  type RelationshipEndpointRow,
} from '@/shared/lib/graph-relationship-labels'

export type ImportantDate = {
  label: string
  date: string
}

export type PersonProfile = {
  keyFacts: string[]
  conversationStarters: string[]
  importantDates: ImportantDate[]
  lastTopics: string[]
}

export type Person = {
  id: string
  name: string
  relationship: string | null
  notes: string | null
  photos: string | null
  firstMet: string | null
  lastSeen: string | null
  createdAt: string
  isSelf: boolean
  keyFacts?: string[]
  conversationStarters?: string[]
  importantDates?: ImportantDate[]
  lastTopics?: string[]
}

type PeopleState = {
  people: Person[]
  /** Direct graph edge from designated self → this person (Connections), keyed by person id. */
  graphEdgeToSelfByPersonId: Record<string, GraphEdgeToSelf>
  isLoading: boolean
}

type PeopleActions = {
  loadPeople: () => Promise<void>
  addPerson: (input: { name: string }) => Promise<Person>
  removePerson: (id: string) => Promise<boolean>
}

export const usePeopleStore = create<PeopleState & PeopleActions>((set) => ({
  people: [],
  graphEdgeToSelfByPersonId: {},
  isLoading: false,

  loadPeople: async () => {
    set({ isLoading: true })
    try {
      const [people, self, rels] = await Promise.all([
        window.emoryApi.db.people.findAll(),
        window.emoryApi.db.people.getSelf(),
        window.emoryApi.db.relationships.getAll(),
      ])
      const rows = rels as RelationshipEndpointRow[]
      const graphEdgeToSelfByPersonId = buildGraphEdgesToSelf(self as { id: string } | null, rows)
      set({ people, graphEdgeToSelfByPersonId, isLoading: false })
    } catch {
      set({ isLoading: false })
      toast.error('Failed to load people')
    }
  },

  addPerson: async (input) => {
    const person = await window.emoryApi.db.people.create(input)
    set((state) => ({ people: [person, ...state.people] }))
    return person
  },

  removePerson: async (id) => {
    const success = await window.emoryApi.db.people.delete(id)
    if (success) {
      set((state) => ({ people: state.people.filter((p) => p.id !== id) }))
    }
    return success
  },
}))
