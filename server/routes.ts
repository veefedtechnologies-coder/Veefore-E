import type { Express, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import path from "path";
import multer from 'multer';
import fs from 'fs/promises';
import fsSync from 'fs';
import { IStorage } from "./storage";
import { InstagramSmartPolling } from "./instagram-smart-polling";
import { InstagramAccountMonitor } from "./instagram-account-monitor";
import { createCopilotRoutes } from "./ai-copilot";
import subscriptionRoutes from './routes/subscription';
import { registerAdminRoutes } from './admin-routes';
import videoRoutes, { setupVideoWebSocket } from './video-routes';
import authRoutes from './auth-routes';
import authCookiesRouter from './routes/auth-cookies';
import { 
  authRateLimiter,
  bruteForceMiddleware,
  aiRateLimiter
} from './middleware/rate-limiting-working';
import { strictCorsMiddleware } from './middleware/cors-security';
import { auditTrailMiddleware } from './middleware/security-monitoring';
import { defaultWorkspaceEnforcer } from './middleware/default-workspace-enforcer';
import { mountV1Routes } from './routes/v1/index';
import { 
  distributedLock, 
  waitForMongoDBAndAcquireLock,
  LOCK_NAMES
} from './services/distributed-lock';

async function performHealthCheck(storage: IStorage): Promise<boolean> {
  try {
    const metrics = (storage as any).getConnectionMetrics?.();
    if (metrics && metrics.readyState !== 1) {
      console.warn('[HEALTH CHECK] MongoDB not in ready state:', metrics.readyStateLabel);
      return false;
    }
    
    // Use a proper health check that actually validates connectivity
    const healthCheckResult = await Promise.race([
      (async () => {
        // Try a simple operation that will fail if DB is not connected
        await storage.getUser('health-check-probe');
        return { success: true };
      })(),
      new Promise<{ success: false; reason: string }>((resolve) => 
        setTimeout(() => resolve({ success: false, reason: 'timeout' }), 5000)
      )
    ]);
    
    if (!healthCheckResult.success) {
      console.error('[HEALTH CHECK] Failed:', (healthCheckResult as any).reason || 'unknown error');
      return false;
    }
    
    console.log('[HEALTH CHECK] Storage layer responding normally');
    return true;
  } catch (error: any) {
    console.error('[HEALTH CHECK] Failed:', error.message);
    return false;
  }
}

export async function initializeLeaderElection(storage: IStorage): Promise<void> {
  console.log('[LEADER ELECTION] Starting leader election for Instagram polling...');
  
  const isHealthy = await performHealthCheck(storage);
  if (!isHealthy) {
    console.warn('[LEADER ELECTION] Health check failed, delaying leader election...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  try {
    console.log('[LEADER ELECTION] Attempting to acquire polling lock...');
    const hasPollingLock = await waitForMongoDBAndAcquireLock(LOCK_NAMES.INSTAGRAM_POLLING);
    console.log(`[LEADER ELECTION] Polling lock acquired: ${hasPollingLock}`);
    
    console.log('[LEADER ELECTION] Attempting to acquire monitor lock...');
    const hasMonitorLock = await waitForMongoDBAndAcquireLock(LOCK_NAMES.INSTAGRAM_ACCOUNT_MONITOR);
    console.log(`[LEADER ELECTION] Monitor lock acquired: ${hasMonitorLock}`);
    
    if (hasPollingLock && hasMonitorLock) {
      console.log(`[LEADER ELECTION] ✅ This instance (${distributedLock.getInstanceId()}) is the LEADER for Instagram polling`);
      console.log('[SMART POLLING] 🚀 Activating hybrid system - webhooks + smart polling');
      
      try {
        const smartPolling = new InstagramSmartPolling(storage);
        // InstagramAccountMonitor starts monitoring automatically in constructor
        new InstagramAccountMonitor(storage, smartPolling);
        
        console.log('[SMART POLLING] ✅ Hybrid system active - webhooks for comments/mentions, polling for likes/followers');
      } catch (pollingError) {
        console.error('[LEADER ELECTION] Error starting polling services:', pollingError);
      }
    } else {
      console.log(`[LEADER ELECTION] ⏳ This instance (${distributedLock.getInstanceId()}) is a FOLLOWER - skipping Instagram polling`);
      console.log('[SMART POLLING] ℹ️ Polling will be handled by the leader instance');
    }
  } catch (error) {
    console.error('[LEADER ELECTION] Failed to acquire polling locks:', error);
    console.log('[SMART POLLING] ⚠️ Starting polling as fallback due to lock error');
    
    try {
      const smartPolling = new InstagramSmartPolling(storage);
      // InstagramAccountMonitor starts monitoring automatically in constructor
      new InstagramAccountMonitor(storage, smartPolling);
    } catch (fallbackError) {
      console.error('[SMART POLLING] Fallback polling failed:', fallbackError);
    }
  }
}

// Pre-create uploads directory at module load time (before request handling)
const UPLOAD_DIR = './uploads';
if (!fsSync.existsSync(UPLOAD_DIR)) {
  fsSync.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export async function registerRoutes(app: Express, storage: IStorage, upload?: any): Promise<Server> {
  const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif']);
  const ALLOWED_VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v']);
  const ALLOWED_EXTENSIONS = new Set([...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_VIDEO_EXTENSIONS]);

  const mediaUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        // Directory is pre-created at startup - no sync fs calls in request path
        cb(null, UPLOAD_DIR);
      },
      filename: (_req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
      }
    }),
    limits: {
      fileSize: 100 * 1024 * 1024,
    },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const isValidMime = file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/');
      const isValidExt = ALLOWED_EXTENSIONS.has(ext);
      
      if (isValidMime && isValidExt) {
        cb(null, true);
      } else if (!isValidExt) {
        cb(new Error(`File extension '${ext}' not allowed. Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`));
      } else {
        cb(new Error('Only image and video files are allowed'));
      }
    }
  });

  // Apply default workspace enforcer middleware
  app.use('/api', defaultWorkspaceEnforcer(storage));
  
  // P1-3 SECURITY: Apply AI rate limiting to all /api/ai/* routes for cost protection
  app.use('/api/ai', aiRateLimiter);

  // Mount v1 API routes - All route handlers are organized in v1 routes
  mountV1Routes(app, '/api');

  // AI Copilot Routes
  createCopilotRoutes(app, storage);

  // Subscription Routes
  app.use('/api/subscription', subscriptionRoutes);

  // Video Generator Routes - Set storage for middleware
  app.use('/api/video', (req: any, res: any, next: any) => {
    req.app.locals.storage = storage;
    next();
  }, videoRoutes);

  // P1-5 SECURITY: Strict CORS for admin endpoints
  app.use('/api/admin/*', strictCorsMiddleware);
  
  // P1-7 SECURITY: Audit trail for admin operations
  app.use('/api/admin/*', auditTrailMiddleware('admin_operation'));

  // Register comprehensive admin routes with JWT authentication
  registerAdminRoutes(app);

  // P1-3 SECURITY: Authentication routes with rate limiting and brute-force protection
  app.use('/api/auth', authRateLimiter, bruteForceMiddleware, authRoutes);
  
  // P1 SECURITY: HTTP-only cookie authentication routes with rate limiting
  app.use('/api/auth-cookies', authRateLimiter, bruteForceMiddleware, authCookiesRouter);

  // Create HTTP server
  const httpServer = createServer(app);
  
  // Setup video WebSocket server
  setupVideoWebSocket(httpServer);
  console.log('[WS] Video WebSocket server initialized on /ws/video');

  return httpServer;
}
