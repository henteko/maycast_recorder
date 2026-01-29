import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'
import path from 'path'

// Solo専用Vite設定
// 出力先: dist-solo/
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
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
  build: {
    outDir: 'dist-solo',
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'solo.html'),
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
      plugins: [
        {
          name: 'rename-html',
          generateBundle(_, bundle) {
            // Rename solo.html to index.html
            if (bundle['solo.html']) {
              bundle['index.html'] = bundle['solo.html'];
              bundle['index.html'].fileName = 'index.html';
              delete bundle['solo.html'];
            }
          },
        },
      ],
    },
  },
})
