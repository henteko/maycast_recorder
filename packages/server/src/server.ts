import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { setupContainer } from './infrastructure/di/setupContainer.js';
import { createRecordingsRouter } from './presentation/routes/recordings.js';
import { createChunksRouter } from './presentation/routes/chunks.js';
import type { RecordingController } from './presentation/controllers/RecordingController.js';
import type { ChunkController } from './presentation/controllers/ChunkController.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const STORAGE_PATH = process.env.STORAGE_PATH || './storage';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

// Initialize DI Container
const container = setupContainer(STORAGE_PATH);
const recordingController = container.resolve<RecordingController>('RecordingController');
const chunkController = container.resolve<ChunkController>('ChunkController');

// Middleware
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
}));
app.use(morgan(LOG_LEVEL === 'debug' ? 'dev' : 'combined'));

// API routes - チャンクルーターを先にマウント（express.json()の前）
app.use('/api', createChunksRouter(chunkController));

// JSON middleware（チャンクルーター以降のルートに適用）
app.use(express.json());

// その他のAPI routes
app.use('/api', createRecordingsRouter(recordingController));

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

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Maycast Recorder Server running on port ${PORT}`);
  console.log(`📊 Log level: ${LOG_LEVEL}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
});

export default app;
