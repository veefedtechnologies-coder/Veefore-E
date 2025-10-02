import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Check if we're in Replit environment
const isReplit = process.env.REPL_ID !== undefined;

// Build plugins array - use dynamic imports for Replit plugins
const plugins = [react()];

export default defineConfig({
  plugins,
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'use-sync-external-store/shim',
      'use-sync-external-store/shim/with-selector'
    ],
    exclude: [
      '@react-three/postprocessing'
    ],
    esbuildOptions: {
      target: 'es2020'
    }
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
  },
  resolve: {
    preserveSymlinks: false,
    dedupe: ['react', 'react-dom'],
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Keep React and React-DOM together in a single chunk
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'vendor-react';
          }
        }
      }
    }
  },
  server: {
    port: 5000,
    host: '0.0.0.0',
    strictPort: false,
    hmr: {
      protocol: 'wss',
      host: process.env.REPL_SLUG ? `${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co` : undefined,
      clientPort: 443,
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
      allow: [
        path.resolve(__dirname, 'client'),
        path.resolve(__dirname, 'shared'),
        path.resolve(__dirname, 'node_modules')
      ]
    },
  },
});