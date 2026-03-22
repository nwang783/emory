import { afterEach, describe, expect, mock, test } from 'bun:test'
import { ProfileKeyFactsService } from './profile-key-facts.service.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('ProfileKeyFactsService', () => {
  test('returns normalized key facts from a structured response', async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            keyFacts: [' Likes gardening ', 'Likes gardening', '', 'Brings groceries on Sundays'],
          }),
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch

    const service = new ProfileKeyFactsService({ apiKey: 'test-key' })
    const keyFacts = await service.synthesizeKeyFacts({
      personName: 'Sarah',
      memories: [
        {
          memoryText: 'Sarah likes gardening.',
          memoryType: 'preference',
          memoryDate: '2026-03-22T15:10:00.000Z',
          confidence: 0.9,
        },
      ],
    })

    expect(keyFacts).toEqual(['Likes gardening', 'Brings groceries on Sundays'])
  })

  test('throws when the LLM returns invalid JSON', async () => {
    globalThis.fetch = mock(async () => new Response(JSON.stringify({
      choices: [{
        message: {
          content: '{"keyFacts":',
        },
      }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch

    const service = new ProfileKeyFactsService({ apiKey: 'test-key' })

    await expect(service.synthesizeKeyFacts({
      personName: 'Sarah',
      memories: [],
    })).rejects.toThrow('Profile key facts returned invalid JSON')
  })
})
