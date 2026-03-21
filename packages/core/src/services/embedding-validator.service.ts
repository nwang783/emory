export type EmbeddingValidationResult = {
  valid: boolean
  qualityScore: number
  issues: string[]
}

const EXPECTED_EMBEDDING_LENGTH = 512
const MIN_L2_NORM = 0.8
const MAX_L2_NORM = 1.2
const MIN_VARIANCE = 0.0001
const MIN_UNIQUE_VALUES = 50

export function validateEmbedding(embedding: Float32Array): EmbeddingValidationResult {
  const issues: string[] = []

  if (embedding.length !== EXPECTED_EMBEDDING_LENGTH) {
    issues.push(`unexpected_length: expected ${EXPECTED_EMBEDDING_LENGTH}, got ${embedding.length}`)
  }

  let hasNaN = false
  let hasInf = false
  for (let i = 0; i < embedding.length; i++) {
    if (Number.isNaN(embedding[i])) hasNaN = true
    if (!Number.isFinite(embedding[i])) hasInf = true
  }
  if (hasNaN) issues.push('contains_nan')
  if (hasInf) issues.push('contains_infinity')

  if (hasNaN || hasInf) {
    return { valid: false, qualityScore: 0, issues }
  }

  let sumSq = 0
  let sum = 0
  for (let i = 0; i < embedding.length; i++) {
    sumSq += embedding[i] * embedding[i]
    sum += embedding[i]
  }
  const l2Norm = Math.sqrt(sumSq)

  if (l2Norm < MIN_L2_NORM || l2Norm > MAX_L2_NORM) {
    issues.push(`abnormal_l2_norm: ${l2Norm.toFixed(4)}`)
  }

  const mean = sum / embedding.length
  let varSum = 0
  for (let i = 0; i < embedding.length; i++) {
    varSum += (embedding[i] - mean) * (embedding[i] - mean)
  }
  const variance = varSum / embedding.length

  if (variance < MIN_VARIANCE) {
    issues.push(`low_variance: ${variance.toFixed(6)}`)
  }

  const uniqueValues = new Set<number>()
  for (let i = 0; i < embedding.length; i++) {
    uniqueValues.add(Math.round(embedding[i] * 1000) / 1000)
  }
  if (uniqueValues.size < MIN_UNIQUE_VALUES) {
    issues.push(`low_diversity: only ${uniqueValues.size} unique values`)
  }

  let allZero = true
  for (let i = 0; i < embedding.length; i++) {
    if (embedding[i] !== 0) { allZero = false; break }
  }
  if (allZero) {
    issues.push('all_zeros')
  }

  let qualityScore = 1.0
  const normDeviation = Math.abs(l2Norm - 1.0)
  qualityScore -= normDeviation * 0.5
  qualityScore -= Math.max(0, (MIN_VARIANCE - variance) / MIN_VARIANCE) * 0.3
  const diversityRatio = uniqueValues.size / embedding.length
  qualityScore *= Math.min(1, diversityRatio * 5)
  qualityScore = Math.max(0, Math.min(1, qualityScore))

  return {
    valid: issues.length === 0,
    qualityScore,
    issues,
  }
}
