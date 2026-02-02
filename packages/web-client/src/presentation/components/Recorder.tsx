import { useRef, useState, useEffect, useImperativeHandle, useCallback } from 'react'
import { useMediaStream } from '../hooks/useMediaStream'
import { useSessionManager } from '../hooks/useSessionManager'
import { useEncoders } from '../hooks/useEncoders'
import { useRecorder } from '../hooks/useRecorder'
import { useDevices } from '../hooks/useDevices'
import { useGuestMediaStatus } from '../hooks/useGuestMediaStatus'
import { getWebSocketRoomClient } from '../../infrastructure/websocket/WebSocketRoomClient'
import { getServerUrl } from '../../infrastructure/config/serverConfig'
// @ts-expect-error - maycast-wasm-core has no type definitions
import init from 'maycast-wasm-core'
import type { RecorderSettings } from '../../types/settings'
import { QUALITY_PRESETS } from '../../types/settings'
import type { ScreenState } from '../../types/recorder'
import type { DownloadProgress } from '../hooks/useDownload'
import type { IStorageStrategy } from '../../storage-strategies/IStorageStrategy'

import { MainHeader } from './organisms/MainHeader'
import { RecoveryModal } from './organisms/RecoveryModal'
import { VideoPreview } from './organisms/VideoPreview'
import { StatsPanel } from './organisms/StatsPanel'
import { ControlPanel } from './organisms/ControlPanel'
import { AudioWaveform } from './atoms/AudioWaveform'

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
  /** Hide manual recording controls (for Guest mode where Director controls recording) */
  hideControls?: boolean;
  /** Guest mode configuration */
  guestMode?: GuestModeConfig;
  /** Callback to navigate to Library page */
  onNavigateToLibrary?: () => void;
  /** Callback when settings (device selection) changes */
  onSettingsChange?: (settings: RecorderSettings) => void;
}

export const Recorder: React.FC<RecorderProps> = ({
  settings: externalSettings,
  storageStrategy,
  onSessionComplete,
  onDownload,
  downloadProgress = { isDownloading: false, current: 0, total: 0 },
  exportRef,
  hideControls = false,
  guestMode,
  onNavigateToLibrary,
  onSettingsChange,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { stream, error, startCapture, restartCapture, videoCapabilities } = useMediaStream()

  const [wasmInitialized, setWasmInitialized] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [settings, setSettings] = useState<RecorderSettings>(externalSettings)

  const {
    recoveryRecording,
    showRecoveryModal,
    setShowRecoveryModal,
  } = useSessionManager();

  const {
    videoEncoderRef,
    audioEncoderRef,
    initializeEncoders,
    closeEncoders,
    resetEncoders,
    setRecordingId,
  } = useEncoders({
    wasmInitialized,
    settings,
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
    videoEncoderRef,
    audioEncoderRef,
    storageStrategy,
    initializeEncoders,
    closeEncoders,
    resetEncoders,
    setRecordingId,
    startCapture,
    settings,
    onSessionComplete,
  })

  // Sync with external settings changes and restart capture if quality preset changed
  useEffect(() => {
    const qualityPresetChanged = externalSettings.qualityPreset !== settings.qualityPreset;
    setSettings(externalSettings);

    // 画質設定が変わった場合、録画中でなければストリームを再取得
    if (qualityPresetChanged && !isRecording) {
      const qualityConfig = QUALITY_PRESETS[externalSettings.qualityPreset];
      console.log('🔄 Quality preset changed, restarting capture with:', externalSettings.qualityPreset);
      restartCapture({
        videoDeviceId: externalSettings.videoDeviceId,
        audioDeviceId: externalSettings.audioDeviceId,
        width: qualityConfig.width,
        height: qualityConfig.height,
        frameRate: qualityConfig.framerate,
      });
    }
  }, [externalSettings, isRecording, restartCapture, settings.qualityPreset]);

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

  // Auto-start camera and microphone capture on mount
  useEffect(() => {
    const autoStartCapture = async () => {
      const qualityConfig = QUALITY_PRESETS[settings.qualityPreset]
      console.log('📹 Auto-starting camera and microphone capture...')
      await startCapture({
        videoDeviceId: settings.videoDeviceId,
        audioDeviceId: settings.audioDeviceId,
        width: qualityConfig.width,
        height: qualityConfig.height,
        frameRate: qualityConfig.framerate,
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

  // Update video preview when stream changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(err => {
        console.error('Failed to play video preview:', err)
      })
    }
  }, [stream])

  // Guest mode: デバイス情報を取得
  const { videoDevices, audioDevices } = useDevices();

  // Guest mode: メディアステータスをDirectorに送信
  useGuestMediaStatus({
    roomId: guestMode?.roomId ?? null,
    stream,
    isWebSocketConnected: guestMode?.isWebSocketConnected ?? false,
    videoDeviceId: settings.videoDeviceId,
    audioDeviceId: settings.audioDeviceId,
    videoDevices,
    audioDevices,
  });

  // Guest mode: 波形データをDirectorに送信
  const handleWaveformData = useCallback((waveformData: number[], isSilent: boolean) => {
    if (!guestMode?.roomId || !guestMode.isWebSocketConnected) return;
    const serverUrl = getServerUrl();
    const wsClient = getWebSocketRoomClient(serverUrl);
    wsClient.emitWaveformUpdate(guestMode.roomId, waveformData, isSilent);
  }, [guestMode?.roomId, guestMode?.isWebSocketConnected]);

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

  const formatElapsedTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartStop = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
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

  const handleGoToLibrary = () => {
    setShowRecoveryModal(false);
    onNavigateToLibrary?.();
  };

  // Handle device change - update settings and restart capture
  const handleDeviceChange = useCallback(async (newSettings: RecorderSettings) => {
    if (isRecording) {
      return; // Don't change devices while recording
    }
    setSettings(newSettings);
    onSettingsChange?.(newSettings);

    // Restart capture with new device/quality settings
    // restartCapture は既存ストリームを停止してから新しいストリームを取得する
    const qualityConfig = QUALITY_PRESETS[newSettings.qualityPreset];
    await restartCapture({
      videoDeviceId: newSettings.videoDeviceId,
      audioDeviceId: newSettings.audioDeviceId,
      width: qualityConfig.width,
      height: qualityConfig.height,
      frameRate: qualityConfig.framerate,
    });
  }, [isRecording, onSettingsChange, restartCapture]);

  return (
    <div className="flex flex-col h-full bg-maycast-bg text-maycast-text">
      <RecoveryModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        recording={recoveryRecording}
        onGoToLibrary={handleGoToLibrary}
        formatElapsedTime={formatElapsedTime}
      />

      {guestMode ? (
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
      ) : (
        <MainHeader
          screenState={screenState}
          isRecording={isRecording}
          wasmInitialized={wasmInitialized}
          onStartStop={hideControls ? () => {} : handleStartStop}
        />
      )}

      <div className="flex-1 overflow-y-auto px-8">
        {error && (
          <div className="bg-maycast-rec/20 border border-maycast-rec/50 text-maycast-text p-4 rounded-xl mb-6 mt-6">
            <p className="font-semibold text-maycast-rec">Error:</p>
            <p>{error}</p>
          </div>
        )}

        <div className="mt-6">
          {/* カメラデバイス選択と画質設定表示 */}
          <div className="flex items-center justify-between text-maycast-text-secondary text-sm mb-2 px-1">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <select
                value={settings.videoDeviceId || ''}
                onChange={(e) => handleDeviceChange({ ...settings, videoDeviceId: e.target.value || undefined })}
                disabled={isRecording}
                className="bg-transparent text-maycast-text-secondary text-sm border-none outline-none cursor-pointer hover:text-maycast-text disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="" className="bg-maycast-bg text-maycast-text">デフォルト</option>
                {videoDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId} className="bg-maycast-bg text-maycast-text">
                    {device.label || `カメラ ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
            {/* 画質設定表示 */}
            <div className="flex items-center gap-3 text-xs">
              {(() => {
                const qualityConfig = QUALITY_PRESETS[settings.qualityPreset];
                const isUnsupported = videoCapabilities && (
                  qualityConfig.width > videoCapabilities.maxWidth ||
                  qualityConfig.height > videoCapabilities.maxHeight
                );
                return (
                  <>
                    <span className={`px-2 py-1 rounded ${isUnsupported ? 'bg-amber-500/20 text-amber-400' : 'bg-maycast-bg-secondary'}`}>
                      {qualityConfig.width}x{qualityConfig.height}
                      {isUnsupported && ' (非対応)'}
                    </span>
                    <span className="px-2 py-1 bg-maycast-bg-secondary rounded">
                      {(qualityConfig.bitrate / 1_000_000).toFixed(1)} Mbps
                    </span>
                    <span className="px-2 py-1 bg-maycast-bg-secondary rounded">
                      {qualityConfig.framerate} fps
                    </span>
                    {videoCapabilities && (
                      <span className="px-2 py-1 bg-maycast-primary/20 text-maycast-primary rounded" title={`カメラ最大: ${videoCapabilities.maxWidth}x${videoCapabilities.maxHeight}`}>
                        Max {videoCapabilities.maxWidth}x{videoCapabilities.maxHeight}
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
          <VideoPreview
            videoRef={videoRef}
            isRecording={isRecording}
            elapsedTime={formatElapsedTime(elapsedTime)}
          />
        </div>

        {/* マイク波形表示 */}
        <div className="mb-6 px-4 py-4 bg-maycast-bg-secondary/50 rounded-xl border border-maycast-border/30">
          <div className="flex items-center gap-2 text-maycast-text-secondary text-sm mb-3">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <select
              value={settings.audioDeviceId || ''}
              onChange={(e) => handleDeviceChange({ ...settings, audioDeviceId: e.target.value || undefined })}
              disabled={isRecording}
              className="bg-transparent text-maycast-text-secondary text-sm border-none outline-none cursor-pointer hover:text-maycast-text disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="" className="bg-maycast-bg text-maycast-text">デフォルト</option>
              {audioDevices.map(device => (
                <option key={device.deviceId} value={device.deviceId} className="bg-maycast-bg text-maycast-text">
                  {device.label || `マイク ${device.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </div>
          <AudioWaveform
            stream={stream}
            width={500}
            height={60}
            color="#22c55e"
            backgroundColor="rgba(0,0,0,0.3)"
            onWaveformData={guestMode ? handleWaveformData : undefined}
            waveformDataInterval={200}
            showSilenceWarning={true}
          />
        </div>

        {screenState !== 'standby' && (
          <StatsPanel stats={stats} />
        )}

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
