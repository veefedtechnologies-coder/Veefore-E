import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "client"),
  envDir: __dirname,
  resolve: {
    preserveSymlinks: false,
    dedupe: ["react", "react-dom"],
    alias: {
      react: path.resolve(__dirname, "client/node_modules/react"),
      "react-dom": path.resolve(__dirname, "client/node_modules/react-dom"),
      "three-mesh-bvh": path.resolve(__dirname, "client/src/stubs/three-mesh-bvh.ts"),
      "agentation": path.resolve(__dirname, "client/src/stubs/agentation.ts"),
      "react/jsx-runtime": path.resolve(__dirname, "client/node_modules/react/jsx-runtime.js"),
      "react/jsx-dev-runtime": path.resolve(__dirname, "client/node_modules/react/jsx-dev-runtime.js"),
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
      "@platform-registry": path.resolve(__dirname, "src/shared/platform-registry"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Split heavy third-party libraries out of the single entry chunk so the
        // browser only downloads what a given route needs, loads vendors in
        // parallel, and keeps them cached across app deploys (their hash only
        // changes when the library itself changes, not when app code does).
        // Targeted by design: we group a handful of KNOWN-heavy packages and let
        // Vite handle everything else, which avoids the load-order/circular-dep
        // pitfalls of a catch-all "every node_module in its own chunk" splitter.
        // CRITICAL: all of React (react + react-dom + scheduler + jsx-runtime)
        // MUST live in ONE chunk — never split — or you get dual-React / invalid
        // hook errors.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id))
            return "react-vendor";
          if (id.includes("/node_modules/firebase") || id.includes("/@firebase/"))
            return "firebase-vendor";
          if (id.includes("/node_modules/gsap")) return "gsap-vendor";
          if (id.includes("framer-motion") || id.includes("/node_modules/motion"))
            return "motion-vendor";
          // NOTE: recharts/d3 are intentionally NOT grouped. They are only used by
          // lazy routes (analytics, VeeGPT, social listening), and Vite's default
          // per-route splitting already keeps them off the critical path. Forcing
          // them into a shared vendor chunk promotes them to an EAGER modulepreload
          // (recharts alone is ~117 KB gzipped) — the opposite of what we want.
          if (id.includes("lucide-react")) return "icons-vendor";
          if (id.includes("/@tanstack/")) return "query-vendor";
        },
      },
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
    hmr: { protocol: "wss", clientPort: 443 },
    allowedHosts: true,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  optimizeDeps: {
    // NOTE: `force: true` was removed. Forcing a full dependency re-optimization
    // on EVERY dev-server start regenerates the optimized-deps version hashes
    // (the `?v=…` query on /node_modules/.vite/deps/chunk-*.js). Any browser tab
    // opened before a restart then requests the OLD hashes, which now 404 →
    // "Importing a module script failed" → "App failed to load". Letting Vite
    // manage its cache normally means it only re-optimizes when the dependency
    // set actually changes, and it performs a clean full-reload when it does.
    // If you ever need a one-off clean rebuild, run `vite --force` from the CLI
    // instead of hard-coding it here.
    include: ["react", "react-dom", "@tanstack/react-query", "wouter", "agentation"],
  },
})
