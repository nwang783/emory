import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import {
  RecognitionAnnouncementService,
} from './recognition-announcement.service.js'
import {
  RecognitionContextService,
  getLatestConversationSummary,
} from './recognition-context.service.js'

const selfPerson = { id: 'self-1', name: 'Nathan', relationship: null }
const targetPerson = { id: 'person-1', name: 'Ryan', relationship: 'Grandson' }

function createContextService(options?: {
  relationship?: string | null
  graphRelationship?: string | null
  recordings?: Array<{
    recordedAt: string
    extractionStatus: 'pending' | 'complete' | 'failed'
    extractionJson: { summary: string } | null
  }>
}) {
  const relationship = options && 'relationship' in options ? options.relationship ?? null : targetPerson.relationship
  const recordings = options?.recordings ?? []
  const graphRelationship = options?.graphRelationship ?? null

  return new RecognitionContextService(
    {
      findById(personId: string) {
        if (personId === targetPerson.id) {
          return { ...targetPerson, relationship }
        }
        if (personId === selfPerson.id) {
          return selfPerson
        }
        return null
      },
      findSelf() {
        return selfPerson
      },
    } as never,
    {
      getRecordingsByPerson(personId: string) {
        expect(personId).toBe(targetPerson.id)
        return recordings.map((recording, index) => ({
          id: `recording-${index}`,
          personId,
          encounterId: null,
          recordedAt: recording.recordedAt,
          audioPath: `/tmp/${index}.wav`,
          mimeType: 'audio/wav',
          durationMs: 1000,
          transcriptRawText: null,
          transcriptProvider: null,
          transcriptStatus: 'complete',
          transcriptError: null,
          extractionStatus: recording.extractionStatus,
          extractionJson: recording.extractionJson,
          extractionError: null,
          createdAt: recording.recordedAt,
          updatedAt: recording.recordedAt,
        }))
      },
    } as never,
    {
      findBetween(personAId: string, personBId: string) {
        expect(personAId).toBe(selfPerson.id)
        expect(personBId).toBe(targetPerson.id)
        if (!graphRelationship) return null
        return {
          id: 'relationship-1',
          personAId,
          personBId,
          relationshipType: graphRelationship,
          notes: null,
          createdAt: '2026-03-21T00:00:00.000Z',
        }
      },
    } as never,
  )
}

describe('RecognitionContextService', () => {
  test('finds the newest non-empty latest conversation summary', () => {
    const latest = getLatestConversationSummary(
      {
        getRecordingsByPerson() {
          return [
            {
              id: 'a',
              personId: targetPerson.id,
              encounterId: null,
              recordedAt: '2026-03-21T10:00:00.000Z',
              audioPath: '/tmp/a.wav',
              mimeType: 'audio/wav',
              durationMs: 1000,
              transcriptRawText: null,
              transcriptProvider: null,
              transcriptStatus: 'complete',
              transcriptError: null,
              extractionStatus: 'complete',
              extractionJson: { summary: '   ' },
              extractionError: null,
              createdAt: '2026-03-21T10:00:00.000Z',
              updatedAt: '2026-03-21T10:00:00.000Z',
            },
            {
              id: 'b',
              personId: targetPerson.id,
              encounterId: null,
              recordedAt: '2026-03-20T10:00:00.000Z',
              audioPath: '/tmp/b.wav',
              mimeType: 'audio/wav',
              durationMs: 1000,
              transcriptRawText: null,
              transcriptProvider: null,
              transcriptStatus: 'complete',
              transcriptError: null,
              extractionStatus: 'complete',
              extractionJson: { summary: 'Talked about school and his proposal plans.' },
              extractionError: null,
              createdAt: '2026-03-20T10:00:00.000Z',
              updatedAt: '2026-03-20T10:00:00.000Z',
            },
          ]
        },
      } as never,
      targetPerson.id,
    )

    expect(latest).toEqual({
      summary: 'Talked about school and his proposal plans.',
      recordedAt: '2026-03-20T10:00:00.000Z',
    })
  })

  test('builds a speech-friendly announcement with relationship fallback', () => {
    const service = createContextService({
      relationship: null,
      graphRelationship: 'friend',
      recordings: [{
        recordedAt: '2026-03-20T10:00:00.000Z',
        extractionStatus: 'complete',
        extractionJson: { summary: 'You talked about dinner plans and his new apartment.' },
      }],
    })

    const context = service.getContext(targetPerson.id)

    expect(context).not.toBeNull()
    expect(context).toMatchObject({
      personId: targetPerson.id,
      relationshipLabel: 'friend',
      latestConversationSummary: 'You talked about dinner plans and his new apartment.',
    })
    expect(context?.announcementText).toBe(
      'Ryan. Your friend. Last time, you talked about dinner plans and his new apartment.',
    )
  })
})

describe('RecognitionAnnouncementService', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `emory-recognition-announcements-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    await mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  })

  test('caches synthesized audio by fingerprint', async () => {
    let synthCalls = 0
    const contextService = createContextService({
      recordings: [{
        recordedAt: '2026-03-20T10:00:00.000Z',
        extractionStatus: 'complete',
        extractionJson: { summary: 'You talked about school.' },
      }],
    })

    const service = new RecognitionAnnouncementService(
      contextService,
      {
        getModelId() {
          return 'sonic-3'
        },
        getVoiceId() {
          return 'voice-1'
        },
        async synthesize() {
          synthCalls += 1
          return {
            mimeType: 'audio/wav',
            audioBytes: new Uint8Array([1, 2, 3, 4]),
          }
        },
      } as never,
      tempDir,
    )

    const first = await service.getAnnouncement(targetPerson.id)
    const second = await service.getAnnouncement(targetPerson.id)

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(synthCalls).toBe(1)
    expect(Array.from(first?.audioBytes ?? [])).toEqual([1, 2, 3, 4])
    expect(Array.from(second?.audioBytes ?? [])).toEqual([1, 2, 3, 4])
    expect(first?.fingerprint).toBe(second?.fingerprint)
  })
})
