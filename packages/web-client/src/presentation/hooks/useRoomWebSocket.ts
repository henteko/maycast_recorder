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
import { getServerUrl } from '../../infrastructure/config/serverConfig';

export interface TimeSyncPongData {
  roomId: string;
  clientSendTime: number;
  serverReceiveTime: number;
  serverSendTime: number;
}

export interface ScheduledRecordingStartData {
  roomId: string;
  startAtServerTime: number;
}

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
  /** 時刻同期pongハンドラーを登録 */
  onTimeSyncPong: (handler: ((data: TimeSyncPongData) => void) | null) => void;
  /** スケジュール録画開始ハンドラーを登録 */
  onScheduledRecordingStart: (handler: ((data: ScheduledRecordingStartData) => void) | null) => void;
  /** 時刻同期pingを送信 */
  emitTimeSyncPing: (clientSendTime: number) => void;
}

/**
 * Room状態をWebSocket経由で監視するフック
 *
 * @param roomId Room ID
 * @param fallbackPollInterval WebSocket接続失敗時のフォールバックポーリング間隔（ミリ秒）
 * @param guestName Guest名（指定するとゲストとして追跡される）
 */
export function useRoomWebSocket(
  roomId: string | null,
  fallbackPollInterval: number = 3000,
  guestName?: string
): UseRoomWebSocketResult {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRoomNotFound, setIsRoomNotFound] = useState(false);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [guestCount, setGuestCount] = useState(0);

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsClientRef = useRef<ReturnType<typeof getWebSocketRoomClient> | null>(null);
  const timeSyncPongHandlerRef = useRef<((data: TimeSyncPongData) => void) | null>(null);
  const scheduledRecordingStartHandlerRef = useRef<((data: ScheduledRecordingStartData) => void) | null>(null);

  // HTTP経由でRoom状態を取得（認証不要）
  const fetchRoom = useCallback(async () => {
    if (!roomId) {
      setError('Room ID is required');
      setIsLoading(false);
      return;
    }

    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      const statusInfo = await apiClient.getRoomStatus(roomId);

      // RoomInfoとして構築（statusのみの情報から）
      setRoom((prev) => {
        if (prev) {
          return { ...prev, state: statusInfo.state };
        }
        // 初回は最小限の情報で構築
        return {
          id: statusInfo.id,
          state: statusInfo.state,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          recording_ids: [],
        };
      });
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

  // セーフティネットポーリングを開始（WebSocket接続中も10秒間隔で状態確認）
  const startSafetyPolling = useCallback(() => {
    if (safetyPollingRef.current) return;

    console.log('🛡️ [useRoomWebSocket] Starting safety-net polling (10s)');
    safetyPollingRef.current = setInterval(() => {
      fetchRoom();
    }, 10000);
  }, [fetchRoom]);

  // セーフティネットポーリングを停止
  const stopSafetyPolling = useCallback(() => {
    if (safetyPollingRef.current) {
      console.log('🛡️ [useRoomWebSocket] Stopping safety-net polling');
      clearInterval(safetyPollingRef.current);
      safetyPollingRef.current = null;
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
        startSafetyPolling();
        // 再接続時に見逃した状態変更をキャッチ
        fetchRoom();
        wsClient.joinRoom(roomId, guestName);
      },
      onDisconnect: () => {
        console.log('🔌 [useRoomWebSocket] WebSocket disconnected, starting polling');
        setIsWebSocketConnected(false);
        stopSafetyPolling();
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
      onTimeSyncPong: (data) => {
        timeSyncPongHandlerRef.current?.(data);
      },
      onScheduledRecordingStart: (data) => {
        if (data.roomId === roomId) {
          scheduledRecordingStartHandlerRef.current?.(data);
        }
      },
      onError: (data) => {
        console.error('❌ [useRoomWebSocket] Error:', data.message);
        setError(data.message);
      },
    });

    return () => {
      stopPolling();
      stopSafetyPolling();
      if (wsClient.getCurrentRoomId() === roomId) {
        wsClient.leaveRoom(roomId);
      }
      // Note: WebSocket接続自体は維持（他のコンポーネントが使う可能性あり）
    };
    // Note: guestNameは意図的に依存配列から除外（下の別エフェクトで対応）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, fetchRoom, startPolling, stopPolling, startSafetyPolling, stopSafetyPolling]);

  // guestNameが設定されたら再度Roomに参加（名前付きで）
  useEffect(() => {
    if (!roomId || !guestName) return;

    const wsClient = wsClientRef.current;
    if (wsClient && isWebSocketConnected) {
      console.log(`🔄 [useRoomWebSocket] Re-joining room with name: ${guestName}`);
      wsClient.joinRoom(roomId, guestName);
    }
  }, [roomId, guestName, isWebSocketConnected]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopPolling();
      stopSafetyPolling();
      resetWebSocketRoomClient();
    };
  }, [stopPolling, stopSafetyPolling]);

  // 時刻同期pongハンドラーの登録
  const onTimeSyncPong = useCallback((handler: ((data: TimeSyncPongData) => void) | null) => {
    timeSyncPongHandlerRef.current = handler;
  }, []);

  // スケジュール録画開始ハンドラーの登録
  const onScheduledRecordingStart = useCallback((handler: ((data: ScheduledRecordingStartData) => void) | null) => {
    scheduledRecordingStartHandlerRef.current = handler;
  }, []);

  // 時刻同期pingを送信
  const emitTimeSyncPing = useCallback((clientSendTime: number) => {
    const wsClient = wsClientRef.current;
    if (wsClient && roomId && isWebSocketConnected) {
      wsClient.emitTimeSyncPing(roomId, clientSendTime);
    }
  }, [roomId, isWebSocketConnected]);

  // Recording IDを設定（guestIdとrecordingIdを紐付け）
  const setRecordingId = useCallback((newRecordingId: string) => {
    const wsClient = wsClientRef.current;
    if (wsClient && roomId && isWebSocketConnected) {
      wsClient.setRecordingId(roomId, newRecordingId);
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
    onTimeSyncPong,
    onScheduledRecordingStart,
    emitTimeSyncPing,
  };
}
