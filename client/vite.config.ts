import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')
  
  return {
    envDir: '../',
    define: {
      'import.meta.env.VITE_META_PHASE_1_REVIEW_MODE': JSON.stringify(env.VITE_META_PHASE_1_REVIEW_MODE || env.META_PHASE_1_REVIEW_MODE || 'false')
    },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@assets": path.resolve(__dirname, "./src/assets"),
    },
  },
  server: {
    host: true,
    cors: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor chunk: core React runtime and router
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/wouter/')
          ) {
            return 'vendor'
          }

          // UI chunk: animation and component libraries
          if (
            id.includes('node_modules/framer-motion/') ||
            id.includes('node_modules/@radix-ui/') ||
            id.includes('node_modules/lucide-react/')
          ) {
            return 'ui'
          }

          // Firebase chunk: all Firebase packages
          if (id.includes('node_modules/firebase/') || id.includes('node_modules/@firebase/')) {
            return 'firebase'
          }
        },
      },
    },
  },
  }
})
