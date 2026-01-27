/**
 * GuestRecorder - Guest Mode用のレコーダーコンポーネント
 *
 * Room状態に応じて以下の画面を表示:
 * - Loading: Room情報取得中
 * - Error: Room not found
 * - Waiting: Directorの開始指示待ち
 * - Recording: 録画中
 * - Complete: 録画完了
 */

import { useRef, useState, useEffect, useMemo } from 'react';
import { useMediaStream } from '../../presentation/hooks/useMediaStream';
import { useRoomMetadata } from '../../presentation/hooks/useRoomMetadata';
import { useEncoders } from '../../presentation/hooks/useEncoders';
import { useRecorder } from '../../presentation/hooks/useRecorder';
// @ts-expect-error - maycast-wasm-core has no type definitions
import init from 'maycast-wasm-core';
import type { RecorderSettings } from '../../types/settings';
import { loadSettings } from '../../types/settings';
import { GuestStorageStrategy } from './GuestStorageStrategy';
import { VideoPreview } from '../../presentation/components/organisms/VideoPreview';
import { StatsPanel } from '../../presentation/components/organisms/StatsPanel';

interface GuestRecorderProps {
  roomId: string;
}

type GuestScreenState = 'loading' | 'error' | 'waiting' | 'recording' | 'syncing' | 'complete';

export const GuestRecorder: React.FC<GuestRecorderProps> = ({ roomId }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { stream, startCapture } = useMediaStream();
  const [wasmInitialized, setWasmInitialized] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [settings] = useState<RecorderSettings>(loadSettings());
  const [guestScreenState, setGuestScreenState] = useState<GuestScreenState>('loading');
  const [hasStartedRecording, setHasStartedRecording] = useState(false);

  // Room状態をポーリングで取得（1秒間隔）
  const {
    roomState,
    isLoading: isRoomLoading,
    error: roomError,
    isRoomNotFound,
  } = useRoomMetadata(roomId, 1000);

  // GuestStorageStrategy（roomIdを渡す）
  const storageStrategy = useMemo(() => {
    return new GuestStorageStrategy(roomId);
  }, [roomId]);

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
  });

  const {
    screenState,
    isRecording,
    stats,
    savedChunks,
    recordingStartTime,
    startRecording,
    stopRecording,
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
  });

  // Initialize WASM
  useEffect(() => {
    const initWasm = async () => {
      try {
        await init();
        setWasmInitialized(true);
        console.log('✅ [GuestRecorder] WASM initialized');
      } catch (err) {
        console.error('❌ [GuestRecorder] Failed to initialize WASM:', err);
      }
    };
    initWasm();
  }, []);

  // Update elapsed time during recording
  useEffect(() => {
    if (!recordingStartTime) {
      setElapsedTime(0);
      return;
    }

    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
      setElapsedTime(elapsed);
    }, 1000);

    return () => clearInterval(timer);
  }, [recordingStartTime]);

  // Update video preview when stream changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(err => {
        console.error('Failed to play video preview:', err);
      });
    }
  }, [stream]);

  // Room状態に応じて録画を自動制御
  useEffect(() => {
    if (isRoomLoading || roomError) return;

    // Room状態がrecordingになったら自動的に録画開始
    if (roomState === 'recording' && !hasStartedRecording && wasmInitialized) {
      console.log('🎬 [GuestRecorder] Director started recording, auto-starting...');
      setHasStartedRecording(true);
      startRecording();
    }

    // Room状態がfinishedになったら自動的に録画停止
    if (roomState === 'finished' && hasStartedRecording && isRecording) {
      console.log('🛑 [GuestRecorder] Director stopped recording, auto-stopping...');
      stopRecording();
    }
  }, [roomState, hasStartedRecording, wasmInitialized, isRecording, isRoomLoading, roomError, startRecording, stopRecording]);

  // Guest画面状態を更新
  useEffect(() => {
    if (isRoomLoading) {
      setGuestScreenState('loading');
      return;
    }

    if (roomError || isRoomNotFound) {
      setGuestScreenState('error');
      return;
    }

    // screenState === 'completed' は録画完了（アップロード中または完了）
    if (screenState === 'completed') {
      // アップロード進捗を確認
      const progress = storageStrategy.getUploadProgress();
      if (progress.total > 0 && progress.uploaded < progress.total) {
        setGuestScreenState('syncing');
      } else {
        setGuestScreenState('complete');
      }
      return;
    }

    if (isRecording) {
      setGuestScreenState('recording');
      return;
    }

    // idleの場合は待機画面
    setGuestScreenState('waiting');
  }, [isRoomLoading, roomError, isRoomNotFound, screenState, isRecording, storageStrategy]);

  const formatElapsedTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Loading画面
  if (guestScreenState === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-maycast-bg text-maycast-text">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-maycast-accent border-t-transparent mb-4"></div>
        <p className="text-xl">Loading room...</p>
      </div>
    );
  }

  // Error画面
  if (guestScreenState === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-maycast-bg text-maycast-text">
        <div className="text-6xl mb-4">😕</div>
        <h1 className="text-2xl font-bold mb-2">Room Not Found</h1>
        <p className="text-maycast-text-secondary mb-4">
          {isRoomNotFound
            ? `The room "${roomId}" does not exist.`
            : roomError || 'An error occurred.'}
        </p>
        <p className="text-maycast-text-secondary">
          Please check the URL and try again.
        </p>
      </div>
    );
  }

  // Complete画面
  if (guestScreenState === 'complete') {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-maycast-bg text-maycast-text">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-3xl font-bold mb-2">Recording Complete!</h1>
        <p className="text-maycast-text-secondary mb-4">
          Your recording has been uploaded successfully.
        </p>
        <p className="text-maycast-text-secondary">
          You can now close this window.
        </p>
        {savedChunks > 0 && (
          <p className="text-maycast-accent mt-4">
            {savedChunks} chunks uploaded
          </p>
        )}
      </div>
    );
  }

  // Syncing画面
  if (guestScreenState === 'syncing') {
    const progress = storageStrategy.getUploadProgress();
    const percentage = progress.total > 0 ? Math.round((progress.uploaded / progress.total) * 100) : 0;

    return (
      <div className="flex flex-col items-center justify-center h-screen bg-maycast-bg text-maycast-text">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-maycast-accent border-t-transparent mb-4"></div>
        <h1 className="text-2xl font-bold mb-2">Uploading...</h1>
        <p className="text-maycast-text-secondary mb-4">
          Please wait while your recording is being uploaded.
        </p>
        <div className="w-64 bg-maycast-bg-secondary rounded-full h-3 mb-2">
          <div
            className="bg-maycast-accent rounded-full h-3 transition-all duration-300"
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
        <p className="text-maycast-text-secondary">
          {progress.uploaded} / {progress.total} chunks ({percentage}%)
        </p>
      </div>
    );
  }

  // Waiting / Recording画面
  return (
    <div className="flex flex-col h-screen bg-maycast-bg text-maycast-text">
      {/* Header */}
      <header className="px-8 py-6 border-b border-maycast-border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Guest Recording</h1>
            <p className="text-maycast-text-secondary">Room: {roomId}</p>
          </div>
          <div className="flex items-center gap-4">
            {guestScreenState === 'recording' && (
              <div className="flex items-center gap-2 text-maycast-rec">
                <span className="w-3 h-3 bg-maycast-rec rounded-full animate-pulse"></span>
                <span className="font-mono">{formatElapsedTime(elapsedTime)}</span>
              </div>
            )}
            {guestScreenState === 'waiting' && (
              <div className="flex items-center gap-2 text-maycast-text-secondary">
                <span className="w-3 h-3 bg-yellow-500 rounded-full animate-pulse"></span>
                <span>Waiting for Director...</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* Video Preview */}
        <VideoPreview
          videoRef={videoRef}
          isRecording={isRecording}
          elapsedTime={formatElapsedTime(elapsedTime)}
        />

        {/* Status Message */}
        {guestScreenState === 'waiting' && (
          <div className="text-center py-8">
            <div className="inline-flex items-center gap-3 bg-maycast-bg-secondary px-6 py-4 rounded-xl">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-maycast-accent border-t-transparent"></div>
              <span className="text-maycast-text-secondary">
                Waiting for the Director to start recording...
              </span>
            </div>
            <p className="text-maycast-text-secondary mt-4 text-sm">
              Recording will start automatically when the Director begins the session.
            </p>
          </div>
        )}

        {/* Stats Panel (during recording) */}
        {guestScreenState === 'recording' && (
          <StatsPanel stats={stats} />
        )}

        {/* Upload Progress */}
        {guestScreenState === 'recording' && (
          <div className="mt-6 bg-maycast-bg-secondary p-4 rounded-xl">
            <div className="flex justify-between text-sm text-maycast-text-secondary mb-2">
              <span>Upload Progress</span>
              <span>{savedChunks} chunks saved</span>
            </div>
            {(() => {
              const progress = storageStrategy.getUploadProgress();
              const percentage = progress.total > 0 ? Math.round((progress.uploaded / progress.total) * 100) : 0;
              return (
                <>
                  <div className="w-full bg-maycast-bg rounded-full h-2">
                    <div
                      className="bg-maycast-accent rounded-full h-2 transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-maycast-text-secondary mt-1">
                    {progress.uploaded} / {progress.total} chunks uploaded
                  </p>
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-maycast-border text-center text-maycast-text-secondary text-sm">
        {guestScreenState === 'waiting' ? (
          <p>Make sure your camera and microphone are ready.</p>
        ) : (
          <p>Recording is controlled by the Director. Please do not close this window.</p>
        )}
      </footer>
    </div>
  );
};
