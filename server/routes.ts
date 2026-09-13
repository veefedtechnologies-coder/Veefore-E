import type { Express, Request, Response, NextFunction } from 'express';
import { createServer, type Server } from 'http';
import multer from 'multer';
import { IStorage } from './storage';
import { createCopilotRoutes } from './ai-copilot';
import subscriptionRoutes from './routes/subscription';
import { registerAdminRoutes } from './admin-routes';
import videoRoutes, { setupVideoWebSocket } from './video-routes';
import authRoutes from './auth-routes';
import {
  authRateLimiter,
  oauthRateLimiter,
  bruteForceMiddleware,
  aiRateLimiter,
} from './middleware/rate-limiting-working';
import { strictCorsMiddleware } from './middleware/cors-security';
import { auditTrailMiddleware } from './middleware/security-monitoring';
import { defaultWorkspaceEnforcer } from './middleware/default-workspace-enforcer';
import { mountV1Routes, mountBillingRoutes } from './routes/v1/index';
import { createMediaUpload } from './infrastructure/media-upload';
import storageRoutes from './features/storage/routes/storage.routes';
// Veefore AI Video Editor routers (mounted at /api/video-editor).
//   videoEditorProjectRouter  → project CRUD + plan/render (tasks 5.1, 9.3, 14.4)
//   videoEditorArtifactRouter → short-lived Signed_URL artifact delivery (task 5.3)
import {
  videoEditorProjectRouter,
  videoEditorArtifactRouter,
  videoEditorConversationRouter,
} from './features/video-editor/api';

import { default as earlyAccessRoutes } from './routes/v1/early-access.routes';
import { default as publicLandingRoutes } from './routes/v1/public-landing.routes';
import { default as veegptChatRoutes } from './routes/veegpt-chat.routes';

// ── Subscription billing & entitlement feature routes (v2) ──────────────────
// subscriptionRouter   → /api/v2/subscription  (user-facing lifecycle + add-ons)
// adminSubscriptionRouter → /api/admin/subscription  (admin overrides & tooling)
// webhookRouter        → /api/webhooks          (Razorpay webhook; uses express.raw() per-route)
import { subscriptionRouter } from './features/subscription/routes/subscription.routes';
import { adminSubscriptionRouter } from './features/subscription/routes/admin.routes';
// VeeGPT admin tooling → /api/admin/veegpt (usage analytics, cost monitoring,
// emergency controls, alerts, on-demand repair — spec §45–§49, §57).
import { veegptAdminRouter } from './routes/veegpt-admin.routes';
// webhookRouter is imported and mounted directly in server/index.ts, before
// express.json() — see the NOTE near its mount point below for why.

export { initializeLeaderElection } from './infrastructure/leader-election';

export async function registerRoutes(
  app: Express,
  storage: IStorage,
  httpServer: Server,
  _upload?: multer.Multer
): Promise<void> {
  const mediaUpload = createMediaUpload();

  // Legacy upload endpoint - maintained for backwards compatibility
  app.post(
    '/api/upload',
    mediaUpload.single('file'),
    (req: Request, res: Response) => {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      res.json({
        success: true,
        url: `/uploads/${req.file.filename}`,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });
    }
  );

  app.use('/api', defaultWorkspaceEnforcer(storage));

  // Mount new storage routes with service layer architecture - Requirement 4.6
  app.use('/api/storage', storageRoutes);

  // ── Veefore AI Video Editor (veefore-ai-video-editor spec) ──────────────────
  // All routes require an authenticated session and workspace access, enforced
  // per-router. The artifact router delivers bytes ONLY via short-lived signed
  // URLs (Req 19.3); the project router owns project CRUD + plan/render.
  app.use('/api/video-editor', videoEditorArtifactRouter);
  // Conversational multi-turn editing over the NDJSON streaming transport
  // (Req 16.1, 16.2, 18.4) — mounted before the project router so its
  // `/projects/:id/converse` routes take precedence.
  app.use('/api/video-editor', videoEditorConversationRouter);
  app.use('/api/video-editor', videoEditorProjectRouter);

  app.use('/api/ai', aiRateLimiter);

  // Register early access routes explicitly
  app.use('/api/early-access', earlyAccessRoutes);

  // Public landing caption proxy (unauthenticated, rate-limited) - Requirement 12.8
  // Resolves to POST /api/public/landing/captions
  app.use('/api/public/landing', publicLandingRoutes);

  // VeeGPT chat routes — conversation + streaming AI replies driven by the
  // workspace AI configuration saved in Settings → AI Configuration.
  app.use('/api/chat', veegptChatRoutes);
  // The native mobile app's VeeGPT client targets the same contract under an
  // `/api/veegpt` prefix (NDJSON streaming, identical sub-paths). Mount the same
  // router there so mobile hits the exact same production-tested handlers.
  app.use('/api/veegpt', veegptChatRoutes);

  // The client uses both the '/api' and '/api/v1' prefixes for most v1
  // resources, so both are mounted. Billing is excluded from mountV1Routes and
  // mounted once below — see mountBillingRoutes for why.
  mountV1Routes(app, '/api');
  mountV1Routes(app, '/api/v1');

  // Money-handling endpoints: mounted exactly once at /api/billing.
  mountBillingRoutes(app);

  createCopilotRoutes(app, storage);

  // Legacy subscription routes — kept to avoid breaking existing frontend code
  app.use('/api/subscription', subscriptionRoutes);

  // ── New subscription billing & entitlement routes (subscription-billing-entitlement spec) ──
  // User-facing subscription lifecycle + add-ons (v2 path avoids collision with legacy)
  app.use('/api/v2/subscription', subscriptionRouter);
  // Admin subscription management (plan overrides, credit adjustments, refunds, etc.)
  app.use('/api/admin/subscription', adminSubscriptionRouter);
  // VeeGPT admin tooling (usage analytics, cost monitoring, emergency controls,
  // alerts, on-demand repair). Every route requires a signed admin JWT; mutating
  // routes require an elevated role and are audited (spec §45–§49, §57).
  app.use('/api/admin/veegpt', veegptAdminRouter);
  // NOTE: `webhookRouter` (POST /api/webhooks/razorpay) is mounted in
  // server/index.ts BEFORE express.json(), not here — see the comment there
  // for why. It must run before the global body parser, and this function
  // (registerRoutes) is invoked after express.json() has already been
  // registered.

  app.use(
    '/api/video',
    (req: Request, res: Response, next: NextFunction) => {
      req.app.locals.storage = storage;
      next();
    },
    videoRoutes
  );

  app.use('/api/admin/*', strictCorsMiddleware);

  app.use('/api/admin/*', auditTrailMiddleware('admin_operation'));

  registerAdminRoutes(app);

  // OAuth routes with OAuth-specific rate limiter (10 requests/minute per IP) - Requirement 11.7
  app.use('/api/auth', oauthRateLimiter, bruteForceMiddleware, authRoutes);

  setupVideoWebSocket(httpServer);
  console.log('[WS] Video WebSocket server initialized on /ws/video');

  app.get('/api/debug-db', async (req: Request, res: Response) => {
    try {
      const { default: mongoose } = await import('mongoose');
      const { SocialAccountModel } =
        await import('./models/Social/SocialAccount');
      const { ContentModel } = await import('./models/Content/Content');

      const collections = await mongoose.connection.db
        ?.listCollections()
        .toArray();
      const accounts = await SocialAccountModel.find({});
      const contentCount = await ContentModel.countDocuments();
      const publishedCount = await ContentModel.countDocuments({
        status: 'published',
      });

      const sampleContent = await ContentModel.find({ platform: 'instagram' })
        .limit(5)
        .select('workspaceId status contentData.id');

      res.json({
        dbName: mongoose.connection.name,
        collections: (collections || []).map((c: any) => c.name),
        accountCount: accounts.length,
        accounts: accounts.map((a: any) => ({
          id: a._id,
          platform: a.platform,
          workspaceId: a.workspaceId,
          user: a.username,
        })),
        contentCount,
        publishedCount,
        sampleContent: sampleContent.map((c: any) => ({
          id: c._id,
          mediaId: c.contentData?.id,
          workspaceId: c.workspaceId,
          status: c.status,
        })),
        mongoConnectionString: process.env.MONGODB_URI ? 'Set' : 'Unset',
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/debug-force-sync', async (req: Request, res: Response) => {
    try {
      const { SocialAccountModel } =
        await import('./models/Social/SocialAccount');
      const { socialAccountService } =
        await import('./services/SocialAccountService');

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
