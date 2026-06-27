import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { TEST_CONFIG } from './src/test/testConstants'

export default defineConfig({
  plugins: [react()],
  // Use Vite's cacheDir instead of deprecated cache.dir
  cacheDir: 'node_modules/.vitest',
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: TEST_CONFIG.TIMEOUT,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false, // Enable multiple forks for parallel execution
        isolate: true,     // Enable isolation for stability
      },
    },
    // Optimize for speed with memory leak fixed
    maxConcurrency: TEST_CONFIG.MAX_CONCURRENCY,
    minWorkers: TEST_CONFIG.MIN_WORKERS,
    maxWorkers: TEST_CONFIG.MAX_WORKERS,
    // Clear mocks between tests
    clearMocks: true,
    // Restore mocks after each test
    restoreMocks: true,
    // Monitor memory usage but allow parallel execution
    logHeapUsage: true,
    // Exclude backup and legacy folders from tests
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      '**/coverage/**',
      '**/backup-complex-architecture/**',
      '**/backup-stores/**',
      '**/refactoring-backup-*/**',
      '**/refactoring-toolkit/**'
    ],
    // Optimize file watching
    watchExclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.git/**',
      '**/coverage/**',
      '**/backup-complex-architecture/**',
      '**/backup-stores/**',
      '**/refactoring-backup-*/**',
      '**/refactoring-toolkit/**'
    ]
  },
})