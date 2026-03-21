import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    plugins: [
      externalizeDepsPlugin({
        exclude: ['@emory/core', '@emory/db'],
      }),
    ],
    build: {
      rollupOptions: {
        external: ['better-sqlite3', 'onnxruntime-node', 'sharp'],
      },
    },
  },
  preload: {
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
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
