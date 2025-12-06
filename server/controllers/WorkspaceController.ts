import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { workspaceService } from '../services';
import { storage } from '../mongodb-storage';
import { NotFoundError, ForbiddenError, PaymentRequiredError, ConflictError } from '../errors';

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
    const userId = req.user!.id;
    const workspaces = await workspaceService.getWorkspacesByUserId(userId);
    this.sendSuccess(res, workspaces);
  });

  createWorkspace = this.wrapAsync(async (
    req: TypedRequest<{}, z.infer<typeof CreateWorkspaceSchema>>,
    res: Response
  ) => {
    const userId = req.user!.id;
    const input = CreateWorkspaceSchema.parse(req.body);
    const workspace = await workspaceService.createWorkspace({
      userId,
      name: input.name,
      description: input.description,
      theme: input.theme,
      aiPersonality: input.aiPersonality,
    });
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

    const user = await storage.getUser(userId);
    const name = user?.displayName ? `${user.displayName}'s Workspace` : 'My Workspace';
    const created = await storage.createWorkspace({ name, userId, isDefault: true, theme: 'space' });
    this.sendSuccess(res, { success: true, workspaceId: created.id, created: true });
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
      token: Math.random().toString(36).substring(2, 15),
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
