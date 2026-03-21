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
    <footer className="flex items-center gap-3 border-t border-border bg-card px-4 py-1.5">
      <Badge variant={STATUS_VARIANT[modelStatus]} className="text-[10px]">
        {modelStatus}
      </Badge>

      <Separator orientation="vertical" className="h-3.5" />

      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {fpsCount} FPS
          </span>
        </TooltipTrigger>
        <TooltipContent>Detection frames per second</TooltipContent>
      </Tooltip>

      <Separator orientation="vertical" className="h-3.5" />

      <span className="text-[11px] tabular-nums text-muted-foreground">
        {detections.length} face{detections.length !== 1 ? 's' : ''}
      </span>

      {matches.length > 0 && (
        <>
          <Separator orientation="vertical" className="h-3.5" />
          <span className="text-[11px] tabular-nums text-emerald-400">
            {matches.length} identified
          </span>
        </>
      )}

      <Separator orientation="vertical" className="h-3.5" />

      <span className="text-[11px] tabular-nums text-muted-foreground">
        {processingTimeMs.toFixed(0)}ms
      </span>

      {isProcessing && (
        <span className="text-[10px] text-primary animate-pulse">identifying...</span>
      )}

      {autoLearnEnabled && autoLearnCount > 0 && (
        <>
          <Separator orientation="vertical" className="h-3.5" />
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[11px] tabular-nums text-blue-400">
                {autoLearnCount} auto-learned
              </span>
            </TooltipTrigger>
            <TooltipContent>Embeddings automatically captured at new angles</TooltipContent>
          </Tooltip>
        </>
      )}

      {error && (
        <span className="ml-auto truncate text-[11px] text-destructive" title={error}>
          {error}
        </span>
      )}
    </footer>
  )
}
