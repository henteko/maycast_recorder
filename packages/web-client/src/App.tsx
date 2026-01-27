import { useState, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Recorder } from './presentation/components/Recorder';
import { LibraryPage } from './presentation/components/pages/LibraryPage';
import { SettingsPage } from './presentation/components/pages/SettingsPage';
import { MainLayout } from './presentation/components/templates/MainLayout';
import { Sidebar } from './presentation/components/organisms/Sidebar';
import type { NavigationPage } from './presentation/components/organisms/SidebarNavigation';
import { useSystemHealth } from './presentation/hooks/useSystemHealth';
import { useSessionManager } from './presentation/hooks/useSessionManager';
import { useDownload } from './presentation/hooks/useDownload';
import { useDevices } from './presentation/hooks/useDevices';
import { loadSettings, saveSettings } from './types/settings';
import type { RecorderSettings } from './types/settings';
import { StandaloneStorageStrategy } from './storage-strategies/StandaloneStorageStrategy';
import { RemoteStorageStrategy } from './storage-strategies/RemoteStorageStrategy';
import type { RecordingId } from '@maycast/common-types';
import { DIProvider, setupContainer } from './infrastructure/di';
import { ResumeUploadModal } from './presentation/components/organisms/RecoveryModal';

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

// DIProvider内で実行されるメインコンテンツ
function ModeContent() {
  const location = useLocation();
  const [currentPage, setCurrentPage] = useState<NavigationPage>('recorder');
  const [settings, setSettings] = useState<RecorderSettings>(loadSettings());

  const systemHealth = useSystemHealth();
  const { videoDevices, audioDevices } = useDevices();
  const {
    savedRecordings,
    loadRecordings,
    deleteRecording,
    clearAllRecordings,
    // Resume Upload 関連
    unfinishedRecordings,
    showResumeModal,
    setShowResumeModal,
    uploadProgress,
    isResuming,
    resumeAllRecordings,
    skipResume,
  } = useSessionManager();
  const { downloadProgress, downloadRecordingById } = useDownload();

  // パスに応じてストレージ戦略を切り替え
  const isRemoteMode = location.pathname === '/remote';
  const storageStrategy = useMemo(() => {
    if (isRemoteMode) {
      console.log('🔄 [App] Using RemoteStorageStrategy');
      return new RemoteStorageStrategy();
    }
    console.log('🔄 [App] Using StandaloneStorageStrategy');
    return new StandaloneStorageStrategy();
  }, [isRemoteMode]);

  const handleNavigate = (page: NavigationPage) => {
    setCurrentPage(page);
  };

  const handleSaveSettings = () => {
    saveSettings(settings);
    console.log('✅ Settings saved:', settings);
  };

  // Remote Mode用のダウンロードハンドラー
  const handleDownload = async (recordingId: RecordingId) => {
    if (isRemoteMode && storageStrategy instanceof RemoteStorageStrategy) {
      try {
        console.log('📥 [App] Downloading from server...');
        const blob = await storageStrategy.downloadFromServer(recordingId);

        // Blobをダウンロード
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `recording-${recordingId}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('✅ [App] Download completed');
      } catch (err) {
        console.error('❌ [App] Download failed:', err);
        alert('Failed to download recording from server');
      }
    } else {
      // Standalone Modeの場合は既存のダウンロード処理
      await downloadRecordingById(recordingId);
    }
  };

  return (
    <>
      {/* Resume Upload Modal (Remote Mode のみ) */}
      {isRemoteMode && (
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
      )}

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
            videoDevices={videoDevices}
            audioDevices={audioDevices}
            showServerSettings={isRemoteMode}
          />
        )}
      </MainLayout>
    </>
  );
}

// モード判定とDIコンテナのセットアップ
function ModeRouter() {
  const location = useLocation();

  // パスに応じてDIコンテナを初期化
  const diContainer = useMemo(() => {
    const isRemoteMode = location.pathname === '/remote';
    const mode = isRemoteMode ? 'remote' : 'standalone';
    return setupContainer(mode);
  }, [location.pathname]);

  return (
    <DIProvider container={diContainer}>
      <ModeContent />
    </DIProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Standalone Mode - /solo */}
        <Route path="/solo" element={<ModeRouter />} />

        {/* Remote Mode - /remote */}
        <Route path="/remote" element={<ModeRouter />} />

        {/* Default redirect to /solo */}
        <Route path="/" element={<Navigate to="/solo" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
