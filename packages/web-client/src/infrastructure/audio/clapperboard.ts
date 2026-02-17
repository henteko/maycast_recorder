/**
 * Clapperboard (sync beep) mixer
 *
 * NHK時報スタイルのビープ音パターンを AudioData の生サンプルに直接合成する。
 * MediaStreamTrackProcessor → AudioEncoder のパイプライン内で動作し、
 * AudioContext は使用しない。
 *
 * パターン:
 *   t=0.0s: 880Hz, 100ms（短音）
 *   t=1.0s: 880Hz, 100ms（短音）
 *   t=2.0s: 880Hz, 100ms（短音）
 *   t=3.0s: 1760Hz, 500ms（長音 = 同期基準点）
 */

interface BeepSegment {
  /** ビープ開始時刻（秒） */
  startSec: number;
  /** ビープ持続時間（秒） */
  durationSec: number;
  /** 周波数（Hz） */
  frequency: number;
}

const BEEP_PATTERN: BeepSegment[] = [
  { startSec: 0.0, durationSec: 0.1, frequency: 880 },
  { startSec: 1.0, durationSec: 0.1, frequency: 880 },
  { startSec: 2.0, durationSec: 0.1, frequency: 880 },
  { startSec: 3.0, durationSec: 0.5, frequency: 1760 },
];

const BEEP_AMPLITUDE = 0.5;
const FADE_DURATION_SEC = 0.005;

/** ビープ合成の全期間が終了する時刻（秒） */
const BEEP_END_SEC = 3.5;

export class ClapperboardMixer {
  private baseTimestamp: number | null = null;

  /**
   * AudioData にカチンコ音を合成して返す。
   * ビープ区間外の AudioData はそのまま返す（コピーしない）。
   */
  mixInto(audioData: AudioData): AudioData {
    if (this.baseTimestamp === null) {
      this.baseTimestamp = audioData.timestamp;
    }

    const elapsedUs = audioData.timestamp - this.baseTimestamp;
    const elapsedSec = elapsedUs / 1_000_000;

    // ビープ期間が完全に終了していればそのまま返す
    if (elapsedSec > BEEP_END_SEC) {
      return audioData;
    }

    const durationSec = audioData.duration / 1_000_000;
    const endSec = elapsedSec + durationSec;

    // この AudioData がビープ区間と重なるか判定
    const hasOverlap = BEEP_PATTERN.some((beep) => {
      const beepEnd = beep.startSec + beep.durationSec;
      return elapsedSec < beepEnd && endSec > beep.startSec;
    });

    if (!hasOverlap) {
      return audioData;
    }

    // AudioData からサンプルをコピー
    const { numberOfFrames, numberOfChannels, sampleRate, timestamp } = audioData;
    const buffer = new Float32Array(numberOfFrames * numberOfChannels);

    // f32-planar: チャンネルごとに連続した平面配置
    // f32: インターリーブ配置
    for (let ch = 0; ch < numberOfChannels; ch++) {
      const channelBuffer = new Float32Array(numberOfFrames);
      audioData.copyTo(channelBuffer, { planeIndex: ch, format: 'f32-planar' });
      buffer.set(channelBuffer, ch * numberOfFrames);
    }

    // ビープ音をサンプル単位で加算
    for (let i = 0; i < numberOfFrames; i++) {
      const sampleTimeSec = elapsedSec + i / sampleRate;
      const beepValue = this.generateBeepSample(sampleTimeSec);

      if (beepValue !== 0) {
        for (let ch = 0; ch < numberOfChannels; ch++) {
          const idx = ch * numberOfFrames + i;
          buffer[idx] = Math.max(-1, Math.min(1, buffer[idx] + beepValue));
        }
      }
    }

    audioData.close();

    return new AudioData({
      format: 'f32-planar',
      sampleRate,
      numberOfFrames,
      numberOfChannels,
      timestamp,
      data: buffer,
    });
  }

  private generateBeepSample(timeSec: number): number {
    for (const beep of BEEP_PATTERN) {
      const beepEnd = beep.startSec + beep.durationSec;
      if (timeSec >= beep.startSec && timeSec < beepEnd) {
        const sine = Math.sin(2 * Math.PI * beep.frequency * timeSec);

        // フェードイン/アウトのエンベロープ
        const elapsed = timeSec - beep.startSec;
        const remaining = beepEnd - timeSec;
        let envelope = 1;
        if (elapsed < FADE_DURATION_SEC) {
          envelope = elapsed / FADE_DURATION_SEC;
        } else if (remaining < FADE_DURATION_SEC) {
          envelope = remaining / FADE_DURATION_SEC;
        }

        return sine * BEEP_AMPLITUDE * envelope;
      }
    }
    return 0;
  }
}
