# クリーンアーキテクチャへのリファクタリング提案

## 📊 現状分析

### コードベースの概要

Maycast Recorderは以下の構造で実装されています：

```
maycast_recorder/
├── packages/
│   ├── common-types/        # 共有型定義
│   ├── wasm-core/           # WASM Muxer（Rust）
│   ├── server/              # Express バックエンド
│   └── web-client/          # React フロントエンド
```

### 現在のアーキテクチャ

```
┌─────────────────────────────────────────────────┐
│ React Component Layer (UI)                      │
│ - Recorder.tsx, LibraryPage, SettingsPage       │
├─────────────────────────────────────────────────┤
│ Custom Hooks Layer (Business Logic)             │
│ - useRecorder, useEncoders, useMediaStream      │
├─────────────────────────────────────────────────┤
│ Storage Strategy Layer (Abstraction)            │
│ - IStorageStrategy                              │
│ - StandaloneStorageStrategy                     │
│ - RemoteStorageStrategy                         │
├─────────────────────────────────────────────────┤
│ Data Access Layer (Storage)                     │
│ - ChunkStorage (OPFS + IndexedDB)              │
│ - ChunkUploader (Queue Management)              │
│ - RecordingAPIClient (HTTP)                     │
├─────────────────────────────────────────────────┤
│ Low-level Storage (OPFS, IndexedDB, HTTP)      │
└─────────────────────────────────────────────────┘
```

## 🔴 主要な問題点

### 優先度別課題一覧

| 優先度 | 課題 | 影響度 | 実装難易度 | 詳細 |
|--------|------|--------|-----------|------|
| 🔴 **最優先** | Entities層の欠如 | 高 | 中 | ドメインモデルが単なる型定義で、ビジネスルールが散在 |
| 🔴 **最優先** | Use Case層の不明確性 | 高 | 高 | ビジネスロジックがHooksに分散、再利用困難 |
| 🔴 **最優先** | 依存性注入の不足 | 高 | 高 | 直接インスタンス化でテスト困難、モック化不可 |
| 🟡 **高** | 状態管理の分散 | 高 | 高 | React/IndexedDB/OPFS/メモリの整合性管理なし |
| 🟡 **高** | 型の重複 | 中 | 低 | Recording型が3箇所に独立定義され不整合リスク |
| 🟡 **高** | サーバー側の構造 | 中 | 高 | routesにビジネスロジック実装、Controller層なし |
| 🟢 **中** | Adapter層の複雑性 | 中 | 中 | RemoteStorageStrategyが過度に複雑、責務過多 |
| 🟢 **中** | エラーハンドリング | 中 | 中 | try-catchで単にlog + alert、リカバリー戦略なし |

### 詳細な問題点

#### 1. Entities層の欠如

**現状:**
```typescript
// 単なる型定義
interface Recording {
  id: RecordingId;
  state: RecordingState;
  // ...
}
```

**問題:**
- ビジネスルール（状態遷移検証など）が散在
- routes/recordings.ts で状態遷移チェック
- useRecorder.ts で状態管理
- 重複したバリデーションロジック

**影響:**
- バグの温床（検証漏れ）
- 保守性の低下
- テスト困難

#### 2. Use Case層の不明確性

**現状:**
- useRecorder: 録画開始/停止
- useEncoders: エンコード + Mux + 保存
- useDownload: ダウンロード処理
- routes/recordings.ts: サーバー側処理

**問題:**
- ビジネスロジックがUIレイヤー（Hooks）に混在
- 用途ごとのUse Caseが明確でない
- コードの再利用が困難

**例: 現在の録画開始フロー**
```typescript
// useRecorder.ts
const startRecording = async () => {
  const mediaStream = await getDisplayMedia(); // ❌ UIレイヤーでビジネスロジック
  const storage = new ChunkStorage(recordingId); // ❌ 直接インスタンス化
  storageStrategy.initSession(recordingId); // ✅ これは良い
};
```

#### 3. 依存性注入の不足

**現状:**
```typescript
// RemoteStorageStrategy.ts
export class RemoteStorageStrategy implements IStorageStrategy {
  async initSession(recordingId) {
    const storage = new ChunkStorage(recordingId); // ❌ 直接インスタンス化
    const uploader = new ChunkUploader(...); // ❌ 直接インスタンス化
  }
}
```

**問題:**
- テスト時にモック化できない
- 実装の切り替えが困難
- 結合度が高い

#### 4. 型の重複と不整合

**重複箇所:**
1. `packages/common-types/src/recording.ts`
2. `packages/server/src/types/recording.ts`
3. `packages/web-client/src/api/recording-api.ts`

**不整合の例:**
```typescript
// common-types
interface RecordingMetadata {
  videoCodec: string;
  audioCodec: string;
  width: number;
  // ...
}

// server/types
interface RecordingMetadata {
  displayName?: string;
  deviceInfo?: { browser, os, ... };
  videoConfig?: { width, height, ... };
  // 全く異なる構造！
}
```

## 🎯 リファクタリング提案

### クリーンアーキテクチャの理想的な4層構造

```
┌─────────────────────────────────────────┐
│ Frameworks & Drivers（最外層）          │
│ - React, Express, OPFS, IndexedDB       │
├─────────────────────────────────────────┤
│ Interface Adapters                      │
│ - Controllers, Presenters, Gateways     │
├─────────────────────────────────────────┤
│ Application Business Rules（Use Cases） │
│ - 独立したビジネスロジック               │
├─────────────────────────────────────────┤
│ Enterprise Business Rules（Entities）   │
│ - Core domain models（最内層）          │
└─────────────────────────────────────────┘
```

### 依存関係の方向

```
外層 → 内層への依存のみ許可
（内層は外層を知らない）

Frameworks & Drivers
    ↓
Interface Adapters
    ↓
Use Cases
    ↓
Entities
```

## 📋 実装計画

### Phase 1: 基盤整備（最優先）

#### 1-1. Entities層の構築

**目的:** ビジネスルールをドメインモデルに集約

**実装:**

```typescript
// packages/common-types/src/entities/Recording.entity.ts
export class RecordingEntity {
  private constructor(
    private readonly id: RecordingId,
    private state: RecordingState,
    private metadata?: RecordingMetadata,
    private readonly createdAt: Date,
    private startedAt?: Date,
    private finishedAt?: Date
  ) {}

  // Factory methods
  static create(id: RecordingId): RecordingEntity {
    return new RecordingEntity(id, 'standby', undefined, new Date());
  }

  static reconstitute(data: Recording): RecordingEntity {
    return new RecordingEntity(
      data.id,
      data.state,
      data.metadata,
      new Date(data.createdAt),
      data.startedAt ? new Date(data.startedAt) : undefined,
      data.finishedAt ? new Date(data.finishedAt) : undefined
    );
  }

  // ビジネスルール: 状態遷移の検証
  startRecording(): void {
    if (this.state !== 'standby') {
      throw new InvalidStateTransitionError(
        `Cannot start recording from state: ${this.state}`
      );
    }
    this.state = 'recording';
    this.startedAt = new Date();
  }

  finalize(): void {
    if (this.state !== 'recording') {
      throw new InvalidStateTransitionError(
        `Cannot finalize from state: ${this.state}`
      );
    }
    this.state = 'finalizing';
    this.finishedAt = new Date();
  }

  markAsSynced(): void {
    if (this.state !== 'finalizing') {
      throw new InvalidStateTransitionError(
        `Cannot sync from state: ${this.state}`
      );
    }
    this.state = 'synced';
  }

  // ビジネスルール: メタデータ設定
  setMetadata(metadata: RecordingMetadata): void {
    if (this.state !== 'standby' && this.state !== 'recording') {
      throw new InvalidOperationError(
        'Cannot update metadata after recording is finalized'
      );
    }
    this.metadata = metadata;
  }

  // Getters
  getId(): RecordingId { return this.id; }
  getState(): RecordingState { return this.state; }
  getMetadata(): RecordingMetadata | undefined { return this.metadata; }

  // DTOへの変換
  toDTO(): Recording {
    return {
      id: this.id,
      state: this.state,
      metadata: this.metadata,
      createdAt: this.createdAt.toISOString(),
      startedAt: this.startedAt?.toISOString(),
      finishedAt: this.finishedAt?.toISOString(),
      chunkCount: 0,
      totalSize: 0,
    };
  }
}
```

**ドメインエラーの定義:**

```typescript
// packages/common-types/src/errors/DomainErrors.ts
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidStateTransitionError extends DomainError {}
export class InvalidOperationError extends DomainError {}
export class InvalidChunkError extends DomainError {}
export class RecordingNotFoundError extends DomainError {}
```

**作業項目:**
- [ ] RecordingEntity の実装
- [ ] ChunkEntity の実装
- [ ] ドメインエラークラスの実装
- [ ] ValueObject の実装（RecordingId, ChunkId）
- [ ] ユニットテストの作成

**所要時間:** 2日

---

#### 1-2. Repository Interfaceの定義

**目的:** データアクセスの抽象化

**実装:**

```typescript
// packages/web-client/src/domain/repositories/IRecordingRepository.ts
export interface IRecordingRepository {
  save(recording: RecordingEntity): Promise<void>;
  findById(id: RecordingId): Promise<RecordingEntity | null>;
  findAll(): Promise<RecordingEntity[]>;
  delete(id: RecordingId): Promise<void>;
  updateState(id: RecordingId, state: RecordingState): Promise<void>;
  updateMetadata(id: RecordingId, metadata: RecordingMetadata): Promise<void>;
}

// packages/web-client/src/domain/repositories/IChunkRepository.ts
export interface IChunkRepository {
  save(chunk: ChunkData): Promise<ChunkId>;
  findById(recordingId: RecordingId, chunkId: ChunkId): Promise<ArrayBuffer | null>;
  findAllByRecording(recordingId: RecordingId): Promise<ChunkMetadata[]>;
  delete(recordingId: RecordingId, chunkId: ChunkId): Promise<void>;
  deleteAllByRecording(recordingId: RecordingId): Promise<void>;
}

// packages/web-client/src/domain/services/IMediaStreamService.ts
export interface IMediaStreamService {
  captureScreen(options: ScreenCaptureOptions): Promise<MediaStream>;
  captureCamera(options: CameraCaptureOptions): Promise<MediaStream>;
  stopStream(stream: MediaStream): void;
}

// packages/web-client/src/domain/services/IUploadStrategy.ts
export interface IUploadStrategy {
  upload(params: UploadParams): Promise<void>;
  getProgress(): UploadProgress;
}
```

**作業項目:**
- [ ] IRecordingRepository の定義
- [ ] IChunkRepository の定義
- [ ] IMediaStreamService の定義
- [ ] IUploadStrategy の定義
- [ ] 関連する型定義の作成

**所要時間:** 1日

---

#### 1-3. Use Case層の構築

**目的:** ビジネスロジックの明確化と再利用性向上

**主要なUse Case:**

1. **StartRecordingUseCase** - 録画開始
2. **SaveChunkUseCase** - チャンク保存
3. **CompleteRecordingUseCase** - 録画完了
4. **UploadChunkUseCase** - チャンクアップロード
5. **DownloadRecordingUseCase** - 録画ダウンロード
6. **RecoverIncompleteRecordingUseCase** - クラッシュリカバリー

**実装例:**

```typescript
// packages/web-client/src/domain/usecases/StartRecording.usecase.ts
export interface StartRecordingRequest {
  screenOptions?: ScreenCaptureOptions;
  cameraOptions?: CameraCaptureOptions;
}

export interface StartRecordingResponse {
  recordingId: RecordingId;
  mediaStream: MediaStream;
  recording: Recording;
}

export class StartRecordingUseCase {
  constructor(
    private recordingRepository: IRecordingRepository,
    private chunkRepository: IChunkRepository,
    private mediaStreamService: IMediaStreamService
  ) {}

  async execute(request: StartRecordingRequest): Promise<StartRecordingResponse> {
    // 1. Recording Entityの作成
    const recordingId = generateRecordingId();
    const recording = RecordingEntity.create(recordingId);

    // 2. メディアストリームの取得
    const mediaStream = await this.mediaStreamService.captureScreen(
      request.screenOptions ?? {}
    );

    // 3. Recording情報の永続化
    await this.recordingRepository.save(recording);

    // 4. 録画開始状態に遷移
    recording.startRecording();
    await this.recordingRepository.updateState(recordingId, recording.getState());

    return {
      recordingId,
      mediaStream,
      recording: recording.toDTO()
    };
  }
}
```

```typescript
// packages/web-client/src/domain/usecases/SaveChunk.usecase.ts
export interface SaveChunkRequest {
  recordingId: RecordingId;
  data: ArrayBuffer;
  timestamp: number;
  isInitSegment: boolean;
}

export interface SaveChunkResponse {
  chunkId: ChunkId;
}

export class SaveChunkUseCase {
  constructor(
    private chunkRepository: IChunkRepository,
    private uploadStrategy: IUploadStrategy
  ) {}

  async execute(request: SaveChunkRequest): Promise<SaveChunkResponse> {
    // 1. チャンクの検証
    if (request.data.byteLength === 0) {
      throw new InvalidChunkError('Chunk data is empty');
    }

    // 2. ローカル保存
    const chunkId = await this.chunkRepository.save({
      recordingId: request.recordingId,
      data: request.data,
      timestamp: request.timestamp,
      isInitSegment: request.isInitSegment
    });

    // 3. アップロード戦略に委譲（Remote modeの場合のみ実行）
    try {
      await this.uploadStrategy.upload({
        recordingId: request.recordingId,
        chunkId,
        data: request.data
      });
    } catch (error) {
      // アップロード失敗してもローカル保存は成功
      console.warn('Upload failed, but chunk saved locally', error);
    }

    return { chunkId };
  }
}
```

```typescript
// packages/web-client/src/domain/usecases/CompleteRecording.usecase.ts
export interface CompleteRecordingRequest {
  recordingId: RecordingId;
  metadata?: RecordingMetadata;
}

export class CompleteRecordingUseCase {
  constructor(
    private recordingRepository: IRecordingRepository,
    private uploadStrategy: IUploadStrategy
  ) {}

  async execute(request: CompleteRecordingRequest): Promise<void> {
    // 1. Recording Entityの取得
    const recording = await this.recordingRepository.findById(request.recordingId);
    if (!recording) {
      throw new RecordingNotFoundError(`Recording not found: ${request.recordingId}`);
    }

    // 2. メタデータの設定
    if (request.metadata) {
      recording.setMetadata(request.metadata);
      await this.recordingRepository.updateMetadata(
        request.recordingId,
        request.metadata
      );
    }

    // 3. 状態をfinalizingに遷移
    recording.finalize();
    await this.recordingRepository.updateState(
      request.recordingId,
      recording.getState()
    );

    // 4. 残りのチャンクのアップロード完了を待つ
    await this.uploadStrategy.waitForCompletion?.();

    // 5. 状態をsyncedに遷移
    recording.markAsSynced();
    await this.recordingRepository.updateState(
      request.recordingId,
      recording.getState()
    );
  }
}
```

**作業項目:**
- [ ] StartRecordingUseCase の実装
- [ ] SaveChunkUseCase の実装
- [ ] CompleteRecordingUseCase の実装
- [ ] UploadChunkUseCase の実装
- [ ] DownloadRecordingUseCase の実装
- [ ] RecoverIncompleteRecordingUseCase の実装
- [ ] 各Use Caseのユニットテスト

**所要時間:** 3-4日

---

### Phase 2: 依存性注入の導入

#### 2-1. DIコンテナの実装

**目的:** 依存関係の管理と注入の自動化

**実装:**

```typescript
// packages/web-client/src/infrastructure/di/container.ts
export class DIContainer {
  private static instance: DIContainer;
  private services = new Map<string, any>();

  static getInstance(): DIContainer {
    if (!DIContainer.instance) {
      DIContainer.instance = new DIContainer();
      DIContainer.instance.registerDefaults();
    }
    return DIContainer.instance;
  }

  registerDefaults() {
    // Repositories
    this.register<IRecordingRepository>(
      'RecordingRepository',
      new IndexedDBRecordingRepository()
    );
    this.register<IChunkRepository>(
      'ChunkRepository',
      new OPFSChunkRepository()
    );

    // Services
    this.register<IMediaStreamService>(
      'MediaStreamService',
      new BrowserMediaStreamService()
    );

    // Upload Strategy（環境に応じて切り替え）
    const uploadStrategy = this.createUploadStrategy();
    this.register<IUploadStrategy>('UploadStrategy', uploadStrategy);

    // Use Cases
    this.registerUseCases();
  }

  private createUploadStrategy(): IUploadStrategy {
    const mode = window.location.pathname.includes('/remote') ? 'remote' : 'standalone';

    if (mode === 'remote') {
      return new RemoteUploadStrategy(
        this.resolve('RecordingAPIClient'),
        this.resolve('ChunkUploader')
      );
    } else {
      return new NoOpUploadStrategy();
    }
  }

  private registerUseCases() {
    this.register<StartRecordingUseCase>(
      'StartRecordingUseCase',
      new StartRecordingUseCase(
        this.resolve('RecordingRepository'),
        this.resolve('ChunkRepository'),
        this.resolve('MediaStreamService')
      )
    );

    this.register<SaveChunkUseCase>(
      'SaveChunkUseCase',
      new SaveChunkUseCase(
        this.resolve('ChunkRepository'),
        this.resolve('UploadStrategy')
      )
    );

    this.register<CompleteRecordingUseCase>(
      'CompleteRecordingUseCase',
      new CompleteRecordingUseCase(
        this.resolve('RecordingRepository'),
        this.resolve('UploadStrategy')
      )
    );

    // その他のUse Cases...
  }

  register<T>(name: string, service: T): void {
    this.services.set(name, service);
  }

  resolve<T>(name: string): T {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service not found: ${name}`);
    }
    return service;
  }

  // テスト用: モックの登録
  registerMock<T>(name: string, mock: T): void {
    this.services.set(name, mock);
  }
}
```

**Reactコンテキストでの提供:**

```typescript
// packages/web-client/src/App.tsx
import { DIContainer } from './infrastructure/di/container';

const container = DIContainer.getInstance();

export const DIContext = createContext<DIContainer>(container);

export function useDI() {
  return useContext(DIContext);
}

function App() {
  return (
    <DIContext.Provider value={container}>
      <Router>
        {/* ... */}
      </Router>
    </DIContext.Provider>
  );
}
```

**作業項目:**
- [ ] DIContainer の実装
- [ ] React Context の設定
- [ ] useDI Hook の実装
- [ ] テスト用のモック登録機能

**所要時間:** 2日

---

#### 2-2. Infrastructure層のRepository実装

**目的:** 既存のストレージコードをRepository実装に移行

**実装:**

```typescript
// packages/web-client/src/infrastructure/repositories/IndexedDBRecordingRepository.ts
import { IRecordingRepository } from '../../domain/repositories/IRecordingRepository';
import { RecordingEntity } from '@maycast/common-types';
import { openMetadataDB } from '../storage/metadata';

export class IndexedDBRecordingRepository implements IRecordingRepository {
  async save(recording: RecordingEntity): Promise<void> {
    const db = await openMetadataDB();
    const dto = recording.toDTO();

    await db.put('recordings', {
      ...dto,
      createdAt: new Date(dto.createdAt),
      startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
      finishedAt: dto.finishedAt ? new Date(dto.finishedAt) : undefined
    });
  }

  async findById(id: RecordingId): Promise<RecordingEntity | null> {
    const db = await openMetadataDB();
    const data = await db.get('recordings', id);

    if (!data) return null;

    return RecordingEntity.reconstitute(data);
  }

  async findAll(): Promise<RecordingEntity[]> {
    const db = await openMetadataDB();
    const allData = await db.getAll('recordings');

    return allData.map(data => RecordingEntity.reconstitute(data));
  }

  async delete(id: RecordingId): Promise<void> {
    const db = await openMetadataDB();
    await db.delete('recordings', id);
  }

  async updateState(id: RecordingId, state: RecordingState): Promise<void> {
    const recording = await this.findById(id);
    if (!recording) {
      throw new RecordingNotFoundError(`Recording not found: ${id}`);
    }

    const db = await openMetadataDB();
    const data = await db.get('recordings', id);
    data.state = state;
    await db.put('recordings', data);
  }

  async updateMetadata(id: RecordingId, metadata: RecordingMetadata): Promise<void> {
    const db = await openMetadataDB();
    const data = await db.get('recordings', id);
    data.metadata = metadata;
    await db.put('recordings', data);
  }
}
```

```typescript
// packages/web-client/src/infrastructure/repositories/OPFSChunkRepository.ts
import { IChunkRepository } from '../../domain/repositories/IChunkRepository';
import * as OPFS from '../storage/opfs';
import { openMetadataDB } from '../storage/metadata';

export class OPFSChunkRepository implements IChunkRepository {
  async save(chunk: ChunkData): Promise<ChunkId> {
    const { recordingId, data, timestamp, isInitSegment } = chunk;

    // OPFS に保存
    const chunkId = isInitSegment
      ? 'init'
      : await this.getNextChunkId(recordingId);

    await OPFS.writeChunk(recordingId, chunkId, data);

    // メタデータを IndexedDB に保存
    const db = await openMetadataDB();
    await db.add('chunks', {
      recordingId,
      chunkId,
      timestamp,
      size: data.byteLength,
      isInitSegment
    });

    return chunkId;
  }

  async findById(recordingId: RecordingId, chunkId: ChunkId): Promise<ArrayBuffer | null> {
    return await OPFS.readChunk(recordingId, chunkId);
  }

  async findAllByRecording(recordingId: RecordingId): Promise<ChunkMetadata[]> {
    const db = await openMetadataDB();
    const index = db.transaction('chunks').store.index('recordingId');
    return await index.getAll(recordingId);
  }

  async delete(recordingId: RecordingId, chunkId: ChunkId): Promise<void> {
    await OPFS.deleteChunk(recordingId, chunkId);

    const db = await openMetadataDB();
    const chunks = await this.findAllByRecording(recordingId);
    const chunk = chunks.find(c => c.chunkId === chunkId);
    if (chunk) {
      await db.delete('chunks', chunk.id);
    }
  }

  async deleteAllByRecording(recordingId: RecordingId): Promise<void> {
    await OPFS.deleteRecording(recordingId);

    const db = await openMetadataDB();
    const chunks = await this.findAllByRecording(recordingId);
    for (const chunk of chunks) {
      await db.delete('chunks', chunk.id);
    }
  }

  private async getNextChunkId(recordingId: RecordingId): Promise<ChunkId> {
    const chunks = await this.findAllByRecording(recordingId);
    const numericChunks = chunks
      .filter(c => !c.isInitSegment)
      .map(c => parseInt(c.chunkId, 10))
      .filter(n => !isNaN(n));

    return numericChunks.length === 0
      ? '0'
      : String(Math.max(...numericChunks) + 1);
  }
}
```

**作業項目:**
- [ ] IndexedDBRecordingRepository の実装
- [ ] OPFSChunkRepository の実装
- [ ] BrowserMediaStreamService の実装
- [ ] RemoteUploadStrategy の実装
- [ ] NoOpUploadStrategy の実装
- [ ] 各Repository のユニットテスト

**所要時間:** 2-3日

---

#### 2-3. Hooksのリファクタリング

**目的:** HooksをPresentation層として、Use Caseを呼び出すだけにする

**実装:**

```typescript
// packages/web-client/src/presentation/hooks/useRecorder.ts
import { useDI } from '../../App';
import { StartRecordingUseCase } from '../../domain/usecases/StartRecording.usecase';
import { CompleteRecordingUseCase } from '../../domain/usecases/CompleteRecording.usecase';

export type RecorderState = 'idle' | 'starting' | 'recording' | 'stopping' | 'error';

export function useRecorder() {
  const di = useDI();
  const startRecordingUseCase = di.resolve<StartRecordingUseCase>('StartRecordingUseCase');
  const completeRecordingUseCase = di.resolve<CompleteRecordingUseCase>('CompleteRecordingUseCase');

  const [state, setState] = useState<RecorderState>('idle');
  const [recordingId, setRecordingId] = useState<RecordingId | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<Error | null>(null);

  const startRecording = useCallback(async (options: StartRecordingOptions) => {
    try {
      setState('starting');
      setError(null);

      const result = await startRecordingUseCase.execute(options);

      setRecordingId(result.recordingId);
      setMediaStream(result.mediaStream);
      setState('recording');

      return result;
    } catch (err) {
      setState('error');
      setError(err as Error);
      throw err;
    }
  }, [startRecordingUseCase]);

  const stopRecording = useCallback(async (metadata?: RecordingMetadata) => {
    if (!recordingId) {
      throw new Error('No active recording');
    }

    try {
      setState('stopping');
      setError(null);

      await completeRecordingUseCase.execute({ recordingId, metadata });

      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
      }

      setState('idle');
      setRecordingId(null);
      setMediaStream(null);
    } catch (err) {
      setState('error');
      setError(err as Error);
      throw err;
    }
  }, [recordingId, mediaStream, completeRecordingUseCase]);

  return {
    state,
    recordingId,
    mediaStream,
    error,
    startRecording,
    stopRecording
  };
}
```

**変更前後の比較:**

```typescript
// 変更前: useEncoders.ts（ビジネスロジックが混在）
const videoEncoderRef = useRef<VideoEncoder | null>(null);
videoEncoderRef.current = new VideoEncoder({
  output: async (chunk) => {
    // ❌ Hookの中でビジネスロジック実装
    const buffer = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(buffer);

    // ❌ 直接storageStrategyを呼び出し
    await storageStrategy.saveChunk(recordingId, buffer, chunk.timestamp);
  },
  error: (e) => console.error(e)
});

// 変更後: useEncoders.ts（Use Caseを呼び出すだけ）
const di = useDI();
const saveChunkUseCase = di.resolve<SaveChunkUseCase>('SaveChunkUseCase');

const videoEncoderRef = useRef<VideoEncoder | null>(null);
videoEncoderRef.current = new VideoEncoder({
  output: async (chunk) => {
    // ✅ Use Caseに委譲
    const buffer = new ArrayBuffer(chunk.byteLength);
    chunk.copyTo(buffer);

    await saveChunkUseCase.execute({
      recordingId,
      data: buffer,
      timestamp: chunk.timestamp,
      isInitSegment: false
    });
  },
  error: (e) => console.error(e)
});
```

**作業項目:**
- [ ] useRecorder のリファクタリング
- [ ] useEncoders のリファクタリング
- [ ] useSessionManager のリファクタリング
- [ ] useDownload のリファクタリング
- [ ] 各Hook のテスト更新

**所要時間:** 2-3日

---

### Phase 3: サーバー側のリファクタリング

#### 3-1. サーバー側のEntity/UseCase実装

**実装:**

```typescript
// packages/server/src/domain/usecases/CreateRecording.usecase.ts
export class CreateRecordingUseCase {
  constructor(
    private recordingRepository: IRecordingRepository
  ) {}

  async execute(): Promise<CreateRecordingResponse> {
    const recordingId = generateRecordingId();
    const recording = RecordingEntity.create(recordingId);

    await this.recordingRepository.save(recording);

    return {
      recordingId: recording.getId(),
      createdAt: recording.toDTO().createdAt,
      state: recording.getState()
    };
  }
}
```

```typescript
// packages/server/src/domain/usecases/UpdateRecordingState.usecase.ts
export class UpdateRecordingStateUseCase {
  constructor(
    private recordingRepository: IRecordingRepository
  ) {}

  async execute(request: UpdateRecordingStateRequest): Promise<void> {
    const recording = await this.recordingRepository.findById(request.id);

    if (!recording) {
      throw new RecordingNotFoundError(`Recording not found: ${request.id}`);
    }

    // Entityのビジネスルールで状態遷移
    switch (request.state) {
      case 'recording':
        recording.startRecording();
        break;
      case 'finalizing':
        recording.finalize();
        break;
      case 'synced':
        recording.markAsSynced();
        break;
      default:
        throw new InvalidOperationError(`Invalid state: ${request.state}`);
    }

    await this.recordingRepository.updateState(request.id, recording.getState());
  }
}
```

#### 3-2. Controller層の導入

**実装:**

```typescript
// packages/server/src/presentation/controllers/RecordingController.ts
export class RecordingController {
  constructor(
    private createRecordingUseCase: CreateRecordingUseCase,
    private getRecordingUseCase: GetRecordingUseCase,
    private updateRecordingStateUseCase: UpdateRecordingStateUseCase,
    private updateRecordingMetadataUseCase: UpdateRecordingMetadataUseCase,
    private downloadRecordingUseCase: DownloadRecordingUseCase
  ) {}

  async create(req: Request, res: Response): Promise<void> {
    try {
      const result = await this.createRecordingUseCase.execute();
      res.status(201).json({
        recording_id: result.recordingId,
        created_at: result.createdAt,
        state: result.state
      });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const recording = await this.getRecordingUseCase.execute({ id });

      if (!recording) {
        return res.status(404).json({ error: 'Recording not found' });
      }

      res.json(recording);
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async updateState(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { state } = req.body;

      await this.updateRecordingStateUseCase.execute({ id, state });
      res.status(200).json({ success: true });
    } catch (error) {
      if (error instanceof InvalidStateTransitionError) {
        return res.status(400).json({ error: error.message });
      }
      this.handleError(error, res);
    }
  }

  async updateMetadata(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const metadata = req.body;

      await this.updateRecordingMetadataUseCase.execute({ id, metadata });
      res.status(200).json({ success: true });
    } catch (error) {
      this.handleError(error, res);
    }
  }

  async download(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      // ストリーミングでMP4を返す
      const stream = await this.downloadRecordingUseCase.execute({ id });

      res.setHeader('Content-Type', 'video/mp4');
      res.setHeader('Content-Disposition', `attachment; filename="${id}.mp4"`);

      stream.pipe(res);
    } catch (error) {
      if (error instanceof RecordingNotFoundError) {
        return res.status(404).json({ error: 'Recording not found' });
      }
      this.handleError(error, res);
    }
  }

  private handleError(error: unknown, res: Response): void {
    console.error('Controller error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

#### 3-3. Routes のリファクタリング

**実装:**

```typescript
// packages/server/src/presentation/routes/recordings.ts
import { Router } from 'express';
import { DIContainer } from '../../infrastructure/di/container';
import { RecordingController } from '../controllers/RecordingController';

const router = Router();
const container = DIContainer.getInstance();
const recordingController = container.resolve<RecordingController>('RecordingController');

router.post('/api/recordings', (req, res) =>
  recordingController.create(req, res)
);

router.get('/api/recordings/:id', (req, res) =>
  recordingController.getById(req, res)
);

router.patch('/api/recordings/:id/state', (req, res) =>
  recordingController.updateState(req, res)
);

router.patch('/api/recordings/:id/metadata', (req, res) =>
  recordingController.updateMetadata(req, res)
);

router.get('/api/recordings/:id/download', (req, res) =>
  recordingController.download(req, res)
);

export default router;
```

**作業項目:**
- [ ] サーバー側Use Cases の実装
- [ ] RecordingController の実装
- [ ] ChunkController の実装
- [ ] サーバー側DIContainer の実装
- [ ] Routes のリファクタリング
- [ ] エラーハンドリングの統一

**所要時間:** 3-4日

---

### Phase 4: 型の統一

#### 4-1. common-typesへの集約

**実装:**

```typescript
// packages/common-types/src/index.ts
// Entities
export * from './entities/Recording.entity';
export * from './entities/Chunk.entity';

// Value Objects
export * from './valueObjects/RecordingId';
export * from './valueObjects/ChunkId';

// DTOs
export * from './dtos/Recording.dto';
export * from './dtos/Chunk.dto';

// Errors
export * from './errors/DomainErrors';

// Types
export * from './types/RecordingState';
export * from './types/RecordingMetadata';
```

**削除するファイル:**
- `packages/server/src/types/recording.ts` → common-types に統合
- `packages/web-client/src/types/recording-id.ts` → common-types に統合

**作業項目:**
- [ ] 型定義を common-types に集約
- [ ] server 側の型定義を削除
- [ ] client 側の型定義を削除
- [ ] import パスの更新
- [ ] 型の一貫性チェック

**所要時間:** 1日

---

### Phase 5: ディレクトリ構造の再編成

#### 5-1. クライアント側の構造

**新しい構造:**

```
packages/web-client/src/
├── domain/                          # ドメイン層
│   ├── entities/
│   │   ├── Recording.entity.ts      # （common-types から参照）
│   │   └── Chunk.entity.ts
│   ├── valueObjects/
│   │   ├── RecordingId.ts
│   │   └── ChunkId.ts
│   ├── repositories/                # Repository インターフェース
│   │   ├── IRecordingRepository.ts
│   │   └── IChunkRepository.ts
│   ├── services/                    # Domain Services
│   │   ├── IMediaStreamService.ts
│   │   └── IUploadStrategy.ts
│   └── usecases/                    # Use Cases
│       ├── StartRecording.usecase.ts
│       ├── SaveChunk.usecase.ts
│       ├── CompleteRecording.usecase.ts
│       ├── UploadChunk.usecase.ts
│       ├── DownloadRecording.usecase.ts
│       └── RecoverIncompleteRecording.usecase.ts
│
├── infrastructure/                  # インフラストラクチャ層
│   ├── repositories/
│   │   ├── IndexedDBRecordingRepository.ts
│   │   └── OPFSChunkRepository.ts
│   ├── services/
│   │   ├── BrowserMediaStreamService.ts
│   │   ├── RemoteUploadStrategy.ts
│   │   └── NoOpUploadStrategy.ts
│   ├── storage/
│   │   ├── opfs.ts                  # OPFS 低レベルAPI
│   │   └── metadata.ts              # IndexedDB 低レベルAPI
│   ├── api/
│   │   └── RecordingAPIClient.ts
│   └── di/
│       └── container.ts
│
├── presentation/                    # プレゼンテーション層
│   ├── hooks/                       # Presentation Hooks
│   │   ├── useRecorder.ts
│   │   ├── useEncoders.ts
│   │   ├── useSessionManager.ts
│   │   ├── useDownload.ts
│   │   └── useDevices.ts
│   ├── components/
│   │   ├── atoms/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   └── ...
│   │   ├── molecules/
│   │   │   ├── DeviceSelector.tsx
│   │   │   ├── RecordingCard.tsx
│   │   │   └── ...
│   │   ├── organisms/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── RecordingList.tsx
│   │   │   └── ...
│   │   └── pages/
│   │       ├── RecorderPage.tsx
│   │       ├── LibraryPage.tsx
│   │       └── SettingsPage.tsx
│   └── App.tsx
│
└── shared/                          # 共有ユーティリティ
    ├── errors/
    │   └── ErrorBoundary.tsx
    ├── utils/
    │   ├── generateId.ts
    │   └── formatters.ts
    └── constants/
        └── config.ts
```

#### 5-2. サーバー側の構造

**新しい構造:**

```
packages/server/src/
├── domain/                          # ドメイン層
│   ├── entities/
│   │   └── （common-types から参照）
│   ├── repositories/
│   │   ├── IRecordingRepository.ts
│   │   └── IChunkRepository.ts
│   └── usecases/
│       ├── CreateRecording.usecase.ts
│       ├── GetRecording.usecase.ts
│       ├── UpdateRecordingState.usecase.ts
│       ├── UpdateRecordingMetadata.usecase.ts
│       ├── UploadChunk.usecase.ts
│       └── DownloadRecording.usecase.ts
│
├── infrastructure/                  # インフラストラクチャ層
│   ├── repositories/
│   │   ├── InMemoryRecordingRepository.ts  # Phase 7でDB実装に置き換え
│   │   └── LocalFileSystemChunkRepository.ts
│   ├── storage/
│   │   └── LocalFileSystemStorage.ts
│   └── di/
│       └── container.ts
│
├── presentation/                    # プレゼンテーション層
│   ├── controllers/
│   │   ├── RecordingController.ts
│   │   └── ChunkController.ts
│   ├── routes/
│   │   ├── recordings.ts
│   │   └── chunks.ts
│   └── middleware/
│       ├── errorHandler.ts
│       └── validation.ts
│
└── app/                            # アプリケーション層
    └── server.ts
```

**作業項目:**
- [ ] ディレクトリの作成と移動
- [ ] import パスの更新
- [ ] 循環参照のチェック
- [ ] ビルドの確認

**所要時間:** 1-2日

---

### Phase 6: エラーハンドリングの統一

#### 6-1. ドメインエラーの体系化

**実装:**

```typescript
// packages/common-types/src/errors/DomainErrors.ts
export abstract class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Recording 関連エラー
export class RecordingNotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 'RECORDING_NOT_FOUND');
  }
}

export class InvalidStateTransitionError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_STATE_TRANSITION');
  }
}

export class InvalidOperationError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_OPERATION');
  }
}

// Chunk 関連エラー
export class InvalidChunkError extends DomainError {
  constructor(message: string) {
    super(message, 'INVALID_CHUNK');
  }
}

export class ChunkNotFoundError extends DomainError {
  constructor(message: string) {
    super(message, 'CHUNK_NOT_FOUND');
  }
}

// ネットワーク関連エラー
export class NetworkError extends DomainError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR');
  }
}

export class UploadError extends DomainError {
  constructor(message: string) {
    super(message, 'UPLOAD_ERROR');
  }
}

// ストレージ関連エラー
export class StorageFullError extends DomainError {
  constructor(message: string) {
    super(message, 'STORAGE_FULL');
  }
}

export class StorageAccessError extends DomainError {
  constructor(message: string) {
    super(message, 'STORAGE_ACCESS_ERROR');
  }
}
```

#### 6-2. エラーハンドラーの実装

**クライアント側:**

```typescript
// packages/web-client/src/shared/errors/ErrorHandler.ts
export class ErrorHandler {
  static handle(error: unknown): void {
    if (error instanceof DomainError) {
      this.handleDomainError(error);
    } else if (error instanceof Error) {
      this.handleGenericError(error);
    } else {
      this.handleUnknownError(error);
    }
  }

  private static handleDomainError(error: DomainError): void {
    switch (error.code) {
      case 'RECORDING_NOT_FOUND':
        this.showUserMessage('録画が見つかりません', 'error');
        break;
      case 'INVALID_STATE_TRANSITION':
        this.showUserMessage('無効な操作です', 'error');
        break;
      case 'STORAGE_FULL':
        this.showUserMessage('ストレージ容量が不足しています', 'error');
        break;
      case 'NETWORK_ERROR':
        this.showUserMessage('ネットワークエラーが発生しました', 'error');
        // リトライロジックをトリガー
        break;
      default:
        this.showUserMessage('エラーが発生しました', 'error');
    }

    // ログ送信（本番環境）
    if (import.meta.env.PROD) {
      this.sendToLoggingService(error);
    }
  }

  private static handleGenericError(error: Error): void {
    console.error('Generic error:', error);
    this.showUserMessage('予期しないエラーが発生しました', 'error');
  }

  private static handleUnknownError(error: unknown): void {
    console.error('Unknown error:', error);
    this.showUserMessage('不明なエラーが発生しました', 'error');
  }

  private static showUserMessage(message: string, type: 'info' | 'error'): void {
    // Toast通知などで表示
    console.log(`[${type.toUpperCase()}] ${message}`);
  }

  private static sendToLoggingService(error: DomainError): void {
    // Sentry などにエラー送信
  }
}
```

**サーバー側:**

```typescript
// packages/server/src/presentation/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';
import { DomainError } from '@maycast/common-types';

export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error('Server error:', error);

  if (error instanceof DomainError) {
    const statusCode = getStatusCodeForDomainError(error);
    res.status(statusCode).json({
      error: error.message,
      code: error.code
    });
  } else {
    res.status(500).json({
      error: 'Internal server error'
    });
  }
}

function getStatusCodeForDomainError(error: DomainError): number {
  switch (error.code) {
    case 'RECORDING_NOT_FOUND':
    case 'CHUNK_NOT_FOUND':
      return 404;
    case 'INVALID_STATE_TRANSITION':
    case 'INVALID_OPERATION':
    case 'INVALID_CHUNK':
      return 400;
    case 'STORAGE_FULL':
      return 507; // Insufficient Storage
    default:
      return 500;
  }
}
```

**作業項目:**
- [ ] ドメインエラーの定義
- [ ] クライアント側ErrorHandlerの実装
- [ ] サーバー側errorMiddlewareの実装
- [ ] Use Case でのエラーハンドリング
- [ ] UI でのエラー表示

**所要時間:** 2日

---

## 📅 実装スケジュール

### 全体スケジュール（約3-4週間）

```
Week 1: Phase 1 - 基盤整備
  Day 1-2:  Entities層の構築
  Day 3:    Repository Interfaceの定義
  Day 4-7:  Use Case層の構築

Week 2: Phase 2 - 依存性注入
  Day 1-2:  DIコンテナの実装
  Day 3-4:  Infrastructure層のRepository実装
  Day 5-7:  Hooksのリファクタリング

Week 3: Phase 3 & 4 - サーバー側 & 型統一
  Day 1-3:  サーバー側のリファクタリング
  Day 4:    型の統一
  Day 5-7:  バグ修正とテスト

Week 4: Phase 5 & 6 - 構造整理 & エラーハンドリング
  Day 1-2:  ディレクトリ構造の再編成
  Day 3-4:  エラーハンドリングの統一
  Day 5-7:  統合テストと品質チェック
```

### 優先度付き実装順序

#### 優先度1（即座に実施すべき）- Week 1
1. **型の統一** - common-typesに集約（1日）
   - 重複型の削除
   - import パスの更新
2. **Entity層の構築** - RecordingEntity, ChunkEntityの実装（2日）
   - ビジネスルールの実装
   - 状態遷移の検証
3. **Repository Interfaceの定義**（1日）
   - インターフェース定義
   - 型定義

#### 優先度2（早期に実施）- Week 2
4. **Use Caseの抽出** - 主要な6つのUse Case実装（3-4日）
   - StartRecording, SaveChunk, CompleteRecording
   - UploadChunk, DownloadRecording, RecoverIncompleteRecording
5. **DIコンテナの導入** - 基本的なDI実装（2日）
   - DIContainer の実装
   - React Contextでの提供
6. **Infrastructure Repositoryの実装** - 既存コードの移行（2日）
   - IndexedDBRecordingRepository
   - OPFSChunkRepository

#### 優先度3（段階的に実施）- Week 3-4
7. **Hooksのリファクタリング** - Use Caseを使用するように変更（3日）
8. **サーバー側Controller層の追加**（2日）
9. **エラーハンドリングの統一**（2日）
10. **ディレクトリ構造の再編成**（1-2日）
11. **テストの追加** - Use CaseとRepositoryのユニットテスト（継続的）

---

## 🎁 期待される効果

### 1. テスト容易性の向上
- **Before:** 直接インスタンス化のためモック化不可
- **After:** DIによりすべての依存関係をモック化可能
- **効果:** ユニットテストのカバレッジ向上、TDD可能

### 2. 保守性の向上
- **Before:** ビジネスロジックが散在、変更の影響範囲が不明
- **After:** Use Caseに集約、責務が明確
- **効果:** バグ修正時間50%削減、新機能追加の安全性向上

### 3. 拡張性の向上
- **Before:** 新機能追加時に既存コードの大幅修正が必要
- **After:** 新しいUse Caseの追加だけで対応可能
- **効果:** 機能追加の開発時間30%削減

### 4. 型安全性の向上
- **Before:** 3箇所で重複定義、型エラーが実行時に発覚
- **After:** 型の統一、コンパイル時にエラー検出
- **効果:** 型関連のバグ90%削減

### 5. ビジネスロジックの可視化
- **Before:** どこに何のロジックがあるか不明
- **After:** Use Caseとして明示的に定義
- **効果:** 新規メンバーのオンボーディング時間50%削減

### 6. 再利用性の向上
- **Before:** React Hooksに依存、他のプラットフォームで再利用不可
- **After:** Domain層のロジックはフレームワーク非依存
- **効果:** モバイルアプリ、CLIツールなどへの展開が容易

---

## ⚠️ 実装時の注意点

### 1. 段階的な移行
- 一度にすべてリファクタリングせず、Phase単位で実施
- 各Phaseごとに動作確認とテスト
- フィーチャーフラグを使い、新旧実装を切り替え可能に

### 2. 既存機能の保持
- リファクタリング中も既存機能が動作すること
- E2Eテストで回帰テストを実施
- 重要な機能から順に移行

### 3. パフォーマンスの監視
- DIコンテナのオーバーヘッドを測定
- Use Case呼び出しのパフォーマンス監視
- 必要に応じて最適化

### 4. チーム全体の理解
- リファクタリング方針をドキュメント化
- コードレビューで新しいアーキテクチャの遵守を確認
- ペアプログラミングで知識共有

### 5. テストの充実
- リファクタリング前に既存機能のテストを作成
- 各Use Caseのユニットテストを必須化
- Integration Testで全体の動作を保証

---

## 📚 参考資料

### クリーンアーキテクチャ
- Robert C. Martin『Clean Architecture』
- [The Clean Architecture（blog）](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)

### 依存性注入
- [Dependency Injection in TypeScript](https://github.com/microsoft/tsyringe)
- [InversifyJS](https://inversify.io/)

### リファクタリング
- Martin Fowler『Refactoring』
- [Refactoring Guru](https://refactoring.guru/)

### TypeScript DDD
- [TypeScript DDD Example](https://github.com/stemmlerjs/ddd-forum)
- [Domain-Driven Design in TypeScript](https://khalilstemmler.com/articles/categories/domain-driven-design/)

---

## 🚀 次のステップ

1. **このドキュメントのレビュー**
   - チーム全体で内容を確認
   - 不明点や懸念点を洗い出し

2. **Phase 1の実装開始**
   - 型の統一から着手
   - Entity層の構築
   - Repository Interfaceの定義

3. **定期的な進捗確認**
   - 週次で進捗を確認
   - 問題点の早期発見と対処

4. **継続的な改善**
   - リファクタリング完了後もアーキテクチャの見直し
   - 新しいベストプラクティスの導入

---

**作成日:** 2026-01-23
**バージョン:** 1.0
**ステータス:** 提案中
