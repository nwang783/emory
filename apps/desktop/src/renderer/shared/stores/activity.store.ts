import { create } from 'zustand'

export type ActivityEvent = {
  id: string
  type: 'recognition' | 'auto_learn' | 'registration' | 'person_added' | 'person_removed'
  personName: string | null
  similarity: number | null
  timestamp: number
  details: string
}

type ActivityState = {
  events: ActivityEvent[]
  autoLearnCount: number
}

type ActivityActions = {
  addEvent: (event: Omit<ActivityEvent, 'id' | 'timestamp'>) => void
  incrementAutoLearnCount: () => void
  clearEvents: () => void
}

const MAX_EVENTS = 100

export const useActivityStore = create<ActivityState & ActivityActions>((set) => ({
  events: [],
  autoLearnCount: 0,

  addEvent: (event) =>
    set((state) => {
      const newEvent: ActivityEvent = {
        ...event,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
      }
      const events = [newEvent, ...state.events].slice(0, MAX_EVENTS)
      return { events }
    }),

  incrementAutoLearnCount: () =>
    set((state) => ({ autoLearnCount: state.autoLearnCount + 1 })),

  clearEvents: () => set({ events: [], autoLearnCount: 0 }),
}))
