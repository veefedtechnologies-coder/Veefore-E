import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { workspaceService } from '../services';
import { storage } from '../mongodb-storage';
import { NotFoundError, ForbiddenError, PaymentRequiredError, ConflictError } from '../errors';
import crypto from 'crypto';
import { invalidateBootstrapCache } from '../lib/html-bootstrap';

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1),
});

const InvitationIdParams = z.object({
  workspaceId: z.string().min(1),
  invitationId: z.string().min(1),
});

const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: z.string().min(1).default('Viewer'),
});

const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  theme: z.string().max(50).optional(),
  aiPersonality: z.string().max(50).optional(),
});

type CreateWorkspaceBody = z.infer<typeof CreateWorkspaceSchema>;

const UpdateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  avatar: z.string().url().optional(),
  theme: z.string().max(50).optional(),
  aiPersonality: z.string().max(50).optional(),
  aiConfiguration: z.object({
    aiModel: z.string().optional(),
    creativityLevel: z.number().min(0).max(1).optional(),
    optimizationGoals: z.string().optional(),
    aiPersona: z.string().optional(),
    captionStyle: z.string().optional(),
    responseLength: z.string().optional(),
    multilingual: z.string().optional(),
    videoEngine: z.string().optional(),
    thumbnailStyle: z.string().optional(),
    autoHashtags: z.boolean().optional(),
    contentSafety: z.string().optional(),
    aiMemory: z.string().optional(),
    autoLearning: z.boolean().optional(),
    googleAiStudioKey: z.string().optional(),
    openAiKey: z.string().optional(),
  }).optional(),
});

const SetDefaultSchema = z.object({
  workspaceId: z.string().min(1),
});

export class WorkspaceController extends BaseController {
  getWorkspace = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const workspace = await workspaceService.getWorkspaceById(workspaceId);
    this.sendSuccess(res, workspace);
  });

  getUserWorkspaces = this.wrapAsync(async (
    req: TypedRequest,
    res: Response
  ) => {
    // WorkspaceModel stores ownerId as Firebase UID (set by importAuthorizedBrand
    // and workspace.routes.ts). Use firebaseUid preferentially so newly imported
    // workspaces are returned. Fall back to MongoDB id for legacy workspaces.
    const firebaseUid: string = (req.user as any).firebaseUid || req.user!.id;
    const mongoId: string = req.user!.id;

    let workspaces = await workspaceService.getWorkspacesByUserId(firebaseUid);

    // If the Firebase UID lookup returns nothing, try the MongoDB _id as a fallback
    // (covers users who still have workspaces keyed by mongoId from before the spec).
    if (!workspaces || workspaces.length === 0) {
      workspaces = await workspaceService.getWorkspacesByUserId(mongoId);
    }

    this.sendSuccess(res, workspaces);
  });

  createWorkspace = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof CreateWorkspaceSchema>>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const input = CreateWorkspaceSchema.parse(req.body);

    // ── Plan-based workspace limit enforcement ────────────────────────────────
    // Reads from the real EntitlementService (backed by the Subscription
    // document) instead of req.user.plan / a hardcoded limit table here.
    // req.user.plan is the legacy User.plan field, which the Razorpay
    // subscription system never writes to — it was always stale, and its
    // plan names ("Starter"/"Growth"/"Agency") didn't even match the real
    // plan IDs ("creator"/"pro"/"business"), so this check silently fell
    // back to a limit of 1 for every paid plan.
    const { getEntitlementService } = await import('../features/subscription/services/EntitlementService');
    const { getRedisClient } = await import('../lib/redis');
    const SubscriptionRepository = (await import('../features/subscription/db/repositories/SubscriptionRepository')).default;

    const entitlementService = getEntitlementService(getRedisClient(), new SubscriptionRepository());
    const userPlan = await entitlementService.getPlan(userId);
    const remaining = await entitlementService.remainingWorkspaces(userId);

    if (remaining !== Infinity && remaining <= 0) {
      const planLimit = await entitlementService.getLimit(userId, 'maxWorkspaces');
      const existingWorkspaces = await workspaceService.getWorkspacesByUserId(userId);
      const currentCount = Array.isArray(existingWorkspaces) ? existingWorkspaces.length : 0;

      throw new PaymentRequiredError(
        `Your ${userPlan} plan allows a maximum of ${planLimit} workspace${planLimit === 1 ? '' : 's'}. You currently have ${currentCount}. Upgrade your plan to create more workspaces.`,
        {
          needsUpgrade: true,
          currentPlan: userPlan,
          currentCount,
          planLimit,
          upgradeUrl: '/settings?tab=billing',
        }
      );
    }
    // ─────────────────────────────────────────────────────────────────────────

    const workspace = await workspaceService.createWorkspace({
      userId,
      name: input.name,
      description: input.description,
      theme: input.theme,
      aiPersonality: input.aiPersonality,
    });
    // The bootstrap seeds the user's workspace list — invalidate so the next HTML
    // load reflects the new workspace immediately.
    void invalidateBootstrapCache(userId);
    this.sendCreated(res, workspace, 'Workspace created successfully');
  });

  updateWorkspace = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof UpdateWorkspaceSchema>>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = UpdateWorkspaceSchema.parse(req.body);
    const workspace = await workspaceService.updateWorkspace(workspaceId, userId, input);

    // Workspace data changed → refresh VeeGPT's cached context snapshot so chat
    // reflects new profile / AI configuration immediately (background worker).
    try {
      const { refreshWorkspaceContext } = await import('../services/WorkspaceContextAccessor');
      void refreshWorkspaceContext(workspaceId, userId, 'workspace-update');
    } catch { /* non-critical */ }

    this.sendSuccess(res, workspace, 200, 'Workspace updated successfully');
  });

  deleteWorkspace = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    await workspaceService.deleteWorkspace(workspaceId, userId);
    this.sendNoContent(res);
  });

  setDefault = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof SetDefaultSchema>>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const { workspaceId } = SetDefaultSchema.parse(req.body);
    const workspace = await workspaceService.setDefaultWorkspace(userId, workspaceId);
    this.sendSuccess(res, workspace, 200, 'Default workspace updated');
  });

  generateInviteCode = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const inviteCode = await workspaceService.generateInviteCode(workspaceId, userId);
    this.sendSuccess(res, { inviteCode });
  });

  getStats = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const stats = await workspaceService.getWorkspaceStats(workspaceId);
    this.sendSuccess(res, stats);
  });

  enforceDefault = this.wrapAsync(async (
    req: TypedRequest,
    res: Response
  ) => {
    let userId = req.user!.id;
    const isObjectId = typeof userId === 'string' && /^[a-f0-9]{24}$/.test(userId);
    
    if (!isObjectId) {
      try {
        const byUid = req.user!.firebaseUid ? await storage.getUserByFirebaseUid(req.user!.firebaseUid) : null;
        if (byUid?.id) userId = byUid.id;
      } catch {}
      if (userId === req.user!.id && req.user!.email) {
        try {
          const byEmail = await storage.getUserByEmail(req.user!.email);
          if (byEmail?.id) userId = byEmail.id;
        } catch {}
      }
    }

    const workspaces = await storage.getWorkspacesByUserId(userId);
    if (Array.isArray(workspaces) && workspaces.length > 0) {
      const hasDefault = workspaces.some((w: any) => w.isDefault === true);
      if (!hasDefault) {
        await storage.setDefaultWorkspace(userId, workspaces[0].id);
      }
      this.sendSuccess(res, { success: true, workspaceId: workspaces[0].id });
      return;
    }

    // BUG FIX: this previously auto-created a bare "My Workspace" (no brand)
    // whenever the user had zero workspaces. Workspaces must always
    // represent one connected brand — creating an empty placeholder here
    // produced orphaned workspaces and corrupted the single-default invariant
    // once a real (brand-backed) workspace was created later. Report that no
    // workspace exists so the frontend can route the user to connect a brand.
    this.sendSuccess(res, { success: true, workspaceId: null, created: false, needsBrandConnection: true });
  });

  getMembers = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const user = req.user!;

    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace) {
      throw new NotFoundError('Workspace not found');
    }

    const workspaceUserId = workspace.userId.toString();
    const requestUserId = user.id.toString();
    const firebaseUid = user.firebaseUid;

    const userOwnsWorkspace = workspaceUserId === requestUserId ||
      workspaceUserId === firebaseUid ||
      workspace.userId === user.id ||
      workspace.userId === user.firebaseUid;

    if (!userOwnsWorkspace) {
      console.log('[DEBUG] Access denied - ID mismatch:', {
        workspaceUserId,
        requestUserId,
        firebaseUid,
        workspaceUserIdType: typeof workspace.userId,
        requestUserIdType: typeof user.id
      });
      throw new ForbiddenError('Access denied to workspace');
    }

    const members = await storage.getWorkspaceMembers(workspaceId);
    this.sendSuccess(res, members);
  });

  getInvitations = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const user = req.user!;

    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace || workspace.userId.toString() !== user.id.toString()) {
      throw new ForbiddenError('Access denied to workspace');
    }

    const invitations = await storage.getTeamInvitations(workspaceId);
    this.sendSuccess(res, invitations);
  });

  inviteMember = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof InviteMemberSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { email, role } = InviteMemberSchema.parse(req.body);
    const user = req.user!;

    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace || workspace.userId.toString() !== user.id.toString()) {
      throw new ForbiddenError('Access denied to workspace');
    }

    const userPlan = user.plan || 'Free';
    let hasTeamAccess = userPlan !== 'Free';

    if (!hasTeamAccess) {
      console.log(`[TEAM INVITE] Checking team access for user ${user.id} (${user.username})`);

      try {
        const userAddons = await storage.getUserAddons(user.id);
        console.log(`[TEAM INVITE] Found ${userAddons.length} addons for user`);
        userAddons.forEach((addon, index) => {
          console.log(`[TEAM INVITE] Addon ${index + 1}: Type: ${addon.type}, Name: ${addon.name}, Active: ${addon.isActive}`);
        });

        const teamMemberAddon = userAddons.find(addon =>
          (addon.type === 'team-member' || addon.name?.includes('Team Member') || addon.name?.includes('team-member')) &&
          addon.isActive
        );

        if (teamMemberAddon) {
          console.log(`[TEAM INVITE] Found active team member addon:`, {
            type: teamMemberAddon.type,
            name: teamMemberAddon.name,
            isActive: teamMemberAddon.isActive
          });
          hasTeamAccess = true;
        } else {
          console.log(`[TEAM INVITE] No valid team member addon found`);
          hasTeamAccess = false;
        }
      } catch (error) {
        console.error(`[TEAM INVITE] Error during team access check:`, error);
      }
    }

    console.log(`[TEAM INVITE] User ${user.id} - Plan: ${userPlan}, Has team access: ${hasTeamAccess}`);

    if (!hasTeamAccess) {
      throw new PaymentRequiredError(
        'Free plan only supports 1 member. Purchase team member addon or upgrade to invite team members.',
        { needsUpgrade: true, currentPlan: userPlan, suggestedAddon: 'team-member' }
      );
    }

    if (hasTeamAccess) {
      const currentMembers = await storage.getWorkspaceMembers(workspaceId);
      const pendingInvitations = await storage.getWorkspaceInvitations(workspaceId);

      const duplicateInvitation = pendingInvitations.find(invite => invite.email === email);
      if (duplicateInvitation) {
        throw new ConflictError(`User ${email} has already been invited to this workspace.`);
      }

      const uniqueInvitations = pendingInvitations.filter((invite, index, self) =>
        index === self.findIndex(i => i.email === invite.email)
      );

      const currentTeamSize = currentMembers.length + uniqueInvitations.length;

      console.log(`[TEAM INVITE] Current calculation: Members: ${currentMembers.length}, Pending: ${uniqueInvitations.length}, Total current: ${currentTeamSize}`);

      const totalTeamSizeAfterInvite = currentTeamSize + 1;

      console.log(`[TEAM INVITE] Looking up addons for user ID: ${user.id} (type: ${typeof user.id})`);

      const userAddons = await storage.getUserAddons(user.id);

      console.log(`[TEAM INVITE] Debug - All user addons:`, userAddons.map(a => ({ type: a.type, isActive: a.isActive, userId: a.userId })));

      const teamMemberAddons = userAddons.filter(addon =>
        addon.type === 'team-member' && addon.isActive !== false
      );

      console.log(`[TEAM INVITE] Debug - Team member addons filtered:`, teamMemberAddons.map(a => ({ type: a.type, isActive: a.isActive, userId: a.userId })));
      console.log(`[TEAM INVITE] Debug - Team member addons count: ${teamMemberAddons.length}`);

      let actualTeamAddonCount = teamMemberAddons.length;

      const totalAddonCount = userAddons.length;
      const workspaceAddonCount = userAddons.filter(addon => addon.type === 'workspace').length;
      const expectedTeamAddonCount = totalAddonCount - workspaceAddonCount;

      console.log(`[TEAM INVITE] Raw addon counts - Total: ${totalAddonCount}, Workspace: ${workspaceAddonCount}, Expected team addons: ${expectedTeamAddonCount}`);
      console.log(`[TEAM INVITE] Using actual team addon count: ${actualTeamAddonCount}`);

      if (actualTeamAddonCount === 0) {
        console.log(`[TEAM INVITE] No team member addons found - blocking invitation`);
        throw new PaymentRequiredError(
          'No team member addons found. Purchase team member addon to invite team members.',
          { needsUpgrade: true, currentPlan: userPlan, suggestedAddon: 'team-member' }
        );
      }

      const maxTeamSize = 1 + actualTeamAddonCount;

      console.log(`[TEAM INVITE] Team size check: Current: ${currentTeamSize}, After invite: ${totalTeamSizeAfterInvite}, Max: ${maxTeamSize}, Addons: ${actualTeamAddonCount}`);
      console.log(`[TEAM INVITE] User addons found:`, userAddons.map(a => `${a.type}:${a.isActive}`));
      console.log(`[TEAM INVITE] Actual team addon count used: ${actualTeamAddonCount}`);

      if (totalTeamSizeAfterInvite > maxTeamSize) {
        throw new PaymentRequiredError(
          `Team limit reached. You can have up to ${maxTeamSize} total members (including pending invitations). Current: ${currentTeamSize}, would become ${totalTeamSizeAfterInvite} after this invitation. Purchase additional team member addons to invite more members.`,
          { currentTeamSize, maxTeamSize, wouldBecome: totalTeamSizeAfterInvite, suggestedAddon: 'team-member' }
        );
      }
    }

    const invitation = await storage.createTeamInvitation({
      workspaceId,
      email,
      role,
      invitedBy: user.id,
      token: crypto.randomBytes(32).toString('hex'),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    console.log(`[TEAM INVITE] Successfully created invitation for ${email}`);
    this.sendSuccess(res, invitation);
  });

  deleteInvitation = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string; invitationId: string }>,
    res: Response
  ) => {
    const { workspaceId, invitationId } = InvitationIdParams.parse(req.params);
    const user = req.user!;

    const workspace = await storage.getWorkspace(workspaceId);
    if (!workspace || workspace.userId.toString() !== user.id.toString()) {
      throw new ForbiddenError('Not authorized to manage this workspace');
    }

    const invitation = await storage.getTeamInvitation(invitationId);
    if (!invitation || invitation.workspaceId?.toString() !== workspaceId) {
      throw new NotFoundError('Invitation not found');
    }

    await storage.updateTeamInvitation(invitationId, {
      status: 'cancelled'
    });

    console.log(`[TEAM INVITE] Cancelled invitation ${invitationId} for workspace ${workspaceId}`);

    this.sendSuccess(res, { success: true, message: 'Invitation cancelled successfully' });
  });
}

export const workspaceController = new WorkspaceController();
