import { app } from 'electron'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const CONVERSATIONS_ROOT_SEGMENT = 'conversations'

/** Root folder for all conversation audio (`<userData>/conversations`). Year/month subfolders are created per recording. */
export function getConversationsRootDir(): string {
  return path.join(app.getPath('userData'), CONVERSATIONS_ROOT_SEGMENT)
}

export function extensionFromMimeType(mimeType: string): string {
  const m = mimeType.toLowerCase()
  if (m.includes('wav')) return 'wav'
  if (m.includes('webm')) return 'webm'
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('mp4') || m.includes('m4a')) return 'm4a'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  return 'bin'
}

/**
 * Recording pipeline (file stage only):
 * bytes -> ensure dirs -> write disk -> return canonical path for DB row.
 */
export class ConversationStorageService {
  async saveRecording(input: {
    recordingId: string
    mimeType: string
    bytes: Uint8Array
    recordedAt: Date
  }): Promise<{ audioPath: string; mimeType: string }> {
    const y = input.recordedAt.getUTCFullYear()
    const mo = String(input.recordedAt.getUTCMonth() + 1).padStart(2, '0')
    const dir = path.join(getConversationsRootDir(), String(y), mo)
    await mkdir(dir, { recursive: true })
    const ext = extensionFromMimeType(input.mimeType)
    const fileName = `${input.recordingId}.${ext}`
    const audioPath = path.join(dir, fileName)
    await writeFile(audioPath, Buffer.from(input.bytes))
    return { audioPath, mimeType: input.mimeType }
  }

  async removeFile(audioPath: string): Promise<void> {
    await unlink(audioPath).catch(() => {})
  }
}
