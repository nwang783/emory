import { describe, it, expect } from 'vitest'
import { FaceService } from '../services/face.service.js'
import { AppearanceService } from '../services/appearance.service.js'
import { validateEmbedding } from '../services/embedding-validator.service.js'
import { gradeIdentity } from '../services/graded-identity.service.js'

function createMockEmbedding(seed: number, dim: number = 512): Float32Array {
  const emb = new Float32Array(dim)
  for (let i = 0; i < dim; i++) {
    emb[i] = Math.sin(seed * (i + 1) * 0.01) * 0.1
  }
  let norm = 0
  for (let i = 0; i < dim; i++) norm += emb[i] * emb[i]
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < dim; i++) emb[i] /= norm
  return emb
}

function addNoise(emb: Float32Array, amount: number): Float32Array {
  const noisy = new Float32Array(emb.length)
  for (let i = 0; i < emb.length; i++) {
    noisy[i] = emb[i] + (Math.random() - 0.5) * amount
  }
  let norm = 0
  for (let i = 0; i < noisy.length; i++) norm += noisy[i] * noisy[i]
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < noisy.length; i++) noisy[i] /= norm
  return noisy
}

describe('FaceService.cosineSimilarity', () => {
  it('returns 1.0 for identical embeddings', () => {
    const emb = createMockEmbedding(42)
    expect(FaceService.cosineSimilarity(emb, emb)).toBeCloseTo(1.0, 4)
  })

  it('returns high similarity for slightly noisy embeddings', () => {
    const emb = createMockEmbedding(42)
    const noisy = addNoise(emb, 0.05)
    const sim = FaceService.cosineSimilarity(emb, noisy)
    expect(sim).toBeGreaterThan(0.9)
  })

  it('returns low similarity for different people', () => {
    const person1 = createMockEmbedding(1)
    const person2 = createMockEmbedding(100)
    const sim = FaceService.cosineSimilarity(person1, person2)
    expect(sim).toBeLessThan(0.5)
  })

  it('handles zero vectors', () => {
    const zero = new Float32Array(512)
    const emb = createMockEmbedding(42)
    expect(FaceService.cosineSimilarity(zero, emb)).toBe(0)
  })
})

describe('FaceService.findBestMatch', () => {
  it('finds correct person among multiple', () => {
    const service = new FaceService('nonexistent')
    const target = createMockEmbedding(42)
    const known = [
      { personId: 'a', personName: 'Alice', embedding: createMockEmbedding(1) },
      { personId: 'b', personName: 'Bob', embedding: createMockEmbedding(42) },
      { personId: 'c', personName: 'Charlie', embedding: createMockEmbedding(100) },
    ]

    const match = service.findBestMatch(target, known, 0.5)
    expect(match).not.toBeNull()
    expect(match!.personId).toBe('b')
    expect(match!.personName).toBe('Bob')
    expect(match!.similarity).toBeGreaterThan(0.9)
    expect(match!.matchMargin).toBeGreaterThan(0)
  })

  it('returns null when no match above threshold', () => {
    const service = new FaceService('nonexistent')
    const target = createMockEmbedding(999)
    const known = [
      { personId: 'a', personName: 'Alice', embedding: createMockEmbedding(1) },
    ]

    const match = service.findBestMatch(target, known, 0.9)
    expect(match).toBeNull()
  })

  it('computes correct matchMargin between people', () => {
    const service = new FaceService('nonexistent')
    const target = createMockEmbedding(42)
    const known = [
      { personId: 'a', personName: 'Alice', embedding: createMockEmbedding(42) },
      { personId: 'b', personName: 'Bob', embedding: addNoise(createMockEmbedding(42), 0.3) },
    ]

    const match = service.findBestMatch(target, known, 0.3)
    expect(match).not.toBeNull()
    expect(match!.matchMargin).toBeGreaterThan(0)
  })
})

describe('validateEmbedding', () => {
  it('accepts valid embedding', () => {
    const emb = createMockEmbedding(42)
    const result = validateEmbedding(emb)
    expect(result.valid).toBe(true)
    expect(result.qualityScore).toBeGreaterThan(0.5)
  })

  it('rejects embedding with NaN', () => {
    const emb = createMockEmbedding(42)
    emb[100] = NaN
    const result = validateEmbedding(emb)
    expect(result.valid).toBe(false)
    expect(result.issues).toContain('contains_nan')
  })

  it('rejects all-zero embedding', () => {
    const emb = new Float32Array(512)
    const result = validateEmbedding(emb)
    expect(result.valid).toBe(false)
  })

  it('rejects wrong length', () => {
    const emb = new Float32Array(256)
    const result = validateEmbedding(emb)
    expect(result.valid).toBe(false)
  })
})

describe('gradeIdentity', () => {
  it('returns definite for high confidence match', () => {
    const result = gradeIdentity(0.8, 0.2, 5, 'John', 'son')
    expect(result.grade).toBe('definite')
    expect(result.announcement).toContain('John')
    expect(result.announcement).toContain('son')
  })

  it('returns probable for medium confidence', () => {
    const result = gradeIdentity(0.55, 0.05, 2, 'Jane')
    expect(result.grade).toBe('probable')
    expect(result.announcement).toContain('I think')
  })

  it('returns uncertain for low confidence', () => {
    const result = gradeIdentity(0.42, 0.02, 1, 'Bob')
    expect(result.grade).toBe('uncertain')
    expect(result.announcement).toBeNull()
  })

  it('returns silent below threshold', () => {
    const result = gradeIdentity(0.3, 0.01, 1, 'Nobody')
    expect(result.grade).toBe('silent')
    expect(result.showInOverlay).toBe(false)
  })
})

describe('AppearanceService', () => {
  const service = new AppearanceService()

  it('clusters similar embeddings together', () => {
    const base = createMockEmbedding(42)
    const embeddings = [base, addNoise(base, 0.05), addNoise(base, 0.05)]
    const clusters = service.clusterEmbeddings(embeddings, 3)
    expect(clusters.length).toBeLessThanOrEqual(3)
    expect(clusters[0].memberCount).toBeGreaterThan(0)
  })

  it('detects appearance shift', () => {
    const base = createMockEmbedding(42)
    const clusters = service.clusterEmbeddings([base], 3)
    const different = createMockEmbedding(999)
    const result = service.detectAppearanceShift(different, clusters, 0.5)
    expect(result.shifted).toBe(true)
    expect(result.shiftMagnitude).toBeGreaterThan(0.3)
  })

  it('no shift for same appearance', () => {
    const base = createMockEmbedding(42)
    const clusters = service.clusterEmbeddings([base], 3)
    const similar = addNoise(base, 0.05)
    const result = service.detectAppearanceShift(similar, clusters, 0.5)
    expect(result.shifted).toBe(false)
  })
})
