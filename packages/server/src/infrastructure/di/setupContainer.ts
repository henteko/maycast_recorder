import { DIContainer } from './DIContainer.js';
import { PostgresRecordingRepository } from '../repositories/PostgresRecordingRepository.js';
import { PostgresRoomRepository } from '../repositories/PostgresRoomRepository.js';
import { LocalFileSystemChunkRepository } from '../repositories/LocalFileSystemChunkRepository.js';
import { S3ChunkRepository } from '../repositories/S3ChunkRepository.js';
import { WebSocketRoomEventPublisher } from '../events/WebSocketRoomEventPublisher.js';
import { getWebSocketManager } from '../websocket/WebSocketManager.js';
import { getPool } from '../database/PostgresClient.js';
import { getStorageConfig } from '../config/storageConfig.js';

// Use Cases - Recording
import { CreateRecordingUseCase } from '../../domain/usecases/CreateRecording.usecase.js';
import { GetRecordingUseCase } from '../../domain/usecases/GetRecording.usecase.js';
import { UpdateRecordingStateUseCase } from '../../domain/usecases/UpdateRecordingState.usecase.js';
import { UpdateRecordingMetadataUseCase } from '../../domain/usecases/UpdateRecordingMetadata.usecase.js';
import { UploadInitSegmentUseCase } from '../../domain/usecases/UploadInitSegment.usecase.js';
import { UploadChunkUseCase } from '../../domain/usecases/UploadChunk.usecase.js';
import { DownloadRecordingUseCase } from '../../domain/usecases/DownloadRecording.usecase.js';

// Use Cases - Room
import { CreateRoomUseCase } from '../../domain/usecases/CreateRoom.usecase.js';
import { GetRoomUseCase } from '../../domain/usecases/GetRoom.usecase.js';
import { GetAllRoomsUseCase } from '../../domain/usecases/GetAllRooms.usecase.js';
import { UpdateRoomStateUseCase } from '../../domain/usecases/UpdateRoomState.usecase.js';
import { GetRoomRecordingsUseCase } from '../../domain/usecases/GetRoomRecordings.usecase.js';
import { DeleteRoomUseCase } from '../../domain/usecases/DeleteRoom.usecase.js';
import { GetRoomByTokenUseCase } from '../../domain/usecases/GetRoomByToken.usecase.js';

// Controllers
import { RecordingController } from '../../presentation/controllers/RecordingController.js';
import { ChunkController } from '../../presentation/controllers/ChunkController.js';
import { RoomController } from '../../presentation/controllers/RoomController.js';

import type { IRecordingRepository } from '../../domain/repositories/IRecordingRepository.js';
import type { IChunkRepository } from '../../domain/repositories/IChunkRepository.js';
import type { IRoomRepository } from '../../domain/repositories/IRoomRepository.js';
import type { IRoomEventPublisher } from '../../domain/events/IRoomEventPublisher.js';

/**
 * DIコンテナのセットアップ (Server-side)
 *
 * ストレージバックエンドは環境変数 STORAGE_BACKEND で切り替え:
 * - 'local' (default): LocalFileSystemChunkRepository
 * - 's3': S3ChunkRepository (Cloudflare R2, LocalStack, AWS S3)
 */
export function setupContainer(): DIContainer {
  const container = DIContainer.getInstance();

  // すでにセットアップ済みの場合はスキップ
  if (container.has('RecordingRepository')) {
    return container;
  }

  // Storage Config
  const storageConfig = getStorageConfig();

  // Chunk Repository（バックエンド選択）
  let chunkRepository: IChunkRepository;
  if (storageConfig.backend === 's3') {
    chunkRepository = new S3ChunkRepository(storageConfig);
    console.log(`📦 Storage backend: S3 (endpoint: ${storageConfig.endpoint}, bucket: ${storageConfig.bucket})`);
  } else {
    chunkRepository = new LocalFileSystemChunkRepository(storageConfig.storagePath);
    console.log(`📦 Storage backend: Local filesystem (${storageConfig.storagePath})`);
  }

  // Repositories
  const pool = getPool();
  const recordingRepository = new PostgresRecordingRepository(pool);
  const roomRepository = new PostgresRoomRepository(pool);

  container.register<IRecordingRepository>('RecordingRepository', recordingRepository);
  container.register<IRoomRepository>('RoomRepository', roomRepository);
  container.register<IChunkRepository>('ChunkRepository', chunkRepository);

  // Event Publisher (WebSocket経由でイベントを配信)
  const webSocketManager = getWebSocketManager();
  const roomEventPublisher = new WebSocketRoomEventPublisher(webSocketManager);
  container.register<IRoomEventPublisher>('RoomEventPublisher', roomEventPublisher);

  // Use Cases
  const createRecordingUseCase = new CreateRecordingUseCase(
    recordingRepository,
    roomRepository,
    roomEventPublisher
  );
  container.register('CreateRecordingUseCase', createRecordingUseCase);

  const getRecordingUseCase = new GetRecordingUseCase(recordingRepository);
  container.register('GetRecordingUseCase', getRecordingUseCase);

  const updateRecordingStateUseCase = new UpdateRecordingStateUseCase(recordingRepository);
  container.register('UpdateRecordingStateUseCase', updateRecordingStateUseCase);

  const updateRecordingMetadataUseCase = new UpdateRecordingMetadataUseCase(recordingRepository);
  container.register('UpdateRecordingMetadataUseCase', updateRecordingMetadataUseCase);

  const uploadInitSegmentUseCase = new UploadInitSegmentUseCase(
    recordingRepository,
    chunkRepository
  );
  container.register('UploadInitSegmentUseCase', uploadInitSegmentUseCase);

  const uploadChunkUseCase = new UploadChunkUseCase(recordingRepository, chunkRepository);
  container.register('UploadChunkUseCase', uploadChunkUseCase);

  const downloadRecordingUseCase = new DownloadRecordingUseCase(
    recordingRepository,
    chunkRepository
  );
  container.register('DownloadRecordingUseCase', downloadRecordingUseCase);

  // Controllers
  const recordingController = new RecordingController(
    createRecordingUseCase,
    getRecordingUseCase,
    updateRecordingStateUseCase,
    updateRecordingMetadataUseCase,
    downloadRecordingUseCase
  );
  container.register('RecordingController', recordingController);

  const chunkController = new ChunkController(uploadInitSegmentUseCase, uploadChunkUseCase);
  container.register('ChunkController', chunkController);

  // Room Use Cases
  const createRoomUseCase = new CreateRoomUseCase(roomRepository);
  container.register('CreateRoomUseCase', createRoomUseCase);

  const getRoomUseCase = new GetRoomUseCase(roomRepository);
  container.register('GetRoomUseCase', getRoomUseCase);

  const getAllRoomsUseCase = new GetAllRoomsUseCase(roomRepository);
  container.register('GetAllRoomsUseCase', getAllRoomsUseCase);

  const updateRoomStateUseCase = new UpdateRoomStateUseCase(
    roomRepository,
    roomEventPublisher
  );
  container.register('UpdateRoomStateUseCase', updateRoomStateUseCase);

  const getRoomRecordingsUseCase = new GetRoomRecordingsUseCase(
    roomRepository,
    recordingRepository
  );
  container.register('GetRoomRecordingsUseCase', getRoomRecordingsUseCase);

  const deleteRoomUseCase = new DeleteRoomUseCase(roomRepository);
  container.register('DeleteRoomUseCase', deleteRoomUseCase);

  const getRoomByTokenUseCase = new GetRoomByTokenUseCase(roomRepository);
  container.register('GetRoomByTokenUseCase', getRoomByTokenUseCase);

  // Room Controller
  const roomController = new RoomController(
    createRoomUseCase,
    getRoomUseCase,
    getAllRoomsUseCase,
    updateRoomStateUseCase,
    getRoomRecordingsUseCase,
    deleteRoomUseCase,
    getRoomByTokenUseCase
  );
  container.register('RoomController', roomController);

  console.log('✅ Server DIContainer setup complete');

  return container;
}
