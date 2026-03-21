let speaking = false

export function speak(text: string, rate: number = 0.9): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!window.speechSynthesis) {
      reject(new Error('Speech synthesis not available'))
      return
    }

    if (speaking) {
      window.speechSynthesis.cancel()
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = rate
    utterance.pitch = 1.0
    utterance.volume = 1.0

    const voices = window.speechSynthesis.getVoices()
    const englishVoice = voices.find((v) => v.lang.startsWith('en') && v.localService)
    if (englishVoice) utterance.voice = englishVoice

    utterance.onstart = () => {
      speaking = true
    }
    utterance.onend = () => {
      speaking = false
      resolve()
    }
    utterance.onerror = (e) => {
      speaking = false
      reject(e)
    }

    window.speechSynthesis.speak(utterance)
  })
}

export function isSpeaking(): boolean {
  return speaking
}

export function stopSpeaking(): void {
  speaking = false
  window.speechSynthesis?.cancel()
}
