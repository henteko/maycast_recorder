import { useRef, useState, useEffect, useImperativeHandle } from 'react'
import { useMediaStream } from '../hooks/useMediaStream'
import { useSessionManager } from '../hooks/useSessionManager'
import { useEncoders } from '../hooks/useEncoders'
import { useRecorder } from '../hooks/useRecorder'
// @ts-expect-error - maycast-wasm-core has no type definitions
import init from 'maycast-wasm-core'
import type { RecorderSettings } from '../types/settings'
import type { ScreenState } from '../types/recorder'
import type { DownloadProgress } from '../hooks/useDownload'
import type { IStorageStrategy } from '../storage-strategies/IStorageStrategy'

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
}

interface RecorderProps {
  settings: RecorderSettings;
  storageStrategy: IStorageStrategy;
  onSessionComplete?: () => void | Promise<void>;
  onDownload?: (recordingId: RecordingId) => Promise<void>;
  downloadProgress?: DownloadProgress;
  exportRef?: React.Ref<RecorderExports>;
}

export const Recorder: React.FC<RecorderProps> = ({
  settings: externalSettings,
  storageStrategy,
  onSessionComplete,
  onDownload,
  downloadProgress = { isDownloading: false, current: 0, total: 0 },
  exportRef,
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

  // Export recorder state to parent
  useImperativeHandle(exportRef, () => ({
    screenState,
    recordingIdRef,
    savedChunks,
  }), [screenState, recordingIdRef, savedChunks]);

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

      <MainHeader
        screenState={screenState}
        isRecording={isRecording}
        wasmInitialized={wasmInitialized}
        onStartStop={handleStartStop}
      />

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
