# Maycast Recorder

[日本語](README_ja.md)

WebCodecs-based video/audio recorder with OPFS storage and real-time server synchronization.

## Features

- **High-Quality Recording**: Efficient video/audio encoding using the WebCodecs API (4K supported)
- **Dual Storage**: Data protection with OPFS (local) + server synchronization
- **Real-Time Upload**: Chunks are uploaded to the server in parallel during recording (up to 5 concurrent)
- **Offline Support**: Local saving continues during network failures
- **Director Mode**: Real-time room management via Socket.IO for simultaneous multi-guest recording
- **Solo Mode**: Standalone recording without a server (lightweight dedicated build available)

## Quick Start

### Prerequisites

- [Docker](https://www.docker.com/) 20.10+
- [Task](https://taskfile.dev/) (recommended)

### Setup

```bash
git clone https://github.com/henteko/maycast_recorder.git
cd maycast_recorder
task docker:dev:up
```

Once started, visit http://localhost.

## Usage

### Solo Mode (Standalone Recording)

1. Visit http://localhost/solo
2. Select device and quality
4. Start recording → Stop
5. Save as MP4 with the download button

### Director Mode (Room Management)

1. Visit http://localhost/director
3. Create a room and invite guests
4. Monitor guest video in real time
5. Start/stop recording for all guests at once

### Guest Mode

1. Access the room URL shared by the director
2. Allow camera/microphone access
3. Recording is controlled by the director

## Architecture

```
┌─────────────────────────────────────┐
│  nginx (Reverse Proxy)              │
│  - HTTP/2                           │
│  - Let's Encrypt (production)       │
│  Port: 80, 443                      │
└─────────────────────────────────────┘
            ↓          ↓
    ┌───────────┐  ┌──────────────┐
    │  server   │  │ web-client   │
    │  (Express)│  │ (Vite/React) │
    │  Port:3000│  │ Port:5173    │
    └───────────┘  └──────────────┘
         ↓              ↓
    [OPFS Storage] [WASM Muxer]
```

npm workspaces monorepo:

| Package | Description |
|---|---|
| `packages/common-types` | Shared TypeScript type definitions |
| `packages/web-client` | React 19 + TypeScript 5.9 frontend |
| `packages/server` | Express + Socket.IO backend |
| `packages/wasm-core` | Rust WASM fMP4 Muxer |

## Development

Commands are managed with [Task](https://taskfile.dev/).

```bash
# Start dev server (WASM build + Client)
task dev

# Start individually
task dev:client       # Client only
task dev:server       # Server only
task dev:solo         # Solo Mode only

# Build
task build            # Build everything
task build:wasm       # WASM only
task build:solo       # Solo dedicated build (outputs to dist-solo/)

# Test & Lint
task test             # Run all tests
task lint             # Run all linters
task fmt              # Format code

# Docker
task docker:dev:up    # Start dev environment
task docker:dev:down  # Stop dev environment
task docker:dev:logs      # View logs
task docker:dev:restart   # Restart
```

## License

[Apache-2.0](LICENSE)
