# 📋 Maycast Recorder 開発計画

## Overview

本ドキュメントは、Maycast Recorderの段階的な開発計画を定義します。各フェーズは独立して動作可能な状態を目指し、段階的に機能を追加していきます。

---

## Phase 1: スタンドアロンモード（Maycast Solo）完成 🎯

**Goal:** サーバーレスで動作する完全な録画・エクスポート・リカバリー機能を実装

**Concept:**
- サーバーを一切介さず、ブラウザ（WASM）とローカルストレージ（OPFS）だけで完結
- ログイン不要、完全オフライン動作対応
- クラッシュ耐性を持つ堅牢な録音エンジン

### 1.1 Cargo Workspace セットアップ

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
- [ ] web-client scaffolding（Vite + React/Svelte）

### 1.2 WebCodecs カメラキャプチャ実装

**Tasks:**
- [ ] `getUserMedia()` でカメラ/マイク取得
- [ ] VideoEncoder初期化（H.264, 1秒ごとKeyframe強制）
- [ ] AudioEncoder初期化（AAC）
- [ ] EncodedVideoChunk/AudioChunk取得パイプライン

### 1.3 Rust WASM Muxer 実装

**Dependencies:**
- `mp4` crate（fMP4生成）
- `wasm-bindgen`

**Tasks:**
- [ ] `init()`: fMP4ヘッダー（ftyp, moov）生成
- [ ] `push_video_chunk(data: &[u8], timestamp: u64)`: moof + mdat生成
- [ ] `push_audio_chunk(data: &[u8], timestamp: u64)`: 同上
- [ ] `get_fragment() -> Vec<u8>`: 完成したfMP4断片を返す

### 1.4 OPFS 保存機能

**Tasks:**
- [ ] OPFS APIラッパー実装（TypeScript）
- [ ] `writeChunk(sessionId, chunkId, data)` 実装
- [ ] `listChunks(sessionId)` 実装（復旧用）
- [ ] IndexedDBでメタデータ管理（chunk index, hash）

### 1.5 エクスポート機能（Client-side Concatenation）

**Goal:** サーバーなしで、OPFS内のチャンクを結合してダウンロード

**Dependencies:**
- `ReadableStream` API
- Rust WASM でのストリーム処理

**Tasks:**
- [ ] WASM側でチャンクを順次読み出すストリーム生成
- [ ] `ReadableStream` を使った段階的なダウンロード実装
- [ ] メモリ使用量最適化（大容量動画対応）
- [ ] ダウンロード進捗表示UI

### 1.6 クラッシュリカバリー機能

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

### 1.7 デバイス・画質設定機能

**Tasks:**
- [ ] カメラ/マイクデバイス列挙（`enumerateDevices()`）
- [ ] デバイス選択UI（ドロップダウン）
- [ ] 画質プリセット設定
  - Stability Mode（1秒キーフレーム、安定優先）
  - Quality Mode（高画質、ファイルサイズ大）
- [ ] 設定のローカルストレージ保存

### 1.8 UI/UX 完成版実装

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
- **完全なスタンドアロン録画アプリケーション**
  - ログイン不要でURL（例: `/solo`）にアクセス
  - 録画→fMP4化→OPFS保存→ダウンロード
  - クラッシュ復元機能搭載
  - プロダクションレディなUI

---

## Phase 2: サーバー側基盤構築

**Goal:** ローカルファイルシステムへのChunk Upload APIを実装

### 2.1 Axum サーバー構築

**Tasks:**
- [ ] server crateの作成
- [ ] Axum + Tokio セットアップ
- [ ] `/health` エンドポイント

### 2.2 Storage Layer 実装

**Dependencies:**
- `object_store` crate

**Tasks:**
- [ ] LocalFileSystem Storageドライバー実装
- [ ] `put_chunk(session_id, chunk_id, data)` API
- [ ] `get_chunk(session_id, chunk_id)` API
- [ ] `list_chunks(session_id)` API

### 2.3 Chunk Upload API

**Tasks:**
- [ ] `POST /api/sessions/:id/chunks/:chunk_id` エンドポイント
- [ ] Blake3ハッシュ検証
- [ ] 重複アップロード検出（冪等性）

### 2.4 WebSocket 基盤

**Tasks:**
- [ ] WebSocket接続管理
- [ ] Ping/Pong keep-alive
- [ ] 切断・再接続ハンドリング

**Deliverable:**
- クライアントからサーバーへのChunkアップロードが動作

---

## Phase 3: 堅牢性機能実装

**Goal:** 「失敗しない」ための4層防御を完成させる

### 3.1 Manifest & Verification

**Tasks:**
- [ ] common crateにManifest型定義
- [ ] クライアント側でChunkハッシュリスト生成
- [ ] サーバー側で受信Chunkとハッシュ照合
- [ ] 不足Chunkの検出とNACKプロトコル

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
- [ ] ブラウザ再起動後、OPFS内のセッション検出
- [ ] 「前回の収録を復元しますか？」UI
- [ ] 自動再アップロード

**Deliverable:**
- 電源断、ブラウザクラッシュ、回線切断に耐えるシステム

---

## Phase 4: Director Mode 実装

**Goal:** 管理者が複数のゲストを一括制御できる仕組みを構築

### 4.1 State Management

**States:**
- Standby
- Recording
- Finalizing
- Synced

**Tasks:**
- [ ] common crateにState enum定義
- [ ] サーバー側でセッション状態管理
- [ ] WebSocketでState変更を全クライアントにブロードキャスト

### 4.2 Director API

**Tasks:**
- [ ] `POST /api/sessions/:id/start` 全クライアントへREC開始指示
- [ ] `POST /api/sessions/:id/stop` Stop & Flushプロトコル起動
- [ ] 管理者ダッシュボードUI

### 4.3 Stop & Flush Protocol

**Tasks:**
- [ ] 停止指示後もWebSocket接続を維持
- [ ] 全クライアントのアップロード完了を監視
- [ ] Manifest検証完了後「Synced」状態へ遷移
- [ ] ゲスト側に「ブラウザを閉じてOK」表示

**Deliverable:**
- 管理者が複数ゲストを同時制御できるシステム

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

**Goal:** プロダクションレディなUIを構築

### 6.1 管理者ダッシュボード

**Tasks:**
- [ ] セッション一覧
- [ ] ゲスト接続状態リアルタイム表示
- [ ] 収録統計（録画時間、ファイルサイズ、Chunk数）
- [ ] エラーログビューア

### 6.2 ゲスト側 UI

**Tasks:**
- [ ] カメラ/マイクチェック画面
- [ ] 接続状態インジケーター
- [ ] 「収録中」アニメーション
- [ ] Synced状態の明確な表示

### 6.3 Download 機能

**Tasks:**
- [ ] サーバー側でChunkをストリーム結合
- [ ] `GET /api/sessions/:id/download` エンドポイント
- [ ] Range Request対応（部分ダウンロード）

**Deliverable:**
- ユーザーフレンドリーなインターフェース

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
- [ ] セッション所有権検証
- [ ] チーム/プロジェクト管理

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

---

## Success Metrics

| Phase | 成功指標 |
|-------|---------|
| Phase 1 | **スタンドアロンモード完成**<br>• 10分の録画が成功し、OPFSに正常なfMP4が保存される<br>• ダウンロード機能で完全な.mp4ファイルが取得できる<br>• ブラウザ強制終了後、リカバリーUIで復元できる<br>• 設定変更（デバイス、画質）が正常に機能する |
| Phase 2 | クライアント→サーバーへのアップロードが100%成功する |
| Phase 3 | ネットワーク切断・復旧シナリオで0バイトのデータ損失 |
| Phase 4 | 3人のゲストを同時制御し、全員が「Synced」状態に到達 |
| Phase 5 | 高負荷時でも収録停止が発生しない |
| Phase 6 | ユーザビリティテストで90%以上が「使いやすい」と評価 |
| Phase 7 | SaaS環境で24時間連続稼働、99.9% Uptime達成 |

---

## Timeline Guidance

各フェーズの期間は開発体制により変動しますが、以下を目安とします。

- **Phase 1:** 基盤構築の最重要フェーズ。十分な時間をかける
- **Phase 2-3:** 堅牢性の核心。妥協しない
- **Phase 4:** Director Modeはプロダクトの差別化要因
- **Phase 5-6:** UXの洗練。ユーザーテストを繰り返す
- **Phase 7:** ビジネス要件に応じて調整

---

## Next Steps

1. **Phase 1の詳細設計書作成**
2. **技術スパイク:** WebCodecs + WASM + OPFS の統合検証
3. **Repository初期化:** Cargo Workspace + Viteのセットアップ
