/**
 * PeakLevelMeter - ピークレベルメーター
 *
 * マイクの音量をリアルタイムで表示し、
 * クリッピング（音割れ）を検出して警告する
 */

import { usePeakLevel } from '../../hooks/usePeakLevel';

interface PeakLevelMeterProps {
  /** 音声ストリーム */
  stream: MediaStream | null;
}

/** dB範囲 */
const DB_MIN = -60;
const DB_MAX = 0;

/** dBを0-1の正規化値に変換 */
function dbToNormalized(db: number): number {
  return Math.max(0, Math.min(1, (db - DB_MIN) / (DB_MAX - DB_MIN)));
}

/** レベルに応じた色クラスを返す */
function getLevelColor(db: number): string {
  if (db >= -3) return 'text-red-400';
  if (db >= -12) return 'text-amber-400';
  return 'text-emerald-400';
}

export const PeakLevelMeter: React.FC<PeakLevelMeterProps> = ({ stream }) => {
  const { rmsDb, peakDb, maxPeakDb, isClipping, clipCount, reset } = usePeakLevel(stream);

  const rmsNormalized = dbToNormalized(rmsDb);
  const peakNormalized = dbToNormalized(peakDb);

  // グラデーション用の色セグメント
  // 0-80%: green, 80-93%: yellow, 93-100%: red
  // dB換算: -60〜-12dB: green, -12〜-3dB: yellow, -3〜0dB: red
  const greenEnd = ((-12 - DB_MIN) / (DB_MAX - DB_MIN)) * 100;
  const yellowEnd = ((-3 - DB_MIN) / (DB_MAX - DB_MIN)) * 100;

  return (
    <div className="space-y-2">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-maycast-text-secondary flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          Mic Check
        </span>
        {clipCount > 0 && (
          <button
            type="button"
            onClick={reset}
            className="text-xs text-maycast-text-secondary hover:text-maycast-text transition-colors cursor-pointer"
          >
            Reset
          </button>
        )}
      </div>

      {/* レベルバー */}
      <div className="relative h-6 bg-black/30 rounded-md overflow-hidden">
        {/* 背景グリッド（dB目盛り） */}
        {[-48, -36, -24, -12, -6, -3].map(db => {
          const pos = dbToNormalized(db) * 100;
          return (
            <div
              key={db}
              className="absolute top-0 bottom-0 w-px bg-white/10"
              style={{ left: `${pos}%` }}
            />
          );
        })}

        {/* RMSレベルバー */}
        <div
          className="absolute top-0 bottom-0 left-0 transition-[width] duration-75"
          style={{
            width: `${rmsNormalized * 100}%`,
            background: `linear-gradient(to right, #10B981 0%, #10B981 ${greenEnd}%, #F59E0B ${greenEnd}%, #F59E0B ${yellowEnd}%, #EF4444 ${yellowEnd}%, #EF4444 100%)`,
          }}
        />

        {/* ピークホールドインジケータ */}
        {peakDb > DB_MIN + 1 && (
          <div
            className="absolute top-0 bottom-0 w-0.5 transition-[left] duration-75"
            style={{
              left: `${peakNormalized * 100}%`,
              backgroundColor: peakDb >= -3 ? '#EF4444' : peakDb >= -12 ? '#F59E0B' : '#10B981',
            }}
          />
        )}

        {/* クリッピングフラッシュ */}
        {isClipping && (
          <div className="absolute inset-0 bg-red-500/20 animate-pulse" />
        )}

        {/* dBラベル */}
        <div className="absolute inset-0 flex items-center px-2 pointer-events-none">
          <span className={`text-xs font-mono font-semibold drop-shadow-md ${isClipping ? 'text-red-300' : 'text-white/80'}`}>
            {rmsDb > DB_MIN ? `${rmsDb.toFixed(1)} dB` : '—'}
          </span>
        </div>
      </div>

      {/* dBスケール */}
      <div className="relative h-3 text-[9px] font-mono text-maycast-text-secondary/60">
        {[
          { db: -60, label: '-60' },
          { db: -48, label: '-48' },
          { db: -36, label: '-36' },
          { db: -24, label: '-24' },
          { db: -12, label: '-12' },
          { db: -6, label: '-6' },
          { db: 0, label: '0' },
        ].map(({ db, label }) => (
          <span
            key={db}
            className="absolute -translate-x-1/2"
            style={{ left: `${dbToNormalized(db) * 100}%` }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* ステータス表示 */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          {/* 最大ピーク */}
          <span className="text-maycast-text-secondary">
            Peak:{' '}
            <span className={`font-mono font-semibold ${getLevelColor(maxPeakDb)}`}>
              {maxPeakDb > DB_MIN ? `${maxPeakDb.toFixed(1)} dB` : '— dB'}
            </span>
          </span>
        </div>

        {/* クリッピング警告 */}
        {clipCount > 0 && (
          <div className="flex items-center gap-1 text-red-400">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
            <span className="font-semibold">Clipping detected ({clipCount})</span>
          </div>
        )}

        {/* 適正範囲のガイド */}
        {clipCount === 0 && maxPeakDb > DB_MIN && maxPeakDb < -12 && (
          <span className="text-maycast-text-secondary">
            Target: -12 ~ -6 dB
          </span>
        )}
        {clipCount === 0 && maxPeakDb >= -12 && maxPeakDb < -3 && (
          <span className="text-emerald-400">
            Good level
          </span>
        )}
      </div>
    </div>
  );
};
