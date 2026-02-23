/**
 * useScheduledRecording - スケジュール録画Hook
 *
 * サーバーから指定された未来時刻T_startに、
 * PreciseScheduler（Web Audio API）を使って正確に録画を開始する。
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { PreciseScheduler } from '../../infrastructure/services/PreciseScheduler';
import type { ClockSyncService } from '../../infrastructure/services/ClockSyncService';
import type { RecordingMetadata } from '@maycast/common-types';

export interface ScheduledRecordingInfo {
  isScheduled: boolean;
  scheduledStartServerTime: number | null;
  countdownMs: number | null;
  hasStarted: boolean;
}

export interface UseScheduledRecordingResult {
  scheduledInfo: ScheduledRecordingInfo;
  handleScheduledStart: (startAtServerTime: number) => void;
  getSyncMetadata: () => RecordingMetadata['syncInfo'] | undefined;
  reset: () => void;
}

export function useScheduledRecording(
  clockSyncService: ClockSyncService,
  startRecording: (() => void) | null
): UseScheduledRecordingResult {
  const [scheduledInfo, setScheduledInfo] = useState<ScheduledRecordingInfo>({
    isScheduled: false,
    scheduledStartServerTime: null,
    countdownMs: null,
    hasStarted: false,
  });

  const schedulerRef = useRef<PreciseScheduler>(new PreciseScheduler());
  const cancelRef = useRef<(() => void) | null>(null);
  const rafRef = useRef<number | null>(null);
  const actualStartTimeRef = useRef<number | null>(null);
  const scheduledStartTimeRef = useRef<number | null>(null);

  const handleScheduledStart = useCallback((startAtServerTime: number) => {
    // キャンセル済みスケジュールをクリーンアップ
    cancelRef.current?.();
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    scheduledStartTimeRef.current = startAtServerTime;

    // PreciseScheduler初期化（AudioContext作成）
    const scheduler = schedulerRef.current;
    if (!scheduler.isInitialized()) {
      scheduler.initialize();
    }

    // T_startをローカル時刻に変換
    const localStart = clockSyncService.toLocalTime(startAtServerTime);

    setScheduledInfo({
      isScheduled: true,
      scheduledStartServerTime: startAtServerTime,
      countdownMs: Math.max(0, localStart - Date.now()),
      hasStarted: false,
    });

    // カウントダウン表示用のrequestAnimationFrameループ
    const updateCountdown = () => {
      const remaining = Math.max(0, localStart - Date.now());
      setScheduledInfo((prev) => ({
        ...prev,
        countdownMs: remaining,
      }));

      if (remaining > 0) {
        rafRef.current = requestAnimationFrame(updateCountdown);
      }
    };
    rafRef.current = requestAnimationFrame(updateCountdown);

    // PreciseSchedulerでターゲット時刻にstartRecording()をスケジュール
    cancelRef.current = scheduler.scheduleAt(localStart, () => {
      actualStartTimeRef.current = Date.now();
      setScheduledInfo((prev) => ({
        ...prev,
        countdownMs: 0,
        hasStarted: true,
      }));
      startRecording?.();
    });
  }, [clockSyncService, startRecording]);

  const getSyncMetadata = useCallback((): RecordingMetadata['syncInfo'] | undefined => {
    if (!scheduledStartTimeRef.current || !actualStartTimeRef.current) {
      return undefined;
    }

    const status = clockSyncService.getStatus();

    return {
      scheduledStartTime: scheduledStartTimeRef.current,
      actualStartTime: actualStartTimeRef.current,
      clockOffsetMs: status.offsetMs,
      clockOffsetAccuracyMs: status.accuracyMs,
      syncSampleCount: status.sampleCount,
    };
  }, [clockSyncService]);

  const reset = useCallback(() => {
    cancelRef.current?.();
    cancelRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    actualStartTimeRef.current = null;
    scheduledStartTimeRef.current = null;
    setScheduledInfo({
      isScheduled: false,
      scheduledStartServerTime: null,
      countdownMs: null,
      hasStarted: false,
    });
  }, []);

  // クリーンアップ
  useEffect(() => {
    const scheduler = schedulerRef.current;
    return () => {
      cancelRef.current?.();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      scheduler.dispose();
    };
  }, []);

  return {
    scheduledInfo,
    handleScheduledStart,
    getSyncMetadata,
    reset,
  };
}
