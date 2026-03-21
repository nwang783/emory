import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Toaster } from '@/components/ui/sonner'
import { Header } from './shared/components/Header'
import { Sidebar } from './shared/components/Sidebar'
import { StatusBar } from './shared/components/StatusBar'
import { WebcamFeed } from './modules/camera/components/WebcamFeed'
import { PeopleList } from './modules/people/components/PeopleList'
import { SettingsPanel } from './modules/settings/components/SettingsPanel'
import { ActivityFeed } from './modules/activity/components/ActivityFeed'
import { AnalyticsDashboard } from './modules/analytics/components/AnalyticsDashboard'
import { EmbeddingGallery } from './modules/embeddings/components/EmbeddingGallery'
import { ConnectionsGraph } from './modules/connections/components/ConnectionsGraph'
import { ErrorBoundary } from './shared/components/ErrorBoundary'
import { useFaceStore } from './shared/stores/face.store'
import { usePeopleStore } from './shared/stores/people.store'
import { useSettingsStore } from './shared/stores/settings.store'

function CameraView(): React.JSX.Element {
  const modelStatus = useFaceStore((s) => s.modelStatus)

  return (
    <div className="flex h-full overflow-hidden">
      <section className="relative flex flex-1 flex-col items-center justify-center">
        {modelStatus === 'loading' && (
          <div className="absolute top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 shadow-lg">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="text-xs text-muted-foreground">Downloading face models…</span>
          </div>
        )}
        {modelStatus === 'error' && (
          <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2">
            <Badge variant="destructive" className="text-xs">
              Model load failed — face recognition disabled
            </Badge>
          </div>
        )}
        <WebcamFeed />
      </section>

      <aside className="flex w-[30%] flex-col overflow-hidden border-l border-border bg-card">
        <PeopleList />
      </aside>
    </div>
  )
}

function MainContent(): React.JSX.Element {
  const activeTab = useSettingsStore((s) => s.activeTab)

  switch (activeTab) {
    case 'camera':
      return <CameraView />
    case 'people':
      return <PeopleList fullWidth />
    case 'connections':
      return <ConnectionsGraph />
    case 'settings':
      return <SettingsPanel />
    case 'activity':
      return <ActivityFeed />
    case 'analytics':
      return <AnalyticsDashboard />
    case 'embeddings':
      return <EmbeddingGallery />
  }
}

export function App(): React.JSX.Element {
  const setModelStatus = useFaceStore((s) => s.setModelStatus)
  const setError = useFaceStore((s) => s.setError)
  const loadPeople = usePeopleStore((s) => s.loadPeople)

  useEffect(() => {
    async function boot(): Promise<void> {
      try {
        setModelStatus('loading')
        const result = await window.emoryApi.face.initialize()
        if (result.success) {
          setModelStatus('ready')
        } else {
          setModelStatus('error')
          setError(result.error ?? 'Unknown initialization error')
        }
        await loadPeople()
      } catch (err) {
        setModelStatus('error')
        setError(err instanceof Error ? err.message : 'Boot failed')
      }
    }
    boot()
  }, [setModelStatus, setError, loadPeople])

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
        <Header />

        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="flex-1 overflow-hidden">
            <ErrorBoundary>
              <MainContent />
            </ErrorBoundary>
          </main>
        </div>

        <StatusBar />
        <Toaster position="bottom-right" />
      </div>
    </TooltipProvider>
  )
}
