import { contextBridge, ipcRenderer } from 'electron'

const emoryApi = {
  face: {
    initialize: (): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('face:initialize'),

    detectOnly: (data: ArrayBuffer, width: number, height: number) =>
      ipcRenderer.invoke('face:detect-only', new Uint8Array(data), width, height),

    processFrame: (data: ArrayBuffer, width: number, height: number) =>
      ipcRenderer.invoke('face:process-frame', new Uint8Array(data), width, height),

    register: (
      personId: string,
      imageData: ArrayBuffer,
      width: number,
      height: number,
      source: string,
    ) => ipcRenderer.invoke('face:register', personId, new Uint8Array(imageData), width, height, source),

    autoLearn: (personId: string, embedding: number[], margin?: number, thumbnailBase64?: string) =>
      ipcRenderer.invoke('face:auto-learn', personId, embedding, margin, thumbnailBase64),

    extractEmbedding: (data: ArrayBuffer, width: number, height: number) =>
      ipcRenderer.invoke('face:extract-embedding', new Uint8Array(data), width, height),

    getEmbeddingCount: (personId: string): Promise<number> =>
      ipcRenderer.invoke('face:get-embedding-count', personId),

    updateThresholds: (detectionThreshold: number, matchThreshold: number) =>
      ipcRenderer.invoke('face:update-thresholds', detectionThreshold, matchThreshold),
  },

  db: {
    people: {
      create: (input: { name: string; relationship?: string; notes?: string }) =>
        ipcRenderer.invoke('db:people:create', input),

      findAll: () => ipcRenderer.invoke('db:people:find-all'),

      findById: (id: string) => ipcRenderer.invoke('db:people:find-by-id', id),

      update: (id: string, input: { name?: string; relationship?: string; notes?: string }) =>
        ipcRenderer.invoke('db:people:update', id, input),

      delete: (id: string) => ipcRenderer.invoke('db:people:delete', id),

      merge: (keepId: string, mergeId: string) =>
        ipcRenderer.invoke('db:people:merge', keepId, mergeId),

      updateProfile: (id: string, profile: {
        keyFacts?: string[]
        conversationStarters?: string[]
        importantDates?: Array<{ label: string; date: string }>
        lastTopics?: string[]
      }) =>
        ipcRenderer.invoke('db:people:update-profile', id, profile),

      getSelf: () => ipcRenderer.invoke('db:people:get-self'),

      setSelf: (personId: string | null) => ipcRenderer.invoke('db:people:set-self', personId),
    },

    relationships: {
      create: (personAId: string, personBId: string, type: string, notes?: string) =>
        ipcRenderer.invoke('db:relationships:create', personAId, personBId, type, notes),
      getByPerson: (personId: string) =>
        ipcRenderer.invoke('db:relationships:get-by-person', personId),
      getAll: () =>
        ipcRenderer.invoke('db:relationships:get-all'),
      update: (id: string, type?: string, notes?: string) =>
        ipcRenderer.invoke('db:relationships:update', id, type, notes),
      delete: (id: string) =>
        ipcRenderer.invoke('db:relationships:delete', id),
    },

    embeddings: {
      getByPerson: (personId: string) =>
        ipcRenderer.invoke('db:embeddings:get-by-person', personId),
      delete: (embeddingId: string) =>
        ipcRenderer.invoke('db:embeddings:delete', embeddingId),
      reassign: (embeddingId: string, newPersonId: string) =>
        ipcRenderer.invoke('db:embeddings:reassign', embeddingId, newPersonId),
      getAllGrouped: () =>
        ipcRenderer.invoke('db:embeddings:get-all-grouped'),
    },

    retention: {
      getAll: () => ipcRenderer.invoke('db:retention:get-all'),
      upsert: (entityType: string, retentionDays: number, keepImportant: boolean) =>
        ipcRenderer.invoke('db:retention:upsert', entityType, retentionDays, keepImportant),
    },
  },

  unknown: {
    track: (tempId: string, embeddingData?: number[], confidence?: number) =>
      ipcRenderer.invoke('unknown:track', tempId, embeddingData, confidence),
    getActive: () =>
      ipcRenderer.invoke('unknown:get-active'),
    getAll: (limit?: number) =>
      ipcRenderer.invoke('unknown:get-all', limit),
    getActiveCount: (): Promise<number> =>
      ipcRenderer.invoke('unknown:get-active-count'),
    dismiss: (id: string) =>
      ipcRenderer.invoke('unknown:dismiss', id),
    nameAsPerson: (id: string, personId: string) =>
      ipcRenderer.invoke('unknown:name-as-person', id, personId),
    findById: (id: string) =>
      ipcRenderer.invoke('unknown:find-by-id', id),
  },

  encounter: {
    startSession: (deviceId?: string) =>
      ipcRenderer.invoke('encounter:start-session', deviceId),
    endSession: () =>
      ipcRenderer.invoke('encounter:end-session'),
    getActiveSession: (): Promise<string | null> =>
      ipcRenderer.invoke('encounter:get-active-session'),
    log: (personId: string, confidence: number) =>
      ipcRenderer.invoke('encounter:log', personId, confidence),
    end: (personId: string) =>
      ipcRenderer.invoke('encounter:end', personId),
    markImportant: (encounterId: string, important: boolean) =>
      ipcRenderer.invoke('encounter:mark-important', encounterId, important),
    getByPerson: (personId: string, limit?: number) =>
      ipcRenderer.invoke('encounter:get-by-person', personId, limit),
    getRecent: (limit?: number) =>
      ipcRenderer.invoke('encounter:get-recent', limit),
    countByPerson: (personId: string, sinceDays?: number) =>
      ipcRenderer.invoke('encounter:count-by-person', personId, sinceDays),
  },

  conversation: {
    processRecording: (input: {
      personId: string
      encounterId?: string | null
      audioPath: string
      mimeType: string
      durationMs?: number | null
      recordedAt: string
    }) =>
      ipcRenderer.invoke('conversation:process-recording', input),
    getRecordingsByPerson: (personId: string, limit?: number) =>
      ipcRenderer.invoke('conversation:get-recordings-by-person', personId, limit),
    getMemoriesByPerson: (personId: string, limit?: number) =>
      ipcRenderer.invoke('conversation:get-memories-by-person', personId, limit),
    queryMemories: (input: {
      audioPath: string
      mimeType: string
      askedAt?: string
    }) =>
      ipcRenderer.invoke('conversation:query-memories', input),
  },

  app: {
    getModelsDir: (): Promise<string> => ipcRenderer.invoke('app:get-models-dir'),
    getUserDataDir: (): Promise<string> => ipcRenderer.invoke('app:get-user-data-dir'),
  },
} as const

contextBridge.exposeInMainWorld('emoryApi', emoryApi)

export type EmoryApi = typeof emoryApi
