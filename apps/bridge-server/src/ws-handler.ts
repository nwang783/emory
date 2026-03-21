import type { WebSocket } from 'ws'
import {
  parseBinaryMessage,
  MSG_VIDEO_FRAME,
  MSG_AUDIO_CHUNK,
  MSG_SESSION_START,
  MSG_SESSION_END,
} from './protocol.js'
import type { FrameMetadata, AudioChunkMetadata, OutgoingMessage } from './protocol.js'
import type { FrameProcessor } from './frame-processor.js'
import type { AudioProcessor } from './audio-processor.js'

// MARK: - WebSocket Handler
// Routes incoming binary messages to frame/audio processors.
// Sends results back as JSON text messages.

export class WsHandler {
  private ws: WebSocket
  private frameProcessor: FrameProcessor
  private audioProcessor: AudioProcessor

  constructor(ws: WebSocket, frameProcessor: FrameProcessor, audioProcessor: AudioProcessor) {
    this.ws = ws
    this.frameProcessor = frameProcessor
    this.audioProcessor = audioProcessor

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        this.handleBinary(Buffer.from(data))
      } else {
        this.handleText(data.toString())
      }
    })

    ws.on('close', () => {
      console.log('[WS] Client disconnected')
      // Finalize any in-progress conversations
      audioProcessor.finalizeAll()
    })

    ws.on('error', (err) => {
      console.error('[WS] Error:', err.message)
    })
  }

  send(message: OutgoingMessage): void {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  private handleBinary(data: Buffer): void {
    const parsed = parseBinaryMessage(data)
    if (!parsed) {
      console.warn('[WS] Failed to parse binary message')
      return
    }

    switch (parsed.messageType) {
      case MSG_VIDEO_FRAME: {
        const meta = parsed.metadata as unknown as FrameMetadata
        this.frameProcessor.enqueue(
          parsed.payload,
          meta.w || 720,
          meta.h || 1280,
          meta.ts || Date.now() / 1000,
        )
        break
      }

      case MSG_AUDIO_CHUNK: {
        const meta = parsed.metadata as unknown as AudioChunkMetadata
        this.audioProcessor.addChunk(
          parsed.payload,
          meta.sr || 48000,
          meta.ch || 1,
          this.frameProcessor.visiblePersonIds,
        )
        break
      }

      case MSG_SESSION_START:
        console.log('[WS] Session started')
        break

      case MSG_SESSION_END:
        console.log('[WS] Session ended')
        this.audioProcessor.finalizeAll()
        break

      default:
        console.warn(`[WS] Unknown message type: ${parsed.messageType}`)
    }
  }

  private handleText(data: string): void {
    // Currently no text messages expected from iOS
    console.log('[WS] Text message:', data)
  }
}
