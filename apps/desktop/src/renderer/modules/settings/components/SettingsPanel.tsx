import { useCallback, useEffect, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSettingsStore } from '@/shared/stores/settings.store'

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

type RetentionState = {
  encounterDays: number
  unknownDays: number
  keepImportant: boolean
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

export function SettingsPanel(): React.JSX.Element {
  const resetToDefaults = useSettingsStore((s) => s.resetToDefaults)

  return (
    <ScrollArea className="h-full">
      <section className="mx-auto flex max-w-xl flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold tracking-tight">Settings</h2>

        <RecognitionSettings />
        <DisplaySettings />
        <PerformanceSettings />
        <RetentionSettings />

        <Button variant="outline" className="mt-2 self-start gap-2" onClick={resetToDefaults}>
          <RotateCcw className="h-3.5 w-3.5" />
          Reset to Defaults
        </Button>
      </section>
    </ScrollArea>
  )
}
