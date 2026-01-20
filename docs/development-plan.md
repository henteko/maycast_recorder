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
| Phase 2 | クライアント→サーバーへのアップロードが100%成功する |
| Phase 3 | ネットワーク切断・復旧シナリオで0バイトのデータ損失 |
| Phase 4 | 3人のゲストを同時制御し、全員が「Synced」状態に到達 |
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
- **Phase 2-3:** 堅牢性の核心。妥協しない
- **Phase 4:** Director Modeはプロダクトの差別化要因
- **Phase 5-6:** UXの洗練。ユーザーテストを繰り返す
- **Phase 7:** ビジネス要件に応じて調整

---

## Next Steps

1. **Phase 1A-1 から開始:** Cargo Workspace + Vite + WASM パイプライン構築
   - **Taskfile.yml のセットアップを最優先で実施**
   - 以降の全てのコマンドを `task` 経由で実行できるようにする
2. **各サブフェーズを順次完了:** 独立してテスト可能なため、確実に進める
3. **技術検証を早期に実施:**
   - Phase 1A-2: WebCodecs が期待通りに動作するか
   - Phase 1A-3: Rust で fMP4 が正しく生成できるか
   - Phase 1A-4: 統合時の同期問題がないか
4. **Phase 1A-6 完了時点で、fMP4チャンク生成の全体フローが検証完了**

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
