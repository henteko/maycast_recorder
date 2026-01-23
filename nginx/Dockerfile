FROM nginx:1.25-alpine

# HTTP/2サポートのためにnginxを最新版にする（既にサポート済み）
# SSL/TLS設定の最適化
RUN apk add --no-cache openssl

# カスタムnginx.confをコピー
COPY nginx.conf /etc/nginx/nginx.conf

# ヘルスチェック用のスクリプト
RUN echo '#!/bin/sh' > /healthcheck.sh && \
    echo 'wget --no-verbose --tries=1 --spider http://localhost/health || exit 1' >> /healthcheck.sh && \
    chmod +x /healthcheck.sh

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/healthcheck.sh"]

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
