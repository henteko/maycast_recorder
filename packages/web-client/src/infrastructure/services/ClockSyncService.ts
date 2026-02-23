/**
 * ClockSyncService - NTPライクな時刻同期サービス
 *
 * クライアント主導でサーバーとの時刻オフセットを測定する。
 * WebSocketには直接依存せず、sendPingコールバックで抽象化。
 *
 * NTPアルゴリズム:
 *   T0 = clientSendTime (クライアント送信時刻)
 *   T1 = serverReceiveTime (サーバー受信時刻)
 *   T2 = serverSendTime (サーバー送信時刻)
 *   T3 = clientReceiveTime (クライアント受信時刻)
 *   offset θ = ((T1 - T0) + (T2 - T3)) / 2
 *   RTT = (T3 - T0) - (T2 - T1)
 *
 * localTime + offset ≈ serverTime
 */

export type ClockSyncStatusType = 'idle' | 'syncing' | 'synced';

export interface ClockSyncStatus {
  status: ClockSyncStatusType;
  offsetMs: number;
  accuracyMs: number;
  sampleCount: number;
  rttMedianMs: number;
}

interface SyncSample {
  offset: number;
  rtt: number;
}

const MIN_SAMPLES_FOR_SYNCED = 5;
const TRIMMED_MEAN_FRACTION = 0.2; // RTT上下20%除去

export class ClockSyncService {
  private samples: SyncSample[] = [];
  private _status: ClockSyncStatusType = 'idle';
  private syncTimerId: ReturnType<typeof setInterval> | null = null;
  private roundsRemaining = 0;
  private onStatusChange: ((status: ClockSyncStatus) => void) | null = null;

  setOnStatusChange(callback: (status: ClockSyncStatus) => void): void {
    this.onStatusChange = callback;
  }

  /**
   * 同期を開始する
   * @param sendPing pingを送信するコールバック（呼び出し側がWebSocket等で送信）
   * @param rounds 同期ラウンド数（デフォルト10）
   * @param intervalMs ラウンド間隔（デフォルト500ms）
   */
  startSync(sendPing: () => void, rounds: number = 10, intervalMs: number = 500): void {
    this.stopSync();
    this._status = 'syncing';
    this.roundsRemaining = rounds;

    // 最初のpingを即座に送信
    sendPing();
    this.roundsRemaining--;

    if (this.roundsRemaining > 0) {
      this.syncTimerId = setInterval(() => {
        if (this.roundsRemaining <= 0) {
          this.stopSync();
          return;
        }
        sendPing();
        this.roundsRemaining--;
      }, intervalMs);
    }

    this.notifyStatusChange();
  }

  /**
   * 同期タイマーを停止
   */
  private stopSync(): void {
    if (this.syncTimerId !== null) {
      clearInterval(this.syncTimerId);
      this.syncTimerId = null;
    }
  }

  /**
   * サーバーからのpong応答を処理
   */
  handlePong(clientSendTime: number, serverReceiveTime: number, serverSendTime: number): void {
    const clientReceiveTime = Date.now();

    const T0 = clientSendTime;
    const T1 = serverReceiveTime;
    const T2 = serverSendTime;
    const T3 = clientReceiveTime;

    const offset = ((T1 - T0) + (T2 - T3)) / 2;
    const rtt = (T3 - T0) - (T2 - T1);

    // RTTが負の場合は不正なサンプルとして無視
    if (rtt < 0) {
      console.warn(`[ClockSync] Discarding sample with negative RTT: ${rtt}ms`);
      return;
    }

    this.samples.push({ offset, rtt });

    // 十分なサンプルが集まったらsynced状態に
    if (this.samples.length >= MIN_SAMPLES_FOR_SYNCED && this._status === 'syncing') {
      this._status = 'synced';
    }

    this.notifyStatusChange();
  }

  /**
   * 現在のオフセットを取得（トリム平均: RTT上下20%除去）
   */
  getOffset(): number {
    if (this.samples.length === 0) return 0;

    const sorted = [...this.samples].sort((a, b) => a.rtt - b.rtt);
    const trimCount = Math.floor(sorted.length * TRIMMED_MEAN_FRACTION);
    const trimmed = sorted.slice(trimCount, sorted.length - trimCount);

    // トリム後のサンプルがない場合は全サンプルの中央値を使用
    if (trimmed.length === 0) {
      const mid = Math.floor(sorted.length / 2);
      return sorted[mid].offset;
    }

    const sum = trimmed.reduce((acc, s) => acc + s.offset, 0);
    return sum / trimmed.length;
  }

  /**
   * ローカル時刻をサーバー時刻に変換
   */
  toServerTime(localMs: number): number {
    return localMs + this.getOffset();
  }

  /**
   * サーバー時刻をローカル時刻に変換
   */
  toLocalTime(serverMs: number): number {
    return serverMs - this.getOffset();
  }

  /**
   * 現在のサーバー時刻を推定
   */
  getServerTimeNow(): number {
    return this.toServerTime(Date.now());
  }

  /**
   * 同期ステータスを取得
   */
  getStatus(): ClockSyncStatus {
    const offset = this.getOffset();
    return {
      status: this._status,
      offsetMs: offset,
      accuracyMs: this.getAccuracy(),
      sampleCount: this.samples.length,
      rttMedianMs: this.getRttMedian(),
    };
  }

  /**
   * オフセットの推定精度（標準偏差）
   */
  private getAccuracy(): number {
    if (this.samples.length < 2) return Infinity;

    const offsets = this.samples.map((s) => s.offset);
    const mean = offsets.reduce((a, b) => a + b, 0) / offsets.length;
    const variance = offsets.reduce((acc, o) => acc + (o - mean) ** 2, 0) / (offsets.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * RTTの中央値
   */
  private getRttMedian(): number {
    if (this.samples.length === 0) return 0;

    const sorted = [...this.samples].map((s) => s.rtt).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
  }

  /**
   * サンプルとステータスをリセット
   */
  reset(): void {
    this.stopSync();
    this.samples = [];
    this._status = 'idle';
    this.roundsRemaining = 0;
    this.notifyStatusChange();
  }

  /**
   * 状態変更を通知
   */
  private notifyStatusChange(): void {
    this.onStatusChange?.(this.getStatus());
  }

  /**
   * リソースを解放
   */
  dispose(): void {
    this.stopSync();
    this.onStatusChange = null;
  }
}
