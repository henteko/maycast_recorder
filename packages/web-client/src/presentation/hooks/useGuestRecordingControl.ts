/**
 * useGuestRecordingControl - Guest録画制御フック
 *
 * Room状態に応じて録画を自動制御し、
 * WebSocket経由で同期状態を通知する
 */

import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import type { RecorderExports } from '../components/Recorder';
import { useRoomWebSocket } from './useRoomWebSocket';
import { GuestStorageStrategy } from '../../storage-strategies/GuestStorageStrategy';
import { getWebSocketRoomClient } from '../../infrastructure/websocket/WebSocketRoomClient';
import { getServerUrl } from '../../infrastructure/config/serverConfig';
import type { GuestSyncState, RecordingId, RoomState } from '@maycast/common-types';

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
  handleDownload: (recordingId: RecordingId) => Promise<void>;
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

  // Room状態をWebSocket経由でリアルタイム取得
  const {
    roomState,
    isLoading: isRoomLoading,
    error: roomError,
    isRoomNotFound,
    isWebSocketConnected,
    setRecordingId: setWsRecordingId,
  } = useRoomWebSocket(roomId, pollingInterval, guestName);

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

  // Room状態に応じて録画を自動制御
  useEffect(() => {
    if (isRoomLoading || roomError) return;

    const recorder = recorderRef.current;
    if (!recorder) return;

    // Room状態がrecordingになったら自動的に録画開始
    if (roomState === 'recording' && !hasStartedRecording && recorder.wasmInitialized) {
      console.log('🎬 [useGuestRecordingControl] Director started recording, auto-starting...');
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasStartedRecording(true);
      setGuestSyncState('recording');
      recorder.startRecording();
    }

    // Room状態がfinalizingになったら自動的に録画停止
    if (roomState === 'finalizing' && hasStartedRecording && recorder.isRecording) {
      console.log('🛑 [useGuestRecordingControl] Director stopped recording (finalizing), auto-stopping...');
      setGuestSyncState('uploading');
      recorder.stopRecording();
    }

    // Room状態がfinishedになったら（強制終了の場合）
    if (roomState === 'finished' && hasStartedRecording && recorder.isRecording) {
      console.log('🛑 [useGuestRecordingControl] Director force finished, auto-stopping...');
      recorder.stopRecording();
    }
  }, [roomState, hasStartedRecording, isRoomLoading, roomError]);

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
      return 'Directorの開始を待機中...';
    }
    return undefined;
  }, [roomState]);

  // ダウンロードハンドラー
  const handleDownload = useCallback(async (recordingId: RecordingId) => {
    try {
      console.log('📥 [useGuestRecordingControl] Downloading from server...');
      const blob = await storageStrategy.downloadFromServer(recordingId);

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recording-${recordingId}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      console.log('✅ [useGuestRecordingControl] Download completed');
    } catch (err) {
      console.error('❌ [useGuestRecordingControl] Download failed:', err);
      alert('Failed to download recording from server');
    }
  }, [storageStrategy]);

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
    handleDownload,
  };
};
