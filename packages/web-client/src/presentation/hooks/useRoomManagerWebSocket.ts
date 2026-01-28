/**
 * useRoomManagerWebSocket - Room一覧管理のWebSocket対応フック
 *
 * WebSocket経由でRoom状態変更をリアルタイムに受信
 * Room作成/削除/状態更新はHTTP APIを使用
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getWebSocketRoomClient, resetWebSocketRoomClient, type RoomGuestsData } from '../../infrastructure/websocket/WebSocketRoomClient';
import { RoomAPIClient, RoomNotFoundError } from '../../infrastructure/api/room-api';
import type { RoomInfo } from '../../infrastructure/api/room-api';
import type {
  RoomState,
  RoomStateChanged,
  RecordingCreated,
  GuestInfo,
  GuestSyncStateChanged,
  GuestSyncComplete,
  GuestSyncError,
} from '@maycast/common-types';
import { getServerUrl } from '../../infrastructure/config/serverConfig';

export interface UseRoomManagerWebSocketResult {
  rooms: RoomInfo[];
  isLoading: boolean;
  error: string | null;
  isWebSocketConnected: boolean;
  /** Room毎のGuest情報 (roomId -> guestId -> GuestInfo) */
  guestsByRoom: Map<string, Map<string, GuestInfo>>;
  /** Room毎のGuest波形データ (roomId -> guestId -> { waveformData, isSilent }) */
  waveformsByRoom: Map<string, Map<string, { waveformData: number[]; isSilent: boolean }>>;
  createRoom: () => Promise<string | null>;
  deleteRoom: (roomId: string) => Promise<boolean>;
  updateRoomState: (roomId: string, state: RoomState) => Promise<boolean>;
  refreshRooms: () => Promise<void>;
}

/**
 * Room一覧をWebSocket経由で監視するフック
 *
 * @param fallbackPollInterval WebSocket接続失敗時のフォールバックポーリング間隔（ミリ秒）
 */
export function useRoomManagerWebSocket(
  fallbackPollInterval: number = 5000
): UseRoomManagerWebSocketResult {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [guestsByRoom, setGuestsByRoom] = useState<Map<string, Map<string, GuestInfo>>>(new Map());
  const [waveformsByRoom, setWaveformsByRoom] = useState<Map<string, Map<string, { waveformData: number[]; isSilent: boolean }>>>(new Map());

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsClientRef = useRef<ReturnType<typeof getWebSocketRoomClient> | null>(null);
  const subscribedRoomsRef = useRef<Set<string>>(new Set());

  // HTTP経由でRoom一覧を取得
  const fetchRooms = useCallback(async () => {
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      const fetchedRooms = await apiClient.getAllRooms();

      setRooms(fetchedRooms);
      setError(null);

      // 新しいRoomをWebSocketで購読
      const wsClient = wsClientRef.current;
      if (wsClient && isWebSocketConnected) {
        fetchedRooms.forEach((room) => {
          if (!subscribedRoomsRef.current.has(room.id)) {
            wsClient.joinRoom(room.id);
            subscribedRoomsRef.current.add(room.id);
          }
        });
      }
    } catch (err) {
      console.error('❌ [useRoomManagerWebSocket] Failed to fetch rooms:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch rooms');
    } finally {
      setIsLoading(false);
    }
  }, [isWebSocketConnected]);

  // フォールバックポーリングを開始
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;

    console.log(`⏱️ [useRoomManagerWebSocket] Starting fallback polling (${fallbackPollInterval}ms)`);
    pollingIntervalRef.current = setInterval(() => {
      fetchRooms();
    }, fallbackPollInterval);
  }, [fallbackPollInterval, fetchRooms]);

  // ポーリングを停止
  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      console.log('⏱️ [useRoomManagerWebSocket] Stopping fallback polling');
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // WebSocket接続とイベントハンドリング
  useEffect(() => {
    const serverUrl = getServerUrl();
    const wsClient = getWebSocketRoomClient(serverUrl);
    wsClientRef.current = wsClient;

    // 初回データ取得
    setIsLoading(true);
    fetchRooms();

    // WebSocket接続
    wsClient.connect({
      onConnect: async () => {
        console.log('✅ [useRoomManagerWebSocket] WebSocket connected');
        setIsWebSocketConnected(true);
        stopPolling();

        // 接続時に最新のRoom一覧を取得して購読（クロージャの stale state 問題を回避）
        try {
          const apiClient = new RoomAPIClient(serverUrl);
          const currentRooms = await apiClient.getAllRooms();
          console.log(`📥 [useRoomManagerWebSocket] Joining ${currentRooms.length} rooms on connect`);
          currentRooms.forEach((room) => {
            if (!subscribedRoomsRef.current.has(room.id)) {
              wsClient.joinRoom(room.id);
              subscribedRoomsRef.current.add(room.id);
            }
          });
        } catch (err) {
          console.error('❌ [useRoomManagerWebSocket] Failed to join rooms on connect:', err);
        }
      },
      onDisconnect: () => {
        console.log('🔌 [useRoomManagerWebSocket] WebSocket disconnected, starting polling');
        setIsWebSocketConnected(false);
        subscribedRoomsRef.current.clear();
        startPolling();
      },
      onRoomStateChanged: (data: RoomStateChanged) => {
        console.log(`📡 [useRoomManagerWebSocket] Room state changed: ${data.roomId} -> ${data.state}`);
        setRooms((prev) =>
          prev.map((room) =>
            room.id === data.roomId ? { ...room, state: data.state } : room
          )
        );
      },
      onRecordingCreated: (data: RecordingCreated) => {
        console.log(`📡 [useRoomManagerWebSocket] Recording created in room: ${data.roomId}`);
        setRooms((prev) =>
          prev.map((room) =>
            room.id === data.roomId
              ? { ...room, recording_ids: [...room.recording_ids, data.recordingId] }
              : room
          )
        );
      },
      onGuestJoined: (data) => {
        console.log(`📡 [useRoomManagerWebSocket] Guest joined room: ${data.roomId}, guestId: ${data.guestId}, count: ${data.guestCount}, recording: ${data.recordingId}, name: ${data.name}`);
        // Guest情報を追加（guestIdをキーにして常に追加）
        setGuestsByRoom((prev) => {
          const next = new Map(prev);
          if (!next.has(data.roomId)) {
            next.set(data.roomId, new Map());
          }
          const roomGuests = next.get(data.roomId)!;
          const existing = roomGuests.get(data.guestId);
          roomGuests.set(data.guestId, {
            guestId: data.guestId,
            recordingId: data.recordingId ?? existing?.recordingId,
            name: data.name ?? existing?.name,
            syncState: existing?.syncState ?? 'idle',
            uploadedChunks: existing?.uploadedChunks ?? 0,
            totalChunks: existing?.totalChunks ?? 0,
            isConnected: true,
            lastUpdatedAt: new Date().toISOString(),
          });
          return next;
        });
      },
      onGuestLeft: (data) => {
        console.log(`📡 [useRoomManagerWebSocket] Guest left room: ${data.roomId}, guestId: ${data.guestId}, count: ${data.guestCount}, recording: ${data.recordingId}, name: ${data.name}`);
        // Guest情報を更新（接続状態をfalseに）
        setGuestsByRoom((prev) => {
          const next = new Map(prev);
          const roomGuests = next.get(data.roomId);
          if (roomGuests) {
            const guest = roomGuests.get(data.guestId);
            if (guest) {
              roomGuests.set(data.guestId, {
                ...guest,
                isConnected: false,
                lastUpdatedAt: new Date().toISOString(),
              });
            }
          }
          return next;
        });
      },
      onGuestRecordingLinked: (data) => {
        console.log(`📡 [useRoomManagerWebSocket] Guest recording linked: room=${data.roomId}, guestId=${data.guestId}, recording=${data.recordingId}, name=${data.name}`);
        // GuestのrecordingIdを更新
        setGuestsByRoom((prev) => {
          const next = new Map(prev);
          const roomGuests = next.get(data.roomId);
          if (roomGuests) {
            const guest = roomGuests.get(data.guestId);
            if (guest) {
              roomGuests.set(data.guestId, {
                ...guest,
                recordingId: data.recordingId,
                lastUpdatedAt: new Date().toISOString(),
              });
            }
          }
          return next;
        });
      },
      onGuestMediaStatusChanged: (data) => {
        console.log(`📡 [useRoomManagerWebSocket] Guest media status changed: room=${data.roomId}, guestId=${data.guestId}`);
        setGuestsByRoom((prev) => {
          const next = new Map(prev);
          const roomGuests = next.get(data.roomId);
          if (roomGuests) {
            const guest = roomGuests.get(data.guestId);
            if (guest) {
              roomGuests.set(data.guestId, {
                ...guest,
                mediaStatus: data.mediaStatus,
                lastUpdatedAt: new Date().toISOString(),
              });
            }
          }
          return next;
        });
      },
      onGuestSyncStateChanged: (data: GuestSyncStateChanged) => {
        console.log(`📡 [useRoomManagerWebSocket] Guest sync state changed: room=${data.roomId}, recording=${data.recordingId}, state=${data.syncState}`);
        setGuestsByRoom((prev) => {
          const next = new Map(prev);
          const roomGuests = next.get(data.roomId);
          if (!roomGuests) return prev;

          // recordingIdでゲストを検索
          for (const [guestId, guest] of roomGuests.entries()) {
            if (guest.recordingId === data.recordingId) {
              roomGuests.set(guestId, {
                ...guest,
                syncState: data.syncState,
                uploadedChunks: data.uploadedChunks,
                totalChunks: data.totalChunks,
                lastUpdatedAt: data.timestamp,
              });
              return next;
            }
          }
          return prev;
        });
      },
      onGuestSyncComplete: (data: GuestSyncComplete) => {
        console.log(`📡 [useRoomManagerWebSocket] Guest sync complete: room=${data.roomId}, recording=${data.recordingId}`);
        setGuestsByRoom((prev) => {
          const next = new Map(prev);
          const roomGuests = next.get(data.roomId);
          if (!roomGuests) return prev;

          // recordingIdでゲストを検索
          for (const [guestId, guest] of roomGuests.entries()) {
            if (guest.recordingId === data.recordingId) {
              roomGuests.set(guestId, {
                ...guest,
                syncState: 'synced',
                uploadedChunks: data.totalChunks,
                totalChunks: data.totalChunks,
                lastUpdatedAt: data.timestamp,
              });
              return next;
            }
          }
          return prev;
        });
      },
      onGuestSyncError: (data: GuestSyncError) => {
        console.log(`📡 [useRoomManagerWebSocket] Guest sync error: room=${data.roomId}, recording=${data.recordingId}`);
        setGuestsByRoom((prev) => {
          const next = new Map(prev);
          const roomGuests = next.get(data.roomId);
          if (!roomGuests) return prev;

          // recordingIdでゲストを検索
          for (const [guestId, guest] of roomGuests.entries()) {
            if (guest.recordingId === data.recordingId) {
              roomGuests.set(guestId, {
                ...guest,
                syncState: 'error',
                errorMessage: data.errorMessage,
                lastUpdatedAt: data.timestamp,
              });
              return next;
            }
          }
          return prev;
        });
      },
      onRoomGuests: (data: RoomGuestsData) => {
        console.log(`📡 [useRoomManagerWebSocket] Room guests received: room=${data.roomId}, count=${data.guests.length}`);
        setGuestsByRoom((prev) => {
          const next = new Map(prev);
          if (!next.has(data.roomId)) {
            next.set(data.roomId, new Map());
          }
          const roomGuests = next.get(data.roomId)!;

          // 受信したゲスト情報を追加
          data.guests.forEach((guest) => {
            roomGuests.set(guest.guestId, {
              guestId: guest.guestId,
              recordingId: guest.recordingId,
              name: guest.name,
              syncState: guest.syncState,
              uploadedChunks: guest.uploadedChunks,
              totalChunks: guest.totalChunks,
              mediaStatus: guest.mediaStatus,
              isConnected: true,
              lastUpdatedAt: new Date().toISOString(),
            });
          });
          return next;
        });
      },
      onGuestWaveformChanged: (data) => {
        setWaveformsByRoom((prev) => {
          const next = new Map(prev);
          if (!next.has(data.roomId)) {
            next.set(data.roomId, new Map());
          }
          const roomWaveforms = next.get(data.roomId)!;
          roomWaveforms.set(data.guestId, {
            waveformData: data.waveformData,
            isSilent: data.isSilent,
          });
          return next;
        });
      },
      onError: (data) => {
        console.error('❌ [useRoomManagerWebSocket] Error:', data.message);
        setError(data.message);
      },
    });

    return () => {
      stopPolling();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- subscribedRoomsRefはDOM要素ではなくSetなので、クリーンアップ時の現在値が必要
      const subscribedRooms = subscribedRoomsRef.current;
      subscribedRooms.forEach((roomId) => {
        wsClient.leaveRoom(roomId);
      });
      subscribedRooms.clear();
    };
    // Note: roomsは意図的に依存配列から除外（onConnect時の初期購読にのみ使用）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchRooms, startPolling, stopPolling]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopPolling();
      resetWebSocketRoomClient();
    };
  }, [stopPolling]);

  const createRoom = useCallback(async (): Promise<string | null> => {
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      const result = await apiClient.createRoom();

      // Room一覧を更新
      await fetchRooms();

      // 新しいRoomを購読
      const wsClient = wsClientRef.current;
      if (wsClient && isWebSocketConnected) {
        wsClient.joinRoom(result.room_id);
        subscribedRoomsRef.current.add(result.room_id);
      }

      return result.room_id;
    } catch (err) {
      console.error('❌ [useRoomManagerWebSocket] Failed to create room:', err);
      setError(err instanceof Error ? err.message : 'Failed to create room');
      return null;
    }
  }, [fetchRooms, isWebSocketConnected]);

  const deleteRoom = useCallback(async (roomId: string): Promise<boolean> => {
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);

      // 購読を解除
      const wsClient = wsClientRef.current;
      if (wsClient) {
        wsClient.leaveRoom(roomId);
        subscribedRoomsRef.current.delete(roomId);
      }

      await apiClient.deleteRoom(roomId);

      // Room一覧を更新
      await fetchRooms();

      return true;
    } catch (err) {
      console.error('❌ [useRoomManagerWebSocket] Failed to delete room:', err);
      if (err instanceof RoomNotFoundError) {
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

      // WebSocket経由で更新が来るので、手動更新は不要
      // ただしWebSocket未接続の場合は手動更新
      if (!isWebSocketConnected) {
        await fetchRooms();
      }

      return true;
    } catch (err) {
      console.error('❌ [useRoomManagerWebSocket] Failed to update room state:', err);
      setError(err instanceof Error ? err.message : 'Failed to update room state');
      return false;
    }
  }, [fetchRooms, isWebSocketConnected]);

  return {
    rooms,
    isLoading,
    error,
    isWebSocketConnected,
    guestsByRoom,
    waveformsByRoom,
    createRoom,
    deleteRoom,
    updateRoomState,
    refreshRooms: fetchRooms,
  };
}
