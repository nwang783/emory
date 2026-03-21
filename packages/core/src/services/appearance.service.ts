import { FaceService } from './face.service.js'

export type EmbeddingCluster = {
  centroid: Float32Array
  memberCount: number
  avgIntraSimilarity: number
}

export type AppearanceShiftResult = {
  shifted: boolean
  shiftMagnitude: number
  suggestedAction: 'none' | 'new_cluster' | 'replace_oldest'
}

export class AppearanceService {
  clusterEmbeddings(
    embeddings: Float32Array[],
    maxClusters: number = 5,
    similarityThreshold: number = 0.7,
  ): EmbeddingCluster[] {
    if (embeddings.length === 0) return []
    if (embeddings.length === 1) {
      return [{ centroid: embeddings[0], memberCount: 1, avgIntraSimilarity: 1.0 }]
    }

    const clusters: Array<{ members: Float32Array[]; centroid: Float32Array }> = embeddings.map((e) => ({
      members: [e],
      centroid: new Float32Array(e),
    }))

    while (clusters.length > maxClusters) {
      let bestI = 0
      let bestJ = 1
      let bestSim = -1

      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const sim = FaceService.cosineSimilarity(clusters[i].centroid, clusters[j].centroid)
          if (sim > bestSim) {
            bestSim = sim
            bestI = i
            bestJ = j
          }
        }
      }

      if (bestSim < similarityThreshold) break

      const merged = [...clusters[bestI].members, ...clusters[bestJ].members]
      const centroid = computeCentroid(merged)
      clusters[bestI] = { members: merged, centroid }
      clusters.splice(bestJ, 1)
    }

    return clusters.map((c) => ({
      centroid: c.centroid,
      memberCount: c.members.length,
      avgIntraSimilarity: computeAvgIntraSimilarity(c.members, c.centroid),
    }))
  }

  findBestClusterMatch(
    embedding: Float32Array,
    clusters: EmbeddingCluster[],
  ): { clusterIndex: number; similarity: number } | null {
    if (clusters.length === 0) return null

    let bestIdx = 0
    let bestSim = -1

    for (let i = 0; i < clusters.length; i++) {
      const sim = FaceService.cosineSimilarity(embedding, clusters[i].centroid)
      if (sim > bestSim) {
        bestSim = sim
        bestIdx = i
      }
    }

    return { clusterIndex: bestIdx, similarity: bestSim }
  }

  detectAppearanceShift(
    newEmbedding: Float32Array,
    existingClusters: EmbeddingCluster[],
    shiftThreshold: number = 0.5,
  ): AppearanceShiftResult {
    if (existingClusters.length === 0) {
      return { shifted: false, shiftMagnitude: 0, suggestedAction: 'none' }
    }

    const bestMatch = this.findBestClusterMatch(newEmbedding, existingClusters)
    if (!bestMatch) {
      return { shifted: false, shiftMagnitude: 0, suggestedAction: 'none' }
    }

    const shiftMagnitude = 1 - bestMatch.similarity
    const shifted = bestMatch.similarity < shiftThreshold

    let suggestedAction: AppearanceShiftResult['suggestedAction'] = 'none'
    if (shifted) {
      suggestedAction = existingClusters.length < 5 ? 'new_cluster' : 'replace_oldest'
    }

    return { shifted, shiftMagnitude, suggestedAction }
  }

  computePersonCentroids(
    embeddings: Float32Array[],
    maxClusters: number = 5,
  ): Float32Array[] {
    const clusters = this.clusterEmbeddings(embeddings, maxClusters)
    return clusters.map((c) => c.centroid)
  }
}

function computeCentroid(embeddings: Float32Array[]): Float32Array {
  if (embeddings.length === 0) return new Float32Array(512)
  if (embeddings.length === 1) return new Float32Array(embeddings[0])

  const dim = embeddings[0].length
  const centroid = new Float32Array(dim)

  for (const emb of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += emb[i]
    }
  }

  let normSq = 0
  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length
    normSq += centroid[i] * centroid[i]
  }

  const norm = Math.sqrt(normSq)
  if (norm > 0) {
    for (let i = 0; i < dim; i++) {
      centroid[i] /= norm
    }
  }

  return centroid
}

function computeAvgIntraSimilarity(members: Float32Array[], centroid: Float32Array): number {
  if (members.length <= 1) return 1.0
  let total = 0
  for (const m of members) {
    total += FaceService.cosineSimilarity(m, centroid)
  }
  return total / members.length
}
