import { Brain, Settings } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { useFaceStore } from '@/shared/stores/face.store'
import { useSettingsStore } from '@/shared/stores/settings.store'

type ModelStatus = 'idle' | 'loading' | 'ready' | 'error'

const STATUS_CONFIG: Record<ModelStatus, { label: string; variant: 'default' | 'destructive' | 'secondary' | 'outline' }> = {
  idle: { label: 'Idle', variant: 'outline' },
  loading: { label: 'Loading…', variant: 'secondary' },
  ready: { label: 'Ready', variant: 'default' },
  error: { label: 'Error', variant: 'destructive' },
}

export function Header(): React.JSX.Element {
  const modelStatus = useFaceStore((s) => s.modelStatus) as ModelStatus
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)
  const config = STATUS_CONFIG[modelStatus]

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4">
      <div className="flex items-center gap-2.5">
        <Brain className="h-5 w-5 text-primary" />
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight text-foreground">Emory</span>
          <span className="text-[10px] text-muted-foreground">Memory Assistant</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant={config.variant} className="cursor-default text-[10px]">
              Models: {config.label}
            </Badge>
          </TooltipTrigger>
          <TooltipContent side="bottom">Face recognition model status</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="h-5" />

        <span className="text-[10px] text-muted-foreground">ONNX Runtime</span>

        <Separator orientation="vertical" className="h-5" />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setActiveTab('settings')}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Settings</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
