import express from 'express';
import { RecordingStorage } from '../storage/recording-storage.js';
import { StorageBackend } from '../storage/storage-backend.js';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';

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

      // ハッシュの検証
      const clientHash = req.headers['x-chunk-hash'] as string;
      if (!clientHash) {
        res.status(400).json({ error: 'X-Chunk-Hash header is required' });
        return;
      }

      // サーバー側でハッシュを計算
      const serverHashBytes = blake3(new Uint8Array(data));
      const serverHash = bytesToHex(serverHashBytes);

      // ハッシュの一致確認
      if (clientHash !== serverHash) {
        console.error(`❌ Hash mismatch for chunk ${chunk_id}: client=${clientHash.substring(0, 16)}..., server=${serverHash.substring(0, 16)}...`);
        res.status(400).json({
          error: 'Hash verification failed',
          expected: serverHash,
          received: clientHash
        });
        return;
      }

      console.log(`🔐 [ChunkUpload] Hash verified for chunk ${chunk_id}: ${serverHash.substring(0, 16)}...`);

      try {
        // 冪等性チェック: チャンクが既に存在するか確認
        let chunkExists = false;
        try {
          const existingChunk = await chunkStorage.getChunk(recording_id, chunk_id);
          chunkExists = true;

          // 既存チャンクのハッシュを計算
          const existingHashBytes = blake3(new Uint8Array(existingChunk));
          const existingHash = bytesToHex(existingHashBytes);

          if (existingHash === serverHash) {
            // 同じチャンクが既に存在する（冪等性）
            console.log(`✅ [ChunkUpload] Chunk ${chunk_id} already exists with matching hash (idempotent)`);
            res.status(200).json({
              message: 'Chunk already exists (idempotent)',
              chunk_id,
              size: data.length
            });
            return;
          } else {
            // ハッシュが異なる場合はコンフリクト
            console.error(`❌ [ChunkUpload] Chunk ${chunk_id} exists but hash differs`);
            res.status(409).json({
              error: 'Chunk already exists with different content',
              existing_hash: existingHash,
              new_hash: serverHash
            });
            return;
          }
        } catch (error) {
          // チャンクが存在しない場合は続行
          if (error instanceof Error && error.message.includes('Chunk not found')) {
            chunkExists = false;
          } else {
            throw error;
          }
        }

        // チャンクを保存
        await chunkStorage.putChunk(recording_id, chunk_id, data);

        // チャンクカウントを更新（新規保存の場合のみ）
        if (!chunkExists) {
          recordingStorage.incrementChunkCount(recording_id);
        }

        res.status(201).json({
          message: 'Chunk uploaded successfully',
          chunk_id,
          size: data.length,
          hash: serverHash
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
