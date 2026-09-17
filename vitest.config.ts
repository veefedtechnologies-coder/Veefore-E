import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node', // Use Node for server-side tests (supports crypto, fs, path)
    setupFiles: ['./tests/setup.ts'],
    // Inline React + react-query so Vite transforms them and the resolve.dedupe
    // below collapses the duplicate React copies across the root/workspace/client
    // node_modules trees into one — otherwise provider-based component tests hit
    // a null hooks dispatcher from a second React instance.
    server: {
      deps: {
        inline: ['@tanstack/react-query', 'react', 'react-dom'],
      },
    },
    // NOTE: no root-level `include`. With `extends: true` each project inherits it
    // and merges it with its own, which made every server suite match the client
    // project too and run TWICE (once per environment). Scope is defined solely by
    // the per-project `include` below.
    testTimeout: 30000,
    // Per-file environment selection.
    //
    // `environmentMatchGlobs` was REMOVED in Vitest 3+ and is silently ignored by
    // the installed version (4.x). Every client suite therefore ran under the
    // `node` environment with no `document`/`window`, which is why the
    // animation-config / animation-performance suites failed on `matchMedia`.
    // `test.projects` is the supported replacement and is honoured.
    projects: [
      {
        extends: true,
        test: {
          name: 'client',
          environment: 'happy-dom',
          include: [
            'client/**/*.test.{ts,tsx}',
            'client/**/*.spec.{ts,tsx}',
            '**/*.client.test.{ts,tsx}',
          ],
        },
      },
      {
        extends: true,
        test: {
          name: 'server',
          environment: 'node',
          include: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
          exclude: [
            '**/node_modules/**',
            'client/**',
            '**/*.client.test.{ts,tsx}',
          ],
        },
      },
    ],
  },
  resolve: {
    dedupe: ['react', 'react-dom', '@tanstack/react-query'],
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      // Isomorphic modules shared by client + server (mirrors tsconfig paths).
      '@shared': path.resolve(__dirname, './shared'),
      // Pin React + React DOM to the copy @testing-library/react resolves to
      // (the repo root) so inlined provider deps share one hooks dispatcher.
      react: path.resolve(__dirname, '../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../node_modules/react-dom'),
      // Isomorphic platform capability registry (importable in both server + client).
      // Mirrors the tsconfig.json paths and vite.config.ts alias so server tests
      // can resolve the `@platform-registry` specifier and the relative path used
      // in FacebookRollupReadStore (which resolves to <root>/shared/platform-registry
      // after 4 levels up from server/features/facebook/analytics/).
      '@platform-registry': path.resolve(__dirname, './src/shared/platform-registry'),
      '@platform-registry/index': path.resolve(__dirname, './src/shared/platform-registry/index.ts'),
      '@platform-registry/types': path.resolve(__dirname, './src/shared/platform-registry/types.ts'),
      // Redirect the bare relative path that FacebookRollupReadStore uses.
      // From server/features/facebook/analytics, ../../../../shared/platform-registry
      // resolves to <root>/shared/platform-registry — point it to the real location.
      [path.resolve(__dirname, 'shared/platform-registry')]: path.resolve(
        __dirname,
        './src/shared/platform-registry/index.ts',
      ),
    },
  },
});
