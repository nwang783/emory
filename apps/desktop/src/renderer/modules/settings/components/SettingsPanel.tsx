import { useCallback, useEffect, useState } from 'react'
import {
  Archive,
  CloudUpload,
  FolderOpen,
  Gauge,
  Monitor,
  RotateCcw,
  ScanFace,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  MiniSidebarNav,
  type MiniSidebarNavItem,
  PageHeader,
  PageShell,
  PageWorkspace,
} from '@/shared/components/PageLayout'
import { Textarea } from '@/components/ui/textarea'
import { useSettingsStore } from '@/shared/stores/settings.store'
import { RemoteIngestSettings } from './RemoteIngestSettings'

function SettingRow({ label, value, children }: {
  label: string
  value: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Label className="text-sm">{label}</Label>
        <span className="text-xs font-mono text-muted-foreground">{value}</span>
      </div>
      {children}
    </div>
  )
}

function UserProfileSettings(): React.JSX.Element {
  const [bio, setBio] = useState('')
  const [selfId, setSelfId] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    window.emoryApi.db.people.getSelf()
      .then((person: { id: string; bio?: string | null } | null) => {
        if (person) {
          setSelfId(person.id)
          setBio(person.bio ?? '')
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const saveBio = useCallback(async () => {
    if (!selfId || saving) return
    setSaving(true)
    try {
      await window.emoryApi.db.people.update(selfId, { bio })
      toast.success('Profile saved')
    } finally {
      setSaving(false)
    }
  }, [selfId, saving, bio])

  if (!loaded) return <></>

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm">Your Profile</CardTitle>
        <CardDescription className="text-xs">
          Tell Emory about yourself. This helps the AI better understand your conversations — who
          you're talking about, what you do, and what matters to you.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {selfId ? (
          <>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="e.g. I'm a software engineer living in Atlanta. I have a wife named Sarah and two kids, Emma (8) and Jake (5). I enjoy hiking and woodworking on weekends."
              className="min-h-[120px] resize-y"
            />
            <Button
              className="w-fit"
              disabled={!selfId || saving}
              onClick={() => void saveBio()}
            >
              Save
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Set yourself as a person in the People tab first to configure your profile.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function RecognitionSettings(): React.JSX.Element {
  const autoLearnEnabled = useSettingsStore((s) => s.autoLearnEnabled)
  const setAutoLearnEnabled = useSettingsStore((s) => s.setAutoLearnEnabled)
  const detectionThreshold = useSettingsStore((s) => s.detectionThreshold)
  const setDetectionThreshold = useSettingsStore((s) => s.setDetectionThreshold)
  const matchThreshold = useSettingsStore((s) => s.matchThreshold)
  const setMatchThreshold = useSettingsStore((s) => s.setMatchThreshold)
  const maxEmbeddingsPerPerson = useSettingsStore((s) => s.maxEmbeddingsPerPerson)
  const setMaxEmbeddingsPerPerson = useSettingsStore((s) => s.setMaxEmbeddingsPerPerson)

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm">Recognition</CardTitle>
        <CardDescription className="text-xs">Face detection and matching parameters</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Auto-Learn</Label>
          <Switch checked={autoLearnEnabled} onCheckedChange={setAutoLearnEnabled} />
        </div>

        <Separator />

        <SettingRow label="Detection Threshold" value={detectionThreshold.toFixed(2)}>
          <Slider
            value={[detectionThreshold]}
            onValueChange={([v]) => setDetectionThreshold(v)}
            min={0.1} max={0.9} step={0.05}
          />
        </SettingRow>

        <SettingRow label="Match Threshold" value={matchThreshold.toFixed(2)}>
          <Slider
            value={[matchThreshold]}
            onValueChange={([v]) => setMatchThreshold(v)}
            min={0.2} max={0.8} step={0.05}
          />
        </SettingRow>

        <SettingRow label="Max Embeddings / Person" value={String(maxEmbeddingsPerPerson)}>
          <Slider
            value={[maxEmbeddingsPerPerson]}
            onValueChange={([v]) => setMaxEmbeddingsPerPerson(v)}
            min={5} max={30} step={1}
          />
        </SettingRow>
      </CardContent>
    </Card>
  )
}

function DisplaySettings(): React.JSX.Element {
  const showBoundingBoxes = useSettingsStore((s) => s.showBoundingBoxes)
  const setShowBoundingBoxes = useSettingsStore((s) => s.setShowBoundingBoxes)
  const showConfidence = useSettingsStore((s) => s.showConfidence)
  const setShowConfidence = useSettingsStore((s) => s.setShowConfidence)
  const showLandmarks = useSettingsStore((s) => s.showLandmarks)
  const setShowLandmarks = useSettingsStore((s) => s.setShowLandmarks)

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm">Display</CardTitle>
        <CardDescription className="text-xs">Overlay and visual settings</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Bounding Boxes</Label>
          <Switch checked={showBoundingBoxes} onCheckedChange={setShowBoundingBoxes} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-sm">Confidence Score</Label>
          <Switch checked={showConfidence} onCheckedChange={setShowConfidence} />
        </div>
        <div className="flex items-center justify-between">
          <Label className="text-sm">Landmarks</Label>
          <Switch checked={showLandmarks} onCheckedChange={setShowLandmarks} />
        </div>
      </CardContent>
    </Card>
  )
}

function PerformanceSettings(): React.JSX.Element {
  const identifyIntervalMs = useSettingsStore((s) => s.identifyIntervalMs)
  const setIdentifyIntervalMs = useSettingsStore((s) => s.setIdentifyIntervalMs)
  const detectCooldownMs = useSettingsStore((s) => s.detectCooldownMs)
  const setDetectCooldownMs = useSettingsStore((s) => s.setDetectCooldownMs)

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm">Performance</CardTitle>
        <CardDescription className="text-xs">Timing and throttle controls</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <SettingRow label="Identify Interval" value={`${identifyIntervalMs}ms`}>
          <Slider
            value={[identifyIntervalMs]}
            onValueChange={([v]) => setIdentifyIntervalMs(v)}
            min={1000} max={5000} step={250}
          />
        </SettingRow>

        <SettingRow label="Detection Cooldown" value={`${detectCooldownMs}ms`}>
          <Slider
            value={[detectCooldownMs]}
            onValueChange={([v]) => setDetectCooldownMs(v)}
            min={20} max={200} step={10}
          />
        </SettingRow>
      </CardContent>
    </Card>
  )
}

const ENCOUNTER_RETENTION_DEFAULT = 90
const UNKNOWN_RETENTION_DEFAULT = 30

/** When preload is older than main, `getConversationsDir` may be missing; mirror main `getConversationsRootDir()`. */
function conversationsDirFromUserData(userDataPath: string): string {
  const trimmed = userDataPath.replace(/[/\\]+$/, '')
  const sep = trimmed.includes('\\') ? '\\' : '/'
  return `${trimmed}${sep}conversations`
}

async function resolveConversationsDir(): Promise<string> {
  const api = window.emoryApi.app
  if (typeof api.getConversationsDir === 'function') {
    return api.getConversationsDir()
  }
  return conversationsDirFromUserData(await api.getUserDataDir())
}

type RetentionState = {
  encounterDays: number
  unknownDays: number
  keepImportant: boolean
}

function ConversationStorageSettings(): React.JSX.Element {
  const [pathStr, setPathStr] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)

  useEffect(() => {
    void resolveConversationsDir()
      .then(setPathStr)
      .catch(() => setPathStr(null))
  }, [])

  const openFolder = useCallback(async () => {
    setOpenError(null)
    const api = window.emoryApi.app
    if (typeof api.openConversationsFolder !== 'function') {
      setOpenError('Restart the app once so the preload script updates, then try again. You can copy the path above and open it manually.')
      return
    }
    const result = await api.openConversationsFolder()
    if (!result.success) setOpenError(result.error)
  }, [])

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm">Conversation recordings</CardTitle>
        <CardDescription className="text-xs">
          Audio segments are saved under your app data folder, organized by year and month (
          <span className="font-mono">…/conversations/YYYY/MM/</span>
          ).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {pathStr ? (
          <p className="break-all rounded-md border border-border bg-muted/40 px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
            {pathStr}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Could not resolve storage path.</p>
        )}
        <Button
          type="button"
          variant="secondary"
          className="w-fit gap-2"
          onClick={() => void openFolder()}
          disabled={!pathStr}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          Open folder
        </Button>
        {openError ? (
          <p className="text-xs text-destructive" role="alert">
            {openError}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function RetentionSettings(): React.JSX.Element {
  const [retention, setRetention] = useState<RetentionState>({
    encounterDays: ENCOUNTER_RETENTION_DEFAULT,
    unknownDays: UNKNOWN_RETENTION_DEFAULT,
    keepImportant: true,
  })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    window.emoryApi.db.retention.getAll()
      .then((configs: Array<{ entityType: string; retentionDays: number; keepImportant: boolean }>) => {
        const next: RetentionState = {
          encounterDays: ENCOUNTER_RETENTION_DEFAULT,
          unknownDays: UNKNOWN_RETENTION_DEFAULT,
          keepImportant: true,
        }
        for (const c of configs) {
          if (c.entityType === 'encounters') {
            next.encounterDays = c.retentionDays
            next.keepImportant = c.keepImportant
          } else if (c.entityType === 'unknown_sightings') {
            next.unknownDays = c.retentionDays
          }
        }
        setRetention(next)
        setLoaded(true)
      })
      .catch(() => {
        setLoaded(true)
      })
  }, [])

  const saveEncounterRetention = useCallback(
    async (days: number, keepImportant: boolean) => {
      try {
        await window.emoryApi.db.retention.upsert('encounters', days, keepImportant)
      } catch {
        // Retention save failed silently
      }
    },
    [],
  )

  const saveUnknownRetention = useCallback(
    async (days: number) => {
      try {
        await window.emoryApi.db.retention.upsert('unknown_sightings', days, false)
      } catch {
        // Retention save failed silently
      }
    },
    [],
  )

  const handleEncounterDaysChange = useCallback(
    ([v]: number[]) => {
      setRetention((prev) => {
        saveEncounterRetention(v, prev.keepImportant)
        return { ...prev, encounterDays: v }
      })
    },
    [saveEncounterRetention],
  )

  const handleUnknownDaysChange = useCallback(
    ([v]: number[]) => {
      setRetention((prev) => {
        saveUnknownRetention(v)
        return { ...prev, unknownDays: v }
      })
    },
    [saveUnknownRetention],
  )

  const handleKeepImportantChange = useCallback(
    (checked: boolean) => {
      setRetention((prev) => {
        saveEncounterRetention(prev.encounterDays, checked)
        return { ...prev, keepImportant: checked }
      })
    },
    [saveEncounterRetention],
  )

  if (!loaded) return <></>

  return (
    <Card>
      <CardHeader className="pb-4">
        <CardTitle className="text-sm">Data Retention</CardTitle>
        <CardDescription className="text-xs">
          Automatically delete old data after a set number of days
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <SettingRow
          label="Encounter Retention"
          value={`${retention.encounterDays} days`}
        >
          <Slider
            value={[retention.encounterDays]}
            onValueChange={handleEncounterDaysChange}
            min={7}
            max={365}
            step={1}
          />
        </SettingRow>

        <div className="flex items-center justify-between">
          <Label className="text-sm">Keep Important Encounters</Label>
          <Switch
            checked={retention.keepImportant}
            onCheckedChange={handleKeepImportantChange}
          />
        </div>

        <Separator />

        <SettingRow
          label="Unknown Sightings Retention"
          value={`${retention.unknownDays} days`}
        >
          <Slider
            value={[retention.unknownDays]}
            onValueChange={handleUnknownDaysChange}
            min={7}
            max={90}
            step={1}
          />
        </SettingRow>
      </CardContent>
    </Card>
  )
}

type SettingsSectionId =
  | 'profile'
  | 'recognition'
  | 'display'
  | 'performance'
  | 'storage'
  | 'ingest'
  | 'retention'

const SETTINGS_NAV: MiniSidebarNavItem[] = [
  { id: 'profile', label: 'Profile', icon: User },
  { id: 'recognition', label: 'Recognition', icon: ScanFace },
  { id: 'display', label: 'Display', icon: Monitor },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'storage', label: 'Recordings', icon: FolderOpen },
  { id: 'ingest', label: 'Remote ingest', icon: CloudUpload },
  { id: 'retention', label: 'Retention', icon: Archive },
]

export function SettingsPanel(): React.JSX.Element {
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults)
  const [section, setSection] = useState<SettingsSectionId>('profile')

  return (
    <PageShell>
      <PageHeader
        sticky
        title="Settings"
        titleClassName="font-heading text-lg"
        description="Recognition, storage, remote ingest, and retention."
      />
      <PageWorkspace
        miniSidebar={
          <MiniSidebarNav
            label="Categories"
            items={SETTINGS_NAV}
            activeId={section}
            onSelect={(id) => setSection(id as SettingsSectionId)}
            footer={
              <Button
                variant="outline"
                size="sm"
                className="h-8 w-full gap-1.5 text-xs"
                onClick={resetToDefaults}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset defaults
              </Button>
            }
          />
        }
      >
        <ScrollArea className="min-h-0 flex-1">
          <div className="mx-auto max-w-2xl space-y-5 px-5 py-6 pb-12 sm:px-6">
            {section === 'profile' ? <UserProfileSettings /> : null}
            {section === 'recognition' ? <RecognitionSettings /> : null}
            {section === 'display' ? <DisplaySettings /> : null}
            {section === 'performance' ? <PerformanceSettings /> : null}
            {section === 'storage' ? <ConversationStorageSettings /> : null}
            {section === 'ingest' ? <RemoteIngestSettings /> : null}
            {section === 'retention' ? <RetentionSettings /> : null}
          </div>
        </ScrollArea>
      </PageWorkspace>
    </PageShell>
  )
}
