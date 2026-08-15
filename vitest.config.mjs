import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['test/**/*.test.js'],
    testTimeout: 30000,
    hookTimeout: 120000,
    sequence: {
      concurrent: false,
    },
    pool: 'forks',
    fileParallelism: false,
  },
});
