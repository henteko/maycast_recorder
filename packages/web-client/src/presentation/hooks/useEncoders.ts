/**
 * useEncoders Hook
 *
 * AudioEncoderとWASM Muxerの管理を担当
 *
 * ## 現在の設計
 * - IStorageStrategyを使用してチャンク保存を抽象化
 * - WASMベースのMuxideMuxerと密結合
 * - リアルタイムエンコーディング処理
 * - オーディオ（AAC）をfMP4にmux
 */

import { useRef, useCallback } from 'react'
import type { ChunkStats } from '../../types/webcodecs'
import type { IStorageStrategy } from '../../storage-strategies/IStorageStrategy'
import type { RecordingId } from '@maycast/common-types'

interface UseEncodersProps {
  wasmInitialized: boolean
  storageStrategy: IStorageStrategy
  onStatsUpdate: (updater: (prev: ChunkStats) => ChunkStats) => void
  onChunkSaved: () => void
}

export const useEncoders = ({ wasmInitialized, storageStrategy, onStatsUpdate, onChunkSaved }: UseEncodersProps) => {
  const audioEncoderRef = useRef<AudioEncoder | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const muxerRef = useRef<any | null>(null)
  const initSegmentRef = useRef<Uint8Array | null>(null)
  const audioConfigRef = useRef<Uint8Array | null>(null)
  const audioSettingsRef = useRef<{ sampleRate: number; channelCount: number } | null>(null)
  const activeStreamRef = useRef<MediaStream | null>(null)
  const baseTimestampRef = useRef<number | null>(null)
  const recordingIdRef = useRef<RecordingId | null>(null)

  const initializeMuxerWithConfigs = useCallback(async () => {
    // 既にMuxerが初期化されている場合はスキップ
    if (muxerRef.current) {
      console.log('⏭️ Muxer already initialized, skipping');
      return;
    }

    // オーディオ設定が必要
    if (!audioSettingsRef.current || !wasmInitialized || !activeStreamRef.current) {
      console.log('⏳ Waiting for audio settings...', {
        audioSettings: !!audioSettingsRef.current,
        wasm: wasmInitialized,
        stream: !!activeStreamRef.current
      })
      return
    }

    const audioSettings = audioSettingsRef.current

    console.log('🎤 Initializing MuxideMuxer (audio-only) with config:', {
      audioConfig: audioConfigRef.current?.length,
      audioSettings,
    })

    // @ts-expect-error - Dynamic import from WASM
    const { MuxideMuxer } = await import('maycast-wasm-core')

    try {
      const muxer = MuxideMuxer.from_audio_only(
        audioSettings.sampleRate,
        audioSettings.channelCount,
        audioConfigRef.current || undefined
      )
      console.log('🎵 MuxideMuxer initialized (audio-only)')

      const initSegment = muxer.initialize()
      initSegmentRef.current = initSegment
      muxerRef.current = muxer
      console.log('✅ MuxideMuxer initialized, init segment size:', initSegment.length, 'bytes')

      if (recordingIdRef.current) {
        console.log('💾 [useEncoders] Saving init segment for recording:', recordingIdRef.current)
        await storageStrategy.saveInitSegment(recordingIdRef.current, initSegment)
        console.log('✅ [useEncoders] Init segment saved successfully')
      } else {
        console.warn('⚠️ [useEncoders] Recording ID not set, cannot save init segment')
      }
    } catch (err) {
      console.error('❌ Failed to initialize MuxideMuxer:', err)
    }
  }, [wasmInitialized, storageStrategy])

  const initializeEncoders = useCallback((activeStream: MediaStream) => {
    if (!activeStream || !wasmInitialized) return

    activeStreamRef.current = activeStream

    const audioTrack = activeStream.getAudioTracks()[0]
    const audioSettings = audioTrack?.getSettings()

    // オーディオ設定を保存（Muxer初期化時に使用）
    if (audioSettings?.sampleRate && audioSettings?.channelCount) {
      audioSettingsRef.current = {
        sampleRate: audioSettings.sampleRate,
        channelCount: audioSettings.channelCount
      }
    }

    console.log('🎤 Audio track settings:', audioSettings)

    // Initialize AudioEncoder
    const audioConfig = {
      codec: 'mp4a.40.2',
      sampleRate: audioSettings?.sampleRate || 48000,
      numberOfChannels: audioSettings?.channelCount || 1,
      bitrate: 128_000,
    }

    audioEncoderRef.current = new AudioEncoder({
      output: (chunk, metadata) => {
        // AudioSpecificConfigを取得（最初のチャンクのmetadataに含まれる）
        if (metadata?.decoderConfig?.description && !audioConfigRef.current) {
          audioConfigRef.current = new Uint8Array(metadata.decoderConfig.description as ArrayBuffer)
          console.log('✅ Audio decoder config captured:', audioConfigRef.current.length, 'bytes')
          // オーディオ設定が揃ったらMuxer初期化を試みる
          initializeMuxerWithConfigs()
        }

        if (baseTimestampRef.current === null) {
          baseTimestampRef.current = chunk.timestamp
          console.log('🎤 Base timestamp set (from audio):', chunk.timestamp)
        }

        // Muxerにオーディオを送信
        if (muxerRef.current && muxerRef.current.has_audio && muxerRef.current.has_audio()) {
          try {
            const relativeTimestamp = Math.max(0, chunk.timestamp - baseTimestampRef.current)
            const buffer = new Uint8Array(chunk.byteLength)
            chunk.copyTo(buffer)
            // duration is in microseconds from WebCodecs
            const duration = chunk.duration || 21333 // デフォルト: 1024 samples @ 48kHz ≈ 21.33ms
            muxerRef.current.push_audio(buffer, relativeTimestamp, duration)

            // 保留中のセグメントがあれば保存
            if (muxerRef.current.has_pending_segments() && recordingIdRef.current) {
              const segments = muxerRef.current.get_pending_segments()
              if (segments.length > 0) {
                storageStrategy.saveChunk(recordingIdRef.current, segments, relativeTimestamp).then((chunkId) => {
                  onChunkSaved()
                  console.log(`📦 fMP4 segment saved: #${chunkId}, ${segments.length} bytes`)
                }).catch((err: unknown) => {
                  console.error('❌ Failed to save chunk:', err)
                })
              }
            }
          } catch (err) {
            console.error('❌ MuxideMuxer push_audio error:', err)
          }
        }

        onStatsUpdate(prev => ({
          ...prev,
          audioChunks: prev.audioChunks + 1,
          totalSize: prev.totalSize + chunk.byteLength,
        }))

        // デバッグ出力を減らす（オーディオは頻繁に出力されるため）
        if (metadata?.decoderConfig?.description) {
          console.log(`🎤 AudioChunk (config): timestamp=${chunk.timestamp}µs, size=${chunk.byteLength}B`)
        }
      },
      error: (err) => {
        console.error('❌ AudioEncoder error:', err)
      },
    })

    audioEncoderRef.current.configure(audioConfig)
    console.log('✅ AudioEncoder configured:', audioConfig)
  }, [wasmInitialized, initializeMuxerWithConfigs, storageStrategy, onStatsUpdate, onChunkSaved])

  const closeEncoders = useCallback(async () => {
    if (audioEncoderRef.current) {
      try {
        if (audioEncoderRef.current.state !== 'closed') {
          await audioEncoderRef.current.flush()
          audioEncoderRef.current.close()
        }
      } catch (err) {
        console.warn('Failed to close audio encoder:', err)
      }
      audioEncoderRef.current = null
    }
  }, [])

  const resetEncoders = useCallback(() => {
    audioConfigRef.current = null
    audioSettingsRef.current = null
    muxerRef.current = null
    initSegmentRef.current = null
    activeStreamRef.current = null
    baseTimestampRef.current = null
    recordingIdRef.current = null
  }, [])

  const setRecordingId = useCallback((recordingId: RecordingId) => {
    recordingIdRef.current = recordingId
  }, [])

  return {
    audioEncoderRef,
    initializeEncoders,
    closeEncoders,
    resetEncoders,
    setRecordingId,
  }
}
