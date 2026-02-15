import type { RoomId, RoomState, RecordingId, Room } from '@maycast/common-types';
import { RoomEntity, RoomNotFoundError } from '@maycast/common-types';
import type { IRoomRepository } from '../../domain/repositories/IRoomRepository.js';

/**
 * In-memory Room Repository の実装
 *
 * Phase 7でデータベース実装に置き換え予定
 */
export class InMemoryRoomRepository implements IRoomRepository {
  private rooms: Map<string, Room> = new Map();

  async save(room: RoomEntity): Promise<void> {
    const dto = room.toDTO();
    this.rooms.set(dto.id, dto);
  }

  async findById(id: RoomId): Promise<RoomEntity | null> {
    const data = this.rooms.get(id);
    if (!data) {
      return null;
    }
    return RoomEntity.reconstitute(data);
  }

  async findByAccessToken(accessToken: string): Promise<RoomEntity | null> {
    for (const data of this.rooms.values()) {
      if (data.accessToken === accessToken) {
        return RoomEntity.reconstitute(data);
      }
    }
    return null;
  }

  async findAll(): Promise<RoomEntity[]> {
    const rooms: RoomEntity[] = [];
    for (const data of this.rooms.values()) {
      rooms.push(RoomEntity.reconstitute(data));
    }
    return rooms;
  }

  async delete(id: RoomId): Promise<void> {
    this.rooms.delete(id);
  }

  async updateState(id: RoomId, state: RoomState): Promise<void> {
    const data = this.rooms.get(id);
    if (!data) {
      throw new RoomNotFoundError(`Room not found: ${id}`);
    }

    data.state = state;
    data.updatedAt = new Date().toISOString();
  }

  async addRecording(id: RoomId, recordingId: RecordingId): Promise<void> {
    const data = this.rooms.get(id);
    if (!data) {
      throw new RoomNotFoundError(`Room not found: ${id}`);
    }

    if (!data.recordingIds.includes(recordingId)) {
      data.recordingIds.push(recordingId);
      data.updatedAt = new Date().toISOString();
    }
  }

  async removeRecording(id: RoomId, recordingId: RecordingId): Promise<void> {
    const data = this.rooms.get(id);
    if (!data) {
      throw new RoomNotFoundError(`Room not found: ${id}`);
    }

    const index = data.recordingIds.indexOf(recordingId);
    if (index !== -1) {
      data.recordingIds.splice(index, 1);
      data.updatedAt = new Date().toISOString();
    }
  }
}
