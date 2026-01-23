#!/bin/bash

# 開発環境用の自己署名証明書を生成するスクリプト

set -e

CERTS_DIR="./nginx/certs-dev"
DOMAIN="localhost"

echo "📜 Generating self-signed certificates for development..."

# ディレクトリが存在しない場合は作成
mkdir -p "$CERTS_DIR"

# 証明書が既に存在する場合はスキップ
if [ -f "$CERTS_DIR/server.crt" ] && [ -f "$CERTS_DIR/server.key" ]; then
    echo "✅ Certificates already exist. Skipping..."
    exit 0
fi

# 秘密鍵を生成
openssl genrsa -out "$CERTS_DIR/server.key" 2048

# 証明書署名要求(CSR)を生成
openssl req -new -key "$CERTS_DIR/server.key" -out "$CERTS_DIR/server.csr" \
    -subj "/C=JP/ST=Tokyo/L=Tokyo/O=Development/OU=Development/CN=$DOMAIN"

# 自己署名証明書を生成（有効期限365日）
openssl x509 -req -days 365 -in "$CERTS_DIR/server.csr" \
    -signkey "$CERTS_DIR/server.key" -out "$CERTS_DIR/server.crt"

# CSRファイルを削除
rm "$CERTS_DIR/server.csr"

echo "✅ Self-signed certificates generated successfully!"
echo "📂 Location: $CERTS_DIR"
echo ""
echo "⚠️  Note: Your browser will show a security warning because this is a self-signed certificate."
echo "    This is expected and safe for development environments."
