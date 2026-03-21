import { create } from 'zustand'

export type SettingsState = {
  autoLearnEnabled: boolean
  detectionThreshold: number
  matchThreshold: number
  identifyIntervalMs: number
  detectCooldownMs: number
  maxEmbeddingsPerPerson: number
  showLandmarks: boolean
  showConfidence: boolean
  showBoundingBoxes: boolean
  activeTab: 'camera' | 'people' | 'connections' | 'activity' | 'analytics' | 'embeddings' | 'settings'
}

type SettingsActions = {
  setAutoLearnEnabled: (enabled: boolean) => void
  setDetectionThreshold: (value: number) => void
  setMatchThreshold: (value: number) => void
  setIdentifyIntervalMs: (value: number) => void
  setDetectCooldownMs: (value: number) => void
  setMaxEmbeddingsPerPerson: (value: number) => void
  setShowLandmarks: (value: boolean) => void
  setShowConfidence: (value: boolean) => void
  setShowBoundingBoxes: (value: boolean) => void
  setActiveTab: (tab: SettingsState['activeTab']) => void
  resetToDefaults: () => void
}

const DEFAULT_SETTINGS: SettingsState = {
  autoLearnEnabled: true,
  detectionThreshold: 0.35,
  matchThreshold: 0.45,
  identifyIntervalMs: 1500,
  detectCooldownMs: 50,
  maxEmbeddingsPerPerson: 20,
  showLandmarks: false,
  showConfidence: true,
  showBoundingBoxes: true,
  activeTab: 'camera',
}

export const useSettingsStore = create<SettingsState & SettingsActions>((set) => ({
  ...DEFAULT_SETTINGS,

  setAutoLearnEnabled: (autoLearnEnabled) => set({ autoLearnEnabled }),
  setDetectionThreshold: (detectionThreshold) => set({ detectionThreshold }),
  setMatchThreshold: (matchThreshold) => set({ matchThreshold }),
  setIdentifyIntervalMs: (identifyIntervalMs) => set({ identifyIntervalMs }),
  setDetectCooldownMs: (detectCooldownMs) => set({ detectCooldownMs }),
  setMaxEmbeddingsPerPerson: (maxEmbeddingsPerPerson) => set({ maxEmbeddingsPerPerson }),
  setShowLandmarks: (showLandmarks) => set({ showLandmarks }),
  setShowConfidence: (showConfidence) => set({ showConfidence }),
  setShowBoundingBoxes: (showBoundingBoxes) => set({ showBoundingBoxes }),
  setActiveTab: (activeTab) => set({ activeTab }),
  resetToDefaults: () => set(DEFAULT_SETTINGS),
}))

useSettingsStore.subscribe((state, prevState) => {
  if (
    state.detectionThreshold !== prevState.detectionThreshold ||
    state.matchThreshold !== prevState.matchThreshold
  ) {
    window.emoryApi?.face?.updateThresholds?.(state.detectionThreshold, state.matchThreshold)
  }
})
