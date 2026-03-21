/**
 * Labels for people who share a graph edge with the designated self person.
 * Canonical relationship type + notes live on `relationships`, not `people`.
 */

export type GraphEdgeToSelf = {
  relationshipType: string
  notes: string | null
}

export type RelationshipEndpointRow = {
  personAId: string
  personBId: string
  relationshipType: string
  notes: string | null
}

export function buildGraphEdgesToSelf(
  self: { id: string } | null,
  rels: RelationshipEndpointRow[],
): Record<string, GraphEdgeToSelf> {
  const out: Record<string, GraphEdgeToSelf> = {}
  if (!self) return out
  for (const r of rels) {
    let other: string | null = null
    if (r.personAId === self.id) other = r.personBId
    else if (r.personBId === self.id) other = r.personAId
    if (!other) continue
    out[other] = {
      relationshipType: r.relationshipType,
      notes: r.notes,
    }
  }
  return out
}

/** Short badge / subtitle: type plus optional notes. */
export function formatGraphEdgeLabel(edge: GraphEdgeToSelf): string {
  const n = edge.notes?.trim()
  return n ? `${edge.relationshipType}: ${n}` : edge.relationshipType
}

/** Noun phrase for voice UI, e.g. friend → "friend". */
export function relationshipTypeForSpeech(relationshipType: string): string {
  return relationshipType.trim() || 'connection'
}
