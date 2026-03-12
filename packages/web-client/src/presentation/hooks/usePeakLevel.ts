/**
 * usePeakLevel - マイク音声のピークレベル計測・クリッピング検知フック
 *
 * Web Audio API の AnalyserNode (getByteTimeDomainData) を使用して
 * RMSレベル、ピークホールド、クリッピング検出を行う
 */

import { useRef, useEffect, useState, useCallback } from 'react';

/** dB範囲 */
const DB_MIN = -60;
const DB_MAX = 0;
/** クリッピング判定閾値（dB） */
const CLIP_THRESHOLD_DB = -1;
/** ピークホールド保持時間（ms） */
const PEAK_HOLD_MS = 3000;
/** ピーク減衰速度（dB/frame） */
const PEAK_DECAY_RATE = 0.3;

export interface PeakLevelState {
  /** 現在のRMSレベル（dB） */
  rmsDb: number;
  /** 現在のピークレベル（dB） */
  peakDb: number;
  /** セッション中の最大ピーク（dB） */
  maxPeakDb: number;
  /** クリッピングが発生しているか */
  isClipping: boolean;
  /** クリップ回数 */
  clipCount: number;
  /** ピーク・クリップカウントをリセット */
  reset: () => void;
}

export function usePeakLevel(stream: MediaStream | null): PeakLevelState {
  const [rmsDb, setRmsDb] = useState<number>(DB_MIN);
  const [peakDb, setPeakDb] = useState<number>(DB_MIN);
  const [maxPeakDb, setMaxPeakDb] = useState<number>(DB_MIN);
  const [isClipping, setIsClipping] = useState(false);
  const [clipCount, setClipCount] = useState(0);

  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const peakHoldRef = useRef<number>(DB_MIN);
  const peakHoldTimeRef = useRef<number>(0);
  const maxPeakRef = useRef<number>(DB_MIN);
  const wasClippingRef = useRef(false);
  const clipCountRef = useRef(0);

  const reset = useCallback(() => {
    maxPeakRef.current = DB_MIN;
    clipCountRef.current = 0;
    peakHoldRef.current = DB_MIN;
    peakHoldTimeRef.current = 0;
    wasClippingRef.current = false;
    setMaxPeakDb(DB_MIN);
    setClipCount(0);
    setIsClipping(false);
  }, []);

  useEffect(() => {
    if (!stream) {
      // クリーンアップ
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      analyserRef.current = null;
      return;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Float32Array(bufferLength);

    const measure = () => {
      const currentAnalyser = analyserRef.current;
      if (!currentAnalyser) return;

      currentAnalyser.getFloatTimeDomainData(dataArray);

      // RMS計算
      let sumSquares = 0;
      let samplePeak = 0;
      for (let i = 0; i < bufferLength; i++) {
        const sample = dataArray[i];
        sumSquares += sample * sample;
        const absSample = Math.abs(sample);
        if (absSample > samplePeak) {
          samplePeak = absSample;
        }
      }
      const rms = Math.sqrt(sumSquares / bufferLength);

      // dBに変換
      const currentRmsDb = rms > 0
        ? Math.max(DB_MIN, Math.min(DB_MAX, 20 * Math.log10(rms)))
        : DB_MIN;
      const currentPeakDb = samplePeak > 0
        ? Math.max(DB_MIN, Math.min(DB_MAX, 20 * Math.log10(samplePeak)))
        : DB_MIN;

      // ピークホールド
      const now = performance.now();
      if (currentPeakDb > peakHoldRef.current) {
        peakHoldRef.current = currentPeakDb;
        peakHoldTimeRef.current = now;
      } else if (now - peakHoldTimeRef.current > PEAK_HOLD_MS) {
        peakHoldRef.current = Math.max(DB_MIN, peakHoldRef.current - PEAK_DECAY_RATE);
      }

      // 最大ピーク更新
      if (currentPeakDb > maxPeakRef.current) {
        maxPeakRef.current = currentPeakDb;
        setMaxPeakDb(currentPeakDb);
      }

      // クリッピング検出
      const clipping = currentPeakDb >= CLIP_THRESHOLD_DB;
      if (clipping && !wasClippingRef.current) {
        clipCountRef.current += 1;
        setClipCount(clipCountRef.current);
      }
      wasClippingRef.current = clipping;

      setRmsDb(currentRmsDb);
      setPeakDb(peakHoldRef.current);
      setIsClipping(clipping);

      animationRef.current = requestAnimationFrame(measure);
    };

    measure();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      analyserRef.current = null;
    };
  }, [stream]);

  return { rmsDb, peakDb, maxPeakDb, isClipping, clipCount, reset };
}
