import { describe, expect, mock, test } from 'bun:test'
import { ConversationProcessingService } from './conversation-processing.service.js'

function createRecording() {
  return {
    id: 'recording-1',
    personId: 'target-1',
    encounterId: null,
    recordedAt: '2026-03-22T15:10:00.000Z',
    audioPath: '/tmp/test.wav',
    mimeType: 'audio/wav',
    durationMs: null,
    transcriptRawText: null,
    transcriptProvider: null,
    transcriptStatus: 'pending',
    transcriptError: null,
    extractionStatus: 'pending',
    extractionJson: null,
    extractionError: null,
    createdAt: '2026-03-22T15:10:00.000Z',
    updatedAt: '2026-03-22T15:10:00.000Z',
  }
}

describe('ConversationProcessingService', () => {
  test('refreshes key facts for every affected person after inserting memories', async () => {
    const recording = createRecording()
    const updateProfile = mock(() => null)
    const synthesizeKeyFacts = mock(async ({ personName }: { personName: string }) => [`Fact for ${personName}`])
    const getAllMemoriesByPerson = mock((personId: string) => ([
      {
        id: `${personId}-memory`,
        personId,
        recordingId: recording.id,
        relationshipId: null,
        memoryText: `Memory for ${personId}`,
        memoryType: 'fact',
        memoryDate: '2026-03-22T15:10:00.000Z',
        confidence: 0.9,
        sourceQuote: null,
        createdAt: '2026-03-22T15:10:00.000Z',
      },
    ]))

    const service = new ConversationProcessingService(
      {
        createRecording: () => recording,
        setTranscript: () => ({ ...recording, transcriptStatus: 'complete', transcriptRawText: 'Transcript text' }),
        setExtractionResult: () => ({ ...recording, extractionStatus: 'complete' }),
        addMemories: () => ([
          {
            id: 'memory-target',
            personId: 'target-1',
            recordingId: recording.id,
            relationshipId: null,
            memoryText: 'Ryan likes tea.',
            memoryType: 'preference',
            memoryDate: '2026-03-22T15:10:00.000Z',
            confidence: 0.92,
            sourceQuote: null,
            createdAt: '2026-03-22T15:10:00.000Z',
          },
          {
            id: 'memory-self',
            personId: 'self-1',
            recordingId: recording.id,
            relationshipId: null,
            memoryText: 'You had lunch with Ryan.',
            memoryType: 'event',
            memoryDate: '2026-03-22T15:10:00.000Z',
            confidence: 0.88,
            sourceQuote: null,
            createdAt: '2026-03-22T15:10:00.000Z',
          },
        ]),
        getAllMemoriesByPerson,
      } as never,
      {
        findById(personId: string) {
          if (personId === 'target-1') return { id: 'target-1', name: 'Ryan' }
          if (personId === 'self-1') return { id: 'self-1', name: 'You' }
          return null
        },
        findSelf() {
          return { id: 'self-1', name: 'You', bio: 'Retired teacher' }
        },
        updateProfile,
      } as never,
      {
        findBetween() {
          return null
        },
      } as never,
      {
        async transcribeFile() {
          return { text: 'Transcript text', provider: 'deepgram' }
        },
      } as never,
      {
        async extractMemories() {
          return {
            summary: 'summary',
            uncertainItems: [],
            memories: [
              {
                memoryText: 'Ryan likes tea.',
                memoryType: 'preference',
                memoryDate: '2026-03-22T15:10:00.000Z',
                confidence: 0.92,
                sourceQuote: 'likes tea',
                appliesToPerson: 'target_person',
              },
              {
                memoryText: 'You had lunch with Ryan.',
                memoryType: 'event',
                memoryDate: '2026-03-22T15:10:00.000Z',
                confidence: 0.88,
                sourceQuote: 'had lunch',
                appliesToPerson: 'self_person',
              },
            ],
          }
        },
      } as never,
      {
        synthesizeKeyFacts,
      } as never,
    )

    const result = await service.processRecording({
      personId: 'target-1',
      audioPath: '/tmp/test.wav',
      mimeType: 'audio/wav',
      recordedAt: '2026-03-22T15:10:00.000Z',
    })

    expect(result.memories).toHaveLength(2)
    expect(getAllMemoriesByPerson).toHaveBeenCalledTimes(2)
    expect(synthesizeKeyFacts).toHaveBeenCalledTimes(2)
    expect(updateProfile).toHaveBeenCalledTimes(2)
    expect(updateProfile).toHaveBeenCalledWith('target-1', { keyFacts: ['Fact for Ryan'] })
    expect(updateProfile).toHaveBeenCalledWith('self-1', { keyFacts: ['Fact for You'] })
  })

  test('does not fail the recording when key fact synthesis fails', async () => {
    const recording = createRecording()

    const service = new ConversationProcessingService(
      {
        createRecording: () => recording,
        setTranscript: () => ({ ...recording, transcriptStatus: 'complete', transcriptRawText: 'Transcript text' }),
        setExtractionResult: () => ({ ...recording, extractionStatus: 'complete' }),
        addMemories: () => ([
          {
            id: 'memory-target',
            personId: 'target-1',
            recordingId: recording.id,
            relationshipId: null,
            memoryText: 'Ryan likes tea.',
            memoryType: 'preference',
            memoryDate: '2026-03-22T15:10:00.000Z',
            confidence: 0.92,
            sourceQuote: null,
            createdAt: '2026-03-22T15:10:00.000Z',
          },
        ]),
        getAllMemoriesByPerson: () => ([
          {
            id: 'memory-target',
            personId: 'target-1',
            recordingId: recording.id,
            relationshipId: null,
            memoryText: 'Ryan likes tea.',
            memoryType: 'preference',
            memoryDate: '2026-03-22T15:10:00.000Z',
            confidence: 0.92,
            sourceQuote: null,
            createdAt: '2026-03-22T15:10:00.000Z',
          },
        ]),
      } as never,
      {
        findById() {
          return { id: 'target-1', name: 'Ryan' }
        },
        findSelf() {
          return null
        },
        updateProfile() {
          throw new Error('should not be called after synthesis failure')
        },
      } as never,
      {
        findBetween() {
          return null
        },
      } as never,
      {
        async transcribeFile() {
          return { text: 'Transcript text', provider: 'deepgram' }
        },
      } as never,
      {
        async extractMemories() {
          return {
            summary: 'summary',
            uncertainItems: [],
            memories: [
              {
                memoryText: 'Ryan likes tea.',
                memoryType: 'preference',
                memoryDate: '2026-03-22T15:10:00.000Z',
                confidence: 0.92,
                sourceQuote: 'likes tea',
                appliesToPerson: 'target_person',
              },
            ],
          }
        },
      } as never,
      {
        async synthesizeKeyFacts() {
          throw new Error('openrouter timeout')
        },
      } as never,
    )

    const result = await service.processRecording({
      personId: 'target-1',
      audioPath: '/tmp/test.wav',
      mimeType: 'audio/wav',
      recordedAt: '2026-03-22T15:10:00.000Z',
    })

    expect(result.recording.id).toBe(recording.id)
    expect(result.memories).toHaveLength(1)
  })
})
