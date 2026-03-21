export type IdentityTrack = {
  current: { x: number; y: number; w: number; h: number }
  identity: { personId: string; similarity: number } | null
}

/** Largest face bbox by area; tie-break higher similarity. */
export function pickPrimarySubject(tracks: readonly IdentityTrack[]): {
  personId: string
  similarity: number
} | null {
  let best: { personId: string; similarity: number; area: number } | null = null
  for (const t of tracks) {
    if (!t.identity) continue
    const area = t.current.w * t.current.h
    if (!best) {
      best = { personId: t.identity.personId, similarity: t.identity.similarity, area }
      continue
    }
    if (area > best.area || (area === best.area && t.identity.similarity > best.similarity)) {
      best = { personId: t.identity.personId, similarity: t.identity.similarity, area }
    }
  }
  return best ? { personId: best.personId, similarity: best.similarity } : null
}

export function hasIdentityPresent(tracks: readonly IdentityTrack[], personId: string): boolean {
  return tracks.some((t) => t.identity?.personId === personId)
}
