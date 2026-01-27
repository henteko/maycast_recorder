import { useState, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
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
import { DIProvider, setupContainer } from './infrastructure/di';
import { GuestPage } from './modes/guest';
import { DirectorPage } from './modes/director';

// DIProvider内で実行されるメインコンテンツ (Standalone Mode)
function StandaloneContent() {
  const [currentPage, setCurrentPage] = useState<NavigationPage>('recorder');
  const [settings, setSettings] = useState<RecorderSettings>(loadSettings());

  const systemHealth = useSystemHealth();
  const { videoDevices, audioDevices } = useDevices();
  const {
    savedRecordings,
    loadRecordings,
    deleteRecording,
    clearAllRecordings,
  } = useSessionManager();
  const { downloadProgress, downloadRecordingById } = useDownload();

  const storageStrategy = useMemo(() => {
    console.log('🔄 [App] Using StandaloneStorageStrategy');
    return new StandaloneStorageStrategy();
  }, []);

  const handleNavigate = (page: NavigationPage) => {
    setCurrentPage(page);
  };

  const handleSaveSettings = () => {
    saveSettings(settings);
    console.log('✅ Settings saved:', settings);
  };

  return (
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
          onDownload={downloadRecordingById}
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
          showServerSettings={false}
        />
      )}
    </MainLayout>
  );
}

// Standalone Mode用のルーター
function StandaloneModeRouter() {
  const diContainer = useMemo(() => {
    return setupContainer('standalone');
  }, []);

  return (
    <DIProvider container={diContainer}>
      <StandaloneContent />
    </DIProvider>
  );
}

// Guest Mode用のルーター
function GuestModeRouter() {
  const { roomId } = useParams<{ roomId: string }>();

  // Guest Modeでは'remote'モードのDIコンテナを使用
  const diContainer = useMemo(() => {
    return setupContainer('remote');
  }, []);

  if (!roomId) {
    return (
      <div className="flex items-center justify-center h-screen bg-maycast-bg text-maycast-text">
        <p>Room ID is required</p>
      </div>
    );
  }

  return (
    <DIProvider container={diContainer}>
      <GuestPage roomId={roomId} />
    </DIProvider>
  );
}

// Director Mode用のルーター
function DirectorModeRouter() {
  // Director Modeでは'remote'モードのDIコンテナを使用
  const diContainer = useMemo(() => {
    return setupContainer('remote');
  }, []);

  return (
    <DIProvider container={diContainer}>
      <DirectorPage />
    </DIProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Standalone Mode - /solo */}
        <Route path="/solo" element={<StandaloneModeRouter />} />

        {/* Director Mode - /director */}
        <Route path="/director" element={<DirectorModeRouter />} />

        {/* Guest Mode - /guest/:roomId */}
        <Route path="/guest/:roomId" element={<GuestModeRouter />} />

        {/* Default redirect to /solo */}
        <Route path="/" element={<Navigate to="/solo" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
