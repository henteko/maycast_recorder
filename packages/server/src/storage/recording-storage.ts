import { Recording, RecordingState, RecordingMetadata } from '../types/recording.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * In-memory storage for Recording metadata.
 * Phase 7で実装予定: データベースに移行
 */
export class RecordingStorage {
  private recordings: Map<string, Recording> = new Map();

  /**
   * 新しいRecordingを作成
   */
  createRecording(): Recording {
    const recording: Recording = {
      id: uuidv4(),
      state: 'standby',
      createdAt: new Date(),
      chunkCount: 0
    };

    this.recordings.set(recording.id, recording);
    return recording;
  }

  /**
   * Recording IDでRecordingを取得
   */
  getRecording(id: string): Recording | undefined {
    return this.recordings.get(id);
  }

  /**
   * Recording状態を更新
   */
  updateState(id: string, state: RecordingState): boolean {
    const recording = this.recordings.get(id);
    if (!recording) {
      return false;
    }

    // 状態遷移のバリデーション
    if (!this.isValidStateTransition(recording.state, state)) {
      throw new Error(`Invalid state transition: ${recording.state} -> ${state}`);
    }

    recording.state = state;

    // 録画開始時刻を記録
    if (state === 'recording' && !recording.startedAt) {
      recording.startedAt = new Date();
    }

    // 録画終了時刻を記録
    if (state === 'synced' && !recording.finishedAt) {
      recording.finishedAt = new Date();
    }

    return true;
  }

  /**
   * Recordingメタデータを更新
   */
  updateMetadata(id: string, metadata: RecordingMetadata): boolean {
    const recording = this.recordings.get(id);
    if (!recording) {
      return false;
    }

    recording.metadata = metadata;
    return true;
  }

  /**
   * チャンクカウントをインクリメント
   */
  incrementChunkCount(id: string): boolean {
    const recording = this.recordings.get(id);
    if (!recording) {
      return false;
    }

    recording.chunkCount++;
    return true;
  }

  /**
   * 状態遷移が有効かチェック
   * standby -> recording -> finalizing -> synced
   */
  private isValidStateTransition(from: RecordingState, to: RecordingState): boolean {
    const validTransitions: Record<RecordingState, RecordingState[]> = {
      standby: ['recording'],
      recording: ['finalizing', 'synced'], // 直接syncedも許可（チャンクが少ない場合など）
      finalizing: ['synced'],
      synced: [] // synced状態からは遷移不可
    };

    return validTransitions[from].includes(to);
  }

  /**
   * すべてのRecordingを取得（デバッグ用）
   */
  getAllRecordings(): Recording[] {
    return Array.from(this.recordings.values());
  }
}
