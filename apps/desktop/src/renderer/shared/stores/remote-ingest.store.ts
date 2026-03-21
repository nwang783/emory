import { create } from 'zustand'

export type RemoteIngestUpdatedPayload = {
  config: {
    enabled: boolean
    bindMode: 'all' | 'loopback' | 'tailscale'
    signalingPort: number
    beaconEnabled: boolean
    beaconIntervalMs: number
    mdnsEnabled: boolean
    friendlyName: string
  }
  instanceId: string
  status: {
    listening: boolean
    effectiveHost: string | null
    effectiveAddresses: string[]
    signalingPort: number
    beaconActive: boolean
    lastError: string | null
    instanceId: string
    tailscaleHint: string | null
  }
}

type RemoteIngestState = {
  hydrated: boolean
  configEnabled: boolean
  listening: boolean
  effectiveHost: string | null
  signalingPort: number
  lastError: string | null
  instanceId: string
  applyPayload: (payload: RemoteIngestUpdatedPayload) => void
  hydrateFromMain: () => Promise<void>
}

export const useRemoteIngestStore = create<RemoteIngestState>((set) => ({
  hydrated: false,
  configEnabled: false,
  listening: false,
  effectiveHost: null,
  signalingPort: 18763,
  lastError: null,
  instanceId: '',

  applyPayload: (payload: RemoteIngestUpdatedPayload): void => {
    set({
      hydrated: true,
      configEnabled: payload.config.enabled,
      listening: payload.status.listening,
      effectiveHost: payload.status.effectiveHost,
      signalingPort: payload.config.signalingPort,
      lastError: payload.status.lastError,
      instanceId: payload.instanceId,
    })
  },

  hydrateFromMain: async (): Promise<void> => {
    const [cfg, st] = await Promise.all([
      window.emoryApi.remoteIngest.getConfig(),
      window.emoryApi.remoteIngest.getStatus(),
    ])
    set({
      hydrated: true,
      configEnabled: cfg.config.enabled,
      listening: st.listening,
      effectiveHost: st.effectiveHost,
      signalingPort: cfg.config.signalingPort,
      lastError: st.lastError,
      instanceId: cfg.instanceId,
    })
  },
}))
