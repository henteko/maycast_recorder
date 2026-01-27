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

export class RoomAPIClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
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
