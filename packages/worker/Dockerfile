# マルチステージビルド
FROM node:20-alpine AS base

RUN apk add --no-cache ffmpeg

WORKDIR /app

# 依存関係のインストール用ステージ
FROM base AS deps

COPY package.json package-lock.json ./
COPY packages/common-types/package.json ./packages/common-types/
COPY packages/worker/package.json ./packages/worker/

RUN npm ci

# ビルドステージ
FROM base AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY package.json package-lock.json ./
COPY packages/common-types ./packages/common-types
COPY packages/worker ./packages/worker

RUN npm run build --workspace=@maycast/common-types
RUN npm run build --workspace=@maycast/worker

# 実行ステージ
FROM base AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/common-types/dist ./packages/common-types/dist
COPY --from=builder /app/packages/common-types/package.json ./packages/common-types/
COPY --from=builder /app/packages/worker/dist ./packages/worker/dist
COPY --from=builder /app/packages/worker/package.json ./packages/worker/
COPY --from=builder /app/package.json ./

RUN mkdir -p /tmp/maycast-worker && chown -R node:node /tmp/maycast-worker

USER node

CMD ["node", "packages/worker/dist/main.js"]
