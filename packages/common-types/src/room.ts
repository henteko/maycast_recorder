/**
 * Unique identifier for a room (Phase 4 and later)
 */
export type RoomId = string;

/**
 * Room state
 */
export type RoomState = 'idle' | 'recording' | 'finished';

/**
 * Room information (Phase 4 and later)
 */
export interface Room {
  /** Unique room identifier */
  id: RoomId;

  /** Current room state */
  state: RoomState;

  /** Creation timestamp (ISO 8601) */
  createdAt: string;

  /** Last updated timestamp (ISO 8601) */
  updatedAt: string;

  /** List of recording IDs in this room */
  recordingIds: string[];
}
