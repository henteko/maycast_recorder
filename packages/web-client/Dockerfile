# マルチステージビルド
FROM node:20-alpine AS base

WORKDIR /app

# 依存関係のインストール用ステージ
FROM base AS deps

# package.jsonをコピー（workspaces設定を含む）
COPY package.json package-lock.json ./
COPY packages/common-types/package.json ./packages/common-types/
COPY packages/web-client/package.json ./packages/web-client/

# 依存関係をインストール（ルートのnode_modulesに集約）
# ビルドにdevDependenciesが必要なため、NODE_ENVに関わらず全依存をインストール
RUN npm ci --include=dev

# Rustツールチェーンのインストール（WASM用）- nightly for edition2024 support
FROM rustlang/rust:nightly-alpine AS wasm-builder

RUN apk add --no-cache curl build-base

# wasm-packとwasm-bindgen-cliのプリビルドバイナリをダウンロード（マルチアーキテクチャ対応）
RUN ARCH=$(uname -m) && \
    if [ "$ARCH" = "aarch64" ]; then \
      WASM_PACK_TARGET="aarch64-unknown-linux-musl"; \
    elif [ "$ARCH" = "x86_64" ]; then \
      WASM_PACK_TARGET="x86_64-unknown-linux-musl"; \
    else \
      echo "Unsupported architecture: $ARCH" && exit 1; \
    fi && \
    curl -L "https://github.com/rustwasm/wasm-pack/releases/download/v0.13.0/wasm-pack-v0.13.0-${WASM_PACK_TARGET}.tar.gz" | tar -xz -C /tmp && \
    mv "/tmp/wasm-pack-v0.13.0-${WASM_PACK_TARGET}/wasm-pack" /usr/local/bin/ && \
    chmod +x /usr/local/bin/wasm-pack && \
    rm -rf /tmp/wasm-pack-* && \
    cargo install wasm-bindgen-cli --version 0.2.108

WORKDIR /app

# WASMのビルド
COPY Cargo.toml Cargo.lock* ./
COPY packages/wasm-core ./packages/wasm-core
RUN cd packages/wasm-core && wasm-pack build --target web --out-dir pkg

# ビルドステージ
FROM base AS builder

WORKDIR /app

# 依存関係をコピー（ルートのnode_modulesのみ）
COPY --from=deps /app/node_modules ./node_modules

# WASMビルド成果物をコピー
COPY --from=wasm-builder /app/packages/wasm-core/pkg ./packages/wasm-core/pkg

# ソースコードをコピー
COPY package.json package-lock.json ./
COPY packages/common-types ./packages/common-types
COPY packages/web-client ./packages/web-client

# common-typesをビルド
RUN npm run build --workspace=@maycast/common-types

# Viteビルド
RUN npm run build --workspace=web-client

# 開発環境用ステージ
FROM base AS development

WORKDIR /app

ENV NODE_ENV=development

# 依存関係をコピー（ルートのnode_modulesのみ）
COPY --from=deps /app/node_modules ./node_modules

# WASMビルド成果物をコピー
COPY --from=wasm-builder /app/packages/wasm-core/pkg ./packages/wasm-core/pkg

# ソースコードをコピー
COPY package.json package-lock.json ./
COPY packages/common-types ./packages/common-types
COPY packages/web-client ./packages/web-client

# common-typesをビルド
RUN npm run build --workspace=@maycast/common-types

# node_modulesの所有権を変更
RUN chown -R node:node /app

USER node

EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace=web-client", "--", "--host", "0.0.0.0"]

# 本番環境用ステージ
FROM base AS production

WORKDIR /app

ENV NODE_ENV=production

# ビルド成果物をコピー
COPY --from=builder /app/packages/web-client/dist ./packages/web-client/dist
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./

# viteのpreviewサーバーを使用
USER node

EXPOSE 5173

CMD ["npm", "run", "preview", "--workspace=web-client", "--", "--host", "0.0.0.0", "--port", "5173"]
