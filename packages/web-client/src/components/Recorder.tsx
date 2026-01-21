import { useRef, useState, useEffect } from 'react'
import { useMediaStream } from '../hooks/useMediaStream'
import type { ChunkStats } from '../types/webcodecs'
import init, { Muxer } from 'maycast-wasm-core'
import { ChunkStorage, generateSessionId, listAllSessions } from '../storage/chunk-storage'
import type { SessionMetadata } from '../storage/types'
import type { RecorderSettings, QualityPreset } from '../types/settings'
import { loadSettings, saveSettings, QUALITY_PRESETS } from '../types/settings'
import {
  CogIcon,
  PlayIcon,
  StopIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  ArrowPathIcon,
  CheckIcon,
  ServerStackIcon,
  VideoCameraIcon,
  MicrophoneIcon,
} from '@heroicons/react/24/solid'

type ScreenState = 'standby' | 'recording' | 'completed'

export const Recorder = () => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { stream, error, startCapture } = useMediaStream()

  const [screenState, setScreenState] = useState<ScreenState>('standby')
  const [isRecording, setIsRecording] = useState(false)
  const [stats, setStats] = useState<ChunkStats>({
    videoChunks: 0,
    audioChunks: 0,
    keyframes: 0,
    totalSize: 0,
  })
  const [savedChunks, setSavedChunks] = useState(0) // OPFS保存済みチャンク数
  const [wasmInitialized, setWasmInitialized] = useState(false)
  const [savedSessions, setSavedSessions] = useState<SessionMetadata[]>([])
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0) // 経過時間（秒）
  const [downloadProgress, setDownloadProgress] = useState<{
    isDownloading: boolean
    current: number
    total: number
  }>({ isDownloading: false, current: 0, total: 0 })
  const [recoverySession, setRecoverySession] = useState<SessionMetadata | null>(null)
  const [showRecoveryModal, setShowRecoveryModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showSessionsModal, setShowSessionsModal] = useState(false)
  const [settings, setSettings] = useState<RecorderSettings>(loadSettings())
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([])
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])

  const videoEncoderRef = useRef<VideoEncoder | null>(null)
  const audioEncoderRef = useRef<AudioEncoder | null>(null)
  const videoProcessorRef = useRef<MediaStreamTrackProcessor<VideoFrame> | null>(null)
  const audioProcessorRef = useRef<MediaStreamTrackProcessor<AudioData> | null>(null)
  const isRecordingRef = useRef<boolean>(false)
  const muxerRef = useRef<Muxer | null>(null)
  const initSegmentRef = useRef<Uint8Array | null>(null)
  const videoConfigRef = useRef<Uint8Array | null>(null)
  const audioConfigRef = useRef<Uint8Array | null>(null)
  const activeStreamRef = useRef<MediaStream | null>(null)
  const baseVideoTimestampRef = useRef<number | null>(null)
  const baseAudioTimestampRef = useRef<number | null>(null)
  const chunkStorageRef = useRef<ChunkStorage | null>(null)
  const sessionIdRef = useRef<string | null>(null)

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

  // Enumerate devices on mount
  useEffect(() => {
    const enumerateDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const videoInputs = devices.filter(d => d.kind === 'videoinput')
        const audioInputs = devices.filter(d => d.kind === 'audioinput')

        setVideoDevices(videoInputs)
        setAudioDevices(audioInputs)

        console.log('📹 Video devices:', videoInputs.length)
        console.log('🎤 Audio devices:', audioInputs.length)
      } catch (err) {
        console.error('❌ Failed to enumerate devices:', err)
      }
    }
    enumerateDevices()
  }, [])

  // Load saved sessions on mount and check for incomplete sessions
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const sessions = await listAllSessions()
        setSavedSessions(sessions)
        console.log('📂 Loaded saved sessions:', sessions.length)

        // Check for incomplete sessions (crash recovery)
        const incompleteSessions = sessions.filter(s => !s.isCompleted && s.totalChunks > 0)
        if (incompleteSessions.length > 0) {
          // Show recovery modal for the most recent incomplete session
          const mostRecent = incompleteSessions.sort((a, b) => b.startTime - a.startTime)[0]
          console.log('🔄 Found incomplete session:', mostRecent.sessionId)
          setRecoverySession(mostRecent)
          setShowRecoveryModal(true)
        }
      } catch (err) {
        console.error('❌ Failed to load sessions:', err)
      }
    }
    loadSessions()
  }, [])

  // Update elapsed time during recording
  useEffect(() => {
    if (!recordingStartTime) {
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

  const initializeMuxerWithConfigs = async () => {
    if (!videoConfigRef.current || !audioConfigRef.current || !wasmInitialized || !activeStreamRef.current) {
      console.log('⏳ Waiting for codec configs...', {
        video: !!videoConfigRef.current,
        audio: !!audioConfigRef.current,
        wasm: wasmInitialized,
        stream: !!activeStreamRef.current
      })
      return
    }

    // Get actual audio track settings
    const audioTrack = activeStreamRef.current.getAudioTracks()[0]
    const audioSettings = audioTrack?.getSettings()

    // Get quality config from settings
    const qualityConfig = QUALITY_PRESETS[settings.qualityPreset]

    console.log('🎤 Audio track settings:', audioSettings)
    console.log('📹 Initializing Muxer with configs:', {
      videoConfig: videoConfigRef.current.length,
      audioConfig: audioConfigRef.current.length,
      width: qualityConfig.width,
      height: qualityConfig.height,
      preset: settings.qualityPreset
    })

    // Initialize Muxer with codec configurations from settings
    const muxer = Muxer.with_config(
      qualityConfig.width,  // video_width from settings
      qualityConfig.height, // video_height from settings
      audioSettings?.sampleRate || 48000, // audio_sample_rate
      audioSettings?.channelCount || 1,   // audio_channels
      Array.from(videoConfigRef.current), // video_config
      Array.from(audioConfigRef.current)  // audio_config
    )

    try {
      const initSegment = muxer.initialize()
      initSegmentRef.current = initSegment
      muxerRef.current = muxer
      console.log('✅ Muxer initialized with codec configs, init segment size:', initSegment.length, 'bytes')

      // Save init segment to OPFS
      if (chunkStorageRef.current) {
        await chunkStorageRef.current.saveInitSegment(initSegment)
      }
    } catch (err) {
      console.error('❌ Failed to initialize Muxer:', err)
      return
    }
  }

  const initializeEncoders = (activeStream: MediaStream) => {
    if (!activeStream || !wasmInitialized) return

    // Store the active stream ref for later use
    activeStreamRef.current = activeStream

    // Get actual audio track settings
    const audioTrack = activeStream.getAudioTracks()[0]
    const audioSettings = audioTrack?.getSettings()

    console.log('🎤 Audio track settings:', audioSettings)

    // Get quality config from settings
    const qualityConfig = QUALITY_PRESETS[settings.qualityPreset]

    // Initialize VideoEncoder
    const videoConfig = {
      codec: 'avc1.42001f', // H.264 Baseline Profile Level 3.1
      width: qualityConfig.width,
      height: qualityConfig.height,
      bitrate: qualityConfig.bitrate,
      framerate: qualityConfig.framerate,
    }

    videoEncoderRef.current = new VideoEncoder({
      output: (chunk, metadata) => {
        // Capture decoder config from first chunk
        if (metadata?.decoderConfig?.description && !videoConfigRef.current) {
          videoConfigRef.current = new Uint8Array(metadata.decoderConfig.description)
          console.log('✅ Video decoder config captured:', videoConfigRef.current.length, 'bytes')
          // Try to initialize muxer if both configs are ready
          initializeMuxerWithConfigs()
        }

        // Set base timestamp from first video chunk
        if (baseVideoTimestampRef.current === null) {
          baseVideoTimestampRef.current = chunk.timestamp
          console.log('📹 Base video timestamp set:', chunk.timestamp)
        }

        const isKeyframe = chunk.type === 'key'

        // Convert to relative timestamp (microseconds from start)
        const relativeTimestamp = chunk.timestamp - baseVideoTimestampRef.current

        // Copy chunk data to buffer
        const buffer = new Uint8Array(chunk.byteLength)
        chunk.copyTo(buffer)

        // Send to Muxer (only if initialized)
        if (muxerRef.current && chunkStorageRef.current) {
          try {
            const fragment = muxerRef.current.push_video(buffer, relativeTimestamp, isKeyframe)
            if (fragment.length > 0) {
              // Save to OPFS
              chunkStorageRef.current.saveChunk(fragment, relativeTimestamp).then((chunkId) => {
                setSavedChunks(prev => prev + 1)
                console.log(`📦 fMP4 fragment saved to OPFS: #${chunkId}, ${fragment.length} bytes`)
              }).catch((err) => {
                console.error('❌ Failed to save chunk to OPFS:', err)
              })
            }
          } catch (err) {
            console.error('❌ Muxer push_video error:', err)
          }
        }

        setStats(prev => ({
          ...prev,
          videoChunks: prev.videoChunks + 1,
          keyframes: isKeyframe ? prev.keyframes + 1 : prev.keyframes,
          totalSize: prev.totalSize + chunk.byteLength,
        }))

        console.log(`📹 VideoChunk: type=${chunk.type}, timestamp=${chunk.timestamp}µs (relative: ${relativeTimestamp}µs), size=${chunk.byteLength}B`, metadata)
      },
      error: (err) => {
        console.error('❌ VideoEncoder error:', err)
      },
    })

    videoEncoderRef.current.configure(videoConfig)
    console.log('✅ VideoEncoder configured:', videoConfig)

    // Initialize AudioEncoder with actual track settings
    const audioConfig = {
      codec: 'mp4a.40.2', // AAC-LC
      sampleRate: audioSettings?.sampleRate || 48000,
      numberOfChannels: audioSettings?.channelCount || 1,
      bitrate: 128_000, // 128 kbps
    }

    audioEncoderRef.current = new AudioEncoder({
      output: (chunk, metadata) => {
        // Capture decoder config from first chunk
        if (metadata?.decoderConfig?.description && !audioConfigRef.current) {
          audioConfigRef.current = new Uint8Array(metadata.decoderConfig.description)
          console.log('✅ Audio decoder config captured:', audioConfigRef.current.length, 'bytes')
          // Try to initialize muxer if both configs are ready
          initializeMuxerWithConfigs()
        }

        // Set base timestamp from first audio chunk
        if (baseAudioTimestampRef.current === null) {
          baseAudioTimestampRef.current = chunk.timestamp
          console.log('🎤 Base audio timestamp set:', chunk.timestamp)
        }

        // Convert to relative timestamp (microseconds from start)
        const relativeTimestamp = chunk.timestamp - baseAudioTimestampRef.current

        // Copy chunk data to buffer
        const buffer = new Uint8Array(chunk.byteLength)
        chunk.copyTo(buffer)

        // Send to Muxer (only if initialized)
        if (muxerRef.current && chunkStorageRef.current) {
          try {
            const fragment = muxerRef.current.push_audio(buffer, relativeTimestamp)
            if (fragment.length > 0) {
              // Save to OPFS
              chunkStorageRef.current.saveChunk(fragment, relativeTimestamp).then((chunkId) => {
                setSavedChunks(prev => prev + 1)
                console.log(`📦 fMP4 fragment saved to OPFS: #${chunkId}, ${fragment.length} bytes`)
              }).catch((err) => {
                console.error('❌ Failed to save chunk to OPFS:', err)
              })
            }
          } catch (err) {
            console.error('❌ Muxer push_audio error:', err)
          }
        }

        setStats(prev => ({
          ...prev,
          audioChunks: prev.audioChunks + 1,
          totalSize: prev.totalSize + chunk.byteLength,
        }))

        console.log(`🎤 AudioChunk: timestamp=${chunk.timestamp}µs (relative: ${relativeTimestamp}µs), size=${chunk.byteLength}B`, metadata)
      },
      error: (err) => {
        console.error('❌ AudioEncoder error:', err)
      },
    })

    audioEncoderRef.current.configure(audioConfig)
    console.log('✅ AudioEncoder configured:', audioConfig)
  }

  const startRecording = async () => {
    // Clean up any existing encoders/muxer first
    if (videoEncoderRef.current) {
      try {
        if (videoEncoderRef.current.state !== 'closed') {
          videoEncoderRef.current.close()
        }
      } catch (err) {
        console.warn('Failed to close video encoder:', err)
      }
      videoEncoderRef.current = null
    }

    if (audioEncoderRef.current) {
      try {
        if (audioEncoderRef.current.state !== 'closed') {
          audioEncoderRef.current.close()
        }
      } catch (err) {
        console.warn('Failed to close audio encoder:', err)
      }
      audioEncoderRef.current = null
    }

    // Initialize new session
    const sessionId = generateSessionId()
    sessionIdRef.current = sessionId
    const chunkStorage = new ChunkStorage(sessionId)
    chunkStorageRef.current = chunkStorage

    try {
      await chunkStorage.initSession()
    } catch (err) {
      console.error('❌ Failed to initialize session:', err)
      alert('Failed to initialize storage. Please check browser permissions.')
      return
    }

    // Reset all data from previous recording
    setSavedChunks(0)
    setStats({
      videoChunks: 0,
      audioChunks: 0,
      keyframes: 0,
      totalSize: 0,
    })
    videoConfigRef.current = null
    audioConfigRef.current = null
    muxerRef.current = null
    initSegmentRef.current = null
    activeStreamRef.current = null
    baseVideoTimestampRef.current = null
    baseAudioTimestampRef.current = null

    console.log('🎬 Starting recording with settings:', settings)

    // Always get a fresh stream with current settings
    // This ensures settings changes are applied
    const qualityConfig = QUALITY_PRESETS[settings.qualityPreset]
    const activeStream = await startCapture({
      videoDeviceId: settings.videoDeviceId,
      audioDeviceId: settings.audioDeviceId,
      width: qualityConfig.width,
      height: qualityConfig.height,
      frameRate: qualityConfig.framerate,
    })

    if (!activeStream) {
      console.error('No stream available')
      return
    }

    initializeEncoders(activeStream)

    // Set recording state before starting processors
    setIsRecording(true)
    isRecordingRef.current = true
    setRecordingStartTime(Date.now())
    setScreenState('recording')

    // Process video frames
    const videoTrack = activeStream.getVideoTracks()[0]
    if (videoTrack) {
      // @ts-expect-error - MediaStreamTrackProcessor is experimental
      videoProcessorRef.current = new MediaStreamTrackProcessor({ track: videoTrack })
      const reader = videoProcessorRef.current.readable.getReader()

      let frameCount = 0
      const qualityConfig = QUALITY_PRESETS[settings.qualityPreset]
      const processVideoFrame = async () => {
        while (isRecordingRef.current) {
          const result = await reader.read()
          if (result.done) break

          const frame = result.value
          if (videoEncoderRef.current && videoEncoderRef.current.state === 'configured') {
            frameCount++
            // Force keyframe based on quality preset
            const needsKeyframe = frameCount % qualityConfig.keyframeInterval === 0

            videoEncoderRef.current.encode(frame, { keyFrame: needsKeyframe })
          }
          frame.close()
        }
      }

      processVideoFrame().catch(err => {
        console.error('Video frame processing error:', err)
      })
    }

    // Process audio data
    const audioTrack = activeStream.getAudioTracks()[0]
    if (audioTrack) {
      // @ts-expect-error - MediaStreamTrackProcessor is experimental
      audioProcessorRef.current = new MediaStreamTrackProcessor({ track: audioTrack })
      const reader = audioProcessorRef.current.readable.getReader()

      const processAudioData = async () => {
        while (isRecordingRef.current) {
          const result = await reader.read()
          if (result.done) break

          const audioData = result.value
          if (audioEncoderRef.current && audioEncoderRef.current.state === 'configured') {
            audioEncoderRef.current.encode(audioData)
          }
          audioData.close()
        }
      }

      processAudioData().catch(err => {
        console.error('Audio data processing error:', err)
      })
    }

    console.log('🎬 Recording started')
  }

  const stopRecording = async () => {
    setIsRecording(false)
    isRecordingRef.current = false
    setRecordingStartTime(null)

    if (videoEncoderRef.current) {
      await videoEncoderRef.current.flush()
      videoEncoderRef.current.close()
      videoEncoderRef.current = null
    }

    if (audioEncoderRef.current) {
      await audioEncoderRef.current.flush()
      audioEncoderRef.current.close()
      audioEncoderRef.current = null
    }

    // Complete session
    if (chunkStorageRef.current) {
      await chunkStorageRef.current.completeSession()
    }

    // Reload sessions list
    const sessions = await listAllSessions()
    setSavedSessions(sessions)

    // Move to completed screen
    setScreenState('completed')

    console.log('⏹️ Recording stopped')
    console.log('📊 Final stats:', stats)
    console.log('💾 Saved chunks:', savedChunks)
  }

  const downloadRecording = async () => {
    if (!chunkStorageRef.current || savedChunks === 0) {
      alert('No recording data available')
      return
    }

    try {
      await downloadSessionById(chunkStorageRef.current.sessionId)
    } catch (err) {
      console.error('❌ Download error:', err)
      alert('Failed to download recording')
    }
  }

  const downloadSessionById = async (sessionId: string) => {
    try {
      const storage = new ChunkStorage(sessionId)

      // Get chunk metadata
      const chunkMetadata = await storage.listChunks()
      const totalChunks = chunkMetadata.length + 1 // +1 for init segment
      console.log(`📦 Preparing to load ${chunkMetadata.length} chunks from OPFS for session ${sessionId}`)

      // Start download progress
      setDownloadProgress({ isDownloading: true, current: 0, total: totalChunks })

      // Load chunks as Blobs (memory efficient - each Uint8Array is GC'd after Blob conversion)
      const blobs: Blob[] = []

      // Load init segment
      const initSegment = await storage.loadInitSegment()
      blobs.push(new Blob([initSegment]))
      setDownloadProgress({ isDownloading: true, current: 1, total: totalChunks })
      console.log(`📤 Loaded init segment: ${initSegment.length} bytes`)

      // Load all chunks with progress updates
      for (let i = 0; i < chunkMetadata.length; i++) {
        const meta = chunkMetadata[i]
        const chunk = await storage.loadChunk(meta.chunkId)
        blobs.push(new Blob([chunk]))
        // Original Uint8Array 'chunk' is now eligible for GC

        const currentProgress = i + 2 // +1 for init segment, +1 for current chunk
        setDownloadProgress({ isDownloading: true, current: currentProgress, total: totalChunks })
        console.log(`📤 Loaded chunk #${meta.chunkId}: ${chunk.length} bytes (${currentProgress}/${totalChunks})`)
      }

      console.log('✅ All chunks loaded, combining blobs...')

      // Combine all blobs into one (memory efficient)
      const blob = new Blob(blobs, { type: 'video/mp4' })

      // Download the blob
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `recording-${sessionId}.mp4`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      console.log('✅ Downloaded:', blob.size, 'bytes')

      // Reset download progress
      setDownloadProgress({ isDownloading: false, current: 0, total: 0 })
    } catch (err) {
      console.error('❌ Download error:', err)
      setDownloadProgress({ isDownloading: false, current: 0, total: 0 })
      throw err
    }
  }

  const deleteSession = async (sessionId: string) => {
    if (!confirm('このセッションを削除しますか？')) {
      return
    }

    try {
      const storage = new ChunkStorage(sessionId)
      await storage.deleteSession()

      // Reload sessions list
      const sessions = await listAllSessions()
      setSavedSessions(sessions)

      console.log('🗑️ Session deleted:', sessionId)
    } catch (err) {
      console.error('❌ Failed to delete session:', err)
      alert('Failed to delete session')
    }
  }

  const clearAllSessions = async () => {
    if (!confirm(`すべてのセッション (${savedSessions.length}件) を削除しますか？この操作は取り消せません。`)) {
      return
    }

    let successCount = 0
    let failCount = 0
    const errors: string[] = []

    for (const session of savedSessions) {
      try {
        console.log('🗑️ Deleting session:', session.sessionId)
        const storage = new ChunkStorage(session.sessionId)
        await storage.deleteSession()
        successCount++
        console.log('✅ Session deleted successfully:', session.sessionId)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        console.error('❌ Failed to delete session:', session.sessionId, err)
        errors.push(`${session.sessionId}: ${errorMsg}`)
        failCount++
      }
    }

    // Reload sessions list
    const sessions = await listAllSessions()
    setSavedSessions(sessions)

    if (errors.length > 0) {
      console.error('削除エラーの詳細:', errors)
      alert(`削除完了: 成功 ${successCount}件, 失敗 ${failCount}件\n\nエラー詳細はコンソールを確認してください`)
    } else {
      alert(`削除完了: 成功 ${successCount}件`)
    }
  }


  const handleStartStop = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const formatElapsedTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const handleRecoverSession = async () => {
    if (!recoverySession) return

    setShowRecoveryModal(false)

    // Mark session as completed
    try {
      const storage = new ChunkStorage(recoverySession.sessionId)
      await storage.completeSession()

      // Reload sessions list
      const sessions = await listAllSessions()
      setSavedSessions(sessions)

      console.log('✅ Session recovered:', recoverySession.sessionId)

      // Optionally auto-download
      if (confirm('セッションを復元しました。今すぐダウンロードしますか？')) {
        await downloadSessionById(recoverySession.sessionId)
      }
    } catch (err) {
      console.error('❌ Failed to recover session:', err)
      alert('セッションの復元に失敗しました')
    }

    setRecoverySession(null)
  }

  const handleDiscardRecovery = async () => {
    if (!recoverySession) return

    if (!confirm('このセッションを削除してもよろしいですか？この操作は取り消せません。')) {
      return
    }

    setShowRecoveryModal(false)

    try {
      const storage = new ChunkStorage(recoverySession.sessionId)
      await storage.deleteSession()

      // Reload sessions list
      const sessions = await listAllSessions()
      setSavedSessions(sessions)

      console.log('🗑️ Recovery session discarded:', recoverySession.sessionId)
    } catch (err) {
      console.error('❌ Failed to discard session:', err)
      alert('セッションの削除に失敗しました')
    }

    setRecoverySession(null)
  }

  const handleSaveSettings = () => {
    saveSettings(settings)
    setShowSettingsModal(false)
    console.log('✅ Settings saved:', settings)
  }

  const handleNewRecording = () => {
    setScreenState('standby')
    setSavedChunks(0)
    setStats({
      videoChunks: 0,
      audioChunks: 0,
      keyframes: 0,
      totalSize: 0,
    })
  }

  const handleDiscardRecording = async () => {
    if (!sessionIdRef.current) return

    if (!confirm('この録画を削除しますか？この操作は取り消せません。')) {
      return
    }

    try {
      const storage = new ChunkStorage(sessionIdRef.current)
      await storage.deleteSession()

      // Reload sessions list
      const sessions = await listAllSessions()
      setSavedSessions(sessions)

      setScreenState('standby')
      console.log('🗑️ Recording discarded:', sessionIdRef.current)
    } catch (err) {
      console.error('❌ Failed to discard recording:', err)
      alert('録画の削除に失敗しました')
    }
  }

  return (
    <div className="min-h-screen bg-maycast-bg text-maycast-text p-8">
      {/* Settings Modal */}
      {showSettingsModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
          onClick={() => setShowSettingsModal(false)}
        >
          <div
            className="bg-maycast-panel/95 backdrop-blur-xl border border-maycast-border/50 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-6">
              <CogIcon className="w-7 h-7 text-maycast-primary" />
              <h2 className="text-2xl font-bold text-maycast-text">設定</h2>
            </div>

            {/* Video Device Selection */}
            <div className="mb-6">
              <label className="block text-sm text-maycast-subtext mb-2 font-semibold">カメラ</label>
              <select
                value={settings.videoDeviceId || ''}
                onChange={(e) => setSettings({ ...settings, videoDeviceId: e.target.value || undefined })}
                className="w-full bg-white text-gray-900 px-4 py-3 rounded-xl border-2 border-maycast-border focus:border-maycast-primary focus:outline-none focus:ring-2 focus:ring-maycast-primary/50 font-medium cursor-pointer"
              >
                <option value="">デフォルト</option>
                {videoDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `カメラ ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Audio Device Selection */}
            <div className="mb-6">
              <label className="block text-sm text-maycast-subtext mb-2 font-semibold">マイク</label>
              <select
                value={settings.audioDeviceId || ''}
                onChange={(e) => setSettings({ ...settings, audioDeviceId: e.target.value || undefined })}
                className="w-full bg-white text-gray-900 px-4 py-3 rounded-xl border-2 border-maycast-border focus:border-maycast-primary focus:outline-none focus:ring-2 focus:ring-maycast-primary/50 font-medium cursor-pointer"
              >
                <option value="">デフォルト</option>
                {audioDevices.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `マイク ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Quality Preset Selection */}
            <div className="mb-6">
              <label className="block text-sm text-maycast-subtext mb-2 font-semibold">画質プリセット</label>
              <div className="space-y-3">
                <label className="flex items-center p-4 bg-white rounded-xl cursor-pointer hover:bg-gray-50 border-2 border-maycast-border hover:border-maycast-primary transition-all">
                  <input
                    type="radio"
                    name="quality"
                    value="stability"
                    checked={settings.qualityPreset === 'stability'}
                    onChange={(e) => setSettings({ ...settings, qualityPreset: e.target.value as QualityPreset })}
                    className="mr-3 w-4 h-4 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">Stability Mode（安定優先）</p>
                    <p className="text-sm text-gray-600">720p / 2Mbps / 1秒ごとキーフレーム</p>
                  </div>
                </label>

                <label className="flex items-center p-4 bg-white rounded-xl cursor-pointer hover:bg-gray-50 border-2 border-maycast-border hover:border-maycast-primary transition-all">
                  <input
                    type="radio"
                    name="quality"
                    value="quality"
                    checked={settings.qualityPreset === 'quality'}
                    onChange={(e) => setSettings({ ...settings, qualityPreset: e.target.value as QualityPreset })}
                    className="mr-3 w-4 h-4 cursor-pointer"
                  />
                  <div className="flex-1">
                    <p className="font-bold text-gray-900">Quality Mode（高画質）</p>
                    <p className="text-sm text-gray-600">1080p / 5Mbps / 3秒ごとキーフレーム</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-4">
              <button
                onClick={() => setShowSettingsModal(false)}
                className="flex-1 py-3 px-6 bg-white hover:bg-gray-100 rounded-xl font-bold transition-all border-2 border-maycast-border text-gray-900 cursor-pointer"
              >
                キャンセル
              </button>
              <button
                onClick={handleSaveSettings}
                className="flex-1 py-3 px-6 bg-maycast-primary hover:bg-maycast-primary/80 rounded-xl font-bold transition-all shadow-lg text-white cursor-pointer"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recovery Modal */}
      {showRecoveryModal && recoverySession && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
          onClick={() => setShowRecoveryModal(false)}
        >
          <div
            className="bg-maycast-panel/95 backdrop-blur-xl border border-maycast-border/50 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <ArrowPathIcon className="w-7 h-7 text-maycast-primary" />
              <h2 className="text-2xl font-bold text-maycast-text">セッションの復元</h2>
            </div>
            <p className="text-maycast-subtext mb-6">
              前回の収録が正常に完了していません。復元しますか？
            </p>

            <div className="bg-white p-4 rounded-xl mb-6 border-2 border-maycast-border">
              <p className="text-sm text-gray-600 font-semibold mb-2">セッション情報</p>
              <p className="text-lg text-gray-900 font-bold mt-2">
                {new Date(recoverySession.startTime).toLocaleString('ja-JP')}
              </p>
              <p className="text-sm text-gray-700 mt-2">
                チャンク数: {recoverySession.totalChunks} / サイズ: {(recoverySession.totalSize / 1024 / 1024).toFixed(2)} MB
              </p>
              {recoverySession.endTime && (
                <p className="text-sm text-gray-700 mt-1">
                  録画時間: {formatElapsedTime(Math.floor((recoverySession.endTime - recoverySession.startTime) / 1000))}
                </p>
              )}
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleRecoverSession}
                className="flex-1 py-3 px-6 bg-maycast-primary hover:bg-maycast-primary/80 rounded-xl font-bold transition-all shadow-lg flex items-center justify-center gap-2 text-white cursor-pointer"
              >
                <CheckIcon className="w-5 h-5" />
                復元する
              </button>
              <button
                onClick={handleDiscardRecovery}
                className="flex-1 py-3 px-6 bg-white hover:bg-gray-100 rounded-xl font-bold transition-all border-2 border-maycast-rec flex items-center justify-center gap-2 text-gray-900 cursor-pointer"
              >
                <TrashIcon className="w-5 h-5" />
                破棄する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Saved Sessions Modal */}
      {showSessionsModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
          onClick={() => setShowSessionsModal(false)}
        >
          <div
            className="bg-maycast-panel/95 backdrop-blur-xl border border-maycast-border/50 rounded-2xl p-8 max-w-3xl w-full mx-4 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <ServerStackIcon className="w-7 h-7 text-maycast-primary" />
                <h2 className="text-2xl font-bold text-maycast-text">保存済みセッション <span className="text-maycast-primary">({savedSessions.length})</span></h2>
              </div>
              {savedSessions.length > 0 && (
                <button
                  onClick={clearAllSessions}
                  className="px-4 py-2 bg-maycast-rec/20 hover:bg-maycast-rec/30 rounded-xl text-sm font-semibold transition-all border border-maycast-rec/50 flex items-center gap-2 text-white cursor-pointer"
                >
                  <TrashIcon className="w-4 h-4" />
                  すべて削除
                </button>
              )}
            </div>

            {savedSessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-maycast-subtext">
                <ServerStackIcon className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg">保存済みセッションはありません</p>
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto pr-2">
                {savedSessions.map((session) => {
                  const startDate = session.startTime ? new Date(session.startTime) : null
                  const isValidStart = startDate && !isNaN(startDate.getTime())

                  return (
                    <div key={session.sessionId} className="bg-maycast-panel/30 backdrop-blur-sm p-4 rounded-xl flex items-center justify-between border border-maycast-border/40 hover:border-maycast-border/60 transition-all">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <p className="text-sm text-maycast-text font-medium">
                            {isValidStart ? startDate.toLocaleString('ja-JP') : 'Invalid Date'}
                          </p>
                          {session.isCompleted ? (
                            <span className="flex items-center gap-1 px-2 py-1 bg-maycast-safe/20 text-maycast-safe text-xs font-semibold rounded-lg border border-maycast-safe/30">
                              <CheckIcon className="w-3 h-3" />
                              完了
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 px-2 py-1 bg-yellow-500/20 text-yellow-300 text-xs font-semibold rounded-lg border border-yellow-500/30">
                              <VideoCameraIcon className="w-3 h-3" />
                              録画中
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-maycast-subtext">
                          <span className="flex items-center gap-1">
                            <ServerStackIcon className="w-3 h-3" />
                            {session.totalChunks || 0} chunks
                          </span>
                          <span>{((session.totalSize || 0) / 1024 / 1024).toFixed(2)} MB</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => downloadSessionById(session.sessionId)}
                          disabled={downloadProgress.isDownloading}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                            downloadProgress.isDownloading
                              ? 'bg-gray-600 cursor-not-allowed opacity-50'
                              : 'bg-maycast-safe hover:bg-maycast-safe/80 shadow-lg cursor-pointer'
                          }`}
                          title="ダウンロード"
                        >
                          <ArrowDownTrayIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => deleteSession(session.sessionId)}
                          disabled={downloadProgress.isDownloading}
                          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                            downloadProgress.isDownloading
                              ? 'bg-gray-600 cursor-not-allowed opacity-50'
                              : 'bg-maycast-rec/20 hover:bg-maycast-rec/30 border border-maycast-rec/50 cursor-pointer'
                          }`}
                          title="削除"
                        >
                          <TrashIcon className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

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
          {screenState === 'standby' && (
            <div className="flex items-center gap-2 px-4 py-2 bg-maycast-primary/20 backdrop-blur-sm rounded-full border border-maycast-primary/30">
              <div className="w-2 h-2 bg-maycast-primary rounded-full" />
              <span className="text-maycast-primary/80 font-semibold">待機中</span>
            </div>
          )}
          {screenState === 'recording' && (
            <div className="flex items-center gap-2 px-4 py-2 bg-maycast-rec/20 backdrop-blur-sm rounded-full border border-maycast-rec/30">
              <div className="relative">
                <div className="w-2 h-2 bg-maycast-rec rounded-full animate-pulse" />
                <div className="absolute inset-0 w-2 h-2 bg-maycast-rec rounded-full animate-ping opacity-75" />
              </div>
              <span className="text-maycast-rec/80 font-semibold">録画中</span>
            </div>
          )}
          {screenState === 'completed' && (
            <div className="flex items-center gap-2 px-4 py-2 bg-maycast-safe/20 backdrop-blur-sm rounded-full border border-maycast-safe/30">
              <CheckIcon className="w-4 h-4 text-maycast-safe" />
              <span className="text-maycast-safe/80 font-semibold">録画完了</span>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-maycast-rec/20 border border-maycast-rec/50 text-maycast-text p-4 rounded-xl mb-6">
            <p className="font-semibold text-maycast-rec">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {/* Camera Preview */}
        <div className="mb-10">
          <div className="relative bg-black rounded-3xl overflow-hidden shadow-2xl border border-maycast-border/50" style={{ aspectRatio: '16/9' }}>
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              muted
              playsInline
            />
            {isRecording && (
              <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
                <div className="flex items-center gap-3 bg-maycast-rec bg-opacity-95 backdrop-blur-sm px-5 py-3 rounded-full shadow-2xl border-2 border-maycast-rec/80">
                  <div className="relative">
                    <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                    <div className="absolute inset-0 w-3 h-3 bg-white rounded-full animate-ping opacity-75" />
                  </div>
                  <VideoCameraIcon className="w-5 h-5 text-white" />
                  <span className="text-base font-bold tracking-wider text-white">REC</span>
                </div>
                <div className="bg-black/70 backdrop-blur-md px-7 py-3 rounded-2xl shadow-2xl border border-white/30">
                  <span className="text-3xl font-mono font-bold text-white tabular-nums">{formatElapsedTime(elapsedTime)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recording Status */}
        {screenState === 'recording' && (
          <div className="bg-maycast-safe/30 backdrop-blur-md border border-maycast-safe/50 p-5 rounded-2xl mb-8 shadow-xl">
            <div className="flex items-center justify-center gap-3">
              <div className="relative">
                <div className="w-4 h-4 bg-maycast-safe rounded-full animate-pulse" />
                <div className="absolute inset-0 w-4 h-4 bg-maycast-safe rounded-full animate-ping opacity-75" />
              </div>
              <ServerStackIcon className="w-6 h-6 text-maycast-safe/80" />
              <p className="text-white font-semibold text-lg">ローカルに保存中 (OPFS) - {savedChunks} chunks</p>
            </div>
          </div>
        )}

        {/* Stats Display */}
        {screenState !== 'standby' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-maycast-primary/20 backdrop-blur-md p-6 rounded-2xl border border-maycast-primary/30 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <VideoCameraIcon className="w-5 h-5 text-maycast-primary" />
                <p className="text-maycast-primary/80 text-sm font-semibold">Video Chunks</p>
              </div>
              <p className="text-4xl font-bold text-maycast-text">{stats.videoChunks}</p>
            </div>
            <div className="bg-maycast-rust/20 backdrop-blur-md p-6 rounded-2xl border border-maycast-rust/30 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <MicrophoneIcon className="w-5 h-5 text-maycast-rust" />
                <p className="text-maycast-rust/80 text-sm font-semibold">Audio Chunks</p>
              </div>
              <p className="text-4xl font-bold text-maycast-text">{stats.audioChunks}</p>
            </div>
            <div className="bg-maycast-safe/20 backdrop-blur-md p-6 rounded-2xl border border-maycast-safe/30 shadow-xl">
              <div className="flex items-center gap-2 mb-3">
                <ServerStackIcon className="w-5 h-5 text-maycast-safe" />
                <p className="text-maycast-safe/80 text-sm font-semibold">Saved to OPFS</p>
              </div>
              <p className="text-4xl font-bold text-maycast-text">{savedChunks}</p>
            </div>
            <div className="bg-maycast-primary/20 backdrop-blur-md p-6 rounded-2xl border border-maycast-primary/30 shadow-xl">
              <p className="text-maycast-primary/80 text-sm font-semibold mb-3">Total Size</p>
              <p className="text-4xl font-bold text-maycast-text">{(stats.totalSize / 1024 / 1024).toFixed(2)} <span className="text-2xl text-maycast-subtext">MB</span></p>
            </div>
          </div>
        )}

        {/* Control Buttons */}
        <div className="space-y-5 mb-8">
          {/* Standby / Recording Screen */}
          {screenState !== 'completed' && (
            <button
              onClick={handleStartStop}
              disabled={!wasmInitialized}
              className={`w-full py-6 px-8 rounded-2xl font-bold text-xl transition-all shadow-2xl transform hover:scale-[1.02] flex items-center justify-center gap-3 ${
                isRecording
                  ? 'bg-maycast-rec hover:bg-maycast-rec/80 cursor-pointer text-white'
                  : wasmInitialized
                  ? 'bg-transparent border-2 border-maycast-text hover:bg-maycast-text/10 cursor-pointer text-maycast-text'
                  : 'bg-gray-600 cursor-not-allowed opacity-50 text-white'
              }`}
            >
              {isRecording ? (
                <>
                  <StopIcon className="w-7 h-7" />
                  録画を停止
                </>
              ) : (
                <>
                  <PlayIcon className="w-7 h-7" />
                  録画を開始
                </>
              )}
            </button>
          )}

          {/* Completed Screen */}
          {screenState === 'completed' && savedChunks > 0 && (
            <div className="space-y-5">
              <div className="bg-maycast-safe/30 backdrop-blur-md p-6 rounded-2xl border border-maycast-safe/50 shadow-xl">
                <div className="flex items-center justify-center gap-3">
                  <div className="p-2 bg-maycast-safe/20 rounded-full">
                    <CheckIcon className="w-6 h-6 text-maycast-safe" />
                  </div>
                  <p className="text-center text-white font-semibold text-lg">
                    録画が完了しました！{savedChunks}個のチャンクがOPFSに保存されています。
                  </p>
                </div>
              </div>

              <button
                onClick={downloadRecording}
                disabled={downloadProgress.isDownloading}
                className={`w-full py-5 px-8 rounded-2xl font-bold text-xl transition-all shadow-2xl transform hover:scale-[1.02] flex items-center justify-center gap-3 ${
                  downloadProgress.isDownloading
                    ? 'bg-gray-600 cursor-not-allowed opacity-50'
                    : 'bg-maycast-safe hover:bg-maycast-safe/80 cursor-pointer'
                }`}
              >
                {downloadProgress.isDownloading ? (
                  <>
                    <ArrowPathIcon className="w-6 h-6 animate-spin" />
                    ダウンロード中... {downloadProgress.current}/{downloadProgress.total}
                  </>
                ) : (
                  <>
                    <ArrowDownTrayIcon className="w-6 h-6" />
                    MP4をダウンロード
                  </>
                )}
              </button>

              {downloadProgress.isDownloading && (
                <div className="w-full bg-maycast-panel/50 rounded-full h-4 overflow-hidden shadow-inner">
                  <div
                    className="bg-maycast-safe h-4 rounded-full transition-all duration-300 shadow-lg relative overflow-hidden"
                    style={{
                      width: `${(downloadProgress.current / downloadProgress.total) * 100}%`
                    }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={handleNewRecording}
                  className="py-4 px-6 bg-maycast-primary hover:bg-maycast-primary/80 rounded-2xl font-bold transition-all shadow-lg transform hover:scale-[1.02] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <PlayIcon className="w-5 h-5" />
                  新しい録画
                </button>
                <button
                  onClick={handleDiscardRecording}
                  className="py-4 px-6 bg-maycast-rec/20 hover:bg-maycast-rec/30 rounded-2xl font-bold transition-all border border-maycast-rec/50 transform hover:scale-[1.02] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <TrashIcon className="w-5 h-5" />
                  破棄
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
