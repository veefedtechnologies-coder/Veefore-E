import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { socialAccountService } from '../services';

const AccountIdParams = z.object({
  accountId: z.string().min(1),
});

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1),
});

const PlatformEnum = z.enum(['instagram', 'facebook', 'twitter', 'youtube', 'tiktok', 'linkedin']);

const ConnectAccountSchema = z.object({
  platform: PlatformEnum,
  username: z.string().min(1).max(100),
  accountId: z.string().min(1),
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
    const accounts = await socialAccountService.getAccountsByWorkspace(workspaceId);
    this.sendSuccess(res, accounts);
  });

  connectAccount = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof ConnectAccountSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = ConnectAccountSchema.parse(req.body);
    const account = await socialAccountService.connectAccount({
      workspaceId,
      platform: input.platform,
      username: input.username,
      accountId: input.accountId,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      encryptedAccessToken: input.encryptedAccessToken,
      encryptedRefreshToken: input.encryptedRefreshToken,
      expiresAt: input.expiresAt,
      profileData: input.profileData,
    });
    this.sendCreated(res, account, 'Account connected successfully');
  });

  disconnectAccount = this.wrapAsync(async (
    req: TypedRequest<{ accountId: string }>,
    res: Response
  ) => {
    const { accountId } = AccountIdParams.parse(req.params);
    await socialAccountService.disconnectAccount(accountId);
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
    const { accountId } = AccountIdParams.parse(req.params);
    const input = UpdateMetricsSchema.parse(req.body);
    const account = await socialAccountService.updateMetrics(accountId, input);
    this.sendSuccess(res, account, 200, 'Metrics updated successfully');
  });
}

export const socialAccountController = new SocialAccountController();
