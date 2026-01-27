/**
 * Unique identifier for a room (Phase 4 and later)
 */
export type RoomId = string;

/**
 * Room state
 * - idle: 待機中
 * - recording: 録画中
 * - finalizing: 録画終了、Guestのアップロード待ち
 * - finished: 全Guestの同期完了
 */
export type RoomState = 'idle' | 'recording' | 'finalizing' | 'finished';

/**
 * Guest同期状態
 */
export type GuestSyncState = 'idle' | 'recording' | 'uploading' | 'synced' | 'error';

/**
 * Guest情報（Director向け）
 */
export interface GuestInfo {
  /** Recording ID (Guest識別用) */
  recordingId: string;

  /** 同期状態 */
  syncState: GuestSyncState;

  /** アップロード済みチャンク数 */
  uploadedChunks: number;

  /** 総チャンク数 */
  totalChunks: number;

  /** WebSocket接続状態 */
  isConnected: boolean;

  /** 最終更新時刻 */
  lastUpdatedAt: string;

  /** エラーメッセージ（エラー時のみ） */
  errorMessage?: string;
}

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
