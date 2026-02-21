import { defineConfig } from 'vite'
import path from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@server': path.resolve(process.cwd(), 'server'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'worker-entry.ts',
      formats: ['es'],
      fileName: () => '_worker.js',
    },
    rollupOptions: {
      external: ['node:crypto'],
    },
  },
})
