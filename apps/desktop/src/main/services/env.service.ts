import { existsSync } from 'node:fs'
import path from 'node:path'
import { config as loadDotEnv } from 'dotenv'

function getCandidateEnvPaths(): string[] {
  const candidates = new Set<string>()
  let currentDir = process.cwd()

  for (let depth = 0; depth < 5; depth += 1) {
    candidates.add(path.resolve(currentDir, '.env'))
    candidates.add(path.resolve(currentDir, '.env.local'))
    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  candidates.add(path.resolve(__dirname, '../../.env'))
  candidates.add(path.resolve(__dirname, '../../.env.local'))
  candidates.add(path.resolve(__dirname, '../../../../.env'))
  candidates.add(path.resolve(__dirname, '../../../../.env.local'))

  return Array.from(candidates)
}

export function loadEnvironment(): string[] {
  const loadedPaths: string[] = []

  for (const envPath of getCandidateEnvPaths()) {
    if (!existsSync(envPath)) continue
    loadDotEnv({ path: envPath, override: false })
    loadedPaths.push(envPath)
  }

  return loadedPaths
}
