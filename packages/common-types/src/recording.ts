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

  /** Audio configuration */
  audioConfig?: {
    codec: string;
    sampleRate: number;
    channelCount: number;
    bitrate: number;
  };

  /** Total duration in microseconds */
  durationUs?: number;

  /** 同期録画開始情報（ポストプロダクション用） */
  syncInfo?: {
    /** スケジュールされたサーバー時刻T_start (ms since epoch) */
    scheduledStartTime: number;
    /** 実際にstartRecording()が呼ばれたローカル時刻 (ms since epoch) */
    actualStartTime: number;
    /** 使用した時計オフセット: localTime + offsetMs ≈ serverTime */
    clockOffsetMs: number;
    /** オフセットの推定精度（標準偏差, ms） */
    clockOffsetAccuracyMs: number;
    /** 同期に使用したサンプル数 */
    syncSampleCount: number;
  };
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
