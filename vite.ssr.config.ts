import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "path"
import { fileURLToPath } from "url"
import { builtinModules } from "module"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Node built-ins (both bare and `node:`-prefixed) must stay external in the SSR
// bundle — react-dom/server pulls in `crypto`, `util`, etc.
const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
]

/**
 * SSR build for the instant-load app shell (Phase 3 of SSR_INSTANT_LOAD_PLAN.md).
 *
 * Builds `client/src/ssr/shell-ssr.tsx` into `dist/ssr/shell-ssr.js`, which the
 * server imports to render the route-aware `AppShellSkeleton` to a static HTML
 * string. Mirrors the React-version aliasing of `vite.client.config.ts` so the
 * SSR bundle uses the same single React/React-DOM copy as the client build.
 */
export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, "client"),
  envDir: __dirname,
  resolve: {
    preserveSymlinks: false,
    dedupe: ["react", "react-dom"],
    alias: {
      // NOTE: intentionally NO react / react-dom aliases here. The SSR output is
      // replaced by the client via createRoot (no hydration), so the SSR React
      // version need not match the client's. Letting react, react-dom AND
      // react-dom/server resolve to the single root copy avoids the dual-React
      // "Invalid hook call" that a partial react-dom alias caused (the
      // react-dom/server subpath escaped the alias).
      "three-mesh-bvh": path.resolve(__dirname, "client/src/stubs/three-mesh-bvh.ts"),
      "@": path.resolve(__dirname, "client/src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  build: {
    ssr: true,
    outDir: path.resolve(__dirname, "dist/ssr"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        'shell-ssr': path.resolve(__dirname, "client/src/ssr/shell-ssr.tsx"),
        'public-ssr': path.resolve(__dirname, "client/src/ssr/public-ssr.tsx"),
      },
      external: nodeExternals,
      output: {
        entryFileNames: "[name].js",
        format: "esm",
      },
    },
  },
})
