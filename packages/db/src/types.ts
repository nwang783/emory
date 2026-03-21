export type ImportantDate = {
  label: string
  date: string
}

export type Person = {
  id: string
  name: string
  relationship: string | null
  notes: string | null
  photos: string | null
  firstMet: string | null
  lastSeen: string | null
  createdAt: string
  isSelf: boolean
  keyFacts: string[]
  conversationStarters: string[]
  importantDates: ImportantDate[]
  lastTopics: string[]
}

export type CreatePersonInput = {
  name: string
  relationship?: string
  notes?: string
}

export type UpdatePersonInput = {
  name?: string
  relationship?: string
  notes?: string
}

export type EmbeddingSource = 'photo_upload' | 'live_capture' | 'auto_learn'

export type FaceEmbedding = {
  id: string
  personId: string
  embedding: Float32Array
  source: EmbeddingSource
  thumbnail: string | null
  qualityScore: number | null
  createdAt: string
}

export type FaceEmbeddingWithPerson = FaceEmbedding & {
  personName: string
}

export type PersonRow = {
  id: string
  name: string
  relationship: string | null
  notes: string | null
  photos: string | null
  first_met: string | null
  last_seen: string | null
  created_at: string
  is_self: number
  key_facts: string | null
  conversation_starters: string | null
  important_dates: string | null
  last_topics: string | null
}

export type FaceEmbeddingRow = {
  id: string
  person_id: string
  embedding: Buffer
  source: string
  thumbnail: string | null
  quality_score: number | null
  created_at: string
}

export type FaceEmbeddingWithPersonRow = FaceEmbeddingRow & {
  person_name: string
}

// --- Session & Encounter types ---

export type Session = {
  id: string
  startedAt: string
  endedAt: string | null
  deviceId: string | null
  totalEncounters: number
}

export type SessionRow = {
  id: string
  started_at: string
  ended_at: string | null
  device_id: string | null
  total_encounters: number
}

export type Encounter = {
  id: string
  personId: string
  sessionId: string
  startedAt: string
  endedAt: string | null
  avgConfidence: number | null
  peakConfidence: number | null
  isImportant: boolean
  createdAt: string
}

export type EncounterRow = {
  id: string
  person_id: string
  session_id: string
  started_at: string
  ended_at: string | null
  avg_confidence: number | null
  peak_confidence: number | null
  is_important: number
  created_at: string
}

export type EncounterWithPerson = Encounter & {
  personName: string
}

export type EncounterWithPersonRow = EncounterRow & {
  person_name: string
}

// --- Unknown sighting types ---

export type UnknownSightingStatus = 'tracking' | 'dismissed' | 'named'

export type UnknownSighting = {
  id: string
  tempId: string
  firstSeen: string
  lastSeen: string
  sightingCount: number
  bestEmbedding: Float32Array | null
  bestConfidence: number | null
  thumbnailPath: string | null
  status: UnknownSightingStatus
  namedAsPersonId: string | null
  createdAt: string
}

export type UnknownSightingRow = {
  id: string
  temp_id: string
  first_seen: string
  last_seen: string
  sighting_count: number
  best_embedding: Buffer | null
  best_confidence: number | null
  thumbnail_path: string | null
  status: string
  named_as_person_id: string | null
  created_at: string
}

// --- Appearance change types ---

export type AppearanceChangeType = 'glasses' | 'hair' | 'facial_hair' | 'weight' | 'aging' | 'accessory' | 'other'

export type AppearanceChange = {
  id: string
  personId: string
  changeType: AppearanceChangeType
  detectedAt: string
  oldCentroid: Float32Array | null
  newCentroid: Float32Array | null
  autoAdapted: boolean
  notes: string | null
  createdAt: string
}

export type AppearanceChangeRow = {
  id: string
  person_id: string
  change_type: string
  detected_at: string
  old_centroid: Buffer | null
  new_centroid: Buffer | null
  auto_adapted: number
  notes: string | null
  created_at: string
}

// --- Relationship types ---

export type RelationshipType = 'spouse' | 'child' | 'parent' | 'sibling' | 'friend' | 'carer' | 'neighbour' | 'colleague' | 'other'

export type Relationship = {
  id: string
  personAId: string
  personBId: string
  relationshipType: RelationshipType
  notes: string | null
  createdAt: string
}

export type RelationshipRow = {
  id: string
  person_a_id: string
  person_b_id: string
  relationship_type: string
  notes: string | null
  created_at: string
}

export type RelationshipWithPerson = Relationship & {
  personAName: string
  personBName: string
}

// --- Person profile extension types ---

export type PersonProfile = {
  keyFacts: string[]
  conversationStarters: string[]
  importantDates: ImportantDate[]
  lastTopics: string[]
}

// --- Conversation recording & memory types ---

export type TranscriptStatus = 'pending' | 'complete' | 'failed'

export type ParseStatus = 'pending' | 'complete' | 'failed'

export type MemorySourceType = 'conversation'

export type ConversationRecording = {
  id: string
  personId: string
  encounterId: string | null
  recordedAt: string
  audioPath: string
  mimeType: string
  durationMs: number | null
  transcriptText: string | null
  transcriptStatus: TranscriptStatus
  transcriptProvider: string | null
  transcriptError: string | null
  parseStatus: ParseStatus
  parseError: string | null
  createdAt: string
  updatedAt: string
}

export type ConversationRecordingRow = {
  id: string
  person_id: string
  encounter_id: string | null
  recorded_at: string
  audio_path: string
  mime_type: string
  duration_ms: number | null
  transcript_text: string | null
  transcript_status: string
  transcript_provider: string | null
  transcript_error: string | null
  parse_status: string
  parse_error: string | null
  created_at: string
  updated_at: string
}

export type PersonMemory = {
  id: string
  personId: string
  recordingId: string | null
  memoryText: string
  memoryDate: string
  sourceType: MemorySourceType
  createdAt: string
}

export type PersonMemoryRow = {
  id: string
  person_id: string
  recording_id: string | null
  memory_text: string
  memory_date: string
  source_type: string
  created_at: string
}

export type CreateConversationRecordingInput = {
  /** When set (e.g. by main before writing the file), must match the filename id. */
  id?: string
  personId: string
  encounterId?: string | null
  recordedAt: string
  audioPath: string
  mimeType: string
  durationMs?: number | null
}

export type AddPersonMemoryInput = {
  personId: string
  recordingId?: string | null
  memoryText: string
  memoryDate: string
  sourceType: MemorySourceType
}

// --- Retention config types ---

export type RetentionConfig = {
  entityType: string
  retentionDays: number
  keepImportant: boolean
}

export type RetentionConfigRow = {
  entity_type: string
  retention_days: number
  keep_important: number
}

// --- Frame quality types (used by core, defined here for shared access) ---

export type FrameQuality = {
  blurScore: number
  brightness: number
  faceToFrameRatio: number
  estimatedYaw: number
  estimatedPitch: number
  overallScore: number
}

// --- Graded identity types ---

export type IdentityGrade = 'definite' | 'probable' | 'uncertain' | 'silent'

export type GradedIdentity = {
  grade: IdentityGrade
  personId: string | null
  personName: string | null
  similarity: number
  matchMargin: number
}
