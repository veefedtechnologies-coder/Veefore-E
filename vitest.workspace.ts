import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name: 'server',
      environment: 'node',
      include: ['server/**/*.test.ts', 'tests/**/*.test.ts'],
    }
  },
  {
    test: {
      name: 'client',
      environment: 'jsdom',
      include: ['client/**/*.test.ts', 'client/**/*.test.tsx'],
      setupFiles: ['./client/src/test-setup.ts'],
      globals: true
    }
  }
])
