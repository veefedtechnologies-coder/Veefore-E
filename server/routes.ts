import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import multer from 'multer';
import { IStorage } from "./storage";
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
import { createMediaUpload } from './infrastructure/media-upload';

export { initializeLeaderElection } from './infrastructure/leader-election';

export async function registerRoutes(app: Express, storage: IStorage, _upload?: multer.Multer): Promise<Server> {
  const mediaUpload = createMediaUpload();

  app.use('/api', defaultWorkspaceEnforcer(storage));
  
  app.use('/api/ai', aiRateLimiter);

  mountV1Routes(app, '/api');

  createCopilotRoutes(app, storage);

  app.use('/api/subscription', subscriptionRoutes);

  app.use('/api/video', (req: Request, res: Response, next: NextFunction) => {
    req.app.locals.storage = storage;
    next();
  }, videoRoutes);

  app.use('/api/admin/*', strictCorsMiddleware);
  
  app.use('/api/admin/*', auditTrailMiddleware('admin_operation'));

  registerAdminRoutes(app);

  app.use('/api/auth', authRateLimiter, bruteForceMiddleware, authRoutes);
  
  app.use('/api/auth-cookies', authRateLimiter, bruteForceMiddleware, authCookiesRouter);

  const httpServer = createServer(app);
  
  setupVideoWebSocket(httpServer);
  console.log('[WS] Video WebSocket server initialized on /ws/video');

  return httpServer;
}
