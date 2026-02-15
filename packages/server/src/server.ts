import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { setupContainer } from './infrastructure/di/setupContainer.js';
import { createRecordingsRouter } from './presentation/routes/recordings.js';
import { createChunksRouter } from './presentation/routes/chunks.js';
import { createRoomsRouter } from './presentation/routes/rooms.js';
import { errorHandler } from './presentation/middleware/errorHandler.js';
import { createRoomAccessMiddleware } from './presentation/middleware/roomAccessMiddleware.js';

import { getWebSocketManager } from './infrastructure/websocket/WebSocketManager.js';
import type { RecordingController } from './presentation/controllers/RecordingController.js';
import type { ChunkController } from './presentation/controllers/ChunkController.js';
import type { RoomController } from './presentation/controllers/RoomController.js';
import type { UpdateRoomStateUseCase } from './domain/usecases/UpdateRoomState.usecase.js';
import type { GetRoomUseCase } from './domain/usecases/GetRoom.usecase.js';
import type { ValidateRoomAccessUseCase } from './domain/usecases/ValidateRoomAccess.usecase.js';
import type { IRecordingRepository } from './domain/repositories/IRecordingRepository.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Initialize DI Container
const container = setupContainer();
const recordingController = container.resolve<RecordingController>('RecordingController');
const chunkController = container.resolve<ChunkController>('ChunkController');
const roomController = container.resolve<RoomController>('RoomController');
const updateRoomStateUseCase = container.resolve<UpdateRoomStateUseCase>('UpdateRoomStateUseCase');
const getRoomUseCase = container.resolve<GetRoomUseCase>('GetRoomUseCase');
const validateRoomAccessUseCase = container.resolve<ValidateRoomAccessUseCase>('ValidateRoomAccessUseCase');
const recordingRepository = container.resolve<IRecordingRepository>('RecordingRepository');

// Room Access Middleware
const roomAccessMiddleware = createRoomAccessMiddleware(validateRoomAccessUseCase);

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
}));
app.use(morgan(LOG_LEVEL === 'debug' ? 'dev' : 'combined'));

// API routes
// NOTE: 各ルーターは独自のボディパーサーを持つ
// - チャンクルーター: express.raw()でバイナリデータをパース
// - レコーディングルーター: express.json()でJSONデータをパース
// - ルームルーター: express.json()でJSONデータをパース
app.use('/api', createChunksRouter(chunkController));
app.use('/api', createRecordingsRouter(recordingController));
app.use('/api', createRoomsRouter(roomController, roomAccessMiddleware));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handler (must be last)
app.use(errorHandler);

// Create HTTP server
const httpServer = createServer(app);

// Initialize WebSocket
const webSocketManager = getWebSocketManager();
webSocketManager.initialize(httpServer, CORS_ORIGIN);

// WebSocket accessKey検証コールバックを設定
webSocketManager.setValidateAccessKeyCallback(async (roomId: string, accessKey: string) => {
  try {
    await validateRoomAccessUseCase.execute({ roomId, accessKey });
    return true;
  } catch {
    return false;
  }
});

// Guest録画リンク時にparticipantNameをRecordingメタデータに保存
webSocketManager.setOnGuestRecordingLinkedCallback(async (recordingId: string, guestName: string) => {
  try {
    const recording = await recordingRepository.findById(recordingId);
    if (recording) {
      const existingMetadata = recording.getMetadata() || {};
      const updatedMetadata = { ...existingMetadata, participantName: guestName };
      recording.setMetadata(updatedMetadata);
      await recordingRepository.updateMetadata(recordingId, updatedMetadata);
    }
  } catch (err) {
    console.error(`❌ [Server] Failed to save participantName for recording ${recordingId}:`, err);
  }
});

// 全Guest同期完了時のコールバックを設定
webSocketManager.setOnAllGuestsSyncedCallback(async (roomId: string) => {
  console.log(`🎉 [Server] All guests synced for room: ${roomId}, transitioning to finished`);
  try {
    // Room状態を確認
    const room = await getRoomUseCase.execute({ roomId });
    if (room && room.state === 'finalizing') {
      // finalizing状態の場合のみfinishedに遷移
      await updateRoomStateUseCase.execute({ roomId, state: 'finished' });
      console.log(`✅ [Server] Room ${roomId} transitioned to finished`);
    }
  } catch (err) {
    console.error(`❌ [Server] Failed to transition room ${roomId} to finished:`, err);
  }
});

// Start server
httpServer.listen(PORT, () => {
  console.log(`🚀 Maycast Recorder Server running on port ${PORT}`);
  console.log(`📊 Log level: ${LOG_LEVEL}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🔌 WebSocket enabled`);
});

// HTTPサーバーのタイムアウト設定を延長
httpServer.timeout = 300000; // 5分（デフォルトは120秒）
httpServer.keepAliveTimeout = 65000; // 65秒
httpServer.headersTimeout = 66000; // keepAliveTimeoutより長く

console.log(`⏱️  Server timeout: ${httpServer.timeout}ms`);
console.log(`🔄 Keep-Alive timeout: ${httpServer.keepAliveTimeout}ms`);

export { webSocketManager };
export default app;
