import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { SqliteAdapter, ConversationRepository, PeopleRepository, RelationshipRepository } from '@emory/db'
import { ConversationProcessingService } from '../src/main/services/conversation-processing.service.js'
import { DeepgramService } from '../src/main/services/deepgram.service.js'
import { loadEnvironment } from '../src/main/services/env.service.js'
import { MemoryExtractionService } from '../src/main/services/memory-extraction.service.js'
import { ProfileKeyFactsService } from '../src/main/services/profile-key-facts.service.js'
import { seedManualDemoData } from './manual-demo-data.js'

type CliOptions = {
  audioPath: string
  mimeType: string
  recordedAt: string
  durationMs: number | null
  dbPath: string
  selfName: string
  targetName: string
}

function parseArgs(argv: string[]): CliOptions {
  const args = new Map<string, string>()

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]
    if (!current.startsWith('--')) continue
    const value = argv[index + 1]
    if (!value || value.startsWith('--')) {
      args.set(current, 'true')
      continue
    }
    args.set(current, value)
    index += 1
  }

  const audioPath = args.get('--audio-path')
  if (!audioPath) {
    throw new Error('Missing required --audio-path')
  }

  const recordedAt = args.get('--recorded-at') ?? new Date().toISOString()
  const durationValue = args.get('--duration-ms')
  const durationMs = durationValue ? Number(durationValue) : null

  return {
    audioPath,
    mimeType: args.get('--mime-type') ?? inferMimeType(audioPath),
    recordedAt,
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    dbPath: args.get('--db-path') ?? path.resolve(process.cwd(), '../../tmp/manual-test/emory.db'),
    selfName: args.get('--self-name') ?? 'Grandma Test',
    targetName: args.get('--target-name') ?? 'Ryan',
  }
}

function inferMimeType(audioPath: string): string {
  const extension = path.extname(audioPath).toLowerCase()
  switch (extension) {
    case '.wav':
      return 'audio/wav'
    case '.webm':
      return 'audio/webm'
    case '.m4a':
      return 'audio/mp4'
    case '.mp3':
      return 'audio/mpeg'
    case '.mp4':
      return 'audio/mp4'
    default:
      throw new Error('Unable to infer mime type from file extension. Pass --mime-type explicitly.')
  }
}

async function main(): Promise<void> {
  loadEnvironment()
  const options = parseArgs(process.argv.slice(2))

  await mkdir(path.dirname(options.dbPath), { recursive: true })

  const adapter = new SqliteAdapter(options.dbPath)
  adapter.initialize()

  const peopleRepo = new PeopleRepository(adapter)
  const conversationRepo = new ConversationRepository(adapter)
  const relationshipRepo = new RelationshipRepository(adapter)
  const deepgramService = new DeepgramService()
  const memoryExtractionService = new MemoryExtractionService()
  const profileKeyFactsService = new ProfileKeyFactsService()
  const processingService = new ConversationProcessingService(
    conversationRepo,
    peopleRepo,
    relationshipRepo,
    deepgramService,
    memoryExtractionService,
    profileKeyFactsService,
  )

  const { selfPerson, targetPerson } = seedManualDemoData(peopleRepo, {
    selfName: options.selfName,
    targetName: options.targetName,
  })

  const result = await processingService.processRecording({
    personId: targetPerson.id,
    audioPath: options.audioPath,
    mimeType: options.mimeType,
    recordedAt: options.recordedAt,
    durationMs: options.durationMs,
  })

  const latestMemories = conversationRepo.getMemoriesByPerson(targetPerson.id, 10)

  console.log(JSON.stringify({
    dbPath: options.dbPath,
    selfPerson,
    targetPerson,
    recording: result.recording,
    insertedMemories: result.memories,
    latestMemories,
  }, null, 2))

  adapter.close()
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
