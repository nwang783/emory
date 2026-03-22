import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { ConversationIngestService } from './conversation-ingest.service.js'

type RecordingRow = {
  id: string
  personId: string
  encounterId: string | null
  recordedAt: string
  audioPath: string
  mimeType: string
  durationMs: number | null
}

describe('ConversationIngestService', () => {
  let tempDir: string

  beforeEach(async () => {
    tempDir = path.join(tmpdir(), `emory-conversation-ingest-${Date.now()}-${Math.random().toString(16).slice(2)}`)
    await mkdir(tempDir, { recursive: true })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true }).catch(() => {})
  })

  test('saves bytes, links the active encounter, and runs processing', async () => {
    const person = { id: 'person-1', name: 'Ryan' }
    const encounter = { id: 'encounter-1' }
    const recordings = new Map<string, RecordingRow>()
    const processedIds: string[] = []

    const service = new ConversationIngestService(
      {
        async processRecording(input) {
          processedIds.push(input.recordingId ?? '')
          const recording = recordings.get(input.recordingId ?? '')
          if (!recording) throw new Error('missing recording')
          return { recording, memories: [] }
        },
      } as never,
      {
        createRecording(input) {
          const row: RecordingRow = {
            id: input.id ?? 'generated-id',
            personId: input.personId,
            encounterId: input.encounterId ?? null,
            recordedAt: input.recordedAt,
            audioPath: input.audioPath,
            mimeType: input.mimeType,
            durationMs: input.durationMs ?? null,
          }
          recordings.set(row.id, row)
          return row
        },
        deleteRecordingById(id) {
          return recordings.delete(id)
        },
      } as never,
      {
        findActiveEncounter(personId, sessionId) {
          expect(personId).toBe(person.id)
          expect(sessionId).toBe('session-1')
          return encounter
        },
      } as never,
      {
        findById(personId) {
          return personId === person.id ? person : null
        },
      } as never,
      () => 'session-1',
      {
        async saveRecording(input) {
          const audioPath = path.join(tempDir, `${input.recordingId}.wav`)
          await writeFile(audioPath, input.bytes)
          return { audioPath, mimeType: input.mimeType }
        },
        async removeFile(audioPath) {
          await unlink(audioPath).catch(() => {})
        },
      },
    )

    const result = await service.saveAndProcessBytes({
      personId: person.id,
      recordedAt: '2026-03-21T22:55:00.000Z',
      mimeType: 'audio/wav',
      durationMs: 4200,
      audioBytes: new Uint8Array([1, 2, 3, 4]),
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(processedIds).toHaveLength(1)
    expect(result.recording.personId).toBe(person.id)
    expect(result.recording.encounterId).toBe(encounter.id)
    expect(result.recording.audioPath.endsWith('.wav')).toBe(true)
  })

  test('rolls back the db row and saved file when processing fails', async () => {
    const person = { id: 'person-1', name: 'Ryan' }
    const recordings = new Map<string, RecordingRow>()
    let savedAudioPath: string | null = null

    const service = new ConversationIngestService(
      {
        async processRecording() {
          throw new Error('processing broke')
        },
      } as never,
      {
        createRecording(input) {
          const row: RecordingRow = {
            id: input.id ?? 'generated-id',
            personId: input.personId,
            encounterId: input.encounterId ?? null,
            recordedAt: input.recordedAt,
            audioPath: input.audioPath,
            mimeType: input.mimeType,
            durationMs: input.durationMs ?? null,
          }
          recordings.set(row.id, row)
          return row
        },
        deleteRecordingById(id) {
          return recordings.delete(id)
        },
      } as never,
      {
        findActiveEncounter() {
          return null
        },
      } as never,
      {
        findById(personId) {
          return personId === person.id ? person : null
        },
      } as never,
      () => null,
      {
        async saveRecording(input) {
          const audioPath = path.join(tempDir, `${input.recordingId}.wav`)
          savedAudioPath = audioPath
          await writeFile(audioPath, input.bytes)
          return { audioPath, mimeType: input.mimeType }
        },
        async removeFile(audioPath) {
          await unlink(audioPath).catch(() => {})
        },
      },
    )

    const result = await service.saveAndProcessBytes({
      personId: person.id,
      recordedAt: '2026-03-21T22:55:00.000Z',
      mimeType: 'audio/wav',
      durationMs: 4200,
      audioBytes: new Uint8Array([7, 8, 9]),
    })

    expect(result).toMatchObject({
      success: false,
      error: 'Failed to process recording: processing broke',
    })
    expect(recordings.size).toBe(0)
    expect(savedAudioPath).not.toBeNull()
    const exists = await Bun.file(savedAudioPath!).exists()
    expect(exists).toBe(false)
  })
})
