import type pg from 'pg';
import type { RecordingId, RecordingState, RecordingMetadata, Recording } from '@maycast/common-types';
import { RecordingEntity, RecordingNotFoundError } from '@maycast/common-types';
import type { IRecordingRepository } from '../../domain/repositories/IRecordingRepository.js';

/**
 * PostgreSQL Recording Repository の実装
 *
 * InMemoryRecordingRepositoryを置き換えるDB永続化実装
 */
export class PostgresRecordingRepository implements IRecordingRepository {
  constructor(private readonly pool: pg.Pool) {}

  async save(recording: RecordingEntity): Promise<void> {
    const dto = recording.toDTO();
    await this.pool.query(
      `INSERT INTO recordings (id, room_id, state, metadata, chunk_count, total_size, start_time, end_time, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (id) DO UPDATE SET
         room_id = EXCLUDED.room_id,
         state = EXCLUDED.state,
         metadata = EXCLUDED.metadata,
         chunk_count = EXCLUDED.chunk_count,
         total_size = EXCLUDED.total_size,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         updated_at = EXCLUDED.updated_at`,
      [
        dto.id,
        dto.roomId ?? null,
        dto.state,
        dto.metadata ? JSON.stringify(dto.metadata) : null,
        dto.chunkCount,
        dto.totalSize,
        dto.startTime,
        dto.endTime ?? null,
        dto.createdAt,
        dto.updatedAt,
      ]
    );
  }

  async findById(id: RecordingId): Promise<RecordingEntity | null> {
    const result = await this.pool.query(
      'SELECT * FROM recordings WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return RecordingEntity.reconstitute(this.rowToDTO(result.rows[0]));
  }

  async findAll(): Promise<RecordingEntity[]> {
    const result = await this.pool.query(
      'SELECT * FROM recordings ORDER BY created_at DESC'
    );

    return result.rows.map((row) =>
      RecordingEntity.reconstitute(this.rowToDTO(row))
    );
  }

  async delete(id: RecordingId): Promise<void> {
    await this.pool.query('DELETE FROM recordings WHERE id = $1', [id]);
  }

  async updateState(id: RecordingId, state: RecordingState): Promise<void> {
    const result = await this.pool.query(
      'UPDATE recordings SET state = $1 WHERE id = $2',
      [state, id]
    );

    if (result.rowCount === 0) {
      throw new RecordingNotFoundError(`Recording not found: ${id}`);
    }
  }

  async updateMetadata(id: RecordingId, metadata: RecordingMetadata): Promise<void> {
    const result = await this.pool.query(
      'UPDATE recordings SET metadata = $1 WHERE id = $2',
      [JSON.stringify(metadata), id]
    );

    if (result.rowCount === 0) {
      throw new RecordingNotFoundError(`Recording not found: ${id}`);
    }
  }

  async incrementChunkCount(id: RecordingId): Promise<void> {
    const result = await this.pool.query(
      'UPDATE recordings SET chunk_count = chunk_count + 1 WHERE id = $1',
      [id]
    );

    if (result.rowCount === 0) {
      throw new RecordingNotFoundError(`Recording not found: ${id}`);
    }
  }

  async updateProcessingState(
    id: RecordingId,
    state: 'pending' | 'processing' | 'completed' | 'failed',
    error?: string,
    outputKeys?: { mp4Key: string; m4aKey: string }
  ): Promise<void> {
    let query: string;
    let params: unknown[];

    if (state === 'completed' && outputKeys) {
      query = `UPDATE recordings SET processing_state = $1, processing_error = NULL, output_mp4_key = $2, output_m4a_key = $3, processed_at = NOW() WHERE id = $4`;
      params = [state, outputKeys.mp4Key, outputKeys.m4aKey, id];
    } else if (state === 'failed') {
      query = `UPDATE recordings SET processing_state = $1, processing_error = $2 WHERE id = $3`;
      params = [state, error ?? null, id];
    } else {
      query = `UPDATE recordings SET processing_state = $1 WHERE id = $2`;
      params = [state, id];
    }

    const result = await this.pool.query(query, params);
    if (result.rowCount === 0) {
      throw new RecordingNotFoundError(`Recording not found: ${id}`);
    }
  }

  /**
   * DBの行をRecording DTOに変換
   */
  private rowToDTO(row: Record<string, unknown>): Recording {
    return {
      id: row.id as string,
      roomId: (row.room_id as string) ?? undefined,
      state: row.state as RecordingState,
      metadata: (row.metadata as RecordingMetadata) ?? undefined,
      chunkCount: row.chunk_count as number,
      totalSize: Number(row.total_size),
      startTime: Number(row.start_time),
      endTime: row.end_time ? Number(row.end_time) : undefined,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
    };
  }
}
