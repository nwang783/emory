export type IdentityGrade = 'definite' | 'probable' | 'uncertain' | 'silent'

export type GradedIdentityResult = {
  grade: IdentityGrade
  announcement: string | null
  showInOverlay: boolean
}

type GradeThresholds = {
  definiteMinSimilarity: number
  definiteMinMargin: number
  definiteMinVotes: number
  probableMinSimilarity: number
  probableMinMargin: number
  uncertainMinSimilarity: number
}

const DEFAULT_GRADE_THRESHOLDS: GradeThresholds = {
  definiteMinSimilarity: 0.65,
  definiteMinMargin: 0.08,
  definiteMinVotes: 3,
  probableMinSimilarity: 0.5,
  probableMinMargin: 0.04,
  uncertainMinSimilarity: 0.4,
}

export function gradeIdentity(
  similarity: number,
  matchMargin: number,
  voteCount: number,
  personName: string,
  relationship?: string | null,
  thresholds: Partial<GradeThresholds> = {},
): GradedIdentityResult {
  const t = { ...DEFAULT_GRADE_THRESHOLDS, ...thresholds }

  if (
    similarity >= t.definiteMinSimilarity &&
    matchMargin >= t.definiteMinMargin &&
    voteCount >= t.definiteMinVotes
  ) {
    const rel = relationship ? `, your ${relationship}` : ''
    return {
      grade: 'definite',
      announcement: `That's ${personName}${rel}.`,
      showInOverlay: true,
    }
  }

  if (similarity >= t.probableMinSimilarity && matchMargin >= t.probableMinMargin) {
    return {
      grade: 'probable',
      announcement: `I think that's ${personName}.`,
      showInOverlay: true,
    }
  }

  if (similarity >= t.uncertainMinSimilarity) {
    return {
      grade: 'uncertain',
      announcement: null,
      showInOverlay: true,
    }
  }

  return {
    grade: 'silent',
    announcement: null,
    showInOverlay: false,
  }
}
