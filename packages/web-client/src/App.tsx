import { useState, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Recorder } from './components/Recorder';
import { RemoteRecorder } from './modes/remote/RemoteRecorder';
import { LibraryPage } from './components/pages/LibraryPage';
import { SettingsPage } from './components/pages/SettingsPage';
import { MainLayout } from './components/templates/MainLayout';
import { Sidebar } from './components/organisms/Sidebar';
import type { NavigationPage } from './components/organisms/SidebarNavigation';
import { useSystemHealth } from './hooks/useSystemHealth';
import { useSessionManager } from './hooks/useSessionManager';
import { useDownload } from './hooks/useDownload';
import { useDevices } from './hooks/useDevices';
import { loadSettings, saveSettings } from './types/settings';
import type { RecorderSettings } from './types/settings';
import { StandaloneStorageStrategy } from './storage-strategies/StandaloneStorageStrategy';

function App() {
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

  // Standalone Mode用のストレージ戦略
  const standaloneStorageStrategy = useMemo(() => new StandaloneStorageStrategy(), []);

  const handleNavigate = (page: NavigationPage) => {
    setCurrentPage(page);
  };

  const handleSaveSettings = () => {
    saveSettings(settings);
    console.log('✅ Settings saved:', settings);
  };

  return (
    <BrowserRouter>
      <Routes>
        {/* Standalone Mode - /solo */}
        <Route
          path="/solo"
          element={
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
                  storageStrategy={standaloneStorageStrategy}
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
                />
              )}
            </MainLayout>
          }
        />

        {/* Remote Mode - /remote */}
        <Route path="/remote" element={<RemoteRecorder />} />

        {/* Default redirect to /solo */}
        <Route path="/" element={<Navigate to="/solo" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
