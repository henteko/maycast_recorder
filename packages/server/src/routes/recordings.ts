import express from 'express';
import { RecordingStorage } from '../storage/recording-storage.js';
import { UpdateStateRequest, RecordingMetadata } from '../types/recording.js';

export function createRecordingsRouter(storage: RecordingStorage): express.Router {
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

  return router;
}
