import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  root: './client',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@components': path.resolve(__dirname, './client/src/components'),
      '@pages': path.resolve(__dirname, './client/src/pages'),
      '@hooks': path.resolve(__dirname, './client/src/hooks'),
      '@utils': path.resolve(__dirname, './client/src/utils'),
      '@types': path.resolve(__dirname, './client/src/types'),
      '@services': path.resolve(__dirname, './client/src/services'),
      '@contexts': path.resolve(__dirname, './client/src/contexts'),
      '@assets': path.resolve(__dirname, './client/src/assets')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 8000,
    strictPort: true,
    allowedHosts: ['.replit.dev'],
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../dist/client',
    sourcemap: true
  }
})
