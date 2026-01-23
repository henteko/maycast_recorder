import type { RecordingId, RecordingState, RecordingMetadata, Recording } from '@maycast/common-types';
import { RecordingEntity, RecordingNotFoundError } from '@maycast/common-types';
import type { IRecordingRepository } from '../../domain/repositories/IRecordingRepository';
import * as metadata from '../storage/metadata';

/**
 * IndexedDB を使用した Recording Repository の実装
 *
 * 既存の metadata.ts の低レベルAPIをラップして、
 * IRecordingRepository インターフェースを実装
 */
export class IndexedDBRecordingRepository implements IRecordingRepository {
  async save(recording: RecordingEntity): Promise<void> {
    const dto = recording.toDTO();
    await metadata.saveRecording(dto);
  }

  async findById(id: RecordingId): Promise<RecordingEntity | null> {
    const data = await metadata.getRecording(id);
    if (!data) {
      return null;
    }
    return RecordingEntity.reconstitute(data);
  }

  async findAll(): Promise<RecordingEntity[]> {
    const recordings = await metadata.listRecordings();
    return recordings.map(data => RecordingEntity.reconstitute(data));
  }

  async delete(id: RecordingId): Promise<void> {
    await metadata.deleteRecording(id);
  }

  async updateState(id: RecordingId, state: RecordingState): Promise<void> {
    const data = await metadata.getRecording(id);
    if (!data) {
      throw new RecordingNotFoundError(`Recording not found: ${id}`);
    }

    const updated: Recording = {
      ...data,
      state,
      updatedAt: new Date().toISOString(),
    };

    await metadata.saveRecording(updated);
  }

  async updateMetadata(id: RecordingId, recordingMetadata: RecordingMetadata): Promise<void> {
    const data = await metadata.getRecording(id);
    if (!data) {
      throw new RecordingNotFoundError(`Recording not found: ${id}`);
    }

    const updated: Recording = {
      ...data,
      metadata: recordingMetadata,
      updatedAt: new Date().toISOString(),
    };

    await metadata.saveRecording(updated);
  }

  async updateChunkCount(id: RecordingId, count: number): Promise<void> {
    const data = await metadata.getRecording(id);
    if (!data) {
      throw new RecordingNotFoundError(`Recording not found: ${id}`);
    }

    const updated: Recording = {
      ...data,
      chunkCount: count,
      updatedAt: new Date().toISOString(),
    };

    await metadata.saveRecording(updated);
  }

  async updateTotalSize(id: RecordingId, size: number): Promise<void> {
    const data = await metadata.getRecording(id);
    if (!data) {
      throw new RecordingNotFoundError(`Recording not found: ${id}`);
    }

    const updated: Recording = {
      ...data,
      totalSize: size,
      updatedAt: new Date().toISOString(),
    };

    await metadata.saveRecording(updated);
  }
}
