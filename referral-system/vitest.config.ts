import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@agents': path.resolve(__dirname, 'src/agents'),
      '@db': path.resolve(__dirname, 'src/db'),
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@integrations': path.resolve(__dirname, 'src/integrations'),
      '@cache': path.resolve(__dirname, 'src/cache'),
      '@server': path.resolve(__dirname, 'src/server'),
    },
  },
});
