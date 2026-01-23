import express from 'express';
import { RecordingStorage } from '../storage/recording-storage.js';
import { StorageBackend } from '../storage/storage-backend.js';

export function createChunksRouter(
  recordingStorage: RecordingStorage,
  chunkStorage: StorageBackend
): express.Router {
  const router = express.Router();

  /**
   * POST /api/recordings/:recording_id/chunks?chunk_id=123
   * チャンクをアップロード
   */
  router.post(
    '/recordings/:recording_id/chunks',
    express.raw({ type: 'application/octet-stream', limit: '50mb' }),
    async (req, res): Promise<void> => {
      const { recording_id } = req.params;
      const chunk_id = req.query.chunk_id as string;

      // chunk_idのバリデーション
      if (!chunk_id) {
        res.status(400).json({ error: 'chunk_id query parameter is required' });
        return;
      }

      // Recordingの存在確認
      const recording = recordingStorage.getRecording(recording_id);
      if (!recording) {
        res.status(404).json({ error: 'Recording not found' });
        return;
      }

      // Recording状態の確認
      if (recording.state !== 'recording' && recording.state !== 'finalizing') {
        res.status(400).json({
          error: `Cannot upload chunks in state: ${recording.state}. Recording must be in 'recording' or 'finalizing' state.`
        });
        return;
      }

      // バイナリデータの取得
      if (!Buffer.isBuffer(req.body)) {
        res.status(400).json({ error: 'Invalid request body. Expected binary data.' });
        return;
      }

      const data = req.body as Buffer;

      try {
        // チャンクを保存
        await chunkStorage.putChunk(recording_id, chunk_id, data);

        // チャンクカウントを更新
        recordingStorage.incrementChunkCount(recording_id);

        res.status(201).json({
          message: 'Chunk uploaded successfully',
          chunk_id,
          size: data.length
        });
      } catch (error) {
        console.error('Error uploading chunk:', error);
        res.status(500).json({ error: 'Failed to upload chunk' });
      }
    }
  );

  /**
   * GET /api/recordings/:recording_id/chunks/:chunk_id
   * チャンクを取得（検証用）
   */
  router.get('/recordings/:recording_id/chunks/:chunk_id', async (req, res): Promise<void> => {
    const { recording_id, chunk_id } = req.params;

    // Recordingの存在確認
    const recording = recordingStorage.getRecording(recording_id);
    if (!recording) {
      res.status(404).json({ error: 'Recording not found' });
      return;
    }

    try {
      const data = await chunkStorage.getChunk(recording_id, chunk_id);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('Chunk not found')) {
        res.status(404).json({ error: 'Chunk not found' });
        return;
      }
      console.error('Error retrieving chunk:', error);
      res.status(500).json({ error: 'Failed to retrieve chunk' });
    }
  });

  return router;
}
