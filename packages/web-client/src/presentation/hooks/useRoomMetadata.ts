/**
 * useRoomMetadata - Room情報の取得と監視
 *
 * Guest ModeでRoom情報を取得し、状態の変化を監視する
 */

import { useState, useEffect, useCallback } from 'react';
import { RoomAPIClient, RoomNotFoundError } from '../../infrastructure/api/room-api';
import type { RoomInfo } from '../../infrastructure/api/room-api';
import type { RoomState } from '@maycast/common-types';
import { getServerUrl } from '../../modes/remote/serverConfig';

export interface UseRoomMetadataResult {
  room: RoomInfo | null;
  roomState: RoomState | null;
  isLoading: boolean;
  error: string | null;
  isRoomNotFound: boolean;
  refetch: () => Promise<void>;
}

/**
 * Room情報を取得・監視するフック
 *
 * @param roomId Room ID
 * @param pollInterval ポーリング間隔（ミリ秒）。0の場合はポーリングしない。
 */
export function useRoomMetadata(
  roomId: string | null,
  pollInterval: number = 0
): UseRoomMetadataResult {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRoomNotFound, setIsRoomNotFound] = useState(false);

  const fetchRoom = useCallback(async () => {
    if (!roomId) {
      setError('Room ID is required');
      setIsLoading(false);
      return;
    }

    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      const roomInfo = await apiClient.getRoom(roomId);

      setRoom(roomInfo);
      setError(null);
      setIsRoomNotFound(false);
    } catch (err) {
      if (err instanceof RoomNotFoundError) {
        setIsRoomNotFound(true);
        setError(`Room not found: ${roomId}`);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch room');
      }
      setRoom(null);
    } finally {
      setIsLoading(false);
    }
  }, [roomId]);

  // 初回読み込み
  useEffect(() => {
    setIsLoading(true);
    fetchRoom();
  }, [fetchRoom]);

  // ポーリング（オプション）
  useEffect(() => {
    if (pollInterval <= 0 || !roomId || isRoomNotFound) {
      return;
    }

    const intervalId = setInterval(() => {
      fetchRoom();
    }, pollInterval);

    return () => clearInterval(intervalId);
  }, [pollInterval, roomId, isRoomNotFound, fetchRoom]);

  return {
    room,
    roomState: room?.state ?? null,
    isLoading,
    error,
    isRoomNotFound,
    refetch: fetchRoom,
  };
}
