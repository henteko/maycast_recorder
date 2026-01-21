import { useState } from 'react'
import { Recorder } from './components/Recorder'
import { LibraryPage } from './components/pages/LibraryPage'
import { SettingsPage } from './components/pages/SettingsPage'
import { MainLayout } from './components/templates/MainLayout'
import { Sidebar } from './components/organisms/Sidebar'
import type { NavigationPage } from './components/organisms/SidebarNavigation'
import { useSystemHealth } from './hooks/useSystemHealth'
import { useSessionManager } from './hooks/useSessionManager'
import { useDownload } from './hooks/useDownload'
import { useDevices } from './hooks/useDevices'
import { loadSettings, saveSettings } from './types/settings'
import type { RecorderSettings } from './types/settings'

function App() {
  const [currentPage, setCurrentPage] = useState<NavigationPage>('recorder')
  const [settings, setSettings] = useState<RecorderSettings>(loadSettings())

  const systemHealth = useSystemHealth()
  const { videoDevices, audioDevices } = useDevices()
  const {
    savedSessions,
    loadSessions,
    deleteSession,
    clearAllSessions,
  } = useSessionManager()
  const { downloadProgress, downloadSessionById } = useDownload()

  const handleNavigate = (page: NavigationPage) => {
    setCurrentPage(page)
  }

  const handleSaveSettings = () => {
    saveSettings(settings)
    console.log('✅ Settings saved:', settings)
  }

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
          onSessionComplete={loadSessions}
          onDownload={downloadSessionById}
          downloadProgress={downloadProgress}
        />
      )}
      {currentPage === 'library' && (
        <LibraryPage
          sessions={savedSessions}
          onDownload={downloadSessionById}
          onDelete={deleteSession}
          onClearAll={clearAllSessions}
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
  )
}

export default App
