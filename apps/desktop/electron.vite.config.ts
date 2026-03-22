import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    resolve: {
      alias: {
        '@emory/bridge-live': resolve('../../packages/bridge-live/src/index.ts'),
        '@emory/ingest-protocol': resolve('../../packages/ingest-protocol/src/index.ts'),
      },
    },
    plugins: [
      externalizeDepsPlugin({
        // Bundle dotenv: when it stays external, Node resolves from `out/main/` and often
        // misses hoisted workspace `node_modules` (ERR_MODULE_NOT_FOUND).
        exclude: ['@emory/bridge-live', '@emory/core', '@emory/db', '@emory/ingest-protocol', 'dotenv'],
      }),
    ],
    build: {
      rollupOptions: {
        external: ['better-sqlite3', 'onnxruntime-node', 'sharp'],
      },
    },
  },
  preload: {
    resolve: {
      alias: {
        '@emory/bridge-live': resolve('../../packages/bridge-live/src/index.ts'),
        '@emory/ingest-protocol': resolve('../../packages/ingest-protocol/src/index.ts'),
      },
    },
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@emory/core', '@emory/db'],
      }),
    ],
    build: {
      rollupOptions: {
        output: {
          format: 'cjs',
          entryFileNames: '[name].cjs',
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer'),
        '@emory/bridge-live': resolve('../../packages/bridge-live/src/index.ts'),
        '@emory/ingest-protocol': resolve('../../packages/ingest-protocol/src/index.ts'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
