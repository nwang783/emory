import { writeFile, unlink, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// MARK: - Audio Processor
// Accumulates PCM audio chunks tagged with visible person IDs.
// When a person leaves frame or timeout hits, triggers transcription.

export class AudioProcessor {
  private activeConversations: Map<string, ConversationAccumulator> = new Map()
  private onTranscript: (personId: string, text: string, memories: { text: string; type?: string }[]) => void
  private maxDurationMs = 30_000 // Force finalize after 30 seconds

  // These will be set after services are initialized
  private transcribeAudio: ((audioPath: string) => Promise<string>) | null = null
  private extractMemories: ((personId: string, transcript: string) => Promise<{ text: string; type?: string }[]>) | null = null

  constructor(
    onTranscript: (personId: string, text: string, memories: { text: string; type?: string }[]) => void,
  ) {
    this.onTranscript = onTranscript
  }

  setTranscriber(fn: (audioPath: string) => Promise<string>): void {
    this.transcribeAudio = fn
  }

  setMemoryExtractor(fn: (personId: string, transcript: string) => Promise<{ text: string; type?: string }[]>): void {
    this.extractMemories = fn
  }

  addChunk(pcmData: Buffer, sampleRate: number, channels: number, visiblePersonIds: Set<string>): void {
    if (visiblePersonIds.size === 0) return

    // Associate audio with the first visible person (simplification for hackathon)
    const personId = visiblePersonIds.values().next().value
    if (!personId) return

    let conversation = this.activeConversations.get(personId)
    if (!conversation) {
      conversation = {
        personId,
        chunks: [],
        startTime: Date.now(),
        lastChunkTime: Date.now(),
        sampleRate,
        channels,
        totalSamples: 0,
      }
      this.activeConversations.set(personId, conversation)
    }

    conversation.chunks.push(pcmData)
    conversation.lastChunkTime = Date.now()
    conversation.totalSamples += pcmData.length / (2 * channels) // 16-bit samples

    // Check if we should force-finalize (max duration)
    const durationMs = (conversation.totalSamples / sampleRate) * 1000
    if (durationMs >= this.maxDurationMs) {
      this.finalizeConversation(personId)
    }
  }

  // Called when a person leaves the frame
  onPersonLeft(personId: string): void {
    // Delay finalization by 5 seconds in case they come back
    setTimeout(() => {
      const conversation = this.activeConversations.get(personId)
      if (conversation && Date.now() - conversation.lastChunkTime > 4000) {
        this.finalizeConversation(personId)
      }
    }, 5000)
  }

  async finalizeConversation(personId: string): Promise<void> {
    const conversation = this.activeConversations.get(personId)
    if (!conversation || conversation.chunks.length === 0) {
      this.activeConversations.delete(personId)
      return
    }

    this.activeConversations.delete(personId)

    if (!this.transcribeAudio) {
      console.log('[AudioProcessor] No transcriber configured, skipping')
      return
    }

    try {
      // Concatenate all chunks
      const totalLength = conversation.chunks.reduce((sum, c) => sum + c.length, 0)
      const combined = Buffer.alloc(totalLength)
      let offset = 0
      for (const chunk of conversation.chunks) {
        chunk.copy(combined, offset)
        offset += chunk.length
      }

      // Write WAV to temp file
      const tmpDir = path.join(tmpdir(), 'emory-bridge')
      await mkdir(tmpDir, { recursive: true })
      const wavPath = path.join(tmpDir, `${randomUUID()}.wav`)
      const wavBuffer = pcmToWav(combined, conversation.sampleRate, conversation.channels)
      await writeFile(wavPath, wavBuffer)

      console.log(`[AudioProcessor] Transcribing ${(combined.length / 1024).toFixed(0)}KB audio for person ${personId}`)

      // Transcribe
      const transcript = await this.transcribeAudio(wavPath)

      // Clean up temp file
      await unlink(wavPath).catch(() => {})

      if (!transcript || transcript.trim().length === 0) {
        console.log('[AudioProcessor] Empty transcript, skipping memory extraction')
        return
      }

      console.log(`[AudioProcessor] Transcript: "${transcript.substring(0, 100)}..."`)

      // Extract memories
      let memories: { text: string; type?: string }[] = []
      if (this.extractMemories) {
        try {
          memories = await this.extractMemories(personId, transcript)
        } catch (err) {
          console.error('[AudioProcessor] Memory extraction failed:', err)
        }
      }

      // Send results back
      this.onTranscript(personId, transcript, memories)
    } catch (err) {
      console.error('[AudioProcessor] Finalization failed:', err instanceof Error ? err.message : err)
    }
  }

  finalizeAll(): void {
    for (const personId of this.activeConversations.keys()) {
      this.finalizeConversation(personId)
    }
  }
}

interface ConversationAccumulator {
  personId: string
  chunks: Buffer[]
  startTime: number
  lastChunkTime: number
  sampleRate: number
  channels: number
  totalSamples: number
}

// Convert raw 16-bit PCM to WAV format
function pcmToWav(pcmData: Buffer, sampleRate: number, channels: number): Buffer {
  const bitsPerSample = 16
  const byteRate = sampleRate * channels * (bitsPerSample / 8)
  const blockAlign = channels * (bitsPerSample / 8)
  const dataSize = pcmData.length
  const headerSize = 44

  const wav = Buffer.alloc(headerSize + dataSize)

  // RIFF header
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + dataSize, 4)
  wav.write('WAVE', 8)

  // fmt chunk
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)           // chunk size
  wav.writeUInt16LE(1, 20)            // PCM format
  wav.writeUInt16LE(channels, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(byteRate, 28)
  wav.writeUInt16LE(blockAlign, 32)
  wav.writeUInt16LE(bitsPerSample, 34)

  // data chunk
  wav.write('data', 36)
  wav.writeUInt32LE(dataSize, 40)
  pcmData.copy(wav, 44)

  return wav
}
