# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**Maycast Recorder** is a WebCodecs-based video/audio recorder with OPFS storage and real-time server synchronization. It's a monorepo project with Clean Architecture + DDD patterns, supporting multiple modes:

- **Solo Mode**: Browser-only standalone recording (no server required)
- **Director Mode**: Room-based multi-guest recording management via Socket.IO
- **Guest Mode**: Participate in director-controlled recording sessions

## Project Structure

This is a **npm workspaces monorepo** with 4 packages:

- **`packages/common-types`** - Shared TypeScript types, entities, and domain errors (`@maycast/common-types`)
- **`packages/web-client`** - React 19 + TypeScript 5.9 frontend (Vite 7)
- **`packages/server`** - Express + TypeScript 5.9 backend with Socket.IO (`@maycast/server`)
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
# Run all tests
task test

# Run individual test suites
task test:rust      # Rust unit tests
task test:wasm      # WASM tests in headless Chrome
task test:server    # Vitest tests for server
```

### Code Quality

```bash
# Run all linters
task lint

# Lint individual languages
task lint:rust      # cargo clippy with -D warnings
task lint:ts        # ESLint for web-client
task lint:server    # ESLint for server

# Format code
task fmt            # Format all code
task fmt:rust       # cargo fmt
task fmt:ts         # TypeScript formatting
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
```

**Access points when running in Docker:**
- Web UI: http://localhost
- API: http://localhost/api
- Health Check: http://localhost/health

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
```

## Architecture

### Clean Architecture with Distinct Layers

This codebase follows **Clean Architecture + Domain-Driven Design (DDD)**:

#### 1. Domain Layer (innermost)
- **Entities**: `RecordingEntity`, `ChunkEntity` in `packages/common-types/src/entities/`
  - Contain business logic and enforce state transitions
  - Recording state machine: `standby → recording → finalizing → synced`
- **Repository Interfaces**: `IRecordingRepository`, `IChunkRepository` in `packages/*/src/domain/repositories/`
- **Service Interfaces**: `IMediaStreamService`, `IUploadStrategy`, `IStorageStrategy`
- **Use Cases**: Business workflows in `packages/*/src/domain/usecases/`
  - Examples: `StartRecording.usecase.ts`, `SaveChunk.usecase.ts`, `UploadChunk.usecase.ts`
  - Each use case implements `execute(request): Promise<response>`
- **Domain Errors**: Custom exceptions in `packages/common-types/src/errors/DomainErrors.ts`

#### 2. Infrastructure Layer
- **Repository Implementations**:
  - Web-client: `IndexedDBRecordingRepository`, `OPFSChunkRepository`
  - Server: `InMemoryRecordingRepository`, `LocalFileSystemChunkRepository`
- **Service Implementations**: `BrowserMediaStreamService`, `RemoteUploadStrategy`, `NoOpUploadStrategy`
- **API Clients**: `RecordingAPIClient` for HTTP communication
- **WebSocket Clients**: `WebSocketRoomClient` for Socket.IO room communication
- **DI Container**: Custom dependency injection in `packages/*/src/infrastructure/di/`

#### 3. Presentation Layer (outermost)
- **Controllers** (server): `RecordingController`, `ChunkController`
- **React Components** (web-client): Organized as Atomic Design (atoms/molecules/organisms/pages/templates)
  - **Pages**: `SoloPage`, `DirectorPage`, `GuestPage`, `LibraryPage`, `SettingsPage`
- **Custom Hooks**:
  - Core: `useRecorder`, `useMediaStream`, `useDownload`, `useDevices`, `useEncoders`
  - Room/Director: `useRoomManager`, `useRoomManagerWebSocket`, `useRoomWebSocket`, `useRoomMetadata`
  - Guest: `useGuestMediaStatus`, `useGuestRecordingControl`
  - Session: `useSessionManager`, `useSystemHealth`
- **API Routes**: Express routes in `packages/server/src/presentation/routes/`
- **WebSocket**: Socket.IO handlers in `packages/server/src/infrastructure/websocket/`

### Dependency Injection System

**Custom simple DI container** (not using InversifyJS):

- **Server-side**: Singleton pattern with `Map<string, unknown>` service registry
  - See `packages/server/src/infrastructure/di/DIContainer.ts` + `setupContainer.ts`
- **Web-client**: React Context API for DI propagation
  - `DIProvider.tsx` wraps app, `useDI()` hook accesses dependencies
  - Mode-aware setup (standalone vs. remote)

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
   - Recording entities, chunk metadata, upload retry state
   - Implemented in `IndexedDBRecordingRepository`

**Storage Strategies** (Strategy Pattern):
- `RemoteStorageStrategy`: OPFS locally + concurrent server upload
- `StandaloneStorageStrategy`: OPFS only (no upload)

#### Server Storage

- **Local Filesystem**: Chunks stored in `./recordings-data/` (configurable via env)
- **In-Memory Repository**: Recording metadata (will be replaced with database in Phase 7)

### Recording & Chunking Flow

1. **Capture**: WebCodecs API encodes video/audio frames
2. **Chunk Generation**: Encoded chunks saved to OPFS + metadata to IndexedDB
3. **Upload (Remote Mode)**: `ChunkUploader` manages concurrent uploads
   - Max 5 simultaneous uploads
   - Blake3 hash verification
   - Retry logic (up to 3 attempts with exponential backoff)
   - Non-blocking (recording continues while uploading)
4. **State Management**: Recording state transitions enforced at entity level

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
```
Invalid transitions throw `InvalidStateTransitionError`.

### API Endpoints (Server)

**Recording Management:**
- `POST /api/recordings` - Create recording
- `GET /api/recordings/:id` - Get recording details
- `PATCH /api/recordings/:id/state` - Update state
- `PATCH /api/recordings/:id/metadata` - Update metadata
- `GET /api/recordings/:id/download` - Download complete recording

**Chunk Upload:**
- `POST /api/recordings/:id/init-segment` - Upload init segment (binary)
- `POST /api/recordings/:id/chunks?chunk_id=N` - Upload chunk with hash header

### OPFS and Crash Recovery

**Standalone Mode** supports crash-proof recording:
- OPFS persists chunks even if browser crashes
- On app restart, scans for incomplete sessions
- Recovery modal offers to restore and download

See `docs/standalone-mode.md` for full specification.

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

## Important Files to Understand

When getting started, read these files in order:

1. **`packages/common-types/src/entities/Recording.entity.ts`** - Core business rules and state machine
2. **`packages/web-client/src/infrastructure/di/setupContainer.ts`** - Dependency wiring (mode-aware)
3. **`packages/web-client/src/presentation/hooks/useRecorder.ts`** - Full recording lifecycle
4. **`packages/web-client/src/presentation/hooks/useEncoders.ts`** - WebCodecs encoder management (4K support)
5. **`packages/web-client/src/infrastructure/websocket/WebSocketRoomClient.ts`** - Socket.IO room client
6. **`packages/web-client/src/presentation/hooks/useRoomManagerWebSocket.ts`** - Director Mode room management
7. **`packages/server/src/infrastructure/di/setupContainer.ts`** - Server dependency setup
8. **`packages/web-client/src/storage-strategies/RemoteStorageStrategy.ts`** - Upload orchestration
9. **`docs/standalone-mode.md`** - Standalone mode specification and design

## Testing

- **Server tests**: Vitest in `packages/server/src/**/*.test.ts`
- **Rust tests**: Standard Rust unit tests in `packages/wasm-core/src/`
- **WASM tests**: `wasm-bindgen-test` in headless Chrome
- **E2E tests**: Not yet implemented (planned for Phase 1A-6+)

## Environment Variables

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
STORAGE_PATH=./recordings-data
```

## Docker vs Local Development

**Docker (Recommended)**:
- Full stack with nginx, HTTP/2, SSL
- Matches production environment
- No local tool installation needed (except Docker + Task)

**Local**:
- Faster builds and iteration
- Better for debugging
- Requires: Rust, wasm-pack, Node.js 20+, Task
- Check requirements: `task doctor`

## Architecture Decisions to Respect

1. **Repository Pattern**: Never access storage directly; always go through repository interfaces
2. **Use Case Pattern**: Business logic belongs in use cases, not in controllers or components
3. **Entity State Management**: State transitions must be validated by entity methods
4. **Storage Separation**: Large binary data in OPFS, metadata in IndexedDB (web-client)
5. **Strategy Pattern**: Swap behavior (upload strategy, storage strategy) without code changes
6. **DI Container**: Dependencies injected via constructor, not imported directly

## Implementation Status

### Completed Features
- **Solo Mode**: Standalone browser-only recording with crash recovery
- **Director Mode (Phase 4)**: Socket.IO-based room management for multi-guest recording
- **Guest Mode**: Participate in director-controlled sessions
- **4K Support**: High-resolution video encoding via WebCodecs
- **Library**: Recording history management

### Future Phases
Based on comments in code:
- **Phase 7**: Replace in-memory recording repository with real database
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

**Docker build issues:**
```bash
# Rebuild without cache
task clean
task docker:dev:build --no-cache
```
