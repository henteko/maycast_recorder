/**
 * useRoomManager - Room管理用カスタムフック
 *
 * Director ModeでRoom一覧の取得、作成、削除、状態更新を行う
 */

import { useState, useEffect, useCallback } from 'react';
import { RoomAPIClient, RoomNotFoundError } from '../../infrastructure/api/room-api';
import type { RoomInfo } from '../../infrastructure/api/room-api';
import type { RoomState } from '@maycast/common-types';
import { getServerUrl } from '../../infrastructure/config/serverConfig';

export interface UseRoomManagerResult {
  rooms: RoomInfo[];
  isLoading: boolean;
  error: string | null;
  createRoom: () => Promise<string | null>;
  deleteRoom: (roomId: string) => Promise<boolean>;
  updateRoomState: (roomId: string, state: RoomState) => Promise<boolean>;
  refreshRooms: () => Promise<void>;
}

/**
 * Room管理フック
 *
 * @param pollInterval ポーリング間隔（ミリ秒）。0の場合はポーリングしない。
 */
export function useRoomManager(pollInterval: number = 0): UseRoomManagerResult {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      const fetchedRooms = await apiClient.getAllRooms();

      setRooms(fetchedRooms);
      setError(null);
    } catch (err) {
      console.error('❌ [useRoomManager] Failed to fetch rooms:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch rooms');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初回読み込み
  useEffect(() => {
    setIsLoading(true);
    fetchRooms();
  }, [fetchRooms]);

  // ポーリング（オプション）
  useEffect(() => {
    if (pollInterval <= 0) {
      return;
    }

    const intervalId = setInterval(() => {
      fetchRooms();
    }, pollInterval);

    return () => clearInterval(intervalId);
  }, [pollInterval, fetchRooms]);

  const createRoom = useCallback(async (): Promise<string | null> => {
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      const result = await apiClient.createRoom();

      // Room一覧を更新
      await fetchRooms();

      return result.room_id;
    } catch (err) {
      console.error('❌ [useRoomManager] Failed to create room:', err);
      setError(err instanceof Error ? err.message : 'Failed to create room');
      return null;
    }
  }, [fetchRooms]);

  const deleteRoom = useCallback(async (roomId: string): Promise<boolean> => {
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      await apiClient.deleteRoom(roomId);

      // Room一覧を更新
      await fetchRooms();

      return true;
    } catch (err) {
      console.error('❌ [useRoomManager] Failed to delete room:', err);
      if (err instanceof RoomNotFoundError) {
        // Room not foundの場合も一覧を更新
        await fetchRooms();
      }
      setError(err instanceof Error ? err.message : 'Failed to delete room');
      return false;
    }
  }, [fetchRooms]);

  const updateRoomState = useCallback(async (
    roomId: string,
    state: RoomState
  ): Promise<boolean> => {
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      await apiClient.updateRoomState(roomId, state);

      // Room一覧を更新
      await fetchRooms();

      return true;
    } catch (err) {
      console.error('❌ [useRoomManager] Failed to update room state:', err);
      setError(err instanceof Error ? err.message : 'Failed to update room state');
      return false;
    }
  }, [fetchRooms]);

  return {
    rooms,
    isLoading,
    error,
    createRoom,
    deleteRoom,
    updateRoomState,
    refreshRooms: fetchRooms,
  };
}
