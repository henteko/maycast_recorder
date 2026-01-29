# Maycast Recorder: Production Deployment Guide

## 1. 概要

本ドキュメントは、Maycast RecorderをAWS EC2にプロダクション環境としてデプロイする際の推奨構成を説明します。

**設計目標:**
- インスタンスのIPアドレスを完全に秘匿する
- DDoS攻撃からの保護
- 安全なSSH管理アクセス（ブラウザ経由）
- Security Groupのインバウンド設定不要
- WebSocket接続のサポート

**使用するプラン:**
- Cloudflare Pro ($20/月) - WebSocket無制限、アップロード500MB、強力なDDoS対策

---

## 2. 推奨アーキテクチャ

### Cloudflare Tunnel 構成

Cloudflare Tunnel（cloudflared）を使用することで、**インバウンドポートを一切開けずに**Webアプリを公開できます。

```
┌─────────────────────────────────────────────────────────┐
│                        AWS EC2                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Docker Compose                                  │   │
│  │  ┌───────────┐  ┌─────────┐  ┌─────────┐       │   │
│  │  │cloudflared│  │ client  │  │ server  │       │   │
│  │  │ (tunnel)  │  │  :5173  │  │  :3000  │       │   │
│  │  └───────────┘  └─────────┘  └─────────┘       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ※ インバウンドポート不要（アウトバウンドのみ）           │
└─────────────────────────────────────────────────────────┘
              │ (アウトバウンド接続)
              ↓
      Cloudflare Edge ←───── 一般ユーザー (HTTPS)


┌─────────────────────────────────────────────────────────┐
│  SSH管理: EC2 Instance Connect Endpoint                 │
│  ※ Security Groupでのインバウンド許可不要                │
└─────────────────────────────────────────────────────────┘
```

### 各コンポーネントの役割

| レイヤー | 技術 | 用途 | 備考 |
|---------|------|------|------|
| Tunnel | Cloudflare Tunnel (cloudflared) | Webアプリ公開 | アウトバウンドのみ |
| CDN/Proxy | Cloudflare | SSL終端、DDoS対策、キャッシュ | 自動 |
| SSH管理 | EC2 Instance Connect Endpoint | SSH、監視、デバッグ | インバウンド不要 |
| Container | Docker Compose | アプリケーション実行 | 内部のみ |
| Firewall | Security Group | インバウンドなし | 最小権限 |

### なぜCloudflare Tunnelか

- **インバウンドポート不要**: HTTP/HTTPS/SSHのインバウンドルールが不要
- **IP範囲の管理不要**: CloudflareのIP範囲をSecurity Groupに設定する必要がない
- **パブリックIP不要**: プライベートサブネットでも動作可能
- **IPアドレス完全秘匿**: 外部からインスタンスのIPを知る方法がない
- **シンプルな設定**: Security Groupはデフォルト（インバウンドなし）でOK

---

## 3. セットアップ手順

### 3.1 Cloudflare Tunnelの作成

#### Step 1: Cloudflareにドメインを追加

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 「Add a Site」でドメインを追加
3. **Pro**プランを選択（$20/月）
   - WebSocket接続が無制限
   - アップロードサイズ上限500MB
   - 強化されたDDoS対策
4. ネームサーバーをCloudflareに変更

#### Step 2: Tunnelの作成

1. Cloudflare Dashboard → Zero Trust → Networks → Tunnels
2. 「Create a tunnel」をクリック
3. 「Cloudflared」を選択
4. Tunnel名を入力（例: `maycast-production`）
5. 「Save tunnel」をクリック

#### Step 3: Tunnelトークンの取得

Tunnel作成後、インストールコマンドが表示されます。トークンを控えておきます:

```bash
# 表示されるコマンド例
cloudflared service install <YOUR_TUNNEL_TOKEN>
```

この `<YOUR_TUNNEL_TOKEN>` を後で使用します。

#### Step 4: Public Hostnameの設定

Tunnelの設定画面で「Public Hostname」を追加:

```
Subdomain: @ (または www など)
Domain: your-domain.com
Service Type: HTTP
URL: localhost:80
```

**追加設定（オプション）:**
- TLS → No TLS Verify: ON（オリジンがHTTPの場合）

---

### 3.2 EC2インスタンスの作成

#### Step 1: インスタンスの起動

1. AWS Consoleにログイン
2. EC2 → 「インスタンスを起動」
3. 以下を設定:
   - **AMI:** Ubuntu Server 24.04 LTS
   - **インスタンスタイプ:** t3.small以上を推奨
   - **キーペア:** 不要（EC2 Instance Connect Endpointを使用）
   - **ネットワーク設定:**
     - **VPC:** 既存のVPCまたは新規作成
     - **サブネット:** パブリックサブネット
     - **パブリックIP自動割り当て:** 有効（アウトバウンド接続に必要）
     - **セキュリティグループ:** 新規作成（デフォルトのまま）

**注意:** パブリックIPが割り当てられますが、Security Groupでインバウンドを全てブロックし、Cloudflare Tunnel経由でのみアクセスするため、IPアドレスが露出しても直接アクセスはできません。

#### Step 2: Security Groupの設定

**インバウンドルールは不要です。** デフォルトの空のままで問題ありません。

| 方向 | ルール |
|------|--------|
| インバウンド | なし |
| アウトバウンド | すべてのトラフィック（デフォルト） |

Cloudflare Tunnelはアウトバウンド接続のみを使用するため、インバウンドポートを開ける必要がありません。

#### Step 3: EC2 Instance Connect Endpointの作成

Security GroupでSSHポートを開けずにSSH接続するため、EC2 Instance Connect Endpoint（EIC Endpoint）を作成します。

1. VPC → エンドポイント → 「エンドポイントを作成」
2. 以下を設定:
   - **名前:** `eic-endpoint-maycast`
   - **サービスカテゴリ:** EC2 Instance Connect Endpoint
   - **VPC:** インスタンスと同じVPC
   - **セキュリティグループ:** デフォルト（またはアウトバウンドのみ許可）
   - **サブネット:** インスタンスと同じサブネット

#### Step 4: SSH接続（EC2 Instance Connect Endpoint経由）

1. EC2コンソールでインスタンスを選択
2. 「接続」ボタンをクリック
3. 「EC2 Instance Connect」タブを選択
4. 「EC2 Instance Connect Endpointを使用して接続」を選択
5. 「接続」をクリック

ブラウザ上でSSHセッションが開きます。Security GroupでSSHポートを開ける必要はありません。

---

### 3.3 アプリケーションのデプロイ

#### Step 1: 必要なツールのインストール

```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Docker Compose
sudo apt-get update
sudo apt-get install -y docker-compose-plugin

# Task (タスクランナー)
sh -c "$(curl --location https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin

# 一度ログアウトして再ログイン（dockerグループを反映）
exit
```

#### Step 2: リポジトリのクローン

```bash
git clone https://github.com/your-org/maycast_recorder.git
cd maycast_recorder
```

#### Step 3: 環境変数の設定

```bash
# サーバー用
cat > packages/server/.env << 'EOF'
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://your-domain.com
STORAGE_PATH=/app/recordings-data
EOF

# クライアント用
cat > packages/web-client/.env << 'EOF'
VITE_SERVER_URL=https://your-domain.com
EOF
```

#### Step 4: docker-compose.ymlにcloudflaredを追加

`docker-compose.yml` または `docker-compose.prod.yml` を編集して、cloudflaredサービスを追加:

```yaml
services:
  # 既存のサービス...

  cloudflared:
    image: cloudflare/cloudflared:latest
    restart: unless-stopped
    command: tunnel run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
    depends_on:
      - nginx
```

#### Step 5: Tunnelトークンの設定

```bash
# .envファイルにトークンを追加
echo "CLOUDFLARE_TUNNEL_TOKEN=<YOUR_TUNNEL_TOKEN>" >> .env
```

#### Step 6: デプロイ

```bash
# ビルドと起動
docker compose up -d --build

# ログ確認
docker compose logs -f

# cloudflaredの接続状態確認
docker compose logs cloudflared
```

#### Step 7: 動作確認

- `https://your-domain.com` でアプリにアクセスできる
- Cloudflare Dashboard → Zero Trust → Networks → Tunnels で接続状態が「HEALTHY」になっている

---

## 4. nginx設定（プロダクション用）

Cloudflare Tunnel経由の場合、nginxの設定はシンプルになります:

```nginx
# /etc/nginx/conf.d/default.conf

server {
    listen 80;
    server_name localhost;

    location / {
        proxy_pass http://web-client:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    location /api {
        proxy_pass http://server:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;

        # アップロード用の設定（Cloudflare Proは500MBまで）
        client_max_body_size 500M;
        proxy_request_buffering off;
    }
}
```

**ポイント:**
- `X-Forwarded-Proto: https` を設定（Cloudflareが常にHTTPSで受けるため）
- Cloudflare IPの検証は不要（Tunnel経由のため、外部から直接アクセスされることがない）

---

## 5. セキュリティチェックリスト

### デプロイ前

- [ ] Cloudflare Tunnelが作成されている
- [ ] Public Hostnameが正しく設定されている
- [ ] Security Groupにインバウンドルールがない
- [ ] EC2 Instance Connect Endpoint経由でSSH接続できる

### デプロイ後

- [ ] `https://your-domain.com` でアプリにアクセスできる
- [ ] Cloudflare Dashboard → Tunnels で「HEALTHY」と表示されている
- [ ] 直接インスタンスのIPにアクセスできない（パブリックIPがない場合は自動的に達成）
- [ ] `dig your-domain.com` でCloudflareのIPが返ってくる

### 定期確認

- [ ] Tunnelの接続状態が正常か
- [ ] ログに不審なアクセスがないか
- [ ] cloudflaredイメージが最新か

---

## 6. トラブルシューティング

### Tunnelが接続されない

```bash
# cloudflaredのログを確認
docker compose logs cloudflared

# よくある原因:
# - TUNNEL_TOKENが正しくない
# - パブリックIPが割り当てられていない（アウトバウンド接続に必要）
# - cloudflaredイメージが古い
```

### ブラウザSSHで接続できない

- EC2 Instance Connect Endpointが作成されているか確認
- エンドポイントのサブネットがインスタンスと同じか確認
- VPCエンドポイントの状態が「available」か確認
- インスタンスのセキュリティグループがエンドポイントからの接続を許可しているか確認

### アプリにアクセスできない

1. Tunnelの状態を確認:
   ```bash
   docker compose logs cloudflared
   ```
2. Cloudflare Dashboard → Zero Trust → Tunnels で接続状態を確認
3. Public Hostnameの設定が正しいか確認（Service: HTTP、URL: localhost:80）
4. nginxが正常に起動しているか確認:
   ```bash
   docker compose logs nginx
   ```

### アップロードが失敗する

Cloudflare Proプランでは500MBのボディサイズ制限があります。

**対策:**
- チャンクサイズを小さくする（現在の実装では1秒間隔のチャンク）
- Cloudflare Business（$200/月）にアップグレード（500MB以上）

---

## 7. コスト

| サービス | プラン | 月額費用（目安） |
|---------|-------|-----------------|
| EC2 | t3.small (東京) | 約$15〜20 |
| EBS | 30GB gp3 | 約$2.5 |
| EC2 Instance Connect Endpoint | - | 無料 |
| Cloudflare | Pro | $20 |
| ドメイン | .com等 | 約$12/年 |

**合計: 約$40/月〜**

**Cloudflare Proのメリット:**
- WebSocket接続が無制限（Freeは100秒制限）
- アップロードサイズ上限500MB（Freeは100MB）
- 強化されたDDoS対策
- より詳細なAnalytics

**コスト削減オプション:**
- リザーブドインスタンスやSavings Plansで割引可能

---

## 8. 将来の拡張

### スケールアウト時

Cloudflare Tunnelは複数インスタンスへのロードバランシングをサポート:

1. 各インスタンスで同じTunnelトークンを使用してcloudflaredを起動
2. Cloudflareが自動的にロードバランシング

または:
- Cloudflare Load Balancing（有料）でより細かい制御
- Application Load Balancer + Auto Scaling Group

### より高いセキュリティが必要な場合

- **Cloudflare Access:** Zero Trustアクセス制御（Pro以上で利用可能）
- **Cloudflare WAF:** Proプランでマネージドルールセットが利用可能
- **Cloudflare Business/Enterprise:** より高度なWAFルール、カスタムルール

### Cloudflare Access（認証付きアクセス）

管理画面など特定のパスに認証を追加:

1. Zero Trust → Access → Applications
2. 「Add an application」→ Self-hosted
3. 認証ポリシーを設定（メール、Google、GitHub等）

---

## 参考リンク

- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [cloudflared Docker Image](https://hub.docker.com/r/cloudflare/cloudflared)
- [AWS EC2 Instance Connect Endpoint](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/connect-using-eice.html)
