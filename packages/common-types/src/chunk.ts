/**
 * Unique identifier for a chunk
 */
export type ChunkId = number;

/**
 * Metadata for a single chunk
 */
export interface ChunkMetadata {
  /** Unique chunk identifier */
  chunkId: ChunkId;

  /** Timestamp in microseconds from session start */
  timestamp: number;

  /** Size of the chunk in bytes */
  size: number;

  /** BLAKE3 hash of the chunk data */
  hash: string;

  /** Whether this chunk contains a keyframe */
  hasKeyframe: boolean;
}
