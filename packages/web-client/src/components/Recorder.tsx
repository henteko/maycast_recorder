import { useRef, useState, useEffect } from 'react'
import { useMediaStream } from '../hooks/useMediaStream'
import type { ChunkStats } from '../types/webcodecs'

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

  const videoEncoderRef = useRef<VideoEncoder | null>(null)
  const audioEncoderRef = useRef<AudioEncoder | null>(null)
  const videoProcessorRef = useRef<MediaStreamTrackProcessor<VideoFrame> | null>(null)
  const audioProcessorRef = useRef<MediaStreamTrackProcessor<AudioData> | null>(null)
  const isRecordingRef = useRef<boolean>(false)

  // Update video preview when stream changes
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
      videoRef.current.play().catch(err => {
        console.error('Failed to play video preview:', err)
      })
    }
  }, [stream])

  const initializeEncoders = (activeStream: MediaStream) => {
    if (!activeStream) return

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
        const isKeyframe = chunk.type === 'key'

        setStats(prev => ({
          ...prev,
          videoChunks: prev.videoChunks + 1,
          keyframes: isKeyframe ? prev.keyframes + 1 : prev.keyframes,
          totalSize: prev.totalSize + chunk.byteLength,
        }))

        console.log(`📹 VideoChunk: type=${chunk.type}, timestamp=${chunk.timestamp}µs, size=${chunk.byteLength}B`, metadata)
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
        setStats(prev => ({
          ...prev,
          audioChunks: prev.audioChunks + 1,
          totalSize: prev.totalSize + chunk.byteLength,
        }))

        console.log(`🎤 AudioChunk: timestamp=${chunk.timestamp}µs, size=${chunk.byteLength}B`, metadata)
      },
      error: (err) => {
        console.error('❌ AudioEncoder error:', err)
      },
    })

    audioEncoderRef.current.configure(audioConfig)
    console.log('✅ AudioEncoder configured:', audioConfig)
  }

  const startRecording = async () => {
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
        <p className="text-gray-400 mb-8">Phase 1A-2: WebCodecs Camera Capture</p>

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
        <div className="grid grid-cols-4 gap-4 mb-6">
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
            <p className="text-gray-400 text-sm">Total Size</p>
            <p className="text-2xl font-bold">{(stats.totalSize / 1024).toFixed(1)} KB</p>
          </div>
        </div>

        {/* Control Button */}
        <button
          onClick={handleStartStop}
          className={`w-full py-4 px-6 rounded-lg font-semibold text-lg transition-colors ${
            isRecording
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isRecording ? '⏹️ Stop Recording' : '🎬 Start Recording'}
        </button>

        {/* Debug Info */}
        <div className="mt-6 bg-gray-800 p-4 rounded-lg">
          <p className="text-sm text-gray-400 mb-2">Debug Info:</p>
          <ul className="text-xs font-mono space-y-1">
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
