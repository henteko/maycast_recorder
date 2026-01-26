# 📋 Maycast Recorder 開発計画

## Overview

本ドキュメントは、Maycast Recorderの段階的な開発計画を定義します。各フェーズは独立して動作可能な状態を目指し、段階的に機能を追加していきます。

---

## Phase 3: Resume Upload 機能実装

**Goal:** ブラウザ再起動後、未送信チャンクを自動検出して再アップロードする

**既存実装の活用:**
- `UploadStateStorage` (IndexedDB でアップロード状態管理) - 実装済み
- `ChunkUploader` (リトライ機能、状態追跡含む) - 実装済み
- `RecoveryModal` (UI) - 実装済み

---

### Phase 3.1: 未送信チャンク検出機能

**Goal:** ブラウザ再起動後、OPFS内の未送信チャンクを検出

**Tasks:**
- [ ] `detectUnfinishedRecordings()`関数実装
  - OPFSとIndexedDBを走査
  - `state: 'recording'`または`state: 'finalizing'`のRecordingを検出
  - UploadStateStorageから未送信チャンク（`status !== 'uploaded'`）をリストアップ
- [ ] アプリ起動時にバックグラウンドで実行

**実装場所:**
- `/packages/web-client/src/modes/remote/resume-upload.ts`

**Test:**
- [ ] Remote Modeで録画中にブラウザを強制終了
  ```javascript
  // 録画中にDevToolsコンソールで実行
  window.location.reload();
  ```
- [ ] 再起動後、以下のログが出力される:
  ```
  🔍 [ResumeUpload] Detecting unfinished recordings...
  📋 [ResumeUpload] Found 1 unfinished recording: recording-001
  📦 [ResumeUpload] Pending chunks: [5, 6, 7, 8]
  ```
- [ ] IndexedDBで未送信チャンクのリストを確認
  ```javascript
  // DevTools Application tab -> IndexedDB -> upload_states
  ```

**Deliverable:**
- 未送信チャンク検出機能

---

### Phase 3.2: バックグラウンド再送信機能

**Goal:** 検出した未送信チャンクをバックグラウンドでアップロード

**Tasks:**
- [ ] `ResumeUploadManager`クラス実装
  ```typescript
  class ResumeUploadManager {
    async resumeRecording(recordingId: string): Promise<void>
    async uploadPendingChunks(recordingId: string, chunkIds: number[]): Promise<void>
    getProgress(): { current: number; total: number }
  }
  ```
- [ ] 未送信チャンクをキューに追加
- [ ] バックグラウンドでChunkUploaderを使用してアップロード（既存実装を活用）
- [ ] アップロード完了後、Recording状態を`synced`に更新

**実装場所:**
- `/packages/web-client/src/modes/remote/ResumeUploadManager.ts`

**Test:**
- [ ] 前のステップで検出した未送信チャンクを再アップロード
- [ ] ブラウザコンソールで進捗ログを確認:
  ```
  🔄 [ResumeUpload] Resuming recording: recording-001
  📤 [ResumeUpload] Uploading chunk 5/8
  📤 [ResumeUpload] Uploading chunk 6/8
  ...
  ✅ [ResumeUpload] All chunks uploaded successfully
  🎉 [ResumeUpload] Recording synced: recording-001
  ```
- [ ] サーバー側でチャンクが正しく保存されている
  ```bash
  ls -lh ./recordings-data/{recording_id}/
  # 全チャンクファイルが存在する
  ```

**Deliverable:**
- バックグラウンド再アップロード機能

---

### Phase 3.3: Resume Upload UI実装

**Goal:** 再アップロード進捗を表示するUI

**Tasks:**
- [ ] 既存の`RecoveryModal.tsx`を拡張
  - 未完了Recordingリスト表示
  - 各Recordingの進捗バー
  - 「Resume All」「Skip」ボタン
- [ ] アプリ起動時に自動表示
  - 未完了Recordingが存在する場合のみ
- [ ] 進捗状態をリアルタイム更新

**UI Design:**
```
┌─────────────────────────────────────────┐
│  Resume Previous Recordings             │
├─────────────────────────────────────────┤
│  Recording: recording-001               │
│  Progress: [████████░░] 75% (6/8)       │
│                                         │
│  Recording: recording-002               │
│  Progress: [██████████] 100% (10/10)    │
│                                         │
│  [Resume All]  [Skip]                   │
└─────────────────────────────────────────┘
```

**実装場所:**
- `/packages/web-client/src/presentation/components/organisms/RecoveryModal.tsx` (既存)

**Test:**
- [ ] 未完了Recordingが存在する状態でアプリを起動
- [ ] Resume Upload Modalが自動で表示される
- [ ] 「Resume All」をクリック
- [ ] 進捗バーが更新される
- [ ] 完了後、Modalが自動で閉じる

**Deliverable:**
- Resume Upload UI

---

**Overall Phase 3 Deliverable:**
- **Resume Upload機能完成**
  - ブラウザ再起動後、未送信チャンクを自動検出
  - バックグラウンドで再アップロード
  - 進捗表示UI
- **データ損失の防止**
  - ブラウザクラッシュや強制終了時でもデータを保護
  - 再起動後に自動復元

---

## Phase 4: Room機能・Director Mode 実装 🎯

**Goal:** 複数のゲストRecordingをRoomで束ね、管理者が一括制御できる仕組みを構築

**Concept:**
- **Room**: 複数Recordingを束ねる収録セッション（Phase 4で新規実装）
- Director（管理者）がRoomを作成し、Guest URLを配布
- ゲストはURLにアクセスして録画開始（Phase 2のRemote Mode技術を活用）
- 同一Room内のすべてのRecordingを一括管理

**Hierarchy:**
```
Room (room-abc123)
 ├─ Recording A (Guest A: recording-001)
 ├─ Recording B (Guest B: recording-002)
 └─ Recording C (Guest C: recording-003)
```

---

### Phase 4.1.1: Room型定義と基礎インフラ

**Goal:** Room関連の型定義とドメインモデルを準備

**Tasks:**
- [ ] `@maycast/common-types`のRoom型を拡張
  ```typescript
  export type RoomState = 'idle' | 'recording' | 'finished';

  export interface Room {
    id: RoomId;
    state: RoomState;
    createdAt: string;
    updatedAt: string;
    recordingIds: string[];
    guestUrl?: string;
  }
  ```
- [ ] サーバー側にRoomエンティティ作成
  - `/packages/common-types/src/entities/Room.entity.ts`
- [ ] Room状態遷移のバリデーションロジック
  - `idle` → `recording` → `finished`

**Test:**
- [ ] TypeScriptコンパイルが成功する
- [ ] Room型定義をimportできる
  ```typescript
  import type { Room, RoomState } from '@maycast/common-types';
  ```

**Deliverable:**
- Room型定義
- ドメインモデル

---

### Phase 4.1.2: Roomリポジトリ実装（インメモリ）

**Goal:** Room永続化のためのリポジトリパターン実装

**Tasks:**
- [ ] `IRoomRepository`インターフェース定義
  ```typescript
  interface IRoomRepository {
    create(room: Room): Promise<Room>;
    findById(roomId: RoomId): Promise<Room | null>;
    update(room: Room): Promise<Room>;
    delete(roomId: RoomId): Promise<void>;
    list(): Promise<Room[]>;
  }
  ```
- [ ] `InMemoryRoomRepository`実装
  - `Map<RoomId, Room>`でデータ管理
  - Phase 7でDB実装に切り替え予定
- [ ] DIコンテナに登録

**Test:**
- [ ] ユニットテスト実装
  ```typescript
  describe('InMemoryRoomRepository', () => {
    it('should create a room', async () => {
      const room = await repository.create({ ... });
      expect(room.id).toBeDefined();
    });

    it('should find a room by id', async () => {
      const room = await repository.findById('room-001');
      expect(room).toBeDefined();
    });
  });
  ```
- [ ] `task test:server`でユニットテストが成功する

**Deliverable:**
- Roomリポジトリ実装
- ユニットテスト

---

### Phase 4.1.3: Room作成API実装

**Goal:** Roomを作成するエンドポイント

**Tasks:**
- [ ] `CreateRoom.usecase.ts`実装
  - UUID生成（`uuidv4()`）
  - Guest URL生成（`/guest/{room_id}`）
  - 初期状態: `idle`
- [ ] `POST /api/rooms`エンドポイント実装
  - リクエストボディ: `{}`（空でOK）
  - レスポンス: `{ roomId, guestUrl, state, createdAt }`
- [ ] RoomController作成

**Test:**
- [ ] curlでRoom作成
  ```bash
  curl -X POST http://localhost:3000/api/rooms \
    -H "Content-Type: application/json"
  # 期待レスポンス:
  # {
  #   "roomId": "550e8400-e29b-41d4-a716-446655440000",
  #   "guestUrl": "/guest/550e8400-e29b-41d4-a716-446655440000",
  #   "state": "idle",
  #   "createdAt": "2026-01-24T10:00:00.000Z",
  #   "recordingIds": []
  # }
  ```
- [ ] 複数回実行して異なるRoom IDが生成される

**Deliverable:**
- Room作成API

---

### Phase 4.1.4: Room取得API実装

**Goal:** Roomの情報を取得するエンドポイント

**Tasks:**
- [ ] `GetRoom.usecase.ts`実装
- [ ] `GET /api/rooms/:room_id`エンドポイント実装
  - 存在しないRoom IDの場合: `404 Not Found`
  - レスポンス: Room情報（recordingIds含む）

**Test:**
- [ ] Room作成後、取得APIを実行
  ```bash
  # Room作成
  ROOM_ID=$(curl -s -X POST http://localhost:3000/api/rooms | jq -r '.roomId')

  # Room取得
  curl http://localhost:3000/api/rooms/$ROOM_ID
  # 期待レスポンス: Room情報が返る
  ```
- [ ] 存在しないRoom IDで404エラー
  ```bash
  curl http://localhost:3000/api/rooms/invalid-room-id
  # 期待: 404 Not Found
  ```

**Deliverable:**
- Room取得API

---

### Phase 4.1.5: Room状態更新API実装

**Goal:** Room状態を更新するエンドポイント

**Tasks:**
- [ ] `UpdateRoomState.usecase.ts`実装
  - 状態遷移のバリデーション
  - `idle` → `recording` → `finished`のみ許可
- [ ] `PATCH /api/rooms/:room_id/state`エンドポイント実装
  - リクエストボディ: `{ state: RoomState }`
  - レスポンス: 更新後のRoom情報

**Test:**
- [ ] 正常な状態遷移
  ```bash
  # Room作成（state: idle）
  ROOM_ID=$(curl -s -X POST http://localhost:3000/api/rooms | jq -r '.roomId')

  # idle → recording
  curl -X PATCH http://localhost:3000/api/rooms/$ROOM_ID/state \
    -H "Content-Type: application/json" \
    -d '{"state":"recording"}'
  # 期待: state が "recording" に更新

  # recording → finished
  curl -X PATCH http://localhost:3000/api/rooms/$ROOM_ID/state \
    -H "Content-Type: application/json" \
    -d '{"state":"finished"}'
  # 期待: state が "finished" に更新
  ```
- [ ] 不正な状態遷移
  ```bash
  # finished → idle（許可されない）
  curl -X PATCH http://localhost:3000/api/rooms/$ROOM_ID/state \
    -H "Content-Type: application/json" \
    -d '{"state":"idle"}'
  # 期待: 400 Bad Request
  ```

**Deliverable:**
- Room状態更新API

---

### Phase 4.1.6: Room内Recording一覧取得API実装

**Goal:** Room内のすべてのRecordingを取得

**Tasks:**
- [ ] `GET /api/rooms/:room_id/recordings`エンドポイント実装
  - Room内の`recordingIds`を取得
  - 各RecordingのメタデータをRecordingRepositoryから取得
  - レスポンス: `{ recordings: Recording[] }`

**Test:**
- [ ] Room作成後、Recording一覧を取得（空）
  ```bash
  ROOM_ID=$(curl -s -X POST http://localhost:3000/api/rooms | jq -r '.roomId')
  curl http://localhost:3000/api/rooms/$ROOM_ID/recordings
  # 期待: {"recordings": []}
  ```
- [ ] Recording追加後、一覧を取得（Phase 4.2で実装）

**Deliverable:**
- Room内Recording一覧API

---

### Phase 4.1.7: Roomストレージディレクトリ構造実装

**Goal:** Room単位でRecordingを整理するディレクトリ構造

**Storage Structure:**
```text
/storage
└── /rooms
    └── /{room_id}/
        ├── /{recording_id_1}/  # Guest A
        │   ├── init.mp4
        │   ├── chunk-001.fmp4
        │   └── ...
        ├── /{recording_id_2}/  # Guest B
        │   └── ...
        └── /{recording_id_3}/  # Guest C
            └── ...
```

**Tasks:**
- [ ] LocalFileSystemChunkRepositoryを拡張
  - Recording作成時に`roomId`を受け取る
  - Room有りの場合: `./recordings-data/rooms/{room_id}/{recording_id}/`
  - Room無しの場合: `./recordings-data/{recording_id}/`（既存の挙動維持）
- [ ] ディレクトリ作成ロジック追加

**Test:**
- [ ] Room有りでRecording作成（Phase 4.2で実装）
  ```bash
  ROOM_ID=$(curl -s -X POST http://localhost:3000/api/rooms | jq -r '.roomId')
  RECORDING_ID=$(curl -s -X POST "http://localhost:3000/api/recordings?roomId=$ROOM_ID" | jq -r '.recordingId')

  # ディレクトリ確認
  ls -la ./recordings-data/rooms/$ROOM_ID/$RECORDING_ID/
  # 期待: ディレクトリが作成されている
  ```
- [ ] Room無しでRecording作成（既存の挙動）
  ```bash
  RECORDING_ID=$(curl -s -X POST http://localhost:3000/api/recordings | jq -r '.recordingId')
  ls -la ./recordings-data/$RECORDING_ID/
  # 期待: ディレクトリが作成されている
  ```

**Deliverable:**
- Room対応ストレージ構造

---

### Phase 4.2.1: Recording型にRoom ID追加

**Goal:** RecordingエンティティにRoomとの紐付けを追加

**Tasks:**
- [ ] Recording型を拡張
  ```typescript
  export interface Recording {
    id: RecordingId;
    roomId?: RoomId;  // 新規追加
    state: RecordingState;
    metadata?: RecordingMetadata;
    chunkCount: number;
    totalSize: number;
    startTime: number;
    endTime?: number;
    createdAt: string;
    updatedAt: string;
  }
  ```
- [ ] RecordingRepositoryの`create()`にroomIdパラメータ追加

**Test:**
- [ ] TypeScriptコンパイルが成功する
- [ ] 既存のRecording作成ロジック（Room無し）が動作する

**Deliverable:**
- Room ID対応Recording型

---

### Phase 4.2.2: Recording作成時のRoom紐付け実装

**Goal:** Recording作成時にRoom IDを指定可能に

**Tasks:**
- [ ] `CreateRecording.usecase.ts`を拡張
  - オプショナルパラメータ`roomId?: RoomId`を受け取る
  - roomIdが指定された場合:
    - Roomの存在確認（RoomRepository.findById）
    - Room状態確認（`idle`または`recording`のみ許可）
    - RecordingのroomIdフィールドに設定
    - RoomのrecordingIds配列に追加
- [ ] `POST /api/recordings`エンドポイント拡張
  - クエリパラメータ`?roomId=xxx`を受け取る

**Test:**
- [ ] Room作成後、Recording作成（Room紐付け有り）
  ```bash
  # Room作成
  ROOM_ID=$(curl -s -X POST http://localhost:3000/api/rooms | jq -r '.roomId')

  # Recording作成（Room紐付け）
  RECORDING_ID=$(curl -s -X POST "http://localhost:3000/api/recordings?roomId=$ROOM_ID" | jq -r '.recordingId')

  # Recording情報確認
  curl http://localhost:3000/api/recordings/$RECORDING_ID | jq '.roomId'
  # 期待: ROOM_IDが表示される
  ```
- [ ] Room情報取得時、recordingIdsに含まれる
  ```bash
  curl http://localhost:3000/api/rooms/$ROOM_ID | jq '.recordingIds'
  # 期待: [RECORDING_ID]
  ```

**Deliverable:**
- Room紐付けRecording作成機能

---

### Phase 4.2.3: Room存在確認バリデーション

**Goal:** 存在しないRoom IDでのRecording作成を防止

**Tasks:**
- [ ] CreateRecording.usecaseでバリデーション強化
  - Room未存在の場合: `RoomNotFoundError`をスロー
  - Room状態が不正の場合: `InvalidRoomStateError`をスロー
- [ ] エラーハンドリング実装

**Test:**
- [ ] 存在しないRoom IDでRecording作成
  ```bash
  curl -X POST "http://localhost:3000/api/recordings?roomId=invalid-room-id"
  # 期待: 404 Not Found, {"error": "Room not found"}
  ```
- [ ] 完了済みRoomでRecording作成
  ```bash
  # Room作成
  ROOM_ID=$(curl -s -X POST http://localhost:3000/api/rooms | jq -r '.roomId')

  # Room状態を finished に更新
  curl -X PATCH http://localhost:3000/api/rooms/$ROOM_ID/state \
    -H "Content-Type: application/json" \
    -d '{"state":"finished"}'

  # Recording作成（失敗する）
  curl -X POST "http://localhost:3000/api/recordings?roomId=$ROOM_ID"
  # 期待: 400 Bad Request, {"error": "Room is not accepting new recordings"}
  ```

**Deliverable:**
- Room存在確認バリデーション

---

### Phase 4.2.4: Room対応ストレージパス実装

**Goal:** Room紐付けRecordingのチャンクを専用ディレクトリに保存

**Tasks:**
- [ ] LocalFileSystemChunkRepositoryのストレージパス生成ロジック拡張
  - roomIdが指定された場合: `./recordings-data/rooms/{roomId}/{recordingId}/`
  - roomIdが未指定の場合: `./recordings-data/{recordingId}/`（既存の挙動）
- [ ] ディレクトリ作成処理

**Test:**
- [ ] Room紐付けRecording作成→チャンクアップロード
  ```bash
  # Room作成
  ROOM_ID=$(curl -s -X POST http://localhost:3000/api/rooms | jq -r '.roomId')

  # Recording作成
  RECORDING_ID=$(curl -s -X POST "http://localhost:3000/api/recordings?roomId=$ROOM_ID" | jq -r '.recordingId')

  # init segment アップロード
  curl -X PUT "http://localhost:3000/api/recordings/$RECORDING_ID/init" \
    --data-binary @init.mp4

  # チャンクアップロード
  curl -X PUT "http://localhost:3000/api/recordings/$RECORDING_ID/chunks/1" \
    --data-binary @chunk-001.fmp4

  # ストレージパス確認
  ls -la ./recordings-data/rooms/$ROOM_ID/$RECORDING_ID/
  # 期待: init.mp4, chunk-001.fmp4 が存在
  ```
- [ ] Room未指定の場合（既存の挙動）
  ```bash
  RECORDING_ID=$(curl -s -X POST http://localhost:3000/api/recordings | jq -r '.recordingId')
  ls -la ./recordings-data/$RECORDING_ID/
  # 期待: 正常にチャンクが保存される
  ```

**Deliverable:**
- Room対応ストレージパス実装

---

### Phase 4.2.5: Room内Recording一覧取得の完全実装

**Goal:** Room内のすべてのRecordingを取得（メタデータ含む）

**Tasks:**
- [ ] `GET /api/rooms/:room_id/recordings`エンドポイント完全実装
  - RoomのrecordingIdsを取得
  - 各Recording IDでRecordingRepositoryから詳細情報を取得
  - レスポンス: `{ recordings: Recording[] }`

**Test:**
- [ ] 複数Recordingを作成後、一覧取得
  ```bash
  # Room作成
  ROOM_ID=$(curl -s -X POST http://localhost:3000/api/rooms | jq -r '.roomId')

  # Recording A作成
  REC_A=$(curl -s -X POST "http://localhost:3000/api/recordings?roomId=$ROOM_ID" | jq -r '.recordingId')

  # Recording B作成
  REC_B=$(curl -s -X POST "http://localhost:3000/api/recordings?roomId=$ROOM_ID" | jq -r '.recordingId')

  # Recording一覧取得
  curl http://localhost:3000/api/rooms/$ROOM_ID/recordings | jq '.recordings | length'
  # 期待: 2

  curl http://localhost:3000/api/rooms/$ROOM_ID/recordings | jq '.recordings[].id'
  # 期待: REC_A, REC_B が表示される
  ```

**Deliverable:**
- Room内Recording一覧取得API（完全版）

---

### Phase 4.3.1: Guest Modeルーティング準備

**Goal:** Guest Mode用のルーティングとディレクトリ構造を準備

**Tasks:**
- [ ] `/guest/:room_id`ルーティング追加（App.tsx）
- [ ] ディレクトリ構造作成
  ```text
  /packages/web-client/src/modes/guest/
  ├── GuestRecorder.tsx
  ├── GuestStorageStrategy.ts
  ├── types.ts
  └── hooks/
      └── useRoomConnection.ts
  ```
- [ ] 基本的なGuestRecorderコンポーネント作成（プレースホルダー）

**Test:**
- [ ] `/guest/test-room-id`にアクセス
- [ ] プレースホルダーページが表示される
- [ ] Room IDがURLから取得できる
  ```typescript
  const { roomId } = useParams<{ roomId: string }>();
  console.log('Room ID:', roomId);  // 期待: "test-room-id"
  ```

**Deliverable:**
- Guest Modeルーティング
- ディレクトリ構造

---

### Phase 4.3.2: Room存在確認とメタデータ取得

**Goal:** Guest Mode起動時にRoom存在確認とメタデータ取得

**Tasks:**
- [ ] `useRoomMetadata`カスタムフック実装
  ```typescript
  function useRoomMetadata(roomId: string) {
    const [room, setRoom] = useState<Room | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      fetch(`/api/rooms/${roomId}`)
        .then(res => res.json())
        .then(setRoom)
        .catch(setError)
        .finally(() => setLoading(false));
    }, [roomId]);

    return { room, error, loading };
  }
  ```
- [ ] GuestRecorderでRoom存在確認
  - Room未存在の場合: エラー画面表示

**UI:**
```
┌─────────────────────────────────────────┐
│  Room Not Found                         │
│                                         │
│  The room you're trying to join does   │
│  not exist or has been deleted.        │
│                                         │
│  Please check the URL and try again.   │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] 存在しないRoom IDでアクセス
  ```
  http://localhost:5173/guest/invalid-room-id
  # 期待: "Room Not Found" エラー画面
  ```
- [ ] 存在するRoom IDでアクセス
  ```bash
  # Room作成
  ROOM_ID=$(curl -s -X POST http://localhost:3000/api/rooms | jq -r '.roomId')

  # ブラウザでアクセス
  # http://localhost:5173/guest/$ROOM_ID
  # 期待: Room情報が取得される
  ```

**Deliverable:**
- Room存在確認機能

---

### Phase 4.3.3: GuestStorageStrategy実装

**Goal:** Guest Mode専用のストレージ戦略（RemoteStorageStrategy拡張）

**Tasks:**
- [ ] `GuestStorageStrategy.ts`実装
  - RemoteStorageStrategyを継承
  - Recording作成時に自動的にroomIdを指定
  - `POST /api/recordings?roomId={roomId}`を呼び出し
- [ ] DIコンテナに登録

**Test:**
- [ ] Guest Modeで録画開始
- [ ] Recording作成時にroomIdが自動的に設定される
- [ ] ブラウザコンソールで確認:
  ```
  📝 [GuestStorageStrategy] Creating recording with roomId: room-abc123
  ✅ [GuestStorageStrategy] Recording created: recording-001
  ```
- [ ] サーバー側でRecordingがRoom内に作成される
  ```bash
  curl http://localhost:3000/api/rooms/$ROOM_ID | jq '.recordingIds'
  # 期待: [RECORDING_ID]
  ```

**Deliverable:**
- GuestStorageStrategy実装

---

### Phase 4.3.4: 待機画面UI実装

**Goal:** Director指示を待つ待機画面

**UI Design:**
```
┌─────────────────────────────────────────┐
│  Maycast Recorder - Guest Mode          │
├─────────────────────────────────────────┤
│                                         │
│  Room: room-abc123                      │
│  Status: 🟡 Waiting for director        │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │  [Camera Preview]               │   │
│  │                                 │   │
│  └─────────────────────────────────┘   │
│                                         │
│  • Check your camera and microphone    │
│  • Wait for the director to start      │
│                                         │
└─────────────────────────────────────────┘
```

**Tasks:**
- [ ] 待機画面コンポーネント実装
  - Room ID表示
  - Room状態表示
  - カメラプレビュー
  - マイク/カメラチェック
- [ ] Room状態に応じたUI切り替え
  - `idle`: 待機画面
  - `recording`: 録画画面（Phase 4.3.5で実装）
  - `finished`: 完了画面

**Test:**
- [ ] Guest Modeでアクセス
- [ ] 待機画面が表示される
- [ ] カメラプレビューが表示される
- [ ] Room IDが正しく表示される

**Deliverable:**
- 待機画面UI

---

### Phase 4.3.5: Recorder統合（Remote Modeロジック再利用）

**Goal:** Remote ModeのRecorderロジックをGuest Modeで再利用

**Tasks:**
- [ ] GuestRecorderにRecorderコンポーネント統合
- [ ] GuestStorageStrategyを注入
- [ ] 録画制御をDisabled（Director指示のみで制御）
- [ ] 録画開始/停止はWebSocketイベントでトリガー（Phase 4.5で実装）

**Test:**
- [ ] Guest Modeでカメラ/マイクが正常に動作
- [ ] 手動での録画開始ボタンが無効化されている
- [ ] プレビューが正常に表示される

**Deliverable:**
- Guest Mode録画統合

---

### Phase 4.3.6: 録画完了後のUI

**Goal:** 録画完了後の「アップロード完了」画面

**UI Design:**
```
┌─────────────────────────────────────────┐
│  Maycast Recorder - Guest Mode          │
├─────────────────────────────────────────┤
│                                         │
│  Recording Complete! ✅                 │
│                                         │
│  Room: room-abc123                      │
│  Recording ID: recording-001            │
│  Duration: 15:32                        │
│                                         │
│  All chunks uploaded successfully.     │
│                                         │
│  You can now close this window.        │
│                                         │
└─────────────────────────────────────────┘
```

**Tasks:**
- [ ] 完了画面コンポーネント実装
- [ ] Recording状態が`synced`になったら自動表示
- [ ] アップロード進捗表示（Phase 3のResumeUpload UIを再利用）

**Test:**
- [ ] Guest Modeで録画→停止→完了
- [ ] 「Recording Complete!」画面が表示される
- [ ] Recording IDとDurationが正しく表示される

**Deliverable:**
- 録画完了画面UI

---

### Phase 4.4.1: Directorルーティングと基本構造

**Goal:** Director画面の基本構造とルーティング

**Tasks:**
- [ ] `/director`ルーティング追加（App.tsx）
- [ ] ディレクトリ構造作成
  ```text
  /packages/web-client/src/modes/director/
  ├── DirectorDashboard.tsx
  ├── components/
  │   ├── RoomList.tsx
  │   ├── RoomDetail.tsx
  │   ├── RoomControls.tsx
  │   └── GuestList.tsx
  ├── hooks/
  │   ├── useRoomManager.ts
  │   └── useRoomWebSocket.ts
  └── types.ts
  ```
- [ ] DirectorDashboardコンポーネント作成（プレースホルダー）

**Test:**
- [ ] `/director`にアクセス
- [ ] プレースホルダーページが表示される

**Deliverable:**
- Directorルーティング
- ディレクトリ構造

---

### Phase 4.4.2: Room作成機能実装

**Goal:** Director画面からRoomを作成

**Tasks:**
- [ ] `useRoomManager`カスタムフック実装
  ```typescript
  function useRoomManager() {
    const [rooms, setRooms] = useState<Room[]>([]);

    const createRoom = async () => {
      const res = await fetch('/api/rooms', { method: 'POST' });
      const room = await res.json();
      setRooms([...rooms, room]);
      return room;
    };

    return { rooms, createRoom };
  }
  ```
- [ ] 「Create New Room」ボタン実装
- [ ] Room作成後、詳細画面に遷移

**UI:**
```
┌─────────────────────────────────────────┐
│  Maycast Recorder - Director            │
├─────────────────────────────────────────┤
│  Rooms                                  │
│                                         │
│  [Create New Room]                      │
│                                         │
│  No rooms yet. Create one to get        │
│  started.                               │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] 「Create New Room」クリック
- [ ] Roomが作成される
- [ ] ブラウザコンソールで確認:
  ```
  ✅ [RoomManager] Room created: room-abc123
  ```
- [ ] Room一覧に新しいRoomが追加される

**Deliverable:**
- Room作成機能

---

### Phase 4.4.3: Room一覧表示

**Goal:** 作成済みRoomの一覧を表示

**Tasks:**
- [ ] `GET /api/rooms`エンドポイント実装（サーバー側）
  - すべてのRoomを取得
  - レスポンス: `{ rooms: Room[] }`
- [ ] RoomListコンポーネント実装
  - Room一覧を表示
  - 各Roomの状態を表示（idle, recording, finished）
  - クリックでRoom詳細に遷移

**UI:**
```
┌─────────────────────────────────────────┐
│  Maycast Recorder - Director            │
├─────────────────────────────────────────┤
│  Rooms                    [Create New]  │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Room: room-abc123              │   │
│  │ Status: 🟡 Idle                │   │
│  │ Guests: 0                      │   │
│  │ Created: 2026-01-24 10:00      │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Room: room-def456              │   │
│  │ Status: 🟢 Recording           │   │
│  │ Guests: 3                      │   │
│  │ Created: 2026-01-24 09:30      │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] 複数Room作成
- [ ] 一覧に全Roomが表示される
- [ ] 各Roomの状態が正しく表示される

**Deliverable:**
- Room一覧表示

---

### Phase 4.4.4: Room詳細画面とGuest URL表示

**Goal:** Room詳細画面でGuest URL表示とコピー機能

**Tasks:**
- [ ] RoomDetailコンポーネント実装
  - Room ID表示
  - Room状態表示
  - Guest URL表示
  - Guest URLコピーボタン
- [ ] クリップボードコピー機能実装
  ```typescript
  const copyGuestUrl = () => {
    const url = `${window.location.origin}/guest/${room.id}`;
    navigator.clipboard.writeText(url);
  };
  ```

**UI:**
```
┌─────────────────────────────────────────┐
│  Room: room-abc123                      │
├─────────────────────────────────────────┤
│  Status: 🟡 Idle                        │
│  Created: 2026-01-24 10:00:00           │
│                                         │
│  Guest URL:                             │
│  ┌───────────────────────────────────┐ │
│  │ http://localhost:5173/guest/...   │ │
│  │                      [Copy URL]   │ │
│  └───────────────────────────────────┘ │
│                                         │
│  Guests: 0 connected                    │
│                                         │
│  [Start Recording]  [Delete Room]       │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] Room詳細画面にアクセス
- [ ] Guest URLが表示される
- [ ] 「Copy URL」クリック
- [ ] クリップボードにURLがコピーされる
  ```javascript
  // ブラウザで確認
  navigator.clipboard.readText().then(console.log);
  ```

**Deliverable:**
- Room詳細画面
- Guest URLコピー機能

---

### Phase 4.4.5: Room制御ボタン実装（API呼び出し）

**Goal:** Start/Stop Recording ボタンからRoom状態を更新

**Tasks:**
- [ ] RoomControlsコンポーネント実装
  - 「Start Recording」ボタン
  - 「Stop Recording」ボタン
  - Room状態に応じてボタン有効/無効化
- [ ] Room状態更新API呼び出し
  ```typescript
  const startRecording = async () => {
    await fetch(`/api/rooms/${roomId}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'recording' })
    });
  };

  const stopRecording = async () => {
    await fetch(`/api/rooms/${roomId}/state`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'finished' })
    });
  };
  ```

**Test:**
- [ ] Room詳細画面で「Start Recording」クリック
- [ ] Room状態が`idle` → `recording`に変更
- [ ] ブラウザコンソールで確認:
  ```
  🎬 [RoomControls] Starting recording for room: room-abc123
  ✅ [RoomControls] Room state updated: recording
  ```
- [ ] 「Stop Recording」クリック
- [ ] Room状態が`recording` → `finished`に変更

**Deliverable:**
- Room制御ボタン

---

### Phase 4.4.6: ゲスト一覧表示（静的版）

**Goal:** Room内のRecording（Guest）を一覧表示

**Tasks:**
- [ ] GuestListコンポーネント実装
  - `GET /api/rooms/:id/recordings`でRecording一覧を取得
  - 各Recordingの状態を表示
  - 定期的にポーリング（5秒ごと）
- [ ] Recording情報をカード形式で表示

**UI:**
```
┌─────────────────────────────────────────┐
│  Guests (3 connected)                   │
├─────────────────────────────────────────┤
│  ┌───────────────────────────────────┐ │
│  │ 📹 Guest A (recording-001)        │ │
│  │ Status: 🟢 Recording              │ │
│  │ Chunks: 15                        │ │
│  │ Size: 1.2 MB                      │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ 📹 Guest B (recording-002)        │ │
│  │ Status: 🟢 Recording              │ │
│  │ Chunks: 12                        │ │
│  │ Size: 980 KB                      │ │
│  └───────────────────────────────────┘ │
│                                         │
│  ┌───────────────────────────────────┐ │
│  │ 📹 Guest C (recording-003)        │ │
│  │ Status: 🟡 Idle                   │ │
│  │ Chunks: 0                         │ │
│  │ Size: 0 KB                        │ │
│  └───────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] Guest Modeで複数タブから接続
- [ ] Director画面でゲスト一覧が表示される
- [ ] 各ゲストの状態が正しく表示される
- [ ] ゲストが録画開始すると状態が更新される（ポーリング）

**Deliverable:**
- ゲスト一覧表示（静的版）

---

### Phase 4.4.7: Room削除機能

**Goal:** 不要なRoomを削除

**Tasks:**
- [ ] `DELETE /api/rooms/:id`エンドポイント実装（サーバー側）
  - Room削除
  - Room内のRecordingも削除（オプショナル）
  - ストレージからファイル削除
- [ ] 「Delete Room」ボタン実装
- [ ] 削除確認ダイアログ

**Test:**
- [ ] Room詳細画面で「Delete Room」クリック
- [ ] 確認ダイアログが表示される
- [ ] 「Confirm」クリック
- [ ] Roomが削除される
- [ ] Room一覧から消える
- [ ] ストレージから削除される
  ```bash
  ls ./recordings-data/rooms/
  # 削除したRoomのディレクトリが存在しない
  ```

**Deliverable:**
- Room削除機能

---

### Phase 4.5.1: WebSocket基礎インフラ（サーバー側）

**Goal:** WebSocketサーバーのセットアップ

**Tasks:**
- [ ] WebSocketライブラリ追加（`ws`パッケージ）
  ```bash
  cd packages/server
  npm install ws @types/ws
  ```
- [ ] WebSocketサーバー初期化（server.ts）
  ```typescript
  import { WebSocketServer } from 'ws';
  const wss = new WebSocketServer({ server });
  ```
- [ ] 接続管理クラス実装
  ```typescript
  class ConnectionManager {
    private connections = new Map<string, WebSocket>();

    addConnection(clientId: string, ws: WebSocket): void
    removeConnection(clientId: string): void
    getConnection(clientId: string): WebSocket | undefined
    broadcast(roomId: string, message: any): void
  }
  ```

**Test:**
- [ ] サーバー起動時にWebSocketサーバーが起動
- [ ] ログで確認:
  ```
  🚀 Maycast Recorder Server running on port 3000
  🔌 WebSocket server initialized
  ```

**Deliverable:**
- WebSocket基礎インフラ

---

### Phase 4.5.2: Room WebSocketエンドポイント実装

**Goal:** `/ws/rooms/:room_id`エンドポイントの実装

**Tasks:**
- [ ] WebSocketルーティング実装
  - URLから`room_id`を抽出
  - Room存在確認
  - 接続確立
- [ ] Room別接続管理
  ```typescript
  class RoomConnectionManager {
    private roomConnections = new Map<RoomId, Set<WebSocket>>();

    addToRoom(roomId: RoomId, ws: WebSocket): void
    removeFromRoom(roomId: RoomId, ws: WebSocket): void
    broadcastToRoom(roomId: RoomId, message: any): void
  }
  ```
- [ ] 接続/切断イベントハンドリング

**Test:**
- [ ] WebSocketクライアントでテスト
  ```javascript
  // ブラウザコンソール
  const ws = new WebSocket('ws://localhost:3000/ws/rooms/room-abc123');
  ws.onopen = () => console.log('✅ Connected');
  ws.onmessage = (event) => console.log('📨 Message:', event.data);
  ws.onerror = (error) => console.error('❌ Error:', error);
  ```
- [ ] サーバー側ログで接続確認:
  ```
  🔌 [WebSocket] New connection to room: room-abc123
  ```

**Deliverable:**
- Room WebSocketエンドポイント

---

### Phase 4.5.3: メッセージ型定義とプロトコル設計

**Goal:** WebSocketメッセージの型定義

**Tasks:**
- [ ] `@maycast/common-types`にWebSocketメッセージ型定義
  ```typescript
  // websocket.ts
  export type WebSocketMessageType =
    | 'room:state_changed'
    | 'room:recording_created'
    | 'room:recording_state_changed'
    | 'room:chunk_uploaded'
    | 'director:command'
    | 'guest:joined'
    | 'guest:left';

  export interface WebSocketMessage {
    type: WebSocketMessageType;
    payload: any;
    timestamp: string;
  }

  export interface RoomStateChangedMessage extends WebSocketMessage {
    type: 'room:state_changed';
    payload: {
      roomId: RoomId;
      state: RoomState;
    };
  }

  export interface DirectorCommandMessage extends WebSocketMessage {
    type: 'director:command';
    payload: {
      command: 'start' | 'stop';
      roomId: RoomId;
    };
  }

  // ...他のメッセージ型も定義
  ```
- [ ] サーバー側でメッセージ送受信ヘルパー実装

**Test:**
- [ ] 型定義がコンパイル成功
- [ ] メッセージをパースできる

**Deliverable:**
- WebSocketメッセージ型定義

---

### Phase 4.5.4: Director指示のブロードキャスト実装

**Goal:** Directorからの「Start/Stop」指示をGuestにブロードキャスト

**Tasks:**
- [ ] Director接続時のクライアントタイプ識別
  - 接続時にクライアントタイプを送信（`director` or `guest`）
- [ ] Directorからのコマンド受信処理
  ```typescript
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    if (message.type === 'director:command') {
      roomConnectionManager.broadcastToRoom(roomId, message);
    }
  });
  ```
- [ ] Guest側でコマンド受信処理（Phase 4.5.5で実装）

**Test:**
- [ ] Director側でコマンド送信
  ```javascript
  // Directorブラウザコンソール
  const ws = new WebSocket('ws://localhost:3000/ws/rooms/room-abc123');
  ws.onopen = () => {
    ws.send(JSON.stringify({
      type: 'director:command',
      payload: { command: 'start', roomId: 'room-abc123' },
      timestamp: new Date().toISOString()
    }));
  };
  ```
- [ ] Guest側で受信確認
  ```javascript
  // Guestブラウザコンソール
  const ws = new WebSocket('ws://localhost:3000/ws/rooms/room-abc123');
  ws.onmessage = (event) => {
    console.log('📨 Received:', JSON.parse(event.data));
    // 期待: { type: 'director:command', payload: { command: 'start', ... } }
  };
  ```

**Deliverable:**
- Director指示ブロードキャスト

---

### Phase 4.5.5: Guest側WebSocket接続実装

**Goal:** Guest ModeでWebSocket接続してDirector指示を受信

**Tasks:**
- [ ] `useRoomWebSocket`カスタムフック実装（Guest Mode用）
  ```typescript
  function useRoomWebSocket(roomId: string) {
    const [ws, setWs] = useState<WebSocket | null>(null);
    const [lastCommand, setLastCommand] = useState<string | null>(null);

    useEffect(() => {
      const websocket = new WebSocket(`ws://localhost:3000/ws/rooms/${roomId}`);
      websocket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'director:command') {
          setLastCommand(message.payload.command);
        }
      };
      setWs(websocket);

      return () => websocket.close();
    }, [roomId]);

    return { ws, lastCommand };
  }
  ```
- [ ] GuestRecorderでWebSocket統合
  - `lastCommand`が`'start'`の場合、録画開始
  - `lastCommand`が`'stop'`の場合、録画停止

**Test:**
- [ ] Guest ModeでWebSocket接続確認
- [ ] Director側で「Start」コマンド送信
- [ ] Guest側で自動的に録画開始
- [ ] ブラウザコンソールで確認:
  ```
  🔌 [useRoomWebSocket] Connected to room: room-abc123
  📨 [useRoomWebSocket] Received command: start
  🎬 [GuestRecorder] Starting recording...
  ```

**Deliverable:**
- Guest側WebSocket接続

---

### Phase 4.5.6: Director側WebSocket接続とリアルタイム更新

**Goal:** Director ModeでWebSocket接続してゲスト状態をリアルタイム表示

**Tasks:**
- [ ] `useRoomWebSocket`カスタムフック実装（Director Mode用）
  ```typescript
  function useRoomWebSocket(roomId: string) {
    const [guestUpdates, setGuestUpdates] = useState<any[]>([]);

    useEffect(() => {
      const ws = new WebSocket(`ws://localhost:3000/ws/rooms/${roomId}`);
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === 'room:recording_state_changed') {
          setGuestUpdates(prev => [...prev, message.payload]);
        }
      };

      return () => ws.close();
    }, [roomId]);

    return { guestUpdates };
  }
  ```
- [ ] GuestListコンポーネントをリアルタイム更新に変更
  - ポーリングを削除
  - WebSocketイベントで状態更新

**Test:**
- [ ] Guest Modeで録画開始
- [ ] Director画面でリアルタイムに状態が更新される
- [ ] ポーリングなしで即座に反映される

**Deliverable:**
- Director側WebSocket接続
- リアルタイム状態表示

---

### Phase 4.5.7: チャンクアップロード通知

**Goal:** Guestのチャンクアップロード進捗をDirectorにリアルタイム通知

**Tasks:**
- [ ] Guest側でチャンクアップロード時にWebSocketメッセージ送信
  ```typescript
  // ChunkUploader内
  async uploadChunk(chunk: Uint8Array, chunkId: number) {
    await uploadToServer(chunk, chunkId);

    // WebSocketで通知
    ws?.send(JSON.stringify({
      type: 'room:chunk_uploaded',
      payload: { roomId, recordingId, chunkId },
      timestamp: new Date().toISOString()
    }));
  }
  ```
- [ ] サーバー側で受信してブロードキャスト
- [ ] Director側で受信して進捗バー更新

**Test:**
- [ ] Guest Modeで録画中
- [ ] Director画面で各ゲストのチャンク進捗がリアルタイム表示
  ```
  Guest A: [████████░░] 75% (15/20 chunks)
  Guest B: [██████████] 100% (20/20 chunks)
  ```

**Deliverable:**
- チャンクアップロード進捗通知

---

### Phase 4.6.1: Stop指示のブロードキャスト

**Goal:** Directorからの「Stop」指示を全Guestに送信

**Tasks:**
- [ ] Director側「Stop Recording」ボタン実装
  - WebSocketで`director:command { command: 'stop' }`を送信
  - Room状態を`recording` → `finished`に更新
- [ ] サーバー側でRoom内の全Guestにブロードキャスト

**Test:**
- [ ] Director画面で「Stop Recording」クリック
- [ ] 全Guest側でStopコマンド受信
- [ ] ブラウザコンソール（Guest側）で確認:
  ```
  📨 [useRoomWebSocket] Received command: stop
  🛑 [GuestRecorder] Stopping recording...
  ```

**Deliverable:**
- Stop指示ブロードキャスト

---

### Phase 4.6.2: Guest側録画停止とFlush処理

**Goal:** Stop指示受信時、録画停止して未送信チャンクをアップロード

**Tasks:**
- [ ] GuestRecorderでStop指示処理
  ```typescript
  useEffect(() => {
    if (lastCommand === 'stop') {
      // 録画停止
      stopRecording();

      // 未送信チャンクのアップロード完了を待機
      waitForUploadComplete().then(() => {
        // Recording状態を synced に更新
        updateRecordingState('synced');

        // WebSocketで通知
        ws?.send(JSON.stringify({
          type: 'guest:synced',
          payload: { roomId, recordingId },
          timestamp: new Date().toISOString()
        }));
      });
    }
  }, [lastCommand]);
  ```
- [ ] `waitForUploadComplete()`実装
  - ChunkUploaderのキューが空になるまで待機
  - タイムアウト処理（最大5分）

**Test:**
- [ ] Guest Modeで録画中
- [ ] Director側で「Stop」指示
- [ ] Guest側で録画停止
- [ ] 未送信チャンクが自動的にアップロードされる
- [ ] アップロード完了後、`guest:synced`メッセージが送信される
- [ ] ブラウザコンソールで確認:
  ```
  🛑 [GuestRecorder] Recording stopped
  ⏳ [GuestRecorder] Waiting for upload to complete...
  ✅ [GuestRecorder] All chunks uploaded
  🎉 [GuestRecorder] Recording synced
  ```

**Deliverable:**
- Guest側Flush処理

---

### Phase 4.6.3: Director側同期状態監視

**Goal:** 各Guestの同期状態をリアルタイム表示

**Tasks:**
- [ ] Director側でGuest同期状態を管理
  ```typescript
  interface GuestSyncState {
    recordingId: string;
    synced: boolean;
    progress: number;  // 0-100
  }

  const [guestSyncStates, setGuestSyncStates] = useState<Map<string, GuestSyncState>>(new Map());
  ```
- [ ] WebSocketで`guest:synced`メッセージ受信
  ```typescript
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'guest:synced') {
      setGuestSyncStates(prev => {
        const updated = new Map(prev);
        updated.set(message.payload.recordingId, {
          recordingId: message.payload.recordingId,
          synced: true,
          progress: 100
        });
        return updated;
      });
    }
  };
  ```
- [ ] UI更新

**UI:**
```
┌─────────────────────────────────────────┐
│  Room: room-abc123                      │
│  Status: 🟡 Finalizing                  │
├─────────────────────────────────────────┤
│  Waiting for all guests to sync...      │
│                                         │
│  Guest A: ✅ Synced (100%)              │
│  Guest B: ⏳ Uploading... (75%)         │
│  Guest C: ✅ Synced (100%)              │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] 複数Guestで録画→Stop
- [ ] Director画面で各Guestの同期状態が表示される
- [ ] Guest Bのアップロードが遅い場合、進捗が表示される
- [ ] 全Guestが`Synced`になったら完了

**Deliverable:**
- Director側同期状態監視

---

### Phase 4.6.4: Room状態の最終更新とUI

**Goal:** 全Guest同期完了後、Room状態を`finished`に確定

**Tasks:**
- [ ] Director側で全Guest同期確認
  ```typescript
  useEffect(() => {
    const allSynced = Array.from(guestSyncStates.values())
      .every(state => state.synced);

    if (allSynced && guestSyncStates.size > 0) {
      // Room状態を finished に更新（既に更新済みの場合は不要）
      console.log('✅ All guests synced!');
    }
  }, [guestSyncStates]);
  ```
- [ ] UI更新

**UI (完了後):**
```
┌─────────────────────────────────────────┐
│  Room: room-abc123                      │
│  Status: ✅ Finished                    │
├─────────────────────────────────────────┤
│  ✓ All recordings synced successfully   │
│                                         │
│  Guest A: ✅ Synced (15:32)             │
│  Guest B: ✅ Synced (15:30)             │
│  Guest C: ✅ Synced (15:35)             │
│                                         │
│  [Download All]  [Back to Rooms]        │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] 全Guest同期完了
- [ ] Director画面に「✓ All recordings synced successfully」表示
- [ ] Room状態が`finished`

**Deliverable:**
- Room最終状態更新

---

### Phase 4.6.5: Guest側「ブラウザを閉じてOK」表示

**Goal:** Guest側で同期完了後の表示

**Tasks:**
- [ ] Guest側で`synced`状態になったらUI更新
- [ ] 「Recording Complete!」画面表示（Phase 4.3.6で実装済み）

**UI:**
```
┌─────────────────────────────────────────┐
│  Recording Complete! ✅                 │
│                                         │
│  Your recording has been uploaded.     │
│  You can now close this window.        │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] Guest側で録画→Stop→同期完了
- [ ] 「Recording Complete!」画面が表示される

**Deliverable:**
- Guest側完了画面

---

### Phase 4.7.1: 個別Recording MP4ダウンロード（基本実装）

**Goal:** Director画面から各GuestのMP4を個別にダウンロード

**Tasks:**
- [ ] GuestListコンポーネントに「Download MP4」ボタン追加
- [ ] ダウンロードハンドラー実装
  ```typescript
  const downloadRecording = async (recordingId: string) => {
    const res = await fetch(`/api/recordings/${recordingId}/download`);
    const blob = await res.blob();

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recording-${recordingId}.mp4`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  ```

**Test:**
- [ ] Room完了後、Director画面でダウンロード
- [ ] Guest AのMP4がダウンロードされる
- [ ] ファイル名: `recording-{recordingId}.mp4`
- [ ] VLCで再生できる

**Deliverable:**
- 個別Recording MP4ダウンロード（基本版）

---

### Phase 4.7.2: Recording情報表示（Duration, Size）

**Goal:** Recording詳細情報を表示

**Tasks:**
- [ ] サーバー側でRecordingメタデータ拡張
  - `durationUs`（録画時間、マイクロ秒）
  - `totalSize`（合計ファイルサイズ、バイト）
- [ ] フロントエンドで表示用フォーマット関数
  ```typescript
  function formatDuration(durationUs: number): string {
    const seconds = Math.floor(durationUs / 1_000_000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function formatSize(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    const gb = mb / 1024;
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${mb.toFixed(2)} MB`;
  }
  ```
- [ ] GuestListコンポーネントで情報表示

**UI:**
```
┌─────────────────────────────────────────┐
│  Guest A (recording-001)                │
│  Duration: 15:32                        │
│  Size: 1.2 GB                           │
│  [Download MP4]                         │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] Director画面でRecording情報が表示される
- [ ] Duration, Sizeが正しく計算されている

**Deliverable:**
- Recording情報表示

---

### Phase 4.7.3: ダウンロードファイル名のカスタマイズ

**Goal:** ファイル名を`{room_id}_{recording_id}_{timestamp}.mp4`形式に

**Tasks:**
- [ ] ファイル名生成ロジック実装
  ```typescript
  const generateFilename = (roomId: string, recordingId: string): string => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `room-${roomId}_recording-${recordingId}_${timestamp}.mp4`;
  };
  ```
- [ ] ダウンロードハンドラーを更新

**Test:**
- [ ] ダウンロードしたファイル名を確認
  ```
  room-abc123_recording-001_2026-01-24T10-30-00-000Z.mp4
  ```

**Deliverable:**
- カスタムファイル名

---

### Phase 4.7.4: ダウンロード進捗表示

**Goal:** ダウンロード中の進捗を表示

**Tasks:**
- [ ] ダウンロード状態管理
  ```typescript
  interface DownloadState {
    recordingId: string;
    status: 'idle' | 'downloading' | 'completed' | 'error';
    progress: number;  // 0-100
  }

  const [downloadStates, setDownloadStates] = useState<Map<string, DownloadState>>(new Map());
  ```
- [ ] Fetch APIで進捗取得
  ```typescript
  const downloadWithProgress = async (recordingId: string) => {
    const res = await fetch(`/api/recordings/${recordingId}/download`);
    const contentLength = res.headers.get('Content-Length');
    const total = parseInt(contentLength || '0', 10);

    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      chunks.push(value);
      received += value.length;

      const progress = (received / total) * 100;
      setDownloadStates(prev => {
        const updated = new Map(prev);
        updated.set(recordingId, { recordingId, status: 'downloading', progress });
        return updated;
      });
    }

    // Blob作成してダウンロード
    const blob = new Blob(chunks);
    // ...
  };
  ```
- [ ] UI更新

**UI:**
```
┌─────────────────────────────────────────┐
│  Guest A (recording-001)                │
│  Duration: 15:32                        │
│  Size: 1.2 GB                           │
│  [████████░░] 75% Downloading...        │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] ダウンロード中、進捗バーが更新される
- [ ] 完了後、「✅ Downloaded」表示

**Deliverable:**
- ダウンロード進捗表示

---

### Phase 4.7.5: 複数Recording同時ダウンロード対応

**Goal:** 複数Recordingを同時にダウンロード

**Tasks:**
- [ ] ダウンロードキュー管理
  - 最大3並列ダウンロード
- [ ] 各Recordingの進捗を個別表示

**Test:**
- [ ] 「Download All」ボタン追加（オプショナル）
- [ ] 複数Recordingを順次ダウンロード
- [ ] 各ファイルが正常にダウンロードされる

**Deliverable:**
- 複数Recording同時ダウンロード

---

### Phase 4.7.6: 全Recording一括ZIPダウンロード（オプショナル）

**Goal:** Room内の全RecordingをZIP形式で一括ダウンロード

**Tasks:**
- [ ] サーバー側で`GET /api/rooms/:room_id/download-all`エンドポイント実装
  - Room内の全Recording IDを取得
  - 各RecordingのMP4を結合
  - ZIP形式で圧縮（`archiver`パッケージ使用）
  - ストリーム配信
  ```typescript
  import archiver from 'archiver';

  app.get('/api/rooms/:room_id/download-all', async (req, res) => {
    const { room_id } = req.params;
    const recordings = await getRecordingsInRoom(room_id);

    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="room-${room_id}.zip"`);

    const archive = archiver('zip', { zlib: { level: 0 } });
    archive.pipe(res);

    for (const recording of recordings) {
      const mp4Stream = await combineChunks(recording.id);
      archive.append(mp4Stream, { name: `recording-${recording.id}.mp4` });
    }

    await archive.finalize();
  });
  ```
- [ ] Director画面に「Download All as ZIP」ボタン追加

**Test:**
- [ ] 「Download All as ZIP」クリック
- [ ] ZIP形式でダウンロードされる
- [ ] ZIP解凍後、全GuestのMP4が含まれる
- [ ] 各MP4が正常に再生できる

**Deliverable:**
- 全Recording一括ZIPダウンロード

---

**Overall Phase 4 Deliverable:**
- **完全なRoom管理・Director Mode実装**
  - Room作成・管理API
  - Director画面（`/director`）
  - Guest Mode（`/guest/{room_id}`）
  - 複数Recordingの一括管理
  - リアルタイム状態同期（WebSocket）
  - Stop & Flushプロトコル
  - 全ゲスト同期確認機能
  - **Director画面から各Recording MP4ダウンロード**
- **3つのモード完成:**
  - Standalone Mode (`/solo`): サーバーレス、ローカルMP4ダウンロード
  - Remote Mode (`/remote`): 単一Recording、サーバーからMP4ダウンロード
  - **Director/Guest Mode**: 複数Recording一括管理、Director画面から各Guest MP4ダウンロード

---

## Phase 5: Guardian & 監視機能

**Goal:** エンコード負荷監視と自動画質調整で録画停止を防ぐ

---

### Phase 5.1.1: VideoEncoder Queue監視

**Goal:** VideoEncoderのキューサイズを監視し、負荷を検出

**Tasks:**
- [ ] `PerformanceMonitor`クラス実装
  ```typescript
  class PerformanceMonitor {
    private queueSizeHistory: number[] = [];

    monitorEncoderQueue(encoder: VideoEncoder): number {
      // VideoEncoder.encodeQueueSize を取得（未標準化のため、実装依存）
      const queueSize = (encoder as any).encodeQueueSize || 0;
      this.queueSizeHistory.push(queueSize);

      // 過去10サンプルの平均
      const avgQueueSize = this.queueSizeHistory.slice(-10).reduce((a, b) => a + b, 0) / 10;
      return avgQueueSize;
    }

    isOverloaded(avgQueueSize: number): boolean {
      // キューサイズが30を超えたら過負荷と判定
      return avgQueueSize > 30;
    }
  }
  ```
- [ ] Recorderで1秒ごとに監視

**Test:**
- [ ] 録画中、ブラウザコンソールでキューサイズを確認
  ```
  📊 [PerformanceMonitor] Encoder queue size: 5
  📊 [PerformanceMonitor] Average queue size: 4.2
  ```
- [ ] 高解像度（4K）で録画してキューサイズ増加を確認
- [ ] キューサイズが閾値を超えたら警告ログ
  ```
  ⚠️ [PerformanceMonitor] Encoder overload detected! Queue: 32
  ```

**Deliverable:**
- VideoEncoder Queue監視機能

---

### Phase 5.1.2: CPU使用率推定

**Goal:** エンコード処理時間から CPU 使用率を推定

**Tasks:**
- [ ] エンコード処理時間の計測
  ```typescript
  class PerformanceMonitor {
    private encodeTimings: number[] = [];

    measureEncodeTime(startTime: number, endTime: number): void {
      const encodeTime = endTime - startTime;
      this.encodeTimings.push(encodeTime);
    }

    estimateCpuUsage(): number {
      // フレームレート 30fps の場合、1フレームの理想処理時間は 33ms
      const idealFrameTime = 1000 / 30;
      const avgEncodeTime = this.encodeTimings.slice(-30).reduce((a, b) => a + b, 0) / 30;

      // CPU使用率 = (実際の処理時間 / 理想処理時間) * 100
      const cpuUsage = (avgEncodeTime / idealFrameTime) * 100;
      return Math.min(cpuUsage, 100);
    }
  }
  ```
- [ ] UI に CPU 使用率表示（デバッグモード）

**Test:**
- [ ] 録画中、CPU使用率を確認
  ```
  📊 [PerformanceMonitor] CPU usage: 45%
  ```
- [ ] 高負荷時（4K録画）に100%に近づく

**Deliverable:**
- CPU使用率推定機能

---

### Phase 5.1.3: 危険閾値検出とアラート

**Goal:** 過負荷を検出してアラート表示

**Tasks:**
- [ ] 閾値設定
  - キューサイズ: 30以上で警告、50以上で危険
  - CPU使用率: 80%以上で警告、95%以上で危険
- [ ] アラート状態管理
  ```typescript
  type AlertLevel = 'normal' | 'warning' | 'danger';

  interface PerformanceAlert {
    level: AlertLevel;
    message: string;
  }

  class PerformanceMonitor {
    getAlert(): PerformanceAlert {
      const queueSize = this.getAvgQueueSize();
      const cpuUsage = this.estimateCpuUsage();

      if (queueSize >= 50 || cpuUsage >= 95) {
        return { level: 'danger', message: 'Severe overload! Quality will be reduced.' };
      }
      if (queueSize >= 30 || cpuUsage >= 80) {
        return { level: 'warning', message: 'High load detected. Monitor performance.' };
      }
      return { level: 'normal', message: '' };
    }
  }
  ```

**Test:**
- [ ] 高負荷時に警告が表示される
- [ ] ブラウザコンソールで確認:
  ```
  ⚠️ [PerformanceMonitor] Warning: High load detected. Monitor performance.
  ```

**Deliverable:**
- 危険閾値検出機能

---

### Phase 5.2.1: Adaptive Bitrate - ビットレート動的変更

**Goal:** 過負荷検出時、ビットレートを自動的に下げる

**Tasks:**
- [ ] ビットレート変更API実装
  ```typescript
  class AdaptiveBitrateController {
    private currentBitrate: number;
    private minBitrate = 500_000;  // 500 Kbps
    private maxBitrate = 5_000_000;  // 5 Mbps

    reduceBitrate(): number {
      this.currentBitrate = Math.max(this.currentBitrate * 0.8, this.minBitrate);
      return this.currentBitrate;
    }

    increaseBitrate(): number {
      this.currentBitrate = Math.min(this.currentBitrate * 1.2, this.maxBitrate);
      return this.currentBitrate;
    }

    applyBitrate(encoder: VideoEncoder, bitrate: number): void {
      // VideoEncoder の再設定（既存のencoderを破棄して新しいencoderを作成）
      // 注意: WebCodecsでは実行中のビットレート変更は難しい
      // 実装はプロジェクト固有のロジックに依存
    }
  }
  ```
- [ ] PerformanceMonitorと統合
  - 過負荷検出時、ビットレートを20%削減
  - 負荷正常化時、ビットレートを20%増加（元の設定まで）

**Note:** WebCodecs では実行中のVideoEncoderのビットレート変更が難しいため、このフェーズは研究フェーズとして実装の実現可能性を検証する必要があります。

**Test:**
- [ ] 過負荷シミュレーション
- [ ] ビットレートが自動的に削減される
- [ ] ログで確認:
  ```
  ⚠️ [AdaptiveBitrate] Reducing bitrate: 2500000 → 2000000
  ```

**Deliverable:**
- Adaptive Bitrate機能（研究段階）

---

### Phase 5.2.2: 解像度ダウンスケール（オプショナル）

**Goal:** さらなる過負荷時、解像度を下げる

**Tasks:**
- [ ] 解像度変更ロジック
  - 1080p → 720p
  - 720p → 480p
- [ ] Canvas でダウンスケール
  ```typescript
  function downscaleFrame(frame: VideoFrame, targetWidth: number, targetHeight: number): VideoFrame {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(frame, 0, 0, targetWidth, targetHeight);
    return new VideoFrame(canvas, { timestamp: frame.timestamp });
  }
  ```

**Test:**
- [ ] 解像度変更が反映される
- [ ] 録画ファイルの解像度を確認

**Deliverable:**
- 解像度ダウンスケール機能（オプショナル）

---

### Phase 5.2.3: UI警告表示

**Goal:** 画質変更をユーザーに通知

**Tasks:**
- [ ] 警告トースト実装
  ```
  ┌─────────────────────────────────────────┐
  │  ⚠️ Performance Warning                 │
  │  Bitrate reduced to maintain stability  │
  │  2500 Kbps → 2000 Kbps                  │
  └─────────────────────────────────────────┘
  ```
- [ ] Recorderコンポーネントに統合

**Test:**
- [ ] ビットレート変更時、トーストが表示される

**Deliverable:**
- UI警告表示

---

### Phase 5.3.1: Audio Analysis - RMS/Peak レベル取得

**Goal:** 音声レベルをリアルタイム監視

**Tasks:**
- [ ] `AudioAnalyzer`クラス実装
  ```typescript
  class AudioAnalyzer {
    private analyserNode: AnalyserNode;

    constructor(audioContext: AudioContext, source: MediaStreamAudioSourceNode) {
      this.analyserNode = audioContext.createAnalyser();
      this.analyserNode.fftSize = 2048;
      source.connect(this.analyserNode);
    }

    getRMS(): number {
      const dataArray = new Float32Array(this.analyserNode.fftSize);
      this.analyserNode.getFloatTimeDomainData(dataArray);

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] ** 2;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      return rms;
    }

    getPeak(): number {
      const dataArray = new Float32Array(this.analyserNode.fftSize);
      this.analyserNode.getFloatTimeDomainData(dataArray);
      return Math.max(...dataArray);
    }
  }
  ```

**Test:**
- [ ] 録画中、音声レベルをログ出力
  ```
  🔊 [AudioAnalyzer] RMS: 0.05, Peak: 0.15
  ```

**Deliverable:**
- Audio Analysis機能

---

### Phase 5.3.2: 無音検出

**Goal:** 無音状態を検出してトラブルシューティング

**Tasks:**
- [ ] 無音検出ロジック
  ```typescript
  class AudioAnalyzer {
    detectSilence(threshold = 0.01): boolean {
      const rms = this.getRMS();
      return rms < threshold;
    }
  }
  ```
- [ ] 10秒間無音が続いたら警告表示

**UI:**
```
┌─────────────────────────────────────────┐
│  ⚠️ Audio Warning                       │
│  No audio detected for 10 seconds.     │
│  Check your microphone settings.       │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] マイクをミュートして録画
- [ ] 10秒後、警告が表示される

**Deliverable:**
- 無音検出機能

---

### Phase 5.3.3: リアルタイム音声メーター表示

**Goal:** 音声レベルをリアルタイムで可視化

**Tasks:**
- [ ] AudioMeterコンポーネント実装
  ```typescript
  function AudioMeter({ analyzer }: { analyzer: AudioAnalyzer }) {
    const [rms, setRms] = useState(0);

    useEffect(() => {
      const interval = setInterval(() => {
        setRms(analyzer.getRMS());
      }, 100);

      return () => clearInterval(interval);
    }, [analyzer]);

    const percentage = Math.min(rms * 100, 100);

    return (
      <div className="audio-meter">
        <div className="meter-bar" style={{ width: `${percentage}%` }} />
      </div>
    );
  }
  ```

**UI:**
```
Audio: [████████░░░░░░░░░░] 40%
```

**Test:**
- [ ] 録画中、音声メーターが動く
- [ ] 音量に応じてバーが変化

**Deliverable:**
- リアルタイム音声メーター

---

**Overall Phase 5 Deliverable:**
- **完全な監視・自動防衛機能**
  - VideoEncoder Queue監視
  - CPU使用率推定
  - 危険閾値検出
  - Adaptive Bitrate（ビットレート自動調整）
  - 解像度ダウンスケール（オプショナル）
  - Audio Analysis（RMS/Peak、無音検出、リアルタイムメーター）
  - UI警告表示
- **録画停止を防ぐ自動防衛システム**

---

## Phase 6: UI/UX 改善 & ポリッシュ

**Goal:** プロダクションレディなUIを構築し、UXを洗練

**Note:** Phase 4でDirector/Guest画面の基本機能は実装済み。Phase 6ではさらなる改善とポリッシュを行う。

---

### Phase 6.1.1: Room一覧のフィルタリング・検索

**Goal:** Room一覧に検索とフィルター機能を追加

**Tasks:**
- [ ] 検索バー実装
  - Room IDで検索
  - 作成日で検索
- [ ] フィルター機能
  - 状態別フィルター（Idle, Recording, Finished）
  - 日付範囲フィルター
- [ ] ソート機能
  - 作成日時順
  - 状態順

**UI:**
```
┌─────────────────────────────────────────┐
│  Rooms                                  │
│  [Search: ________] [Filter: All ▼]    │
│  [Sort: Created ▼]         [Create New] │
├─────────────────────────────────────────┤
│  ...Room list...                        │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] Room ID検索が動作する
- [ ] フィルターでRecording状態のRoomのみ表示
- [ ] ソートで並び順が変わる

**Deliverable:**
- Room検索・フィルター機能

---

### Phase 6.1.2: Room履歴管理

**Goal:** 過去のRoomを履歴として保存

**Tasks:**
- [ ] 「Archive Room」機能実装
  - Room状態が`finished`の場合、アーカイブ可能
  - アーカイブされたRoomは一覧から非表示
- [ ] 「Archived Rooms」タブ追加
  - アーカイブ済みRoom一覧
  - 再表示・削除機能

**Test:**
- [ ] Room完了後、「Archive」ボタンが表示される
- [ ] アーカイブ後、一覧から消える
- [ ] 「Archived Rooms」タブで確認できる

**Deliverable:**
- Room履歴管理

---

### Phase 6.1.3: 収録統計ダッシュボード

**Goal:** Room別の統計情報を可視化

**Tasks:**
- [ ] 統計情報計算
  - Room別の合計録画時間
  - Guest別のファイルサイズ
  - 平均Chunk数
  - アップロード速度
- [ ] ダッシュボードUI実装
  - グラフ表示（Chart.js 使用）
  - カード形式で表示

**UI:**
```
┌─────────────────────────────────────────┐
│  Dashboard                              │
├─────────────────────────────────────────┤
│  Total Rooms: 15                        │
│  Active Rooms: 3                        │
│  Total Recordings: 45                   │
│  Total Size: 125 GB                     │
│                                         │
│  [Recent Activity Chart]                │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] 統計情報が正しく計算される
- [ ] グラフが表示される

**Deliverable:**
- 収録統計ダッシュボード

---

### Phase 6.1.4: エラーログビューア

**Goal:** サーバーエラーやクライアントエラーを表示

**Tasks:**
- [ ] エラーログ収集
  - サーバー側のエラーログをAPIで取得
  - クライアント側のエラーをIndexedDBに保存
- [ ] エラーログビューアUI
  - エラー一覧表示
  - フィルター（日時、タイプ）
  - 詳細表示

**Test:**
- [ ] エラー発生時、ログに記録される
- [ ] エラーログビューアで確認できる

**Deliverable:**
- エラーログビューア

---

### Phase 6.1.5: Guest招待リンクのQRコード生成

**Goal:** Guest URLをQRコードで共有

**Tasks:**
- [ ] QRコードライブラリ追加（`qrcode.react`）
  ```bash
  cd packages/web-client
  npm install qrcode.react
  ```
- [ ] QRコード表示コンポーネント実装
- [ ] Room詳細画面に表示

**UI:**
```
┌─────────────────────────────────────────┐
│  Guest URL:                             │
│  http://localhost:5173/guest/room-abc123│
│  [Copy URL]  [Show QR Code]             │
│                                         │
│  ┌─────────────┐                        │
│  │ QR Code     │                        │
│  │ [███  ███]  │                        │
│  │ [  ████  ]  │                        │
│  │ [███  ███]  │                        │
│  └─────────────┘                        │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] QRコードが表示される
- [ ] スマホでスキャンしてアクセスできる

**Deliverable:**
- QRコード生成機能

---

### Phase 6.2.1: カメラ/マイク事前チェック画面

**Goal:** Guest接続前にデバイスチェック

**Tasks:**
- [ ] デバイス選択UI実装
  - カメラ一覧
  - マイク一覧
  - スピーカー一覧（オプショナル）
- [ ] プレビュー確認
  - カメラプレビュー
  - 音声レベルメーター
- [ ] 「Join Room」ボタン

**UI:**
```
┌─────────────────────────────────────────┐
│  Device Check                           │
├─────────────────────────────────────────┤
│  Camera: [HD Webcam ▼]                  │
│  ┌───────────────────────────────────┐ │
│  │ [Camera Preview]                  │ │
│  └───────────────────────────────────┘ │
│                                         │
│  Microphone: [Built-in Mic ▼]          │
│  Audio: [████████░░] 40%                │
│                                         │
│  [Join Room]                            │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] デバイス選択が動作する
- [ ] プレビューが表示される
- [ ] 音声レベルメーターが動作する

**Deliverable:**
- デバイス事前チェック画面

---

### Phase 6.2.2: 接続状態インジケーター改善

**Goal:** Guest接続状態を詳細に表示

**Tasks:**
- [ ] 接続状態管理
  - `connecting`: 接続中
  - `connected`: 接続完了
  - `reconnecting`: 再接続中
  - `disconnected`: 切断
- [ ] UI更新
  - 状態別アイコン表示
  - 再接続アニメーション

**UI:**
```
Status: 🟢 Connected
Status: 🟡 Reconnecting... (Attempt 2/3)
Status: 🔴 Disconnected
```

**Test:**
- [ ] 接続状態が正しく表示される
- [ ] ネットワーク切断時、再接続アニメーション表示

**Deliverable:**
- 接続状態インジケーター改善

---

### Phase 6.2.3: 「収録中」アニメーション

**Goal:** 録画中であることを視覚的に明示

**Tasks:**
- [ ] 録画インジケーターアニメーション
  - 赤い点滅
  - 「REC」表示
- [ ] 録画時間表示
  - リアルタイムカウントアップ

**UI:**
```
🔴 REC  00:15:32
```

**Test:**
- [ ] 録画中、赤い点が点滅する
- [ ] 録画時間が正しくカウントアップされる

**Deliverable:**
- 録画中アニメーション

---

### Phase 6.2.4: Synced状態の明確な表示

**Goal:** アップロード完了を大きく表示

**Tasks:**
- [ ] 成功アニメーション実装
  - チェックマークアニメーション
  - フェードイン効果
- [ ] 大きなメッセージ表示

**UI:**
```
┌─────────────────────────────────────────┐
│                                         │
│           ✅                            │
│                                         │
│  Recording Complete!                    │
│                                         │
│  You can now close this window.         │
│                                         │
└─────────────────────────────────────────┘
```

**Test:**
- [ ] 同期完了後、アニメーションが表示される

**Deliverable:**
- Synced状態の明確な表示

---

### Phase 6.3: ダウンロード機能改善（Phase 4.7で実装済み）

**Note:** Phase 4.7で既に実装済みのため、スキップ

---

### Phase 6.4.1: レスポンシブデザイン対応

**Goal:** モバイル・タブレット対応

**Tasks:**
- [ ] Tailwind CSSでブレークポイント設定
  - `sm`: 640px
  - `md`: 768px
  - `lg`: 1024px
- [ ] 各画面をレスポンシブ対応
  - Director画面
  - Guest画面
  - Standalone/Remote画面

**Test:**
- [ ] スマホサイズで表示
- [ ] レイアウトが崩れない
- [ ] タッチ操作が可能

**Deliverable:**
- レスポンシブデザイン

---

### Phase 6.4.2: ダークモード完全対応

**Goal:** ダークモード切り替え

**Tasks:**
- [ ] Tailwind CSSのダークモード設定
  ```javascript
  // tailwind.config.js
  module.exports = {
    darkMode: 'class',
    // ...
  };
  ```
- [ ] ダークモード切り替えトグル実装
- [ ] 全コンポーネントをダークモード対応

**Test:**
- [ ] ダークモード切り替えが動作する
- [ ] 全画面でダークモードが適用される

**Deliverable:**
- ダークモード完全対応

---

### Phase 6.4.3: アクセシビリティ改善

**Goal:** WCAG 2.1 AA準拠

**Tasks:**
- [ ] ARIA属性追加
  - `aria-label`
  - `aria-describedby`
  - `role`属性
- [ ] キーボードナビゲーション対応
  - Tab順序
  - Enter/Spaceでボタン操作
- [ ] フォーカスインジケーター改善

**Test:**
- [ ] キーボードだけで操作できる
- [ ] スクリーンリーダーで読み上げられる

**Deliverable:**
- アクセシビリティ改善

---

### Phase 6.4.4: エラーメッセージの改善

**Goal:** ユーザーフレンドリーなエラーメッセージ

**Tasks:**
- [ ] エラーメッセージの統一
  - 技術用語を避ける
  - 解決策を提示
- [ ] エラートースト実装

**Example:**
```
Before: "Failed to upload chunk: 500 Internal Server Error"
After:  "Upload failed. Please check your internet connection and try again."
```

**Test:**
- [ ] エラー発生時、わかりやすいメッセージが表示される

**Deliverable:**
- エラーメッセージ改善

---

### Phase 6.4.5: ローディングアニメーション統一

**Goal:** 統一感のあるローディング表示

**Tasks:**
- [ ] ローディングコンポーネント実装
  - スピナーアニメーション
  - スケルトンUI
- [ ] 全画面で統一

**Test:**
- [ ] ローディング表示が統一されている

**Deliverable:**
- ローディングアニメーション統一

---

**Overall Phase 6 Deliverable:**
- **プロダクションレディなUI/UX**
  - Room検索・フィルター・履歴管理
  - 収録統計ダッシュボード
  - エラーログビューア
  - QRコード生成
  - デバイス事前チェック画面
  - 接続状態インジケーター改善
  - 録画中アニメーション
  - Synced状態の明確な表示
  - レスポンシブデザイン
  - ダークモード完全対応
  - アクセシビリティ改善
  - エラーメッセージ改善
  - ローディングアニメーション統一
- **全モードで統一された操作体験**

---

## Phase 7: Enterprise 機能 & SaaS 準備

**Goal:** Maycast Cloud / Enterprise Editionの準備

### 7.1 Cloud Storage 統合

**Tasks:**
- [ ] Cloudflare R2ドライバー実装
- [ ] AWS S3ドライバー実装
- [ ] 環境変数による切り替え

### 7.2 認証・認可

**Tasks:**
- [ ] JWTベース認証
- [ ] Room/Recording所有権検証
- [ ] チーム/プロジェクト管理
- [ ] ユーザーロール管理（Director, Guest, Admin）

### 7.3 Multi-Tenancy

**Tasks:**
- [ ] テナント分離（ストレージパス、DB）
- [ ] 使用量トラッキング

### 7.4 Observability

**Tasks:**
- [ ] OpenTelemetry統合
- [ ] メトリクス（アップロード速度、エラー率）
- [ ] SLA監視

**Deliverable:**
- Community Editionからの移行パス整備
- SaaSローンチ準備完了

---

## Development Principles

1. **Incremental Delivery:** 各フェーズは独立して動作する状態で完了
2. **Test First:** Phase 1から単体テスト + E2Eテストを導入
3. **Documentation:** APIドキュメント、アーキテクチャ図を随時更新
4. **Performance:** Phase 1からプロファイリング（WebCodecs, WASM, OPFS）
5. **Security:** 入力検証、CORS、CSPを初期段階から考慮
6. **Taskfile管理:** 全ての開発コマンドを `Taskfile.yml` に集約
   - ビルド、テスト、開発サーバー起動など、全てのコマンドは `task` 経由で実行
   - `task --list` で常に利用可能なコマンドを確認可能
   - チーム全体で統一されたコマンド体系を維持

---

## Success Metrics

| Phase | 成功指標 |
|-------|---------|
| Phase 1A-1 | **環境セットアップ完成**<br>• Cargo Workspace が正常にビルドできる<br>• WASM が正常にビルドでき、ブラウザから呼び出せる<br>• Vite dev server が起動し、基本的なReact UIが表示される |
| Phase 1A-2 | **WebCodecs カメラキャプチャ完成**<br>• カメラ映像がプレビューに表示される<br>• EncodedVideoChunk/AudioChunk がコンソールに出力される<br>• 1秒ごとにキーフレームが生成される |
| Phase 1A-3 | **WASM Muxer 単体完成**<br>• Rust単体テストでfMP4が生成できる<br>• 生成されたfMP4を `mp4info` で検証できる<br>• WASMビルド後、ブラウザから呼び出せる |
| Phase 1A-4 | **WebCodecs + WASM 統合完成**<br>• 録画中、定期的にfMP4チャンクが生成される<br>• 生成されたチャンクをダウンロードして、VLC等で再生できる<br>• 動画と音声が正しく同期している |
| Phase 1A-5 | **OPFS 保存機能完成**<br>• チャンクがOPFSに正常に保存される<br>• ブラウザリロード後もデータが保持される<br>• IndexedDBにメタデータが正しく記録される |
| Phase 1A-6 | **Phase 1A 全体完成**<br>• 10分の録画が成功し、OPFSに正常なfMP4チャンクが保存される<br>• 個別チャンクをダウンロードして、VLC等で再生できる<br>• 連続する複数のチャンクを順次再生できる |
| Phase 1B | **スタンドアロンモード完成**<br>• Phase 1A の個別チャンクダウンロード機能が削除されている<br>• チャンク結合により完全な.mp4ファイルがダウンロードできる<br>• ブラウザ強制終了後、リカバリーUIで復元できる<br>• 設定変更（デバイス、画質）が正常に機能する |
| Phase 1.5 | **TypeScript移行・構造最適化完成**<br>• commonパッケージがTypeScriptに移行されている<br>• npm workspacesで一元管理されている<br>• web-clientから`@maycast/common-types`をインポートできる<br>• Phase 1の全機能が引き続き正常に動作する |
| Phase 2A-1 | **サーバー環境セットアップ完成**<br>• `task build:server` が成功する<br>• `task dev:server` でサーバーが起動する<br>• `/health` エンドポイントが正常に動作する |
| Phase 2A-2 | **Recording管理API完成**<br>• curlでRecordingを作成できる<br>• Recording情報を取得できる<br>• Recording状態を更新できる<br>• 状態遷移のバリデーションが動作する |
| Phase 2A-3 | **ローカルストレージ基盤完成**<br>• ユニットテストで全テストが成功する<br>• チャンクの書き込み・読み出し・削除が正常に動作する<br>• `listChunks()` でチャンク一覧を取得できる |
| Phase 2A-4 | **Chunk Upload API 基本実装完成**<br>• Recording検証付きでチャンクをアップロードできる<br>• アップロードしたチャンクがファイルシステムに保存される<br>• Recordingのchunk_countが更新される<br>• GETエンドポイントでチャンクを取得できる |
| Phase 2A-5-1 | **ストレージ戦略パターン導入完成**<br>• IStorageStrategyインターフェース定義<br>• StandaloneStorageStrategyに既存ロジック抽出<br>• Recorderコンポーネントに戦略注入<br>• `/solo` が以前と同じように動作する |
| Phase 2A-5-2 | **Remote Mode基盤完成**<br>• RecordingManager実装（createRecording, updateState等）<br>• サーバーURL設定UI（Settings画面統合）<br>• サーバー接続確認機能<br>• CORS設定完了 |
| Phase 2A-5-3 | **チャンクアップロード機能完成**<br>• ChunkUploaderクラス実装<br>• アップロードキュー管理（最大3並列）<br>• 自動リトライ機能（最大3回）<br>• IndexedDBに状態記録 |
| Phase 2A-5-4 | **Remote Mode完全統合・UI共通化完成**<br>• RemoteStorageStrategy実装<br>• `/remote` が `/solo` と同じUIを使用<br>• 録画中、チャンクがOPFSとサーバーに並行保存される<br>• 録画停止時、全チャンクのアップロード完了を待つ<br>• ネットワークエラー時も録画が継続される<br>• 両モードが独立して動作する |
| Phase 2A-6 | **ハッシュ検証・冪等性実装完成**<br>• Blake3ハッシュ検証が動作する<br>• 同じチャンクを再度アップロードしても正常に処理される（冪等性）<br>• ハッシュ改ざん時にエラーが返る |
| Phase 2A-7 | **ダウンロード機能完成**<br>• サーバー側でチャンクをストリーム結合できる<br>• `GET /api/recordings/:id/download` でMP4をダウンロードできる<br>• ダウンロードしたMP4が正常に再生できる<br>• **Phase 2完了：Remote Mode完全実装** |
| Phase 3 | **Resume Upload機能完成**<br>• ブラウザ再起動後、未送信チャンクが自動検出される<br>• バックグラウンドで再アップロードが完了する<br>• Resume Upload UIが正しく動作する<br>• サーバー側で完全なRecordingが復元される |
| Phase 4 | **Room/Director Mode完成**<br>• Directorが Roomを作成できる<br>• Guest URLで複数ゲストが参加できる<br>• 3人のゲストを同時制御し、全員が「Synced」状態に到達<br>• Stop & Flushプロトコルが正常に動作する |
| Phase 5 | 高負荷時でも収録停止が発生しない |
| Phase 6 | ユーザビリティテストで90%以上が「使いやすい」と評価 |
| Phase 7 | SaaS環境で24時間連続稼働、99.9% Uptime達成 |

---

## Timeline Guidance

各フェーズの期間は開発体制により変動しますが、以下を目安とします。

- **Phase 1A-1:** 環境構築。早期に完了させる
- **Phase 1A-2:** WebCodecs の動作確認。独立してテスト可能
- **Phase 1A-3:** Rust WASM Muxer の実装。単体テストで品質保証
- **Phase 1A-4:** 統合テスト。fMP4チャンク生成の検証が最重要
- **Phase 1A-5:** OPFS実装。永続化の検証
- **Phase 1A-6:** エンドツーエンドテスト。全体フロー確認
- **Phase 1B:** エクスポート・リカバリー・UI完成。Phase 1A より短期間で完了可能
- **Phase 1.5:** 構造最適化。Phase 2への準備として型定義をTypeScriptに統一
- **Phase 2A-1:** サーバー環境構築。Express基盤の確立
- **Phase 2A-2:** Recording管理API。Recordingライフサイクルの確立
- **Phase 2A-3:** ストレージ基盤。単体テストで品質保証
- **Phase 2A-4:** Upload API実装。Recording検証付きアップロード
- **Phase 2A-5:** **リアルタイムアップロード実装**。UI共通化とRemote Mode完全実装、最重要フェーズ
  - **Phase 2A-5-1:** ストレージ戦略パターン導入。既存コードのリファクタリング
  - **Phase 2A-5-2:** Recording管理通信層。サーバーURL設定とAPI通信
  - **Phase 2A-5-3:** チャンクアップロード機能。キュー管理・リトライ機能
  - **Phase 2A-5-4:** Remote Mode統合。UI完全共通化、並行アップロード実現
- **Phase 2A-6:** ハッシュ検証・冪等性。データ整合性の保証
- **Phase 2A-7:** ダウンロード機能。MP4ストリーム結合配信、Phase 2完了
- **Phase 3:** Resume Upload機能。既存実装（UploadStateStorage, ChunkUploader）を活用して短期間で実装可能
- **Phase 4:** Director Modeはプロダクトの差別化要因
- **Phase 5-6:** UXの洗練。ユーザーテストを繰り返す
- **Phase 7:** ビジネス要件に応じて調整

---

## Next Steps

1. **Phase 1A-1 から開始:** Cargo Workspace + Vite + WASM パイプライン構築
   - **Taskfile.yml のセットアップを最優先で実施**
   - 以降の全てのコマンドを `task` 経由で実行できるようにする
2. **各サブフェーズを順次完了:** 独立してテスト可能なため、確実に進める
3. **Phase 1 の技術検証を早期に実施:**
   - Phase 1A-2: WebCodecs が期待通りに動作するか
   - Phase 1A-3: Rust で fMP4 が正しく生成できるか
   - Phase 1A-4: 統合時の同期問題がないか
4. **Phase 1A-6 完了時点で、fMP4チャンク生成の全体フローが検証完了**
5. **Phase 1B でスタンドアロンモードを完成:**
   - チャンク結合によるMP4エクスポート
   - クラッシュリカバリー機能
   - プロダクションレディなUI
6. **Phase 1.5 で構造を最適化:**
   - commonパッケージをTypeScriptに移行
   - npm workspacesでモノレポ管理
   - Phase 2への準備完了
7. **Phase 2A-1 から開始:** サーバー側基盤構築
   - TypeScript + Express のセットアップ
   - Taskfile.yml にサーバー関連タスク追加
8. **Phase 2 の各サブフェーズを順次完了:**
   - Phase 2A-2: Recording管理APIを実装し、curlでテスト
   - Phase 2A-3: ストレージ基盤を単体テストで検証
   - Phase 2A-4: Upload APIにRecording検証を追加
   - Phase 2A-5: **録画中のリアルタイムアップロード実装**（UI共通化 + OPFS + サーバー並行保存）
     - Phase 2A-5-1: ストレージ戦略パターン導入、既存コードリファクタリング
     - Phase 2A-5-2: RecordingManager・サーバーURL設定UI実装
     - Phase 2A-5-3: ChunkUploader実装（キュー管理・リトライ）
     - Phase 2A-5-4: RemoteStorageStrategy統合、UI完全共通化
   - Phase 2A-6: データ整合性を保証（Blake3ハッシュ検証・冪等性）
   - Phase 2A-7: ダウンロード機能実装（チャンク結合→MP4配信）
9. **Phase 2A-7 完了時点で、Recording作成→アップロード→ダウンロードの完全なフローが検証完了**
10. **Phase 3以降:**
    - Phase 3: Resume Upload機能（未送信チャンク検出、バックグラウンド再送信、UI実装）
    - Phase 4: Room機能・Director Mode（WebSocket実装、複数Recording管理、各RecordingのMP4ダウンロード）

## 推奨される Taskfile コマンド体系

プロジェクト全体で以下のようなタスク構造を推奨します。

```bash
# 開発
task dev              # 開発サーバー起動（WASM自動リビルド + Vite HMR）
task dev:client       # クライアントのみ起動
task dev:wasm         # WASMのみWatch mode

# ビルド
task build            # 全体ビルド（WASM + クライアント）
task build:wasm       # WASMビルド（wasm-pack）
task build:client     # クライアントビルド（Vite）

# テスト
task test             # 全テスト実行
task test:rust        # Rust単体テスト
task test:wasm        # WASMテスト（ブラウザ環境）
task test:e2e         # E2Eテスト（Phase 1A-6以降）

# リンター・フォーマット
task lint             # 全てのLint実行
task lint:rust        # cargo clippy
task lint:ts          # ESLint
task fmt              # 全てのフォーマット実行
task fmt:rust         # cargo fmt
task fmt:ts           # Prettier

# クリーン
task clean            # 全ビルド成果物削除
task clean:wasm       # WASM成果物削除
task clean:client     # クライアント成果物削除

# ユーティリティ
task deps:install     # 全依存関係インストール
task deps:update      # 依存関係更新
```
