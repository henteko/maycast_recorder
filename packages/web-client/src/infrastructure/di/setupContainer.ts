import { DIContainer } from './DIContainer';
import { IndexedDBRecordingRepository } from '../repositories/IndexedDBRecordingRepository';
import { OPFSChunkRepository } from '../repositories/OPFSChunkRepository';
import { BrowserMediaStreamService } from '../services/BrowserMediaStreamService';
import { RemoteUploadStrategy } from '../services/RemoteUploadStrategy';
import { RecordingAPIClient } from '../api/recording-api';
import { getServerUrl } from '../config/serverConfig';
import { ResumeUploadManager } from '../upload/ResumeUploadManager';

// Use Cases
import { StartRecordingUseCase } from '../../domain/usecases/StartRecording.usecase';
import { SaveChunkUseCase } from '../../domain/usecases/SaveChunk.usecase';
import { CompleteRecordingUseCase } from '../../domain/usecases/CompleteRecording.usecase';
import { DownloadRecordingUseCase } from '../../domain/usecases/DownloadRecording.usecase';
import { DeleteRecordingUseCase } from '../../domain/usecases/DeleteRecording.usecase';
import { ListRecordingsUseCase } from '../../domain/usecases/ListRecordings.usecase';

import type { IRecordingRepository } from '../../domain/repositories/IRecordingRepository';
import type { IChunkRepository } from '../../domain/repositories/IChunkRepository';
import type { IMediaStreamService } from '../../domain/services/IMediaStreamService';
import type { IUploadStrategy } from '../../domain/services/IUploadStrategy';

/**
 * DIコンテナのセットアップ
 */
export function setupContainer(): DIContainer {
  const container = DIContainer.getInstance();

  // すでにセットアップ済みの場合はスキップ
  if (container.has('RecordingRepository')) {
    return container;
  }

  // Repositories
  const recordingRepository = new IndexedDBRecordingRepository();
  const chunkRepository = new OPFSChunkRepository();

  container.register<IRecordingRepository>('RecordingRepository', recordingRepository);
  container.register<IChunkRepository>('ChunkRepository', chunkRepository);

  // Services
  const mediaStreamService = new BrowserMediaStreamService();
  container.register<IMediaStreamService>('MediaStreamService', mediaStreamService);

  // Recording API Client
  const serverUrl = getServerUrl();
  const apiClient = new RecordingAPIClient(serverUrl);
  container.register('RecordingAPIClient', apiClient);

  // Upload Strategy
  const uploadStrategy: IUploadStrategy = new RemoteUploadStrategy(apiClient);
  container.register<IUploadStrategy>('UploadStrategy', uploadStrategy);

  // Use Cases
  const startRecordingUseCase = new StartRecordingUseCase(
    recordingRepository,
    mediaStreamService
  );
  container.register('StartRecordingUseCase', startRecordingUseCase);

  const saveChunkUseCase = new SaveChunkUseCase(chunkRepository, uploadStrategy);
  container.register('SaveChunkUseCase', saveChunkUseCase);

  const completeRecordingUseCase = new CompleteRecordingUseCase(
    recordingRepository,
    uploadStrategy
  );
  container.register('CompleteRecordingUseCase', completeRecordingUseCase);

  const downloadRecordingUseCase = new DownloadRecordingUseCase(
    recordingRepository,
    chunkRepository
  );
  container.register('DownloadRecordingUseCase', downloadRecordingUseCase);

  const deleteRecordingUseCase = new DeleteRecordingUseCase(
    recordingRepository,
    chunkRepository
  );
  container.register('DeleteRecordingUseCase', deleteRecordingUseCase);

  const listRecordingsUseCase = new ListRecordingsUseCase(recordingRepository);
  container.register('ListRecordingsUseCase', listRecordingsUseCase);

  // ResumeUploadManager
  const resumeUploadManager = new ResumeUploadManager(
    chunkRepository,
    apiClient,
    recordingRepository
  );
  container.register('ResumeUploadManager', resumeUploadManager);

  console.log('✅ DIContainer setup complete');

  return container;
}
