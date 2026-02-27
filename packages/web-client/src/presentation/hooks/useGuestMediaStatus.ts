/**
 * useGuestMediaStatus - Guestのメディアステータスを監視・送信するフック
 *
 * マイクの有効状態とデバイス情報をDirectorにリアルタイムで送信
 */

import { useEffect, useRef, useCallback } from 'react';
import { getWebSocketRoomClient } from '../../infrastructure/websocket/WebSocketRoomClient';
import { getServerUrl } from '../../infrastructure/config/serverConfig';
import type { GuestMediaStatus } from '@maycast/common-types';

interface UseGuestMediaStatusOptions {
  roomId: string | null;
  stream: MediaStream | null;
  isWebSocketConnected: boolean;
  audioDeviceId?: string;
  audioDevices?: MediaDeviceInfo[];
}

/**
 * Guestのメディアステータスを監視してDirectorに送信するフック
 */
export const useGuestMediaStatus = ({
  roomId,
  stream,
  isWebSocketConnected,
  audioDeviceId,
  audioDevices = [],
}: UseGuestMediaStatusOptions): void => {
  const lastStatusRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 現在のメディアステータスを取得
  const getMediaStatus = useCallback((): GuestMediaStatus => {
    const audioTrack = stream?.getAudioTracks()[0];

    // デバイス情報を取得（default選択時はトラックから実際のdeviceIdを取得）
    const actualAudioDeviceId = audioDeviceId || audioTrack?.getSettings().deviceId;

    const micDevice = audioDevices.find((d) => d.deviceId === actualAudioDeviceId);

    return {
      isMicMuted: !(audioTrack?.enabled ?? false),
      micDevice: micDevice
        ? { deviceId: micDevice.deviceId, label: micDevice.label || 'Default' }
        : actualAudioDeviceId
          ? { deviceId: actualAudioDeviceId, label: 'Default' }
          : undefined,
    };
  }, [stream, audioDeviceId, audioDevices]);

  // ステータスを送信
  const sendStatus = useCallback(() => {
    if (!roomId || !isWebSocketConnected) return;

    const status = getMediaStatus();
    const statusJson = JSON.stringify(status);

    // 変更がある場合のみ送信
    if (statusJson !== lastStatusRef.current) {
      lastStatusRef.current = statusJson;

      const serverUrl = getServerUrl();
      const wsClient = getWebSocketRoomClient(serverUrl);
      wsClient.emitMediaStatusUpdate(roomId, status);

      console.log(`📤 [useGuestMediaStatus] Sent media status: mic=${status.isMicMuted ? 'muted' : 'active'}`);
    }
  }, [roomId, isWebSocketConnected, getMediaStatus]);

  // ストリームのトラック変更を監視
  useEffect(() => {
    if (!stream) return;

    const handleTrackChange = () => {
      sendStatus();
    };

    // オーディオトラックのイベントを監視
    const audioTrack = stream.getAudioTracks()[0];

    audioTrack?.addEventListener('ended', handleTrackChange);
    audioTrack?.addEventListener('mute', handleTrackChange);
    audioTrack?.addEventListener('unmute', handleTrackChange);

    return () => {
      audioTrack?.removeEventListener('ended', handleTrackChange);
      audioTrack?.removeEventListener('mute', handleTrackChange);
      audioTrack?.removeEventListener('unmute', handleTrackChange);
    };
  }, [stream, sendStatus]);

  // 定期的にステータスを送信（トラックのenabledプロパティ変更は検知できないため）
  useEffect(() => {
    if (!roomId || !isWebSocketConnected) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // 初回送信
    sendStatus();

    // 定期送信（3秒ごと）
    intervalRef.current = setInterval(sendStatus, 3000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [roomId, isWebSocketConnected, sendStatus]);
};
