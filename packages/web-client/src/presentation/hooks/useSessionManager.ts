import { useState, useEffect, useCallback, useRef } from 'react';
import type { Recording, RecordingId } from '@maycast/common-types';
import { useDI } from '../../infrastructure/di';
import type { ListRecordingsUseCase } from '../../domain/usecases/ListRecordings.usecase';
import type { DeleteRecordingUseCase } from '../../domain/usecases/DeleteRecording.usecase';
import type { CompleteRecordingUseCase } from '../../domain/usecases/CompleteRecording.usecase';
import type { ResumeUploadManager } from '../../modes/remote/ResumeUploadManager';
import { detectUnfinishedRecordings, type UnfinishedRecording } from '../../modes/remote/resume-upload';
import type { UploadProgress } from '../../modes/remote/types';
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
  const completeRecordingUseCase = di.resolve<CompleteRecordingUseCase>('CompleteRecordingUseCase');
  const recordingRepository = di.resolve<IRecordingRepository>('RecordingRepository');
  const chunkRepository = di.resolve<IChunkRepository>('ChunkRepository');

  // ResumeUploadManager は Remote モードでのみ利用可能
  const resumeUploadManager = di.has('ResumeUploadManager')
    ? di.resolve<ResumeUploadManager>('ResumeUploadManager')
    : null;

  const loadRecordings = useCallback(async () => {
    try {
      const result = await listRecordingsUseCase.execute();
      setSavedRecordings(result.recordings);
      console.log('📂 Loaded saved recordings:', result.recordings.length);

      // Remote モードの場合は Resume Upload の検出を行う
      if (resumeUploadManager) {
        const unfinished = await detectUnfinishedRecordings(recordingRepository, chunkRepository);
        if (unfinished.length > 0) {
          console.log(`🔄 [useSessionManager] Found ${unfinished.length} unfinished recording(s) for resume upload`);
          setUnfinishedRecordings(unfinished);
          setShowResumeModal(true);
        }
        // Remote モードでは従来の Recovery チェックは行わない
        // （Resume Upload 機能で代替）
        return;
      }

      // Standalone モードのみ: 従来の復元チェック
      const incompleteRecordings = result.recordings.filter(
        r => r.state !== 'synced' && r.chunkCount > 0
      );
      if (incompleteRecordings.length > 0) {
        const mostRecent = incompleteRecordings.sort((a, b) => b.startTime - a.startTime)[0];
        console.log('🔄 Found incomplete recording:', mostRecent.id);
        setRecoveryRecording(mostRecent);
        setShowRecoveryModal(true);
      }
    } catch (err) {
      console.error('❌ Failed to load recordings:', err);
    }
  }, [listRecordingsUseCase, resumeUploadManager, recordingRepository, chunkRepository]);

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
    if (!confirm('この録画を削除しますか？')) {
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
    if (!confirm(`すべての録画 (${savedRecordings.length}件) を削除しますか？この操作は取り消せません。`)) {
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
      alert(`削除完了: 成功 ${successCount}件, 失敗 ${failCount}件\n\nエラー詳細はコンソールを確認してください`);
    } else {
      alert(`削除完了: 成功 ${successCount}件`);
    }
  };

  const recoverRecording = async (recordingId: RecordingId) => {
    try {
      // CompleteRecordingUseCaseを使用して録画を完了状態にする
      await completeRecordingUseCase.execute({ recordingId });
      await loadRecordings();
      console.log('✅ Recording recovered:', recordingId);
      return true;
    } catch (err) {
      console.error('❌ Failed to recover recording:', err);
      alert('録画の復元に失敗しました');
      return false;
    }
  };

  const discardRecoveryRecording = async (recordingId: RecordingId) => {
    if (!confirm('この録画を削除してもよろしいですか？この操作は取り消せません。')) {
      return false;
    }

    try {
      await deleteRecordingUseCase.execute({ recordingId });
      await loadRecordings();
      console.log('🗑️ Recovery recording discarded:', recordingId);
      return true;
    } catch (err) {
      console.error('❌ Failed to discard recording:', err);
      alert('録画の削除に失敗しました');
      return false;
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
        alert(`再アップロード完了: 成功 ${successCount}件, 失敗 ${failCount}件`);
      }
    } catch (err) {
      console.error('❌ [useSessionManager] Resume failed:', err);
      alert('再アップロードに失敗しました');
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
    setRecoveryRecording,
    loadRecordings,
    deleteRecording,
    clearAllRecordings,
    recoverRecording,
    discardRecoveryRecording,
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
    setRecoverySession: setRecoveryRecording,
    loadSessions: loadRecordings,
    deleteSession: deleteRecording,
    clearAllSessions: clearAllRecordings,
    recoverSession: recoverRecording,
    discardRecoverySession: discardRecoveryRecording,
  };
};
