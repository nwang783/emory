import {
  Activity,
  BarChart3,
  Brain,
  Camera,
  Images,
  Network,
  Settings,
  Users,
} from 'lucide-react'
import { useSettingsStore, type SettingsState } from '@/shared/stores/settings.store'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'

type TabDef = {
  id: SettingsState['activeTab']
  label: string
  icon: React.ElementType
}

const NAV_GROUPS: { label: string; items: TabDef[] }[] = [
  {
    label: 'Workspace',
    items: [
      { id: 'camera', label: 'Camera', icon: Camera },
      { id: 'people', label: 'People', icon: Users },
      { id: 'connections', label: 'Connections', icon: Network },
    ],
  },
  {
    label: 'Insights',
    items: [
      { id: 'activity', label: 'Activity', icon: Activity },
      { id: 'analytics', label: 'Analytics', icon: BarChart3 },
      { id: 'embeddings', label: 'Embeddings', icon: Images },
      { id: 'memories', label: 'Memories', icon: Brain },
    ],
  },
  {
    label: 'System',
    items: [{ id: 'settings', label: 'Settings', icon: Settings }],
  },
]

export function Sidebar(): React.JSX.Element {
  const activeTab = useSettingsStore((s) => s.activeTab)
  const setActiveTab = useSettingsStore((s) => s.setActiveTab)

  return (
    <aside
      className="flex w-[196px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
      aria-label="Primary navigation"
    >
      <div className="flex flex-1 flex-col gap-0.5 px-2 py-2.5">
        {NAV_GROUPS.map((group, gi) => (
          <div key={group.label}>
            {gi > 0 && <Separator className="my-2 bg-sidebar-border" />}
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{group.label}</p>
            <nav className="flex flex-col gap-px" aria-label={group.label}>
              {group.items.map(({ id, label, icon: Icon }) => {
                const active = activeTab === id
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setActiveTab(id)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                      active
                        ? 'bg-accent font-medium text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/60 hover:text-accent-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                    <span>{label}</span>
                  </button>
                )
              })}
            </nav>
          </div>
        ))}
      </div>
    </aside>
  )
}
