import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.client.ts'],
    include: [
      'client/**/*.test.ts',
      'client/**/*.test.tsx',
      'client/**/*.spec.ts',
      'client/**/*.spec.tsx'
    ],
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
    },
  },
});
