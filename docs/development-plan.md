# 📋 Maycast Recorder 開発計画

## Overview

本ドキュメントは、Maycast Recorderの段階的な開発計画を定義します。各フェーズは独立して動作可能な状態を目指し、段階的に機能を追加していきます。

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
| Phase 2A-5-1 | **ストレージ戦略パターン導入完成**<br>• IStorageStrategyインターフェース定義<br>• StandaloneStorageStrategyに既存ロジック抽出<br>• Recorderコンポーネントに戦略注入<br>• `/solo` が以前と同じように動作する |
| Phase 2A-5-2 | **Remote Mode基盤完成**<br>• RecordingManager実装（createRecording, updateState等）<br>• サーバーURL設定UI（Settings画面統合）<br>• サーバー接続確認機能<br>• CORS設定完了 |
| Phase 2A-5-3 | **チャンクアップロード機能完成**<br>• ChunkUploaderクラス実装<br>• アップロードキュー管理（最大3並列）<br>• 自動リトライ機能（最大3回）<br>• IndexedDBに状態記録 |
| Phase 2A-5-4 | **Remote Mode完全統合・UI共通化完成**<br>• RemoteStorageStrategy実装<br>• `/remote` が `/solo` と同じUIを使用<br>• 録画中、チャンクがOPFSとサーバーに並行保存される<br>• 録画停止時、全チャンクのアップロード完了を待つ<br>• ネットワークエラー時も録画が継続される<br>• 両モードが独立して動作する |
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
- **Phase 2A-5:** **リアルタイムアップロード実装**。UI共通化とRemote Mode完全実装、最重要フェーズ
  - **Phase 2A-5-1:** ストレージ戦略パターン導入。既存コードのリファクタリング
  - **Phase 2A-5-2:** Recording管理通信層。サーバーURL設定とAPI通信
  - **Phase 2A-5-3:** チャンクアップロード機能。キュー管理・リトライ機能
  - **Phase 2A-5-4:** Remote Mode統合。UI完全共通化、並行アップロード実現
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
   - Phase 2A-5: **録画中のリアルタイムアップロード実装**（UI共通化 + OPFS + サーバー並行保存）
     - Phase 2A-5-1: ストレージ戦略パターン導入、既存コードリファクタリング
     - Phase 2A-5-2: RecordingManager・サーバーURL設定UI実装
     - Phase 2A-5-3: ChunkUploader実装（キュー管理・リトライ）
     - Phase 2A-5-4: RemoteStorageStrategy統合、UI完全共通化
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
