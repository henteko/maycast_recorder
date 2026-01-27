/**
 * SoloPage - Standalone Mode用ページ
 *
 * ブラウザのみで録画を行うモード
 * OPFSにデータを保存し、ローカルでダウンロード可能
 */

import { useState, useMemo } from 'react';
import { Recorder } from '../Recorder';
import { LibraryPage } from './LibraryPage';
import { SettingsPage } from './SettingsPage';
import { MainLayout } from '../templates/MainLayout';
import { Sidebar } from '../organisms/Sidebar';
import type { NavigationPage } from '../organisms/SidebarNavigation';
import { useSystemHealth } from '../../hooks/useSystemHealth';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useDownload } from '../../hooks/useDownload';
import { useDevices } from '../../hooks/useDevices';
import { loadSettings, saveSettings } from '../../../types/settings';
import type { RecorderSettings } from '../../../types/settings';
import { StandaloneStorageStrategy } from '../../../storage-strategies/StandaloneStorageStrategy';

export const SoloPage: React.FC = () => {
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
    console.log('🔄 [SoloPage] Using StandaloneStorageStrategy');
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
};
