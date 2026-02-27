import { useState, useEffect, useCallback, useRef } from 'react';
import type { Recording, RecordingId } from '@maycast/common-types';
import { useDI } from '../../infrastructure/di';
import type { ListRecordingsUseCase } from '../../domain/usecases/ListRecordings.usecase';
import type { DeleteRecordingUseCase } from '../../domain/usecases/DeleteRecording.usecase';
import type { ResumeUploadManager } from '../../infrastructure/upload/ResumeUploadManager';
import { detectUnfinishedRecordings, type UnfinishedRecording } from '../../infrastructure/upload/resume-upload';
import type { UploadProgress } from '../../infrastructure/upload/types';
import type { IRecordingRepository } from '../../domain/repositories/IRecordingRepository';
import type { IChunkRepository } from '../../domain/repositories/IChunkRepository';

export const useSessionManager = () => {
  const [savedRecordings, setSavedRecordings] = useState<Recording[]>([]);
  const [recoveryRecording, setRecoveryRecording] = useState<Recording | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  // Resume Upload 関連の状態
  const [unfinishedRecordings, setUnfinishedRecordings] = useState<UnfinishedRecording[]>([]);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<Map<string, UploadProgress>>(new Map());
  const [isResuming, setIsResuming] = useState(false);
  const progressIntervalRef = useRef<number | null>(null);

  const di = useDI();
  const listRecordingsUseCase = di.resolve<ListRecordingsUseCase>('ListRecordingsUseCase');
  const deleteRecordingUseCase = di.resolve<DeleteRecordingUseCase>('DeleteRecordingUseCase');
  const recordingRepository = di.resolve<IRecordingRepository>('RecordingRepository');
  const chunkRepository = di.resolve<IChunkRepository>('ChunkRepository');

  const resumeUploadManager = di.has('ResumeUploadManager')
    ? di.resolve<ResumeUploadManager>('ResumeUploadManager')
    : null;

  const MAX_LOCAL_RECORDINGS = 2;

  const cleanupOldRecordings = useCallback(async (recordings: Recording[]) => {
    const activeStates = new Set(['recording', 'finalizing']);
    const cleanupTargets = recordings.filter(r => !activeStates.has(r.state));
    const toDelete = cleanupTargets.slice(MAX_LOCAL_RECORDINGS);

    if (toDelete.length === 0) return false;

    console.log(`🧹 Auto-cleanup: deleting ${toDelete.length} old recording(s)`);
    for (const recording of toDelete) {
      try {
        await deleteRecordingUseCase.execute({ recordingId: recording.id });
        console.log(`🗑️ Auto-deleted recording: ${recording.id}`);
      } catch (err) {
        console.error(`❌ Failed to auto-delete recording: ${recording.id}`, err);
      }
    }
    return true;
  }, [deleteRecordingUseCase]);

  const loadRecordings = useCallback(async () => {
    try {
      const result = await listRecordingsUseCase.execute();
      setSavedRecordings(result.recordings);
      console.log('📂 Loaded saved recordings:', result.recordings.length);

      // 古い録画データの自動クリーンアップ（直近2件のみ保持）
      const deleted = await cleanupOldRecordings(result.recordings);
      if (deleted) {
        const updatedResult = await listRecordingsUseCase.execute();
        setSavedRecordings(updatedResult.recordings);
      }

      // Resume Upload の検出を行う
      if (resumeUploadManager) {
        const unfinished = await detectUnfinishedRecordings(recordingRepository, chunkRepository);
        if (unfinished.length > 0) {
          console.log(`🔄 [useSessionManager] Found ${unfinished.length} unfinished recording(s) for resume upload`);
          setUnfinishedRecordings(unfinished);
          setShowResumeModal(true);
        }
        return;
      }
    } catch (err) {
      console.error('❌ Failed to load recordings:', err);
    }
  }, [listRecordingsUseCase, cleanupOldRecordings, resumeUploadManager, recordingRepository, chunkRepository]);

  useEffect(() => {
    loadRecordings();
  }, [loadRecordings]);

  // 進捗ポーリング
  useEffect(() => {
    if (isResuming && resumeUploadManager) {
      progressIntervalRef.current = window.setInterval(() => {
        const progress = resumeUploadManager.getAllProgress();
        setUploadProgress(new Map(progress));
      }, 500);
    } else {
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }

    return () => {
      if (progressIntervalRef.current) {
        window.clearInterval(progressIntervalRef.current);
      }
    };
  }, [isResuming, resumeUploadManager]);

  const deleteRecording = async (recordingId: RecordingId) => {
    if (!confirm('Delete this recording?')) {
      return;
    }

    try {
      await deleteRecordingUseCase.execute({ recordingId });
      await loadRecordings();
      console.log('🗑️ Recording deleted:', recordingId);
    } catch (err) {
      console.error('❌ Failed to delete recording:', err);
      alert('Failed to delete recording');
    }
  };

  const clearAllRecordings = async () => {
    if (!confirm(`Delete all recordings (${savedRecordings.length})? This action cannot be undone.`)) {
      return;
    }

    let successCount = 0;
    let failCount = 0;
    const errors: string[] = [];

    for (const recording of savedRecordings) {
      try {
        console.log('🗑️ Deleting recording:', recording.id);
        await deleteRecordingUseCase.execute({ recordingId: recording.id });
        successCount++;
        console.log('✅ Recording deleted successfully:', recording.id);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error('❌ Failed to delete recording:', recording.id, err);
        errors.push(`${recording.id}: ${errorMsg}`);
        failCount++;
      }
    }

    await loadRecordings();

    if (errors.length > 0) {
      console.error('削除エラーの詳細:', errors);
      alert(`Deletion complete: ${successCount} succeeded, ${failCount} failed\n\nCheck the console for error details`);
    } else {
      alert(`Deletion complete: ${successCount} succeeded`);
    }
  };


  /**
   * 全ての未完了 Recording を再アップロード
   */
  const resumeAllRecordings = async () => {
    if (!resumeUploadManager || unfinishedRecordings.length === 0) {
      console.warn('⚠️ [useSessionManager] No ResumeUploadManager or unfinished recordings');
      return;
    }

    console.log(`🚀 [useSessionManager] Starting resume upload for ${unfinishedRecordings.length} recording(s)`);
    setIsResuming(true);

    try {
      const results = await resumeUploadManager.resumeAllRecordings(unfinishedRecordings);

      // 結果をログ
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      console.log(`✅ [useSessionManager] Resume completed: ${successCount} success, ${failCount} failed`);

      // モーダルを閉じて録画リストを更新
      setShowResumeModal(false);
      setUnfinishedRecordings([]);
      await loadRecordings();

      if (failCount > 0) {
        alert(`Re-upload complete: ${successCount} succeeded, ${failCount} failed`);
      }
    } catch (err) {
      console.error('❌ [useSessionManager] Resume failed:', err);
      alert('Re-upload failed');
    } finally {
      setIsResuming(false);
    }
  };

  /**
   * Resume をスキップ
   */
  const skipResume = () => {
    setShowResumeModal(false);
    // unfinishedRecordings はクリアしない（後で再試行できるように）
    console.log('⏭️ [useSessionManager] Resume upload skipped');
  };

  return {
    savedRecordings,
    recoveryRecording,
    showRecoveryModal,
    setShowRecoveryModal,
    loadRecordings,
    deleteRecording,
    clearAllRecordings,
    // Resume Upload 関連
    unfinishedRecordings,
    showResumeModal,
    setShowResumeModal,
    uploadProgress,
    isResuming,
    resumeAllRecordings,
    skipResume,
    // Deprecated aliases for backward compatibility
    savedSessions: savedRecordings,
    recoverySession: recoveryRecording,
    loadSessions: loadRecordings,
    deleteSession: deleteRecording,
    clearAllSessions: clearAllRecordings,
  };
};
