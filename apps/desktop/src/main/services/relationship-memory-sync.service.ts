import type {
  ConversationRepository,
  PeopleRepository,
  Relationship,
  RelationshipType,
} from '@emory/db'

function phraseForRelationshipType(selfName: string, relationshipType: RelationshipType): string {
  switch (relationshipType) {
    case 'friend':
      return `${selfName} is my friend.`
    case 'parent':
      return `${selfName} is my child.`
    case 'child':
      return `${selfName} is my parent.`
    case 'spouse':
      return `${selfName} is my spouse.`
    case 'sibling':
      return `${selfName} is my sibling.`
    case 'colleague':
      return `${selfName} is my colleague.`
    case 'neighbour':
      return `${selfName} is my neighbour.`
    case 'carer':
      return `${selfName} is someone I care for.`
    case 'other':
      return `${selfName} is a connection in my network (other).`
    default:
      return `${selfName} is a connection in my network (${relationshipType}).`
  }
}

export function buildGraphRelationshipMemoryText(
  selfName: string,
  relationshipType: RelationshipType,
  notes: string | null,
): string {
  const base = phraseForRelationshipType(selfName, relationshipType)
  const trimmed = notes?.trim()
  if (!trimmed) return base
  return `${base} Note: ${trimmed}`
}

/**
 * When the designated self person is one endpoint of the edge, upsert a `person_memories` row
 * on the other person so memory query and Memory Browser include the relationship.
 */
export function syncGraphRelationshipToMemory(input: {
  peopleRepo: PeopleRepository
  conversationRepo: ConversationRepository
  relationship: Relationship
}): void {
  const self = input.peopleRepo.findSelf()
  if (!self) return

  const rel = input.relationship
  const touchesSelf = rel.personAId === self.id || rel.personBId === self.id
  if (!touchesSelf) return

  const otherId = rel.personAId === self.id ? rel.personBId : rel.personAId
  const displayName = self.name.trim() || 'You'
  const memoryText = buildGraphRelationshipMemoryText(displayName, rel.relationshipType, rel.notes)

  input.conversationRepo.upsertMemoryForGraphRelationship({
    relationshipId: rel.id,
    personId: otherId,
    memoryText,
    memoryDate: new Date().toISOString(),
  })
}
