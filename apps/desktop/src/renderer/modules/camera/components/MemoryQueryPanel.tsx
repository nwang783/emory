import { useState } from 'react'
import { Loader2, MessageSquareText, Volume2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { speak, isSpeaking, stopSpeaking } from '@/shared/lib/voice'

type QueryState = {
  transcript: string
  answer: string
  confidence: 'high' | 'medium' | 'low'
}

export function MemoryQueryPanel(): React.JSX.Element {
  const [queryText, setQueryText] = useState('')
  const [result, setResult] = useState<QueryState | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isPlayingAnswer, setIsPlayingAnswer] = useState(false)

  const handleAsk = async (): Promise<void> => {
    const trimmed = queryText.trim()
    if (!trimmed || isLoading) return

    setIsLoading(true)
    try {
      const response = await window.emoryApi.conversation.queryMemoriesFromText({ queryText: trimmed })
      if (!response.success) {
        throw new Error(response.error ?? 'Query failed')
      }

      setResult({
        transcript: response.queryTranscript,
        answer: response.answer.answer,
        confidence: response.answer.confidence,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Query failed'
      toast.error('Failed to query memories', { description: message })
    } finally {
      setIsLoading(false)
    }
  }

  const handlePlayAnswer = async (): Promise<void> => {
    if (!result?.answer) return

    if (isSpeaking()) {
      stopSpeaking()
      setIsPlayingAnswer(false)
      return
    }

    setIsPlayingAnswer(true)
    try {
      await speak(result.answer)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Playback failed'
      toast.error('Failed to play answer', { description: message })
    } finally {
      setIsPlayingAnswer(false)
    }
  }

  return (
    <Card className="w-full max-w-3xl gap-4 py-4">
      <CardHeader className="gap-1 px-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="h-4 w-4" />
          Query Simulator
        </CardTitle>
        <CardDescription>
          Simulate a Ray-Ban question with text, run the existing memory backend, and play the answer through Cartesia.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        <Textarea
          value={queryText}
          onChange={(event) => setQueryText(event.target.value)}
          placeholder="Try: Who is Ryan? or What did I do at 2 PM today?"
          className="min-h-20 resize-none"
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleAsk()} disabled={isLoading || queryText.trim().length === 0}>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
            Ask Backend
          </Button>
          <Button
            variant="secondary"
            onClick={() => void handlePlayAnswer()}
            disabled={!result?.answer}
          >
            <Volume2 className={isPlayingAnswer ? 'h-4 w-4 animate-pulse' : 'h-4 w-4'} />
            {isPlayingAnswer ? 'Stop Audio' : 'Play Answer'}
          </Button>
        </div>

        {result ? (
          <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3 text-sm">
            <p>
              <span className="font-medium">Query:</span> {result.transcript}
            </p>
            <p>
              <span className="font-medium">Answer:</span> {result.answer}
            </p>
            <p className="text-xs text-muted-foreground uppercase tracking-wide">
              Confidence: {result.confidence}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
