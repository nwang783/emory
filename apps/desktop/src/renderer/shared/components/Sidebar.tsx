import { Camera, Users, Settings, Activity, BarChart3, Network, Images, Brain } from 'lucide-react'
import { useSettingsStore, type SettingsState } from '@/shared/stores/settings.store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type TabDef = {
  id: SettingsState['activeTab']
  label: string
  icon: React.ElementType
}

const TABS: TabDef[] = [
  { id: 'camera', label: 'Camera', icon: Camera },
  { id: 'people', label: 'People', icon: Users },
  { id: 'connections', label: 'Connections', icon: Network },
  { id: 'activity', label: 'Activity', icon: Activity },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'embeddings', label: 'Embeddings', icon: Images },
  { id: 'memories', label: 'Memories', icon: Brain },
  { id: 'settings', label: 'Settings', icon: Settings },
]

export function Sidebar(): React.JSX.Element {
  const activeTab = useSettingsStore((s) => s.activeTab)
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-card pt-3">
      {TABS.map(({ id, label, icon: Icon }) => (
        <Tooltip key={id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setActiveTab(id)}
              aria-label={label}
              aria-current={activeTab === id ? 'page' : undefined}
              className={cn(
                'flex w-12 flex-col items-center gap-0.5 rounded-lg px-2 py-2 transition-colors',
                activeTab === id
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{label}</TooltipContent>
        </Tooltip>
      ))}
    </nav>
  )
}
