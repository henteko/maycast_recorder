import { useState, useEffect, useImperativeHandle, useCallback, useRef } from 'react'
import { useMediaStream } from '../hooks/useMediaStream'
import { useEncoders } from '../hooks/useEncoders'
import { useRecorder } from '../hooks/useRecorder'
import { useDevices } from '../hooks/useDevices'
import { useGuestMediaStatus } from '../hooks/useGuestMediaStatus'
import { getWebSocketRoomClient } from '../../infrastructure/websocket/WebSocketRoomClient'
import { getServerUrl } from '../../infrastructure/config/serverConfig'
// @ts-expect-error - maycast-wasm-core has no type definitions
import init from 'maycast-wasm-core'
import type { RecorderSettings } from '../../types/settings'
import type { ScreenState } from '../../types/recorder'
import type { DownloadProgress } from '../hooks/useDownload'
import type { IStorageStrategy } from '../../storage-strategies/IStorageStrategy'

import { ControlPanel } from './organisms/ControlPanel'
import { AudioWaveform } from './atoms/AudioWaveform'
import { VUMeter } from './atoms/VUMeter'
import { MicDeviceCard } from './atoms/MicDeviceCard'
import { RecordingStatsBar } from './molecules/RecordingStatsBar'
import { ArrowPathIcon } from '@heroicons/react/24/solid'

import type { RecordingId } from '@maycast/common-types';

export interface RecorderExports {
  screenState: ScreenState;
  recordingIdRef: React.MutableRefObject<RecordingId | null>;
  savedChunks: number;
  isRecording: boolean;
  wasmInitialized: boolean;
  startRecording: () => void;
  stopRecording: () => void;
}

interface GuestModeConfig {
  roomId: string;
  isWebSocketConnected: boolean;
  waitingMessage?: string;
}

interface RecorderProps {
  settings: RecorderSettings;
  storageStrategy: IStorageStrategy;
  onSessionComplete?: () => void | Promise<void>;
  onDownload?: (recordingId: RecordingId) => Promise<void>;
  downloadProgress?: DownloadProgress;
  exportRef?: React.Ref<RecorderExports>;
  /** Guest mode configuration */
  guestMode: GuestModeConfig;
  /** Callback when settings (device selection) changes */
  onSettingsChange?: (settings: RecorderSettings) => void;
  /** When true, automatically reset to standby after stopping */
  autoResetToStandby?: boolean;
  /** Callback fired after recording completes (for toast notifications etc.) */
  onRecordingComplete?: () => void;
}

export const Recorder: React.FC<RecorderProps> = ({
  settings: externalSettings,
  storageStrategy,
  onSessionComplete,
  onDownload,
  downloadProgress = { isDownloading: false, current: 0, total: 0 },
  exportRef,
  guestMode,
  onSettingsChange,
  autoResetToStandby = false,
  onRecordingComplete,
}) => {
  const { stream, error, startCapture, restartCapture } = useMediaStream()

  const [wasmInitialized, setWasmInitialized] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [settings, setSettings] = useState<RecorderSettings>(externalSettings)

  const {
    audioEncoderRef,
    initializeEncoders,
    closeEncoders,
    resetEncoders,
    setRecordingId,
  } = useEncoders({
    wasmInitialized,
    storageStrategy,
    onStatsUpdate: (updater) => setStats(updater),
    onChunkSaved: () => setSavedChunks(prev => prev + 1),
  })

  const {
    screenState,
    isRecording,
    stats,
    savedChunks,
    recordingStartTime,
    recordingIdRef,
    startRecording,
    stopRecording,
    handleNewRecording,
    handleDiscardRecording,
    setStats,
    setSavedChunks,
  } = useRecorder({
    audioEncoderRef,
    storageStrategy,
    initializeEncoders,
    closeEncoders,
    resetEncoders,
    setRecordingId,
    startCapture,
    settings,
    onSessionComplete: async () => {
      if (onSessionComplete) {
        await onSessionComplete();
      }
      onRecordingComplete?.();
    },
    autoResetToStandby,
  })

  // Sync with external settings changes (device selection)
  useEffect(() => {
    setSettings(externalSettings);
  }, [externalSettings]);

  // Initialize WASM
  useEffect(() => {
    const initWasm = async () => {
      try {
        await init()
        setWasmInitialized(true)
        console.log('✅ WASM initialized')
      } catch (err) {
        console.error('❌ Failed to initialize WASM:', err)
      }
    }
    initWasm()
  }, [])

  // Auto-start microphone capture on mount
  useEffect(() => {
    const autoStartCapture = async () => {
      console.log('🎤 Auto-starting microphone capture...')
      await startCapture({
        audioDeviceId: settings.audioDeviceId,
      })
    }
    autoStartCapture()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Update elapsed time during recording
  useEffect(() => {
    if (!recordingStartTime) {
      setElapsedTime(0)
      return
    }

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000)
      setElapsedTime(elapsed)
    }, 1000)

    return () => clearInterval(timer)
  }, [recordingStartTime])

  // デバイス情報を取得（streamを渡してgetUserMedia完了後に再列挙）
  const { audioDevices, refreshDevices } = useDevices(stream);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // メディアステータスをDirectorに送信
  useGuestMediaStatus({
    roomId: guestMode.roomId,
    stream,
    isWebSocketConnected: guestMode.isWebSocketConnected,
    audioDeviceId: settings.audioDeviceId,
    audioDevices,
  });

  // 波形データをDirectorに送信
  const handleWaveformData = useCallback((waveformData: number[], isSilent: boolean) => {
    if (!guestMode.isWebSocketConnected) return;
    const serverUrl = getServerUrl();
    const wsClient = getWebSocketRoomClient(serverUrl);
    wsClient.emitWaveformUpdate(guestMode.roomId, waveformData, isSilent);
  }, [guestMode.roomId, guestMode.isWebSocketConnected]);

  // Export recorder state and controls to parent
  useImperativeHandle(exportRef, () => ({
    screenState,
    recordingIdRef,
    savedChunks,
    isRecording,
    wasmInitialized,
    startRecording,
    stopRecording,
  }), [screenState, recordingIdRef, savedChunks, isRecording, wasmInitialized, startRecording, stopRecording]);

  // Studio Area: track container width for AudioWaveform
  const studioRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(500);

  useEffect(() => {
    if (!studioRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setCanvasWidth(entry.contentBoxSize[0].inlineSize);
      }
    });
    observer.observe(studioRef.current);
    return () => observer.disconnect();
  }, []);

  const studioStyles = (() => {
    switch (screenState) {
      case 'recording':
        return 'bg-maycast-panel border-maycast-rec/50 shadow-[0_0_30px_rgba(239,68,68,0.15)]';
      case 'completed':
        return 'bg-maycast-panel border-maycast-safe/50 shadow-[0_0_30px_rgba(16,185,129,0.15)]';
      default:
        return 'bg-maycast-panel border-maycast-border';
    }
  })();

  const formatElapsedTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDownload = async () => {
    if (!recordingIdRef.current || savedChunks === 0) {
      alert('No recording data available');
      return;
    }

    if (onDownload) {
      try {
        await onDownload(recordingIdRef.current);
      } catch (err) {
        console.error('❌ Download error:', err);
        alert('Failed to download recording');
      }
    }
  };

  // Handle device change - update settings and restart capture
  const handleDeviceChange = useCallback(async (newSettings: RecorderSettings) => {
    if (isRecording) {
      return; // Don't change devices while recording
    }
    setSettings(newSettings);
    onSettingsChange?.(newSettings);

    // Restart capture with new device settings
    // restartCapture は既存ストリームを停止してから新しいストリームを取得する
    await restartCapture({
      audioDeviceId: newSettings.audioDeviceId,
    });
  }, [isRecording, onSettingsChange, restartCapture]);

  // Handle device select from MicDeviceCard
  const handleDeviceSelect = useCallback((deviceId: string) => {
    handleDeviceChange({ ...settings, audioDeviceId: deviceId });
  }, [handleDeviceChange, settings]);

  // Handle refresh devices
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshDevices();
    setTimeout(() => setIsRefreshing(false), 500);
  }, [refreshDevices]);

  // Determine if a device is the effectively selected one
  const isEffectiveDevice = useCallback((device: MediaDeviceInfo) => {
    if (settings.audioDeviceId) {
      return device.deviceId === settings.audioDeviceId;
    }
    // If no device explicitly selected, the first device is the default
    const firstDevice = audioDevices[0];
    return firstDevice ? device.deviceId === firstDevice.deviceId : false;
  }, [settings.audioDeviceId, audioDevices]);

  return (
    <div className="flex flex-col h-full bg-maycast-bg text-maycast-text">
      <div className="flex items-center justify-between px-8 py-6 border-b border-maycast-border">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-4 py-2 bg-maycast-primary/20 backdrop-blur-sm rounded-full border border-maycast-primary/30">
            <span className="text-maycast-primary/80 font-semibold">Guest</span>
          </div>
          <span className="text-maycast-text-secondary font-medium">
            Room: {guestMode.roomId.substring(0, 8)}
          </span>
          {guestMode.isWebSocketConnected ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-maycast-safe/20 backdrop-blur-sm rounded-full border border-maycast-safe/30">
              <div className="relative">
                <div className="w-2 h-2 bg-maycast-safe rounded-full" />
                <div className="absolute inset-0 w-2 h-2 bg-maycast-safe rounded-full animate-ping opacity-75" />
              </div>
              <span className="text-maycast-safe/80 font-medium text-sm">Live</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500/20 backdrop-blur-sm rounded-full border border-yellow-500/30">
              <span className="text-yellow-400/80 font-medium text-sm">Polling</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isRecording && (
            <div className="flex items-center gap-2 px-4 py-2 bg-maycast-rec/20 backdrop-blur-sm rounded-full border border-maycast-rec/30">
              <div className="relative">
                <div className="w-2 h-2 bg-maycast-rec rounded-full animate-pulse" />
                <div className="absolute inset-0 w-2 h-2 bg-maycast-rec rounded-full animate-ping opacity-75" />
              </div>
              <span className="text-maycast-rec/80 font-semibold">{formatElapsedTime(elapsedTime)}</span>
            </div>
          )}
          {!isRecording && screenState === 'standby' && guestMode.waitingMessage && (
            <div className="flex items-center gap-2 px-4 py-2 bg-yellow-500/20 backdrop-blur-sm rounded-full border border-yellow-500/30">
              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
              <span className="text-yellow-400/80 font-medium text-sm">{guestMode.waitingMessage}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-8">
        {error && (
          <div className="bg-maycast-rec/20 border border-maycast-rec/50 text-maycast-text p-4 rounded-xl mb-6 mt-6">
            <p className="font-semibold text-maycast-rec">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {/* Studio Area */}
        <div className={`mt-6 mx-auto w-full max-w-2xl p-6 rounded-2xl border shadow-xl transition-all duration-500 ${studioStyles}`}>
          {/* Microphone Section */}
          <div className="mb-4" ref={studioRef}>
            {screenState === 'standby' ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-maycast-text-secondary flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                    Microphone
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
                <div className="space-y-3">
                  {audioDevices.map((device, index) => {
                    const selected = isEffectiveDevice(device);
                    return (
                      <MicDeviceCard
                        key={device.deviceId}
                        device={device}
                        index={index}
                        isSelected={selected}
                        stream={selected ? stream : null}
                        onSelect={() => handleDeviceSelect(device.deviceId)}
                        onWaveformData={selected ? handleWaveformData : undefined}
                        waveformDataInterval={selected ? 200 : undefined}
                      />
                    );
                  })}
                  {audioDevices.length === 0 && (
                    <div className="text-center py-4 text-maycast-subtext text-sm">
                      No microphones detected
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 text-maycast-subtext text-sm mb-3">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                  <span>
                    {audioDevices.find(d => isEffectiveDevice(d))?.label || 'Default'}
                  </span>
                </div>
                <AudioWaveform
                  stream={stream}
                  width={canvasWidth}
                  height={80}
                  color={isRecording ? '#06B6D4' : '#22c55e'}
                  backgroundColor="rgba(0,0,0,0.3)"
                  onWaveformData={handleWaveformData}
                  waveformDataInterval={200}
                  showSilenceWarning={true}
                />
              </>
            )}
          </div>

          {/* VU Meter Section */}
          {screenState !== 'completed' && (
            <div className="mb-4">
              <VUMeter
                stream={stream}
                height={120}
                inactive={screenState === 'standby'}
              />
            </div>
          )}

          {/* Stats Bar */}
          <RecordingStatsBar
            isRecording={isRecording}
            elapsedTime={elapsedTime}
            savedChunks={savedChunks}
            totalSize={stats.totalSize}
            screenState={screenState}
            waitingMessage={guestMode.waitingMessage}
          />
        </div>

        <ControlPanel
          screenState={screenState}
          savedChunks={savedChunks}
          downloadProgress={downloadProgress}
          onDownload={handleDownload}
          onNewRecording={handleNewRecording}
          onDiscard={handleDiscardRecording}
        />
      </div>
    </div>
  )
}
