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
 * Room状態のみ（認証不要、Guest用）
 */
export interface RoomStatusInfo {
  id: string;
  state: RoomState;
}

/**
 * Room作成レスポンス
 */
export interface CreateRoomResponse {
  room_id: string;
  access_key: string;
  created_at: string;
  state: RoomState;
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
   * Room情報を取得（accessKey必須）
   */
  async getRoom(roomId: string, accessKey: string): Promise<RoomInfo> {
    console.log(`📡 [RoomAPIClient] GET ${this.baseUrl}/api/rooms/${roomId}`);
    const response = await fetch(`${this.baseUrl}/api/rooms/${roomId}`, {
      headers: {
        'x-room-access-key': accessKey,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new RoomNotFoundError(`Room not found: ${roomId}`);
      }
      if (response.status === 403) {
        throw new RoomAccessDeniedError(`Access denied for room: ${roomId}`);
      }
      throw new Error(`Failed to get room: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ [RoomAPIClient] Room fetched:`, data);
    return data;
  }

  /**
   * Room状態のみ取得（認証不要、Guest用）
   */
  async getRoomStatus(roomId: string): Promise<RoomStatusInfo> {
    console.log(`📡 [RoomAPIClient] GET ${this.baseUrl}/api/rooms/${roomId}/status`);
    const response = await fetch(`${this.baseUrl}/api/rooms/${roomId}/status`);

    if (!response.ok) {
      if (response.status === 404) {
        throw new RoomNotFoundError(`Room not found: ${roomId}`);
      }
      throw new Error(`Failed to get room status: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ [RoomAPIClient] Room status fetched:`, data);
    return data;
  }

  /**
   * Room状態を更新（accessKey必須）
   */
  async updateRoomState(roomId: string, state: RoomState, accessKey: string): Promise<void> {
    console.log(`📡 [RoomAPIClient] PATCH ${this.baseUrl}/api/rooms/${roomId}/state -> ${state}`);
    const response = await fetch(`${this.baseUrl}/api/rooms/${roomId}/state`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'x-room-access-key': accessKey,
      },
      body: JSON.stringify({ state }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new RoomNotFoundError(`Room not found: ${roomId}`);
      }
      if (response.status === 403) {
        throw new RoomAccessDeniedError(`Access denied for room: ${roomId}`);
      }
      throw new Error(`Failed to update room state: ${response.statusText}`);
    }

    console.log(`✅ [RoomAPIClient] Room state updated to: ${state}`);
  }

  /**
   * Roomを削除（accessKey必須）
   */
  async deleteRoom(roomId: string, accessKey: string): Promise<void> {
    console.log(`📡 [RoomAPIClient] DELETE ${this.baseUrl}/api/rooms/${roomId}`);
    const response = await fetch(`${this.baseUrl}/api/rooms/${roomId}`, {
      method: 'DELETE',
      headers: {
        'x-room-access-key': accessKey,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new RoomNotFoundError(`Room not found: ${roomId}`);
      }
      if (response.status === 403) {
        throw new RoomAccessDeniedError(`Access denied for room: ${roomId}`);
      }
      throw new Error(`Failed to delete room: ${response.statusText}`);
    }

    console.log(`✅ [RoomAPIClient] Room deleted: ${roomId}`);
  }

  /**
   * Room内のRecording一覧を取得（accessKey必須）
   */
  async getRoomRecordings(roomId: string, accessKey: string): Promise<{ room_id: string; recordings: unknown[] }> {
    console.log(`📡 [RoomAPIClient] GET ${this.baseUrl}/api/rooms/${roomId}/recordings`);
    const response = await fetch(`${this.baseUrl}/api/rooms/${roomId}/recordings`, {
      headers: {
        'x-room-access-key': accessKey,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new RoomNotFoundError(`Room not found: ${roomId}`);
      }
      if (response.status === 403) {
        throw new RoomAccessDeniedError(`Access denied for room: ${roomId}`);
      }
      throw new Error(`Failed to get room recordings: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ [RoomAPIClient] Room recordings fetched:`, data);
    return data;
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

/**
 * Room Access Denied Error
 */
export class RoomAccessDeniedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RoomAccessDeniedError';
  }
}
