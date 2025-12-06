import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { type Server } from "http";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  // Dynamic import of Vite modules only in development
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('setupVite should only be called in development mode');
  }

  // Import Vite and nanoid dynamically - no need to import vite.config
  const [{ createServer: createViteServer, createLogger }, { nanoid }] = await Promise.all([
    import('vite'),
    import('nanoid')
  ]);

  const viteLogger = createLogger();

  // Configure HMR for Replit's proxy environment
  const isReplit = !!process.env.REPLIT_DEV_DOMAIN;
  const serverOptions = {
    middlewareMode: true,
    hmr: isReplit ? {
      server: server,
      clientPort: 443,
      protocol: 'wss',
      host: process.env.REPLIT_DEV_DOMAIN,
    } : {
      server: server,
    },
    allowedHosts: true,
    host: '0.0.0.0',
    port: 5000,
    strictPort: true,
    cors: true,
  };

  // Let Vite load its own config file automatically - vite.config.ts handles root directory
  const vite = await createViteServer({
    customLogger: {
      ...viteLogger,
      error: (msg: string, options?: any) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  // Use Vite middleware to handle all module requests
  app.use(vite.middlewares);
  
  // Handle all other requests (SPA routing)
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    
    // Skip API routes
    if (url.startsWith('/api/') || url.startsWith('/uploads/') || url.startsWith('/metrics/')) {
      return next();
    }

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      console.error('[VITE] Error transforming HTML:', e);
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  console.log('[PRODUCTION] Serving static files from:', distPath);
  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
