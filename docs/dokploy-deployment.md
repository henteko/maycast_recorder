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
| `DOMAIN_NAME` | Primary domain for Traefik routing | `maycast.example.com` |
| `CORS_ORIGIN` | Allowed origins for CORS (comma-separated for multiple) | `https://maycast.example.com` |
| `TRAEFIK_HOST_RULE` | Custom Traefik Host rule (optional, for multiple domains) | See below |

#### Multiple Domains

To serve the app from multiple independent domains (e.g. `example.com` and `other-domain.com`):

1. Set `TRAEFIK_HOST_RULE` to match all domains:
   ```
   TRAEFIK_HOST_RULE=Host(`example.com`) || Host(`other-domain.com`)
   ```

2. Set `CORS_ORIGIN` with all origins (comma-separated):
   ```
   CORS_ORIGIN=https://example.com,https://other-domain.com
   ```

3. If using R2/S3 presigned URL downloads, add all origins to the R2 CORS `AllowedOrigins` array as well.

When `TRAEFIK_HOST_RULE` is set, it takes precedence over `DOMAIN_NAME`. If not set, it defaults to `Host(\`${DOMAIN_NAME}\`)` (single domain, same behavior as before).

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
    "AllowedMethods": ["GET", "HEAD", "PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Type", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

> **Note:** Set `AllowedOrigins` to your deployment domain(s). If serving from multiple domains, add all origins to the array (e.g. `["https://example.com", "https://other-domain.com"]`).

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

## Database Reset

When the database schema changes (e.g. new columns added to `init.sql`), you need to reset the PostgreSQL database. The `init.sql` script only runs automatically on first container startup when the data volume is empty.

### Steps

1. **SSH into the Dokploy server**

2. **Find the PostgreSQL container and volume names**

   ```bash
   docker ps | grep postgres
   docker volume ls | grep postgres
   ```

3. **Stop and remove the PostgreSQL container**

   ```bash
   docker stop <postgres-container-name>
   docker rm <postgres-container-name>
   ```

4. **Delete the data volume**

   ```bash
   docker volume rm <postgres-volume-name>
   ```

5. **Redeploy from Dokploy UI**

   Trigger a redeploy from the Dokploy dashboard. When the new PostgreSQL container starts with an empty volume, `init.sql` (mounted at `/docker-entrypoint-initdb.d/`) will be executed automatically, creating all tables with the latest schema.

> **Warning:** This will delete all existing data (rooms, recordings, etc.). Only do this when a schema migration is required and data loss is acceptable.
