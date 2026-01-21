/**
 * Unique identifier for a recording (UUID)
 */
export type RecordingId = string;

/**
 * Recording state
 */
export type RecordingState = 'standby' | 'recording' | 'finalizing' | 'synced';

/**
 * Recording metadata
 */
export interface RecordingMetadata {
  /** Video codec (e.g., "H.264", "VP9") */
  videoCodec: string;

  /** Audio codec (e.g., "AAC", "Opus") */
  audioCodec: string;

  /** Video width in pixels */
  width: number;

  /** Video height in pixels */
  height: number;

  /** Video bitrate in bits per second */
  videoBitrate: number;

  /** Audio bitrate in bits per second */
  audioBitrate: number;

  /** Frame rate (frames per second) */
  framerate: number;

  /** Total duration in microseconds */
  durationUs: number;
}

/**
 * Recording information (Phase 2 and later)
 */
export interface Recording {
  /** Unique recording identifier */
  id: RecordingId;

  /** Current recording state */
  state: RecordingState;

  /** Recording metadata */
  metadata: RecordingMetadata;

  /** Number of chunks uploaded */
  chunkCount: number;

  /** Creation timestamp (ISO 8601) */
  createdAt: string;

  /** Last updated timestamp (ISO 8601) */
  updatedAt: string;
}
