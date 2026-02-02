/**
 * useEncoders Hook
 *
 * VideoEncoder/AudioEncoderとWASM Muxerの管理を担当
 *
 * ## 現在の設計
 * - IStorageStrategyを使用してチャンク保存を抽象化
 * - WASMベースのMuxideMuxerと密結合
 * - リアルタイムエンコーディング処理
 * - ビデオ（H.264）とオーディオ（AAC）の両方をfMP4にmux
 *
 * ## 将来のリファクタリング候補
 * - TODO: SaveChunkUseCaseの使用を検討（ただしリアルタイム性の考慮が必要）
 * - TODO: エンコーダー設定のValue Objectを検討
 * - TODO: Muxer管理の分離を検討
 *
 * NOTE: エンコーディングはリアルタイムで行われ、パフォーマンスが重要。
 *       Use Caseの導入により、オーバーヘッドが発生する可能性があるため慎重に検討。
 */

import { useRef, useCallback } from 'react'
import type { ChunkStats } from '../../types/webcodecs'
import { QUALITY_PRESETS } from '../../types/settings'
import type { RecorderSettings } from '../../types/settings'
import type { IStorageStrategy } from '../../storage-strategies/IStorageStrategy'
import type { RecordingId } from '@maycast/common-types'

interface UseEncodersProps {
  wasmInitialized: boolean
  settings: RecorderSettings
  storageStrategy: IStorageStrategy
  onStatsUpdate: (updater: (prev: ChunkStats) => ChunkStats) => void
  onChunkSaved: () => void
}

export const useEncoders = ({ wasmInitialized, settings, storageStrategy, onStatsUpdate, onChunkSaved }: UseEncodersProps) => {
  const videoEncoderRef = useRef<VideoEncoder | null>(null)
  const audioEncoderRef = useRef<AudioEncoder | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const muxerRef = useRef<any | null>(null)
  const initSegmentRef = useRef<Uint8Array | null>(null)
  const videoConfigRef = useRef<Uint8Array | null>(null)
  const audioConfigRef = useRef<Uint8Array | null>(null)
  const audioSettingsRef = useRef<{ sampleRate: number; channelCount: number } | null>(null)
  const activeStreamRef = useRef<MediaStream | null>(null)
  const baseVideoTimestampRef = useRef<number | null>(null)
  const baseAudioTimestampRef = useRef<number | null>(null)
  const recordingIdRef = useRef<RecordingId | null>(null)

  const initializeMuxerWithConfigs = useCallback(async () => {
    // 既にMuxerが初期化されている場合はスキップ
    if (muxerRef.current) {
      console.log('⏭️ Muxer already initialized, skipping');
      return;
    }

    // ビデオ設定が必要、オーディオ設定はオプション
    if (!videoConfigRef.current || !wasmInitialized || !activeStreamRef.current) {
      console.log('⏳ Waiting for video codec config...', {
        video: !!videoConfigRef.current,
        wasm: wasmInitialized,
        stream: !!activeStreamRef.current
      })
      return
    }

    const qualityConfig = QUALITY_PRESETS[settings.qualityPreset]
    const audioSettings = audioSettingsRef.current

    console.log('📹 Initializing MuxideMuxer with config:', {
      videoConfig: videoConfigRef.current.length,
      audioConfig: audioConfigRef.current?.length,
      audioSettings,
      width: qualityConfig.width,
      height: qualityConfig.height,
      preset: settings.qualityPreset
    })

    // @ts-expect-error - Dynamic import from WASM
    const { MuxideMuxer } = await import('maycast-wasm-core')

    try {
      let muxer
      if (audioSettings) {
        // オーディオ設定がある場合はオーディオ付きで初期化
        muxer = MuxideMuxer.from_avcc_with_audio(
          qualityConfig.width,
          qualityConfig.height,
          videoConfigRef.current,
          audioSettings.sampleRate,
          audioSettings.channelCount,
          audioConfigRef.current || undefined // AudioSpecificConfig (optional)
        )
        console.log('🎵 MuxideMuxer initialized with audio support')
      } else {
        // ビデオのみで初期化
        muxer = MuxideMuxer.from_avcc(
          qualityConfig.width,
          qualityConfig.height,
          videoConfigRef.current
        )
        console.log('📹 MuxideMuxer initialized (video only)')
      }

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
  }, [wasmInitialized, settings.qualityPreset, storageStrategy])

  const initializeEncoders = useCallback((activeStream: MediaStream) => {
    if (!activeStream || !wasmInitialized) return

    activeStreamRef.current = activeStream

    const audioTrack = activeStream.getAudioTracks()[0]
    const audioSettings = audioTrack?.getSettings()
    const qualityConfig = QUALITY_PRESETS[settings.qualityPreset]

    // オーディオ設定を保存（Muxer初期化時に使用）
    if (audioSettings?.sampleRate && audioSettings?.channelCount) {
      audioSettingsRef.current = {
        sampleRate: audioSettings.sampleRate,
        channelCount: audioSettings.channelCount
      }
    }

    console.log('🎤 Audio track settings:', audioSettings)

    // 解像度に応じてAVCレベルを選択
    // Level 3.1 (0x1f): 最大1280x720
    // Level 4.0 (0x28): 最大1920x1080
    // Level 5.1 (0x33): 最大4096x2160
    const getAvcCodec = (width: number, height: number): string => {
      const pixels = width * height
      if (pixels > 2073600) { // 1920x1080より大きい場合 (4K)
        return 'avc1.640033' // High Profile, Level 5.1
      }
      if (pixels > 921600) { // 1280x720より大きい場合 (1080p)
        return 'avc1.640028' // High Profile, Level 4.0
      }
      return 'avc1.42001f' // Baseline Profile, Level 3.1
    }

    // Initialize VideoEncoder
    const videoConfig = {
      codec: getAvcCodec(qualityConfig.width, qualityConfig.height),
      width: qualityConfig.width,
      height: qualityConfig.height,
      bitrate: qualityConfig.bitrate,
      framerate: qualityConfig.framerate,
    }

    videoEncoderRef.current = new VideoEncoder({
      output: (chunk, metadata) => {
        if (metadata?.decoderConfig?.description && !videoConfigRef.current) {
          videoConfigRef.current = new Uint8Array(metadata.decoderConfig.description as ArrayBuffer)
          console.log('✅ Video decoder config captured:', videoConfigRef.current.length, 'bytes')
          initializeMuxerWithConfigs()
        }

        if (baseVideoTimestampRef.current === null) {
          baseVideoTimestampRef.current = chunk.timestamp
          console.log('📹 Base video timestamp set:', chunk.timestamp)
        }

        const isKeyframe = chunk.type === 'key'
        const relativeTimestamp = chunk.timestamp - baseVideoTimestampRef.current
        const buffer = new Uint8Array(chunk.byteLength)
        chunk.copyTo(buffer)

        if (muxerRef.current && recordingIdRef.current) {
          try {
            // MuxideMuxerはpush_videoで直接フラグメントを返さない
            // 代わりにget_pending_segmentsで取得する
            muxerRef.current.push_video(buffer, relativeTimestamp, isKeyframe)

            // 保留中のセグメントがあれば保存
            if (muxerRef.current.has_pending_segments()) {
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
            console.error('❌ MuxideMuxer push_video error:', err)
          }
        }

        onStatsUpdate(prev => ({
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

        if (baseAudioTimestampRef.current === null) {
          baseAudioTimestampRef.current = chunk.timestamp
          console.log('🎤 Base audio timestamp set:', chunk.timestamp)
        }

        // Muxerにオーディオを送信
        if (muxerRef.current && muxerRef.current.has_audio && muxerRef.current.has_audio()) {
          try {
            const relativeTimestamp = chunk.timestamp - baseAudioTimestampRef.current
            const buffer = new Uint8Array(chunk.byteLength)
            chunk.copyTo(buffer)
            // duration is in microseconds from WebCodecs
            const duration = chunk.duration || 21333 // デフォルト: 1024 samples @ 48kHz ≈ 21.33ms
            muxerRef.current.push_audio(buffer, relativeTimestamp, duration)
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
  }, [wasmInitialized, settings.qualityPreset, initializeMuxerWithConfigs, storageStrategy, onStatsUpdate, onChunkSaved])

  const closeEncoders = useCallback(async () => {
    if (videoEncoderRef.current) {
      try {
        if (videoEncoderRef.current.state !== 'closed') {
          await videoEncoderRef.current.flush()
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
    videoConfigRef.current = null
    audioConfigRef.current = null
    audioSettingsRef.current = null
    muxerRef.current = null
    initSegmentRef.current = null
    activeStreamRef.current = null
    baseVideoTimestampRef.current = null
    baseAudioTimestampRef.current = null
    recordingIdRef.current = null
  }, [])

  const setRecordingId = useCallback((recordingId: RecordingId) => {
    recordingIdRef.current = recordingId
  }, [])

  return {
    videoEncoderRef,
    audioEncoderRef,
    initializeEncoders,
    closeEncoders,
    resetEncoders,
    setRecordingId,
  }
}
