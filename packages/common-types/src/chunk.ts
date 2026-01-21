import type { RecordingId } from './recording.js';

/**
 * Unique identifier for a chunk
 */
export type ChunkId = number;

/**
 * Metadata for a single chunk
 */
export interface ChunkMetadata {
  /** Recording ID this chunk belongs to */
  recordingId: RecordingId;

  /** Unique chunk identifier */
  chunkId: ChunkId;

  /** Timestamp in microseconds from session start */
  timestamp: number;

  /** Size of the chunk in bytes */
  size: number;

  /** BLAKE3 hash of the chunk data (optional in Phase 1, required in Phase 2+) */
  hash?: string;

  /** Whether this chunk contains a keyframe (optional, used in Phase 2+) */
  hasKeyframe?: boolean;

  /** Creation timestamp (Unix timestamp ms) */
  createdAt: number;
}
