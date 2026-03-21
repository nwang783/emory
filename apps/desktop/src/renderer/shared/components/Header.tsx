import { Brain, Settings } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { useFaceStore } from '@/shared/stores/face.store'
import { useSettingsStore } from '@/shared/stores/settings.store'

type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

const STATUS_CONFIG: Record<
  ModelStatus,
  { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }
> = {
  idle: { label: 'Idle', variant: 'outline' },
  loading: { label: 'Loading', variant: 'secondary' },
  ready: { label: 'Ready', variant: 'default' },
  error: { label: 'Error', variant: 'destructive' },
}

export function Header(): React.JSX.Element {
  const modelStatus = useFaceStore((s) => s.modelStatus) as ModelStatus
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)
  const config = STATUS_CONFIG[modelStatus]

  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur-sm supports-backdrop-filter:bg-card/75">
      <div className="flex items-center gap-3">
        <div
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-muted"
          aria-hidden
        >
          <Brain className="h-4 w-4 text-foreground" strokeWidth={1.75} />
        </div>
        <div className="flex min-w-0 flex-col gap-0">
          <span className="font-heading text-sm font-semibold leading-none tracking-tight text-foreground">
            Emory
          </span>
          <span className="text-xs leading-tight text-muted-foreground">Memory assistant</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge
              variant={config.variant}
              className="font-mono-ui cursor-default px-2 py-0.5 text-xs font-normal tabular-nums"
            >
              Models: {config.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Face recognition model status
          </TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-4" />

        <span className="font-mono-ui hidden text-xs text-muted-foreground md:inline">
          ONNX Runtime
        </span>

        <Separator orientation="vertical" className="hidden h-4 md:block" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setActiveTab('settings')}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Open settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
