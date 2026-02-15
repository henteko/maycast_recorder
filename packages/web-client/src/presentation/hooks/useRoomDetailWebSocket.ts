/**
 * useRoomDetailWebSocket - 単一ルーム詳細管理のWebSocket対応フック
 *
 * アクセストークンでルームを解決し、WebSocket経由でリアルタイム監視する
 * ルーム詳細ページ専用
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

export interface UseRoomDetailWebSocketResult {
  room: RoomInfo | null;
  isLoading: boolean;
  error: string | null;
  isNotFound: boolean;
  isWebSocketConnected: boolean;
  guests: GuestInfo[];
  waveformsByGuest: Map<string, { waveformData: number[]; isSilent: boolean }>;
  updateRoomState: (state: RoomState) => Promise<boolean>;
  deleteRoom: () => Promise<boolean>;
  refreshRoom: () => Promise<void>;
}

/**
 * アクセストークンで単一ルームをWebSocket経由で監視するフック
 */
export function useRoomDetailWebSocket(
  accessToken: string,
  fallbackPollInterval: number = 5000
): UseRoomDetailWebSocketResult {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [guestsMap, setGuestsMap] = useState<Map<string, GuestInfo>>(new Map());
  const [waveformsByGuest, setWaveformsByGuest] = useState<Map<string, { waveformData: number[]; isSilent: boolean }>>(new Map());

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsClientRef = useRef<ReturnType<typeof getWebSocketRoomClient> | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const isSubscribedRef = useRef(false);

  // アクセストークンでRoom情報を取得
  const fetchRoom = useCallback(async () => {
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      const fetchedRoom = await apiClient.getRoomByToken(accessToken);

      setRoom(fetchedRoom);
      setError(null);
      setIsNotFound(false);
      roomIdRef.current = fetchedRoom.id;

      // WebSocketで購読
      const wsClient = wsClientRef.current;
      if (wsClient && isWebSocketConnected && !isSubscribedRef.current) {
        wsClient.joinRoom(fetchedRoom.id);
        isSubscribedRef.current = true;
      }
    } catch (err) {
      if (err instanceof RoomNotFoundError) {
        setIsNotFound(true);
        setError('Room not found');
      } else {
        console.error('[useRoomDetailWebSocket] Failed to fetch room:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch room');
      }
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, isWebSocketConnected]);

  // フォールバックポーリング
  const startPolling = useCallback(() => {
    if (pollingIntervalRef.current) return;
    pollingIntervalRef.current = setInterval(() => {
      fetchRoom();
    }, fallbackPollInterval);
  }, [fallbackPollInterval, fetchRoom]);

  const stopPolling = useCallback(() => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
  }, []);

  // WebSocket接続とイベントハンドリング
  useEffect(() => {
    const serverUrl = getServerUrl();
    const wsClient = getWebSocketRoomClient(serverUrl);
    wsClientRef.current = wsClient;

    setIsLoading(true);
    fetchRoom();

    wsClient.connect({
      onConnect: async () => {
        setIsWebSocketConnected(true);
        stopPolling();

        // 接続時にルームを購読
        if (roomIdRef.current && !isSubscribedRef.current) {
          wsClient.joinRoom(roomIdRef.current);
          isSubscribedRef.current = true;
        } else {
          // roomIdがまだない場合は再取得
          try {
            const apiClient = new RoomAPIClient(serverUrl);
            const fetchedRoom = await apiClient.getRoomByToken(accessToken);
            roomIdRef.current = fetchedRoom.id;
            setRoom(fetchedRoom);
            wsClient.joinRoom(fetchedRoom.id);
            isSubscribedRef.current = true;
          } catch (err) {
            console.error('[useRoomDetailWebSocket] Failed to join room on connect:', err);
          }
        }
      },
      onDisconnect: () => {
        setIsWebSocketConnected(false);
        isSubscribedRef.current = false;
        startPolling();
      },
      onRoomStateChanged: (data: RoomStateChanged) => {
        if (data.roomId === roomIdRef.current) {
          setRoom((prev) => prev ? { ...prev, state: data.state } : prev);
        }
      },
      onRecordingCreated: (data: RecordingCreated) => {
        if (data.roomId === roomIdRef.current) {
          setRoom((prev) =>
            prev ? { ...prev, recording_ids: [...prev.recording_ids, data.recordingId] } : prev
          );
        }
      },
      onGuestJoined: (data) => {
        if (data.roomId !== roomIdRef.current) return;
        setGuestsMap((prev) => {
          const next = new Map(prev);
          const existing = next.get(data.guestId);
          next.set(data.guestId, {
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
        if (data.roomId !== roomIdRef.current) return;
        setGuestsMap((prev) => {
          const next = new Map(prev);
          const guest = next.get(data.guestId);
          if (guest) {
            next.set(data.guestId, {
              ...guest,
              isConnected: false,
              lastUpdatedAt: new Date().toISOString(),
            });
          }
          return next;
        });
      },
      onGuestRecordingLinked: (data) => {
        if (data.roomId !== roomIdRef.current) return;
        setGuestsMap((prev) => {
          const next = new Map(prev);
          const guest = next.get(data.guestId);
          if (guest) {
            next.set(data.guestId, {
              ...guest,
              recordingId: data.recordingId,
              lastUpdatedAt: new Date().toISOString(),
            });
          }
          return next;
        });
      },
      onGuestMediaStatusChanged: (data) => {
        if (data.roomId !== roomIdRef.current) return;
        setGuestsMap((prev) => {
          const next = new Map(prev);
          const guest = next.get(data.guestId);
          if (guest) {
            next.set(data.guestId, {
              ...guest,
              mediaStatus: data.mediaStatus,
              lastUpdatedAt: new Date().toISOString(),
            });
          }
          return next;
        });
      },
      onGuestSyncStateChanged: (data: GuestSyncStateChanged) => {
        if (data.roomId !== roomIdRef.current) return;
        setGuestsMap((prev) => {
          const next = new Map(prev);
          for (const [guestId, guest] of next.entries()) {
            if (guest.recordingId === data.recordingId) {
              next.set(guestId, {
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
        if (data.roomId !== roomIdRef.current) return;
        setGuestsMap((prev) => {
          const next = new Map(prev);
          for (const [guestId, guest] of next.entries()) {
            if (guest.recordingId === data.recordingId) {
              next.set(guestId, {
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
        if (data.roomId !== roomIdRef.current) return;
        setGuestsMap((prev) => {
          const next = new Map(prev);
          for (const [guestId, guest] of next.entries()) {
            if (guest.recordingId === data.recordingId) {
              next.set(guestId, {
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
        if (data.roomId !== roomIdRef.current) return;
        setGuestsMap((prev) => {
          const next = new Map(prev);
          data.guests.forEach((guest) => {
            next.set(guest.guestId, {
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
        if (data.roomId !== roomIdRef.current) return;
        setWaveformsByGuest((prev) => {
          const next = new Map(prev);
          next.set(data.guestId, {
            waveformData: data.waveformData,
            isSilent: data.isSilent,
          });
          return next;
        });
      },
      onError: (data) => {
        console.error('[useRoomDetailWebSocket] Error:', data.message);
        setError(data.message);
      },
    });

    return () => {
      stopPolling();
      if (roomIdRef.current) {
        wsClient.leaveRoom(roomIdRef.current);
      }
      isSubscribedRef.current = false;
    };
  }, [accessToken, fetchRoom, startPolling, stopPolling]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopPolling();
      resetWebSocketRoomClient();
    };
  }, [stopPolling]);

  const updateRoomState = useCallback(async (state: RoomState): Promise<boolean> => {
    const roomId = roomIdRef.current;
    if (!roomId) return false;

    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      await apiClient.updateRoomState(roomId, state);

      if (!isWebSocketConnected) {
        await fetchRoom();
      }

      return true;
    } catch (err) {
      console.error('[useRoomDetailWebSocket] Failed to update room state:', err);
      setError(err instanceof Error ? err.message : 'Failed to update room state');
      return false;
    }
  }, [fetchRoom, isWebSocketConnected]);

  const deleteRoom = useCallback(async (): Promise<boolean> => {
    const roomId = roomIdRef.current;
    if (!roomId) return false;

    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);

      const wsClient = wsClientRef.current;
      if (wsClient) {
        wsClient.leaveRoom(roomId);
        isSubscribedRef.current = false;
      }

      await apiClient.deleteRoom(roomId);
      return true;
    } catch (err) {
      console.error('[useRoomDetailWebSocket] Failed to delete room:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete room');
      return false;
    }
  }, []);

  const guests = Array.from(guestsMap.values());

  return {
    room,
    isLoading,
    error,
    isNotFound,
    isWebSocketConnected,
    guests,
    waveformsByGuest,
    updateRoomState,
    deleteRoom,
    refreshRoom: fetchRoom,
  };
}
