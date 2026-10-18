import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./client/src/test-setup.ts'],
    globals: true,
  },
});
