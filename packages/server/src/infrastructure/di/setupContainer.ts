import { DIContainer } from './DIContainer';
import { InMemoryRecordingRepository } from '../repositories/InMemoryRecordingRepository';
import { LocalFileSystemChunkRepository } from '../repositories/LocalFileSystemChunkRepository';

// Use Cases
import { CreateRecordingUseCase } from '../../domain/usecases/CreateRecording.usecase';
import { GetRecordingUseCase } from '../../domain/usecases/GetRecording.usecase';
import { UpdateRecordingStateUseCase } from '../../domain/usecases/UpdateRecordingState.usecase';
import { UpdateRecordingMetadataUseCase } from '../../domain/usecases/UpdateRecordingMetadata.usecase';
import { UploadInitSegmentUseCase } from '../../domain/usecases/UploadInitSegment.usecase';
import { UploadChunkUseCase } from '../../domain/usecases/UploadChunk.usecase';
import { DownloadRecordingUseCase } from '../../domain/usecases/DownloadRecording.usecase';

// Controllers
import { RecordingController } from '../../presentation/controllers/RecordingController';
import { ChunkController } from '../../presentation/controllers/ChunkController';

import type { IRecordingRepository } from '../../domain/repositories/IRecordingRepository';
import type { IChunkRepository } from '../../domain/repositories/IChunkRepository';

/**
 * DIコンテナのセットアップ (Server-side)
 *
 * @param storagePath ストレージのベースパス
 */
export function setupContainer(storagePath: string = './recordings-data'): DIContainer {
  const container = DIContainer.getInstance();

  // すでにセットアップ済みの場合はスキップ
  if (container.has('RecordingRepository')) {
    return container;
  }

  // Repositories
  const recordingRepository = new InMemoryRecordingRepository();
  const chunkRepository = new LocalFileSystemChunkRepository(storagePath);

  container.register<IRecordingRepository>('RecordingRepository', recordingRepository);
  container.register<IChunkRepository>('ChunkRepository', chunkRepository);

  // Use Cases
  const createRecordingUseCase = new CreateRecordingUseCase(recordingRepository);
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

  console.log('✅ Server DIContainer setup complete');

  return container;
}
