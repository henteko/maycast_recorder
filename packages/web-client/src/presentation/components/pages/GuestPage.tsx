/**
 * GuestPage - Guest Mode用ページ
 *
 * Remote ModeのRecorderコンポーネントを使用し、
 * Room状態に応じて自動的に録画制御を行う
 */

import { useState } from 'react';
import { Recorder } from '../Recorder';
import { LibraryPage } from './LibraryPage';
import { SettingsPage } from './SettingsPage';
import { MainLayout } from '../templates/MainLayout';
import { Sidebar } from '../organisms/Sidebar';
import { ResumeUploadModal } from '../organisms/RecoveryModal';
import { LoadingScreen } from '../molecules/LoadingScreen';
import { RoomNotFoundScreen } from '../molecules/RoomNotFoundScreen';
import { SyncCompleteScreen } from '../molecules/SyncCompleteScreen';
import { GuestNameInput } from '../molecules/GuestNameInput';
import { RoomClosedScreen } from '../molecules/RoomClosedScreen';
import type { NavigationPage } from '../organisms/SidebarNavigation';
import { useSystemHealth } from '../../hooks/useSystemHealth';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useDownload } from '../../hooks/useDownload';
import { useGuestRecordingControl } from '../../hooks/useGuestRecordingControl';
import { loadSettings, saveSettings } from '../../../types/settings';
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
  const [settings, setSettings] = useState<RecorderSettings>(loadSettings());
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
    handleDownload,
  } = useGuestRecordingControl({
    roomId,
    guestName: guestName ?? undefined,
  });

  // 参加可能なRoom状態かどうか
  const canJoinRoom = roomState === 'idle' || roomState === 'recording';

  const handleNavigate = (page: NavigationPage) => {
    setCurrentPage(page);
  };

  const handleSaveSettings = () => {
    saveSettings(settings);
    console.log('✅ Settings saved:', settings);
  };

  const handleSettingsChange = (newSettings: RecorderSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
    console.log('✅ Settings saved from Recorder:', newSettings);
  };

  const handleJoinRoom = (name: string) => {
    setGuestName(name);
    setHasJoined(true);
  };

  // Loading画面
  if (isRoomLoading) {
    return <LoadingScreen message="Room情報を取得中..." />;
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
    return <SyncCompleteScreen />;
  }

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

      <MainLayout
        sidebar={
          <Sidebar
            currentPage={currentPage}
            onNavigate={handleNavigate}
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
          />
        )}
        {currentPage === 'library' && (
          <LibraryPage
            recordings={savedRecordings}
            onDownload={downloadRecordingById}
            onDelete={deleteRecording}
            onClearAll={clearAllRecordings}
            isDownloading={downloadProgress.isDownloading}
          />
        )}
        {currentPage === 'settings' && (
          <SettingsPage
            settings={settings}
            onSettingsChange={setSettings}
            onSave={handleSaveSettings}
            showServerSettings={true}
          />
        )}
      </MainLayout>
    </>
  );
};
