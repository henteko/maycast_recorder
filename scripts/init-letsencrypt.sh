#!/bin/bash

# Let's Encrypt証明書の初回取得スクリプト

set -e

if [ -z "$DOMAIN_NAME" ]; then
    echo "❌ Error: DOMAIN_NAME environment variable is required"
    echo "Usage: DOMAIN_NAME=example.com EMAIL=admin@example.com ./scripts/init-letsencrypt.sh"
    exit 1
fi

if [ -z "$EMAIL" ]; then
    echo "❌ Error: EMAIL environment variable is required"
    echo "Usage: DOMAIN_NAME=example.com EMAIL=admin@example.com ./scripts/init-letsencrypt.sh"
    exit 1
fi

CERTS_DIR="./nginx/certs"
DATA_PATH="$CERTS_DIR"
WEBROOT_PATH="./nginx/webroot"

echo "🔐 Initializing Let's Encrypt for domain: $DOMAIN_NAME"
echo "📧 Email: $EMAIL"
echo ""

# ディレクトリを作成
mkdir -p "$DATA_PATH"
mkdir -p "$WEBROOT_PATH"

# ダミー証明書の作成（初回起動用）
if [ ! -e "$DATA_PATH/live/$DOMAIN_NAME/fullchain.pem" ]; then
    echo "📜 Creating dummy certificate for $DOMAIN_NAME..."

    mkdir -p "$DATA_PATH/live/$DOMAIN_NAME"

    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
        -keyout "$DATA_PATH/live/$DOMAIN_NAME/privkey.pem" \
        -out "$DATA_PATH/live/$DOMAIN_NAME/fullchain.pem" \
        -subj "/CN=$DOMAIN_NAME"

    echo "✅ Dummy certificate created"
fi

# nginxを起動（HTTPのみ）
echo "🚀 Starting nginx..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d nginx

# 既存の証明書を削除
echo "🗑️  Removing dummy certificate..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx rm -rf "/etc/letsencrypt/live/$DOMAIN_NAME"

# Let's Encryptから証明書を取得
echo "📥 Requesting Let's Encrypt certificate for $DOMAIN_NAME..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN_NAME"

# nginxをリロード
echo "🔄 Reloading nginx..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml exec nginx nginx -s reload

echo ""
echo "✅ Let's Encrypt certificate successfully obtained!"
echo "🎉 Your domain $DOMAIN_NAME is now secured with HTTPS"
