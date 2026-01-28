# 🚀 Maycast Recorder: Production Deployment Guide

## 1. 概要

本ドキュメントは、Maycast RecorderをVPS（さくらVPS等）にプロダクション環境としてデプロイする際の推奨構成を説明します。

**設計目標:**
- VPSのIPアドレスを外部に秘匿する
- DDoS攻撃からの保護
- 安全なSSH管理アクセス
- 無料または低コストでの運用

---

## 2. 推奨アーキテクチャ

### Cloudflare + Tailscale 構成

```
┌─────────────────────────────────────────────────────────┐
│                      VPS (さくらVPS等)                   │
│  ┌─────────────────────────────────────────────────┐   │
│  │  Docker Compose                                  │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐         │   │
│  │  │  nginx  │  │ client  │  │ server  │         │   │
│  │  │ :80/443 │  │  :5173  │  │  :3000  │         │   │
│  │  └─────────┘  └─────────┘  └─────────┘         │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Tailscale Daemon (100.x.x.x)                          │
│  └── SSH/管理用アクセス専用                              │
└─────────────────────────────────────────────────────────┘
              ↑                              ↑
      Cloudflare Proxy                Tailscale VPN
     (HTTP/HTTPS公開)                (SSH/管理のみ)
              ↑                              ↑
         一般ユーザー                      管理者
```

### 各コンポーネントの役割

| レイヤー | 技術 | 用途 | アクセス元 |
|---------|------|------|-----------|
| CDN/Proxy | Cloudflare | Webアプリ公開、DDoS対策 | 一般ユーザー |
| VPN | Tailscale | SSH、監視、デバッグ | 管理者のみ |
| Container | Docker Compose | アプリケーション実行 | 内部のみ |
| Firewall | iptables/ufw | アクセス制御 | - |

---

## 3. セットアップ手順

### 3.1 ドメインとCloudflareの設定

#### Step 1: Cloudflareにドメインを追加

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 「Add a Site」でドメインを追加
3. 無料プラン（Free）を選択
4. ネームサーバーをCloudflareに変更

#### Step 2: DNSレコードの設定

```
Type: A
Name: @ (または subdomain)
Content: <VPSのIPアドレス>
Proxy status: Proxied (オレンジ色の雲アイコン)
TTL: Auto
```

**重要:** Proxy statusが「Proxied」になっていることを確認。「DNS only」だとIPが露出します。

#### Step 3: SSL/TLS設定

Cloudflare Dashboard → SSL/TLS:
- **暗号化モード:** Full (strict) を推奨
- **常にHTTPSを使用:** ON
- **自動HTTPS書き換え:** ON

#### Step 4: Cloudflare IPアドレス範囲の取得

Cloudflareは定期的にIP範囲を更新します。最新の情報:
- https://www.cloudflare.com/ips-v4
- https://www.cloudflare.com/ips-v6

```bash
# 現在のCloudflare IPv4範囲（例）
173.245.48.0/20
103.21.244.0/22
103.22.200.0/22
103.31.4.0/22
141.101.64.0/18
108.162.192.0/18
190.93.240.0/20
188.114.96.0/20
197.234.240.0/22
198.41.128.0/17
162.158.0.0/15
104.16.0.0/13
104.24.0.0/14
172.64.0.0/13
131.0.72.0/22
```

---

### 3.2 VPSの初期設定

#### Step 1: Tailscaleのインストール

```bash
# Tailscaleのインストール（Ubuntu/Debian）
curl -fsSL https://tailscale.com/install.sh | sh

# Tailscaleの起動と認証
sudo tailscale up

# 表示されるURLをブラウザで開いて認証
# 認証後、Tailscale IPが割り当てられる（例: 100.64.x.x）
```

#### Step 2: Tailscale IPの確認

```bash
tailscale ip -4
# 出力例: 100.64.123.45
```

このIPをメモしておく。以降、SSH接続はこのIPを使用。

#### Step 3: ファイアウォール設定（ufw）

```bash
# ufwのインストール（未インストールの場合）
sudo apt install ufw

# デフォルトポリシー: すべて拒否
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Tailscaleからの全アクセスを許可（管理用）
sudo ufw allow in on tailscale0

# CloudflareのIPからのみHTTP/HTTPSを許可
# IPv4
sudo ufw allow from 173.245.48.0/20 to any port 80,443 proto tcp
sudo ufw allow from 103.21.244.0/22 to any port 80,443 proto tcp
sudo ufw allow from 103.22.200.0/22 to any port 80,443 proto tcp
sudo ufw allow from 103.31.4.0/22 to any port 80,443 proto tcp
sudo ufw allow from 141.101.64.0/18 to any port 80,443 proto tcp
sudo ufw allow from 108.162.192.0/18 to any port 80,443 proto tcp
sudo ufw allow from 190.93.240.0/20 to any port 80,443 proto tcp
sudo ufw allow from 188.114.96.0/20 to any port 80,443 proto tcp
sudo ufw allow from 197.234.240.0/22 to any port 80,443 proto tcp
sudo ufw allow from 198.41.128.0/17 to any port 80,443 proto tcp
sudo ufw allow from 162.158.0.0/15 to any port 80,443 proto tcp
sudo ufw allow from 104.16.0.0/13 to any port 80,443 proto tcp
sudo ufw allow from 104.24.0.0/14 to any port 80,443 proto tcp
sudo ufw allow from 172.64.0.0/13 to any port 80,443 proto tcp
sudo ufw allow from 131.0.72.0/22 to any port 80,443 proto tcp

# ファイアウォールを有効化
sudo ufw enable

# 設定確認
sudo ufw status verbose
```

**重要:** SSHポート(22)はインターネットから完全にブロックされます。以降はTailscale経由でのみSSH可能。

#### Step 4: SSH設定の変更（オプション）

Tailscale経由でのみSSHするため、さらに安全にする:

```bash
# /etc/ssh/sshd_config を編集
sudo nano /etc/ssh/sshd_config

# 以下を追加/変更
ListenAddress 100.64.x.x  # TailscaleのIP
PasswordAuthentication no  # 鍵認証のみ

# SSH再起動
sudo systemctl restart sshd
```

---

### 3.3 アプリケーションのデプロイ

#### Step 1: リポジトリのクローン

```bash
# Tailscale経由でSSH接続
ssh user@100.64.x.x

# リポジトリをクローン
git clone https://github.com/your-org/maycast_recorder.git
cd maycast_recorder
```

#### Step 2: 環境変数の設定

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

#### Step 3: Docker Composeでデプロイ

```bash
# ビルドと起動
task docker:dev:up

# または直接docker-compose
docker-compose -f docker-compose.yml up -d --build

# ログ確認
docker-compose logs -f
```

#### Step 4: Cloudflare側のSSL証明書設定

Cloudflareの「Full (strict)」モードを使う場合、VPS側にもSSL証明書が必要です。

**オプションA: Cloudflare Origin Certificate（推奨）**

1. Cloudflare Dashboard → SSL/TLS → Origin Server
2. 「Create Certificate」をクリック
3. 証明書と秘密鍵をダウンロード
4. VPSのnginxに配置

```bash
# 証明書を配置
sudo mkdir -p /etc/ssl/cloudflare
sudo nano /etc/ssl/cloudflare/cert.pem  # 証明書を貼り付け
sudo nano /etc/ssl/cloudflare/key.pem   # 秘密鍵を貼り付け
sudo chmod 600 /etc/ssl/cloudflare/key.pem
```

**オプションB: Let's Encrypt（Cloudflareと組み合わせる場合は非推奨）**

Cloudflare Proxyが有効だとLet's EncryptのHTTP-01チャレンジが失敗するため、DNS-01チャレンジが必要になり設定が複雑になります。

---

## 4. nginx設定（プロダクション用）

Docker内のnginxを本番用に調整する場合の設定例:

```nginx
# /etc/nginx/conf.d/default.conf

# Cloudflare IPからのみ許可
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
real_ip_header CF-Connecting-IP;

server {
    listen 80;
    server_name your-domain.com;

    # Cloudflare以外からのアクセスを拒否
    if ($http_cf_connecting_ip = "") {
        return 403;
    }

    location / {
        proxy_pass http://web-client:5173;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $http_cf_connecting_ip;
        proxy_set_header X-Forwarded-For $http_cf_connecting_ip;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api {
        proxy_pass http://server:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $http_cf_connecting_ip;
        proxy_set_header X-Forwarded-For $http_cf_connecting_ip;
        proxy_set_header X-Forwarded-Proto $scheme;

        # アップロード用の設定
        client_max_body_size 100M;
        proxy_request_buffering off;
    }
}
```

---

## 5. セキュリティチェックリスト

### デプロイ前

- [ ] Cloudflareでドメインが「Proxied」になっている
- [ ] VPSファイアウォールでSSHポートがインターネットからブロックされている
- [ ] Tailscale経由でSSH接続できることを確認
- [ ] CloudflareのIP範囲からのみHTTP/HTTPSが許可されている

### デプロイ後

- [ ] `dig your-domain.com` でCloudflareのIPが返ってくる（VPSのIPではない）
- [ ] https://your-domain.com でアプリにアクセスできる
- [ ] 直接VPSのIPにアクセスしても接続できない
- [ ] Cloudflare Analyticsでトラフィックが確認できる

### 定期確認

- [ ] CloudflareのIP範囲が更新されていないか（月1回程度）
- [ ] Tailscaleの接続状態が正常か
- [ ] ログに不審なアクセスがないか

---

## 6. トラブルシューティング

### Tailscale経由でSSHできない

```bash
# VPS側でTailscaleの状態確認
sudo tailscale status

# 再認証が必要な場合
sudo tailscale up --reset
```

### Cloudflare経由でアクセスできない

1. DNSの伝播を確認（最大48時間かかることも）
   ```bash
   dig your-domain.com
   ```
2. Cloudflare Dashboard → Analytics → Traffic でリクエストが来ているか確認
3. VPS側でnginxのエラーログを確認
   ```bash
   docker-compose logs nginx
   ```

### アップロードが失敗する

Cloudflare無料プランでは100MBのボディサイズ制限があります。

**対策:**
- チャンクサイズを小さくする（現在の実装では1秒間隔のチャンク）
- Cloudflare Pro（有料）にアップグレード（500MB制限）

---

## 7. コスト

| サービス | プラン | 月額費用 |
|---------|-------|---------|
| さくらVPS | 1GB | ¥880〜 |
| Cloudflare | Free | ¥0 |
| Tailscale | Personal | ¥0 |
| ドメイン | .com等 | ¥1,500/年程度 |

**合計: 約¥1,000/月〜**

---

## 8. 将来の拡張

### スケールアウト時

複数VPSに拡張する場合:
- Cloudflare Load Balancing（有料）を使用
- またはCloudflare Argo Tunnel（Cloudflare Tunnel）に移行

### より高いセキュリティが必要な場合

- Cloudflare Access（Zero Trust）の導入
- WAFルールの追加（有料プラン）
- Bot対策の強化

---

## 参考リンク

- [Cloudflare IP Ranges](https://www.cloudflare.com/ips/)
- [Tailscale Documentation](https://tailscale.com/kb/)
- [Cloudflare SSL/TLS設定ガイド](https://developers.cloudflare.com/ssl/)
- [さくらVPS ファイアウォール設定](https://help.sakura.ad.jp/vps/)
