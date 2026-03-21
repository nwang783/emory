import { useFaceStore } from '../stores/face.store'
import { useActivityStore } from '../stores/activity.store'
import { useSettingsStore } from '../stores/settings.store'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

const STATUS_VARIANT: Record<ModelStatus, 'default' | 'destructive' | 'secondary' | 'outline'> = {
  idle: 'outline',
  loading: 'secondary',
  ready: 'default',
  error: 'destructive',
}

export function StatusBar(): React.JSX.Element {
  const modelStatus = useFaceStore((s) => s.modelStatus) as ModelStatus
  const fpsCount = useFaceStore((s) => s.fpsCount)
  const detections = useFaceStore((s) => s.detections)
  const matches = useFaceStore((s) => s.matches)
  const processingTimeMs = useFaceStore((s) => s.processingTimeMs)
  const isProcessing = useFaceStore((s) => s.isProcessing)
  const error = useFaceStore((s) => s.error)
  const autoLearnCount = useActivityStore((s) => s.autoLearnCount)
  const autoLearnEnabled = useSettingsStore((s) => s.autoLearnEnabled)

  return (
    <footer className="flex h-7 shrink-0 items-center gap-3 border-t border-border bg-muted/40 px-3 font-mono-ui text-xs text-muted-foreground">
      <Badge variant={STATUS_VARIANT[modelStatus]} className="h-5 px-1.5 text-xs font-normal">
        {modelStatus}
      </Badge>

      <Separator orientation="vertical" className="h-3" />

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-default tabular-nums">{fpsCount} FPS</span>
        </TooltipTrigger>
        <TooltipContent className="text-xs">Frames per second</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-3" />

      <span className="tabular-nums">
        {detections.length} face{detections.length !== 1 ? 's' : ''}
      </span>

      {matches.length > 0 && (
        <>
          <Separator orientation="vertical" className="h-3" />
          <span className="tabular-nums text-foreground">{matches.length} identified</span>
        </>
      )}

      <Separator orientation="vertical" className="h-3" />

      <span className="tabular-nums">{processingTimeMs.toFixed(0)} ms</span>

      {isProcessing && <span className="text-foreground/80">Identifying…</span>}

      {autoLearnEnabled && autoLearnCount > 0 && (
        <>
          <Separator orientation="vertical" className="h-3" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-default tabular-nums text-foreground/90">
                {autoLearnCount} auto-learned
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs text-xs">
              New embeddings saved automatically at different angles
            </TooltipContent>
          </Tooltip>
        </>
      )}

      {error && (
        <span className="ml-auto max-w-[55%] truncate text-destructive" title={error}>
          {error}
        </span>
      )}
    </footer>
  )
}
