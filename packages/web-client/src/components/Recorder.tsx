import { useRef, useState, useEffect } from 'react'
import { useMediaStream } from '../hooks/useMediaStream'
import type { ChunkStats } from '../types/webcodecs'
import init, { Muxer } from 'maycast-wasm-core'
import { ChunkStorage, generateSessionId, listAllSessions } from '../storage/chunk-storage'
import type { SessionMetadata } from '../storage/types'

export const Recorder = () => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const { stream, error, startCapture, isCapturing } = useMediaStream()

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

  // Load saved sessions on mount
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const sessions = await listAllSessions()
        setSavedSessions(sessions)
        console.log('📂 Loaded saved sessions:', sessions.length)
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

    console.log('🎤 Audio track settings:', audioSettings)
    console.log('📹 Initializing Muxer with configs:', {
      videoConfig: videoConfigRef.current.length,
      audioConfig: audioConfigRef.current.length
    })

    // Initialize Muxer with codec configurations
    const muxer = Muxer.with_config(
      1280, // video_width
      720,  // video_height
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

    // Initialize VideoEncoder
    const videoConfig = {
      codec: 'avc1.42001f', // H.264 Baseline Profile Level 3.1
      width: 1280,
      height: 720,
      bitrate: 2_000_000, // 2 Mbps
      framerate: 30,
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

    // Reset data from previous recording
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

    let activeStream = stream

    if (!isCapturing) {
      activeStream = await startCapture()
    }

    if (!activeStream) {
      console.error('No stream available')
      return
    }

    initializeEncoders(activeStream)

    // Set recording state before starting processors
    setIsRecording(true)
    isRecordingRef.current = true
    setRecordingStartTime(Date.now())

    // Process video frames
    const videoTrack = activeStream.getVideoTracks()[0]
    if (videoTrack) {
      // @ts-expect-error - MediaStreamTrackProcessor is experimental
      videoProcessorRef.current = new MediaStreamTrackProcessor({ track: videoTrack })
      const reader = videoProcessorRef.current.readable.getReader()

      let frameCount = 0
      const processVideoFrame = async () => {
        while (isRecordingRef.current) {
          const result = await reader.read()
          if (result.done) break

          const frame = result.value
          if (videoEncoderRef.current && videoEncoderRef.current.state === 'configured') {
            frameCount++
            // Force keyframe every 30 frames (1 second at 30fps)
            const needsKeyframe = frameCount % 30 === 0

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

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Maycast Recorder</h1>
        <p className="text-gray-400 mb-8">Phase 1A-5: OPFS Persistent Storage</p>

        {error && (
          <div className="bg-red-600 text-white p-4 rounded-lg mb-6">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {/* Camera Preview */}
        <div className="mb-6">
          <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              muted
              playsInline
            />
            {isRecording && (
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
                <div className="flex items-center gap-2 bg-red-600 px-3 py-1 rounded-full">
                  <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                  <span className="text-sm font-semibold">REC</span>
                </div>
                <div className="bg-black bg-opacity-70 px-4 py-2 rounded-lg">
                  <span className="text-2xl font-mono font-bold">{formatElapsedTime(elapsedTime)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats Display */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Video Chunks</p>
            <p className="text-2xl font-bold">{stats.videoChunks}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Audio Chunks</p>
            <p className="text-2xl font-bold">{stats.audioChunks}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Keyframes</p>
            <p className="text-2xl font-bold">{stats.keyframes}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">💾 Saved to OPFS</p>
            <p className="text-2xl font-bold">{savedChunks}</p>
          </div>
          <div className="bg-gray-800 p-4 rounded-lg">
            <p className="text-gray-400 text-sm">Total Size</p>
            <p className="text-2xl font-bold">{(stats.totalSize / 1024).toFixed(1)} KB</p>
          </div>
        </div>

        {/* Control Buttons */}
        <div className="space-y-4 mb-6">
          <button
            onClick={handleStartStop}
            disabled={!wasmInitialized}
            className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-colors ${
              isRecording
                ? 'bg-red-600 hover:bg-red-700'
                : wasmInitialized
                ? 'bg-blue-600 hover:bg-blue-700'
                : 'bg-gray-600 cursor-not-allowed'
            }`}
          >
            {isRecording ? '⏹️ Stop Recording' : '🎬 Start Recording'}
          </button>

          {savedChunks > 0 && (
            <div className="space-y-2">
              <button
                onClick={downloadRecording}
                disabled={downloadProgress.isDownloading}
                className={`w-full py-3 px-6 rounded-lg font-semibold transition-colors ${
                  downloadProgress.isDownloading
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {downloadProgress.isDownloading
                  ? `⏳ Downloading... ${downloadProgress.current}/${downloadProgress.total}`
                  : `📥 Download Full Recording (${savedChunks} chunks saved in OPFS)`}
              </button>

              {downloadProgress.isDownloading && (
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div
                    className="bg-green-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(downloadProgress.current / downloadProgress.total) * 100}%`
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Saved Sessions */}
        {savedSessions.length > 0 && (
          <div className="bg-gray-800 p-4 rounded-lg mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-400">💾 保存済みセッション ({savedSessions.length}):</p>
              <button
                onClick={clearAllSessions}
                className="px-3 py-1 bg-red-600 hover:bg-red-700 rounded text-xs transition-colors"
              >
                🗑️ すべて削除
              </button>
            </div>
            <div className="space-y-2">
              {savedSessions.map((session) => {
                const startDate = session.startTime ? new Date(session.startTime) : null
                const endDate = session.endTime ? new Date(session.endTime) : null
                const isValidStart = startDate && !isNaN(startDate.getTime())
                const isValidEnd = endDate && !isNaN(endDate.getTime())

                return (
                  <div key={session.sessionId} className="bg-gray-700 p-3 rounded flex items-center justify-between">
                    <div className="flex-1">
                      <p className="text-xs font-mono text-gray-400">{session.sessionId}</p>
                      <p className="text-sm mt-1">
                        {isValidStart ? startDate.toLocaleString('ja-JP') : '⚠️ Invalid Date'}
                        {isValidEnd && ` - ${endDate.toLocaleString('ja-JP')}`}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        チャンク数: {session.totalChunks || 0} / サイズ: {((session.totalSize || 0) / 1024 / 1024).toFixed(2)} MB
                        {session.isCompleted ? ' / ✅ 完了' : ' / ⏸️ 録画中'}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => downloadSessionById(session.sessionId)}
                        disabled={downloadProgress.isDownloading}
                        className={`px-3 py-1 rounded text-sm transition-colors ${
                          downloadProgress.isDownloading
                            ? 'bg-gray-600 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-700'
                        }`}
                      >
                        📥
                      </button>
                      <button
                        onClick={() => deleteSession(session.sessionId)}
                        disabled={downloadProgress.isDownloading}
                        className={`px-3 py-1 rounded text-sm transition-colors ${
                          downloadProgress.isDownloading
                            ? 'bg-gray-600 cursor-not-allowed'
                            : 'bg-red-600 hover:bg-red-700'
                        }`}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Debug Info */}
        <div className="bg-gray-800 p-4 rounded-lg">
          <p className="text-sm text-gray-400 mb-2">Debug Info:</p>
          <ul className="text-xs font-mono space-y-1">
            <li>WASM: {wasmInitialized ? '✅' : '❌'}</li>
            <li>Muxer: {muxerRef.current ? '✅' : '❌'}</li>
            <li>Init Segment: {initSegmentRef.current ? `✅ (${initSegmentRef.current.length} bytes)` : '❌'}</li>
            <li>Stream Active: {isCapturing ? '✅' : '❌'}</li>
            <li>Recording: {isRecording ? '✅' : '❌'}</li>
            <li>Video Encoder: {videoEncoderRef.current?.state || 'Not initialized'}</li>
            <li>Audio Encoder: {audioEncoderRef.current?.state || 'Not initialized'}</li>
            <li>Session ID: {sessionIdRef.current || 'None'}</li>
            <li>OPFS Storage: {chunkStorageRef.current ? '✅' : '❌'}</li>
            <li>Saved Chunks: {savedChunks}</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
