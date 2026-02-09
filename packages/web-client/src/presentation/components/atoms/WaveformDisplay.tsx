/**
 * WaveformDisplay - 波形データ表示コンポーネント
 *
 * 受信した波形データを描画（Director用）
 * 無音状態はGuest側で判定された値を表示
 */

import { useRef, useEffect } from 'react';

interface WaveformDisplayProps {
  /** 波形データ（0-255の32サンプル） */
  waveformData: number[] | null;
  /** キャンバスの幅 */
  width?: number;
  /** キャンバスの高さ */
  height?: number;
  /** 波形の色 */
  color?: string;
  /** 背景色 */
  backgroundColor?: string;
  /** 無音状態かどうか（Guest側で判定された値） */
  isSilent?: boolean;
}

export const WaveformDisplay: React.FC<WaveformDisplayProps> = ({
  waveformData,
  width = 100,
  height = 24,
  color = '#22c55e',
  backgroundColor = 'rgba(0,0,0,0.2)',
  isSilent = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 描画
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 背景をクリア
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    if (!waveformData || waveformData.length === 0) {
      // データがない場合は中央に線を描画
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }

    // 波形の色（無音時は警告色）
    const waveColor = isSilent ? '#f59e0b' : color;

    // 波形を描画
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = waveColor;
    ctx.beginPath();

    const sliceWidth = width / waveformData.length;
    let x = 0;

    for (let i = 0; i < waveformData.length; i++) {
      const v = waveformData[i] / 128.0;
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
  }, [waveformData, width, height, color, backgroundColor, isSilent]);

  return (
    <div className="flex items-center gap-1.5">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="rounded"
        style={{ display: 'block' }}
      />
      {isSilent && (
        <div
          className="text-amber-400"
          title="No audio detected"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
        </div>
      )}
    </div>
  );
};
