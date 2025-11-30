import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "client"),
  resolve: {
    preserveSymlinks: false,
    dedupe: ["react", "react-dom"],
    alias: {
      react: path.resolve(__dirname, "client/node_modules/react"),
      "react-dom": path.resolve(__dirname, "client/node_modules/react-dom"),
      "three-mesh-bvh": path.resolve(__dirname, "client/src/stubs/three-mesh-bvh.ts"),
      "react/jsx-runtime": path.resolve(__dirname, "client/node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "client/node_modules/react/jsx-dev-runtime.js"),
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    hmr: { protocol: "wss", clientPort: 443 },
    allowedHosts: ["veefore-webhook.veefore.com"],
    strictPort: true,
  },
  optimizeDeps: {
    force: true,
    include: ["react", "react-dom", "@tanstack/react-query", "wouter"],
  },
})
