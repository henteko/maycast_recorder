import express from 'express';
import { RecordingStorage } from '../storage/recording-storage.js';
import { StorageBackend } from '../storage/storage-backend.js';
import { UpdateStateRequest, RecordingMetadata } from '../types/recording.js';

export function createRecordingsRouter(
  storage: RecordingStorage,
  chunkStorage: StorageBackend
): express.Router {
  const router = express.Router();

  /**
   * POST /api/recordings
   * 新しいRecordingを作成
   */
  router.post('/recordings', (_req, res) => {
    try {
      const recording = storage.createRecording();

      res.status(201).json({
        recording_id: recording.id,
        created_at: recording.createdAt.toISOString(),
        state: recording.state
      });
    } catch (error) {
      console.error('Error creating recording:', error);
      res.status(500).json({ error: 'Failed to create recording' });
    }
  });

  /**
   * GET /api/recordings/:recording_id
   * Recording情報を取得
   */
  router.get('/recordings/:recording_id', (req, res): void => {
    const { recording_id } = req.params;

    const recording = storage.getRecording(recording_id);
    if (!recording) {
      res.status(404).json({ error: 'Recording not found' });
      return;
    }

    res.json({
      id: recording.id,
      state: recording.state,
      created_at: recording.createdAt.toISOString(),
      started_at: recording.startedAt?.toISOString(),
      finished_at: recording.finishedAt?.toISOString(),
      metadata: recording.metadata,
      chunk_count: recording.chunkCount,
      room_id: recording.roomId
    });
  });

  /**
   * PATCH /api/recordings/:recording_id/state
   * Recording状態を更新
   */
  router.patch('/recordings/:recording_id/state', (req, res): void => {
    const { recording_id } = req.params;
    const { state } = req.body as UpdateStateRequest;

    if (!state) {
      res.status(400).json({ error: 'Missing required field: state' });
      return;
    }

    const recording = storage.getRecording(recording_id);
    if (!recording) {
      res.status(404).json({ error: 'Recording not found' });
      return;
    }

    try {
      storage.updateState(recording_id, state);
      res.json({ message: 'State updated successfully', state });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({ error: errorMessage });
    }
  });

  /**
   * PATCH /api/recordings/:recording_id/metadata
   * Recordingメタデータを保存
   */
  router.patch('/recordings/:recording_id/metadata', (req, res): void => {
    const { recording_id } = req.params;
    const metadata = req.body as RecordingMetadata;

    const recording = storage.getRecording(recording_id);
    if (!recording) {
      res.status(404).json({ error: 'Recording not found' });
      return;
    }

    const success = storage.updateMetadata(recording_id, metadata);
    if (!success) {
      res.status(500).json({ error: 'Failed to update metadata' });
      return;
    }

    res.json({ message: 'Metadata updated successfully' });
  });

  /**
   * GET /api/recordings/:recording_id/download
   * Recordingのチャンクを結合してMP4ファイルとしてダウンロード
   */
  router.get('/recordings/:recording_id/download', async (req, res): Promise<void> => {
    const { recording_id } = req.params;

    // Recording存在確認
    const recording = storage.getRecording(recording_id);
    if (!recording) {
      res.status(404).json({ error: 'Recording not found' });
      return;
    }

    // Recording状態確認
    if (recording.state !== 'synced') {
      res.status(400).json({
        error: `Recording is not ready for download. Current state: ${recording.state}. Expected state: synced`
      });
      return;
    }

    try {
      // Init Segmentを取得
      let initSegment: Buffer;
      try {
        initSegment = await chunkStorage.getInitSegment(recording_id);
      } catch (error) {
        console.error(`❌ [Download] Init segment not found for recording ${recording_id}:`, error);
        res.status(404).json({ error: 'Init segment not found for this recording' });
        return;
      }

      // チャンク一覧を取得（ソート済み）
      const chunkIds = await chunkStorage.listChunks(recording_id);

      if (chunkIds.length === 0) {
        res.status(404).json({ error: 'No chunks found for this recording' });
        return;
      }

      console.log(`📥 [Download] Starting download for recording ${recording_id} (init + ${chunkIds.length} chunks)`);
      console.log(`📋 [Download] Chunk order: [${chunkIds.slice(0, 10).join(', ')}${chunkIds.length > 10 ? ', ...' : ''}]`);

      // レスポンスヘッダーを設定
      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="recording-${recording_id}.mp4"`);

      // 1. Init Segmentを最初に送信
      res.write(initSegment);
      console.log(`📤 [Download] Sent init segment: ${initSegment.length} bytes`);

      // 2. チャンクを順番にストリームで送信
      for (let i = 0; i < chunkIds.length; i++) {
        const chunkId = chunkIds[i];
        try {
          const chunkData = await chunkStorage.getChunk(recording_id, chunkId);

          // レスポンスに書き込み
          res.write(chunkData);

          if ((i + 1) % 10 === 0 || i === chunkIds.length - 1) {
            console.log(`📤 [Download] Sent chunk ${i + 1}/${chunkIds.length} (${chunkId})`);
          }
        } catch (error) {
          console.error(`❌ [Download] Failed to read chunk ${chunkId}:`, error);
          // チャンクの読み込みに失敗した場合はエラーログを出力して続行
          // （既にレスポンスヘッダーを送信済みなので、エラーレスポンスは返せない）
        }
      }

      // ストリーム終了
      res.end();
      console.log(`✅ [Download] Download completed for recording ${recording_id}`);
    } catch (error) {
      console.error(`❌ [Download] Failed to download recording ${recording_id}:`, error);

      // まだレスポンスヘッダーを送信していなければエラーレスポンスを返す
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to download recording' });
      } else {
        // 既にヘッダーを送信済みの場合は接続を閉じる
        res.end();
      }
    }
  });

  return router;
}
