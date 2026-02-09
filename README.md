# Maycast Recorder

WebCodecs-based video/audio recorder with OPFS storage and real-time server synchronization.

## 特徴

- **高品質録画**: WebCodecs APIを使用した効率的なビデオ/オーディオエンコーディング（4K対応）
- **デュアルストレージ**: OPFS（ローカル）+ サーバー同期によるデータ保護
- **リアルタイムアップロード**: 録画中に並行してチャンクをサーバーへアップロード（最大5並列）
- **ハッシュ検証**: Blake3ハッシュによる整合性チェックとデデュプリケーション
- **HTTP/2対応**: 効率的なマルチプレックス通信（15-25%の高速化）
- **オフライン対応**: ネットワーク障害時もローカル保存継続
- **リトライ機能**: アップロード失敗時の自動リトライ（最大3回）
- **Docker対応**: 開発環境も本番環境もDocker Composeで簡単にセットアップ
- **Director Mode**: Socket.IOによるリアルタイムRoom機能で複数ゲストの同時録画管理
- **Solo Mode**: サーバー不要のスタンドアロン録画（軽量専用ビルド対応）

## アーキテクチャ

### システム構成

```
┌─────────────────────────────────────┐
│  nginx (リバースプロキシ)           │
│  - HTTP/2対応                        │
│  - Let's Encrypt (本番)             │
│  - WebSocket (HMR)                   │
│  Port: 80, 443                       │
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

### プロジェクト構成

```
/maycast-recorder
├── docker-compose.yml          # Docker base configuration
├── docker-compose.dev.yml      # Development overrides
├── docker-compose.prod.yml     # Production overrides
├── Cargo.toml                  # Rust workspace root
├── Taskfile.yml                # Task automation
├── /packages
│   ├── /common-types           # 共有TypeScript型定義 (@maycast/common-types)
│   ├── /wasm-core              # Rust WASM Muxer (fMP4生成, muxide使用)
│   ├── /web-client             # React 19 + TypeScript 5.9 Frontend (Vite)
│   └── /server                 # Express Backend (@maycast/server)
├── /nginx                      # nginx設定
│   ├── Dockerfile
│   ├── nginx.conf
│   └── /conf.d
│       ├── development.conf
│       └── production.conf
├── /docs                       # プロジェクトドキュメント
│   ├── development-plan.md
│   ├── production-deployment.md
│   ├── standalone-mode.md
│   └── ...
└── /scripts                    # ユーティリティスクリプト
    ├── generate-dev-certs.sh
    └── init-letsencrypt.sh
```

## 技術スタック

### Frontend
- **React 19** + **TypeScript 5.9** + **Vite 7**
- **Tailwind CSS 4** - スタイリング
- **WebCodecs API** - ビデオ/オーディオエンコーディング（4K対応）
- **OPFS** - ローカルストレージ
- **IndexedDB** - アップロード状態管理
- **Socket.IO Client** - リアルタイム通信（Director Mode）
- **WASM** - fMP4 muxing (Rust)

### Backend
- **Express** + **TypeScript 5.9**
- **Socket.IO** - WebSocket通信（Room機能）
- **Blake3** - ハッシュ計算
- **CORS** - クロスオリジン対応
- **Morgan** - ログ管理

### Infrastructure
- **Docker Compose** - コンテナオーケストレーション
- **nginx** - リバースプロキシ、HTTP/2
- **Let's Encrypt** - SSL/TLS証明書（本番環境）

### WASM
- **Rust** + **wasm-bindgen**
- **muxide** + **mp4 crate** - fMP4生成

## クイックスタート（Docker Compose）

### 前提条件

- **Docker** 20.10+
- **Docker Compose** 2.0+
- **Task** (オプション、推奨) - [インストール](https://taskfile.dev/)

確認:
```bash
docker --version
docker compose version
```

### 開発環境のセットアップ

#### 1. リポジトリをクローン

```bash
git clone https://github.com/henteko/maycast_recorder.git
cd maycast_recorder
```

#### 2. 起動

```bash
# Taskfile経由（推奨）
task docker:dev:up

# または docker-compose直接
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

初回起動時は以下が自動で実行されます：
- Docker imageのビルド（WASM含む）
- 依存関係のインストール
- コンテナの起動

#### 3. アクセス

起動後、以下のURLにアクセスできます：

- **Web UI**: http://localhost
- **API**: http://localhost/api
- **Health Check**: http://localhost/health

#### 4. ログ確認

```bash
# すべてのサービスのログ
task docker:dev:logs

# 特定のサービス
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f web-client
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f server
```

#### 5. 停止

```bash
# 停止（データは保持）
task docker:dev:down

# 停止してデータも削除
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
```

## 使い方

### Solo Mode（スタンドアロン録画）

1. http://localhost にアクセス
2. Solo Modeを選択（または `task dev:solo` でSolo専用版を起動）
3. デバイスと画質を選択
4. 録画開始 → 停止
5. ダウンロードボタンでMP4を保存

**Solo専用ビルド**: サーバー不要の軽量版を生成
```bash
task build:solo
# dist-solo/ に出力される
```

### Director Mode（ルーム管理）

1. http://localhost にアクセス
2. Director Modeを選択
3. ルームを作成してゲストを招待
4. ゲストの映像をリアルタイムでモニタリング
5. 全ゲストの録画を一括開始/停止

### Guest Mode（ゲスト参加）

1. ディレクターから共有されたルームURLにアクセス
2. カメラ/マイクを許可
3. ディレクターの指示を待つ
4. 録画はディレクター側からコントロールされる

### Library（録画ライブラリ）

- 過去の録画を一覧表示
- ダウンロード/削除が可能

## 本番環境へのデプロイ

### 1. 環境変数の設定

`.env`ファイルを作成:

```bash
# ドメイン名（必須）
DOMAIN_NAME=your-domain.com

# Let's Encrypt用メールアドレス（必須）
EMAIL=admin@your-domain.com

# 環境設定
NODE_ENV=production
BUILD_TARGET=production

# CORS設定
CORS_ORIGIN=https://your-domain.com
VITE_SERVER_URL=https://your-domain.com
```

### 2. DNS設定

ドメインのAレコードをサーバーIPに設定:

```
A    your-domain.com    → 123.456.789.0
```

### 3. Let's Encrypt証明書の取得

```bash
chmod +x scripts/init-letsencrypt.sh
DOMAIN_NAME=your-domain.com EMAIL=admin@your-domain.com ./scripts/init-letsencrypt.sh
```

### 4. 本番環境で起動

```bash
# Taskfile経由
task docker:prod:up

# または docker-compose直接
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile production up -d
```

### 5. アクセス

- **Web UI**: https://your-domain.com
- **API**: https://your-domain.com/api
- **Health Check**: https://your-domain.com/health

### 6. 証明書の自動更新

Certbotコンテナが12時間ごとに更新をチェックします。手動更新:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot renew
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload
```

## Docker コマンド一覧

### 開発環境

```bash
# 起動
task docker:dev:up
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 停止
task docker:dev:down
docker compose -f docker-compose.yml -f docker-compose.dev.yml down

# ログ表示
task docker:dev:logs
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# ビルド（コード変更後）
task docker:dev:build
docker compose -f docker-compose.yml -f docker-compose.dev.yml build

# 再起動
task docker:dev:restart
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart

# 状態確認
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps
```

### 本番環境

```bash
# 起動
task docker:prod:up
docker compose -f docker-compose.yml -f docker-compose.prod.yml --profile production up -d

# 停止
task docker:prod:down
docker compose -f docker-compose.yml -f docker-compose.prod.yml down

# ログ表示
task docker:prod:logs
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f

# 証明書生成（初回のみ）
task docker:certs:prod
./scripts/init-letsencrypt.sh
```

### よく使う操作

```bash
# 特定のサービスのログ
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f server
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f web-client
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f nginx

# コンテナ内でシェル実行
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec server sh
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec web-client sh

# nginx設定テスト
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec nginx nginx -t

# nginxリロード
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec nginx nginx -s reload

# リソース使用状況
docker stats

# ボリューム一覧
docker volume ls | grep maycast

# 完全リセット（ボリュームも削除）
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
```

## トラブルシューティング

### ポートが使用中

```bash
# ポートを使用中のプロセス確認
lsof -i :80
lsof -i :443

# 既存のコンテナを停止
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

### nginx設定エラー

```bash
# 設定の文法チェック
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec nginx nginx -t

# 設定ファイルの確認
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec nginx cat /etc/nginx/conf.d/development.conf
```

### アップロードが完了しない

ブラウザのコンソールで以下を確認:

```
✅ [ChunkUploader] All chunks uploaded successfully
```

このメッセージが表示されない場合:
1. ネットワーク接続を確認
2. サーバーのログを確認: `task docker:dev:logs`
3. ブラウザのコンソールでエラーを確認

### コンテナが起動しない

```bash
# ログで原因を確認
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs

# キャッシュなしで再ビルド
docker compose -f docker-compose.yml -f docker-compose.dev.yml build --no-cache

# イメージを削除して再ビルド
docker compose -f docker-compose.yml -f docker-compose.dev.yml down --rmi all
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d
```

### ディスク容量不足

```bash
# 未使用のDockerリソースを削除
docker system prune -a

# ボリュームも含めて削除
docker system prune -a --volumes
```

## ローカル開発環境（高度な使い方）

Docker Composeを使わず、ローカルで直接開発したい場合：

### 前提条件

- [Rust](https://rustup.rs/) (latest stable)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)
- [Node.js](https://nodejs.org/) v20+
- [Task](https://taskfile.dev/)

確認:
```bash
task doctor
```

### セットアップ

```bash
# 依存関係のインストール
task deps:install

# 開発サーバー起動（WASM + Client + Server）
task dev
```

アクセス:
- Web UI: http://localhost:5173
- API: http://localhost:3000/api

### ローカルコマンド

```bash
# 開発
task dev              # すべて起動（WASM + Client）
task dev:client       # Clientのみ
task dev:server       # Serverのみ
task dev:wasm         # WASM watch mode
task dev:solo         # Solo Mode専用開発サーバー

# ビルド
task build            # すべてビルド
task build:wasm       # WASMのみ
task build:client     # Clientのみ
task build:solo       # Solo専用ビルド（dist-solo/に出力）
task build:server     # Serverのみ

# コード品質
task lint             # リント（すべて）
task lint:rust        # Rust clippy
task lint:ts          # TypeScript ESLint
task fmt              # フォーマット（すべて）
task fmt:rust         # Rust rustfmt
task fmt:ts           # TypeScript Prettier

# テスト
task test             # すべてのテスト
task test:rust        # Rustユニットテスト
task test:wasm        # WASMテスト

# ユーティリティ
task clean            # ビルド成果物削除
task check            # コンパイルチェック
```

## 本番環境のベストプラクティス

### セキュリティ

1. **環境変数管理**: `.env`ファイルを使用（`.gitignore`に追加済み）
2. **ファイアウォール**: 80, 443ポートのみ開放
3. **定期更新**: Docker imageを定期的に更新
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```
4. **ログ監視**: nginx/serverのログを定期確認
5. **バックアップ**: `recordings-data`ボリュームを定期的にバックアップ
   ```bash
   docker run --rm -v maycast_recorder_recordings-data:/data -v $(pwd):/backup alpine tar czf /backup/recordings-backup-$(date +%Y%m%d).tar.gz -C /data .
   ```

### パフォーマンス

1. **HTTP/2**: 有効化済み（15-25%の高速化）
2. **gzip圧縮**: 有効化済み（テキストファイルの圧縮）
3. **Keep-Alive**: HTTP接続の再利用（設定済み）
4. **並列アップロード**: 最大5並列（ChunkUploader設定）
5. **WASM最適化**: Release buildで最適化済み

### 監視

```bash
# リソース使用状況
docker stats

# ヘルスチェック
curl http://localhost/health
curl https://your-domain.com/health

# ログ監視（本番）
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f --tail=100

# ディスク使用量
docker system df
```

### スケーリング

必要に応じてサービスをスケールアウト可能:

```bash
# serverを3インスタンスに
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --scale server=3
```

## よくある質問

### Q: ローカル開発とDocker開発の違いは？

**Docker開発（推奨）**:
- ✅ 環境構築が簡単（Docker + Taskのみ）
- ✅ 本番環境と同じ構成で開発
- ✅ nginx、HTTP/2も含めて動作確認
- ❌ ビルドが少し遅い

**ローカル開発**:
- ✅ ビルドが高速
- ✅ 細かいデバッグがしやすい
- ❌ Rust、wasm-pack、Node.jsなど複数のツールが必要
- ❌ nginx、HTTP/2は別途セットアップが必要

### Q: 本番環境での推奨スペックは？

- **CPU**: 2コア以上
- **メモリ**: 4GB以上
- **ストレージ**: 20GB以上（録画データ用に追加容量）
- **ネットワーク**: 100Mbps以上（アップロード）

### Q: 複数ユーザーで使えますか？

**Director Mode**を使用することで、複数ゲストの同時録画が可能です。ディレクター（管理者）がルームを作成し、ゲストを招待して録画を一括管理できます。

### Q: データの保存期間は？

デフォルトでは無期限に保存されます。古いデータを削除するには：

```bash
# サーバー上のストレージを確認
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec server ls -lh /app/recordings-data

# 手動で削除（例: 30日以上前のデータ）
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec server find /app/recordings-data -type f -mtime +30 -delete
```

## ライセンス

Apache-2.0

## コントリビューション

Issues、Pull Requestsは歓迎します！

開発に参加する場合は、まずDocker開発環境をセットアップしてください：

```bash
git clone https://github.com/henteko/maycast_recorder.git
cd maycast_recorder
task docker:dev:up
```
