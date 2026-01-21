import { useRef, useState, useCallback } from 'react'
import { ChunkStorage, generateSessionId } from '../storage/chunk-storage'
import type { ChunkStats } from '../types/webcodecs'
import type { RecorderSettings } from '../types/settings'
import { QUALITY_PRESETS } from '../types/settings'
import type { MediaStreamOptions } from './useMediaStream'

type ScreenState = 'standby' | 'recording' | 'completed'

interface UseRecorderProps {
  videoEncoderRef: React.RefObject<VideoEncoder | null>
  audioEncoderRef: React.RefObject<AudioEncoder | null>
  chunkStorageRef: React.RefObject<ChunkStorage | null>
  initializeEncoders: (stream: MediaStream) => void
  closeEncoders: () => Promise<void>
  resetEncoders: () => void
  startCapture: (options?: MediaStreamOptions) => Promise<MediaStream | null>
  settings: RecorderSettings
  onSessionComplete: () => Promise<void>
}

export const useRecorder = ({
  videoEncoderRef,
  audioEncoderRef,
  chunkStorageRef,
  initializeEncoders,
  closeEncoders,
  resetEncoders,
  startCapture,
  settings,
  onSessionComplete,
}: UseRecorderProps) => {
  const [screenState, setScreenState] = useState<ScreenState>('standby')
  const [isRecording, setIsRecording] = useState(false)
  const [stats, setStats] = useState<ChunkStats>({
    videoChunks: 0,
    audioChunks: 0,
    keyframes: 0,
    totalSize: 0,
  })
  const [savedChunks, setSavedChunks] = useState(0)
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null)

  const isRecordingRef = useRef<boolean>(false)
  const sessionIdRef = useRef<string | null>(null)
  // @ts-expect-error - MediaStreamTrackProcessor is experimental
  const videoProcessorRef = useRef<MediaStreamTrackProcessor<VideoFrame> | null>(null)
  // @ts-expect-error - MediaStreamTrackProcessor is experimental
  const audioProcessorRef = useRef<MediaStreamTrackProcessor<AudioData> | null>(null)

  const startRecording = useCallback(async () => {
    await closeEncoders()

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

    setSavedChunks(0)
    setStats({
      videoChunks: 0,
      audioChunks: 0,
      keyframes: 0,
      totalSize: 0,
    })
    resetEncoders()

    console.log('🎬 Starting recording with settings:', settings)

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
      const processVideoFrame = async () => {
        while (isRecordingRef.current) {
          const result = await reader.read()
          if (result.done) break

          const frame = result.value
          if (videoEncoderRef.current && videoEncoderRef.current.state === 'configured') {
            frameCount++
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
  }, [
    closeEncoders,
    chunkStorageRef,
    resetEncoders,
    settings,
    startCapture,
    initializeEncoders,
    videoEncoderRef,
    audioEncoderRef,
  ])

  const stopRecording = useCallback(async () => {
    setIsRecording(false)
    isRecordingRef.current = false
    setRecordingStartTime(null)

    await closeEncoders()

    if (chunkStorageRef.current) {
      await chunkStorageRef.current.completeSession()
    }

    await onSessionComplete()

    setScreenState('completed')

    console.log('⏹️ Recording stopped')
    console.log('📊 Final stats:', stats)
    console.log('💾 Saved chunks:', savedChunks)
  }, [closeEncoders, chunkStorageRef, onSessionComplete, stats, savedChunks])

  const handleNewRecording = useCallback(() => {
    setScreenState('standby')
    setSavedChunks(0)
    setStats({
      videoChunks: 0,
      audioChunks: 0,
      keyframes: 0,
      totalSize: 0,
    })
  }, [])

  const handleDiscardRecording = useCallback(async () => {
    if (!sessionIdRef.current) return

    if (!confirm('この録画を削除しますか？この操作は取り消せません。')) {
      return
    }

    try {
      const storage = new ChunkStorage(sessionIdRef.current)
      await storage.deleteSession()
      await onSessionComplete()
      setScreenState('standby')
      console.log('🗑️ Recording discarded:', sessionIdRef.current)
    } catch (err) {
      console.error('❌ Failed to discard recording:', err)
      alert('録画の削除に失敗しました')
    }
  }, [onSessionComplete])

  return {
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
  }
}
