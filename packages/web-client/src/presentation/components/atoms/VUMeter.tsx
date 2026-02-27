/**
 * VUMeter - 水平ヒストグラム型VUメーター
 *
 * Web Audio API の AnalyserNode (getByteFrequencyData) を使用して
 * リアルタイムで周波数スペクトラムをヒストグラム表示
 */

import { useRef, useEffect, useCallback } from 'react';

interface VUMeterProps {
  /** 音声ストリーム */
  stream: MediaStream | null;
  /** キャンバスの幅（省略時はCSS幅に追従） */
  width?: number;
  /** キャンバスの高さ */
  height?: number;
  /** 非アクティブ時のグレー表示 */
  inactive?: boolean;
}

/** バーの本数 */
const BAR_COUNT = 20;
/** バー間のギャップ（px） */
const BAR_GAP = 2;
/** ピークホールド時間（ms） */
const PEAK_HOLD_MS = 2000;
/** dBスケール表示の高さ（px） */
const DB_SCALE_HEIGHT = 16;
/** カラー定義 */
const COLOR_SAFE = '#10B981';
const COLOR_WARN = '#F59E0B';
const COLOR_REC = '#EF4444';
const COLOR_INACTIVE = '#334155';
/** dB範囲: -60dB ~ 0dB */
const DB_MIN = -60;
const DB_MAX = 0;

export const VUMeter: React.FC<VUMeterProps> = ({
  stream,
  width,
  height = 120,
  inactive = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const peakLevelsRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));
  const peakTimesRef = useRef<number[]>(new Array(BAR_COUNT).fill(0));

  /** 0-255の周波数値をdBに変換（0-255 → -60dB~0dB） */
  const toDB = useCallback((value: number): number => {
    if (value === 0) return DB_MIN;
    // 0-255 → 0.0-1.0 → dB
    const normalized = value / 255;
    const db = 20 * Math.log10(normalized);
    return Math.max(DB_MIN, Math.min(DB_MAX, db));
  }, []);

  /** dB値を0-1の正規化値に変換 */
  const dbToNormalized = useCallback((db: number): number => {
    return (db - DB_MIN) / (DB_MAX - DB_MIN);
  }, []);

  /** 正規化値（0-1）に基づいてバーの色を返す */
  const getBarColor = useCallback((normalizedLevel: number): string => {
    if (normalizedLevel <= 0.6) return COLOR_SAFE;
    if (normalizedLevel <= 0.8) return COLOR_WARN;
    return COLOR_REC;
  }, []);

  /** キャンバスの実効幅を取得 */
  const getCanvasWidth = useCallback((): number => {
    if (width) return width;
    if (containerRef.current) return containerRef.current.clientWidth;
    return 300;
  }, [width]);

  useEffect(() => {
    if (!stream || inactive) {
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
      peakLevelsRef.current = new Array(BAR_COUNT).fill(0);
      peakTimesRef.current = new Array(BAR_COUNT).fill(0);

      // 非アクティブ/ストリーム無しの状態を描画
      const drawInactive = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const canvasWidth = getCanvasWidth();
        canvas.width = canvasWidth;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const meterHeight = height - DB_SCALE_HEIGHT;
        const barWidth = (canvasWidth - (BAR_COUNT - 1) * BAR_GAP) / BAR_COUNT;

        ctx.clearRect(0, 0, canvasWidth, height);

        // グレーのバーを描画
        for (let i = 0; i < BAR_COUNT; i++) {
          const x = i * (barWidth + BAR_GAP);
          const barH = meterHeight * 0.05; // 最小の高さ
          ctx.fillStyle = COLOR_INACTIVE;
          ctx.fillRect(x, meterHeight - barH, barWidth, barH);
        }

        // dBスケール描画
        drawDBScale(ctx, canvasWidth, meterHeight);
      };
      drawInactive();
      return;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 64; // frequencyBinCount = 32, BAR_COUNT=20に十分
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;

    const draw = () => {
      const canvas = canvasRef.current;
      const currentAnalyser = analyserRef.current;
      if (!canvas || !currentAnalyser) return;

      const canvasWidth = getCanvasWidth();
      canvas.width = canvasWidth;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufferLength = currentAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      currentAnalyser.getByteFrequencyData(dataArray);

      const meterHeight = height - DB_SCALE_HEIGHT;
      const barWidth = (canvasWidth - (BAR_COUNT - 1) * BAR_GAP) / BAR_COUNT;
      const now = performance.now();

      ctx.clearRect(0, 0, canvasWidth, height);

      // 周波数データをBAR_COUNT本のバーにマッピング
      const step = bufferLength / BAR_COUNT;

      for (let i = 0; i < BAR_COUNT; i++) {
        // 各バーに対応する周波数ビンの平均値を計算
        const startBin = Math.floor(i * step);
        const endBin = Math.floor((i + 1) * step);
        let sum = 0;
        let count = 0;
        for (let j = startBin; j < endBin && j < bufferLength; j++) {
          sum += dataArray[j];
          count++;
        }
        const avgValue = count > 0 ? sum / count : 0;

        // dBに変換し、正規化
        const db = toDB(avgValue);
        const normalized = dbToNormalized(db);

        // バーの高さ（最小高さを保証）
        const barH = Math.max(meterHeight * 0.02, normalized * meterHeight);
        const x = i * (barWidth + BAR_GAP);

        // バーの色（高さに基づく）
        ctx.fillStyle = getBarColor(normalized);
        ctx.fillRect(x, meterHeight - barH, barWidth, barH);

        // ピークホールド更新
        if (normalized > peakLevelsRef.current[i]) {
          peakLevelsRef.current[i] = normalized;
          peakTimesRef.current[i] = now;
        } else if (now - peakTimesRef.current[i] > PEAK_HOLD_MS) {
          // ピークホールド時間経過後、徐々に減衰
          peakLevelsRef.current[i] = Math.max(0, peakLevelsRef.current[i] - 0.01);
        }

        // ピークインジケータ描画
        const peakLevel = peakLevelsRef.current[i];
        if (peakLevel > 0.02) {
          const peakY = meterHeight - peakLevel * meterHeight;
          ctx.fillStyle = getBarColor(peakLevel);
          ctx.fillRect(x, peakY, barWidth, 2);
        }
      }

      // dBスケール描画
      drawDBScale(ctx, canvasWidth, meterHeight);

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

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
  }, [stream, width, height, inactive, toDB, dbToNormalized, getBarColor, getCanvasWidth]);

  // ResizeObserverでコンテナ幅変更時にキャンバスを再描画
  useEffect(() => {
    if (width) return; // 固定幅の場合はResizeObserver不要

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = container.clientWidth;
      }
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, [width]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas
        ref={canvasRef}
        width={width || 300}
        height={height}
        className="rounded w-full"
        style={{ display: 'block' }}
      />
    </div>
  );
};

/** dBスケールの目盛りを描画 */
function drawDBScale(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  meterHeight: number,
): void {
  const dbMarks = [-60, -40, -20, 0];
  ctx.fillStyle = '#94A3B8'; // slate-400
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';

  const scaleY = meterHeight + 12;

  for (const db of dbMarks) {
    const normalized = (db - DB_MIN) / (DB_MAX - DB_MIN);
    const x = normalized * canvasWidth;

    // 目盛り線
    ctx.strokeStyle = '#475569'; // slate-600
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, meterHeight);
    ctx.lineTo(x, meterHeight + 4);
    ctx.stroke();

    // ラベル
    const label = db === 0 ? '0' : `${db}`;
    // 端の目盛りはクリッピングされないよう調整
    let labelX = x;
    if (db === DB_MIN) labelX = Math.max(12, x);
    if (db === DB_MAX) labelX = Math.min(canvasWidth - 8, x);
    ctx.fillText(label, labelX, scaleY);
  }
}
