import { create } from 'zustand'
import { toast } from 'sonner'

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
  isLoading: boolean
}

type PeopleActions = {
  loadPeople: () => Promise<void>
  addPerson: (input: { name: string; relationship?: string; notes?: string }) => Promise<Person>
  removePerson: (id: string) => Promise<boolean>
}

export const usePeopleStore = create<PeopleState & PeopleActions>((set) => ({
  people: [],
  isLoading: false,

  loadPeople: async () => {
    set({ isLoading: true })
    try {
      const people = await window.emoryApi.db.people.findAll()
      set({ people, isLoading: false })
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
