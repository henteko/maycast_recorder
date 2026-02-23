/**
 * useGuestRecordingControl - Guest録画制御フック
 *
 * Room状態に応じて録画を自動制御し、
 * WebSocket経由で同期状態を通知する。
 * NTP時刻同期 + スケジュール録画開始により全ゲスト同時録画開始を実現。
 */

import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import type { RecorderExports } from '../components/Recorder';
import { useRoomWebSocket } from './useRoomWebSocket';
import { useClockSync } from './useClockSync';
import { useScheduledRecording } from './useScheduledRecording';
import type { ClockSyncStatus } from '../../infrastructure/services/ClockSyncService';
import type { ScheduledRecordingInfo } from './useScheduledRecording';
import { GuestStorageStrategy } from '../../storage-strategies/GuestStorageStrategy';
import { getWebSocketRoomClient } from '../../infrastructure/websocket/WebSocketRoomClient';
import { RecordingAPIClient } from '../../infrastructure/api/recording-api';
import { getServerUrl } from '../../infrastructure/config/serverConfig';
import type { GuestSyncState, RoomState } from '@maycast/common-types';

/** スケジュール開始が届かない場合のフォールバック待機時間（ms） */
const FALLBACK_TIMEOUT_MS = 5000;

interface UseGuestRecordingControlOptions {
  roomId: string;
  pollingInterval?: number;
  guestName?: string;
}

interface UseGuestRecordingControlResult {
  recorderRef: React.RefObject<RecorderExports | null>;
  storageStrategy: GuestStorageStrategy;
  guestSyncState: GuestSyncState;
  roomState: RoomState | null;
  isRoomLoading: boolean;
  roomError: string | null;
  isRoomNotFound: boolean;
  isWebSocketConnected: boolean;
  getWaitingMessage: () => string | undefined;
  resetAfterSync: () => void;
  clockSyncStatus: ClockSyncStatus;
  scheduledInfo: ScheduledRecordingInfo;
}

export const useGuestRecordingControl = ({
  roomId,
  pollingInterval = 3000,
  guestName,
}: UseGuestRecordingControlOptions): UseGuestRecordingControlResult => {
  const recorderRef = useRef<RecorderExports>(null);
  const [hasStartedRecording, setHasStartedRecording] = useState(false);
  const [guestSyncState, setGuestSyncState] = useState<GuestSyncState>('idle');
  const lastSyncEmitRef = useRef<number>(0);
  const hasInitiatedStopRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncMetadataSentRef = useRef(false);

  // Room状態をWebSocket経由でリアルタイム取得
  const {
    roomState,
    isLoading: isRoomLoading,
    error: roomError,
    isRoomNotFound,
    isWebSocketConnected,
    setRecordingId: setWsRecordingId,
    onTimeSyncPong,
    onScheduledRecordingStart,
    emitTimeSyncPing,
  } = useRoomWebSocket(roomId, pollingInterval, guestName);

  // NTP時刻同期
  const { syncStatus: clockSyncStatus, clockSyncService } = useClockSync({
    isConnected: isWebSocketConnected,
    emitTimeSyncPing,
    onTimeSyncPong,
  });

  // startRecordingコールバック（refで常に最新のrecorderを参照）
  const startRecordingCallback = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || !recorder.wasmInitialized) {
      console.warn('⚠️ [useGuestRecordingControl] Recorder not ready for scheduled start');
      return;
    }
    console.log('🎬 [useGuestRecordingControl] Scheduled recording start triggered');
    hasInitiatedStopRef.current = false;
    setHasStartedRecording(true);
    setGuestSyncState('recording');
    recorder.startRecording();
  }, []);

  // スケジュール録画
  const { scheduledInfo, handleScheduledStart, getSyncMetadata, reset: resetScheduled } = useScheduledRecording(
    clockSyncService,
    startRecordingCallback
  );

  // GuestStorageStrategy
  const storageStrategy = useMemo(() => {
    return new GuestStorageStrategy(roomId);
  }, [roomId]);

  // WebSocket経由で同期状態を通知
  const emitSyncUpdate = useCallback((state: GuestSyncState, force: boolean = false) => {
    const now = Date.now();
    if (!force && now - lastSyncEmitRef.current < 500) {
      return;
    }

    const remoteRecordingId = storageStrategy.getActiveRemoteRecordingId();
    if (!remoteRecordingId) {
      return;
    }

    lastSyncEmitRef.current = now;

    const serverUrl = getServerUrl();
    const wsClient = getWebSocketRoomClient(serverUrl);
    const progress = storageStrategy.getUploadProgress();

    console.log(`📤 [useGuestRecordingControl] Emitting sync update: state=${state}, ${progress.uploaded}/${progress.total}`);
    wsClient.emitGuestSyncUpdate(roomId, remoteRecordingId, state, progress.uploaded, progress.total);
  }, [roomId, storageStrategy]);

  // 同期完了を通知
  const emitSyncComplete = useCallback(() => {
    const remoteRecordingId = storageStrategy.getActiveRemoteRecordingId();
    if (!remoteRecordingId) {
      return;
    }

    const serverUrl = getServerUrl();
    const wsClient = getWebSocketRoomClient(serverUrl);
    const progress = storageStrategy.getUploadProgress();

    console.log(`📤 [useGuestRecordingControl] Emitting sync complete: ${progress.total} chunks`);
    wsClient.emitGuestSyncComplete(roomId, remoteRecordingId, progress.total);
  }, [roomId, storageStrategy]);

  // scheduled_recording_startイベントの受信ハンドラーを登録
  useEffect(() => {
    onScheduledRecordingStart((data) => {
      if (data.roomId === roomId) {
        console.log(`⏰ [useGuestRecordingControl] Received scheduled_recording_start: T_start=${data.startAtServerTime}`);

        // フォールバックタイマーをクリア
        if (fallbackTimerRef.current) {
          clearTimeout(fallbackTimerRef.current);
          fallbackTimerRef.current = null;
        }

        handleScheduledStart(data.startAtServerTime);
      }
    });

    return () => {
      onScheduledRecordingStart(null);
    };
  }, [roomId, onScheduledRecordingStart, handleScheduledStart]);

  // Room状態に応じて録画を自動制御
  useEffect(() => {
    if (isRoomLoading || roomError) return;

    const recorder = recorderRef.current;
    if (!recorder) return;

    // Room状態がrecordingになったらフォールバックタイマーを開始
    // （scheduled_recording_startが届かない場合に備えて）
    if (roomState === 'recording' && !hasStartedRecording && recorder.wasmInitialized) {
      // スケジュール開始がすでにセットされている場合はフォールバック不要
      if (!scheduledInfo.isScheduled) {
        console.log('⏳ [useGuestRecordingControl] Room is recording, waiting for scheduled_recording_start...');

        // フォールバック: 5秒以内にスケジュール開始されなければ即時開始
        if (!fallbackTimerRef.current) {
          fallbackTimerRef.current = setTimeout(() => {
            fallbackTimerRef.current = null;
            // まだ録画開始していない場合は即時開始
            if (!recorderRef.current?.isRecording) {
              console.log('⚠️ [useGuestRecordingControl] Fallback: no scheduled_recording_start received, starting immediately');
              hasInitiatedStopRef.current = false;
              setHasStartedRecording(true);
              setGuestSyncState('recording');
              recorderRef.current?.startRecording();
            }
          }, FALLBACK_TIMEOUT_MS);
        }
      }
    }

    // Room状態がfinalizingまたはfinishedになったら自動的に録画停止
    if ((roomState === 'finalizing' || roomState === 'finished') && hasStartedRecording && !hasInitiatedStopRef.current) {
      console.log(`🛑 [useGuestRecordingControl] Director stopped recording (${roomState}), auto-stopping...`);
      hasInitiatedStopRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGuestSyncState('uploading');
      try {
        recorder.stopRecording();
      } catch (err) {
        console.error('❌ [useGuestRecordingControl] Error stopping recording:', err);
      }
    }
  }, [roomState, hasStartedRecording, isRoomLoading, roomError, scheduledInfo.isScheduled]);

  // フォールバックタイマーのクリーンアップ
  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, []);

  // Recording IDをWebSocketに登録
  useEffect(() => {
    if (hasStartedRecording) {
      const checkInterval = setInterval(() => {
        const remoteRecordingId = storageStrategy.getActiveRemoteRecordingId();
        if (remoteRecordingId) {
          console.log(`🔗 [useGuestRecordingControl] Setting WebSocket recording ID: ${remoteRecordingId}`);
          setWsRecordingId(remoteRecordingId);
          clearInterval(checkInterval);
        }
      }, 500);

      return () => clearInterval(checkInterval);
    }
  }, [hasStartedRecording, storageStrategy, setWsRecordingId]);

  // 録画開始後にsyncMetadataを保存
  useEffect(() => {
    if (!hasStartedRecording || syncMetadataSentRef.current) return;

    const checkAndSend = setInterval(() => {
      const remoteRecordingId = storageStrategy.getActiveRemoteRecordingId();
      const syncMeta = getSyncMetadata();

      if (remoteRecordingId && syncMeta) {
        syncMetadataSentRef.current = true;
        clearInterval(checkAndSend);

        const serverUrl = getServerUrl();
        const apiClient = new RecordingAPIClient(serverUrl);
        apiClient.uploadRecordingMetadata(remoteRecordingId, { syncInfo: syncMeta }).then(() => {
          console.log('✅ [useGuestRecordingControl] Sync metadata saved to server');
        }).catch((err) => {
          console.error('❌ [useGuestRecordingControl] Failed to save sync metadata:', err);
        });
      }
    }, 1000);

    return () => clearInterval(checkAndSend);
  }, [hasStartedRecording, storageStrategy, getSyncMetadata]);

  // 録画中のアップロード進捗をDirectorに定期送信
  useEffect(() => {
    if (guestSyncState !== 'recording') return;

    const interval = setInterval(() => {
      emitSyncUpdate('recording');
    }, 1000);

    return () => clearInterval(interval);
  }, [guestSyncState, emitSyncUpdate]);

  // アップロード進捗を監視して同期状態を更新
  useEffect(() => {
    if (guestSyncState !== 'uploading') return;

    const checkProgress = () => {
      const remoteRecordingId = storageStrategy.getActiveRemoteRecordingId();
      if (!remoteRecordingId) {
        return false;
      }

      if (storageStrategy.isUploadComplete()) {
        setGuestSyncState('synced');
        emitSyncComplete();
        return true;
      }

      emitSyncUpdate('uploading');
      return false;
    };

    if (checkProgress()) return;

    const interval = setInterval(() => {
      if (checkProgress()) {
        clearInterval(interval);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [guestSyncState, storageStrategy, emitSyncUpdate, emitSyncComplete]);

  // 待機メッセージの決定
  const getWaitingMessage = useCallback((): string | undefined => {
    if (roomState === 'idle') {
      return 'Waiting for Director to start...';
    }
    if (scheduledInfo.isScheduled && !scheduledInfo.hasStarted && scheduledInfo.countdownMs !== null) {
      const seconds = Math.ceil(scheduledInfo.countdownMs / 1000);
      if (seconds > 0) {
        return `Recording starts in ${seconds}s...`;
      }
    }
    return undefined;
  }, [roomState, scheduledInfo]);

  // 同期完了後のリセット
  const resetAfterSync = useCallback(() => {
    setGuestSyncState('idle');
    setHasStartedRecording(false);
    syncMetadataSentRef.current = false;
    resetScheduled();
  }, [resetScheduled]);

  return {
    recorderRef,
    storageStrategy,
    guestSyncState,
    roomState,
    isRoomLoading,
    roomError,
    isRoomNotFound,
    isWebSocketConnected,
    getWaitingMessage,
    resetAfterSync,
    clockSyncStatus,
    scheduledInfo,
  };
};
