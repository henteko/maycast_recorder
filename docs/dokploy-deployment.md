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

| Variable | Description | Example |
|---|---|---|
| `DOMAIN_NAME` | Domain for Traefik routing (used in Traefik Host rule) | `maycast.example.com` |
| `CORS_ORIGIN` | Frontend URL (used by the server for CORS) | `https://maycast.example.com` |
| `VITE_SERVER_URL` | API server URL (used by the web client) | `https://maycast.example.com` |

> **Note:** `VITE_SERVER_URL` is a build-time variable. If you change it, you need to redeploy (rebuild) the web-client container.

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
