/**
 * AudioWaveform - マイク音声の波形表示コンポーネント
 *
 * Web Audio APIを使用してリアルタイムで音声波形を描画
 * 無音検出時に警告を表示
 */

import { useRef, useEffect, useState, useCallback } from 'react';

interface AudioWaveformProps {
  /** 音声ストリーム */
  stream: MediaStream | null;
  /** キャンバスの幅 */
  width?: number;
  /** キャンバスの高さ */
  height?: number;
  /** 波形の色 */
  color?: string;
  /** 背景色 */
  backgroundColor?: string;
  /** 波形データを外部に送信するコールバック（Director送信用） */
  onWaveformData?: (data: number[], isSilent: boolean) => void;
  /** 波形データ送信間隔（ミリ秒） */
  waveformDataInterval?: number;
  /** 無音警告を表示するかどうか */
  showSilenceWarning?: boolean;
}

/** 無音と判定する閾値（128が中央値、振幅がこれ以下なら無音） */
const SILENCE_THRESHOLD = 5;
/** 無音と判定するまでの連続フレーム数（約60fpsで5秒 = 300フレーム） */
const SILENCE_FRAMES_THRESHOLD = 300;

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  stream,
  width = 200,
  height = 40,
  color = '#22c55e',
  backgroundColor = 'transparent',
  onWaveformData,
  waveformDataInterval = 100,
  showSilenceWarning = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onWaveformDataRef = useRef(onWaveformData);
  const silenceFramesRef = useRef<number>(0);
  const [isSilent, setIsSilent] = useState(false);
  const isSilentRef = useRef(false);

  // コールバックをrefに保持（依存配列の問題を避ける）
  useEffect(() => {
    onWaveformDataRef.current = onWaveformData;
  }, [onWaveformData]);

  // 無音状態を更新するコールバック
  const updateSilenceState = useCallback((silent: boolean) => {
    if (isSilentRef.current !== silent) {
      isSilentRef.current = silent;
      setIsSilent(silent);
    }
  }, []);

  // ストリームが変更されたときにAudio Contextをセットアップ
  useEffect(() => {
    // ストリームがない場合はクリーンアップ
    if (!stream) {
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
      silenceFramesRef.current = 0;
      isSilentRef.current = false;
      return;
    }

    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) return;

    // AudioContextを作成
    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    // AnalyserNodeを作成
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyserRef.current = analyser;

    // MediaStreamをAudioContextに接続
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    sourceRef.current = source;

    // 描画ループ
    const draw = () => {
      const canvas = canvasRef.current;
      const currentAnalyser = analyserRef.current;
      if (!canvas || !currentAnalyser) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufferLength = currentAnalyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      currentAnalyser.getByteTimeDomainData(dataArray);

      // 振幅を計算（128が中央値）
      let maxAmplitude = 0;
      for (let i = 0; i < bufferLength; i++) {
        const amplitude = Math.abs(dataArray[i] - 128);
        if (amplitude > maxAmplitude) {
          maxAmplitude = amplitude;
        }
      }

      // 無音検出
      if (maxAmplitude < SILENCE_THRESHOLD) {
        silenceFramesRef.current++;
        if (silenceFramesRef.current >= SILENCE_FRAMES_THRESHOLD) {
          updateSilenceState(true);
        }
      } else {
        silenceFramesRef.current = 0;
        updateSilenceState(false);
      }

      // 背景をクリア
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);

      // 波形の色（無音時は警告色）
      const waveColor = isSilentRef.current ? '#f59e0b' : color;

      // 波形を描画
      ctx.lineWidth = 2;
      ctx.strokeStyle = waveColor;
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;

        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        x += sliceWidth;
      }

      ctx.lineTo(width, height / 2);
      ctx.stroke();

      animationRef.current = requestAnimationFrame(draw);
    };

    // 描画開始
    draw();

    // 波形データの外部送信はsetIntervalで行う
    // requestAnimationFrameはバックグラウンドタブで停止するが、
    // setIntervalは最低1秒に1回は実行されるため、
    // ゲストが別タブを開いていてもディレクターに波形データが届く
    if (onWaveformDataRef.current) {
      intervalRef.current = setInterval(() => {
        const currentAnalyser = analyserRef.current;
        if (!currentAnalyser || !onWaveformDataRef.current) return;

        const bufferLength = currentAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        currentAnalyser.getByteTimeDomainData(dataArray);

        // データを間引いて送信（32サンプルに縮小）
        const reducedData: number[] = [];
        const step = Math.floor(bufferLength / 32);
        for (let i = 0; i < 32; i++) {
          reducedData.push(dataArray[i * step]);
        }
        onWaveformDataRef.current(reducedData, isSilentRef.current);
      }, waveformDataInterval);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
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
  }, [stream, width, height, color, backgroundColor, waveformDataInterval, updateSilenceState]);

  return (
    <div className="flex flex-col gap-1">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded"
        style={{ display: 'block' }}
      />
      {showSilenceWarning && isSilent && (
        <div className="flex items-center gap-1.5 text-amber-400 text-xs">
          <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          <span>No audio detected. Is your microphone muted?</span>
        </div>
      )}
    </div>
  );
};
