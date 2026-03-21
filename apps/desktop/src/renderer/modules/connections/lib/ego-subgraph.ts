export type RelationshipEndpoints = {
  personAId: string
  personBId: string
}

export function reachablePersonIdsFrom(selfId: string, rels: RelationshipEndpoints[]): Set<string> {
  const adj = new Map<string, string[]>()
  for (const r of rels) {
    const a = r.personAId
    const b = r.personBId
    if (!adj.has(a)) adj.set(a, [])
    if (!adj.has(b)) adj.set(b, [])
    adj.get(a)!.push(b)
    adj.get(b)!.push(a)
  }

  const seen = new Set<string>([selfId])
  const queue = [selfId]
  let qi = 0
  while (qi < queue.length) {
    const id = queue[qi]!
    qi += 1
    for (const n of adj.get(id) ?? []) {
      if (!seen.has(n)) {
        seen.add(n)
        queue.push(n)
      }
    }
  }
  return seen
}
