/**
 * useClockSync - 時刻同期React Hook
 *
 * WebSocket接続後にClockSyncServiceを使ってNTPライクな時刻同期を自動的に行う。
 * sync完了後も定期的に追加sync（ドリフト補正）を実施。
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ClockSyncService } from '../../infrastructure/services/ClockSyncService';
import type { ClockSyncStatus } from '../../infrastructure/services/ClockSyncService';

const SYNC_ROUNDS = 10;
const SYNC_INTERVAL_MS = 500;
const DRIFT_CORRECTION_INTERVAL_MS = 60_000;

export interface UseClockSyncOptions {
  /** WebSocket接続状態 */
  isConnected: boolean;
  /** 時刻同期pingを送信する関数 */
  emitTimeSyncPing: (clientSendTime: number) => void;
  /** 時刻同期pongハンドラーを登録する関数 */
  onTimeSyncPong: (handler: ((data: { clientSendTime: number; serverReceiveTime: number; serverSendTime: number }) => void) | null) => void;
}

export interface UseClockSyncResult {
  syncStatus: ClockSyncStatus;
  toLocalTime: (serverMs: number) => number;
  getServerTimeNow: () => number;
  clockSyncService: ClockSyncService;
}

const INITIAL_STATUS: ClockSyncStatus = {
  status: 'idle',
  offsetMs: 0,
  accuracyMs: Infinity,
  sampleCount: 0,
  rttMedianMs: 0,
};

export function useClockSync({
  isConnected,
  emitTimeSyncPing,
  onTimeSyncPong,
}: UseClockSyncOptions): UseClockSyncResult {
  const [syncStatus, setSyncStatus] = useState<ClockSyncStatus>(INITIAL_STATUS);
  // useMemoで安定したインスタンスを作成（refではなくmemoで保持することでrender中のアクセスが安全）
  const clockSyncService = useMemo(() => new ClockSyncService(), []);
  const driftCorrectionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // pongハンドラーの登録
  useEffect(() => {
    const handler = (data: { clientSendTime: number; serverReceiveTime: number; serverSendTime: number }) => {
      clockSyncService.handlePong(data.clientSendTime, data.serverReceiveTime, data.serverSendTime);
    };

    onTimeSyncPong(handler);

    return () => {
      onTimeSyncPong(null);
    };
  }, [onTimeSyncPong, clockSyncService]);

  // ステータス変更のコールバック
  useEffect(() => {
    clockSyncService.setOnStatusChange((status) => {
      setSyncStatus(status);
    });

    return () => {
      clockSyncService.setOnStatusChange(() => {});
    };
  }, [clockSyncService]);

  // WebSocket接続後に自動sync開始
  useEffect(() => {
    if (!isConnected) return;

    const sendPing = () => {
      emitTimeSyncPing(Date.now());
    };

    // 初回同期（または再接続時に再同期）
    clockSyncService.startSync(sendPing, SYNC_ROUNDS, SYNC_INTERVAL_MS);

    // ドリフト補正用の定期sync
    driftCorrectionTimerRef.current = setInterval(() => {
      clockSyncService.startSync(sendPing, SYNC_ROUNDS, SYNC_INTERVAL_MS);
    }, DRIFT_CORRECTION_INTERVAL_MS);

    return () => {
      if (driftCorrectionTimerRef.current) {
        clearInterval(driftCorrectionTimerRef.current);
        driftCorrectionTimerRef.current = null;
      }
    };
  }, [isConnected, emitTimeSyncPing, clockSyncService]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      clockSyncService.dispose();
    };
  }, [clockSyncService]);

  const toLocalTime = useCallback((serverMs: number) => {
    return clockSyncService.toLocalTime(serverMs);
  }, [clockSyncService]);

  const getServerTimeNow = useCallback(() => {
    return clockSyncService.getServerTimeNow();
  }, [clockSyncService]);

  return {
    syncStatus,
    toLocalTime,
    getServerTimeNow,
    clockSyncService,
  };
}
