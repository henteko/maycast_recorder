import type { RecordingId, RecordingState, RecordingMetadata, Recording } from '@maycast/common-types';
import { RecordingEntity, RecordingNotFoundError } from '@maycast/common-types';
import type { IRecordingRepository } from '../../domain/repositories/IRecordingRepository.js';

/**
 * In-memory Recording Repository の実装
 *
 * Phase 7でデータベース実装に置き換え予定
 */
export class InMemoryRecordingRepository implements IRecordingRepository {
  private recordings: Map<string, Recording> = new Map();

  async save(recording: RecordingEntity): Promise<void> {
    const dto = recording.toDTO();
    this.recordings.set(dto.id, dto);
  }

  async findById(id: RecordingId): Promise<RecordingEntity | null> {
    const data = this.recordings.get(id);
    if (!data) {
      return null;
    }
    return RecordingEntity.reconstitute(data);
  }

  async findAll(): Promise<RecordingEntity[]> {
    const recordings: RecordingEntity[] = [];
    for (const data of this.recordings.values()) {
      recordings.push(RecordingEntity.reconstitute(data));
    }
    return recordings;
  }

  async delete(id: RecordingId): Promise<void> {
    this.recordings.delete(id);
  }

  async updateState(id: RecordingId, state: RecordingState): Promise<void> {
    const data = this.recordings.get(id);
    if (!data) {
      throw new RecordingNotFoundError(`Recording not found: ${id}`);
    }

    data.state = state;
    data.updatedAt = new Date().toISOString();
  }

  async updateMetadata(id: RecordingId, metadata: RecordingMetadata): Promise<void> {
    const data = this.recordings.get(id);
    if (!data) {
      throw new RecordingNotFoundError(`Recording not found: ${id}`);
    }

    data.metadata = metadata;
    data.updatedAt = new Date().toISOString();
  }

  async incrementChunkCount(id: RecordingId): Promise<void> {
    const data = this.recordings.get(id);
    if (!data) {
      throw new RecordingNotFoundError(`Recording not found: ${id}`);
    }

    data.chunkCount++;
    data.updatedAt = new Date().toISOString();
  }

}
