/**
 * StandaloneStorageStrategy - Standalone Mode用のストレージ戦略
 *
 * OPFS + IndexedDBにのみ保存（サーバーへのアップロードなし）
 */

import { ChunkStorage } from '../infrastructure/storage/chunk-storage';
import type { IStorageStrategy } from './IStorageStrategy';
import type { RecordingId } from '@maycast/common-types';

export class StandaloneStorageStrategy implements IStorageStrategy {
  private storageMap: Map<RecordingId, ChunkStorage> = new Map();

  async initSession(recordingId: RecordingId): Promise<void> {
    const storage = new ChunkStorage(recordingId);
    await storage.initSession();
    this.storageMap.set(recordingId, storage);
  }

  async saveInitSegment(recordingId: RecordingId, data: Uint8Array): Promise<void> {
    const storage = this.storageMap.get(recordingId);
    if (!storage) {
      throw new Error(`ChunkStorage not initialized for recording: ${recordingId}`);
    }
    await storage.saveInitSegment(data);
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
    return storage.saveChunk(data, timestamp);
  }

  async completeSession(recordingId: RecordingId): Promise<void> {
    const storage = this.storageMap.get(recordingId);
    if (!storage) {
      throw new Error(`ChunkStorage not initialized for recording: ${recordingId}`);
    }
    await storage.completeSession();
    this.storageMap.delete(recordingId);
  }
}
