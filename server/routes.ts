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
  oauthRateLimiter,
  bruteForceMiddleware,
  aiRateLimiter
} from './middleware/rate-limiting-working';
import { strictCorsMiddleware } from './middleware/cors-security';
import { auditTrailMiddleware } from './middleware/security-monitoring';
import { defaultWorkspaceEnforcer } from './middleware/default-workspace-enforcer';
import { mountV1Routes } from './routes/v1/index';
import { createMediaUpload } from './infrastructure/media-upload';

import { default as earlyAccessRoutes } from './routes/v1/early-access.routes';

export { initializeLeaderElection } from './infrastructure/leader-election';

export async function registerRoutes(app: Express, storage: IStorage, httpServer: Server, _upload?: multer.Multer): Promise<void> {
  const mediaUpload = createMediaUpload();

  app.post('/api/upload', mediaUpload.single('file'), (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({
      success: true,
      url: `/uploads/${req.file.filename}`,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
  });

  app.use('/api', defaultWorkspaceEnforcer(storage));

  app.use('/api/ai', aiRateLimiter);

  // Register early access routes explicitly
  app.use('/api/early-access', earlyAccessRoutes);

  mountV1Routes(app, '/api');
  mountV1Routes(app, '/api/v1');

  createCopilotRoutes(app, storage);

  app.use('/api/subscription', subscriptionRoutes);

  app.use('/api/video', (req: Request, res: Response, next: NextFunction) => {
    req.app.locals.storage = storage;
    next();
  }, videoRoutes);

  app.use('/api/admin/*', strictCorsMiddleware);

  app.use('/api/admin/*', auditTrailMiddleware('admin_operation'));

  registerAdminRoutes(app);

  // OAuth routes with OAuth-specific rate limiter (10 requests/minute per IP) - Requirement 11.7
  app.use('/api/auth', oauthRateLimiter, bruteForceMiddleware, authRoutes);

  app.use('/api/auth-cookies', authRateLimiter, bruteForceMiddleware, authCookiesRouter);

  setupVideoWebSocket(httpServer);
  console.log('[WS] Video WebSocket server initialized on /ws/video');


  app.get('/api/debug-db', async (req: Request, res: Response) => {
    try {
      const { default: mongoose } = await import('mongoose');
      const { SocialAccountModel } = await import('./models/Social/SocialAccount');
      const { ContentModel } = await import('./models/Content/Content');

      const collections = await mongoose.connection.db?.listCollections().toArray();
      const accounts = await SocialAccountModel.find({});
      const contentCount = await ContentModel.countDocuments();
      const publishedCount = await ContentModel.countDocuments({ status: 'published' });

      const sampleContent = await ContentModel.find({ platform: 'instagram' }).limit(5).select('workspaceId status contentData.id');

      res.json({
        dbName: mongoose.connection.name,
        collections: (collections || []).map((c: any) => c.name),
        accountCount: accounts.length,
        accounts: accounts.map((a: any) => ({
          id: a._id,
          platform: a.platform,
          workspaceId: a.workspaceId,
          user: a.username
        })),
        contentCount,
        publishedCount,
        sampleContent: sampleContent.map((c: any) => ({
          id: c._id,
          mediaId: c.contentData?.id,
          workspaceId: c.workspaceId,
          status: c.status
        })),
        mongoConnectionString: process.env.MONGODB_URI ? 'Set' : 'Unset'
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  app.get('/api/debug-force-sync', async (req: Request, res: Response) => {
    try {
      const { SocialAccountModel } = await import('./models/Social/SocialAccount');
      const { socialAccountService } = await import('./services/SocialAccountService');

      const accounts = await SocialAccountModel.find({ platform: 'instagram' });
      const results = [];
      for (const acc of accounts) {
        console.log(`Force syncing ${acc.username}...`);
        try {
          await socialAccountService.syncAccount((acc as any)._id.toString());
          results.push({ user: acc.username, status: 'synced' });
        } catch (e: any) {
          results.push({ user: acc.username, error: e.message });
        }
      }
      res.json({ results });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}
