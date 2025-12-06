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
  
  // HYBRID APPROACH: Webhooks for supported events + Smart polling for other metrics
  console.log('[SMART POLLING] 🚀 Activating hybrid system - webhooks + smart polling');
  const smartPolling = new InstagramSmartPolling(storage);
  const accountMonitor = new InstagramAccountMonitor(storage, smartPolling);
  accountMonitor.startMonitoring();
  console.log('[ACCOUNT MONITOR] 👀 Starting Instagram account monitoring...');
  console.log('[SMART POLLING] ✅ Hybrid system active - webhooks for comments/mentions, polling for likes/followers');

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
