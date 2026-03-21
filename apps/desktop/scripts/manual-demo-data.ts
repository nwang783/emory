import type { PeopleRepository, Person } from '@emory/db'

type SeedOptions = {
  selfName?: string
  targetName?: string
}

type SeedResult = {
  selfPerson: Person
  targetPerson: Person
}

function findExactPersonByName(peopleRepo: PeopleRepository, name: string): Person | null {
  const normalized = name.trim().toLowerCase()
  return peopleRepo.searchByName(name, 10).find((person) => person.name.trim().toLowerCase() === normalized) ?? null
}

function ensurePerson(peopleRepo: PeopleRepository, input: {
  name: string
  relationship?: string
  notes?: string
}): Person {
  const existing = findExactPersonByName(peopleRepo, input.name)
  if (existing) {
    const updated = peopleRepo.update(existing.id, {
      relationship: input.relationship ?? existing.relationship ?? undefined,
      notes: input.notes ?? existing.notes ?? undefined,
    })
    return updated ?? existing
  }

  return peopleRepo.create({
    name: input.name,
    relationship: input.relationship,
    notes: input.notes,
  })
}

export function seedManualDemoData(peopleRepo: PeopleRepository, options?: SeedOptions): SeedResult {
  const selfName = options?.selfName ?? 'Grandma Test'
  const targetName = options?.targetName ?? 'Ryan'

  const selfPerson = ensurePerson(peopleRepo, {
    name: selfName,
    relationship: 'self',
    notes: 'Manual test wearer identity',
  })
  peopleRepo.setSelfPerson(selfPerson.id)

  const targetPerson = ensurePerson(peopleRepo, {
    name: targetName,
    relationship: 'grandson',
    notes: 'Ryan is your grandson. He goes to UVA and is about to propose to his girlfriend.',
  })

  peopleRepo.updateProfile(targetPerson.id, {
    keyFacts: [
      'Ryan is your grandson.',
      'Ryan goes to UVA.',
      'Ryan is about to propose to his girlfriend.',
    ],
    conversationStarters: [
      'Ask Ryan how school at UVA is going.',
      'Ask Ryan whether he needs help planning the proposal.',
    ],
    lastTopics: [
      'UVA',
      'proposal plans',
    ],
  })

  return {
    selfPerson: peopleRepo.findById(selfPerson.id) ?? selfPerson,
    targetPerson: peopleRepo.findById(targetPerson.id) ?? targetPerson,
  }
}
