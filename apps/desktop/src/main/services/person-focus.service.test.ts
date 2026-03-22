import { describe, expect, test } from 'bun:test'
import { PersonFocusService, type PersonFocusMatch, type PersonFocusMessage } from './person-focus.service.js'

const personA = {
  id: 'person-a',
  name: 'Alice',
  relationship: 'daughter',
}

const personB = {
  id: 'person-b',
  name: 'Bob',
  relationship: 'friend',
}

function createRepo() {
  const people = new Map([
    [personA.id, personA],
    [personB.id, personB],
  ])

  return {
    findById(personId: string) {
      return people.get(personId) ?? null
    },
    getEmbeddingsWithMeta(personId: string) {
      if (personId === personA.id) {
        return [{ id: 'embedding-a', personId, personName: personA.name, source: 'live_capture', thumbnail: 'thumb-a', qualityScore: null, createdAt: 'now' }]
      }
      return []
    },
  }
}

function createMatch(personId: string, similarity: number, area: number): PersonFocusMatch {
  return {
    personId,
    name: personId === personA.id ? personA.name : personB.name,
    relationship: personId === personA.id ? personA.relationship : personB.relationship,
    similarity,
    bbox: {
      width: area,
      height: 1,
    },
  }
}

describe('PersonFocusService', () => {
  test('emits only after the same person is stable across frames', () => {
    const events: PersonFocusMessage[] = []
    const service = new PersonFocusService(createRepo(), (message) => events.push(message), {
      framesToConfirm: 2,
      clearAfterSeconds: 2,
    })

    service.observe({ timestamp: 10, matches: [createMatch(personA.id, 0.92, 100)] })
    expect(events).toHaveLength(0)

    service.observe({ timestamp: 10.1, matches: [createMatch(personA.id, 0.91, 95)] })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'person_focus_changed',
      reason: 'stable_match',
      person: {
        id: personA.id,
        name: personA.name,
        relationship: personA.relationship,
        faceThumbnail: 'thumb-a',
      },
    })
  })

  test('prefers the largest visible face when choosing focus', () => {
    const events: PersonFocusMessage[] = []
    const service = new PersonFocusService(createRepo(), (message) => events.push(message), {
      framesToConfirm: 1,
      clearAfterSeconds: 2,
    })

    service.observe({
      timestamp: 20,
      matches: [
        createMatch(personA.id, 0.99, 20),
        createMatch(personB.id, 0.6, 200),
      ],
    })

    expect(events).toHaveLength(1)
    expect(events[0]?.person?.id).toBe(personB.id)
  })

  test('does not clear focus on a transient miss but clears after the timeout', () => {
    const events: PersonFocusMessage[] = []
    const service = new PersonFocusService(createRepo(), (message) => events.push(message), {
      framesToConfirm: 1,
      clearAfterSeconds: 2,
    })

    service.observe({ timestamp: 30, matches: [createMatch(personA.id, 0.9, 100)] })
    service.observe({ timestamp: 31, matches: [] })
    expect(events).toHaveLength(1)

    service.observe({ timestamp: 32.2, matches: [] })
    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({
      reason: 'focus_cleared',
      person: null,
    })
  })

  test('requires a new person to stabilize before switching focus', () => {
    const events: PersonFocusMessage[] = []
    const service = new PersonFocusService(createRepo(), (message) => events.push(message), {
      framesToConfirm: 2,
      clearAfterSeconds: 2,
    })

    service.observe({ timestamp: 40, matches: [createMatch(personA.id, 0.9, 100)] })
    service.observe({ timestamp: 40.1, matches: [createMatch(personA.id, 0.9, 100)] })
    service.observe({ timestamp: 41, matches: [createMatch(personB.id, 0.85, 120)] })

    expect(events).toHaveLength(1)
    expect(events[0]?.person?.id).toBe(personA.id)

    service.observe({ timestamp: 41.1, matches: [createMatch(personB.id, 0.86, 120)] })
    expect(events).toHaveLength(2)
    expect(events[1]?.person?.id).toBe(personB.id)
  })

  test('can emit a manual test focus payload', () => {
    const events: PersonFocusMessage[] = []
    const service = new PersonFocusService(createRepo(), (message) => events.push(message))

    const message = service.forceFocusPerson(personA.id, 50)

    expect(message).not.toBeNull()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      reason: 'manual_test',
      person: {
        id: personA.id,
      },
    })
  })
})
