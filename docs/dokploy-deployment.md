# Deploying to Dokploy

This guide explains how to deploy Maycast Recorder using [Dokploy](https://dokploy.com/) with Docker Compose.

## Architecture

```
Internet → Traefik (SSL termination) → nginx (HTTP reverse proxy, port 80)
                                          ├── web-client (port 5173)
                                          ├── server (port 3000)
                                          └── Socket.IO WebSocket
```

- **Traefik** (managed by Dokploy): Handles SSL/TLS termination and external routing
- **nginx**: Internal HTTP-only reverse proxy that routes requests to backend services
- **server**: Express.js API backend
- **web-client**: React production build served via Vite preview

## Prerequisites

- A Dokploy instance with a configured domain
- The repository accessible from Dokploy (GitHub, GitLab, etc.)

## Setup Steps

### 1. Create a Compose Project in Dokploy

1. In the Dokploy dashboard, create a new **Compose** project
2. Connect your Git repository
3. Set the **Compose Path** to:
   ```
   docker-compose.dokploy.yml
   ```

### 2. Configure Environment Variables

In the Dokploy UI, set the following environment variables:

#### General

| Variable | Description | Example |
|---|---|---|
| `DOMAIN_NAME` | Domain for Traefik routing (used in Traefik Host rule) | `maycast.example.com` |
| `CORS_ORIGIN` | Frontend URL (used by the server for CORS) | `https://maycast.example.com` |
| `VITE_SERVER_URL` | API server URL (used by the web client) | `https://maycast.example.com` |

> **Note:** `VITE_SERVER_URL` is a build-time variable. If you change it, you need to redeploy (rebuild) the web-client container.

#### Storage (Cloudflare R2)

Recording chunks are stored in Cloudflare R2. You need to create an R2 bucket and generate an API token beforehand.

| Variable | Description | Example |
|---|---|---|
| `S3_ENDPOINT` | R2 S3-compatible endpoint URL | `https://<account-id>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | Bucket name | `maycast-recordings` |
| `S3_ACCESS_KEY_ID` | R2 API token access key | - |
| `S3_SECRET_ACCESS_KEY` | R2 API token secret key | - |
| `S3_REGION` | Region (always `auto` for R2) | `auto` |

**R2 setup steps:**

1. Create an R2 bucket in the Cloudflare dashboard (e.g. `maycast-recordings`)
2. Create an R2 **API token** with read/write permissions for the bucket
3. Set the issued Access Key ID / Secret Access Key as environment variables in Dokploy
4. **Configure CORS on the R2 bucket** (see below)

```
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_BUCKET=maycast-recordings
S3_ACCESS_KEY_ID=<your-r2-access-key>
S3_SECRET_ACCESS_KEY=<your-r2-secret-key>
S3_REGION=auto
```

#### R2 CORS Configuration

The client downloads recording data directly from R2 using presigned URLs. Since the browser makes cross-origin requests from your app domain to the R2 endpoint, CORS must be configured on the R2 bucket.

**Steps to configure in Cloudflare Dashboard:**

1. Go to Cloudflare Dashboard → R2 → select your bucket
2. **Settings** tab → **CORS Policy** section → **Edit CORS policy**
3. Set the following JSON and save:

```json
[
  {
    "AllowedOrigins": ["https://maycast.example.com"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Type", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

> **Note:** Set `AllowedOrigins` to your deployment domain (same value as `CORS_ORIGIN`). To allow multiple origins (e.g. during development), add them to the array.

### 3. Configure Domain Routing

In Dokploy's domain settings, point your domain to the **nginx** service on port **80**. Dokploy's Traefik will handle SSL certificates automatically.

### 4. Deploy

Trigger a deployment from the Dokploy UI. The build process will:

1. Build the Rust WASM module (multi-architecture: amd64/arm64)
2. Install Node.js dependencies
3. Build common-types, then the web client (production target)
4. Build the Express server
5. Start all services

### 5. Verify

After deployment, check the health endpoint:

```
https://your-domain.com/health
```
