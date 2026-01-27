/**
 * useRoomWebSocket - Room状態のWebSocket監視フック
 *
 * WebSocket経由でRoom状態変更をリアルタイムに受信
 * 接続失敗時はポーリングにフォールバック
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getWebSocketRoomClient, resetWebSocketRoomClient } from '../../infrastructure/websocket/WebSocketRoomClient';
import { RoomAPIClient, RoomNotFoundError } from '../../infrastructure/api/room-api';
import type { RoomInfo } from '../../infrastructure/api/room-api';
import type { RoomState, RoomStateChanged } from '@maycast/common-types';
import { getServerUrl } from '../../modes/remote/serverConfig';

export interface UseRoomWebSocketResult {
  room: RoomInfo | null;
  roomState: RoomState | null;
  isLoading: boolean;
  error: string | null;
  isRoomNotFound: boolean;
  isWebSocketConnected: boolean;
  guestCount: number;
  refetch: () => Promise<void>;
  /** Recording IDを設定してRoomに再参加 */
  setRecordingId: (recordingId: string) => void;
}

/**
 * Room状態をWebSocket経由で監視するフック
 *
 * @param roomId Room ID
 * @param fallbackPollInterval WebSocket接続失敗時のフォールバックポーリング間隔（ミリ秒）
 */
export function useRoomWebSocket(
  roomId: string | null,
  fallbackPollInterval: number = 3000
): UseRoomWebSocketResult {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRoomNotFound, setIsRoomNotFound] = useState(false);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [guestCount, setGuestCount] = useState(0);
  const [recordingId, setRecordingIdState] = useState<string | null>(null);

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsClientRef = useRef<ReturnType<typeof getWebSocketRoomClient> | null>(null);

  // HTTP経由でRoom情報を取得
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

  // フォールバックポーリングを開始
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;

    console.log(`⏱️ [useRoomWebSocket] Starting fallback polling (${fallbackPollInterval}ms)`);
    pollingIntervalRef.current = setInterval(() => {
      fetchRoom();
    }, fallbackPollInterval);
  }, [fallbackPollInterval, fetchRoom]);

  // ポーリングを停止
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      console.log('⏱️ [useRoomWebSocket] Stopping fallback polling');
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // WebSocket接続とイベントハンドリング
  useEffect(() => {
    if (!roomId) return;

    const serverUrl = getServerUrl();
    const wsClient = getWebSocketRoomClient(serverUrl);
    wsClientRef.current = wsClient;

    // 初回データ取得
    setIsLoading(true);
    fetchRoom();

    // WebSocket接続
    wsClient.connect({
      onConnect: () => {
        console.log('✅ [useRoomWebSocket] WebSocket connected');
        setIsWebSocketConnected(true);
        stopPolling();
        wsClient.joinRoom(roomId, recordingId ?? undefined);
      },
      onDisconnect: () => {
        console.log('🔌 [useRoomWebSocket] WebSocket disconnected, starting polling');
        setIsWebSocketConnected(false);
        startPolling();
      },
      onRoomStateChanged: (data: RoomStateChanged) => {
        if (data.roomId === roomId) {
          console.log(`📡 [useRoomWebSocket] Room state changed: ${data.state}`);
          setRoom((prev) => prev ? { ...prev, state: data.state } : null);
        }
      },
      onGuestJoined: (data) => {
        if (data.roomId === roomId) {
          setGuestCount(data.guestCount);
        }
      },
      onGuestLeft: (data) => {
        if (data.roomId === roomId) {
          setGuestCount(data.guestCount);
        }
      },
      onError: (data) => {
        console.error('❌ [useRoomWebSocket] Error:', data.message);
        setError(data.message);
      },
    });

    return () => {
      stopPolling();
      if (wsClient.getCurrentRoomId() === roomId) {
        wsClient.leaveRoom(roomId);
      }
      // Note: WebSocket接続自体は維持（他のコンポーネントが使う可能性あり）
    };
  }, [roomId, fetchRoom, startPolling, stopPolling]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopPolling();
      resetWebSocketRoomClient();
    };
  }, [stopPolling]);

  // Recording IDを設定してRoomに再参加
  const setRecordingId = useCallback((newRecordingId: string) => {
    setRecordingIdState(newRecordingId);
    const wsClient = wsClientRef.current;
    if (wsClient && roomId && isWebSocketConnected) {
      // 一旦離脱してから再参加
      wsClient.leaveRoom(roomId);
      wsClient.joinRoom(roomId, newRecordingId);
    }
  }, [roomId, isWebSocketConnected]);

  return {
    room,
    roomState: room?.state ?? null,
    isLoading,
    error,
    isRoomNotFound,
    isWebSocketConnected,
    guestCount,
    refetch: fetchRoom,
    setRecordingId,
  };
}
