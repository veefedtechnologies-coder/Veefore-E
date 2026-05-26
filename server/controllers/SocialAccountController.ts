import { type NextFunction, type Request, type Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { logger } from '../config/logger';
import { ValidationError } from '../errors';
import { socialAccountService } from '../services';
import { CachingSystem } from '../performance/caching-system';
import * as fs from 'fs';
import * as path from 'path';

const traceLog = (msg: string, data?: any) => {
  try {
    const logPath = path.join(process.cwd(), 'debug-trace.log');
    const timestamp = new Date().toISOString();
    const entry = `[${timestamp}] [CONTROLLER] ${msg}${data ? ' ' + JSON.stringify(data) : ''}\n`;
    fs.appendFileSync(logPath, entry);
  } catch (e) {
    console.error('Failed to log to trace file', e);
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
    const accounts = await socialAccountService.getActiveAccountsByWorkspace(workspaceId);
    this.sendSuccess(res, accounts);
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
    // Trigger real sync from Instagram instead of just saving passed data (P1-5 FIX)
    const account = await socialAccountService.syncAccount(accountId);
    traceLog('Manual sync successful', { accountId, username: account.username });

    // Clear cache immediately so the UI reflects the synced metrics!
    try {
      await CachingSystem.invalidateByTag('dashboard');
      await CachingSystem.invalidateByTag('historical');
      await CachingSystem.invalidateByTag('social_accounts');
      traceLog('Cache invalidated for new metrics');
    } catch (err) {
      logger.error('Failed to invalidate cache after sync', err as Error);
    }

    this.sendSuccess(res, account, 200, 'Metrics updated successfully via Instagram sync');
  });
}

export const socialAccountController = new SocialAccountController();
