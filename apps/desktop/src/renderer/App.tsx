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
import { MemoryBrowser } from './modules/memories/components/MemoryBrowser'
import { ErrorBoundary } from './shared/components/ErrorBoundary'
import { useFaceStore } from './shared/stores/face.store'
import { usePeopleStore } from './shared/stores/people.store'
import { useSettingsStore } from './shared/stores/settings.store'
import { useRemoteIngestStore } from './shared/stores/remote-ingest.store'

function CameraView(): React.JSX.Element {
  const modelStatus = useFaceStore((s) => s.modelStatus)

  return (
    <div className="flex h-full overflow-hidden">
      <section className="relative flex flex-1 flex-col items-center justify-center">
        {modelStatus === 'loading' && (
          <div className="absolute top-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-md border border-border bg-card px-3 py-2">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Downloading face models…</span>
          </div>
        )}
        {modelStatus === 'error' && (
          <div className="absolute top-4 left-1/2 z-10 -translate-x-1/2">
            <Badge variant="destructive" className="max-w-md text-xs font-normal">
              Model load failed — face recognition disabled
            </Badge>
          </div>
        )}
        <WebcamFeed />
      </section>

      <aside
        className="flex w-[min(30%,300px)] min-w-[220px] flex-col overflow-hidden border-l border-border bg-card/50"
        aria-label="People on camera"
      >
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
    case 'memories':
      return <MemoryBrowser />
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

  useEffect(() => {
    void useRemoteIngestStore.getState().hydrateFromMain()
    return window.emoryApi.remoteIngest.onUpdated((payload) => {
      useRemoteIngestStore.getState().applyPayload(payload)
    })
  }, [])

  return (
    <TooltipProvider delayDuration={280}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
        <Header />

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <Sidebar />
          <main className="app-main-surface min-h-0 flex-1 overflow-hidden">
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
