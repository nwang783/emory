export { SqliteAdapter } from './adapters/sqlite.adapter.js'
export type { StorageAdapter, SyncStatus, SyncMetadata, StorageAdapterConfig } from './adapters/storage.adapter.js'
export { PeopleRepository } from './repositories/people.repository.js'
export { EncounterRepository } from './repositories/encounter.repository.js'
export { UnknownSightingRepository } from './repositories/unknown-sighting.repository.js'
export { RelationshipRepository } from './repositories/relationship.repository.js'
export { RetentionRepository } from './repositories/retention.repository.js'
export { ConversationRepository } from './repositories/conversation.repository.js'
export type {
  Person,
  CreatePersonInput,
  UpdatePersonInput,
  FaceEmbedding,
  FaceEmbeddingWithPerson,
  EmbeddingSource,
  Session,
  Encounter,
  EncounterWithPerson,
  UnknownSighting,
  UnknownSightingStatus,
  AppearanceChange,
  AppearanceChangeType,
  Relationship,
  RelationshipType,
  RelationshipWithPerson,
  PersonProfile,
  ImportantDate,
  RetentionConfig,
  FrameQuality,
  IdentityGrade,
  GradedIdentity,
  TranscriptStatus,
  ExtractionStatus,
  MemoryType,
  AppliesToPerson,
  ConversationRecording,
  ConversationRecordingRow,
  CreateConversationRecordingInput,
  ExtractedMemory,
  MemoryExtractionResult,
  PersonMemory,
  PersonMemoryRow,
  CreatePersonMemoryInput,
  UpdatePersonMemoryInput,
} from './types.js'
