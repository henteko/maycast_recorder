# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Maycast Recorder** is a WebCodecs-based video/audio recorder with OPFS storage, PostgreSQL persistence, S3-compatible cloud storage, and real-time server synchronization. It's a monorepo project with Clean Architecture + DDD patterns, supporting multiple modes:

- **Solo Mode**: Browser-only standalone recording (no server required)
- **Director Mode**: Room-based multi-guest recording management via Socket.IO
- **Guest Mode**: Participate in director-controlled recording sessions

## Project Structure

This is a **npm workspaces monorepo** with 4 packages:

- **`packages/common-types`** - Shared TypeScript types, entities, domain errors, and WebSocket message definitions (`@maycast/common-types`)
- **`packages/web-client`** - React 19 + TypeScript 5.9 frontend (Vite 7)
- **`packages/server`** - Express + TypeScript 5.9 backend with Socket.IO, PostgreSQL, and S3 (`@maycast/server`)
- **`packages/wasm-core`** - Rust WASM module for fMP4 muxing (using muxide + mp4 crates)

## Common Commands

This project uses **Task** (Taskfile) for task automation. See `Taskfile.yml` for all available tasks.

### Development

```bash
# Quick start - builds WASM + common-types, then starts client
task dev

# Start only web client (assumes WASM already built)
task dev:client

# Start server in development mode
task dev:server

# Watch mode for WASM development
task dev:wasm

# Start Solo Mode only (standalone, no server needed)
task dev:solo
```

### Building

```bash
# Build everything (common-types → WASM → client → server)
task build

# Build individual packages
task build:common-types   # Compile TypeScript types
task build:wasm           # Build Rust WASM with wasm-pack
task build:client         # Build React app for production
task build:solo           # Build Solo-only client (outputs to dist-solo/)
task build:server         # Compile server TypeScript
```

### Testing

```bash
# Run all tests (Rust + WASM + server unit tests)
task test

# Run individual test suites
task test:rust      # Rust unit tests
task test:wasm      # WASM tests in headless Chrome
task test:server    # Vitest tests for server

# Integration tests (require Docker containers)
task test:db        # PostgreSQL integration tests (auto-starts/stops test container)
task test:db:run    # Run DB tests only (assumes test PostgreSQL already running)
task test:s3        # S3 integration tests via LocalStack (auto-starts/stops container)
task test:s3:run    # Run S3 tests only (assumes LocalStack already running)

# E2E tests (not yet implemented)
task test:e2e
```

**Test database setup**: `task test:db` uses `docker-compose.test.yml` to start a PostgreSQL container on port 5433 with credentials `maycast_test:maycast_test`. Server DB tests use `vitest.config.db.ts`; S3 tests use `vitest.config.s3.ts`.

### Code Quality

```bash
# Run all linters
task lint

# Lint individual languages
task lint:rust      # cargo clippy with -D warnings
task lint:ts        # ESLint for web-client
task lint:server    # ESLint for server

# Format code
task fmt            # Format all code (currently Rust only)
task fmt:rust       # cargo fmt
```

### Docker Development

```bash
# Start full stack with Docker Compose (recommended)
task docker:dev:up

# View logs
task docker:dev:logs

# Stop containers
task docker:dev:down

# Rebuild images after code changes
task docker:dev:build

# Restart containers
task docker:dev:restart

# Access PostgreSQL shell
task docker:db:psql

# Reset database (drop and recreate)
task docker:db:reset

# Remove all Docker containers, volumes, and images
task docker:clean
```

**Access points when running in Docker:**
- Web UI: http://localhost
- API: http://localhost/api
- Health Check: http://localhost/health

**Docker services** (defined in `docker-compose.yml`):
- **postgres** (PostgreSQL 16-alpine) - Database with health checks
- **localstack** - S3-compatible storage for development
- **nginx** - Reverse proxy with HTTP/2
- **server** - Express backend
- **web-client** - Vite dev server / static build

### Utilities

```bash
# Clean all build artifacts
task clean

# Check if everything compiles (without building)
task check

# Verify all required tools are installed
task doctor

# Install all dependencies (Rust + Node)
task deps:install

# Update all dependencies
task deps:update
```

## Architecture

### Clean Architecture with Distinct Layers

This codebase follows **Clean Architecture + Domain-Driven Design (DDD)**:

#### 1. Domain Layer (innermost)
- **Entities**: `RecordingEntity`, `ChunkEntity`, `RoomEntity` in `packages/common-types/src/entities/`
  - Contain business logic and enforce state transitions
  - Recording state machine: `standby → recording → finalizing → synced` (+ `interrupted` for crash recovery)
  - Room state machine: `idle → recording → finalizing → finished → idle` (reset capable)
- **Repository Interfaces**: `IRecordingRepository`, `IChunkRepository`, `IRoomRepository` in `packages/*/src/domain/repositories/`
- **Service Interfaces**: `IMediaStreamService`, `IUploadStrategy`, `IStorageStrategy`, `IPresignedUrlService`
- **Event Interfaces**: `IRoomEventPublisher` for WebSocket event broadcasting
- **Use Cases**: Business workflows in `packages/*/src/domain/usecases/`
  - **Recording (web-client)**: `StartRecording`, `SaveChunk`, `CompleteRecording`, `DownloadRecording`, `DeleteRecording`, `ListRecordings`
  - **Recording (server)**: `CreateRecording`, `GetRecording`, `UpdateRecordingState`, `UpdateRecordingMetadata`, `UploadInitSegment`, `UploadChunk`, `DownloadRecording`, `GetDownloadUrls`
  - **Room (server)**: `CreateRoom`, `GetRoom`, `UpdateRoomState`, `DeleteRoom`, `ValidateRoomAccess`
  - Each use case implements `execute(request): Promise<response>`
- **Domain Errors**: Custom exceptions in `packages/common-types/src/errors/DomainErrors.ts`
  - Recording: `RecordingNotFoundError`, `InvalidStateTransitionError`, `InvalidOperationError`
  - Chunk: `InvalidChunkError`, `ChunkNotFoundError`
  - Network: `NetworkError`, `UploadError`
  - Storage: `StorageFullError`, `StorageAccessError`
  - Room: `RoomNotFoundError`, `InvalidRoomStateTransitionError`, `RoomAccessDeniedError`

#### 2. Infrastructure Layer
- **Repository Implementations**:
  - Web-client: `IndexedDBRecordingRepository`, `OPFSChunkRepository`
  - Server: `PostgresRecordingRepository`, `PostgresRoomRepository`, `LocalFileSystemChunkRepository`, `S3ChunkRepository`
  - Server (fallback): `InMemoryRecordingRepository`, `InMemoryRoomRepository`
- **Database**: `PostgresClient` for connection pooling, schema in `packages/server/sql/init.sql`
- **Service Implementations**: `BrowserMediaStreamService`, `RemoteUploadStrategy`, `NoOpUploadStrategy`, `S3PresignedUrlService`, `NoOpPresignedUrlService`
- **API Clients**: `RecordingAPIClient` for HTTP, `RoomAPIClient` for Room endpoints
- **WebSocket**: `WebSocketRoomClient` (client-side Socket.IO), `WebSocketManager` (server-side), `WebSocketRoomEventPublisher`
- **Storage Config**: `storageConfig.ts` reads `STORAGE_BACKEND` env var to select local or S3
- **DI Container**: Custom dependency injection in `packages/*/src/infrastructure/di/`

#### 3. Presentation Layer (outermost)
- **Controllers** (server): `RecordingController`, `ChunkController`, `RoomController`
- **React Components** (web-client): Organized as Atomic Design (atoms/molecules/organisms/pages/templates)
  - **Pages**: `TopPage`, `SoloPage`, `DirectorPage`, `RoomDetailPage`, `GuestPage`, `LibraryPage`, `SettingsPage`
- **Custom Hooks**:
  - Core: `useRecorder`, `useMediaStream`, `useDownload`, `useDevices`, `useEncoders`
  - Room/Director: `useRoomDetail`, `useRoomWebSocket`
  - Guest: `useGuestMediaStatus`, `useGuestRecordingControl`
  - Session: `useSessionManager`, `useSystemHealth`
  - UI: `useToast`
- **API Routes**: Express routes in `packages/server/src/presentation/routes/`
- **WebSocket**: Socket.IO handlers in `packages/server/src/infrastructure/websocket/`

### Dependency Injection System

**Custom simple DI container** (not using InversifyJS):

- **Server-side**: Singleton pattern with `Map<string, unknown>` service registry
  - See `packages/server/src/infrastructure/di/DIContainer.ts` + `setupContainer.ts`
  - Storage backend selection (local vs S3) resolved at container setup time
  - PostgreSQL pool shared across repositories
- **Web-client**: React Context API for DI propagation
  - `DIProvider.tsx` wraps app, `useDI()` hook accesses dependencies
  - Mode-aware setup: `standalone` (Solo) vs `remote` (Director/Guest)

When adding new dependencies:
1. Register in `setupContainer.ts`
2. Inject via constructor in use cases
3. Access via `useDI()` in React components or `container.resolve()` in server

### Storage Architecture

#### Web Client Storage

**Two-tier storage strategy**:
1. **OPFS (Origin Private File System)**: Large binary chunk data
   - Path structure: `/{recordingId}/init-segment`, `/{recordingId}/chunks/{chunkId}`
   - Implemented in `OPFSChunkRepository`
2. **IndexedDB**: Metadata and upload state
   - Recording entities, chunk metadata, upload retry state, local→remote recording ID mappings
   - Implemented in `IndexedDBRecordingRepository`

**Storage Strategies** (Strategy Pattern):
- `RemoteStorageStrategy`: OPFS locally + concurrent server upload (Director mode)
- `StandaloneStorageStrategy`: OPFS only, no upload (Solo mode)
- `GuestStorageStrategy`: OPFS locally + concurrent server upload with local→remote recording ID mapping and roomId context (Guest mode)

#### Server Storage

**Dual-backend storage** (selected via `STORAGE_BACKEND` env var):

- **Local Filesystem** (`STORAGE_BACKEND=local`, default): Chunks in `./recordings-data/` (configurable via `STORAGE_PATH`)
  - Implemented in `LocalFileSystemChunkRepository`
- **S3-Compatible** (`STORAGE_BACKEND=s3`): Cloudflare R2, AWS S3, or LocalStack
  - Key structure: `{recordingId}/init.fmp4`, `{recordingId}/{chunkId}.fmp4`
  - Room recordings: `rooms/{roomId}/{recordingId}/init.fmp4`, `rooms/{roomId}/{recordingId}/{chunkId}.fmp4`
  - Implemented in `S3ChunkRepository`
  - `S3PresignedUrlService` generates presigned URLs for direct browser downloads

**Database** (PostgreSQL 16):
- Schema: `packages/server/sql/init.sql` (auto-applied via Docker entrypoint)
- Tables: `recordings`, `rooms`, `room_recordings`
- Enums: `recording_state` (standby, recording, finalizing, synced, interrupted), `room_state` (idle, recording, finalizing, finished)
- Auto-updating `updated_at` timestamps via triggers
- Indexes on `room_id`, `state` columns

### Recording & Chunking Flow

1. **Capture**: WebCodecs API encodes video/audio frames
2. **Chunk Generation**: Encoded chunks saved to OPFS + metadata to IndexedDB
3. **Upload (Remote Mode)**: `ChunkUploader` manages concurrent uploads
   - Max 5 simultaneous uploads
   - Blake3 hash verification
   - Retry logic (up to 3 attempts with exponential backoff)
   - Non-blocking (recording continues while uploading)
4. **State Management**: Recording state transitions enforced at entity level
5. **Download**: Direct download (local backend) or presigned URL redirect (S3 backend)

### Room / Director-Guest Flow

1. **Director** creates a Room via REST API → generates `roomId` + `accessKey`
2. **Guests** join via URL containing `roomId` → connect to Socket.IO room
3. **Director** starts recording → `DirectorCommand` sent to all guests via WebSocket
4. **Guests** auto-start local recording, upload chunks to server with `roomId` context
5. **Director** stops recording → Room transitions to `finalizing`
6. **Guests** finish uploading → report `GuestSyncComplete` via WebSocket
7. When all guests synced → Room transitions to `finished`
8. Room can be reset (`finished → idle`) for reuse

### WebSocket Events

Defined in `packages/common-types/src/websocket.ts`:

- `RoomCreated`, `RoomStateChanged` - Room lifecycle
- `RecordingCreated`, `RecordingStateChanged` - Recording lifecycle within rooms
- `ChunkUploaded`, `UploadProgress` - Upload tracking
- `DirectorCommand` - Director→Guest commands (`start` / `stop`)
- `GuestSyncStateChanged`, `GuestSyncComplete`, `GuestSyncError` - Guest sync tracking

### WASM Role

`packages/wasm-core` is a Rust-based fMP4 muxer:
- **Purpose**: Generate fragmented MP4 format for streaming
- **Build**: `wasm-pack build --target web --out-dir pkg`
- **Dependencies**: `muxide` + `mp4` crates for media processing, `blake3` for hashing
- **Key Files**: `lib.rs` (entry point), `muxide_muxer.rs` (muxer implementation)
- **Optimization**: Release build with `-O4`, LTO enabled, stripped symbols

## Key Implementation Details

### Recording State Machine

Enforced in `RecordingEntity`:
```
standby → recording → finalizing → synced
    ↓         ↓            ↓
         interrupted  (from any non-terminal state, for crash recovery)
```
Invalid transitions throw `InvalidStateTransitionError`.

### Room State Machine

Enforced in `RoomEntity`:
```
idle → recording → finalizing → finished → idle (reset)
```
- `idle`: Waiting, can add recordings
- `recording`: Active recording session
- `finalizing`: Waiting for all guests to complete upload
- `finished`: All guests synced, can reset to idle
- Access key validation via `validateAccessKey()`

### API Endpoints (Server)

**Recording Management:**
- `POST /api/recordings` - Create recording (optionally linked to a room)
- `GET /api/recordings/:id` - Get recording details
- `PATCH /api/recordings/:id/state` - Update state
- `PATCH /api/recordings/:id/metadata` - Update metadata
- `GET /api/recordings/:id/download` - Download complete recording (local backend)
- `GET /api/recordings/:id/download-urls` - Get presigned download URLs (S3 backend)

**Chunk Upload:**
- `POST /api/recordings/:id/init-segment` - Upload init segment (binary)
- `POST /api/recordings/:id/chunks?chunk_id=N` - Upload chunk with hash header

**Room Management:**
- `POST /api/rooms` - Create new room (no auth required)
- `GET /api/rooms/:id/status` - Get room status (no auth, for guest access)
- `GET /api/rooms/:id` - Get full room info (accessKey required)
- `PATCH /api/rooms/:id/state` - Update room state (accessKey required)
- `DELETE /api/rooms/:id` - Delete room (accessKey required)

### OPFS and Crash Recovery

**Solo Mode** supports crash-proof recording:
- OPFS persists chunks even if browser crashes
- On app restart, scans for incomplete sessions
- Recovery modal offers to restore and download
- Interrupted recordings marked with `interrupted` state

## Development Workflow

### When adding a new feature:

1. **Define types** in `packages/common-types` if shared between client/server
2. **Create use case** in `domain/usecases/` with business logic
3. **Implement repository/service** in `infrastructure/`
4. **Register dependencies** in `infrastructure/di/setupContainer.ts`
5. **Create controller/component** in `presentation/`
6. **Test** with `task test` or manually in browser

### When modifying WASM:

```bash
# Make changes in packages/wasm-core/src/
# Then rebuild
task build:wasm

# Or use watch mode during development
task dev:wasm
```

WASM must be built **before** running the web client, as it's imported as a module.

### When changing common types:

```bash
# After editing packages/common-types/src/*.ts
task build:common-types

# Then rebuild client and server
task build:client
task build:server
```

Both web-client and server depend on `@maycast/common-types`.

### When modifying the database schema:

1. Edit `packages/server/sql/init.sql`
2. Reset the Docker database: `task docker:db:reset`
3. Run integration tests: `task test:db`

### When switching storage backends:

Set `STORAGE_BACKEND` env var to `local` or `s3`. For S3, also set: `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION`, `S3_FORCE_PATH_STYLE`.

## Important Files to Understand

When getting started, read these files in order:

1. **`packages/common-types/src/entities/Recording.entity.ts`** - Core business rules and recording state machine
2. **`packages/common-types/src/entities/Room.entity.ts`** - Room state machine and access control
3. **`packages/common-types/src/websocket.ts`** - WebSocket event type definitions
4. **`packages/common-types/src/room.ts`** - Room, GuestInfo, GuestSyncState types
5. **`packages/web-client/src/infrastructure/di/setupContainer.ts`** - Client dependency wiring (mode-aware)
6. **`packages/web-client/src/presentation/hooks/useRecorder.ts`** - Full recording lifecycle
7. **`packages/web-client/src/presentation/hooks/useEncoders.ts`** - WebCodecs encoder management (4K support)
8. **`packages/web-client/src/presentation/hooks/useRoomDetail.ts`** - Director room management with WebSocket
9. **`packages/web-client/src/presentation/hooks/useGuestRecordingControl.ts`** - Guest auto-control based on room state
10. **`packages/server/src/infrastructure/di/setupContainer.ts`** - Server dependency setup (DB + storage backend selection)
11. **`packages/server/src/infrastructure/config/storageConfig.ts`** - Storage backend configuration
12. **`packages/server/sql/init.sql`** - Database schema

## Testing

- **Server unit tests**: Vitest in `packages/server/src/**/*.test.ts`
- **DB integration tests**: `packages/server/` with `vitest.config.db.ts` (requires test PostgreSQL on port 5433)
- **S3 integration tests**: `packages/server/` with `vitest.config.s3.ts` (requires LocalStack on port 4577)
- **Rust tests**: Standard Rust unit tests in `packages/wasm-core/src/`
- **WASM tests**: `wasm-bindgen-test` in headless Chrome
- **E2E tests**: Not yet implemented (planned for Phase 1A-6+)

## Environment Variables

### Root `.env` (Docker Compose)

See `.env.example` for full reference. Key variables:

```bash
# General
NODE_ENV=development
CORS_ORIGIN=http://localhost
VITE_SERVER_URL=http://localhost

# PostgreSQL
POSTGRES_USER=maycast
POSTGRES_PASSWORD=maycast_dev
POSTGRES_DB=maycast

# Storage backend ('local' or 's3')
STORAGE_BACKEND=s3

# Local storage (when STORAGE_BACKEND=local)
STORAGE_PATH=/app/recordings-data

# S3 storage (when STORAGE_BACKEND=s3)
S3_ENDPOINT=http://localstack:4566
S3_PUBLIC_ENDPOINT=http://localhost/s3    # Browser-accessible URL for presigned URLs
S3_BUCKET=maycast-recordings
S3_ACCESS_KEY_ID=test
S3_SECRET_ACCESS_KEY=test
S3_REGION=us-east-1
S3_FORCE_PATH_STYLE=true
```

### Web Client (Vite)

Create `packages/web-client/.env`:
```
VITE_SERVER_URL=http://localhost:3000
```

### Server

Create `packages/server/.env`:
```
NODE_ENV=development
PORT=3000
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://maycast:maycast_dev@localhost:5432/maycast
STORAGE_BACKEND=local
STORAGE_PATH=./recordings-data
```

## Docker vs Local Development

**Docker (Recommended)**:
- Full stack with nginx, PostgreSQL, LocalStack (S3), HTTP/2
- Matches production environment
- No local tool installation needed (except Docker + Task)
- DB schema auto-applied via init script

**Local**:
- Faster builds and iteration
- Better for debugging
- Requires: Rust, wasm-pack, Node.js 20+, Task, PostgreSQL
- Check requirements: `task doctor`

## Architecture Decisions to Respect

1. **Repository Pattern**: Never access storage directly; always go through repository interfaces
2. **Use Case Pattern**: Business logic belongs in use cases, not in controllers or components
3. **Entity State Management**: State transitions must be validated by entity methods
4. **Storage Separation**: Large binary data in OPFS, metadata in IndexedDB (web-client); chunks in S3/filesystem, metadata in PostgreSQL (server)
5. **Strategy Pattern**: Swap behavior (upload strategy, storage strategy, storage backend) without code changes
6. **DI Container**: Dependencies injected via constructor, not imported directly
7. **Multi-backend Storage**: Server storage backend selected at startup via `STORAGE_BACKEND` env var; code must work with both local and S3
8. **Room Access Control**: Room mutations require `accessKey` validation; guest status endpoint is public

## Implementation Status

### Completed Features
- **Solo Mode**: Standalone browser-only recording with crash recovery
- **Director Mode (Phase 4)**: Socket.IO-based room management for multi-guest recording
- **Guest Mode**: Participate in director-controlled sessions with sync tracking
- **4K Support**: High-resolution video encoding via WebCodecs
- **Library**: Recording history management
- **PostgreSQL Persistence (Phase 7)**: Recording and Room data stored in PostgreSQL
- **S3 Storage**: Cloudflare R2 / AWS S3 / LocalStack support with presigned URL downloads
- **Room Entity**: Full state machine with access key authentication and recording association

### Future Phases
- **WASM Integration**: Complete integration of fMP4 muxer into recording pipeline
- **E2E Tests**: Planned for Phase 1A-6+

## Troubleshooting

**WASM not loading:**
```bash
task build:wasm
task dev:client
```

**Type errors after changing common-types:**
```bash
task build:common-types
```

**Server not receiving uploads:**
- Check CORS settings in server `.env`
- Verify `VITE_SERVER_URL` in web-client `.env`
- Check network tab for failed requests

**Database connection errors:**
- Ensure PostgreSQL is running: `task docker:dev:up`
- Check `DATABASE_URL` in server `.env`
- Access psql shell: `task docker:db:psql`
- Reset database: `task docker:db:reset`

**S3 storage errors:**
- Verify LocalStack is running and healthy
- Check S3 env vars (`S3_ENDPOINT`, `S3_BUCKET`, credentials)
- Bucket auto-created via `localstack/init-s3.sh`

**Docker build issues:**
```bash
# Rebuild without cache
task clean
task docker:dev:build --no-cache
```
