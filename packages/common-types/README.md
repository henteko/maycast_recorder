# @maycast/common-types

共通TypeScript型定義パッケージ - Maycast Recorderのクライアントとサーバー間で型を共有します。

## 概要

このパッケージは、Maycast Recorderプロジェクト全体で使用される共通の型定義を提供します。Phase 1.5で導入され、Phase 2以降のサーバー実装で本格的に活用されます。

## インストール

このパッケージはnpm workspacesで管理されています。

```bash
npm install
```

## 使用方法

### web-clientでの使用例

```typescript
import type {
  ChunkId,
  RecordingId,
  RecordingMetadata,
  Recording,
} from '@maycast/common-types';
```

または、web-client専用のre-exportを使用:

```typescript
import type {
  RecordingId,
  RecordingMetadata,
} from '../types/common';
```

## 型定義

### Chunk関連

- `ChunkId`: チャンクの一意識別子 (number)
- `ChunkMetadata`: チャンクのメタデータ
  - `recordingId`: 録画ID
  - `chunkId`: チャンクID
  - `timestamp`: タイムスタンプ（マイクロ秒）
  - `size`: サイズ（バイト）
  - `hash`: BLAKE3ハッシュ（optional）
  - `hasKeyframe`: キーフレーム含有フラグ（optional）
  - `createdAt`: 作成タイムスタンプ（Unix timestamp ms）

### Recording関連

- `RecordingId`: 録画の一意識別子 (UUID string)
- `RecordingState`: 録画の状態 (`'standby' | 'recording' | 'finalizing' | 'synced'`)
- `RecordingMetadata`: 録画のメタデータ（コーデック、解像度など）
- `Recording`: 録画全体の情報
  - `id`: 録画ID
  - `state`: 録画状態
  - `metadata`: 録画メタデータ（optional）
  - `chunkCount`: チャンク数
  - `totalSize`: 合計サイズ（バイト）
  - `startTime`: 開始時刻（Unix timestamp ms）
  - `endTime`: 終了時刻（Unix timestamp ms、optional）
  - `createdAt`: 作成日時（ISO 8601）
  - `updatedAt`: 更新日時（ISO 8601）

### Room関連 (Phase 4+)

- `RoomId`: Roomの一意識別子 (UUID string)
- `RoomState`: Roomの状態
- `Room`: Room全体の情報

### WebSocketメッセージ (Phase 4+)

- `RoomCreated`
- `RoomStateChanged`
- `RecordingCreated`
- `RecordingStateChanged`
- `ChunkUploaded`
- `UploadProgress`
- `DirectorCommand`
- `WebSocketMessage`: 全WebSocketメッセージのUnion型

## ビルド

```bash
npm run build
```

TypeScriptコンパイラが`dist/`ディレクトリに`.d.ts`ファイルと`.js`ファイルを生成します。

## クリーン

```bash
npm run clean
```

## Phase 1/2 での使用

すべての型定義はPhase 1とPhase 2で共通して使用されます：

- **ChunkMetadata**: Phase 1/2 共通で使用
  - `hash`: Phase 1ではoptional、Phase 2以降で必須化予定
  - `hasKeyframe`: Phase 2以降で活用予定

- **Recording**: Phase 1/2 共通で使用
  - `metadata`: Phase 1ではoptional（録画メタデータが未実装のため）
  - Phase 2以降ですべてのフィールドを活用

型定義は完全に統一されており、Phase 1からPhase 2への移行時にデータマイグレーションは不要です。

## 開発

型定義を追加・変更した後は、必ずビルドしてください：

```bash
task build:common-types
# または
npm run build --workspace=@maycast/common-types
```
