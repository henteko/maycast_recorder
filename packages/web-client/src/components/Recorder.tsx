import { useRef, useState, useEffect } from 'react'
import { CogIcon, ServerStackIcon } from '@heroicons/react/24/solid'
import { useMediaStream } from '../hooks/useMediaStream'
import { useDevices } from '../hooks/useDevices'
import { useSessionManager } from '../hooks/useSessionManager'
import { useDownload } from '../hooks/useDownload'
import { useEncoders } from '../hooks/useEncoders'
import { useRecorder } from '../hooks/useRecorder'
// @ts-expect-error - maycast-wasm-core has no type definitions
import init from 'maycast-wasm-core'
import { loadSettings, saveSettings } from '../types/settings'
import type { RecorderSettings } from '../types/settings'

import { StatusBadge } from './atoms/StatusBadge'
import { SettingsModal } from './organisms/SettingsModal'
import { RecoveryModal } from './organisms/RecoveryModal'
import { SessionsModal } from './organisms/SessionsModal'
import { VideoPreview } from './organisms/VideoPreview'
import { StatsPanel } from './organisms/StatsPanel'
import { ControlPanel } from './organisms/ControlPanel'

export const Recorder = () => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { stream, error, startCapture } = useMediaStream()

  const [wasmInitialized, setWasmInitialized] = useState(false)
  const [elapsedTime, setElapsedTime] = useState(0)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showSessionsModal, setShowSessionsModal] = useState(false)
  const [settings, setSettings] = useState<RecorderSettings>(loadSettings())

  const { videoDevices, audioDevices } = useDevices()
  const {
    savedSessions,
    recoverySession,
    showRecoveryModal,
    setShowRecoveryModal,
    setRecoverySession,
    loadSessions,
    deleteSession,
    clearAllSessions,
    recoverSession,
    discardRecoverySession,
  } = useSessionManager()

  const { downloadProgress, downloadSessionById } = useDownload()

  const {
    videoEncoderRef,
    audioEncoderRef,
    chunkStorageRef,
    initializeEncoders,
    closeEncoders,
    resetEncoders,
  } = useEncoders({
    wasmInitialized,
    settings,
    onStatsUpdate: (updater) => setStats(updater),
    onChunkSaved: () => setSavedChunks(prev => prev + 1),
  })

  const {
    screenState,
    isRecording,
    stats,
    savedChunks,
    recordingStartTime,
    sessionIdRef,
    startRecording,
    stopRecording,
    handleNewRecording,
    handleDiscardRecording,
    setStats,
    setSavedChunks,
  } = useRecorder({
    videoEncoderRef,
    audioEncoderRef,
    chunkStorageRef,
    initializeEncoders,
    closeEncoders,
    resetEncoders,
    startCapture,
    settings,
    onSessionComplete: loadSessions,
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

  const formatElapsedTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleStartStop = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const handleSaveSettings = () => {
    saveSettings(settings)
    setShowSettingsModal(false)
    console.log('✅ Settings saved:', settings)
  }

  const handleRecoverSession = async () => {
    if (!recoverySession) return

    setShowRecoveryModal(false)

    const success = await recoverSession(recoverySession.sessionId)
    if (success) {
      if (confirm('セッションを復元しました。今すぐダウンロードしますか？')) {
        await downloadSessionById(recoverySession.sessionId)
      }
    }

    setRecoverySession(null)
  }

  const handleDiscardRecovery = async () => {
    if (!recoverySession) return

    setShowRecoveryModal(false)
    await discardRecoverySession(recoverySession.sessionId)
    setRecoverySession(null)
  }

  const downloadRecording = async () => {
    if (!sessionIdRef.current || savedChunks === 0) {
      alert('No recording data available')
      return
    }

    try {
      await downloadSessionById(sessionIdRef.current)
    } catch (err) {
      console.error('❌ Download error:', err)
      alert('Failed to download recording')
    }
  }

  return (
    <div className="min-h-screen bg-maycast-bg text-maycast-text p-8">
      <SettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
        settings={settings}
        onSettingsChange={setSettings}
        onSave={handleSaveSettings}
        videoDevices={videoDevices}
        audioDevices={audioDevices}
      />

      <RecoveryModal
        isOpen={showRecoveryModal}
        onClose={() => setShowRecoveryModal(false)}
        session={recoverySession}
        onRecover={handleRecoverSession}
        onDiscard={handleDiscardRecovery}
        formatElapsedTime={formatElapsedTime}
      />

      <SessionsModal
        isOpen={showSessionsModal}
        onClose={() => setShowSessionsModal(false)}
        sessions={savedSessions}
        onDownload={downloadSessionById}
        onDelete={deleteSession}
        onClearAll={clearAllSessions}
        isDownloading={downloadProgress.isDownloading}
      />

      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-6xl font-bold text-maycast-primary tracking-tight">Maycast Recorder</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowSessionsModal(true)}
              className="p-3 bg-maycast-panel/50 backdrop-blur-md hover:bg-maycast-panel/70 rounded-xl transition-all border border-maycast-border/50 shadow-xl relative cursor-pointer"
              title="保存済みセッション"
            >
              <ServerStackIcon className="w-7 h-7 text-maycast-text" />
              {savedSessions.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {savedSessions.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-3 bg-maycast-panel/50 backdrop-blur-md hover:bg-maycast-panel/70 rounded-xl transition-all border border-maycast-border/50 shadow-xl cursor-pointer"
              title="設定"
            >
              <CogIcon className="w-7 h-7 text-maycast-text" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-10">
          <StatusBadge state={screenState} />
        </div>

        {error && (
          <div className="bg-maycast-rec/20 border border-maycast-rec/50 text-maycast-text p-4 rounded-xl mb-6">
            <p className="font-semibold text-maycast-rec">Error:</p>
            <p>{error}</p>
          </div>
        )}

        <VideoPreview
          videoRef={videoRef}
          isRecording={isRecording}
          elapsedTime={formatElapsedTime(elapsedTime)}
        />

        {screenState !== 'standby' && (
          <StatsPanel stats={stats} savedChunks={savedChunks} />
        )}

        <ControlPanel
          screenState={screenState}
          isRecording={isRecording}
          wasmInitialized={wasmInitialized}
          savedChunks={savedChunks}
          downloadProgress={downloadProgress}
          onStartStop={handleStartStop}
          onDownload={downloadRecording}
          onNewRecording={handleNewRecording}
          onDiscard={handleDiscardRecording}
        />
      </div>
    </div>
  )
}
