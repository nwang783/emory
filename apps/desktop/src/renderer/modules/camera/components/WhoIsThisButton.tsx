import { useState, useCallback } from 'react'
import { HelpCircle, Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { speak, isSpeaking, stopSpeaking } from '@/shared/lib/voice'

type IdentifiedPerson = {
  label: string
  personId: string
  similarity: number
  relationship?: string | null
}

type Props = {
  identifiedPeople: IdentifiedPerson[]
}

const HIGH_CONFIDENCE = 0.65
const MEDIUM_CONFIDENCE = 0.5

export function WhoIsThisButton({ identifiedPeople }: Props): React.JSX.Element {
  const [isAnnouncing, setIsAnnouncing] = useState(false)

  const handleClick = useCallback(async () => {
    if (isSpeaking()) {
      stopSpeaking()
      setIsAnnouncing(false)
      return
    }

    if (identifiedPeople.length === 0) {
      setIsAnnouncing(true)
      await speak("I don't recognise anyone right now.")
      setIsAnnouncing(false)
      return
    }

    setIsAnnouncing(true)

    const announcements: string[] = []
    for (const person of identifiedPeople) {
      const confidence = person.similarity

      if (confidence >= HIGH_CONFIDENCE) {
        const rel = person.relationship ? `, your ${person.relationship}` : ''
        announcements.push(`That's ${person.label}${rel}.`)
      } else if (confidence >= MEDIUM_CONFIDENCE) {
        announcements.push(`I think that's ${person.label}.`)
      } else {
        announcements.push(`I'm not sure, but it might be ${person.label}.`)
      }
    }

    const text = announcements.join(' ')
    try {
      await speak(text)
    } catch {
      // Speech synthesis unavailable
    }
    setIsAnnouncing(false)
  }, [identifiedPeople])

  return (
    <Button variant="secondary" size="sm" onClick={handleClick} className="gap-1.5">
      {isAnnouncing ? (
        <Volume2 className="h-4 w-4 animate-pulse" />
      ) : (
        <HelpCircle className="h-4 w-4" />
      )}
      Who is that?
    </Button>
  )
}
