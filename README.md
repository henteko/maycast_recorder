# Maycast Recorder

A WebCodecs-based video/audio recorder with robust OPFS storage and optional server sync.

## Project Structure

```
/maycast-recorder
├── Cargo.toml           # Workspace root
├── Taskfile.yml         # Task automation (all dev commands)
├── /packages
│   ├── /common          # Shared Rust types (ChunkID, Metadata)
│   ├── /wasm-core       # Rust -> WASM Muxing (fMP4 generation)
│   └── /web-client      # TypeScript/React Frontend
└── /docs                # Documentation
```

## Development Phase

**Current Phase: 1A-1 (Environment Setup)** ✅ COMPLETED

- [x] Cargo Workspace configured
- [x] common crate created (ChunkID, Metadata types)
- [x] wasm-core crate created (wasm-bindgen setup)
- [x] web-client scaffolding (Vite + React + Tailwind CSS)
- [x] WASM build pipeline (wasm-pack)
- [x] Taskfile.yml setup
- [x] WASM import from Vite verified

## Prerequisites

- [Rust](https://rustup.rs/) (latest stable)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/) - `cargo install wasm-pack`
- [Node.js](https://nodejs.org/) (v18 or later)
- [Task](https://taskfile.dev/) - Task runner

Check if all tools are installed:
```bash
task doctor
```

## Quick Start

1. Install dependencies:
```bash
task deps:install
```

2. Build WASM module:
```bash
task build:wasm
```

3. Start development server:
```bash
task dev
```

4. Open browser and navigate to the local URL shown (typically `http://localhost:5173`)

5. Click "Test WASM: add(1, 2)" button to verify WASM integration

## Available Commands

See all available tasks:
```bash
task --list
```

### Development
- `task dev` - Start dev server with WASM auto-rebuild
- `task dev:client` - Client dev server only
- `task dev:wasm` - WASM watch mode

### Build
- `task build` - Build everything (WASM + client)
- `task build:wasm` - Build WASM module
- `task build:client` - Build client for production

### Testing
- `task test` - Run all tests
- `task test:rust` - Rust unit tests
- `task test:wasm` - WASM tests (headless browser)

### Code Quality
- `task lint` - Run all linters
- `task lint:rust` - cargo clippy
- `task lint:ts` - ESLint
- `task fmt` - Format all code
- `task fmt:rust` - cargo fmt
- `task fmt:ts` - Prettier

### Utilities
- `task clean` - Clean all build artifacts
- `task check` - Check compilation without building
- `task doctor` - Check required tools

## Technology Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **WASM**: Rust + wasm-bindgen + wasm-pack
- **Video/Audio Encoding**: WebCodecs API
- **Storage**: OPFS (Origin Private File System) + IndexedDB
- **Muxing**: mp4 crate (fMP4 generation in WASM)

## Next Steps

- **Phase 1A-2**: WebCodecs camera capture
- **Phase 1A-3**: Rust WASM muxer implementation
- **Phase 1A-4**: WebCodecs + WASM integration
- **Phase 1A-5**: OPFS storage
- **Phase 1A-6**: End-to-end chunk validation

See [docs/development-plan.md](docs/development-plan.md) for the full roadmap.

## License

MIT OR Apache-2.0
