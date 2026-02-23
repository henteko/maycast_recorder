/**
 * useRoomDetail - 単一Room管理フック（Director用）
 *
 * WebSocket経由でRoom状態変更をリアルタイムに受信
 * accessKeyを使用してRoom操作を行う
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getWebSocketRoomClient, resetWebSocketRoomClient, type RoomGuestsData } from '../../infrastructure/websocket/WebSocketRoomClient';
import { RoomAPIClient, RoomNotFoundError, RoomAccessDeniedError } from '../../infrastructure/api/room-api';
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

export interface UseRoomDetailResult {
  room: RoomInfo | null;
  guests: GuestInfo[];
  waveforms: Map<string, { waveformData: number[]; isSilent: boolean }>;
  isLoading: boolean;
  error: string | null;
  isAccessDenied: boolean;
  isWebSocketConnected: boolean;
  updateRoomState: (state: RoomState) => Promise<boolean>;
  deleteRoom: () => Promise<boolean>;
  refreshRoom: () => Promise<void>;
}

export function useRoomDetail(
  roomId: string | null,
  accessKey: string | null,
  fallbackPollInterval: number = 5000
): UseRoomDetailResult {
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAccessDenied, setIsAccessDenied] = useState(false);
  const [isWebSocketConnected, setIsWebSocketConnected] = useState(false);
  const [guests, setGuests] = useState<Map<string, GuestInfo>>(new Map());
  const [waveforms, setWaveforms] = useState<Map<string, { waveformData: number[]; isSilent: boolean }>>(new Map());

  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wsClientRef = useRef<ReturnType<typeof getWebSocketRoomClient> | null>(null);

  // HTTP経由でRoom情報を取得
  const fetchRoom = useCallback(async () => {
    if (!roomId || !accessKey) {
      setError('Room ID and access key are required');
      setIsLoading(false);
      return;
    }

    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      const roomInfo = await apiClient.getRoom(roomId, accessKey);

      setRoom(roomInfo);
      setError(null);
      setIsAccessDenied(false);
    } catch (err) {
      if (err instanceof RoomAccessDeniedError) {
        setIsAccessDenied(true);
        setError('Access denied');
      } else if (err instanceof RoomNotFoundError) {
        setError(`Room not found: ${roomId}`);
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch room');
      }
      setRoom(null);
    } finally {
      setIsLoading(false);
    }
  }, [roomId, accessKey]);

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
    if (!roomId || !accessKey) return;

    const serverUrl = getServerUrl();
    const wsClient = getWebSocketRoomClient(serverUrl);
    wsClientRef.current = wsClient;

    setIsLoading(true);
    fetchRoom();

    wsClient.connect({
      onConnect: () => {
        setIsWebSocketConnected(true);
        stopPolling();
        wsClient.joinRoom(roomId, undefined, accessKey);
      },
      onDisconnect: () => {
        setIsWebSocketConnected(false);
        startPolling();
      },
      onRoomStateChanged: (data: RoomStateChanged) => {
        if (data.roomId === roomId) {
          setRoom((prev) => prev ? { ...prev, state: data.state } : null);
        }
      },
      onRecordingCreated: (data: RecordingCreated) => {
        if (data.roomId === roomId) {
          setRoom((prev) =>
            prev
              ? { ...prev, recording_ids: [...prev.recording_ids, data.recordingId] }
              : null
          );
        }
      },
      onGuestJoined: (data) => {
        if (data.roomId === roomId) {
          setGuests((prev) => {
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
              mediaStatus: existing?.mediaStatus,
              clockSyncStatus: existing?.clockSyncStatus,
            });
            return next;
          });
        }
      },
      onGuestLeft: (data) => {
        if (data.roomId === roomId) {
          setGuests((prev) => {
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
        }
      },
      onGuestRecordingLinked: (data) => {
        if (data.roomId === roomId) {
          setGuests((prev) => {
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
        }
      },
      onGuestMediaStatusChanged: (data) => {
        if (data.roomId === roomId) {
          setGuests((prev) => {
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
        }
      },
      onGuestClockSyncStatusChanged: (data) => {
        if (data.roomId === roomId) {
          setGuests((prev) => {
            const next = new Map(prev);
            const guest = next.get(data.guestId);
            if (guest) {
              next.set(data.guestId, {
                ...guest,
                clockSyncStatus: data.clockSyncStatus,
                lastUpdatedAt: new Date().toISOString(),
              });
            }
            return next;
          });
        }
      },
      onGuestSyncStateChanged: (data: GuestSyncStateChanged) => {
        if (data.roomId === roomId) {
          setGuests((prev) => {
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
        }
      },
      onGuestSyncComplete: (data: GuestSyncComplete) => {
        if (data.roomId === roomId) {
          setGuests((prev) => {
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
        }
      },
      onGuestSyncError: (data: GuestSyncError) => {
        if (data.roomId === roomId) {
          setGuests((prev) => {
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
        }
      },
      onRoomGuests: (data: RoomGuestsData) => {
        if (data.roomId === roomId) {
          setGuests((prev) => {
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
                clockSyncStatus: guest.clockSyncStatus,
                isConnected: true,
                lastUpdatedAt: new Date().toISOString(),
              });
            });
            return next;
          });
        }
      },
      onGuestWaveformChanged: (data) => {
        if (data.roomId === roomId) {
          setWaveforms((prev) => {
            const next = new Map(prev);
            next.set(data.guestId, {
              waveformData: data.waveformData,
              isSilent: data.isSilent,
            });
            return next;
          });
        }
      },
      onError: (data) => {
        console.error('❌ [useRoomDetail] Error:', data.message);
        if (data.message.includes('Access denied')) {
          setIsAccessDenied(true);
        }
        setError(data.message);
      },
    });

    return () => {
      stopPolling();
      if (wsClient.getCurrentRoomId() === roomId) {
        wsClient.leaveRoom(roomId);
      }
    };
  }, [roomId, accessKey, fetchRoom, startPolling, stopPolling]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      stopPolling();
      resetWebSocketRoomClient();
    };
  }, [stopPolling]);

  const updateRoomState = useCallback(async (state: RoomState): Promise<boolean> => {
    if (!roomId || !accessKey) return false;
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);
      await apiClient.updateRoomState(roomId, state, accessKey);
      if (!isWebSocketConnected) {
        await fetchRoom();
      }
      return true;
    } catch (err) {
      console.error('❌ [useRoomDetail] Failed to update room state:', err);
      if (err instanceof RoomAccessDeniedError) {
        setIsAccessDenied(true);
      }
      setError(err instanceof Error ? err.message : 'Failed to update room state');
      return false;
    }
  }, [roomId, accessKey, fetchRoom, isWebSocketConnected]);

  const deleteRoom = useCallback(async (): Promise<boolean> => {
    if (!roomId || !accessKey) return false;
    try {
      const serverUrl = getServerUrl();
      const apiClient = new RoomAPIClient(serverUrl);

      const wsClient = wsClientRef.current;
      if (wsClient) {
        wsClient.leaveRoom(roomId);
      }

      await apiClient.deleteRoom(roomId, accessKey);
      return true;
    } catch (err) {
      console.error('❌ [useRoomDetail] Failed to delete room:', err);
      if (err instanceof RoomAccessDeniedError) {
        setIsAccessDenied(true);
      }
      setError(err instanceof Error ? err.message : 'Failed to delete room');
      return false;
    }
  }, [roomId, accessKey]);

  return {
    room,
    guests: Array.from(guests.values()),
    waveforms,
    isLoading,
    error,
    isAccessDenied,
    isWebSocketConnected,
    updateRoomState,
    deleteRoom,
    refreshRoom: fetchRoom,
  };
}
