import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': path.resolve(process.cwd(), 'src'),
      '@server': path.resolve(process.cwd(), 'server'),
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'server/**/*.test.ts'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    environmentMatchGlobs: [
      ['server/**/*.test.ts', 'node'],
    ],
  },
})
