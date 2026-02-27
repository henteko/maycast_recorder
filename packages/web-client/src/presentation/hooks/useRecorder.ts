/**
 * useRecorder Hook
 *
 * 録画セッションのライフサイクル管理を担当
 *
 * ## 現在の設計
 * - IStorageStrategyを使用してチャンク保存を抽象化
 * - AudioEncoderとの密結合
 */

import { useRef, useState, useCallback } from 'react';
import { generateRecordingId } from '../../infrastructure/storage/chunk-storage';
import type { ChunkStats } from '../../types/webcodecs';
import type { RecorderSettings } from '../../types/settings';
import type { MediaStreamOptions } from './useMediaStream';
import type { RecordingId } from '@maycast/common-types';
import type { IStorageStrategy } from '../../storage-strategies/IStorageStrategy';

type ScreenState = 'standby' | 'recording' | 'completed'

interface UseRecorderProps {
  audioEncoderRef: React.RefObject<AudioEncoder | null>
  storageStrategy: IStorageStrategy
  initializeEncoders: (stream: MediaStream) => void
  closeEncoders: () => Promise<void>
  resetEncoders: () => void
  setRecordingId: (recordingId: RecordingId) => void
  startCapture: (options?: MediaStreamOptions) => Promise<MediaStream | null>
  settings: RecorderSettings
  onSessionComplete?: () => void | Promise<void>
  /** When true, automatically reset to standby after stopping instead of going to completed */
  autoResetToStandby?: boolean
}

export const useRecorder = ({
  audioEncoderRef,
  storageStrategy,
  initializeEncoders,
  closeEncoders,
  resetEncoders,
  setRecordingId,
  startCapture,
  settings,
  onSessionComplete,
  autoResetToStandby = false,
}: UseRecorderProps) => {
  const [screenState, setScreenState] = useState<ScreenState>('standby')
  const [isRecording, setIsRecording] = useState(false)
  const [stats, setStats] = useState<ChunkStats>({
    audioChunks: 0,
    totalSize: 0,
  })
  const [savedChunks, setSavedChunks] = useState(0)
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null)

  const isRecordingRef = useRef<boolean>(false);
  const recordingIdRef = useRef<RecordingId | null>(null);
  // @ts-expect-error - MediaStreamTrackProcessor is experimental
  const audioProcessorRef = useRef<MediaStreamTrackProcessor<AudioData> | null>(null);
  const startRecording = useCallback(async () => {
    await closeEncoders();

    const recordingId = generateRecordingId();
    recordingIdRef.current = recordingId;

    try {
      await storageStrategy.initSession(recordingId)
    } catch (err) {
      console.error('❌ Failed to initialize session:', err)
      alert('Failed to initialize storage. Please check browser permissions.')
      return
    }

    setSavedChunks(0)
    setStats({
      audioChunks: 0,
      totalSize: 0,
    })
    resetEncoders()

    // resetEncoders()の後にrecordingIdを設定（resetEncodersがrecordingIdをnullにするため）
    setRecordingId(recordingId)

    console.log('🎬 Starting recording with settings:', settings)

    const activeStream = await startCapture({
      audioDeviceId: settings.audioDeviceId,
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
    storageStrategy,
    setRecordingId,
    resetEncoders,
    settings,
    startCapture,
    initializeEncoders,
    audioEncoderRef,
  ])

  const stopRecording = useCallback(async () => {
    setIsRecording(false)
    isRecordingRef.current = false
    setRecordingStartTime(null)

    await closeEncoders()

    if (recordingIdRef.current) {
      await storageStrategy.completeSession(recordingIdRef.current)
    }

    if (onSessionComplete) {
      await onSessionComplete()
    }

    if (autoResetToStandby) {
      setScreenState('standby')
      setSavedChunks(0)
      setStats({
        audioChunks: 0,
        totalSize: 0,
      })
    } else {
      setScreenState('completed')
    }

    console.log('⏹️ Recording stopped')
  }, [closeEncoders, storageStrategy, onSessionComplete, autoResetToStandby])

  const handleNewRecording = useCallback(() => {
    setScreenState('standby')
    setSavedChunks(0)
    setStats({
      audioChunks: 0,
      totalSize: 0,
    })
  }, [])

  const handleDiscardRecording = useCallback(async () => {
    if (!recordingIdRef.current) return

    if (!confirm('Delete this recording? This action cannot be undone.')) {
      return
    }

    try {
      // Note: ChunkStorage is imported directly for deletion
      // This should be refactored to use storage strategy in the future
      const { ChunkStorage } = await import('../../infrastructure/storage/chunk-storage')
      const storage = new ChunkStorage(recordingIdRef.current)
      await storage.deleteSession()
      if (onSessionComplete) {
        await onSessionComplete()
      }
      setScreenState('standby')
      console.log('🗑️ Recording discarded:', recordingIdRef.current)
    } catch (err) {
      console.error('❌ Failed to discard recording:', err)
      alert('Failed to delete recording')
    }
  }, [onSessionComplete])

  return {
    screenState,
    isRecording,
    stats,
    savedChunks,
    recordingStartTime,
    recordingIdRef,
    startRecording,
    stopRecording,
    handleNewRecording,
    handleDiscardRecording,
    setStats,
    setSavedChunks,
  }
}
