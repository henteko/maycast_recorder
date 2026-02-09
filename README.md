# Maycast Recorder

WebCodecs-based video/audio recorder with OPFS storage and real-time server synchronization.

## 特徴

- **高品質録画**: WebCodecs APIを使用した効率的なビデオ/オーディオエンコーディング（4K対応）
- **デュアルストレージ**: OPFS（ローカル）+ サーバー同期によるデータ保護
- **リアルタイムアップロード**: 録画中に並行してチャンクをサーバーへアップロード（最大5並列）
- **オフライン対応**: ネットワーク障害時もローカル保存継続
- **Director Mode**: Socket.IOによるリアルタイムRoom機能で複数ゲストの同時録画管理
- **Solo Mode**: サーバー不要のスタンドアロン録画（軽量専用ビルド対応）

## クイックスタート

### 前提条件

- [Docker](https://www.docker.com/) 20.10+
- [Task](https://taskfile.dev/)（推奨）

### セットアップ

```bash
git clone https://github.com/henteko/maycast_recorder.git
cd maycast_recorder
task docker:dev:up
```

起動後、http://localhost にアクセスしてください。

## 使い方

### Solo Mode（スタンドアロン録画）

1. http://localhost/solo にアクセス
2. デバイスと画質を選択
4. 録画開始 → 停止
5. ダウンロードボタンでMP4を保存

### Director Mode（ルーム管理）

1. http://localhost/director にアクセス
3. ルームを作成してゲストを招待
4. ゲストの映像をリアルタイムでモニタリング
5. 全ゲストの録画を一括開始/停止

### Guest Mode（ゲスト参加）

1. ディレクターから共有されたルームURLにアクセス
2. カメラ/マイクを許可
3. 録画はディレクター側からコントロールされる

## システム構成

```
┌─────────────────────────────────────┐
│  nginx (リバースプロキシ)           │
│  - HTTP/2                           │
│  - Let's Encrypt (本番)             │
│  Port: 80, 443                      │
└─────────────────────────────────────┘
            ↓          ↓
    ┌───────────┐  ┌──────────────┐
    │  server   │  │ web-client   │
    │  (Express)│  │ (Vite/React) │
    │  Port:3000│  │ Port:5173    │
    └───────────┘  └──────────────┘
         ↓              ↓
    [OPFS Storage] [WASM Muxer]
```

npm workspaces monorepo:

| パッケージ | 説明 |
|---|---|
| `packages/common-types` | 共有TypeScript型定義 |
| `packages/web-client` | React 19 + TypeScript 5.9 フロントエンド |
| `packages/server` | Express + Socket.IO バックエンド |
| `packages/wasm-core` | Rust WASM fMP4 Muxer |

## 開発

[Task](https://taskfile.dev/) でコマンドを管理しています。

```bash
# 開発サーバー起動（WASM ビルド + Client）
task dev

# 個別起動
task dev:client       # Client のみ
task dev:server       # Server のみ
task dev:solo         # Solo Mode 専用

# ビルド
task build            # すべてビルド
task build:wasm       # WASM のみ
task build:solo       # Solo 専用ビルド（dist-solo/ に出力）

# テスト・リント
task test             # すべてのテスト
task lint             # すべてのリント
task fmt              # フォーマット

# Docker
task docker:dev:up    # 開発環境起動
task docker:dev:down  # 開発環境停止
task docker:dev:logs      # ログ表示
task docker:dev:restart   # 再起動
```

## ライセンス

[Apache-2.0](LICENSE)
