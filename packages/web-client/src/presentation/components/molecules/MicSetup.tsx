/**
 * MicSetup - マイク選択セットアップ画面
 *
 * Guest参加前にマイクを選択・テストするためのコンポーネント
 * GuestNameInputと同じデザインパターン（中央配置、ダークテーマカード）
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { MicrophoneIcon, ArrowPathIcon } from '@heroicons/react/24/solid';
import { Button } from '../atoms/Button';
import { MicDeviceCard } from '../atoms/MicDeviceCard';
import { useDevices } from '../../hooks/useDevices';
import { useMediaStream } from '../../hooks/useMediaStream';

interface MicSetupProps {
  roomId: string;
  initialAudioDeviceId?: string;
  onComplete: (audioDeviceId?: string) => void;
}

export const MicSetup: React.FC<MicSetupProps> = ({
  roomId,
  initialAudioDeviceId,
  onComplete,
}) => {
  const { stream, startCapture, restartCapture, stopCapture } = useMediaStream();
  const { audioDevices, refreshDevices } = useDevices(stream);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(
    initialAudioDeviceId
  );
  const initialCaptureRef = useRef(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Mount時に初期マイクのストリームを取得
  useEffect(() => {
    if (initialCaptureRef.current) return;
    initialCaptureRef.current = true;
    startCapture({ audioDeviceId: initialAudioDeviceId });
  }, [startCapture, initialAudioDeviceId]);

  // アンマウント時にストリームを停止（Recorderが自身のストリームを取得するため）
  useEffect(() => {
    return () => {
      stopCapture();
    };
  }, [stopCapture]);

  // selectedDeviceIdが未設定で、デバイスが取得できたら最初のデバイスを自動選択
  const effectiveSelectedDeviceId = selectedDeviceId
    ?? (audioDevices.length > 0 ? audioDevices[0].deviceId : undefined);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshDevices();
    // アニメーションが見えるように最低500ms待つ
    setTimeout(() => setIsRefreshing(false), 500);
  }, [refreshDevices]);

  const handleDeviceSelect = (deviceId: string) => {
    if (deviceId === effectiveSelectedDeviceId) return;
    setSelectedDeviceId(deviceId);
    restartCapture({ audioDeviceId: deviceId });
  };

  const handleComplete = () => {
    onComplete(effectiveSelectedDeviceId);
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-maycast-bg text-maycast-text">
      <div className="w-full max-w-md px-4">
        {/* Maycast Branding */}
        <div className="text-3xl font-bold text-maycast-primary text-center mb-8">
          Maycast Recorder
        </div>

        <div className="bg-maycast-panel/30 backdrop-blur-md p-8 rounded-2xl border border-maycast-border/40 shadow-xl">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-maycast-primary/20 rounded-full mb-4">
              <MicrophoneIcon className="w-8 h-8 text-maycast-primary" />
            </div>
            <h1 className="text-2xl font-bold text-maycast-text mb-2">
              Select Your Microphone
            </h1>
            <p className="text-sm text-maycast-subtext">
              Room ID: <span className="font-mono text-maycast-primary">{roomId}</span>
            </p>
          </div>

          {/* Device list header */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-maycast-text-secondary">
              Devices ({audioDevices.length})
            </span>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 text-xs text-maycast-text-secondary hover:text-maycast-primary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowPathIcon className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>

          {/* Device list */}
          <div className="space-y-3 mb-6">
            {audioDevices.map((device, index) => (
              <MicDeviceCard
                key={device.deviceId}
                device={device}
                index={index}
                isSelected={effectiveSelectedDeviceId === device.deviceId}
                stream={effectiveSelectedDeviceId === device.deviceId ? stream : null}
                onSelect={() => handleDeviceSelect(device.deviceId)}
              />
            ))}
            {audioDevices.length === 0 && (
              <div className="text-center py-4 text-maycast-subtext text-sm">
                No microphones detected
              </div>
            )}
          </div>

          {/* Ready button */}
          <Button
            onClick={handleComplete}
            disabled={audioDevices.length === 0}
            variant="primary"
            size="md"
            className="w-full"
          >
            Ready to Join
          </Button>
        </div>
      </div>
    </div>
  );
};
