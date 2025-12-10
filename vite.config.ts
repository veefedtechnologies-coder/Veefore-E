import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
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
  plugins: [forceClean(), react()],
  root: path.resolve(__dirname, "client"),
  resolve: {
    preserveSymlinks: false,
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@tanstack/react-query', 'wouter'],
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
