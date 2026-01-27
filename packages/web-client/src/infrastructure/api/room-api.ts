/**
 * Room API Client
 * サーバーのRoom管理APIとの通信を担当
 */

import type { RoomState } from '@maycast/common-types';

/**
 * サーバーから返されるRoom情報
 */
export interface RoomInfo {
  id: string;
  state: RoomState;
  created_at: string;
  updated_at: string;
  recording_ids: string[];
}

/**
 * Room作成レスポンス
 */
export interface CreateRoomResponse {
  room_id: string;
  created_at: string;
  state: RoomState;
}

/**
 * 全Room一覧レスポンス
 */
export interface GetAllRoomsResponse {
  rooms: RoomInfo[];
}

export class RoomAPIClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * 新しいRoomを作成
   */
  async createRoom(): Promise<CreateRoomResponse> {
    console.log(`📡 [RoomAPIClient] POST ${this.baseUrl}/api/rooms`);
    const response = await fetch(`${this.baseUrl}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to create room: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ [RoomAPIClient] Room created:`, data);
    return data;
  }

  /**
   * 全Room一覧を取得
   */
  async getAllRooms(): Promise<RoomInfo[]> {
    console.log(`📡 [RoomAPIClient] GET ${this.baseUrl}/api/rooms`);
    const response = await fetch(`${this.baseUrl}/api/rooms`);

    if (!response.ok) {
      throw new Error(`Failed to get rooms: ${response.statusText}`);
    }

    const data: GetAllRoomsResponse = await response.json();
    console.log(`✅ [RoomAPIClient] Rooms fetched:`, data.rooms.length);
    return data.rooms;
  }

  /**
   * Room情報を取得
   */
  async getRoom(roomId: string): Promise<RoomInfo> {
    console.log(`📡 [RoomAPIClient] GET ${this.baseUrl}/api/rooms/${roomId}`);
    const response = await fetch(`${this.baseUrl}/api/rooms/${roomId}`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new RoomNotFoundError(`Room not found: ${roomId}`);
      }
      throw new Error(`Failed to get room: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ [RoomAPIClient] Room fetched:`, data);
    return data;
  }

  /**
   * Room状態を更新
   */
  async updateRoomState(roomId: string, state: RoomState): Promise<void> {
    console.log(`📡 [RoomAPIClient] PATCH ${this.baseUrl}/api/rooms/${roomId}/state -> ${state}`);
    const response = await fetch(`${this.baseUrl}/api/rooms/${roomId}/state`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new RoomNotFoundError(`Room not found: ${roomId}`);
      }
      throw new Error(`Failed to update room state: ${response.statusText}`);
    }

    console.log(`✅ [RoomAPIClient] Room state updated to: ${state}`);
  }

  /**
   * Roomを削除
   */
  async deleteRoom(roomId: string): Promise<void> {
    console.log(`📡 [RoomAPIClient] DELETE ${this.baseUrl}/api/rooms/${roomId}`);
    const response = await fetch(`${this.baseUrl}/api/rooms/${roomId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new RoomNotFoundError(`Room not found: ${roomId}`);
      }
      throw new Error(`Failed to delete room: ${response.statusText}`);
    }

    console.log(`✅ [RoomAPIClient] Room deleted: ${roomId}`);
  }

  /**
   * Room状態を監視（ポーリング用）
   */
  async getRoomState(roomId: string): Promise<RoomState> {
    const room = await this.getRoom(roomId);
    return room.state;
  }
}

/**
 * Room Not Found Error
 */
export class RoomNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomNotFoundError';
  }
}
