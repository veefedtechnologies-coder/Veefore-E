import type { Express, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import path from "path";
import multer from 'multer';
import fs from 'fs';
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

export async function registerRoutes(app: Express, storage: IStorage, upload?: any): Promise<Server> {
  // Configure multer for file uploads
  const mediaUpload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        const uploadDir = './uploads';
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
      }
    }),
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB limit
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image and video files are allowed'));
      }
    }
  });

  // Apply default workspace enforcer middleware
  app.use('/api', defaultWorkspaceEnforcer(storage));
  
  // P1-3 SECURITY: Apply AI rate limiting to all /api/ai/* routes for cost protection
  app.use('/api/ai', aiRateLimiter);
  
  // SCALABILITY FIX: Use distributed lock for Instagram polling services
  // Only one instance should run polling to prevent duplicate API calls and rate limiting
  // Uses retry logic to wait for MongoDB connection before attempting lock acquisition
  console.log('[DISTRIBUTED LOCK] Starting lock acquisition with MongoDB wait...');
  
  (async () => {
    try {
      console.log('[LEADER ELECTION] Waiting for MongoDB and acquiring polling lock...');
      const hasPollingLock = await waitForMongoDBAndAcquireLock(LOCK_NAMES.INSTAGRAM_POLLING);
      console.log(`[LEADER ELECTION] Polling lock result: ${hasPollingLock}`);
      
      console.log('[LEADER ELECTION] Waiting for MongoDB and acquiring monitor lock...');
      const hasMonitorLock = await waitForMongoDBAndAcquireLock(LOCK_NAMES.INSTAGRAM_ACCOUNT_MONITOR);
      console.log(`[LEADER ELECTION] Monitor lock result: ${hasMonitorLock}`);
      
      if (hasPollingLock && hasMonitorLock) {
        console.log(`[LEADER ELECTION] ✅ This instance (${distributedLock.getInstanceId()}) is the LEADER for Instagram polling`);
        console.log('[SMART POLLING] 🚀 Activating hybrid system - webhooks + smart polling');
        
        try {
          const smartPolling = new InstagramSmartPolling(storage);
          const accountMonitor = new InstagramAccountMonitor(storage, smartPolling);
          accountMonitor.startMonitoring();
          
          console.log('[ACCOUNT MONITOR] 👀 Starting Instagram account monitoring...');
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
      
      const smartPolling = new InstagramSmartPolling(storage);
      const accountMonitor = new InstagramAccountMonitor(storage, smartPolling);
      accountMonitor.startMonitoring();
    }
  })();

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
