# 📋 Maycast Recorder 開発計画

## Overview

本ドキュメントは、Maycast Recorderの段階的な開発計画を定義します。各フェーズは独立して動作可能な状態を目指し、段階的に機能を追加していきます。

---

## Phase 3: Resume Upload 機能 ✅ 完了

**Goal:** ブラウザ再起動後、未送信チャンクを自動検出して再アップロードする

### 完了サマリー (2026-01-27)

**実装済みコンポーネント:**

| コンポーネント | ファイル | 概要 |
|---|---|---|
| `remote-recording-mapping.ts` | `modes/remote/` | IndexedDB でローカル↔リモート Recording ID マッピングを永続化 |
| `resume-upload.ts` | `modes/remote/` | 未完了 Recording 検出ロジック（`detectUnfinishedRecordings()`） |
| `ResumeUploadManager.ts` | `modes/remote/` | バックグラウンド再アップロード管理、リアルタイム進捗追跡 |
| `ResumeUploadModal` | `components/organisms/RecoveryModal.tsx` | 複数 Recording 対応 UI、進捗バー表示 |
| `useSessionManager.ts` | `hooks/` | Resume Upload 状態管理、500ms ポーリング |

**主な機能:**
- ✅ ブラウザ再起動後の未送信チャンク自動検出
- ✅ IndexedDB でアップロード状態永続化
- ✅ OPFS からチャンクデータを読み込んで再アップロード
- ✅ リアルタイム進捗バー表示
- ✅ サーバー Recording 存在確認（404 時は明確なエラー表示）
- ✅ 完了後にローカル Recording 状態を `synced` に更新

**技術的な注意点:**
- サーバー側は `InMemoryRecordingRepository` を使用しているため、サーバー再起動時に Recording データが失われる（Phase 7 で DB 実装予定）
- Resume Upload 時にサーバー側 Recording が存在しない場合、ユーザーに手動削除を促すエラーメッセージを表示

---

## Phase 4: Room機能・Director Mode 実装 🎯

**Goal:** 複数のゲストRecordingをRoomで束ね、管理者が一括制御できる仕組みを構築

**Concept:**
- **Room**: 複数Recordingを束ねる収録セッション
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

### Phase 4.1: Room基礎インフラ

#### Phase 4.1.1: Room型定義と基礎インフラ

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
- [ ] Room状態遷移のバリデーションロジック

#### Phase 4.1.2: Roomリポジトリ実装（インメモリ）

**Tasks:**
- [ ] `IRoomRepository`インターフェース定義
- [ ] `InMemoryRoomRepository`実装
- [ ] DIコンテナに登録

#### Phase 4.1.3: Room作成API実装

**Tasks:**
- [ ] `CreateRoom.usecase.ts`実装
- [ ] `POST /api/rooms`エンドポイント実装
- [ ] RoomController作成

#### Phase 4.1.4: Room取得API実装

**Tasks:**
- [ ] `GetRoom.usecase.ts`実装
- [ ] `GET /api/rooms/:room_id`エンドポイント実装

#### Phase 4.1.5: Room状態更新API実装

**Tasks:**
- [ ] `UpdateRoomState.usecase.ts`実装
- [ ] `PATCH /api/rooms/:room_id/state`エンドポイント実装

#### Phase 4.1.6: Room内Recording一覧取得API実装

**Tasks:**
- [ ] `GET /api/rooms/:room_id/recordings`エンドポイント実装

#### Phase 4.1.7: Roomストレージディレクトリ構造実装

**Storage Structure:**
```text
/storage
└── /rooms
    └── /{room_id}/
        ├── /{recording_id_1}/  # Guest A
        │   ├── init.mp4
        │   └── chunk-*.fmp4
        └── /{recording_id_2}/  # Guest B
            └── ...
```

---

### Phase 4.2: Recording-Room紐付け

#### Phase 4.2.1: Recording型にRoom ID追加

**Tasks:**
- [ ] Recording型に`roomId?: RoomId`を追加
- [ ] RecordingRepositoryの`create()`にroomIdパラメータ追加

#### Phase 4.2.2: Recording作成時のRoom紐付け実装

**Tasks:**
- [ ] `CreateRecording.usecase.ts`を拡張（roomIdオプション）
- [ ] `POST /api/recordings?roomId=xxx`エンドポイント拡張

#### Phase 4.2.3: Room存在確認バリデーション

**Tasks:**
- [ ] 存在しないRoom IDでのRecording作成を防止
- [ ] エラーハンドリング実装

#### Phase 4.2.4: Room対応ストレージパス実装

**Tasks:**
- [ ] LocalFileSystemChunkRepositoryのストレージパス生成ロジック拡張

#### Phase 4.2.5: Room内Recording一覧取得の完全実装

**Tasks:**
- [ ] `GET /api/rooms/:room_id/recordings`の完全実装

---

### Phase 4.3: Guest Mode実装

#### Phase 4.3.1: Guest Modeルーティング準備

**Tasks:**
- [ ] `/guest/:room_id`ルーティング追加
- [ ] ディレクトリ構造作成 (`modes/guest/`)
- [ ] 基本的なGuestRecorderコンポーネント作成

#### Phase 4.3.2: Room存在確認とメタデータ取得

**Tasks:**
- [ ] `useRoomMetadata`カスタムフック実装
- [ ] Room未存在時のエラー画面

#### Phase 4.3.3: GuestStorageStrategy実装

**Tasks:**
- [ ] RemoteStorageStrategyを継承したGuestStorageStrategy
- [ ] Recording作成時に自動的にroomIdを指定

#### Phase 4.3.4: 待機画面UI実装

**Tasks:**
- [ ] Room情報表示、カメラプレビュー
- [ ] Room状態に応じたUI切り替え

#### Phase 4.3.5: Recorder統合（Remote Modeロジック再利用）

**Tasks:**
- [ ] GuestRecorderにRecorderコンポーネント統合
- [ ] 録画制御をDisabled（Director指示のみで制御）

#### Phase 4.3.6: 録画完了後のUI

**Tasks:**
- [ ] 「Recording Complete!」画面実装

---

### Phase 4.4: Director Mode実装

#### Phase 4.4.1: Directorルーティングと基本構造

**Tasks:**
- [ ] `/director`ルーティング追加
- [ ] ディレクトリ構造作成 (`modes/director/`)

#### Phase 4.4.2: Room作成機能実装

**Tasks:**
- [ ] `useRoomManager`カスタムフック実装
- [ ] 「Create New Room」ボタン実装

#### Phase 4.4.3: Room一覧表示

**Tasks:**
- [ ] `GET /api/rooms`エンドポイント実装
- [ ] RoomListコンポーネント実装

#### Phase 4.4.4: Room詳細画面とGuest URL表示

**Tasks:**
- [ ] RoomDetailコンポーネント実装
- [ ] Guest URLコピー機能

#### Phase 4.4.5: Room制御ボタン実装（API呼び出し）

**Tasks:**
- [ ] Start/Stop Recordingボタン
- [ ] Room状態更新API呼び出し

#### Phase 4.4.6: ゲスト一覧表示（静的版）

**Tasks:**
- [ ] GuestListコンポーネント実装
- [ ] ポーリングで状態更新

#### Phase 4.4.7: Room削除機能

**Tasks:**
- [ ] `DELETE /api/rooms/:id`エンドポイント実装
- [ ] 削除確認ダイアログ

---

### Phase 4.5: WebSocket実装

#### Phase 4.5.1: WebSocket基礎インフラ（サーバー側）

**Tasks:**
- [ ] `ws`パッケージ追加
- [ ] WebSocketサーバー初期化
- [ ] ConnectionManager実装

#### Phase 4.5.2: Room WebSocketエンドポイント実装

**Tasks:**
- [ ] `/ws/rooms/:room_id`エンドポイント
- [ ] Room別接続管理

#### Phase 4.5.3: メッセージ型定義とプロトコル設計

**Tasks:**
- [ ] WebSocketメッセージ型定義（`@maycast/common-types`）
- [ ] メッセージ送受信ヘルパー実装

#### Phase 4.5.4: Director指示のブロードキャスト実装

**Tasks:**
- [ ] Directorからのコマンド受信処理
- [ ] Room内全Guestへブロードキャスト

#### Phase 4.5.5: Guest側WebSocket接続実装

**Tasks:**
- [ ] `useRoomWebSocket`カスタムフック実装
- [ ] Director指示に応じた録画開始/停止

#### Phase 4.5.6: Director側WebSocket接続とリアルタイム更新

**Tasks:**
- [ ] ゲスト状態のリアルタイム表示
- [ ] ポーリングからWebSocketへ移行

#### Phase 4.5.7: チャンクアップロード通知

**Tasks:**
- [ ] Guest側でチャンクアップロード時に通知
- [ ] Director側で進捗バー更新

---

### Phase 4.6: 録画停止・同期フロー

#### Phase 4.6.1: Stop指示のブロードキャスト

**Tasks:**
- [ ] Director側「Stop Recording」ボタン
- [ ] 全Guestへブロードキャスト

#### Phase 4.6.2: Guest側録画停止とFlush処理

**Tasks:**
- [ ] Stop指示受信時の録画停止
- [ ] 未送信チャンクのアップロード完了待機

#### Phase 4.6.3: Director側同期状態監視

**Tasks:**
- [ ] 各Guestの同期状態をリアルタイム表示

#### Phase 4.6.4: Room状態の最終更新とUI

**Tasks:**
- [ ] 全Guest同期確認後のUI更新

#### Phase 4.6.5: Guest側「ブラウザを閉じてOK」表示

**Tasks:**
- [ ] 同期完了後の完了画面

---

### Phase 4.7: ダウンロード機能

#### Phase 4.7.1: 個別Recording MP4ダウンロード

**Tasks:**
- [ ] Director画面から各GuestのMP4を個別ダウンロード

#### Phase 4.7.2: Recording情報表示（Duration, Size）

**Tasks:**
- [ ] Recording詳細情報表示
- [ ] フォーマット関数実装

#### Phase 4.7.3: 一括ダウンロード機能

**Tasks:**
- [ ] 「Download All」ボタン実装
- [ ] ZIP圧縮してダウンロード

---

## Phase 5以降: 今後の計画

### Phase 5: UI/UX改善
- [ ] デバイス選択UI改善
- [ ] 録画品質設定
- [ ] エラーハンドリング強化

### Phase 6: 認証・セキュリティ
- [ ] Room認証（パスワード保護）
- [ ] Director認証
- [ ] Rate Limiting

### Phase 7: データベース実装
- [ ] InMemoryRepositoryをDB実装に置き換え
- [ ] Recording/Roomの永続化
- [ ] サーバー再起動時のデータ保持

### Phase 8: パフォーマンス最適化
- [ ] チャンクサイズ最適化
- [ ] アップロード並行数調整
- [ ] メモリ使用量削減
