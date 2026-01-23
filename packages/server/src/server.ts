import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { RecordingStorage } from './storage/recording-storage.js';
import { createRecordingsRouter } from './routes/recordings.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Initialize storage
const recordingStorage = new RecordingStorage();

// Middleware
app.use(cors());
app.use(morgan(LOG_LEVEL === 'debug' ? 'dev' : 'combined'));
app.use(express.json());

// API routes
app.use('/api', createRecordingsRouter(recordingStorage));

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
