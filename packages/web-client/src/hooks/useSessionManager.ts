import { useState, useEffect, useCallback } from 'react';
import { ChunkStorage, listAllRecordings } from '../storage/chunk-storage';
import type { Recording, RecordingId } from '@maycast/common-types';

export const useSessionManager = () => {
  const [savedRecordings, setSavedRecordings] = useState<Recording[]>([]);
  const [recoveryRecording, setRecoveryRecording] = useState<Recording | null>(null);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);

  const loadRecordings = useCallback(async () => {
    try {
      const recordings = await listAllRecordings();
      setSavedRecordings(recordings);
      console.log('📂 Loaded saved recordings:', recordings.length);

      // Check for incomplete recordings (crash recovery)
      const incompleteRecordings = recordings.filter(
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
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRecordings();
  }, [loadRecordings]);

  const deleteRecording = async (recordingId: RecordingId) => {
    if (!confirm('この録画を削除しますか？')) {
      return;
    }

    try {
      const storage = new ChunkStorage(recordingId);
      await storage.deleteSession();
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
        const storage = new ChunkStorage(recording.id);
        await storage.deleteSession();
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
  }

  const recoverRecording = async (recordingId: RecordingId) => {
    try {
      const storage = new ChunkStorage(recordingId);
      await storage.completeSession();
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
      const storage = new ChunkStorage(recordingId);
      await storage.deleteSession();
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
