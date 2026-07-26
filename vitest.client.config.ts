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
    server: {
      deps: {
        // Inline so the react/react-dom aliases below also apply inside
        // @testing-library/react (otherwise it pulls a second React copy and
        // hooks fail with a null dispatcher).
        inline: [/@testing-library\//],
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: {
      react: path.resolve(__dirname, '../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(
        __dirname,
        '../node_modules/react/jsx-runtime.js',
      ),
      'react/jsx-dev-runtime': path.resolve(
        __dirname,
        '../node_modules/react/jsx-dev-runtime.js',
      ),
      '@': path.resolve(__dirname, './client/src'),
    },
  },
});
