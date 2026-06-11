import './env';
import dotenv from 'dotenv';
import path from 'path';

import { validateEnv, isProduction as isProd, isDevelopment as isDev } from './config/env';
const validatedEnv = validateEnv();

// OAuth Environment Validation - Requirement 8.6: Startup validation
import { validateOAuthEnvironment, validateCookieDomain, validateCORSConfiguration } from './config/oauthEnvValidation';
const oauthValidation = validateOAuthEnvironment();
// Note: OAuth validation warnings are logged but don't prevent startup in development
// In production with OAuth routes enabled, validation should be enforced

// Fix 6: Cookie Domain Validation - Requirement 2.12, 2.13
const cookieDomainValidation = validateCookieDomain();
if (!cookieDomainValidation.valid) {
  console.error('[STARTUP] ❌ Cookie domain validation failed - application will not start');
  cookieDomainValidation.errors.forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

// Fix 8: CORS Configuration Validation - Requirement 2.16, 2.17
const corsValidation = validateCORSConfiguration();
if (!corsValidation.valid) {
  console.error('[STARTUP] ❌ CORS configuration validation failed - application will not start');
  corsValidation.errors.forEach(error => console.error(`  - ${error}`));
  process.exit(1);
}

import * as fs from 'fs';

import logger from './config/logger';

import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { registerRoutes, initializeLeaderElection } from "./routes";
import { MongoStorage } from "./mongodb-storage";
import mongoose from 'mongoose';
import axios from 'axios';
import { ApiMonitorService } from './services/api-monitor';

// P1 Observability: Attach API monitor to intercept Meta API requests globally
ApiMonitorService.getInstance().attachToAxios(axios);
import { startSchedulerService } from "./scheduler-service";
// Re-enabling for comprehensive testing
import MetricsWorker from "./workers/metricsWorker";
import RealtimeService from "./services/realtime";
import { serverAdapter } from "./lib/bull-board";
import Logger from "./utils/logger";
import metricsRoutes from "./routes/metrics";
import webhooksRoutes from "./routes/webhooks";
import testingRoutes from "./routes/testing";
import cicdRoutes from "./routes/cicd";
import productionRoutes from "./routes/production";
import auditRoutes from "./routes/audit";
import socialListeningRoutes from "./routes/social-listening";
import adminMonitoringRoutes from "./routes/admin-monitoring";
import multer from "multer";
import {
  initializeRateLimiting,
  globalRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  uploadRateLimiter,
  bruteForceMiddleware,
  passwordResetRateLimiter,
  socialMediaRateLimiter,
  aiRateLimiter
} from "./middleware/rate-limiting-working";
import { xssProtectionMiddleware, enhancedXssHeaders } from "./middleware/xss-protection";
import { cleanupTempFiles } from "./middleware/file-upload-security";
import {
  corsSecurityMiddleware,
  strictCorsMiddleware,
  apiCorsMiddleware,
  corsMetricsMiddleware,
  corsContentSecurityPolicy,
  emergencyCorsLockdown
} from "./middleware/cors-security";
import {
  initializeKeyManagement,
  secretsValidationMiddleware,
  keyManagementHeaders
} from "./middleware/key-management";
import {
  initializeSecurityMonitoring,
  correlationIdMiddleware,
  securityLoggingMiddleware,
  attackDetectionMiddleware,
  auditTrailMiddleware
} from "./middleware/security-monitoring";
import { threatDetectionMiddleware } from "./middleware/threat-detection";
import securityRoutes from "./routes/security";
import healthRoutes from "./routes/health";
import authRoutes from './routes/auth';
import { initializeGracefulShutdown } from "./middleware/graceful-shutdown";
import { validateRequest, workspaceIdSchema } from './middleware/validation';
import { z } from 'zod';
import { initializeSentry } from './monitoring/sentry-init';
import { requireAuth } from './middleware/require-auth';
import { validateWorkspaceAccess } from './middleware/workspace-validation';

// Production-safe log function
let log: (message: string, source?: string) => void;

// Fallback log function for production
const fallbackLog = (message: string, source = "express") => {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
};

// Dynamic imports for production-safe Vite setup
let setupVite: any = null;
let serveStatic: any = null;

const isProduction = isProd();
const isDevelopment = isDev();

// P1-6 SECURITY: Initialize comprehensive key management system
const keyManagementSystem = initializeKeyManagement();

// P1-7 SECURITY: Initialize comprehensive security monitoring system
const securityMonitoring = initializeSecurityMonitoring();

// P2-1 SECURITY: Initialize OAuth 2.0 PKCE system
import { initializeOAuthPKCE } from './security/oauth-pkce';
initializeOAuthPKCE();

// P2-2 SECURITY: Initialize enhanced token encryption
import { initializeTokenEncryption, tokenEncryptionMiddleware, scheduleTokenReEncryption } from './security/token-migration';

// P2-3 SECURITY: Initialize webhook signature verification
import { initializeWebhookSecurity } from './security/webhook-verification';
initializeWebhookSecurity();

// P2-5 SECURITY: Initialize workspace isolation system
import { initializeWorkspaceIsolation } from './security/workspace-isolation';
initializeWorkspaceIsolation();

// P2-7 SECURITY: Initialize token hygiene automation
// import { initializeTokenHygiene } from './security/token-hygiene';
// initializeTokenHygiene(); // Migrated to BullMQ Background Workers (Phase 6)

// P2-9 SECURITY: Initialize resource namespacing system
import { initializeResourceNamespacing } from './security/resource-namespacing';
initializeResourceNamespacing();

// P3 SECURITY: Initialize GDPR & Data Protection Compliance
import { initializeGDPRCompliance } from './security/gdpr-compliance';
initializeGDPRCompliance();

const app = express();

// Mount Bull Board UI early to bypass all security middlewares that cause Safari download bugs
app.use('/queues-dashboard', (req, res, next) => {
  if (req.path === '/' && !req.originalUrl.endsWith('/')) {
    return res.redirect(301, '/queues-dashboard/');
  }
  next();
}, serverAdapter.getRouter());

// Disable ETag to prevent 304 responses on API JSON endpoints
app.set('etag', false);
// Force no-cache headers for API endpoints in production
app.use((req, res, next) => {
  try {
    if (req.path && req.path.startsWith('/api')) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  } catch { }
  next();
});

// P4 SECURITY: Initialize Reliability & Observability System
import { initializeReliabilitySystem, applyMonitoringMiddleware, applyErrorTrackingMiddleware, createMonitoringEndpoints, recordStartupMetrics, setupGracefulShutdown } from './monitoring';
import { attachSentryExpressHandlers, attachSentryRequestMiddleware } from './monitoring/sentry-init';

// P5 PERFORMANCE: Initialize comprehensive performance & scalability system
import {
  initializePerformanceSystem,
  applyPerformanceMiddleware,
  createPerformanceEndpoints,
  applyCachedRoutes,
  performStartupOptimizations
} from './performance';

initializeReliabilitySystem(app);
initializeSentry();
try { attachSentryRequestMiddleware(app); } catch { }
try { attachSentryExpressHandlers(app); } catch { }

// P4 MONITORING: Apply monitoring middleware early
applyMonitoringMiddleware(app);
applyErrorTrackingMiddleware(app);

// P5 PERFORMANCE: Initialize and apply performance optimization system
await initializePerformanceSystem(app);
applyPerformanceMiddleware(app);

// P1-3 SECURITY: Trust proxy for correct req.ip behind load balancers
app.set('trust proxy', 1);

// P1-7 SECURITY: Correlation ID tracking (highest priority for logging)
app.use(correlationIdMiddleware);

// P1-7 SECURITY: Security monitoring and logging
app.use(securityLoggingMiddleware);

// PRODUCTION NOTE: Static assets are served by Vercel (frontend)
// Railway only serves the API backend - no dist/public directory needed
if (isDevelopment) {
  // Only check for static files in development mode
  const distPublicPath = path.join(process.cwd(), 'dist/public');
  if (fs.existsSync(distPublicPath)) {
    app.use('/assets', express.static(path.join(distPublicPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.css')) {
          res.setHeader('Content-Type', 'text/css');
        } else if (filePath.endsWith('.js')) {
          res.setHeader('Content-Type', 'application/javascript');
        }
      }
    }));
    console.log('[STATIC] Serving /assets from dist/public/assets (development mode)');
  }
} else {
  console.log('[PRODUCTION] Static assets served by Vercel - Railway handles API only');
}

// P1-5 SECURITY: Emergency CORS lockdown check (highest priority)
app.use(emergencyCorsLockdown);

// P1-5 SECURITY: CORS metrics and monitoring
app.use(corsMetricsMiddleware);

// P1-5 SECURITY: Main CORS security middleware
app.use(corsSecurityMiddleware({
  allowCredentials: true,
  maxAge: 86400, // 24 hours preflight cache
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-Total-Count'],
  allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-CSRF-Token', 'X-Workspace-ID']
}));

// P1-5 SECURITY: CSP integration with CORS policy - Disabled completely for iframe compatibility
// if (isProduction) {
//   app.use(corsContentSecurityPolicy);
// }

app.use(helmet({
  // P1-2: HTTP Strict Transport Security (HSTS) - Production only
  strictTransportSecurity: isProduction ? {
    maxAge: 63072000, // 2 years (required for HSTS preload list)
    includeSubDomains: true,
    preload: true
  } : false, // Disable for localhost development

  // P1-2: Allow iframe embedding in Replit environment
  frameguard: false, // Disable completely for iframe compatibility

  // P1-2: Enhanced Content Security Policy - Disabled completely for iframe compatibility
  contentSecurityPolicy: isProduction && process.env.ENABLE_CSP === 'true' ? undefined : false,

  // P1-2: Enhanced cross-origin policies - Disabled for iframe compatibility
  crossOriginResourcePolicy: false, // Allow all resources for iframe
  crossOriginOpenerPolicy: false, // Allow iframe embedding
  crossOriginEmbedderPolicy: false, // Disable for iframe compatibility

  // P1-2: Additional security headers
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },

  // P1-2: Permissions Policy - Explicitly disable deprecated features
  // Set empty permissions policy to prevent browser default warnings

  // P1-2: DNS prefetch control
  dnsPrefetchControl: { allow: false },

  // P1-2: Content type options
  noSniff: true,

  // P1-2: Download options (IE8+ security)
  ieNoOpen: true,

  // P1-2: Disable X-XSS-Protection (deprecated, CSP is better)
  xssFilter: false
}));

// IFRAME FIX: Official Replit iframe embedding support + Clean Permissions Policy
app.use((req: Request, res: Response, next: NextFunction) => {
  // Remove X-Frame-Options to allow iframe embedding
  res.removeHeader('X-Frame-Options');

  // Set iframe-friendly headers
  const allowedOrigin = process.env.CORS_ORIGIN || '*';
  // NOTE: Combined with main corsSecurityMiddleware to prevent header conflicts
  // if (isProduction && process.env.CORS_ORIGIN) {
  //   res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN);
  // } else {
  //   res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  // }
  // res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  // res.setHeader('Access-Control-Allow-Headers', '*');

  // CRITICAL: Set ONLY valid Permissions-Policy features to eliminate warnings
  // Remove deprecated/invalid features that cause "Unrecognized feature" warnings
  res.setHeader('Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), fullscreen=(), payment=(), ' +
    'accelerometer=(), autoplay=(), display-capture=(), encrypted-media=(), ' +
    'gyroscope=(), magnetometer=(), midi=(), picture-in-picture=(), ' +
    'screen-wake-lock=(), sync-xhr=(), usb=(), xr-spatial-tracking=()');

  // Support for Replit ?embed=true parameter
  if (req.query.embed === 'true') {
    res.setHeader('Content-Security-Policy', 'frame-ancestors *');
  }

  next();
});

// P1 SECURITY: Secure cookie parser for HTTP-only authentication cookies
app.use((req: Request, res: Response, next: NextFunction) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader && typeof cookieHeader === 'string') {
    cookieHeader.split(';').forEach((cookie: string) => {
      const trimmed = cookie.trim();
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex > 0) {
        // SECURITY FIX: Handle values containing '=' correctly
        const name = trimmed.substring(0, equalIndex);
        const value = trimmed.substring(equalIndex + 1);
        req.cookies[name] = decodeURIComponent(value);
      }
    });
  }
  next();
});

// P2 SECURITY: Session management for OAuth 2.0 flows
import session from 'express-session';
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-for-development',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',   // 'lax' required for OAuth: allows cookie on top-level cross-site GET redirects (Google → app)
    maxAge: 600000, // 10 minutes for OAuth flows
  },
  name: 'oauth_session',
}));

// P1-3 SECURITY: Apply global rate limiting to all requests
// P1-3 SECURITY: Apply global rate limiting only to API routes, not static assets
app.use('/api', globalRateLimiter);

// P1-5 SECURITY: API-specific CORS protection with enhanced validation
app.use('/api', apiCorsMiddleware);

// P1-7 SECURITY: Attack detection and blocking
// app.use('/api', attackDetectionMiddleware); // Temporarily disabled due to false positives

// P8 SECURITY: Advanced threat detection and real-time response
// app.use(threatDetectionMiddleware); // Temporarily disabled due to false positives

// P1-6 SECURITY: Key management and secrets validation
app.use('/api', secretsValidationMiddleware());
app.use('/api/oauth', keyManagementHeaders());
app.use('/api/admin', keyManagementHeaders());

// P1-4.3 SECURITY: XSS Protection middleware
app.use(enhancedXssHeaders());
// app.use('/api', xssProtectionMiddleware({ sanitizeBody: true, sanitizeQuery: true, sanitizeParams: true })); // Temporarily disabled due to header conflicts

// P2-2 SECURITY: Token encryption response filtering
app.use('/api', tokenEncryptionMiddleware());

// P1-4.4 SECURITY: File upload cleanup service
setInterval(() => {
  cleanupTempFiles(24 * 60 * 60 * 1000); // Clean files older than 24 hours
}, 60 * 60 * 1000); // Run every hour

app.use(express.json({ 
  limit: '50mb',
  verify: (req: any, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit for videos
  fileFilter: (req, file, cb) => {
    // Accept images and videos
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image and video files are allowed'));
    }
  }
});

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

// Fix body parsing middleware for content creation
app.use((req, res, next) => {
  if (req.path.startsWith('/api/content') && req.method === 'POST') {
    console.log('[BODY DEBUG] Raw body:', req.body);
    console.log('[BODY DEBUG] Content-Type:', req.headers['content-type']);
    console.log('[BODY DEBUG] Content-Length:', req.headers['content-length']);

    // Fix double-stringified body issue
    if (req.body && typeof req.body === 'object' && req.body.body && typeof req.body.body === 'string') {
      try {
        req.body = JSON.parse(req.body.body);
        console.log('[BODY DEBUG] Fixed double-stringified body');
      } catch (parseError) {
        console.error('[BODY DEBUG] Failed to parse nested body:', parseError);
      }
    }
  }
  next();
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Load Vite modules conditionally based on environment
  try {
    if (isDevelopment) {
      console.log('[DEV] Loading Vite development modules...');
      const viteModule = await import("./vite");
      log = viteModule.log;
      setupVite = viteModule.setupVite;
      console.log('[DEV] Vite development modules loaded successfully');
    } else {
      console.log('[PRODUCTION] Loading production modules...');
      log = fallbackLog;
      // Only import serveStatic for production - setupVite will never be loaded
      const viteModule = await import("./vite");
      serveStatic = viteModule.serveStatic;
      console.log('[PRODUCTION] Production modules loaded successfully');
    }
  } catch (error) {
    console.warn('[WARN] Vite modules not available, using fallback:', (error as Error).message);
    log = fallbackLog;
  }

  const storage = new MongoStorage();
  await storage.connect();

  // Database reset endpoint (development only)
  if (!isProduction) {
    app.post('/api/admin/reset-database', async (req, res) => {
      try {
        console.log('🔄 Starting complete database reset...');

        // Wait for storage to be connected
        await storage.connect();

        let totalDeleted = 0;
        const resetResults: Array<{ collection: string; deleted: number }> = [];

        // Clear all data through the storage interface
        try {
          // Clear users
          const userResult = await storage.clearAllUsers();
          if (userResult > 0) {
            console.log(`🗑️  Cleared users: ${userResult} documents`);
            resetResults.push({ collection: 'users', deleted: userResult });
            totalDeleted += userResult;
          }
        } catch (error) {
          console.log(`⚠️  Error clearing users: ${(error as Error).message}`);
        }

        try {
          // Clear waitlist users
          const waitlistResult = await storage.clearAllWaitlistUsers();
          if (waitlistResult > 0) {
            console.log(`🗑️  Cleared waitlist_users: ${waitlistResult} documents`);
            resetResults.push({ collection: 'waitlist_users', deleted: waitlistResult });
            totalDeleted += waitlistResult;
          }
        } catch (error) {
          console.log(`⚠️  Error clearing waitlist_users: ${(error as Error).message}`);
        }

        try {
          // Clear workspaces
          const workspaceResult = await storage.clearAllWorkspaces();
          if (workspaceResult > 0) {
            console.log(`🗑️  Cleared workspaces: ${workspaceResult} documents`);
            resetResults.push({ collection: 'workspaces', deleted: workspaceResult });
            totalDeleted += workspaceResult;
          }
        } catch (error) {
          console.log(`⚠️  Error clearing workspaces: ${(error as Error).message}`);
        }

        try {
          // Clear social accounts
          const socialResult = await storage.clearAllSocialAccounts();
          if (socialResult > 0) {
            console.log(`🗑️  Cleared social_accounts: ${socialResult} documents`);
            resetResults.push({ collection: 'social_accounts', deleted: socialResult });
            totalDeleted += socialResult;
          }
        } catch (error) {
          console.log(`⚠️  Error clearing social_accounts: ${(error as Error).message}`);
        }

        try {
          // Clear content
          const contentResult = await storage.clearAllContent();
          if (contentResult > 0) {
            console.log(`🗑️  Cleared content: ${contentResult} documents`);
            resetResults.push({ collection: 'content', deleted: contentResult });
            totalDeleted += contentResult;
          }
        } catch (error) {
          console.log(`⚠️  Error clearing content: ${(error as Error).message}`);
        }

        console.log(`✅ DATABASE RESET COMPLETED - Total documents deleted: ${totalDeleted}`);

        res.json({
          success: true,
          message: 'Database reset completed successfully',
          totalDeleted,
          resetResults,
          note: 'Fresh database - ready for new accounts'
        });

      } catch (error) {
        console.error('❌ Database reset failed:', error);
        res.status(500).json({
          success: false,
          error: 'Database reset failed',
          message: (error as Error).message
        });
      }
    });
  }

  // Create HTTP server early to pass to registerRoutes
  const { createServer } = await import('http');
  const httpServer = createServer(app);
  (httpServer as any).keepAliveTimeout = 65000;
  (httpServer as any).headersTimeout = 66000;
  (httpServer as any).requestTimeout = 0;

  // Start the background scheduler service
  // Instagram Smart Polling is now handled in routes.ts with distributed locking
  // This ensures only one instance runs polling when scaling horizontally
  console.log('[SMART POLLING] Instagram polling initialization delegated to routes.ts with leader election');

  // Start base scheduler for daily snapshots and scheduled posts
  startSchedulerService(storage as any);

  // Ensure database is fully connected before registering routes
  // since bufferCommands: false is set for key models
  await storage.connect();

  // P2 SECURITY: Register OAuth 2.0 authentication routes BEFORE other routes
  // This ensures OAuth endpoints take precedence over v1 routes at the same path
  app.use('/api/auth', authRoutes);

  await registerRoutes(app, storage as any, httpServer, upload);

  // Initialize leader election for Instagram polling AFTER routes are registered
  // Use setTimeout to ensure the event loop has processed all pending connections
  setTimeout(async () => {
    try {
      console.log('[STARTUP] Initiating leader election for Instagram polling...');
      console.log(`[STARTUP] MongoDB connection state: ${mongoose.connection.readyState}`);

      // Wait for MongoDB to be fully connected if not already
      if (mongoose.connection.readyState !== 1) {
        console.log('[STARTUP] Waiting for MongoDB connection...');
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error('MongoDB connection timeout after 30s'));
          }, 30000);

          if (mongoose.connection.readyState === 1) {
            clearTimeout(timeout);
            resolve();
          } else {
            mongoose.connection.once('connected', () => {
              clearTimeout(timeout);
              resolve();
            });
            mongoose.connection.once('error', (err) => {
              clearTimeout(timeout);
              reject(err);
            });
          }
        });
      }

      console.log('[STARTUP] MongoDB connected - starting leader election...');
      await initializeLeaderElection(storage as any);
      console.log('[STARTUP] Leader election completed successfully');
    } catch (error) {
      console.error('[STARTUP] Leader election initialization failed:', error);
    }
  }, 1000);

  // Register metrics and webhook routes
  app.use('/api', metricsRoutes);
  app.use('/api/webhooks', webhooksRoutes);

  // P8 SECURITY: Register advanced security and threat intelligence routes
  app.use('/api/security', securityRoutes);
  if (!(process.env.NODE_ENV === 'production' && process.env.ENABLE_TEST_FIXTURES !== 'true')) {
    app.use('/api/testing', testingRoutes);
  }
  app.use('/api/cicd', cicdRoutes);
  app.use('/api/production', productionRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/social-listening', socialListeningRoutes);
  app.use('/api/admin/monitoring', adminMonitoringRoutes);

  // P9 INFRASTRUCTURE: Enterprise health check endpoints
  app.use('/health', healthRoutes);
  app.use('/', healthRoutes); // Also available at root for load balancers

  // Additional webhook route to match Meta Console configuration
  app.use('/webhook', webhooksRoutes);

  // FIREBASE SDK CONFIG PROBE
  // Firebase SDK probes this URL when it starts. Since we use explicit config, 
  // we return a silent 404 to prevent it from triggering the security logger's 404 warnings.
  app.get('/__/firebase/init.json', (req, res) => {
    res.status(404).end();
  });

  // REMOVED: Firebase Auth Proxy middleware
  // Reason: Proxy middleware was designed for popup-based OAuth (iframe mode) but is incompatible 
  // with redirect-based OAuth flows used by signInWithRedirect(). The proxy caused Content Security 
  // Policy violations and blank pages because it attempted to serve OAuth responses in an iframe 
  // context, which browsers block as a security violation.
  //
  // Fix: OAuth now communicates directly with Firebase's authDomain (veefore-b84c8.firebaseapp.com)
  // without any proxy middleware interference, allowing the full-page redirect flow to complete 
  // successfully: App → Google OAuth → Firebase authDomain → App with credential.
  //
  // Preservation: Non-OAuth API requests to Railway backend continue to process normally.
  // This change only affects the /__/auth/* route handling for Firebase OAuth flows.

  // P2-FIX: Legacy Instagram OAuth Callback Redirect
  // Ensures existing .env configurations (pointing to /api/instagram/callback) still work
  app.get('/api/instagram/callback', (req: Request, res: Response) => {
    console.log('🔄 [LEGACY REDIRECT] Forwarding /api/instagram/callback to /api/v1/social-auth/instagram/callback');
    const queryString = new URLSearchParams(req.query as any).toString();
    res.redirect(`/api/v1/social-auth/instagram/callback?${queryString}`);
  });

  const enableMetrics = process.env.ENABLE_PROMETHEUS_METRICS !== 'false';
  if (enableMetrics) {
    createMonitoringEndpoints(app);
  }

  // P5 PERFORMANCE: Create performance monitoring endpoints
  createPerformanceEndpoints(app);

  // P5 PERFORMANCE: Apply cached routes optimization
  applyCachedRoutes(app);

  // P5 PERFORMANCE: Run startup optimizations
  await performStartupOptimizations();

  // INFRASTRUCTURE: Initialize Queues & Workers
  try {
    const { initQueues } = await import('./lib/queue');
    const { initEmailWorker } = await import('./workers/email.worker');
    const { getRedisClient, getRateLimitRedisClient } = await import('./lib/redis');
    const { AutomationWorker } = await import('./workers/automationWorker');
    const { MessageWorker } = await import('./workers/messageWorker');
    const { PostWorker } = await import('./workers/postWorker');
    const { VerifyWorker } = await import('./workers/verifyWorker');
    
    // Lazy workers - imported but NOT started on boot (Task 5.6: Redis Optimization)
    // These workers will lazy-initialize on first job:
    // - startSocialListeningWorker (social-listening.worker.ts)
    // - startSocialListeningAIWorker (social-listening-ai.worker.ts)
    // - startWebhookWorker (webhookWorker.ts)
    // - startAIWorker (aiWorker.ts)
    // - startNotificationWorker (notificationWorker.ts)


    // Connect to Redis (Standard client for queues)
    const redis = getRedisClient();

    // Connect to Redis (Fail-fast client for rate limiting)
    const rateLimitRedis = getRateLimitRedisClient();

    // Initialize systems - ACTIVE WORKERS ONLY
    initQueues();
    initEmailWorker();
    AutomationWorker.start(storage);
    MessageWorker.start(storage);
    PostWorker.start(storage);
    VerifyWorker.start(storage);
    
    // REMOVED: Eager worker starts (Task 5.6: Redis Optimization)
    // startSocialListeningWorker();      // Now lazy: getSocialListeningWorker() called on first job
    // startSocialListeningAIWorker();    // Now lazy: getSocialListeningAIWorker() called on first job
    // startWebhookWorker();              // Now lazy: getWebhookWorker() called on first job
    // startAIWorker();                   // Now lazy: getAIWorker() called on first job
    // startNotificationWorker();         // Now lazy: getNotificationWorker() called on first job
    
    initializeRateLimiting(rateLimitRedis); // Connect rate limiter to fail-fast client

    // P2 SECURITY: Initialize OAuth rate limiting with Redis
    const { initializeOAuthRateLimiting } = await import('./middleware/oauthSecurity');
    initializeOAuthRateLimiting(rateLimitRedis);

    // Fix 5 (Bug 1.10, 1.11): Initialize per-user refresh rate limiter with Redis
    const { initializeRefreshRateLimiter } = await import('./services/oauth/RefreshRateLimiter');
    initializeRefreshRateLimiter(rateLimitRedis);
    console.log('[OAUTH] Per-user refresh rate limiting initialized with Redis backing');

    console.log('[INFRA] Active workers initialized. Unused workers (AI, Notification, SocialListening, Webhook) will lazy-initialize on first job.');
  } catch (error) {
    console.warn('[INFRA] Failed to initialize workers (Redis might be missing):', (error as Error).message);
  }

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const id = req.correlationId || '';
    const status = err?.status || 500;
    const message = status === 500 ? 'Internal server error' : (err?.message || 'Error');
    res.status(status).json({ error: message, correlationId: id });
  });

  // Instagram account management routes
  app.post('/api/instagram/cleanup-duplicates', async (req: Request, res: Response) => {
    try {
      // Instagram account management handled by existing storage layer
      console.log('[CLEANUP] Starting Instagram account cleanup...');
      // Use existing storage methods for cleanup
      const result = { totalRemoved: 0, cleanedAccounts: [] };

      res.json({
        success: true,
        message: `Cleaned up ${result.totalRemoved} duplicate accounts`,
        cleanedAccounts: result.cleanedAccounts,
        totalRemoved: result.totalRemoved
      });
    } catch (error: any) {
      console.error('[CLEANUP] Error during cleanup:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup duplicate accounts',
        error: error.message
      });
    }
  });

  app.post('/api/instagram/ensure-account', validateRequest({ body: z.object({ instagramAccountId: z.string().min(1), instagramUsername: z.string().min(1), workspaceId: z.string().min(1) }) }), async (req: Request, res: Response) => {
    try {
      const { instagramAccountId, instagramUsername, workspaceId } = req.body;

      if (!instagramAccountId || !instagramUsername || !workspaceId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: instagramAccountId, instagramUsername, workspaceId'
        });
      }

      // Instagram account management handled by existing storage
      const result = {
        success: true,
        action: 'skipped',
        message: 'Account management handled by existing storage layer'
      };

      res.json(result);
    } catch (error: any) {
      console.error('[ENSURE ACCOUNT] Error:', error);
      res.status(500).json({
        success: false,
        action: 'failed',
        message: error.message
      });
    }
  });

  app.get('/api/instagram/token-status/:accountId', async (req: Request, res: Response) => {
    try {
      const accountId = req.params.accountId;
      const { SocialAccountModel } = await import('./models/Social');
      let raw: any = await SocialAccountModel.findById(accountId);
      if (!raw) raw = await SocialAccountModel.findOne({ id: accountId });
      if (!raw) return res.status(404).json({ status: 'missing', message: 'Account not found' });
      const fetchMod = await import('node-fetch');
      const fetch = (fetchMod as any).default || (fetchMod as any);
      let token = raw.accessToken;
      if (!token && raw.encryptedAccessToken) {
        try {
          const { tokenEncryption } = await import('./security/token-encryption');
          token = tokenEncryption.decryptToken(raw.encryptedAccessToken);
        } catch { }
      }
      if (!token) {
        await SocialAccountModel.findByIdAndUpdate(raw._id, { $set: { tokenStatus: 'missing' } });
        return res.json({ status: 'missing' });
      }
      let valid = false;
      try {
        const r = await fetch(`https://graph.instagram.com/me?fields=id&access_token=${token}`);
        valid = r.ok;
      } catch { }
      const expired = raw.expiresAt ? (new Date(raw.expiresAt).getTime() < Date.now()) : false;
      const status = !valid ? (expired ? 'expired' : 'invalid') : 'valid';
      await SocialAccountModel.findByIdAndUpdate(raw._id, { $set: { tokenStatus: status } });
      return res.json({ status, expiresAt: raw.expiresAt || null });
    } catch (e: any) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  });

  app.post('/api/instagram/disconnect', validateRequest({ body: z.object({ accountId: z.string().optional(), workspaceId: workspaceIdSchema.shape.workspaceId.optional() }).refine(d => !!d.accountId || !!d.workspaceId, { message: 'accountId or workspaceId is required' }) }), async (req: Request, res: Response) => {
    try {
      const { accountId, workspaceId } = req.body || {};
      const { SocialAccountModel } = await import('./models/Social');
      let raw: any = null;
      if (accountId) {
        raw = await SocialAccountModel.findById(accountId);
        if (!raw) raw = await SocialAccountModel.findOne({ id: accountId });
      } else if (workspaceId) {
        raw = await SocialAccountModel.findOne({ workspaceId, platform: 'instagram' });
      }
      if (!raw) return res.status(404).json({ success: false, message: 'Account not found' });
      await SocialAccountModel.findByIdAndUpdate(raw._id, {
        $set: {
          accessToken: null,
          refreshToken: null,
          encryptedAccessToken: null,
          encryptedRefreshToken: null,
          tokenStatus: 'expired',
          updatedAt: new Date()
        }
      });
      return res.json({ success: true });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  });

  app.post('/api/instagram/reconnect/start', validateRequest({
    body: workspaceIdSchema.extend({
      flow: z.enum(['standard', 'advanced']).optional()
    })
  }), async (req: Request, res: Response) => {
    try {
      const { workspaceId, flow } = req.body || {};
      if (!workspaceId) return res.status(400).json({ error: 'workspaceId required' });
      // Cleanup first
      await import('./index'); // no-op reference to ensure module context
      const { SocialAccountModel } = await import('./models/Social');
      const ig = await SocialAccountModel.findOne({ workspaceId, platform: 'instagram' });
      if (ig) {
        await SocialAccountModel.findByIdAndUpdate(ig._id, {
          $set: {
            accessToken: null,
            refreshToken: null,
            encryptedAccessToken: null,
            encryptedRefreshToken: null,
            tokenStatus: 'expired',
            updatedAt: new Date()
          }
        });
      }
      const { InstagramOAuthService } = await import('./instagram-oauth');
      const storage = new (await import('./mongodb-storage')).MongoStorage();
      await storage.connect();
      const oauth = new InstagramOAuthService(storage as any);

      // Unified Flow: Always use the advanced (Facebook Login) flow for Instagram 
      // to ensure demographic insights and DM capabilities are available for all accounts
      const url = oauth.getAdvancedAuthUrl(String(workspaceId));

      return res.json({ url });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  app.post('/api/instagram/force-sync', validateRequest({
    body: z.object({
      workspaceId: z.string().min(1, 'Workspace ID is required')
    })
  }), async (req: Request, res: Response) => {
    try {
      const { workspaceId } = req.body;
      const storage = new (await import('./mongodb-storage')).MongoStorage();
      await storage.connect();
      
      const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
      const instagramAccount = accounts.find(acc => acc.platform === 'instagram');
      
      let queued = false;
      if (instagramAccount && instagramAccount.accountId) {
        const { MetricsQueueManager } = await import('./queues/metricsQueue');
        await MetricsQueueManager.scheduleMetricsFetch(
          workspaceId,
          'system',
          instagramAccount.accountId,
          (instagramAccount as any).accessToken || '',
          'all',
          { priority: 5, forceRefresh: true }
        );
        queued = true;
      }
      
      return res.json({ success: true, message: queued ? 'Sync queued successfully' : 'No valid Instagram account found' });
    } catch (error: any) {
      console.error('🚨 [FORCE-SYNC] Error forcing sync:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/instagram/profile-picture/:accountId', async (req: Request, res: Response) => {
    try {
      const accountId = req.params.accountId;
      const { SocialAccountModel } = await import('./models/Social');
      let raw: any = await SocialAccountModel.findById(accountId);
      if (!raw) raw = await SocialAccountModel.findOne({ id: accountId });
      if (!raw) return res.status(404).json({ error: 'Account not found' });
      let pic = raw.profilePictureUrl || raw.profilePicture || '';
      let token = raw.accessToken;
      if (!token && raw.encryptedAccessToken) {
        try {
          const { tokenEncryption } = await import('./security/token-encryption');
          token = tokenEncryption.decryptToken(raw.encryptedAccessToken);
        } catch { }
      }
      const fetchMod = await import('node-fetch');
      const fetch = (fetchMod as any).default || (fetchMod as any);
      let refreshed = false;
      if (!pic || (typeof pic === 'string' && pic.includes('dicebear.com'))) {
        if (token) {
          const r = await fetch(`https://graph.instagram.com/me?fields=profile_picture_url&access_token=${token}`);
          if (r.ok) {
            const j = await r.json();
            if (j.profile_picture_url) { pic = j.profile_picture_url; refreshed = true; }
          }
        }
      }
      let imgResp: any = null;
      if (pic) {
        try { imgResp = await fetch(pic); } catch { }
      }
      if ((!imgResp || !imgResp.ok) && token) {
        const r = await fetch(`https://graph.instagram.com/me?fields=profile_picture_url&access_token=${token}`);
        if (r.ok) {
          const j = await r.json();
          if (j.profile_picture_url) { pic = j.profile_picture_url; refreshed = true; imgResp = await fetch(pic); }
        }
      }
      if (refreshed) {
        await SocialAccountModel.findByIdAndUpdate(raw._id, { $set: { profilePictureUrl: pic, updatedAt: new Date() } });
      }
      if (imgResp && imgResp.ok) {
        const ct = imgResp.headers.get('content-type') || 'image/jpeg';
        const buf = await imgResp.arrayBuffer();
        res.setHeader('Content-Type', ct);
        return res.send(Buffer.from(buf));
      }
      return res.redirect(`https://api.dicebear.com/7.x/avataaars/svg?seed=${raw.username}`);
    } catch {
      return res.redirect(`https://api.dicebear.com/7.x/avataaars/svg?seed=fallback`);
    }
  });

  app.get('/public/instagram/profile-picture/:accountId', async (req: Request, res: Response) => {
    try {
      const accountId = req.params.accountId;
      const { SocialAccountModel } = await import('./models/Social');
      let raw: any = await SocialAccountModel.findById(accountId);
      if (!raw) raw = await SocialAccountModel.findOne({ id: accountId });
      if (!raw) return res.status(404).send('Not Found');
      let pic = raw.profilePictureUrl || raw.profilePicture || '';
      let token = raw.accessToken;
      if (!token && raw.encryptedAccessToken) {
        try {
          const { tokenEncryption } = await import('./security/token-encryption');
          token = tokenEncryption.decryptToken(raw.encryptedAccessToken);
        } catch { }
      }
      const fetchMod = await import('node-fetch');
      const fetch = (fetchMod as any).default || (fetchMod as any);
      let refreshed = false;
      let imgResp: any = null;
      const tryRefresh = async () => {
        if (!token) return false;
        // Attempt via /me
        let r = await fetch(`https://graph.instagram.com/me?fields=profile_picture_url&access_token=${token}`);
        if (r.ok) {
          const j = await r.json();
          if (j.profile_picture_url) {
            pic = j.profile_picture_url; refreshed = true;
            await SocialAccountModel.findByIdAndUpdate(raw._id, { $set: { profilePictureUrl: pic, updatedAt: new Date() } });
            return true;
          }
        }
        // Fallback via account id
        r = await fetch(`https://graph.instagram.com/${raw.accountId}?fields=profile_picture_url&access_token=${token}`);
        if (r.ok) {
          const j = await r.json();
          if (j.profile_picture_url) {
            pic = j.profile_picture_url; refreshed = true;
            await SocialAccountModel.findByIdAndUpdate(raw._id, { $set: { profilePictureUrl: pic, updatedAt: new Date() } });
            return true;
          }
        }
        return false;
      };
      if (pic) {
        try { imgResp = await fetch(pic); } catch { }
      }
      if (!imgResp || !imgResp.ok) {
        await tryRefresh();
        if (pic) {
          try { imgResp = await fetch(pic); } catch { }
        }
      }
      if (imgResp && imgResp.ok) {
        const ct = imgResp.headers.get('content-type') || 'image/jpeg';
        const buf = await imgResp.arrayBuffer();
        res.setHeader('Cache-Control', 'private, max-age=3600');
        res.setHeader('Content-Type', ct);
        return res.send(Buffer.from(buf));
      }
      return res.redirect(`https://api.dicebear.com/7.x/avataaars/svg?seed=${raw.username}`);
    } catch {
      return res.redirect(`https://api.dicebear.com/7.x/avataaars/svg?seed=fallback`);
    }
  });

  // Instagram polling status endpoint - returns smart polling status for accounts
  // Secured: Requires authentication AND workspace ownership validation
  app.get('/api/instagram/polling-status', requireAuth, validateWorkspaceAccess({ source: 'query' }), async (req: Request, res: Response) => {
    try {
      // SECURITY: workspaceId is validated by middleware - user has verified access
      const workspaceId = req.workspaceId!;

      const { SocialAccountModel } = await import('./models/Social');
      
      // 1. Fetch real BullMQ repeatable jobs to get EXACT timer truths
      let repeatableJobs: any[] = [];
      try {
         const { metricsQueue } = await import('./queues/metricsQueue');
         if (metricsQueue) {
             repeatableJobs = await metricsQueue.getRepeatableJobs();
         }
      } catch (err) {
         console.error('Failed to get repeatable jobs for status UI', err);
      }

      // SECURITY: Only query accounts for the validated workspace
      const accounts = await SocialAccountModel.find({
        platform: 'instagram',
        workspaceId: workspaceId
      }).lean();

      // Build polling status response - only expose non-sensitive data
      const accountStatuses = accounts.map((acc: any) => {
        const hasValidToken = !!(acc.accessToken || acc.encryptedAccessToken);
        const lastSync = acc.lastSyncAt || acc.updatedAt;
        const accId = acc._id?.toString() || acc.id;
        
        const getExactNextPollIn = (metricType: string, fallbackIntervalMins: number) => {
             if (!hasValidToken) return 0;
             
             // Look for the absolute truth timer inside the BullMQ engine
             // Due to historical inconsistencies, jobs might be scheduled with EITHER the Meta ID or the MongoDB _id.
             const metaAccountId = acc.instagramAccountId || acc.accountId;
             const mongoId = acc._id?.toString() || acc.id;
             const expectedKeyMeta = `smart-poll-${workspaceId}-${metaAccountId}-${metricType}`;
             const expectedKeyMongo = `smart-poll-${workspaceId}-${mongoId}-${metricType}`;
             const job = repeatableJobs.find((j: any) => 
               (j.key && (j.key.includes(expectedKeyMeta) || j.key.includes(expectedKeyMongo))) || 
               j.name === expectedKeyMeta || j.name === expectedKeyMongo
             );
             
             if (job && job.next) {
                 // Return the exact millisecond difference from right now!
                 return Math.max(0, job.next - Date.now());
             }
             
             // Mathematical fallback if the job hasn't been injected into Redis yet
             if (!lastSync) return fallbackIntervalMins * 60 * 1000;
             const intervalMs = fallbackIntervalMins * 60 * 1000;
             const timeSinceSync = Date.now() - new Date(lastSync).getTime();
             return Math.max(0, intervalMs - (timeSinceSync % intervalMs));
        };

        const nextPollAll = getExactNextPollIn('all', 80);

        return {
          id: accId,
          username: acc.username,
          isActive: hasValidToken,
          lastSync: lastSync,
          nextPollIn: nextPollAll, // Backward compatibility
          metricsPollIn: {
             likes: nextPollAll, 
             shares: nextPollAll,
             saves: nextPollAll,
             reach: nextPollAll,
             views: nextPollAll,
             profile_views: nextPollAll,
             stories: nextPollAll
          },
          tokenStatus: acc.tokenStatus || (hasValidToken ? 'valid' : 'missing')
        };
      });

      res.json({
        success: true,
        totalAccounts: accountStatuses.length,
        activePolling: accountStatuses.filter(a => a.isActive).length,
        accounts: accountStatuses
      });
    } catch (error: any) {
      console.error('[POLLING STATUS] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get polling status'
      });
    }
  });

  // Instagram start-polling endpoint - triggers smart polling for accounts
  app.post('/api/instagram/start-polling', requireAuth, validateWorkspaceAccess({ source: 'body' }), async (req: Request, res: Response) => {
    try {
      const { workspaceId } = req.body;
      const { SocialAccountModel } = await import('./models/Social/SocialAccount');
      
      const accounts = await SocialAccountModel.find({ 
        workspaceId, 
        platform: 'instagram' 
      });

      const activeAccounts = accounts.filter(acc => 
        !!(acc.accessToken || acc.encryptedAccessToken)
      );

      console.log(`[START POLLING] Workspace ${workspaceId}: ${activeAccounts.length}/${accounts.length} accounts have valid tokens`);

      // NOTE: We intentionally no longer trigger an immediate sync here because 
      // the frontend (especially older cached bundles) may hit this on component mount,
      // which bypasses smart polling timers and triggers an immediate followers update.
      // MetricsWorker already handles the background schedule automatically.

      res.json({
        success: true,
        message: 'Polling system activated and sync triggered',
        activeAccounts: activeAccounts.length,
        totalAccounts: accounts.length,
        pollingStarted: activeAccounts.length > 0
      });
    } catch (error: any) {
      console.error('[START POLLING] Error:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to start polling'
      });
    }
  });

  // Dashboard analytics endpoint - returns aggregated social account metrics
  // Secured: Requires authentication AND workspace ownership validation
  app.get('/api/dashboard/analytics', requireAuth, validateWorkspaceAccess({ source: 'query' }), async (req: Request, res: Response) => {
    const workspaceId = req.workspaceId!;
    const logPath = path.join(process.cwd(), 'debug-trace.log');
    const traceLog = (msg: string) => console.log(`[DASHBOARD] ${msg}`);
    
    traceLog(`Request for workspace: ${workspaceId}`);
    
    try {
      const { storage } = await import('./mongodb-storage');
      const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
      
      traceLog(`Found ${accounts.length} social accounts`);

      // Aggregate metrics
      let totalFollowers = 0;
      let totalLikes = 0;
      let totalComments = 0;
      let totalViews = 0;
      let totalReach = 0;
      let totalPosts = 0;
      let totalEngagement = 0;
      let accountCount = 0;

      for (const acc of accounts) {
        if (acc.platform === 'instagram') {
          totalFollowers += (acc as any).followersCount || 0;
          totalLikes += (acc as any).totalLikes || 0;
          totalComments += (acc as any).totalComments || 0;
          totalViews += (acc as any).totalViews || 0;
          totalReach += (acc as any).totalReach || 0;
          totalPosts += (acc as any).mediaCount || (acc as any).posts || 0;
          totalEngagement += (acc as any).engagementRate || (acc as any).avgEngagement || 0;
          accountCount++;
        }
      }

      const avgEngagement = accountCount > 0 ? totalEngagement / accountCount : 0;
      
      const result = {
        totalFollowers,
        totalLikes,
        totalComments,
        totalViews,
        totalReach,
        totalPosts,
        avgEngagement: Math.round(avgEngagement * 100) / 100,
        accountCount,
        lastUpdated: new Date().toISOString()
      };

      traceLog(`Success: ${JSON.stringify(result)}`);
      res.json({ success: true, data: result });
    } catch (error: any) {
      traceLog(`Error: ${error.message}`);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get dashboard analytics'
      });
    }
  });

  // Cache-bust endpoint: clears historical analytics cache so fresh data is served
  app.post('/api/admin/clear-analytics-cache', requireAuth, async (req: Request, res: Response) => {
    try {
      const { CachingSystem } = await import('./performance/caching-system');
      const deleted = await CachingSystem.invalidateByTag('historical');
      const deleted2 = await CachingSystem.invalidateByTag('dashboard');
      Logger.info('ADMIN', `Cleared analytics cache: ${deleted + deleted2} entries`);
      res.json({ success: true, cleared: deleted + deleted2 });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });


  const { WebSocketServer } = await import('ws');

  // Initialize logger for metrics system
  Logger.configure({
    logLevel: process.env.NODE_ENV === 'production' ? 1 : 3, // WARN in prod, DEBUG in dev
    enableConsole: true,
    enableFile: true,
    includeWorkspaceInLogs: true,
  });

  // Temporarily disabled for MVP
  // Enable MetricsWorker and RealtimeService for comprehensive testing
  try {
    RealtimeService.initialize(httpServer);
    console.log('✅ RealtimeService initialized for workspace metrics updates');
  } catch (error) {
    console.error('⚠️ RealtimeService failed to initialize:', error);
  }

  // Test Redis connection and start MetricsWorker if available
  console.log('🔍 Testing Redis connection for advanced queue system...');
  try {
    // P1-3 SECURITY: Initialize rate limiting with Redis connection
    const { redisConnection, isRedisAvailable } = await import('./queues/metricsQueue');

    if (redisConnection && isRedisAvailable()) {
      initializeRateLimiting(redisConnection);
      console.log('🔒 P1-3 SECURITY: Rate limiting system initialized with Redis persistence');
    } else {
      console.log('⚠️ Rate Limiting: Redis not available, using memory-based fallbacks');
    }

    // ENABLED: Phase 4 BullMQ Migration
    await MetricsWorker.start();
    console.log('✅  MetricsWorker: Started successfully for Phase 4 Background Job processing');
    console.log('📊 Instagram metrics continue via existing smart polling system');
  } catch (error) {
    console.log('⚠️  MetricsWorker startup failed:', error);
    console.log('⚠️  MetricsWorker: Redis unavailable, using smart polling fallback');
    console.log('📊 Instagram metrics continue via existing polling system');
    console.log('⚠️ Rate Limiting: Using memory-based fallbacks without Redis persistence');
  }



  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Add health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptime: process.uptime(),
      version: '1.0.0',
      services: {
        database: 'connected',
        server: 'running'
      }
    });
  });

  // CRITICAL FIX: Let Vite handle ALL /src requests - no static file interference
  // Remove static serving that interferes with Vite's module resolution

  // Serve only specific static assets from client public directory
  app.use('/favicon.ico', express.static(path.join(process.cwd(), 'client/public/favicon.ico')));

  // Handle manifest.json with proper content type and caching
  app.get('/manifest.json', (req, res) => {
    const manifestPath = path.join(process.cwd(), 'client/public/manifest.json');

    try {
      if (fs.existsSync(manifestPath)) {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
        res.sendFile(manifestPath);
      } else {
        // Return a basic manifest if file doesn't exist
        res.setHeader('Content-Type', 'application/manifest+json');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
        res.json({
          "name": "VeeFore",
          "short_name": "VeeFore",
          "description": "Professional Social Media Management",
          "start_url": "/",
          "display": "standalone",
          "background_color": "#f9fafb",
          "theme_color": "#2563eb",
          "icons": [
            {
              "src": "/favicon.ico",
              "sizes": "32x32",
              "type": "image/x-icon"
            }
          ]
        });
      }
    } catch (error) {
      console.error('[MANIFEST] Error serving manifest.json:', error);
      res.status(500).json({ error: 'Failed to load manifest' });
    }
  });

  app.use('/browserconfig.xml', express.static(path.join(process.cwd(), 'client/public/browserconfig.xml')));

  // NOTE: /assets static serving is now handled BEFORE CORS middleware (see line ~180)
  // This prevents 403 blocks from CORS checks on static files

  // Setup Vite in development and static serving in production
  // Split-dev option: when SPLIT_DEV=1, do NOT embed Vite; run client dev on 5173
  if ((app.get("env") === "development" || !isProduction) && process.env.SPLIT_DEV !== '1') {
    // Temporarily disable REPL_ID to prevent cartographer plugin from loading
    const originalReplId = process.env.REPL_ID;
    delete process.env.REPL_ID;

    try {
      if (setupVite) {
        await setupVite(app, httpServer);
        console.log('[DEBUG] Vite setup completed successfully - serving React application');
      } else {
        throw new Error('setupVite not available');
      }
    } catch (error) {
      console.error('[DEBUG] Vite setup failed:', error);
      console.log('[DEBUG] Falling back to static file serving');
      // Custom static serving as fallback
      const distPath = path.join(process.cwd(), 'dist/public');
      app.use(express.static(distPath));

      // Handle root route specifically to avoid path-to-regexp issues  
      app.get('/', (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });

      // Handle common frontend routes
      app.get('/dashboard', (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });

      app.get('/login', (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });

      app.get('/signup', (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    } finally {
      // Restore REPL_ID
      if (originalReplId) {
        process.env.REPL_ID = originalReplId;
      }
    }
  } else {
    // Production mode - Railway backend is API-only, Vercel serves frontend
    const isBackendOnly = process.env.BACKEND_ONLY === 'true' || process.env.RAILWAY_ENVIRONMENT !== undefined;
    
    if (isBackendOnly) {
      console.log('[PRODUCTION] Running as backend-only server (Railway)');
      console.log('[PRODUCTION] Static assets are served by Vercel at veefore.com');
      console.log('[PRODUCTION] This instance serves API endpoints only');
      
      // For backend-only mode, just handle 404s for non-API routes
      app.get('*', (req, res, next) => {
        // API routes are already handled by registered routes
        if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/health') || req.path.startsWith('/webhook')) {
          return next();
        }
        
        // All other routes return info about the API
        res.status(200).json({
          name: 'VeeFore API',
          version: '1.0.0',
          environment: 'production',
          message: 'Backend API server - Frontend is at https://veefore.com',
          health: '/api/health',
          docs: '/api/docs'
        });
      });
    } else {
      // Production mode with static file serving (for single-server deployments)
      try {
        if (serveStatic) {
          serveStatic(app);
          console.log('[PRODUCTION] Static file serving enabled');
        } else {
          throw new Error('serveStatic not available');
        }
      } catch (error) {
        console.error('[PRODUCTION] Static serving failed, using fallback:', error);

        // Enhanced fallback static serving for production
        const possiblePaths = [
          path.join(process.cwd(), 'dist/public'),
          path.join(process.cwd(), 'client/dist'),
          path.join(process.cwd(), 'public'),
          path.join(process.cwd(), 'build')
        ];

        let staticPath: string | null = null;

        for (const possiblePath of possiblePaths) {
        if (fs.existsSync(possiblePath)) {
          staticPath = possiblePath;
          break;
        }
      }

      if (staticPath) {
        console.log('[PRODUCTION] Serving static files from:', staticPath);

        // Serve static files with caching
        app.use(express.static(staticPath, {
          maxAge: '1y',
          etag: true,
          lastModified: true
        }));
        // NOTE: JS/CSS caching is handled by Vite's content hashing (e.g., chunk-abc123.js).
        // When code changes, the hash changes, automatically invalidating the old cache.
        // index.html is set to no-cache below to ensure users get updated script references.

        // Handle SPA routes - serve index.html for all non-API routes
        app.get('*', (req, res, next) => {
          // Skip API routes, source files, and uploaded files
          if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/src') || req.path.startsWith('/node_modules') || req.path.startsWith('/@')) {
            return next();
          }

          const indexPath = path.join(staticPath, 'index.html');
          if (fs.existsSync(indexPath)) {
            try { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Pragma', 'no-cache'); res.setHeader('Expires', '0') } catch { }
            res.sendFile(indexPath);
          } else {
            res.status(404).json({ error: 'Application not found' });
          }
        });

        console.log('[PRODUCTION] Fallback static serving enabled');
      } else {
        console.error('[PRODUCTION] Build directory not found in any location');
        console.error('[PRODUCTION] Searched paths:', possiblePaths);

        app.get('*', (req, res) => {
          if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads') && !req.path.startsWith('/src') && !req.path.startsWith('/node_modules') && !req.path.startsWith('/@')) {
            res.status(503).json({
              error: 'Application not built for production',
              message: 'Please run build command first',
              searchedPaths: possiblePaths
            });
          } else {
            res.status(404).json({ error: 'Not found' });
          }
        });
      }
    }
    }
  }

  const wss = new WebSocketServer({ server: httpServer });

  // Add global error handler for WebSocket server
  wss.on('error', (error) => {
    console.error('[WebSocket Server] Error:', error.message);
    // Don't crash the server, just log the error
  });

  // Store WebSocket connections by conversation ID
  const wsConnections = new Map<number, Set<any>>();

  // Store buffered messages for conversations without active connections
  const messageBuffer = new Map<number, any[]>();

  // Helper function to safely send WebSocket messages
  const safeSend = (ws: any, message: any) => {
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error('[WebSocket] Send error:', error);
    }
  };

  wss.on('connection', (ws, req) => {
    console.log('[WebSocket] New client connected for chat streaming');

    // Add error handling to prevent crashes
    ws.on('error', (error) => {
      console.error('[WebSocket] Connection error:', error.message);
      // Don't crash the server, just log the error
    });

    ws.on('close', (code, reason) => {
      console.log(`[WebSocket] Client disconnected: ${code} ${reason}`);
      // Clean up connections
      for (const [convId, connections] of wsConnections.entries()) {
        if (connections.has(ws)) {
          connections.delete(ws);
          if (connections.size === 0) {
            wsConnections.delete(convId);
          }
        }
      }
    });

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log('[WebSocket] Received:', data);

        if (data.type === 'subscribe' && data.conversationId) {
          const convId = parseInt(data.conversationId);
          if (!wsConnections.has(convId)) {
            wsConnections.set(convId, new Set());
          }
          wsConnections.get(convId)!.add(ws);
          console.log(`[WebSocket] Client subscribed to conversation ${convId}`);

          // Send subscription confirmation
          safeSend(ws, { type: 'subscribed', conversationId: convId });

          // Send any buffered messages immediately
          const buffered = messageBuffer.get(convId);
          if (buffered && buffered.length > 0) {
            console.log(`[WebSocket] Sending ${buffered.length} buffered messages to new client`);
            buffered.forEach(message => {
              safeSend(ws, message);
            });
            // Clear buffer after sending
            messageBuffer.delete(convId);
          }
        }
      } catch (error) {
        console.error('[WebSocket] Parse error:', error);
      }
    });

    ws.on('close', () => {
      // Remove from all conversations
      for (const [, connections] of wsConnections) {
        connections.delete(ws);
      }
      console.log('[WebSocket] Client disconnected');
    });
  });

  // Function to broadcast to all clients in a conversation
  (global as any).broadcastToConversation = (conversationId: number, data: any) => {
    const connections = wsConnections.get(conversationId);
    console.log(`[WebSocket] Broadcasting to conversation ${conversationId}, connections: ${connections?.size || 0}`);

    if (connections && connections.size > 0) {
      connections.forEach(ws => {
        if (ws.readyState === 1) { // WebSocket.OPEN
          safeSend(ws, data);
          console.log(`[WebSocket] Sent ${data.type} to client for conversation ${conversationId}`);
        } else {
          console.log(`[WebSocket] Removing closed connection for conversation ${conversationId}`);
          connections.delete(ws);
        }
      });
    } else {
      // Buffer the message for when client connects
      if (data.type === 'status') {
        if (!messageBuffer.has(conversationId)) {
          messageBuffer.set(conversationId, []);
        }
        messageBuffer.get(conversationId)!.push(data);
        console.log(`[WebSocket] Buffered ${data.type} message for conversation ${conversationId}`);
      } else {
        console.log(`[WebSocket] No active connections for conversation ${conversationId}`);
        console.log(`[WebSocket] Active conversations:`, Array.from(wsConnections.keys()));
      }
    }
  };

  // Use environment port or default to 5000
  const port = parseInt(process.env.PORT || '5000', 10);

  // P9 INFRASTRUCTURE: Enterprise graceful shutdown system
  let gracefulShutdownHandler: any = null;

  // Add error handling for HTTP server
  httpServer.on('error', (err) => {
    logger.fatal('HTTP Server Error', err, { component: 'HTTPServer' });
    process.exit(1);
  });

  // Use HTTP server with WebSocket support instead of Express server directly
  // Bind to all interfaces for Replit external access
  logger.startup('HTTPServer', 'starting', { port });
  // Listen on IPv6 to accept both IPv4 and IPv6 loopback (fixes cloudflared ::1 origin)
  httpServer.listen(port, "0.0.0.0", async () => {
    logger.startup('HTTPServer', 'ready', {
      port,
      externalUrl: `https://${process.env.REPL_SLUG || 'app'}.${process.env.REPL_OWNER || 'user'}.repl.co`
    });
    log(`serving on port ${port} with WebSocket support`);
    Logger.info('Server', '🚀 [P2-TRACE] Server starting with Token Crash Fixes (Session: 2026-02-08-LOG)');
    Logger.info('Server', `Instagram metrics system initialized and ready`);

    // P9 INFRASTRUCTURE: Initialize graceful shutdown after server starts
    gracefulShutdownHandler = initializeGracefulShutdown(httpServer, {
      timeout: 30000,
      logger: (message: string) => {
        console.log(message);
        Logger.info('GracefulShutdown', message);
      }
    });

    console.log('🔄 P9: Graceful shutdown system initialized');

    // SOCIAL LISTENING: Trend Engine is now securely managed via BullMQ in MetricsQueueManager


    // P2-2 SECURITY: Initialize token encryption AFTER server starts
    try {
      await initializeTokenEncryption();
      scheduleTokenReEncryption();
    } catch (error) {
      console.error('⚠️ P2-2: Token encryption initialization failed:', error);
    }
  });
})().catch((error) => {
  logger.fatal('Server startup failed', error, { component: 'startup' });
  console.error('Stack trace:', error.stack);
  process.exit(1);
});
