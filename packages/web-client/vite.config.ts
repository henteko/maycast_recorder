import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
  ],
  resolve: {
    alias: {
      'maycast-wasm-core': path.resolve(__dirname, '../wasm-core/pkg/maycast_wasm_core.js'),
    },
  },
  worker: {
    format: 'es',
    plugins: () => [wasm(), topLevelAwait()],
  },
  optimizeDeps: {
    exclude: ['maycast-wasm-core'],
  },
  server: {
    fs: {
      // Allow serving files from the workspace root
      allow: [
        path.resolve(__dirname, '../..'),
      ],
    },
  },
})
