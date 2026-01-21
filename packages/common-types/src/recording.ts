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
 * Recording information
 */
export interface Recording {
  /** Unique recording identifier */
  id: RecordingId;

  /** Current recording state */
  state: RecordingState;

  /** Recording metadata (optional for Phase 1 compatibility) */
  metadata?: RecordingMetadata;

  /** Number of chunks */
  chunkCount: number;

  /** Total size of all chunks in bytes */
  totalSize: number;

  /** Recording start time (Unix timestamp ms) */
  startTime: number;

  /** Recording end time (Unix timestamp ms, optional) */
  endTime?: number;

  /** Creation timestamp (ISO 8601) */
  createdAt: string;

  /** Last updated timestamp (ISO 8601) */
  updatedAt: string;
}
