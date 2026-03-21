import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { SqliteAdapter, ConversationRepository, PeopleRepository, RelationshipRepository } from '@emory/db'
import { DeepgramService } from '../src/main/services/deepgram.service.js'
import { loadEnvironment } from '../src/main/services/env.service.js'
import { MemoryAnswerService } from '../src/main/services/memory-answer.service.js'
import { MemoryQueryService } from '../src/main/services/memory-query.service.js'
import { MemoryQueryUnderstandingService } from '../src/main/services/memory-query-understanding.service.js'
import { seedManualDemoData } from './manual-demo-data.js'

type CliOptions = {
  audioPath: string
  mimeType: string
  askedAt: string
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

  return {
    audioPath,
    mimeType: args.get('--mime-type') ?? inferMimeType(audioPath),
    askedAt: args.get('--asked-at') ?? new Date().toISOString(),
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
  const understandingService = new MemoryQueryUnderstandingService()
  const answerService = new MemoryAnswerService()
  const queryService = new MemoryQueryService(
    conversationRepo,
    peopleRepo,
    relationshipRepo,
    deepgramService,
    understandingService,
    answerService,
  )

  const seed = seedManualDemoData(peopleRepo, {
    selfName: options.selfName,
    targetName: options.targetName,
  })

  const result = await queryService.queryFromAudio({
    audioPath: options.audioPath,
    mimeType: options.mimeType,
    askedAt: options.askedAt,
  })

  console.log(JSON.stringify({
    dbPath: options.dbPath,
    selfPerson: seed.selfPerson,
    targetPerson: seed.targetPerson,
    ...result,
  }, null, 2))

  adapter.close()
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
