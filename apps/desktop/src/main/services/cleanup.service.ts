import type {
  RetentionRepository,
  EncounterRepository,
  UnknownSightingRepository,
} from '@emory/db'

// Run once per day
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000

export class CleanupService {
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(
    private retentionRepo: RetentionRepository,
    private encounterRepo: EncounterRepository,
    private unknownRepo: UnknownSightingRepository,
  ) {}

  start(): void {
    this.runCleanup()
    this.timer = setInterval(() => this.runCleanup(), CLEANUP_INTERVAL_MS)
    console.log('[CleanupService] Started daily cleanup job')
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  runCleanup(): void {
    try {
      const configs = this.retentionRepo.getAll()

      for (const config of configs) {
        switch (config.entityType) {
          case 'encounters': {
            const deleted = this.encounterRepo.deleteOldEncounters(
              config.retentionDays,
              config.keepImportant,
            )
            if (deleted > 0) {
              console.log(
                `[CleanupService] Deleted ${deleted} old encounters (>${config.retentionDays} days)`,
              )
            }
            break
          }
          case 'unknown_sightings': {
            const deleted = this.unknownRepo.deleteOldSightings(config.retentionDays)
            if (deleted > 0) {
              console.log(
                `[CleanupService] Deleted ${deleted} old unknown sightings (>${config.retentionDays} days)`,
              )
            }
            break
          }
        }
      }
    } catch (err) {
      console.error(
        '[CleanupService] Cleanup failed:',
        err instanceof Error ? err.message : String(err),
      )
    }
  }
}
