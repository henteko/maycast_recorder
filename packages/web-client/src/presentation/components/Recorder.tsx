import { useRef, useState, useEffect, useImperativeHandle } from 'react'
import { useMediaStream } from '../hooks/useMediaStream'
import { useSessionManager } from '../hooks/useSessionManager'
import { useEncoders } from '../hooks/useEncoders'
import { useRecorder } from '../hooks/useRecorder'
import { useDevices } from '../hooks/useDevices'
import { useGuestMediaStatus } from '../hooks/useGuestMediaStatus'
// @ts-expect-error - maycast-wasm-core has no type definitions
import init from 'maycast-wasm-core'
import type { RecorderSettings } from '../../types/settings'
import type { ScreenState } from '../../types/recorder'
import type { DownloadProgress } from '../hooks/useDownload'
import type { IStorageStrategy } from '../../storage-strategies/IStorageStrategy'

import { MainHeader } from './organisms/MainHeader'
import { RecoveryModal } from './organisms/RecoveryModal'
import { VideoPreview } from './organisms/VideoPreview'
import { StatsPanel } from './organisms/StatsPanel'
import { ControlPanel } from './organisms/ControlPanel'

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
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { stream, error, startCapture } = useMediaStream()

  const [wasmInitialized, setWasmInitialized] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [settings] = useState<RecorderSettings>(externalSettings)

  const {
    recoveryRecording,
    showRecoveryModal,
    setShowRecoveryModal,
    setRecoveryRecording,
    recoverRecording,
    discardRecoveryRecording,
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

  // Update elapsed time during recording
  useEffect(() => {
    if (!recordingStartTime) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const handleRecoverRecording = async () => {
    if (!recoveryRecording) return;
    setShowRecoveryModal(false);
    await recoverRecording(recoveryRecording.id);
    setRecoveryRecording(null);
    onSessionComplete?.();
  };

  const handleDiscardRecovery = async () => {
    if (!recoveryRecording) return;
    setShowRecoveryModal(false);
    await discardRecoveryRecording(recoveryRecording.id);
    setRecoveryRecording(null);
  };

  return (
    <div className="flex flex-col h-full bg-maycast-bg text-maycast-text">
      <RecoveryModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        recording={recoveryRecording}
        onRecover={handleRecoverRecording}
        onDiscard={handleDiscardRecovery}
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
          <VideoPreview
            videoRef={videoRef}
            isRecording={isRecording}
            elapsedTime={formatElapsedTime(elapsedTime)}
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
