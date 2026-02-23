/**
 * PreciseScheduler - Web Audio APIベース精密スケジューラ
 *
 * AudioContextのハードウェアクロックを使用して、
 * Date.now()よりも高精度なタイミングでコールバックを実行する。
 *
 * OscillatorNodeのstart/stopとonendedイベントを利用して
 * ほぼ正確な時刻にコールバックを発火させる。
 */

interface CalibrationPoint {
  audioTime: number;  // AudioContext.currentTime (seconds)
  wallTime: number;   // Date.now() (ms)
}

export class PreciseScheduler {
  private audioContext: AudioContext | null = null;
  private calibration: CalibrationPoint | null = null;
  private ownsContext = false;

  /**
   * AudioContextを初期化（または既存を使用）
   * ユーザージェスチャー後に呼ぶこと（autoplayポリシー対応）
   */
  initialize(existingContext?: AudioContext): void {
    if (this.audioContext) return;

    if (existingContext) {
      this.audioContext = existingContext;
      this.ownsContext = false;
    } else {
      this.audioContext = new AudioContext();
      this.ownsContext = true;
    }

    this.calibrate();
  }

  /**
   * AudioContext時刻とDate.now()のマッピングを記録
   */
  private calibrate(): void {
    if (!this.audioContext) return;

    this.calibration = {
      audioTime: this.audioContext.currentTime,
      wallTime: Date.now(),
    };
  }

  /**
   * wall clock時刻(ms)をAudioContext時刻(seconds)に変換
   */
  private wallTimeToAudioTime(wallTimeMs: number): number {
    if (!this.audioContext || !this.calibration) {
      throw new Error('PreciseScheduler not initialized');
    }

    const wallDeltaMs = wallTimeMs - this.calibration.wallTime;
    const wallDeltaSec = wallDeltaMs / 1000;
    return this.calibration.audioTime + wallDeltaSec;
  }

  /**
   * 指定したwall clock時刻にコールバックを実行
   *
   * @param targetWallTimeMs 実行したいDate.now()相当の時刻（ms since epoch）
   * @param callback 実行するコールバック
   * @returns キャンセル用の関数
   */
  scheduleAt(targetWallTimeMs: number, callback: () => void): () => void {
    if (!this.audioContext) {
      throw new Error('PreciseScheduler not initialized');
    }

    const now = Date.now();

    // 過去の時刻の場合は即座にコールバック
    if (targetWallTimeMs <= now) {
      callback();
      return () => {};
    }

    const targetAudioTime = this.wallTimeToAudioTime(targetWallTimeMs);
    const currentAudioTime = this.audioContext.currentTime;

    // AudioContext時刻でも過去の場合は即座にコールバック
    if (targetAudioTime <= currentAudioTime) {
      callback();
      return () => {};
    }

    // Silent OscillatorNodeを使用して精密タイミング
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 0; // 無音
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    let cancelled = false;

    oscillator.onended = () => {
      if (!cancelled) {
        callback();
      }
      gainNode.disconnect();
    };

    // ターゲット時刻の少し前に開始して、ターゲット時刻で停止
    const startTime = Math.max(currentAudioTime, targetAudioTime - 1);
    oscillator.start(startTime);
    oscillator.stop(targetAudioTime);

    return () => {
      cancelled = true;
      try {
        oscillator.stop();
        oscillator.disconnect();
        gainNode.disconnect();
      } catch {
        // already stopped
      }
    };
  }

  /**
   * 指定したwall clock時刻まで待機するPromise
   */
  waitUntil(targetWallTimeMs: number): Promise<void> {
    return new Promise((resolve) => {
      this.scheduleAt(targetWallTimeMs, resolve);
    });
  }

  /**
   * AudioContextが利用可能かどうか
   */
  isInitialized(): boolean {
    return this.audioContext !== null && this.audioContext.state !== 'closed';
  }

  /**
   * リソースを解放
   */
  dispose(): void {
    if (this.audioContext && this.ownsContext) {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    this.calibration = null;
  }
}
