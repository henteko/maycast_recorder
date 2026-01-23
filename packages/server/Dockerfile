# マルチステージビルド
FROM node:20-alpine AS base

WORKDIR /app

# 依存関係のインストール用ステージ
FROM base AS deps

# package.jsonをコピー（workspaces設定を含む）
COPY package.json package-lock.json ./
COPY packages/common-types/package.json ./packages/common-types/
COPY packages/server/package.json ./packages/server/

# 依存関係をインストール（ルートのnode_modulesに集約）
RUN npm ci

# ビルドステージ
FROM base AS builder

WORKDIR /app

# 依存関係をコピー（ルートのnode_modulesのみ）
COPY --from=deps /app/node_modules ./node_modules

# ソースコードをコピー
COPY package.json package-lock.json ./
COPY packages/common-types ./packages/common-types
COPY packages/server ./packages/server

# TypeScriptビルド
RUN npm run build --workspace=@maycast/common-types
RUN npm run build --workspace=@maycast/server

# 実行ステージ
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# 必要なファイルのみをコピー
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/common-types/dist ./packages/common-types/dist
COPY --from=builder /app/packages/common-types/package.json ./packages/common-types/
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/
COPY --from=builder /app/package.json ./

# ストレージディレクトリを作成
RUN mkdir -p /app/recordings-data && \
    chown -R node:node /app/recordings-data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "packages/server/dist/server.js"]
