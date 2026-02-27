/**
 * GuestPage - Guest Mode用ページ
 *
 * Remote ModeのRecorderコンポーネントを使用し、
 * Room状態に応じて自動的に録画制御を行う
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Recorder } from '../Recorder';
import { LibraryPage } from './LibraryPage';
import { MainLayout } from '../templates/MainLayout';
import { Sidebar } from '../organisms/Sidebar';
import { ResumeUploadModal } from '../organisms/RecoveryModal';
import { Toast } from '../atoms/Toast';
import { LoadingScreen } from '../molecules/LoadingScreen';
import { RoomNotFoundScreen } from '../molecules/RoomNotFoundScreen';
import { GuestCompletePage } from '../molecules/GuestCompletePage';
import { GuestNameInput } from '../molecules/GuestNameInput';
import { RoomClosedScreen } from '../molecules/RoomClosedScreen';
import type { NavigationPage } from '../organisms/SidebarNavigation';
import { useSystemHealth } from '../../hooks/useSystemHealth';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useDownload } from '../../hooks/useDownload';
import { useToast } from '../../hooks/useToast';
import { useGuestRecordingControl } from '../../hooks/useGuestRecordingControl';
import { loadDeviceSettings, saveDeviceSettings } from '../../../types/settings';
import type { RecorderSettings } from '../../../types/settings';

// 時間表示のフォーマット関数
const formatElapsedTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

interface GuestPageProps {
  roomId: string;
}

export const GuestPage: React.FC<GuestPageProps> = ({ roomId }) => {
  const [currentPage, setCurrentPage] = useState<NavigationPage>('recorder');
  const [settings, setSettings] = useState<RecorderSettings>(loadDeviceSettings());
  const [guestName, setGuestName] = useState<string | null>(null);
  const [hasJoined, setHasJoined] = useState(false);

  const systemHealth = useSystemHealth();
  const {
    savedRecordings,
    loadRecordings,
    deleteRecording,
    clearAllRecordings,
    unfinishedRecordings,
    showResumeModal,
    setShowResumeModal,
    uploadProgress,
    isResuming,
    resumeAllRecordings,
    skipResume,
  } = useSessionManager();
  const { downloadProgress, downloadRecordingById } = useDownload();
  const [downloadingRecordingId, setDownloadingRecordingId] = useState<string | null>(null);

  const handleDownload = useCallback(async (recordingId: string) => {
    setDownloadingRecordingId(recordingId);
    try {
      await downloadRecordingById(recordingId);
    } finally {
      setDownloadingRecordingId(null);
    }
  }, [downloadRecordingById]);
  const { toast, showToast } = useToast();

  const {
    recorderRef,
    storageStrategy,
    guestSyncState,
    roomState,
    isRoomLoading,
    roomError,
    isRoomNotFound,
    isWebSocketConnected,
    getWaitingMessage,
  } = useGuestRecordingControl({
    roomId,
    guestName: guestName ?? undefined,
  });

  // sync完了時にトースト表示
  const prevSyncStateRef = useRef(guestSyncState);
  useEffect(() => {
    if (prevSyncStateRef.current !== 'synced' && guestSyncState === 'synced') {
      showToast('Recording data upload completed');
    }
    prevSyncStateRef.current = guestSyncState;
  }, [guestSyncState, showToast]);

  // 録画中・アップロード中はナビゲーションを制限
  const isRecordingActive = guestSyncState === 'recording' || guestSyncState === 'uploading';

  // 録画開始時にRecorderページに強制遷移
  useEffect(() => {
    if (isRecordingActive) {
      setCurrentPage('recorder');
    }
  }, [isRecordingActive]);

  // 参加可能なRoom状態かどうか
  const canJoinRoom = roomState === 'idle' || roomState === 'recording';

  const handleNavigate = (page: NavigationPage) => {
    setCurrentPage(page);
  };

  const handleSettingsChange = (newSettings: RecorderSettings) => {
    setSettings(newSettings);
    saveDeviceSettings(newSettings);
  };

  const handleJoinRoom = (name: string) => {
    setGuestName(name);
    setHasJoined(true);
  };

  const renderContent = () => {
    // Loading画面
    if (isRoomLoading) {
      return <LoadingScreen message="Loading room info..." />;
    }

    // Error画面
    if (roomError || isRoomNotFound) {
      return (
        <RoomNotFoundScreen
          roomId={roomId}
          isRoomNotFound={isRoomNotFound}
          errorMessage={roomError}
        />
      );
    }

    // Room終了画面（参加不可）
    if (!hasJoined && roomState && !canJoinRoom) {
      return <RoomClosedScreen roomId={roomId} roomState={roomState} />;
    }

    // 名前入力画面（参加前）
    if (!hasJoined) {
      return <GuestNameInput roomId={roomId} onJoin={handleJoinRoom} />;
    }

    // Complete画面 (sync完了後)
    if (guestSyncState === 'synced') {
      return (
        <>
          {toast && <Toast message={toast.message} visible={toast.visible} />}
          <GuestCompletePage
            recordings={savedRecordings}
            onDownload={handleDownload}
            isDownloading={downloadProgress.isDownloading}
            downloadProgress={downloadProgress}
            downloadingRecordingId={downloadingRecordingId ?? undefined}
          />
        </>
      );
    }

    return (
      <MainLayout
        sidebar={
          <Sidebar
            currentPage={currentPage}
            onNavigate={handleNavigate}
            disabledPages={isRecordingActive ? ['library'] : undefined}
            systemHealth={systemHealth}
          />
        }
      >
        {currentPage === 'recorder' && (
          <Recorder
            settings={settings}
            storageStrategy={storageStrategy}
            onSessionComplete={loadRecordings}
            onDownload={handleDownload}
            downloadProgress={downloadProgress}
            exportRef={recorderRef}
            hideControls={true}
            guestMode={{
              roomId,
              isWebSocketConnected,
              waitingMessage: getWaitingMessage(),
            }}
            onSettingsChange={handleSettingsChange}
            autoResetToStandby={true}
          />
        )}
        {currentPage === 'library' && (
          <LibraryPage
            recordings={savedRecordings}
            onDownload={handleDownload}
            onDelete={deleteRecording}
            onClearAll={clearAllRecordings}
            isDownloading={downloadProgress.isDownloading}
            downloadingRecordingId={downloadingRecordingId ?? undefined}
            downloadProgress={downloadProgress}
          />
        )}
      </MainLayout>
    );
  };

  return (
    <>
      <ResumeUploadModal
        isOpen={showResumeModal}
        onClose={() => setShowResumeModal(false)}
        unfinishedRecordings={unfinishedRecordings}
        onResumeAll={resumeAllRecordings}
        onSkip={skipResume}
        uploadProgress={uploadProgress}
        isUploading={isResuming}
        formatElapsedTime={formatElapsedTime}
      />
      {renderContent()}
    </>
  );
};
