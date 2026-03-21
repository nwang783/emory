let speaking = false
let activeAudio: HTMLAudioElement | null = null
let activeObjectUrl: string | null = null

function cleanup(): void {
  if (activeAudio) {
    activeAudio.pause()
    activeAudio.src = ''
    activeAudio = null
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl)
    activeObjectUrl = null
  }
  speaking = false
}

export async function speak(text: string): Promise<void> {
  const trimmedText = text.trim()
  if (!trimmedText) {
    throw new Error('Speech text was empty')
  }

  if (speaking) {
    stopSpeaking()
  }

  const { audioBytes, mimeType } = await window.emoryApi.tts.synthesize({ text: trimmedText })
  const blob = new Blob([audioBytes], { type: mimeType || 'audio/wav' })
  const objectUrl = URL.createObjectURL(blob)
  const audio = new Audio(objectUrl)

  activeAudio = audio
  activeObjectUrl = objectUrl
  speaking = true

  return new Promise((resolve, reject) => {
    audio.onended = () => {
      cleanup()
      resolve()
    }
    audio.onerror = () => {
      cleanup()
      reject(new Error('Audio playback failed'))
    }

    audio.play().catch((error) => {
      cleanup()
      reject(error)
    })
  })
}

export function isSpeaking(): boolean {
  return speaking
}

export function stopSpeaking(): void {
  cleanup()
}
