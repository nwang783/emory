import { ipcMain } from 'electron'
import type { CartesiaTtsService } from '../services/cartesia-tts.service.js'

type SynthesizeSpeechInput = {
  text: string
}

export function registerTtsIpc(ttsService: CartesiaTtsService): void {
  ipcMain.handle('tts:synthesize', async (_event, input: SynthesizeSpeechInput) => {
    try {
      if (!input || typeof input.text !== 'string') {
        return { success: false as const, error: 'text is required' }
      }

      const result = await ttsService.synthesize({ text: input.text })
      return {
        success: true as const,
        mimeType: result.mimeType,
        audioBytes: result.audioBytes,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { success: false as const, error: message }
    }
  })
}
