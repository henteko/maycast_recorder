/**
 * Re-export common types from @maycast/common-types
 * This file serves as a bridge to the shared type definitions
 */

// Export types that will be used in Phase 2 and later
export type {
  ChunkId,
  RecordingId,
  RecordingState,
  RecordingMetadata,
  Recording,
  RoomId,
  RoomState,
  Room,
} from '@maycast/common-types';

// Note: Phase 1 uses its own ChunkMetadata and SessionMetadata
// in storage/types.ts. These will be migrated to common types
// during Phase 2 implementation.
