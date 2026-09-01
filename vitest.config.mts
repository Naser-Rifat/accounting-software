import { existsSync } from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vitest/config'

if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  resolve: {
    alias: {
      // `server-only` throws by design outside a React Server Component build.
      // Tests exercise the same modules in plain Node, so it is stubbed away.
      'server-only': path.resolve(import.meta.dirname, './tests/stubs/server-only.ts'),
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // Integration tests share one database, so they must not run concurrently.
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
})
