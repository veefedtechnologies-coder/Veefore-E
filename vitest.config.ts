import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node', // Use Node for server-side tests (supports crypto, fs, path)
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.test.ts', '**/*.spec.ts', '**/*.test.tsx', '**/*.spec.tsx'],
    testTimeout: 30000,
    // Use environment selector for client vs server tests
    environmentMatchGlobs: [
      ['**/*.client.test.ts', 'happy-dom'],
      ['**/*.client.test.tsx', 'happy-dom'],
      ['client/**/*.test.ts', 'happy-dom'],
      ['client/**/*.test.tsx', 'happy-dom'],
      ['server/**/*.test.ts', 'node'],
      ['server/**/*.test.tsx', 'node'],
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
    },
  },
});
