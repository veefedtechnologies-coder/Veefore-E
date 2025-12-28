import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from 'vite-plugin-pwa';
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const forceClean = () => {
  let outDirResolved: string | undefined
  return {
    name: 'force-clean-outdir',
    apply: 'build' as const,
    configResolved(config: any) {
      outDirResolved = config.build?.outDir
    },
    buildStart() {
      try {
        if (outDirResolved && fs.existsSync(outDirResolved)) {
          fs.rmSync(outDirResolved, { recursive: true, force: true })
        }
      } catch {}
    }
  }
}

export default defineConfig({
  plugins: [
    forceClean(), 
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'veefore-logo.png'],
      manifest: {
        name: 'VeeFore - AI-Powered Social Media Management',
        short_name: 'VeeFore',
        description: 'AI-powered social media management platform',
        theme_color: '#030303',
        background_color: '#030303',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/veefore-logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/veefore-logo.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\/api\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 5 // 5 minutes
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: false // Disable in development
      }
    })
  ],
  root: path.resolve(__dirname, "client"),
  resolve: {
    preserveSymlinks: false,
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@tanstack/react-query', 'wouter', 'framer-motion', 'three'],
    alias: {
      'three-mesh-bvh': path.resolve(__dirname, 'client/src/stubs/three-mesh-bvh.ts'),
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: false,
    target: 'esnext',
    minify: 'esbuild',
    cssMinify: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-motion': ['framer-motion'],
          'vendor-three': ['three', '@react-three/fiber', '@react-three/drei'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'react', 
      'react-dom', 
      'react-dom/client', 
      'react/jsx-runtime', 
      'react/jsx-dev-runtime',
      '@tanstack/react-query',
      'wouter',
      'framer-motion',
    ],
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    hmr: process.env.REPLIT_DEV_DOMAIN
      ? { 
          protocol: 'wss', 
          clientPort: 443,
          host: process.env.REPLIT_DEV_DOMAIN 
        }
      : { protocol: 'ws' },
  },
});
