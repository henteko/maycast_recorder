import { useRef, useState, useEffect } from 'react'
import { useMediaStream } from '../hooks/useMediaStream'
import type { ChunkStats } from '../types/webcodecs'
import init, { Muxer } from 'maycast-wasm-core'

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
  const [fmp4Chunks, setFmp4Chunks] = useState<Uint8Array[]>([])
  const [wasmInitialized, setWasmInitialized] = useState(false)

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

  // Update video preview when stream changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(err => {
        console.error('Failed to play video preview:', err)
      })
    }
  }, [stream])

  const initializeMuxerWithConfigs = () => {
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
        if (muxerRef.current) {
          try {
            const fragment = muxerRef.current.push_video(buffer, relativeTimestamp, isKeyframe)
            if (fragment.length > 0) {
              setFmp4Chunks(prev => [...prev, fragment])
              console.log(`📦 fMP4 fragment generated: ${fragment.length} bytes`)
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
        if (muxerRef.current) {
          try {
            const fragment = muxerRef.current.push_audio(buffer, relativeTimestamp)
            if (fragment.length > 0) {
              setFmp4Chunks(prev => [...prev, fragment])
              console.log(`📦 fMP4 fragment generated: ${fragment.length} bytes`)
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
    // Reset data from previous recording
    setFmp4Chunks([])
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

    console.log('⏹️ Recording stopped')
    console.log('📊 Final stats:', stats)
    console.log('📦 fMP4 chunks:', fmp4Chunks.length)
  }

  const downloadRecording = () => {
    if (!initSegmentRef.current || fmp4Chunks.length === 0) {
      alert('No recording data available')
      return
    }

    // Calculate total size
    let totalSize = initSegmentRef.current.length
    fmp4Chunks.forEach(chunk => {
      totalSize += chunk.length
    })

    // Combine init segment and all chunks
    const combinedData = new Uint8Array(totalSize)
    let offset = 0

    // Copy init segment
    combinedData.set(initSegmentRef.current, offset)
    offset += initSegmentRef.current.length

    // Copy all chunks
    fmp4Chunks.forEach(chunk => {
      combinedData.set(chunk, offset)
      offset += chunk.length
    })

    // Create blob and download
    const blob = new Blob([combinedData], { type: 'video/mp4' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `recording-${Date.now()}.mp4`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    console.log('✅ Downloaded:', totalSize, 'bytes')
  }

  const downloadLatestChunk = () => {
    if (!initSegmentRef.current || fmp4Chunks.length === 0) {
      alert('No chunks available')
      return
    }

    const latestChunk = fmp4Chunks[fmp4Chunks.length - 1]
    const totalSize = initSegmentRef.current.length + latestChunk.length

    // Combine init segment and latest chunk
    const combinedData = new Uint8Array(totalSize)
    combinedData.set(initSegmentRef.current, 0)
    combinedData.set(latestChunk, initSegmentRef.current.length)

    // Create blob and download
    const blob = new Blob([combinedData], { type: 'video/mp4' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `chunk-${fmp4Chunks.length}-${Date.now()}.mp4`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    console.log('✅ Downloaded latest chunk:', totalSize, 'bytes')
  }

  const handleStartStop = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Maycast Recorder</h1>
        <p className="text-gray-400 mb-8">Phase 1A-4: WebCodecs + WASM Integration</p>

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
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 px-3 py-1 rounded-full">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                <span className="text-sm font-semibold">REC</span>
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
            <p className="text-gray-400 text-sm">fMP4 Chunks</p>
            <p className="text-2xl font-bold">{fmp4Chunks.length}</p>
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

          {fmp4Chunks.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={downloadRecording}
                className="py-3 px-6 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors"
              >
                📥 Download Full Recording
              </button>
              <button
                onClick={downloadLatestChunk}
                className="py-3 px-6 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold transition-colors"
              >
                📦 Download Latest Chunk
              </button>
            </div>
          )}
        </div>

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
          </ul>
        </div>
      </div>
    </div>
  )
}
