/**
 * Unique identifier for a recording (UUID)
 */
export type RecordingId = string;

/**
 * Recording state
 * - standby: 録画準備中
 * - recording: 録画中
 * - finalizing: 録画終了処理中
 * - synced: 同期完了（正常終了）
 * - interrupted: 異常終了（クラッシュ等で中断）
 */
export type RecordingState = 'standby' | 'recording' | 'finalizing' | 'synced' | 'interrupted';

/**
 * Recording metadata
 */
export interface RecordingMetadata {
  /** User-defined display name for the recording */
  displayName?: string;

  /** Participant name (set from guest name when recording is linked in a room) */
  participantName?: string;

  /** Device information */
  deviceInfo?: {
    browser: string;
    os: string;
    screenResolution: string;
  };

  /** Video configuration */
  videoConfig?: {
    codec: string;
    width: number;
    height: number;
    frameRate: number;
    bitrate: number;
  };

  /** Audio configuration */
  audioConfig?: {
    codec: string;
    sampleRate: number;
    channelCount: number;
    bitrate: number;
  };

  /** Total duration in microseconds */
  durationUs?: number;
}

/**
 * Recording information
 */
export interface Recording {
  /** Unique recording identifier */
  id: RecordingId;

  /** Room ID if this recording belongs to a room (Phase 4+) */
  roomId?: string;

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
