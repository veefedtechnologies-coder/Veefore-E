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
      } catch { }
    }
  }
}

export default defineConfig({
  plugins: [
    forceClean(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'veefore-logo.png', 'offline.html'],
      manifest: {
        name: 'VeeFore',
        short_name: 'VeeFore',
        description: 'AI-powered social media management platform',
        theme_color: '#3b82f6',
        background_color: '#000000',
        display: 'standalone',
        start_url: '/',
        orientation: 'portrait-primary',
        scope: '/',
        categories: ['business', 'productivity', 'social'],
        icons: [
          {
            src: '/veefore-logo.png',
            sizes: '72x72',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/veefore-logo.png',
            sizes: '96x96',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/veefore-logo.png',
            sizes: '128x128',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/veefore-logo.png',
            sizes: '144x144',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/veefore-logo.png',
            sizes: '152x152',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/veefore-logo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: '/veefore-logo.png',
            sizes: '384x384',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/veefore-logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,jpg,jpeg,gif,webp}'],
        navigateFallback: '/offline.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'static-assets-cache-v1',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 7
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /\.(?:woff|woff2|ttf|eot)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365
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
                maxAgeSeconds: 60 * 60 * 24 * 365
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
                maxEntries: 100,
                maxAgeSeconds: 60 * 5
              },
              networkTimeoutSeconds: 10,
              cacheableResponse: {
                statuses: [0, 200]
              },
              backgroundSync: {
                name: 'api-sync-queue',
                options: {
                  maxRetentionTime: 60 * 24
                }
              }
            }
          },
          {
            urlPattern: /\.html$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'html-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 60 * 60 * 24
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/.*\.(?:openai|anthropic)\.com\/.*/i,
            handler: 'NetworkOnly'
          }
        ]
      },
      devOptions: {
        enabled: false
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
    minify: 'terser',
    cssMinify: true,
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
    sourcemap: false,
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace'],
        passes: 2,
      },
      mangle: {
        safari10: true,
      },
      format: {
        comments: false,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'three-vendor': ['three', '@react-three/fiber', '@react-three/drei'],
          'charts-vendor': ['recharts'],
          'firebase-vendor': ['firebase', 'firebase-admin'],
          'query-vendor': ['@tanstack/react-query'],
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
      treeshake: {
        moduleSideEffects: 'no-external',
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
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
