import type pg from 'pg';
import type { RoomId, RoomState, RecordingId, Room } from '@maycast/common-types';
import { RoomEntity, RoomNotFoundError } from '@maycast/common-types';
import type { IRoomRepository } from '../../domain/repositories/IRoomRepository.js';

/**
 * PostgreSQL Room Repository の実装
 *
 * InMemoryRoomRepositoryを置き換えるDB永続化実装
 */
export class PostgresRoomRepository implements IRoomRepository {
  constructor(private readonly pool: pg.Pool) {}

  async save(room: RoomEntity): Promise<void> {
    const dto = room.toDTO();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO rooms (id, access_key, state, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET
           state = EXCLUDED.state,
           updated_at = EXCLUDED.updated_at`,
        [dto.id, dto.accessKey, dto.state, dto.createdAt, dto.updatedAt]
      );

      // room_recordingsを再構築
      await client.query('DELETE FROM room_recordings WHERE room_id = $1', [dto.id]);

      for (const recordingId of dto.recordingIds) {
        await client.query(
          'INSERT INTO room_recordings (room_id, recording_id) VALUES ($1, $2)',
          [dto.id, recordingId]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async findById(id: RoomId): Promise<RoomEntity | null> {
    const roomResult = await this.pool.query(
      'SELECT * FROM rooms WHERE id = $1',
      [id]
    );

    if (roomResult.rows.length === 0) {
      return null;
    }

    const recordingIdsResult = await this.pool.query(
      'SELECT recording_id FROM room_recordings WHERE room_id = $1 ORDER BY created_at',
      [id]
    );

    const recordingIds = recordingIdsResult.rows.map(
      (row) => row.recording_id as string
    );

    return RoomEntity.reconstitute(this.rowToDTO(roomResult.rows[0], recordingIds));
  }

  async findAll(): Promise<RoomEntity[]> {
    const roomsResult = await this.pool.query(
      'SELECT * FROM rooms ORDER BY created_at DESC'
    );

    const rooms: RoomEntity[] = [];
    for (const row of roomsResult.rows) {
      const recordingIdsResult = await this.pool.query(
        'SELECT recording_id FROM room_recordings WHERE room_id = $1 ORDER BY created_at',
        [row.id]
      );
      const recordingIds = recordingIdsResult.rows.map(
        (r) => r.recording_id as string
      );
      rooms.push(RoomEntity.reconstitute(this.rowToDTO(row, recordingIds)));
    }

    return rooms;
  }

  async delete(id: RoomId): Promise<void> {
    // room_recordingsはON DELETE CASCADEで自動削除される
    await this.pool.query('DELETE FROM rooms WHERE id = $1', [id]);
  }

  async updateState(id: RoomId, state: RoomState): Promise<void> {
    const result = await this.pool.query(
      'UPDATE rooms SET state = $1 WHERE id = $2',
      [state, id]
    );

    if (result.rowCount === 0) {
      throw new RoomNotFoundError(`Room not found: ${id}`);
    }
  }

  async addRecording(id: RoomId, recordingId: RecordingId): Promise<void> {
    // Roomの存在確認
    const roomResult = await this.pool.query(
      'SELECT id FROM rooms WHERE id = $1',
      [id]
    );

    if (roomResult.rows.length === 0) {
      throw new RoomNotFoundError(`Room not found: ${id}`);
    }

    await this.pool.query(
      `INSERT INTO room_recordings (room_id, recording_id)
       VALUES ($1, $2)
       ON CONFLICT (room_id, recording_id) DO NOTHING`,
      [id, recordingId]
    );
  }

  async removeRecording(id: RoomId, recordingId: RecordingId): Promise<void> {
    const roomResult = await this.pool.query(
      'SELECT id FROM rooms WHERE id = $1',
      [id]
    );

    if (roomResult.rows.length === 0) {
      throw new RoomNotFoundError(`Room not found: ${id}`);
    }

    await this.pool.query(
      'DELETE FROM room_recordings WHERE room_id = $1 AND recording_id = $2',
      [id, recordingId]
    );
  }

  /**
   * DBの行をRoom DTOに変換
   */
  private rowToDTO(row: Record<string, unknown>, recordingIds: string[]): Room {
    return {
      id: row.id as string,
      accessKey: row.access_key as string,
      state: row.state as RoomState,
      createdAt: (row.created_at as Date).toISOString(),
      updatedAt: (row.updated_at as Date).toISOString(),
      recordingIds,
    };
  }
}
