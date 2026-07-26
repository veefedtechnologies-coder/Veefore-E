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

  // Import Vite dynamically - no need to import vite.config
  const { createServer: createViteServer, createLogger } = await import('vite');

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
    cors: true,
  };

  // Let Vite load its own config file automatically - vite.config.ts handles root directory
  const vite = await createViteServer({
    configFile: path.resolve(__dirname, "..", "client", "vite.config.ts"),
    root: path.resolve(__dirname, "..", "client"),
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

    // IMPORTANT: derive the asset check from the PATHNAME only, never the full
    // URL. req.originalUrl includes the query string, and OAuth error redirects
    // carry messages like `?message=No account found. Join the waitlist.` — the
    // dots in that query made path.extname() think the request was for a static
    // file (e.g. ".waitlist"), so it fell through to a 404 ("Cannot GET /signin").
    // This is why the failure was account-dependent: only redirects whose query
    // string contained a dot broke. Strip the query before the extension check.
    const pathnameOnly = url.split('?')[0];

    // Skip API routes and static asset patterns
    if (
      url.startsWith('/api/') ||
      url.startsWith('/uploads/') ||
      url.startsWith('/metrics/') ||
      url.startsWith('/.well-known/') ||
      path.extname(pathnameOnly) !== ''
    ) {
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
      const page = await vite.transformIndexHtml(url, template);
      // Inject the server-side auth bootstrap flag (fail-open). SSR app-shell is
      // production-only (see html-bootstrap), so in dev we only inline the flag
      // and the client paints the skeleton. Authenticated HTML → never cache.
      const { injectAuthBootstrap } = await import("./lib/html-bootstrap");
      const bootstrapped = await injectAuthBootstrap(page, req);
      res
        .status(200)
        .set({ "Content-Type": "text/html", "Cache-Control": "no-store", "Vary": "Cookie" })
        .end(bootstrapped);
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
  // IMPORTANT: disable express.static's automatic index.html serving. Otherwise
  // a request to "/" is served the RAW index.html by this middleware before it
  // can reach the bootstrap-injecting handler below — which is exactly why the
  // authed root entry flashed the landing page. With index:false, "/" falls
  // through to the injecting catch-all.
  //
  // CACHING: Vite emits content-hashed asset filenames (e.g. index-CdbsIyav.js),
  // so they are immutable — a changed file gets a new name. Cache them for a year
  // so a browser REFRESH serves JS/CSS from disk instantly instead of
  // re-validating the whole bundle over the network every time. index.html must
  // NEVER be cached (it carries the per-user bootstrap) — force no-store for it.
  app.use(express.static(distPath, {
    index: false,
    maxAge: '1y',
    immutable: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store');
      } else if (filePath.endsWith('sw.js')) {
        // The service worker script must NOT be long-cached, or browsers can't
        // detect new versions. Always revalidate it.
        res.setHeader('Cache-Control', 'no-cache');
      }
    },
  }));

  // fall through to index.html if the file doesn't exist. For SPA navigation
  // documents we inject the server-side auth bootstrap (fail-open) and mark the
  // user-specific HTML as no-store; everything else falls back to plain sendFile.
  app.use("*", async (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    const pathnameOnly = (req.originalUrl || req.url || '').split('?')[0];
    try {
      const { isHtmlDocumentRequest, injectAuthBootstrap } = await import("./lib/html-bootstrap");
      if (isHtmlDocumentRequest(pathnameOnly)) {
        const html = await fs.promises.readFile(indexPath, "utf-8");
        const bootstrapped = await injectAuthBootstrap(html, req, { ssrShell: true });
        res
          .status(200)
          .set({ "Content-Type": "text/html", "Cache-Control": "no-store", "Vary": "Cookie" })
          .end(bootstrapped);
        return;
      }
    } catch {
      /* fall through to plain sendFile on any error */
    }
    res.sendFile(indexPath);
  });
}
