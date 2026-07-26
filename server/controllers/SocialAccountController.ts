import { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { logger } from '../config/logger';
import { ValidationError } from '../errors';
import { socialAccountService } from '../services';
import { CachingSystem } from '../performance/caching-system';
import { invalidateBootstrapCache } from '../lib/html-bootstrap';
import { MetricsQueueManager } from '../queues/metricsQueue';

const traceLog = (msg: string, data?: any) => {
  if (data) {
    logger.debug(`[CONTROLLER] ${msg}`, data);
  } else {
    logger.debug(`[CONTROLLER] ${msg}`);
  }
};

const AccountIdParams = z.object({
  accountId: z.string().min(1),
});

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1),
});

const PlatformEnum = z.enum(['instagram', 'instagram_advanced', 'facebook', 'twitter', 'youtube', 'tiktok', 'linkedin']);

const ConnectAccountSchema = z.object({
  platform: PlatformEnum,
  username: z.string().min(1).max(100).optional(),
  accountId: z.string().min(1).optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  encryptedAccessToken: z.any().optional(),
  encryptedRefreshToken: z.any().optional(),
  expiresAt: z.coerce.date().optional(),
  profileData: z.object({
    biography: z.string().max(500).optional(),
    website: z.string().url().optional(),
    profilePictureUrl: z.string().url().optional(),
    followersCount: z.number().int().min(0).optional(),
    followingCount: z.number().int().min(0).optional(),
    mediaCount: z.number().int().min(0).optional(),
    isBusinessAccount: z.boolean().optional(),
    isVerified: z.boolean().optional(),
  }).optional(),
});

const UpdateTokensSchema = z.object({
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  encryptedAccessToken: z.any().optional(),
  encryptedRefreshToken: z.any().optional(),
  expiresAt: z.coerce.date().optional(),
});

const UpdateMetricsSchema = z.object({
  followersCount: z.number().int().min(0).optional(),
  followingCount: z.number().int().min(0).optional(),
  mediaCount: z.number().int().min(0).optional(),
  avgLikes: z.number().min(0).optional(),
  avgComments: z.number().min(0).optional(),
  avgReach: z.number().min(0).optional(),
  engagementRate: z.number().min(0).max(100).optional(),
  totalLikes: z.number().int().min(0).optional(),
  totalComments: z.number().int().min(0).optional(),
  totalReach: z.number().int().min(0).optional(),
});

export class SocialAccountController extends BaseController {
  getAccount = this.wrapAsync(async (
    req: TypedRequest<{ accountId: string }>,
    res: Response
  ) => {
    const { accountId } = AccountIdParams.parse(req.params);
    const account = await socialAccountService.getAccountById(accountId);
    this.sendSuccess(res, account);
  });

  getByWorkspace = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    // Req 3.5 / 4.1: Return accounts for ALL platforms by default.
    // Callers may filter server-side via `?platform=<platformId>`.
    const platformFilter = req.query.platform as string | undefined;

    const accounts = await socialAccountService.getActiveAccountsByWorkspace(workspaceId);

    // Apply optional platform filter — no default applied server-side.
    const filtered = platformFilter
      ? accounts.filter(a => a.platform === platformFilter)
      : accounts;

    // Explicitly include the multi-platform fields in the response so downstream
    // consumers (PlatformFilterContext, FacebookAccountCard, etc.) can rely on them.
    const shaped = filtered.map(account => {
      const raw = typeof (account as any).toJSON === 'function'
        ? (account as any).toJSON()
        : { ...(account as any).toObject?.() ?? account };

      return {
        ...raw,
        // Ensure these fields are always present in the response shape even when
        // the document was created before the multi-platform migration ran.
        platform: raw.platform ?? 'instagram',
        connectionStatus: raw.connectionStatus ?? 'ACTIVE',
        tokenExpiresAt: raw.tokenExpiresAt ?? null,
        platformMetadata: raw.platformMetadata ?? {},
      };
    });

    this.sendSuccess(res, shaped);
  });

  connectAccount = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof ConnectAccountSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = ConnectAccountSchema.parse(req.body);
    const result = await socialAccountService.connectAccount({
      workspaceId,
      platform: input.platform,
      username: input.username || '',
      accountId: input.accountId || '',
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      encryptedAccessToken: input.encryptedAccessToken,
      encryptedRefreshToken: input.encryptedRefreshToken,
      expiresAt: input.expiresAt,
      profileData: input.profileData,
    });

    if ('url' in result) {
      this.sendSuccess(res, result);
    } else {
      // The seeded bootstrap includes this workspace's accounts — invalidate the
      // per-user bootstrap cache so the next HTML load reflects the new account.
      void invalidateBootstrapCache((req as any).user?.id);
      this.sendCreated(res, result, 'Account connected successfully');
    }
  });

  disconnectAccount = this.wrapAsync(async (
    req: TypedRequest<{ accountId: string }>,
    res: Response
  ) => {
    const { accountId } = AccountIdParams.parse(req.params);
    logger.info('Disconnecting account requested', { component: 'SocialAccountController', accountId });
    await socialAccountService.disconnectAccount(accountId);
    logger.info('Disconnect account successful', { component: 'SocialAccountController', accountId });
    void invalidateBootstrapCache((req as any).user?.id);
    this.sendNoContent(res);
  });

  updateTokens = this.wrapAsync(async (
    req: TypedRequest<{ accountId: string }, z.infer<typeof UpdateTokensSchema>>,
    res: Response
  ) => {
    const { accountId } = AccountIdParams.parse(req.params);
    const input = UpdateTokensSchema.parse(req.body);
    const account = await socialAccountService.updateTokens(accountId, input);
    this.sendSuccess(res, account, 200, 'Tokens updated successfully');
  });

  updateMetrics = this.wrapAsync(async (
    req: TypedRequest<{ accountId: string }, z.infer<typeof UpdateMetricsSchema>>,
    res: Response
  ) => {
    const rawAccountId = req.params.accountId;
    traceLog('updateMetrics request received', { accountId: rawAccountId });

    if (!rawAccountId || rawAccountId === 'undefined' || rawAccountId === 'null') {
      logger.error('updateMetrics', new Error('Invalid account ID'), {
        receivedId: rawAccountId,
        params: req.params,
        url: req.originalUrl
      });
      res.status(400).json({
        success: false,
        error: `Invalid account ID received: "${rawAccountId}". Please ensure the account ID is valid.`
      });
      return;
    }

    const { accountId } = AccountIdParams.parse(req.params);

    // Get the account from the database to find its workspace ID
    const account = await socialAccountService.getAccountById(accountId);

    console.log(`\n======================================================`);
    console.log(`[FRONTEND DECOUPLED API] 🚀 Received request to update metrics for ${accountId}`);
    console.log(`[FRONTEND DECOUPLED API] Immediately queueing background job in BullMQ...`);

    // Delegate to the background worker queue instead of blocking the request
    await MetricsQueueManager.scheduleMetricsFetch(
      account.workspaceId.toString(),
      'system',
      accountId,
      '', // Token is handled securely by the worker
      'all',
      { priority: 5, forceRefresh: true } // Priority 5 = High (manual refresh)
    );

    console.log(`[FRONTEND DECOUPLED API] ✅ Job queued! Sending 202 response to frontend without waiting for Meta API.`);
    console.log(`======================================================\n`);

    traceLog('Manual sync scheduled in background', { accountId, username: account.username });

    this.sendSuccess(res, account, 202, 'Metrics refresh scheduled successfully via background worker');
  });
}

export const socialAccountController = new SocialAccountController();
