# 📋 Maycast Recorder 開発計画

## Overview

本ドキュメントは、Maycast Recorderの段階的な開発計画を定義します。各フェーズは独立して動作可能な状態を目指し、段階的に機能を追加していきます。

---

## Phase 1A: コア録画機能 + チャンク検証 🎯

**Goal:** fMP4チャンク生成・OPFS保存・個別ダウンロード（テスト用）を実装

**Concept:**
- WebCodecs → WASM Muxer → OPFS の基本パイプラインを確立
- 各段階で独立してテスト・検証できるように細分化
- 個別チャンクをダウンロードして、fMP4が正しく生成されているか検証可能にする

---

### Phase 1A-1: 環境セットアップ

**Goal:** プロジェクト基盤を構築し、基本的な動作確認

```text
/maycast-recorder
├── Cargo.toml           # Workspace root
├── /packages
│   ├── /common          # 共通型定義
│   ├── /wasm-core       # Rust -> WASM Muxing
│   └── /web-client      # TypeScript Frontend
└── /docs
```

**Tasks:**
- [ ] Cargo Workspace設定
- [ ] common crateの作成（ChunkID, Metadata基本型）
- [ ] wasm-core crateの作成（wasm-bindgen設定）
- [ ] web-client scaffolding（Vite + React + Tailwind CSS）
- [ ] WASM ビルドパイプライン設定（wasm-pack）
- [ ] Vite から WASM をインポートできることを確認
- [ ] **Taskfile.yml のセットアップ**
  - 全ての開発コマンドをTaskfileに集約
  - `task --list` で利用可能なコマンド一覧を表示

**Taskfile コマンド例:**
```yaml
# task build:wasm     - WASM をビルド
# task build:client   - Vite クライアントをビルド
# task dev            - 開発サーバー起動（WASM自動リビルド + Vite）
# task test:rust      - Rust単体テスト実行
# task clean          - ビルド成果物削除
```

**Test:**
- [ ] `task --list` でタスク一覧が表示される
- [ ] `task build:wasm` が成功する（= `wasm-pack build` 相当）
- [ ] `task dev` で開発サーバーが起動し、Hello World が表示される
- [ ] ブラウザから WASM 関数を呼び出せる（例: `add(1, 2)` → `3`）

---

### Phase 1A-2: WebCodecs カメラキャプチャ単体

**Goal:** カメラ映像・音声のエンコードまでを単体で動作させる

**Tasks:**
- [ ] `getUserMedia()` でカメラ/マイク取得
- [ ] カメラプレビュー表示（video要素）
- [ ] VideoEncoder初期化（H.264, 1秒ごとKeyframe強制）
- [ ] AudioEncoder初期化（AAC）
- [ ] EncodedVideoChunk/AudioChunk取得パイプライン
- [ ] エンコード済みチャンクをコンソールに出力

**UI:**
- [ ] カメラプレビュー表示
- [ ] 録画開始/停止ボタン
- [ ] エンコードチャンク数のカウンター表示

**Test:**
- [ ] カメラ映像がプレビューに表示される
- [ ] 録画開始時、EncodedVideoChunk がコンソールに出力される
- [ ] 録画開始時、EncodedAudioChunk がコンソールに出力される
- [ ] 1秒ごとにキーフレームが生成される（chunk.type === "key"）

---

### Phase 1A-3: Rust WASM Muxer 単体

**Goal:** fMP4生成ロジックを Rust 単体でテスト可能にする

**Dependencies:**
- `mp4` crate（fMP4生成）
- `wasm-bindgen`

**Tasks:**
- [ ] `MuxerState` 構造体定義
- [ ] `init()`: fMP4ヘッダー（ftyp, moov）生成
- [ ] `push_video_chunk(data: &[u8], timestamp: u64, is_key: bool)`: moof + mdat生成
- [ ] `push_audio_chunk(data: &[u8], timestamp: u64)`: 同上
- [ ] `get_fragment() -> Vec<u8>`: 完成したfMP4断片を返す
- [ ] Rust単体テスト作成（モックデータでfMP4生成）

**Test:**
- [ ] Rustの `cargo test` でfMP4生成ロジックが動作する
- [ ] モックデータから生成されたfMP4を `mp4info` コマンドで検証できる
- [ ] WASMビルド後、ブラウザから呼び出せる

---

### Phase 1A-4: WebCodecs + WASM 統合

**Goal:** WebCodecs の出力を WASM Muxer に渡し、fMP4チャンクを生成

**Tasks:**
- [ ] EncodedVideoChunk → WASM `push_video_chunk()` 連携
- [ ] EncodedAudioChunk → WASM `push_audio_chunk()` 連携
- [ ] 定期的に `get_fragment()` を呼び出してfMP4断片取得
- [ ] 生成されたfMP4チャンクをBlobに変換
- [ ] Blobをコンソールに出力 or 一時的にダウンロード

**UI:**
- [ ] Phase 1A-2 のUIに加えて
- [ ] 生成されたfMP4チャンク数の表示
- [ ] 「最新チャンクをダウンロード」ボタン（テスト用）

**Test:**
- [ ] 録画中、定期的にfMP4チャンクが生成される
- [ ] 生成されたチャンクをダウンロードして、VLC等で再生できる
- [ ] 動画と音声が正しく同期している

---

### Phase 1A-5: OPFS 保存機能

**Goal:** 生成されたfMP4チャンクをOPFSに保存・読み出し

**Tasks:**
- [ ] OPFS APIラッパー実装（TypeScript）
- [ ] `writeChunk(sessionId, chunkId, data: Uint8Array)` 実装
- [ ] `readChunk(sessionId, chunkId)` 実装
- [ ] `listChunks(sessionId)` 実装（復旧用）
- [ ] IndexedDBでメタデータ管理（chunk index, timestamp, size, blake3 hash）
- [ ] Phase 1A-4 で生成したチャンクをOPFSに自動保存

**UI:**
- [ ] Phase 1A-4 のUIに加えて
- [ ] OPFS保存状態インジケーター
- [ ] 保存済みチャンク一覧表示

**Test:**
- [ ] 録画中、チャンクがOPFSに保存される
- [ ] ブラウザをリロードしても、保存されたチャンクが残っている
- [ ] `listChunks()` で保存済みチャンクが一覧表示される
- [ ] IndexedDBにメタデータが正しく記録される

---

### Phase 1A-6: エンドツーエンド + チャンク検証

**Goal:** 録画→OPFS保存→個別ダウンロードの全体フローを完成

**Tasks:**
- [ ] セッション管理機能（sessionId生成、セッション状態管理）
- [ ] `downloadChunk(sessionId, chunkId)` 関数実装
- [ ] OPFS からチャンクを読み出してダウンロード
- [ ] 経過時間タイマー表示
- [ ] 録画開始/停止の状態管理

**UI:**
- [ ] シンプルな録画開始ボタン
- [ ] 停止ボタン
- [ ] カメラプレビュー表示
- [ ] 経過時間表示
- [ ] 保存済みチャンク一覧表示（開発者向け）
- [ ] 個別チャンクダウンロードボタン

**Test:**
- [ ] 10分の録画が成功し、fMP4チャンクがOPFSに正常に保存される
- [ ] 個別チャンクをダウンロードして、VLC等のメディアプレイヤーで再生できる
- [ ] チャンクのメタデータ（timestamp, size, hash）がIndexedDBに正しく保存される
- [ ] 連続する複数のチャンクをダウンロードして、順次再生できる

**Deliverable:**
- **Phase 1A 全体の完了条件**
  - 録画→fMP4チャンク生成→OPFS保存→個別ダウンロードの全フローが動作
  - 個別チャンクが完全に再生可能（fMP4として正しく生成されている）
  - ブラウザリロード後もデータが保持される

---

## Phase 1B: エクスポート・リカバリー・UI完成 🎯

**Goal:** チャンク結合によるMP4エクスポート、クラッシュリカバリー、プロダクションレディなUIを実装

**Concept:**
- Phase 1A で検証済みのチャンクを結合して完全なMP4を生成
- ブラウザクラッシュ・電源断からの復元機能
- ユーザーフレンドリーなUIに仕上げる

### 1B.1 エクスポート機能（Client-side Concatenation）

**Goal:** サーバーなしで、OPFS内のチャンクを結合してダウンロード

**Dependencies:**
- `ReadableStream` API
- Rust WASM でのストリーム処理

**Tasks:**
- [ ] 個別チャンクダウンロード機能の削除（Phase 1A のテスト用機能）
- [ ] WASM側でチャンクを順次読み出すストリーム生成
- [ ] `ReadableStream` を使った段階的なダウンロード実装
- [ ] メモリ使用量最適化（大容量動画対応）
- [ ] ダウンロード進捗表示UI

### 1B.2 クラッシュリカバリー機能

**Goal:** ブラウザクラッシュ・電源断からの自動復元

**Tasks:**
- [ ] OPFS内の未完了セッションスキャン機能
- [ ] セッションメタデータ管理（IndexedDB）
  - 開始時刻、終了フラグ、録画時間
- [ ] 起動時リカバリーチェック処理
- [ ] リカバリーモーダルUI実装
  - 「前回の収録（日時、時間）を復元しますか？」
  - 復元 / 破棄 ボタン
- [ ] 復元後の自動エクスポート機能

### 1B.3 デバイス・画質設定機能

**Tasks:**
- [ ] カメラ/マイクデバイス列挙（`enumerateDevices()`）
- [ ] デバイス選択UI（ドロップダウン）
- [ ] 画質プリセット設定
  - Stability Mode（1秒キーフレーム、安定優先）
  - Quality Mode（高画質、ファイルサイズ大）
- [ ] 設定のローカルストレージ保存

### 1B.4 UI/UX 完成版実装

**画面構成:**

1. **ランディング（待機画面）**
   - [ ] 中央に波形ビジュアライザー（マイク入力確認）
   - [ ] 大きな「REC」ボタン
   - [ ] 歯車アイコン（設定モーダル起動）
   - [ ] カメラプレビュー

2. **収録中画面**
   - [ ] 経過時間タイマー
   - [ ] リアルタイム波形表示
   - [ ] 「STOP」ボタン
   - [ ] ステータス表示「🟢 Saving locally (OPFS active)」

3. **完了画面（Post-Recording）**
   - [ ] プレビュープレイヤー（収録内容確認）
   - [ ] `Download MP4` ボタン
   - [ ] `Discard`（削除）ボタン
   - [ ] ダウンロード進捗バー

**Tasks:**
- [ ] 各画面のコンポーネント実装
- [ ] 画面遷移ロジック
- [ ] レスポンシブデザイン対応

**Deliverable:**
- **Phase 1B の完了条件**
  - Phase 1A で作成した個別チャンクダウンロード機能が削除されている
  - OPFS内の全チャンクを結合して、完全な .mp4 ファイルをダウンロードできる
  - ブラウザクラッシュ・電源断後、リカバリーUIで復元できる
  - デバイス・画質設定が正常に機能する
  - プロダクションレディなUIが完成している

**Overall Phase 1 (1A + 1B) Deliverable:**
- **完全なスタンドアロン録画アプリケーション（Maycast Solo）**
  - ログイン不要でURL（例: `/solo`）にアクセス
  - 録画→fMP4化→OPFS保存→結合ダウンロード
  - クラッシュ復元機能搭載
  - プロダクションレディなUI

---

## Phase 1.5: TypeScript移行・構造最適化 🎯

**Goal:** Phase 2のサーバー実装に備えて、型定義をTypeScriptに統一し、プロジェクト構成を最適化

**Concept:**
- commonパッケージをRustからTypeScriptに移行
- クライアント・サーバー間で型定義を共有可能にする
- プロジェクト構造を最終形態に近づける

---

### Phase 1.5-1: 共通型定義のTypeScript移行

**Goal:** RustのcommonパッケージをTypeScriptに書き直し、型安全性を維持

**Tasks:**
- [ ] `packages/common-types`（TypeScriptパッケージ）を新規作成
- [ ] package.json設定（name: @maycast/common-types）
- [ ] TypeScript設定（tsconfig.json）
  - declaration: true（.d.tsファイル生成）
  - composite: true（プロジェクト参照用）
- [ ] 以下の型定義をTypeScriptに移植:
  - [ ] `ChunkId` - チャンクの一意識別子
  - [ ] `ChunkMetadata` - チャンクのメタデータ
  - [ ] `RecordingMetadata` - 録画全体のメタデータ（コーデック、解像度など）
  - [ ] `RecordingId` - 録画の一意識別子（UUID使用）
  - [ ] `RecordingState` - 録画の状態（'standby' | 'recording' | 'finalizing' | 'synced'）
  - [ ] `Recording` - 録画全体の情報（Phase 2で使用）
  - [ ] `RoomId` - Roomの一意識別子（Phase 4で使用）
  - [ ] `Room` - Room全体の情報（Phase 4で使用）
- [ ] WebSocketメッセージ型定義を追加（Phase 4で使用）
  - [ ] `RoomCreated { room_id, created_at }`
  - [ ] `RoomStateChanged { room_id, state, timestamp }`
  - [ ] `RecordingCreated { room_id, recording_id, created_at }`
  - [ ] `RecordingStateChanged { room_id, recording_id, state, timestamp }`
  - [ ] `ChunkUploaded { room_id, recording_id, chunk_id, timestamp }`
  - [ ] `UploadProgress { room_id, recording_id, uploaded, total }`
  - [ ] `DirectorCommand { room_id, command: 'start' | 'stop' }`
- [ ] エクスポート設定（index.ts）

**Test:**
- [ ] `npm run build` でビルドが成功する
- [ ] .d.tsファイルが正しく生成される
- [ ] web-clientから型をインポートできる

**Deliverable:**
- TypeScriptベースの共通型定義パッケージ
- 型定義ファイル（.d.ts）が生成される

---

### Phase 1.5-2: プロジェクト構成の最適化

**Goal:** パッケージ構成を見直し、依存関係を整理

**Project Structure (変更後):**
```text
/maycast-recorder
├── Cargo.toml           # WASM専用Workspace
├── Taskfile.yml
├── package.json         # Root package.json（npm workspace）
├── /packages
│   ├── /common-types    # TypeScript共通型定義（新規）
│   ├── /wasm-core       # Rust -> WASM Muxing（変更なし）
│   ├── /web-client      # TypeScript Frontend（依存関係更新）
│   └── /server          # 将来追加（Phase 2A-1）
└── /docs
```

**Tasks:**
- [ ] ルートpackage.json作成（npm workspaces設定）
- [ ] workspacesフィールド追加
  ```json
  {
    "workspaces": [
      "packages/common-types",
      "packages/web-client",
      "packages/server"
    ]
  }
  ```
- [ ] web-clientのpackage.jsonを更新
  - [ ] `@maycast/common-types`を依存関係に追加
  - [ ] インポートパスを修正
- [ ] Rustのcommonパッケージを削除
  - [ ] `packages/common/`ディレクトリ削除
  - [ ] Cargo.tomlのworkspace membersから削除
- [ ] Taskfile.ymlを更新
  - [ ] `task build:common` 追加（common-typesのビルド）
  - [ ] `task build` を更新（common-types → wasm → client の順）

**Test:**
- [ ] `task build` が成功する
- [ ] web-clientから`@maycast/common-types`をインポートできる
- [ ] TypeScriptの型チェックが正常に動作する
- [ ] WASMビルドに影響がない

**Deliverable:**
- 最適化されたモノレポ構成
- TypeScriptとRustの明確な責任分離

---

### Phase 1.5-3: 既存コードの移行とテスト

**Goal:** web-client内の型参照を新しいcommon-typesに切り替え、動作確認

**Tasks:**
- [ ] web-client内の型定義を削除
  - [ ] ローカルで定義していたChunkId等を削除
  - [ ] `@maycast/common-types`からインポートに変更
- [ ] OPFSストレージ層の型を統一
  - [ ] ChunkMetadataの使用箇所を更新
  - [ ] SessionStateの使用箇所を更新
- [ ] IndexedDBスキーマの型定義を更新
- [ ] 全ファイルでTypeScriptの型チェックを実行
  - [ ] `tsc --noEmit`でエラーがないことを確認

**Test:**
- [ ] Phase 1で実装した全機能が正常に動作する
  - [ ] 録画開始・停止
  - [ ] OPFSへのチャンク保存
  - [ ] エクスポート機能
  - [ ] クラッシュリカバリー
- [ ] TypeScriptのビルドが成功する
- [ ] ブラウザでの動作確認

**Deliverable:**
- common-typesを使用した完全なPhase 1実装
- Phase 2への準備完了

---

**Overall Phase 1.5 Deliverable:**
- **TypeScript統一型定義システム**
  - クライアント・サーバー間で型を共有可能
  - RustのcommonパッケージからTypeScriptへの完全移行
  - npm workspacesによる一元管理
- **Phase 2への準備完了**
  - サーバー実装時に型定義をそのまま使用可能
  - 型の二重管理を回避

---

## Phase 2: サーバー側基盤構築 🎯

**Goal:** Recording管理とChunk Upload APIを実装し、クライアント→サーバーのアップロードパイプラインを確立

**Concept:**
- サーバー側でRecording（単一クライアントの録画）を作成・管理する機能を実装
- **録画中にチャンクをリアルタイムでサーバーにアップロード**（Phase 1のOPFS保存と並行）
- ネットワークエラー時もローカル録画を継続する堅牢性を維持
- サーバー側の各機能を独立してテスト可能な状態で実装
- 各サブフェーズで独立した成果物を生成し、検証可能にする
- **HTTP APIのみで実装**（WebSocketはPhase 4のRoom機能で導入）
- **Phase 4のRoom機能（複数Recordingを束ねる）の基盤を構築**

**用語定義:**
- **Recording**: 単一クライアントの録画データ（Phase 2で実装）
- **Room**: 複数Recordingを束ねる収録セッション（Phase 4で実装）
  - 例: Room内にGuest A, B, Cの3つのRecordingが含まれる

**全体フロー（Phase 2: Remote Mode - 単一Recording）:**
```text
[Client: /remote]                           [Server]
   |                                           |
【初期化】
   |-- GET /health ------------------------->  | サーバー接続確認
   |<-- 200 OK ------------------------------|
   |                                           |
【録画開始前】
   | ユーザーが「REC」ボタンを押下              |
   |                                           |
   |-- 1. POST /api/recordings ------------->  | Recording作成
   |<-- recording_id, state: "standby" -------|
   |                                           |
   |-- 2. PATCH /api/recordings/:id/metadata -> | RecordingMetadata保存
   |<-- OK -----------------------------------|
   |                                           |
   |-- 3. PATCH /api/recordings/:id/state --->  | state: "recording"
   |<-- OK -----------------------------------|
   |                                           |
【録画中 - WebCodecs稼働】
   |                                           |
   | WebCodecs: チャンク生成                    |
   |   ├─> OPFS保存（バックアップ）             |
   |   └─> ChunkUploader経由でサーバー送信 --->  |
   |                                           |
   |-- 4. POST /recordings/:id/chunks/001 ---> | チャンク保存
   |<-- 201 Created --------------------------|  └─> ./storage/{recording_id}/chunk-001.fmp4
   |                                           |
   | WebCodecs: 次のチャンク生成                |
   |   ├─> OPFS保存                           |
   |   └─> サーバーアップロード（並行3並列）--->  |
   |                                           |
   |-- 5. POST /recordings/:id/chunks/002 ---> | チャンク保存
   |<-- 201 Created --------------------------|
   |                                           |
   |   ... (録画中、随時チャンクアップロード)      |
   |                                           |
【録画停止】
   | ユーザーが「STOP」ボタンを押下            |
   | WebCodecs: 停止                          |
   | 未送信チャンクの完了を待機...              |
   | UI: "Finalizing upload..." 表示          |
   |                                           |
   |-- N. PATCH /api/recordings/:id/state ---> | state: "synced"
   |<-- OK -----------------------------------|
   |                                           |
   | ✓ 録画完了 & サーバー同期完了             |
   | UI: "✓ Synced to server" 表示            |
```

**Phase 4でのRoom拡張イメージ:**
```text
[Director: /director]                       [Server]
   |-- POST /api/rooms ----------------------> | Room作成
   |<-- room_id, guest_url ------------------|  └─> room_id: "room-abc123"
   |                                           |     guest_url: "/guest/room-abc123"
   | Director: Guest URLを配布                |

[Guest A: /guest/room-abc123]
   |-- POST /api/recordings ----------------->  | Recording作成（room_id紐付け）
   |<-- recording_id (recording_a) -----------|
   |-- 録画・チャンクアップロード ------------->  | ./storage/room-abc123/recording_a/chunk-*.fmp4

[Guest B: /guest/room-abc123]
   |-- POST /api/recordings ----------------->  | Recording作成（room_id紐付け）
   |<-- recording_id (recording_b) -----------|
   |-- 録画・チャンクアップロード ------------->  | ./storage/room-abc123/recording_b/chunk-*.fmp4

→ 同一Room内に複数Recordingが集約される
```

**Note:** Standalone Mode (`/solo`) では上記のサーバー通信は一切行わず、OPFS保存のみを実行します。

---

### Phase 2A-1: サーバー環境セットアップ

**Goal:** TypeScript + Expressベースのサーバー基盤を構築し、基本的な動作確認

**Project Structure:**
```text
/maycast-recorder
├── /packages
│   ├── /common          # 既存（Phase 1で作成済み）
│   ├── /wasm-core       # 既存（Phase 1で作成済み）
│   ├── /web-client      # 既存（Phase 1で作成済み）
│   └── /server          # 新規作成（TypeScript + Express サーバー）
└── Taskfile.yml
```

**Tasks:**
- [ ] `server` パッケージの作成（package.json設定）
- [ ] TypeScript + Express の依存関係追加
  - express, @types/express
  - typescript, ts-node, nodemon
  - dotenv, cors, morgan (ロギング)
- [ ] TypeScript設定（tsconfig.json）
- [ ] 基本的なserver.ts実装（サーバー起動ロジック）
- [ ] `/health` エンドポイント実装
- [ ] 環境変数設定（.env: PORT, LOG_LEVEL）
- [ ] Taskfile.yml にサーバー関連タスク追加
  - `task dev:server` - サーバー起動（nodemon）
  - `task build:server` - TypeScriptコンパイル
  - `task test:server` - サーバーテスト

**Test:**
- [ ] `task build:server` が成功する
- [ ] `task dev:server` でサーバーが起動する（例: http://localhost:3000）
- [ ] `curl http://localhost:3000/health` で `{"status": "ok"}` が返る
- [ ] ログが正常に出力される

**Deliverable:**
- 動作するExpressサーバーの基盤
- `/health` エンドポイントでヘルスチェック可能

---

### Phase 2A-2: Recording管理API実装

**Goal:** Recording（単一クライアントの録画）の作成・取得・状態管理APIを実装

**Concept:**
- クライアントが録画を開始する前に、サーバーに新しいRecordingを作成
- サーバーがRecording IDを発行し、クライアントに返却
- クライアントはそのRecording IDを使ってチャンクをアップロード
- Recordingの状態（Standby, Recording, Finalizing, Synced）を管理
- **Phase 4でRoom機能を追加する際の基盤**

**Dependencies:**
- `uuid` (Recording ID生成)

**Storage Structure:**
```text
Server側のデータ構造（Phase 2）:
/storage
├── /{recording_id_1}/
│   ├── chunk-001.fmp4
│   ├── chunk-002.fmp4
│   └── ...
└── /{recording_id_2}/
    ├── chunk-001.fmp4
    └── ...

Recordingメタデータ（Phase 2ではインメモリMap）:
recordings: Map<recording_id, Recording>
```

**Phase 4でのRoom拡張時のStorage構造:**
```text
/storage
└── /{room_id}/
    ├── /{recording_id_1}/  # Guest A
    │   ├── chunk-001.fmp4
    │   └── ...
    ├── /{recording_id_2}/  # Guest B
    │   └── ...
    └── /{recording_id_3}/  # Guest C
        └── ...
```

**Tasks:**
- [ ] Recordingデータモデル定義（TypeScript）
  ```typescript
  interface Recording {
    id: string;           // UUID
    state: RecordingState;  // 'standby' | 'recording' | 'finalizing' | 'synced'
    createdAt: Date;
    startedAt?: Date;
    finishedAt?: Date;
    metadata?: RecordingMetadata;
    chunkCount: number;
    roomId?: string;      // Phase 4で使用（Phase 2ではnull）
  }
  ```
- [ ] Recordingストレージ実装（インメモリMap）
  - `recordings: Map<string, Recording>`
  - Phase 7でデータベースに移行予定
- [ ] `POST /api/recordings` エンドポイント実装
  - 新しいRecordingを作成
  - UUIDでRecording ID生成
  - 初期状態は `standby`
  - レスポンス: `{ recording_id, created_at, state }`
- [ ] `GET /api/recordings/:recording_id` エンドポイント実装
  - Recording情報を取得
  - 存在しない場合は `404 Not Found`
- [ ] `PATCH /api/recordings/:recording_id/state` エンドポイント実装
  - Recording状態を更新
  - リクエストボディ: `{ state: RecordingState }`
  - 状態遷移のバリデーション（Standby → Recording → Finalizing → Synced）
- [ ] `PATCH /api/recordings/:recording_id/metadata` エンドポイント実装
  - 録画メタデータを保存
  - リクエストボディ: `RecordingMetadata`
- [ ] エラーハンドリング
  - 不正な状態遷移: `400 Bad Request`
  - Recording未存在: `404 Not Found`

**Test:**
- [ ] curlでRecording作成
  ```bash
  curl -X POST http://localhost:3000/api/recordings \
    -H "Content-Type: application/json"
  # レスポンス例: {"recording_id": "550e8400-e29b-41d4-a716-446655440000", ...}
  ```
- [ ] Recording情報取得
  ```bash
  curl http://localhost:3000/api/recordings/550e8400-e29b-41d4-a716-446655440000
  ```
- [ ] 状態更新
  ```bash
  curl -X PATCH http://localhost:3000/api/recordings/550e8400-e29b-41d4-a716-446655440000/state \
    -H "Content-Type: application/json" \
    -d '{"state": "recording"}'
  ```
- [ ] 不正な状態遷移でエラーが返る（standby → synced など）
- [ ] 存在しないRecording IDで404が返る

**Deliverable:**
- Recording管理API（作成、取得、状態更新）
- Recordingライフサイクル管理
- Phase 4のRoom機能実装に向けた基盤

---

### Phase 2A-3: ローカルストレージ基盤

**Goal:** ファイルシステムへのチャンク保存・読み出し機能を単体で実装

**Dependencies:**
- `fs/promises` (非同期ファイルIO)
- `blake3` (ハッシュ検証用、npmパッケージ）

**Tasks:**
- [ ] `storage` モジュール作成（src/storage/）
- [ ] `StorageBackend` インターフェース定義
  - `putChunk(sessionId: string, chunkId: string, data: Buffer): Promise<void>`
  - `getChunk(sessionId: string, chunkId: string): Promise<Buffer>`
  - `listChunks(sessionId: string): Promise<string[]>`
  - `deleteChunk(sessionId: string, chunkId: string): Promise<void>`
- [ ] `LocalFileSystemStorage` クラス実装
  - ファイルパス: `./storage/{session_id}/{chunk_id}.fmp4`
  - ディレクトリ自動作成（fs.mkdir with recursive）
- [ ] ユニットテスト作成（Jest or Vitest）
  - チャンク書き込み→読み出し→削除のテスト
  - 存在しないチャンクの読み出しエラーハンドリング

**Test:**
- [ ] `task test:server` で全テストが成功する
- [ ] テストデータでチャンクを書き込み、ファイルシステムに保存される
- [ ] 保存されたチャンクを読み出して、元のデータと一致する
- [ ] `listChunks()` で保存されたチャンク一覧を取得できる

**Deliverable:**
- ローカルファイルシステムストレージの完全な実装
- 単体テストでストレージ機能が検証済み

---

### Phase 2A-4: Chunk Upload API 基本実装

**Goal:** チャンクアップロード用のHTTP APIを実装（Recording検証付き）

**Tasks:**
- [ ] `POST /api/recordings/:recording_id/chunks/:chunk_id` エンドポイント実装
- [ ] Recording存在確認
  - Recordingが存在しない場合は `404 Not Found`
  - Recording状態が `recording` または `finalizing` でない場合は `400 Bad Request`
- [ ] リクエストボディからバイナリデータ取得（express.raw() middleware使用）
- [ ] `StorageBackend.putChunk()` を呼び出して保存
- [ ] Recordingのチャンクカウントを更新
- [ ] レスポンス返却（201 Created）
- [ ] エラーハンドリング（400 Bad Request, 404 Not Found, 500 Internal Server Error）
- [ ] `GET /api/recordings/:recording_id/chunks/:chunk_id` エンドポイント実装（検証用）
- [ ] 簡易的なロギング追加（morgan）

**Test:**
- [ ] 事前にRecording作成
  ```bash
  RECORDING_ID=$(curl -X POST http://localhost:3000/api/recordings | jq -r '.recording_id')
  curl -X PATCH http://localhost:3000/api/recordings/$RECORDING_ID/state \
    -H "Content-Type: application/json" \
    -d '{"state": "recording"}'
  ```
- [ ] curlでテストチャンクをアップロード
  ```bash
  curl -X POST http://localhost:3000/api/recordings/$RECORDING_ID/chunks/chunk-001 \
    --data-binary @test-chunk.fmp4 \
    -H "Content-Type: application/octet-stream"
  ```
- [ ] アップロードしたチャンクが `./storage/{recording_id}/chunk-001.fmp4` に保存される
- [ ] `GET /api/recordings/{recording_id}/chunks/chunk-001` で保存されたデータを取得できる
- [ ] 保存されたファイルとアップロードしたファイルが一致する
- [ ] Recordingのchunk_countが増加する
- [ ] 存在しないRecordingへのアップロードで404が返る
- [ ] standby状態のRecordingへのアップロードで400が返る

**Deliverable:**
- Recording検証付きChunk Upload API
- curlやPostmanで手動テスト可能

---

### Phase 2A-5: Remote Mode実装（リアルタイムアップロード機能）

**Goal:** Phase 1のStandalone Modeとは別に、サーバーと連携する「Remote Mode」を新規実装

**Concept:**
- **Standalone Mode (Phase 1)**: `/solo` - サーバーなし、OPFS保存のみ、完全オフライン
- **Remote Mode (Phase 2)**: `/remote` - サーバー連携、セッション管理、リアルタイムアップロード

Remote Modeのフロー:
1. **録画開始前**: サーバーにセッション作成 → session_id取得
2. **録画開始**: session_idを使って録画開始、状態を`recording`に更新
3. **録画中**: チャンク生成時に以下を並行実行
   - OPFS保存（バックアップとして）
   - サーバーへ自動アップロード（メイン）
4. **録画停止**: 全チャンクのアップロード完了を確認、状態を`synced`に更新

**Project Structure:**
```text
/packages/web-client/src
├── /modes
│   ├── /standalone     # Phase 1実装（既存）
│   │   ├── StandaloneRecorder.tsx
│   │   └── ...
│   └── /remote         # Phase 2実装（新規）
│       ├── RemoteRecorder.tsx
│       ├── RecordingManager.ts    # Recording管理
│       ├── ChunkUploader.ts       # チャンクアップロード
│       └── ...
├── /shared             # 共通コンポーネント
│   ├── RecordingEngine.ts  # WebCodecs録画ロジック（両モードで共有）
│   ├── OPFSStorage.ts      # OPFS操作（両モードで共有）
│   └── ...
└── App.tsx
    ├── Route: /solo → Standalone Mode
    └── Route: /remote → Remote Mode
```

**Phase 4でのGuest Mode追加イメージ:**
```text
└── /modes
    ├── /standalone
    ├── /remote
    ├── /guest          # Phase 4で追加
    │   ├── GuestRecorder.tsx
    │   └── ...
    └── /director       # Phase 4で追加
        ├── DirectorDashboard.tsx
        ├── RoomManager.ts
        └── ...
```

**Tasks:**

**基本設定:**
- [ ] `/remote` ルーティング追加
- [ ] Remote Mode用のディレクトリ構成作成
- [ ] サーバーURL設定UI実装
  - デフォルト: `http://localhost:3000`
  - 設定をlocalStorageに保存
- [ ] CORS設定（サーバー側）

**Recording管理ロジック:**
- [ ] `RecordingManager.ts` 実装
  - `createRecording()` - `POST /api/recordings`
  - `updateRecordingState(recordingId, state)` - `PATCH /api/recordings/:id/state`
  - `uploadRecordingMetadata(recordingId, metadata)` - `PATCH /api/recordings/:id/metadata`
  - Recording IDをメモリに保持

**チャンクアップロードロジック:**
- [ ] `ChunkUploader.ts` 実装
  - `uploadChunk(recordingId, chunkId, data: Uint8Array)`
    - `fetch()` APIでPOSTリクエスト送信
    - 非同期処理（録画をブロックしない）
  - アップロードキュー管理
    - チャンク生成順にアップロード
    - 並行アップロード数の制限（最大3並列）
    - 失敗時の自動リトライ（最大3回）
  - アップロード状態管理
    - チャンクごとの状態: 未送信 / 送信中 / 送信完了 / 送信失敗
    - IndexedDBに状態を記録

**Remote Mode録画フロー:**
- [ ] `RemoteRecorder.tsx` コンポーネント実装
  1. **初期化**:
     - サーバー接続確認（`GET /health`）
     - 接続できない場合はエラー表示
  2. **録画開始**:
     - 「REC」ボタン押下
     - サーバーにRecording作成（`createRecording()`）
     - recording_idを受け取る
     - メタデータをサーバーに送信
     - Recording状態を`recording`に更新
     - WebCodecs録画開始
  3. **録画中**:
     - RecordingEngine（共通ロジック）でチャンク生成
     - チャンク生成時:
       - OPFS保存（バックアップとして）
       - **ChunkUploader経由でサーバーアップロード**
  4. **録画停止**:
     - 「STOP」ボタン押下
     - WebCodecs録画停止
     - 未送信チャンクの完了を待機
     - Recording状態を`synced`に更新

**エラーハンドリング:**
- [ ] サーバー接続エラー時の処理
  - 録画開始前: エラーメッセージ表示、録画開始不可
  - 録画中: 録画継続（OPFS保存のみ）、ステータス表示を変更
- [ ] アップロード失敗時の処理
  - IndexedDBに失敗チャンクを記録
  - 後で手動再送可能にする（Phase 3で実装予定）
- [ ] ネットワーク復旧検知
  - 定期的にサーバー接続確認
  - 復旧後、失敗したチャンクを自動再送

**UI（Remote Mode専用）:**

**1. 接続設定画面（録画開始前）:**
- [ ] サーバーURL入力フィールド
  - デフォルト: `http://localhost:3000`
  - 保存ボタン（localStorageに保存）
- [ ] 接続テストボタン
  - `GET /health` を呼び出して接続確認
  - 🟢 Connected / 🔴 Connection failed
- [ ] モード表示
  - 「Remote Mode - Server Sync Enabled」

**2. ランディング画面（待機中）:**
- [ ] Phase 1と同様のUI
  - カメラプレビュー
  - 波形ビジュアライザー
  - 「REC」ボタン
- [ ] サーバー接続ステータス表示
  - 🟢 Server connected
  - Recording ID: (作成後に表示)

**3. 録画中画面:**
- [ ] Phase 1と同様の基本UI
  - 経過時間タイマー
  - 波形表示
  - 「STOP」ボタン
- [ ] **Remote Mode専用のステータス表示:**
  - 🟢 Recording + Syncing to server
  - 📊 Uploaded: 15/20 chunks
  - 進捗バー表示
  - **ネットワークエラー時:**
    - 🔴 Recording (Local only - sync paused)
    - 警告メッセージ: "Server connection lost. Recording continues locally."

**4. 録画停止時の待機UI:**
- [ ] 「Finalizing upload...」モーダル表示
  - プログレスバー: 18/20 chunks synced
  - 「Please wait. Do not close this tab.」
- [ ] アップロード完了後
  - ✓ Synced to server
  - Session ID: {session_id}

**5. 完了画面:**
- [ ] Phase 1と異なる表示
  - 「✓ Recording synced to server」
  - Recording ID表示
  - **「Download MP4」ボタン**（Phase 2A-7で実装）
  - 「New Recording」ボタン

**Test:**

**基本フローテスト:**
- [ ] `/remote` にアクセス → Remote Mode画面が表示される
- [ ] サーバーURL設定 → localStorageに保存される
- [ ] 接続テスト → 🟢 Connected が表示される
- [ ] 録画開始 → サーバーにRecordingが自動作成される
- [ ] Recording IDが画面に表示される
- [ ] 録画中、チャンクがOPFSとサーバーの両方に保存される
- [ ] サーバーの `./storage/{recording_id}/` にチャンクが随時保存される
- [ ] UIに「Uploaded: 15/20 chunks」のような進捗が表示される
- [ ] 録画停止 → 「Finalizing upload...」モーダルが表示される
- [ ] 全チャンクのアップロード完了を待つ
- [ ] 完了後、Recording状態が`synced`になる
- [ ] サーバー側でRecording情報を確認
  ```bash
  curl http://localhost:3000/api/recordings/{recording_id}
  # レスポンス: {"state": "synced", "chunk_count": 20, ...}
  ```

**エラーハンドリングテスト:**
- [ ] サーバー停止状態で録画開始を試みる
  - エラーメッセージが表示される
  - 録画開始ボタンが無効化される
- [ ] 録画中にサーバーを停止
  - ステータスが「🔴 Recording (Local only - sync paused)」に変わる
  - 録画は継続される
  - OPFSにはチャンクが保存される
  - 失敗したチャンクがIndexedDBに記録される
- [ ] サーバーを再起動
  - ステータスが🟢に戻る（Phase 3で実装予定の自動再送）

**並行アップロードテスト:**
- [ ] 複数のチャンクが同時にアップロードされる（最大3並列）
- [ ] サーバーログで並行リクエストを確認
- [ ] ネットワークタブで同時接続数を確認

**Standalone Modeとの共存テスト:**
- [ ] `/solo` にアクセス → Standalone Mode画面が表示される
- [ ] Standalone Modeで録画 → サーバーへのリクエストなし
- [ ] `/remote` に切り替え → Remote Mode画面が表示される
- [ ] 両モードが独立して動作する

**Deliverable:**
- **Remote Mode（リモートモード）の完全実装**
  - Phase 1のStandalone Modeと独立した新しいモード
  - `/solo` と `/remote` で明確にモード分離
  - リアルタイムチャンクアップロード機能
  - OPFS + サーバーの二重保存システム
  - ネットワークエラー耐性（ローカル録画継続）
  - セッションライフサイクル管理の完全な統合
- **共通コンポーネント化**
  - RecordingEngine（WebCodecs録画ロジック）の共有
  - OPFSStorage（ストレージ操作）の共有
  - 両モードで一貫したUX

---

### Phase 2A-6: ハッシュ検証・冪等性実装

**Goal:** データ整合性とアップロードの冪等性を保証

**Tasks:**
- [ ] クライアント側でチャンクのBlake3ハッシュ計算
  - blake3 WebAssemblyパッケージを使用
- [ ] アップロードリクエストにハッシュを含める
  - ヘッダー: `X-Chunk-Hash: <blake3-hash>`
- [ ] サーバー側でハッシュ検証（TypeScript）
  - blake3 npmパッケージでハッシュ計算
  - クライアントから送信されたハッシュと比較
  - 不一致の場合は `400 Bad Request` を返す
- [ ] 冪等性実装
  - 既に存在するチャンクの場合、ハッシュ比較して同一なら `200 OK` を返す
  - ハッシュが異なる場合は `409 Conflict` を返す
- [ ] IndexedDBにアップロード済みチャンクのハッシュを記録

**Test:**
- [ ] チャンクをアップロード→成功
- [ ] 同じチャンクを再度アップロード→`200 OK`（冪等性確認）
- [ ] ハッシュを改ざんしてアップロード→`400 Bad Request`
- [ ] ネットワークエラーで途中失敗→再送信で正常にアップロード完了

**Deliverable:**
- データ整合性が保証されたアップロード機能
- 再送時の安全性確保

---

### Phase 2A-7: ダウンロード機能実装

**Goal:** サーバーに保存されたRecordingのチャンクを結合してMP4ファイルとしてダウンロード

**Concept:**
- サーバー側でチャンクをストリーム結合してMP4として配信
- クライアント側（Remote Mode完了画面）にダウンロードボタンを追加
- メモリ効率的な実装（大容量動画対応）

**Tasks:**

**サーバー側:**
- [ ] `GET /api/recordings/:recording_id/download` エンドポイント実装
  - Recording存在確認
  - Recording状態が `synced` であることを確認
  - チャンク一覧を取得（ファイルシステムから）
  - チャンクを順番に読み出してストリーム結合
  - `Content-Type: video/mp4` で返却
  - `Content-Disposition: attachment; filename="recording-{id}.mp4"`
- [ ] ストリーム処理実装
  - チャンクを1つずつ読み出し
  - `ReadableStream` を使ってレスポンスに書き込み
  - メモリ使用量を最小化
- [ ] Range Request対応（オプショナル）
  - 部分ダウンロード対応
  - `Accept-Ranges: bytes` ヘッダー
  - 大容量ファイルのレジューム対応

**クライアント側:**
- [ ] Remote Mode完了画面にダウンロードボタン追加
- [ ] ダウンロード処理実装
  - `fetch('/api/recordings/{id}/download')`
  - レスポンスをBlobとして取得
  - `URL.createObjectURL()` でダウンロードリンク生成
  - 自動ダウンロード開始
- [ ] ダウンロード進捗表示（オプショナル）
  - ファイルサイズ表示
  - 進捗バー表示

**UI:**
- [ ] Remote Mode完了画面の更新
  ```
  ✓ Recording synced to server
  Recording ID: {recording_id}

  [Download MP4] ← 新規追加
  [New Recording]
  ```
- [ ] ダウンロード中の表示
  ```
  Downloading... (12.5 MB / 45.2 MB)
  [Progress bar ████████░░░░░░░░░░] 27%
  ```

**Test:**
- [ ] Recording作成・チャンクアップロード完了
- [ ] Recording状態が`synced`になる
- [ ] 「Download MP4」ボタンクリック
- [ ] MP4ファイルがダウンロードされる
- [ ] ダウンロードしたMP4をVLCで再生できる
- [ ] 動画・音声が正常に再生される
- [ ] 複数のRecording（異なる長さ）でテスト
- [ ] 大容量Recording（1GB以上）でメモリ使用量確認

**Error Handling:**
- [ ] Recording未存在: `404 Not Found`
- [ ] Recording状態が`synced`でない: `400 Bad Request` (「まだ同期中です」)
- [ ] チャンクファイル破損: エラーログ出力、適切なエラーレスポンス

**Deliverable:**
- Recording MP4ダウンロード機能
- サーバー側ストリーム結合処理
- クライアント側ダウンロードUI

---

**Overall Phase 2 (2A-1 ~ 2A-7) Deliverable:**
- **完全なリアルタイムアップロードシステム（Remote Mode）**
  - **2つのモード実装:**
    - Standalone Mode (`/solo`): Phase 1実装、サーバーレス、ローカルダウンロード
    - **Remote Mode (`/remote`)**: Phase 2実装、サーバー連携、サーバーからダウンロード
  - **Recording管理API**（作成、取得、状態更新）
  - クライアントが録画開始前にRecording IDを取得
  - **録画中にチャンクを随時サーバーにアップロード**（OPFS + サーバーの二重保存）
  - ハッシュ検証によるデータ整合性保証
  - 冪等性により安全な再送が可能
  - ローカルファイルシステムにチャンクが正常に保存される
  - Recordingライフサイクル管理（Standby → Recording → Finalizing → Synced）
  - ネットワークエラー時もローカル録画を継続（堅牢性）
  - **Recording MP4ダウンロード機能**（サーバー側でチャンク結合）
  - **Phase 4のRoom機能（複数Recording管理）実装に向けた基盤構築**

**Note:** WebSocketによるリアルタイム状態同期はPhase 4（Room/Director Mode）で実装します。Phase 2のRemote Modeでは単一クライアントのため、HTTP APIのみで十分です。

---

## Phase 3: 堅牢性機能実装

**Goal:** 「失敗しない」ための4層防御を完成させる

### 3.1 Manifest & Verification

**Tasks:**
- [ ] `@maycast/common-types`にManifest型定義
- [ ] クライアント側でRecordingごとにChunkハッシュリスト生成
- [ ] サーバー側で受信Chunkとハッシュ照合
- [ ] 不足Chunkの検出とNACKプロトコル
- [ ] Recording完了時のManifest検証

### 3.2 Resume Upload 機能

**Tasks:**
- [ ] OPFSから未送信Chunkを検出
- [ ] バックグラウンドで再送信
- [ ] 進捗表示UI

### 3.3 Delta Sync（差分同期）

**Tasks:**
- [ ] サーバー側で現在のChunkリストをクライアントに返す
- [ ] クライアントが差分を検出して送信
- [ ] ネットワーク切断→復旧シナリオのテスト

### 3.4 Crash Recovery

**Tasks:**
- [ ] ブラウザ再起動後、OPFS内の未完了Recordingを検出
- [ ] 「前回の収録を復元しますか？」UI
- [ ] Standalone Mode: エクスポート機能
- [ ] Remote Mode: 自動再アップロード（Recording ID維持）

**Deliverable:**
- 電源断、ブラウザクラッシュ、回線切断に耐えるシステム
- すべてのモードでデータ損失ゼロを保証

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

### Phase 4.1: Room管理API実装

**Goal:** Roomの作成・取得・状態管理APIを実装

**Storage Structure:**
```text
/storage
└── /rooms
    └── /{room_id}/
        ├── /{recording_id_1}/  # Guest A
        │   ├── chunk-001.fmp4
        │   └── ...
        ├── /{recording_id_2}/  # Guest B
        │   └── ...
        └── /{recording_id_3}/  # Guest C
            └── ...

Roomメタデータ（インメモリMap）:
rooms: Map<room_id, Room>

interface Room {
  id: string;              // UUID
  state: RoomState;        // 'standby' | 'recording' | 'finalizing' | 'synced'
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  recordings: string[];    // Recording IDのリスト
  guestUrl: string;        // Guest用のURL
}
```

**Tasks:**
- [ ] Roomデータモデル定義（TypeScript）
- [ ] Roomストレージ実装（インメモリMap）
  - `rooms: Map<string, Room>`
  - Phase 7でデータベースに移行予定
- [ ] `POST /api/rooms` エンドポイント実装
  - 新しいRoomを作成
  - UUIDでRoom ID生成
  - Guest URL生成（例: `/guest/{room_id}`）
  - 初期状態は `standby`
  - レスポンス: `{ room_id, guest_url, created_at, state }`
- [ ] `GET /api/rooms/:room_id` エンドポイント実装
  - Room情報を取得
  - 含まれるRecording一覧も返す
- [ ] `PATCH /api/rooms/:room_id/state` エンドポイント実装
  - Room状態を更新
  - Room内の全Recording状態も連動して更新
- [ ] `GET /api/rooms/:room_id/recordings` エンドポイント実装
  - Room内のすべてのRecordingを取得

**Test:**
- [ ] curlでRoom作成
  ```bash
  curl -X POST http://localhost:3000/api/rooms
  # レスポンス: {"room_id": "room-abc123", "guest_url": "/guest/room-abc123", ...}
  ```
- [ ] Room情報取得
  ```bash
  curl http://localhost:3000/api/rooms/room-abc123
  ```

**Deliverable:**
- Room管理API
- Recording → Roomの紐付け機能

---

### Phase 4.2: Recording API拡張（Room対応）

**Goal:** Recording作成時にRoom IDを指定できるように拡張

**Tasks:**
- [ ] `POST /api/recordings` エンドポイント拡張
  - クエリパラメータ `?room_id=xxx` を受け取る
  - room_idが指定された場合、Recordingに紐付け
  - Room の recordings配列に追加
  - ストレージパス: `./storage/rooms/{room_id}/{recording_id}/`
- [ ] Recording作成時にRoom存在確認
  - Room未存在の場合は `404 Not Found`
  - Room状態が `standby` または `recording` でない場合は `400 Bad Request`

**Test:**
- [ ] Room作成後、Recording作成
  ```bash
  ROOM_ID=$(curl -X POST http://localhost:3000/api/rooms | jq -r '.room_id')
  RECORDING_ID=$(curl -X POST "http://localhost:3000/api/recordings?room_id=$ROOM_ID" | jq -r '.recording_id')
  ```
- [ ] チャンクが `./storage/rooms/{room_id}/{recording_id}/` に保存される
- [ ] Room情報取得時、recordingsに含まれる

**Deliverable:**
- Room対応Recording作成API

---

### Phase 4.3: Guest Mode実装

**Goal:** ゲスト用の録画画面を実装（Remote ModeベースでRoom対応）

**URL Structure:**
```
/guest/{room_id}
```

**Project Structure:**
```text
/packages/web-client/src
└── /modes
    ├── /standalone
    ├── /remote
    └── /guest          # Phase 4で追加
        ├── GuestRecorder.tsx
        ├── RoomConnection.ts
        └── ...
```

**Tasks:**
- [ ] `/guest/:room_id` ルーティング追加
- [ ] `GuestRecorder.tsx` コンポーネント実装
  - URLからroom_idを取得
  - Room存在確認（`GET /api/rooms/:room_id`）
  - Recording作成時にroom_idを指定
  - Remote Modeのロジックを再利用
- [ ] `RoomConnection.ts` 実装
  - Room WebSocket接続（`/ws/rooms/:room_id`）
  - Room状態変更の受信
  - Director指示（REC開始/停止）の受信

**UI:**
- [ ] Remote Modeと同様の録画UI
- [ ] Room IDと録画状態表示
- [ ] 「Waiting for director...」待機画面
- [ ] Director指示によるREC開始/停止（手動操作不可）

**Test:**
- [ ] DirectorがRoomを作成
- [ ] Guest URLにアクセス
- [ ] 待機画面が表示される
- [ ] Directorが録画開始を指示（Phase 4.4で実装）
- [ ] ゲスト側で自動的に録画開始

**Deliverable:**
- Guest Mode画面
- Room連携機能

---

### Phase 4.4: Director画面実装

**Goal:** 管理者用のダッシュボードを実装し、Room作成・一括制御を可能にする

**URL Structure:**
```
/director
```

**Project Structure:**
```text
/packages/web-client/src
└── /modes
    └── /director       # Phase 4で追加
        ├── DirectorDashboard.tsx
        ├── RoomManager.ts
        ├── RoomControls.tsx
        └── ...
```

**Tasks:**
- [ ] `/director` ルーティング追加
- [ ] `DirectorDashboard.tsx` コンポーネント実装
  - Room一覧表示
  - 新規Room作成ボタン
  - Room詳細ビュー
- [ ] `RoomControls.tsx` コンポーネント実装
  - Guest URL表示・コピー機能
  - 「Start Recording」ボタン
  - 「Stop Recording」ボタン
  - 接続中のゲスト一覧
  - 各ゲストの録画状態表示
- [ ] `RoomManager.ts` 実装
  - Room作成（`POST /api/rooms`）
  - Room状態更新（`PATCH /api/rooms/:id/state`）
  - Room WebSocket接続

**UI:**
- [ ] Room一覧画面
  - アクティブなRoom一覧
  - 各Roomの状態表示
- [ ] Room詳細画面
  - Guest URL表示（コピーボタン付き）
  - 接続中のゲスト一覧
    - Guest A: 🟢 Recording (15/20 chunks)
    - Guest B: 🟢 Recording (12/20 chunks)
    - Guest C: 🔴 Disconnected
  - 一括制御ボタン
    - 「Start Recording All」
    - 「Stop Recording All」
  - 全ゲストの同期状態表示

**Test:**
- [ ] Director画面にアクセス
- [ ] 新規Room作成
- [ ] Guest URLが表示される
- [ ] Guest URLをコピーして別タブで開く
- [ ] ゲストが接続される（Director画面に表示）
- [ ] 「Start Recording All」クリック
- [ ] 全ゲストで録画開始
- [ ] 「Stop Recording All」クリック
- [ ] 全ゲストで録画停止・同期完了

**Deliverable:**
- Director画面
- Room一括制御機能

---

### Phase 4.5: Room WebSocket実装

**Goal:** Room単位でのWebSocket通信を実装し、リアルタイム状態同期

**Note:** Phase 2のRemote Modeでは単一クライアントのため、WebSocketは不要でした（HTTP APIのみで十分）。Phase 4では複数クライアント（Director + Guests）間のリアルタイム通信が必要なため、ここで初めてWebSocketを導入します。

**Tasks:**
- [ ] `/ws/rooms/:room_id` WebSocketエンドポイント実装
- [ ] Room内の全接続クライアントを管理
  - Director接続
  - Guest接続（複数）
- [ ] Room状態変更のブロードキャスト
  - `RoomStateChanged { room_id, state }`
  - `RecordingCreated { room_id, recording_id, guest_name }`
  - `RecordingStateChanged { room_id, recording_id, state }`
  - `ChunkUploaded { room_id, recording_id, chunk_id }`
- [ ] Director指示のブロードキャスト
  - `DirectorCommand { command: 'start' | 'stop' }`
  - Room内の全Guestに送信

**Test:**
- [ ] DirectorとGuest（複数）が同じRoomに接続
- [ ] Directorが「Start」指示 → 全Guestに通知が届く
- [ ] Guest録画開始 → Directorに状態変更通知が届く
- [ ] Guestチャンクアップロード → Directorにリアルタイム進捗表示

**Deliverable:**
- Room単位のWebSocket通信
- リアルタイム状態同期

---

### Phase 4.6: Stop & Flush Protocol

**Goal:** 録画停止時、全ゲストのアップロード完了を待機する仕組み

**Tasks:**
- [ ] Director「Stop」指示時の処理
  1. Room状態を `finalizing` に更新
  2. 全GuestにStop指示をブロードキャスト
  3. 各Guestが録画停止
  4. 未送信チャンクのアップロード完了を待機
  5. 各RecordingがSynced状態になるのを監視
  6. 全Recording Synced確認後、Room状態を `synced` に更新
- [ ] Guest側の処理
  - Stop指示受信
  - 録画停止
  - 未送信チャンク完了待機
  - `synced`状態に更新
  - WebSocket接続維持（「ブラウザを閉じてOK」まで）
- [ ] Director側の表示
  - 「Waiting for all guests to sync...」
  - 各ゲストの同期状態表示
  - 全員Synced後「✓ All recordings synced」

**Test:**
- [ ] 複数ゲストで録画中
- [ ] Director「Stop」クリック
- [ ] 全ゲストで録画停止
- [ ] 各ゲストのアップロード完了を待機
- [ ] 全ゲストSynced確認
- [ ] Room状態が`synced`になる
- [ ] ゲスト画面に「ブラウザを閉じてOK」表示

**Deliverable:**
- Stop & Flushプロトコル
- 全ゲスト同期確認機能

---

### Phase 4.7: Director画面ダウンロード機能

**Goal:** Director画面から各Recording（Guest）のMP4を個別にダウンロード

**Concept:**
- Phase 2A-7で実装したダウンロードエンドポイントを活用
- Director画面で各Guestの録画を個別にダウンロード可能
- オプション：全Recording一括ダウンロード（ZIP形式）

**Tasks:**

**Director画面UI:**
- [ ] Room詳細画面に各RecordingのMP4ダウンロードボタンを追加
  ```
  Room: room-abc123
  Status: ✓ Synced

  Recordings:
  ┌─────────────────────────────────────────┐
  │ Guest A (recording-001)                 │
  │ Duration: 15:32                         │
  │ Size: 1.2 GB                            │
  │ [Download MP4]                          │ ← 新規追加
  ├─────────────────────────────────────────┤
  │ Guest B (recording-002)                 │
  │ Duration: 15:30                         │
  │ Size: 1.1 GB                            │
  │ [Download MP4]                          │
  ├─────────────────────────────────────────┤
  │ Guest C (recording-003)                 │
  │ Duration: 15:35                         │
  │ Size: 1.3 GB                            │
  │ [Download MP4]                          │
  └─────────────────────────────────────────┘

  [Download All as ZIP] ← オプショナル
  ```

- [ ] ダウンロードボタンクリック時の処理
  - `GET /api/recordings/{recording_id}/download` を呼び出し
  - ファイル名を `{room_id}_{guest_name}_{timestamp}.mp4` に設定
  - 自動ダウンロード開始

- [ ] ダウンロード進捗表示
  - 各Recordingのダウンロード状態を表示
  - 複数ダウンロード時のキュー管理

**サーバー側（オプショナル）:**
- [ ] `GET /api/rooms/:room_id/download-all` エンドポイント（オプショナル）
  - Room内の全Recordingを取得
  - 各RecordingをMP4に結合
  - ZIP形式で圧縮
  - ZIP全体をストリーム配信
  - ファイル名: `room-{room_id}.zip`

**Test:**
- [ ] Director画面でRoom作成→複数Guest録画→全員Synced
- [ ] Guest AのMP4ダウンロード
  - ファイル名: `room-abc123_guest-a_20260122-143052.mp4`
  - VLCで再生できる
- [ ] Guest BのMP4ダウンロード
  - 正常に再生できる
- [ ] 複数Recording同時ダウンロード
  - ブラウザが複数ファイルをダウンロード
- [ ] （オプショナル）「Download All as ZIP」
  - ZIP内に全GuestのMP4が含まれる
  - 各MP4が正常に再生できる

**UI改善:**
- [ ] Recording情報表示
  - Duration（録画時間）表示
  - File Size（ファイルサイズ）表示
  - Recording State（状態）表示
- [ ] ダウンロード状態インジケーター
  - 🔵 Download ready
  - 🟢 Downloading...
  - ✅ Downloaded

**Deliverable:**
- Director画面から各Recording MP4をダウンロード
- Guest別のファイル名でダウンロード
- （オプショナル）全Recording一括ZIPダウンロード

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

**Goal:** エンコード負荷監視と自動画質調整

### 5.1 Performance Monitor（WASM側）

**Tasks:**
- [ ] VideoEncoder queueサイズ監視
- [ ] CPU使用率推定（処理遅延から算出）
- [ ] 危険閾値検出

### 5.2 Adaptive Bitrate

**Tasks:**
- [ ] ビットレート動的変更API
- [ ] 解像度ダウンスケール
- [ ] UI警告表示（「負荷軽減のため画質を下げました」）

### 5.3 Audio Analysis

**Tasks:**
- [ ] RMS/Peak レベル取得
- [ ] 無音検出（トラブルシューティング用）
- [ ] リアルタイムメーター表示

**Deliverable:**
- 収録停止を防ぐ自動防衛機能

---

## Phase 6: UI/UX 改善 & ポリッシュ

**Goal:** プロダクションレディなUIを構築し、UXを洗練

**Note:** Phase 4でDirector/Guest画面の基本機能は実装済み。Phase 6ではさらなる改善とポリッシュを行う。

### 6.1 Director画面の改善

**Tasks:**
- [ ] Room一覧のフィルタリング・検索機能
- [ ] Room履歴管理（過去のRoom一覧）
- [ ] 収録統計ダッシュボード
  - Room別の録画時間
  - Guest別のファイルサイズ
  - Chunk数、アップロード速度
- [ ] エラーログビューア
- [ ] Guest招待リンクのQRコード生成

### 6.2 Guest画面の改善

**Tasks:**
- [ ] カメラ/マイク事前チェック画面
  - デバイス選択
  - プレビュー確認
  - 音声レベルメーター
- [ ] 接続状態インジケーターの改善
  - より詳細なステータス表示
  - 再接続時のアニメーション
- [ ] 「収録中」アニメーション
- [ ] Synced状態の明確な表示
  - 成功アニメーション
  - 「ブラウザを閉じてOK」の大きな表示

### 6.3 Download 機能

**Tasks:**
- [ ] サーバー側でChunkをストリーム結合
- [ ] `GET /api/recordings/:id/download` エンドポイント
- [ ] `GET /api/rooms/:id/download` エンドポイント（全Recording結合）
- [ ] Range Request対応（部分ダウンロード）
- [ ] ダウンロード進捗表示

### 6.4 全モード共通UI改善

**Tasks:**
- [ ] レスポンシブデザイン対応
- [ ] ダークモード完全対応（Tailwind CSS設定）
- [ ] アクセシビリティ改善（ARIA属性、キーボードナビゲーション）
- [ ] エラーメッセージの改善
- [ ] ローディングアニメーション統一

**Deliverable:**
- プロダクションレディなUI/UX
- 全モードで統一された操作体験

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
| Phase 2A-5 | **Remote Mode完成**<br>• `/remote` にアクセスすると Remote Mode画面が表示される<br>• 録画開始前にRecordingが作成される<br>• 録画中、チャンクがOPFSとサーバーに並行保存される<br>• 録画停止時、全チャンクのアップロード完了を待つ<br>• ネットワークエラー時も録画が継続される<br>• Standalone Mode (`/solo`) と独立して動作する |
| Phase 2A-6 | **ハッシュ検証・冪等性実装完成**<br>• Blake3ハッシュ検証が動作する<br>• 同じチャンクを再度アップロードしても正常に処理される（冪等性）<br>• ハッシュ改ざん時にエラーが返る |
| Phase 2A-7 | **ダウンロード機能完成**<br>• サーバー側でチャンクをストリーム結合できる<br>• `GET /api/recordings/:id/download` でMP4をダウンロードできる<br>• ダウンロードしたMP4が正常に再生できる<br>• **Phase 2完了：Remote Mode完全実装** |
| Phase 3 | ネットワーク切断・復旧シナリオで0バイトのデータ損失 |
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
- **Phase 2A-5:** **リアルタイムアップロード実装**。録画中の並行アップロード、最重要フェーズ
- **Phase 2A-6:** ハッシュ検証・冪等性。データ整合性の保証
- **Phase 2A-7:** ダウンロード機能。MP4ストリーム結合配信、Phase 2完了
- **Phase 3:** 堅牢性の核心。妥協しない
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
   - Phase 2A-5: **録画中のリアルタイムアップロード実装**（OPFS + サーバー並行保存）
   - Phase 2A-6: データ整合性を保証（Blake3ハッシュ検証・冪等性）
   - Phase 2A-7: ダウンロード機能実装（チャンク結合→MP4配信）
9. **Phase 2A-7 完了時点で、Recording作成→アップロード→ダウンロードの完全なフローが検証完了**
10. **Phase 3以降:**
    - Phase 3: 堅牢性機能（Manifest、Resume Upload、Delta Sync）
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
