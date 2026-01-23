import { useState, useEffect, useCallback } from 'react';
import type { Recording, RecordingId } from '@maycast/common-types';
import { useDI } from '../infrastructure/di';
import type { ListRecordingsUseCase } from '../domain/usecases/ListRecordings.usecase';
import type { DeleteRecordingUseCase } from '../domain/usecases/DeleteRecording.usecase';
import type { CompleteRecordingUseCase } from '../domain/usecases/CompleteRecording.usecase';

export const useSessionManager = () => {
  const [savedRecordings, setSavedRecordings] = useState<Recording[]>([]);
  const [recoveryRecording, setRecoveryRecording] = useState<Recording | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  const di = useDI();
  const listRecordingsUseCase = di.resolve<ListRecordingsUseCase>('ListRecordingsUseCase');
  const deleteRecordingUseCase = di.resolve<DeleteRecordingUseCase>('DeleteRecordingUseCase');
  const completeRecordingUseCase = di.resolve<CompleteRecordingUseCase>('CompleteRecordingUseCase');

  const loadRecordings = useCallback(async () => {
    try {
      const result = await listRecordingsUseCase.execute();
      setSavedRecordings(result.recordings);
      console.log('📂 Loaded saved recordings:', result.recordings.length);

      // Check for incomplete recordings (crash recovery)
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
  }, [listRecordingsUseCase]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRecordings();
  }, [loadRecordings]);

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
