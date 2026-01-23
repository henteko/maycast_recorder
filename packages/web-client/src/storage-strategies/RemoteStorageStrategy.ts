/**
 * RemoteStorageStrategy - Remote Mode用のストレージ戦略（スタブ実装）
 *
 * Phase 2A-5-4で完全実装予定
 * 現在はStandaloneStorageStrategyと同じ動作（OPFSのみ）
 */

import { ChunkStorage } from '../storage/chunk-storage';
import type { IStorageStrategy } from './IStorageStrategy';
import type { RecordingId } from '@maycast/common-types';

export class RemoteStorageStrategy implements IStorageStrategy {
  private storageMap: Map<RecordingId, ChunkStorage> = new Map();

  async initSession(recordingId: RecordingId): Promise<void> {
    const storage = new ChunkStorage(recordingId);
    await storage.initSession();
    this.storageMap.set(recordingId, storage);

    // TODO: Phase 2A-5-4 - サーバーにRecording作成リクエストを送信
    console.log('🚧 [RemoteStorageStrategy] TODO: Create recording on server');
  }

  async saveInitSegment(recordingId: RecordingId, data: Uint8Array): Promise<void> {
    const storage = this.storageMap.get(recordingId);
    if (!storage) {
      throw new Error(`ChunkStorage not initialized for recording: ${recordingId}`);
    }
    await storage.saveInitSegment(data);

    // TODO: Phase 2A-5-4 - サーバーにinit segmentをアップロード
    console.log('🚧 [RemoteStorageStrategy] TODO: Upload init segment to server');
  }

  async saveChunk(
    recordingId: RecordingId,
    data: Uint8Array,
    timestamp: number
  ): Promise<number> {
    const storage = this.storageMap.get(recordingId);
    if (!storage) {
      throw new Error(`ChunkStorage not initialized for recording: ${recordingId}`);
    }
    const chunkId = await storage.saveChunk(data, timestamp);

    // TODO: Phase 2A-5-4 - サーバーにチャンクをアップロード（非同期）
    console.log(`🚧 [RemoteStorageStrategy] TODO: Upload chunk #${chunkId} to server`);

    return chunkId;
  }

  async completeSession(recordingId: RecordingId): Promise<void> {
    const storage = this.storageMap.get(recordingId);
    if (!storage) {
      throw new Error(`ChunkStorage not initialized for recording: ${recordingId}`);
    }
    await storage.completeSession();
    this.storageMap.delete(recordingId);

    // TODO: Phase 2A-5-4 - 全チャンクのアップロード完了を待機し、状態を'synced'に更新
    console.log('🚧 [RemoteStorageStrategy] TODO: Wait for all chunks upload and update state to synced');
  }

  getUploadProgress(): { uploaded: number; total: number } {
    // TODO: Phase 2A-5-4 - 実際のアップロード進捗を返す
    return { uploaded: 0, total: 0 };
  }
}
