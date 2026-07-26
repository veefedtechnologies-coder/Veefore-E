import mongoose from 'mongoose';
import { WorkspacePlan, IWorkspace, WorkspaceModel } from '../models/Workspace/WorkspaceModel';
import { WorkspaceMemberModel } from '../models/Workspace/WorkspaceMemberModel';
import { AuthorizedBrandModel, IAuthorizedBrand } from '../models/AuthorizedBrand/AuthorizedBrandModel';
import { User } from '../models/User/User';

// ─── Regex Helper ─────────────────────────────────────────────────────────────

/**
 * Escape special regex characters so user-supplied workspace names can be
 * safely embedded in a RegExp pattern for case-insensitive uniqueness checks.
 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Error ────────────────────────────────────────────────────────────────────

/**
 * WorkspaceError — domain error with a machine-readable code.
 * Used throughout WorkspaceService so route handlers can branch on `err.code`.
 */
export class WorkspaceError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'WorkspaceError';
  }
}

// ─── Plan Limits ──────────────────────────────────────────────────────────────

/**
 * PLAN_LIMITS — maximum workspace count per subscription plan.
 * null means unlimited (Enterprise default, unless a customWorkspaceLimit is set).
 *
 * Satisfies Requirements 2.1, 2.6
 */
export const PLAN_LIMITS: Record<WorkspacePlan, number | null> = {
  FREE: 1,
  STARTER: 2,
  PRO: 5,
  BUSINESS: 20,
  ENTERPRISE: null, // unlimited unless custom limit set
};

// ─── Interfaces ───────────────────────────────────────────────────────────────

/**
 * MetaPage — bridge type from the facebook-page-integration spec.
 * Represents a single authorized Facebook Page (and its linked Instagram account,
 * if any) as returned by Meta's /me/accounts API and passed to upsertAuthorizedBrands.
 */
export interface MetaPage {
  pageId: string;
  pageName: string;
  pageProfilePictureUrl: string;
  linkedInstagramAccountId: string | null;
  linkedInstagramUsername: string | null;
  accessToken: string;
  userAccessToken?: string; // long-lived User Access Token for Instagram
  tokenExpiresAt: Date;
  /** Reference to the UserAccessToken document from the facebook-page-integration spec */
  tokenRef: mongoose.Types.ObjectId;
}

/**
 * WorkspaceLimits — returned by GET /workspaces/limits.
 * Satisfies Requirement 2.6
 */
export interface WorkspaceLimits {
  currentCount: number;
  /** null = unlimited (Enterprise without a custom limit) */
  planLimit: number | null;
  /** null = unlimited; otherwise max(0, planLimit - currentCount) */
  remainingCapacity: number | null;
}

/**
 * CreateWorkspaceInput — payload for WorkspaceService.createWorkspace.
 * Satisfies Requirements 2.1, 2.2
 */
export interface CreateWorkspaceInput {
  /** Firebase UID of the user creating the workspace */
  ownerId: string;
  name: string;
  plan: WorkspacePlan;
}

/**
 * ImportBrandInput — payload for WorkspaceService.importAuthorizedBrand.
 * Satisfies Requirements 3.4, 3.5, 5.2, 5.3
 */
export interface ImportBrandInput {
  /** Firebase UID of the user importing the brand */
  userId: string;
  /** Meta Facebook Page ID from the AuthorizedBrand record */
  pageId: string;
  /** If provided, import into this existing workspace; otherwise create a new one */
  workspaceId?: string;
}

// ─── WorkspaceService ─────────────────────────────────────────────────────────

/**
 * WorkspaceService — orchestrates all workspace lifecycle operations including
 * plan-limit enforcement, Meta brand import, and workspace context management.
 *
 * All methods are stubs that throw 'Not implemented'; full implementations are
 * added in subsequent tasks of the workspace-meta-connection spec.
 */
export class WorkspaceService {
  /**
   * Create a new workspace for the given owner, enforcing plan limits atomically.
   * Also bootstraps an OWNER WorkspaceMember record.
   * Satisfies Requirements 1.1, 2.1, 2.2, 2.7, 10.1
   */
  async createWorkspace(input: CreateWorkspaceInput): Promise<IWorkspace> {
    const { ownerId, name, plan } = input;
    const session = await mongoose.startSession();
    try {
      return await session.withTransaction(async () => {
        // 1. Validate owner exists — look up by firebaseUid
        const user = await User.findOne({ firebaseUid: ownerId }).session(session).lean();
        if (!user) {
          throw new WorkspaceError('USER_NOT_FOUND', 'Owner does not exist');
        }

        // 2. Resolve plan limit (user.plan may be 'Free', 'Pro', etc. — normalise to uppercase)
        const userPlan = (String(user.plan).toUpperCase()) as WorkspacePlan;
        const limit = this.resolveLimit(
          userPlan,
          (user as any).customWorkspaceLimit ?? null,
        );

        // 3. Atomic count + limit check within the session
        const currentCount = await WorkspaceModel.countDocuments({
          ownerId,
          status: { $ne: 'DELETED' },
        }).session(session);

        if (limit !== null && currentCount >= limit) {
          throw new WorkspaceError(
            'WORKSPACE_LIMIT_REACHED',
            `Plan ${userPlan} allows a maximum of ${limit} workspace(s). Current count: ${currentCount}.`,
          );
        }

        // 4. Case-insensitive name uniqueness check
        const trimmedName = name.trim();
        const namePattern = new RegExp('^' + escapeRegExp(trimmedName.toLowerCase()) + '$', 'i');
        const duplicate = await WorkspaceModel.findOne({
          ownerId,
          status: { $ne: 'DELETED' },
          name: namePattern,
        }).session(session).lean();

        if (duplicate) {
          throw new WorkspaceError(
            'WORKSPACE_NAME_CONFLICT',
            'A workspace with this name already exists.',
          );
        }

        // 5. Create the workspace document
        const [workspace] = await WorkspaceModel.create(
          [{ ownerId, name: trimmedName, plan, status: 'ACTIVE' }],
          { session },
        );

        // 6. Bootstrap OWNER WorkspaceMember record
        await WorkspaceMemberModel.create(
          [{
            workspaceId: workspace._id,
            userId: ownerId,
            role: 'OWNER',
            status: 'ACTIVE',
            invitedAt: workspace.createdAt,
            joinedAt: workspace.createdAt,
          }],
          { session },
        );

        // 7. Return workspace
        return workspace;
      });
    } finally {
      await session.endSession();
    }
  }

  /**
   * Return the current workspace counts and remaining capacity for a user.
   * Satisfies Requirement 2.6
   */
  async getWorkspaceLimits(userId: string): Promise<WorkspaceLimits> {
    const user = await User.findOne({ firebaseUid: userId }).lean();
    if (!user) throw new WorkspaceError('USER_NOT_FOUND', 'User not found.');

    // Resolve the REAL plan from EntitlementService (backed by the Subscription
    // document) rather than the legacy User.plan field, which the Razorpay
    // subscription system never writes to and always reads back as its
    // schema default ("Free") for any paying user.
    const { getEntitlementService } = await import('../features/subscription/services/EntitlementService');
    const { getRedisClient } = await import('../lib/redis');
    const SubscriptionRepository = (await import('../features/subscription/db/repositories/SubscriptionRepository')).default;
    const entitlementService = getEntitlementService(getRedisClient(), new SubscriptionRepository());

    const mongoUserId = String((user as any)._id);
    const rawLimit = await entitlementService.getLimit(mongoUserId, 'maxWorkspaces');
    const planLimit = rawLimit === Infinity ? null : rawLimit;

    const currentCount = await WorkspaceModel.countDocuments({
      ownerId: userId,
      status: { $ne: 'DELETED' },
    });
    const remainingCapacity = planLimit === null ? null : Math.max(0, planLimit - currentCount);
    return { currentCount, planLimit, remainingCapacity };
  }

  /**
   * Return the user's currently active workspace, or null if none is set.
   * Satisfies Requirements 6.5, 6.7
   */
  async getActiveWorkspace(userId: string): Promise<IWorkspace | null> {
    const user = await User.findOne({ firebaseUid: userId }).lean();
    if (!user) return null;
    const activeId = (user as any).activeWorkspaceId;
    if (activeId) {
      const workspace = await WorkspaceModel.findOne({
        _id: activeId,
        status: { $ne: 'DELETED' },
      });
      // Validate user is a member
      if (workspace) {
        const { WorkspaceMemberModel } = await import('../models/Workspace/WorkspaceMemberModel');
        const member = await WorkspaceMemberModel.findOne({
          workspaceId: workspace._id,
          userId,
          status: 'ACTIVE',
        });
        if (member) return workspace;
      }
    }
    // Fall back to oldest ACTIVE workspace owned by the user
    return WorkspaceModel.findOne({ ownerId: userId, status: 'ACTIVE' }).sort({ createdAt: 1 });
  }

  /**
   * Switch the user's active workspace to the specified workspaceId.
   * Satisfies Requirements 6.1, 6.2, 7.4
   */
  async switchWorkspace(userId: string, workspaceId: string): Promise<void> {
    const { WorkspaceMemberModel } = await import('../models/Workspace/WorkspaceMemberModel');
    const member = await WorkspaceMemberModel.findOne({ workspaceId, userId, status: 'ACTIVE' });
    if (!member) throw new WorkspaceError('WORKSPACE_ACCESS_DENIED', 'You are not a member of this workspace.');
    await User.updateOne({ firebaseUid: userId }, { activeWorkspaceId: workspaceId });
  }

  /**
   * Import an authorized brand (Facebook Page + optional Instagram) into a workspace,
   * creating the workspace if no workspaceId is provided.
   * Satisfies Requirements 3.4, 3.5, 5.2, 5.3, 5.4
   */
  async importAuthorizedBrand(input: ImportBrandInput): Promise<IWorkspace> {
    // 1. Fetch the AuthorizedBrand record
    const brand = await AuthorizedBrandModel.findOne(
      { userId: input.userId, pageId: input.pageId }
    );
    if (!brand) {
      throw new WorkspaceError('BRAND_NOT_FOUND', 'Authorized brand not found.');
    }

    // 2. Check token expiry
    if (brand.tokenExpiresAt < new Date()) {
      await AuthorizedBrandModel.updateOne(
        { _id: brand._id },
        { status: 'EXPIRED' }
      );
      throw new WorkspaceError('TOKEN_EXPIRED', 'Authorization expired. Please reconnect Meta.');
    }

    // 3. Create or use existing workspace
    let workspace: IWorkspace;
    if (input.workspaceId) {
      const existing = await WorkspaceModel.findById(input.workspaceId);
      if (!existing) throw new WorkspaceError('WORKSPACE_NOT_FOUND', 'Workspace not found.');
      workspace = existing;

      // HARD RULE: One brand per workspace — check if workspace already has social accounts
      const { SocialAccountModel } = await import('../models/Social/SocialAccount');
      const existingAccounts = await SocialAccountModel.countDocuments({
        workspaceId: input.workspaceId.toString(),
        connectionStatus: 'ACTIVE',
        isActive: true,
      });
      if (existingAccounts > 0) {
        throw new WorkspaceError(
          'WORKSPACE_LIMIT_REACHED',
          'This workspace already has a brand connected. Each workspace can only manage one brand. Please create a new workspace to connect another brand, or upgrade your plan to add more workspaces.'
        );
      }
    } else {
      // Create workspace without a session (no transaction needed for onboarding)
      //
      // BUG FIX: `input.plan` does not exist on ImportBrandInput and was always
      // undefined here, so this ALWAYS fell back to the Free plan's limit of 1
      // — meaning users on Creator/Pro/Business could never create a second
      // workspace through the brand-selection flow, regardless of their real
      // plan. Resolve the actual plan from EntitlementService (the single
      // source of truth, backed by the Subscription document) instead.
      //
      // input.userId here is the caller's Firebase UID (see
      // authorized-brands.routes.ts), but EntitlementService keys Subscription
      // documents by the Mongo _id — resolve that first.
      const userDoc = await User.findOne({ firebaseUid: input.userId }).select('_id').lean();
      const mongoUserId = userDoc ? String((userDoc as any)._id) : input.userId;

      const { getEntitlementService } = await import('../features/subscription/services/EntitlementService');
      const { getRedisClient } = await import('../lib/redis');
      const SubscriptionRepository = (await import('../features/subscription/db/repositories/SubscriptionRepository')).default;
      const entitlementService = getEntitlementService(getRedisClient(), new SubscriptionRepository());

      const effectivePlan = await entitlementService.getPlan(mongoUserId);
      const limit = await entitlementService.getLimit(mongoUserId, 'maxWorkspaces');
      const currentCount = await WorkspaceModel.countDocuments({
        ownerId: input.userId,
        status: { $ne: 'DELETED' },
      });
      if (limit !== Infinity && currentCount >= limit) {
        throw new WorkspaceError(
          'WORKSPACE_LIMIT_REACHED',
          `Your ${effectivePlan} plan allows a maximum of ${limit} workspace(s). You currently have ${currentCount}.`
        );
      }
      const [createdWs] = await WorkspaceModel.create([{
        ownerId: input.userId,
        name: brand.pageName.trim(),
        plan: 'FREE',
        status: 'ACTIVE',
      }]);
      workspace = createdWs;
      // Create workspace member record
      try {
        await WorkspaceMemberModel.create([{
          workspaceId: workspace._id,
          userId: input.userId,
          role: 'OWNER',
          status: 'ACTIVE',
          invitedAt: workspace.createdAt ?? new Date(),
          joinedAt: workspace.createdAt ?? new Date(),
        }]);
      } catch (memberErr: any) {
        console.warn('[importAuthorizedBrand] WorkspaceMember creation failed (non-fatal):', memberErr?.message);
      }
    }

    // 4. Import Facebook Page SocialAccount
    await this.importSocialAccountDirect({
      platform: 'facebook',
      accountId: brand.pageId,
      pageName: brand.pageName,
      profilePictureUrl: brand.pageProfilePictureUrl,
      workspaceId: workspace._id,
      userId: input.userId,
      accessToken: (brand as any).accessToken || undefined,
      linkedInstagramAccountId: brand.linkedInstagramAccountId || undefined,
    });

    // 5. Import Instagram account if present
    if (brand.linkedInstagramAccountId) {
      await this.importSocialAccountDirect({
        platform: 'instagram',
        accountId: brand.linkedInstagramAccountId,
        pageName: brand.linkedInstagramUsername || brand.pageName,
        profilePictureUrl: brand.pageProfilePictureUrl,
        workspaceId: workspace._id,
        userId: input.userId,
        accessToken: (brand as any).userAccessToken || (brand as any).accessToken || undefined,
        linkedFacebookPageId: brand.pageId,
      });
    }

    // After creating the workspace_v2 record, also create a matching legacy workspace
    // so all existing API endpoints (analytics, social accounts, etc.) can find it.
    // The legacy 'workspaces' collection is used by validateWorkspaceAccess and
    // most analytics/social-account middleware.
    try {
      const conn = mongoose.connection;
      if (conn && conn.db) {
        const legacyExists = await conn.db.collection('workspaces').findOne({
          _id: workspace._id,
        });
        if (!legacyExists) {
          // BUG FIX: this previously always inserted with `isDefault: true`,
          // even when the user already had another workspace marked default.
          // That left TWO legacy workspace docs with isDefault:true, which
          // `defaultWorkspaceEnforcer` (server/middleware/default-workspace-
          // enforcer.ts) detects as an inconsistent state on the very next API
          // call and "fixes" by forcing the default back to workspaces[0] —
          // i.e. the user's original/oldest workspace. That's why creating a
          // second workspace appeared to silently redirect back to the first
          // one: the new workspace WAS created and the brand WAS imported into
          // it, but the user was bounced back to their original workspace
          // before ever seeing it, making it look like nothing happened.
          const hasExistingDefault = await conn.db.collection('workspaces').findOne({
            userId: input.userId,
            isDefault: true,
          });

          await conn.db.collection('workspaces').insertOne({
            _id: workspace._id,
            userId: input.userId,
            name: workspace.name,
            description: '',
            isDefault: !hasExistingDefault,
            plan: 'free',
            credits: 50,
            members: [{ userId: input.userId, role: 'owner', joinedAt: workspace.createdAt ?? new Date() }],
            settings: { autoSync: true, notifications: true, timezone: 'UTC' },
            addons: [],
            createdAt: workspace.createdAt ?? new Date(),
            updatedAt: new Date(),
          });
          console.log(`[importAuthorizedBrand] Created legacy workspace mirror: ${workspace._id} (isDefault=${!hasExistingDefault})`);
        }
      }
    } catch (legacyErr: any) {
      console.warn('[importAuthorizedBrand] Legacy workspace mirror failed (non-fatal):', legacyErr?.message);
    }

    // 6. Mark brand as IMPORTED
    await AuthorizedBrandModel.updateOne(
      { _id: brand._id },
      { status: 'IMPORTED' }
    );

    // Also mark user as onboarded on the server side directly — this ensures
    // isOnboarded=true even if the client-side complete-onboarding call fails.
    try {
      const { storage } = await import('../mongodb-storage');
      const user = await storage.getUserByFirebaseUid(input.userId).catch(() => null);
      if (user && !user.isOnboarded) {
        await storage.updateUser(user.id, {
          isOnboarded: true,
          onboardingCompletedAt: new Date(),
        });
        console.log(`[importAuthorizedBrand] Marked user ${user.id} as onboarded`);
      }
    } catch (onboardErr: any) {
      console.warn('[importAuthorizedBrand] Failed to mark user as onboarded (non-fatal):', onboardErr?.message);
    }

    // 7. Trigger background metrics sync so data appears immediately on the dashboard
    const workspaceIdStr = workspace._id.toString();
    try {
      const { MetricsQueueManager } = await import('../queues/metricsQueue');
      const fbToken = (brand as any).accessToken;
      const igToken = (brand as any).userAccessToken || (brand as any).accessToken;

      // Schedule Facebook Page metrics fetch
      if (fbToken) {
        MetricsQueueManager.scheduleMetricsFetch(
          workspaceIdStr,
          'system',
          brand.pageId,
          fbToken,
          'all',
          { forceRefresh: true, priority: 5 }
        ).catch((err: Error) => console.warn('[importAuthorizedBrand] FB metrics schedule failed:', err.message));
        console.log(`[importAuthorizedBrand] Scheduled FB Page metrics for ${brand.pageId}`);
      }

      // Schedule Instagram connect-init if instagram account exists
      if (brand.linkedInstagramAccountId && igToken) {
        await MetricsQueueManager.enqueueConnectInit({
          workspaceId: workspaceIdStr,
          instagramAccountId: brand.linkedInstagramAccountId,
          token: igToken,
          username: brand.linkedInstagramUsername || brand.pageName,
        }).catch((err: Error) => console.warn('[importAuthorizedBrand] IG connect-init failed:', err.message));
        console.log(`[importAuthorizedBrand] Enqueued IG connect-init for ${brand.linkedInstagramAccountId}`);
      }

      // Schedule Facebook insights prewarm (24-month history)
      const { prewarmFacebookInsightsForWorkspace } = await import('../features/facebook/analytics/facebookInsightsHistory');
      prewarmFacebookInsightsForWorkspace(workspaceIdStr)
        .catch((err: Error) => console.warn('[importAuthorizedBrand] FB prewarm failed:', err.message));
      console.log(`[importAuthorizedBrand] Enqueued FB insights prewarm for workspace ${workspaceIdStr}`);
    } catch (syncErr: any) {
      console.warn('[importAuthorizedBrand] Post-import sync failed (non-fatal):', syncErr?.message);
    }

    return workspace;
  }

  /** Direct (non-transactional) social account upsert for onboarding import. */
  private async importSocialAccountDirect(params: {
    platform: string;
    accountId: string;
    pageName: string;
    profilePictureUrl: string;
    workspaceId: any;
    userId: string;
    accessToken?: string;
    /** For Facebook: the linked Instagram account ID */
    linkedInstagramAccountId?: string;
    /** For Instagram: the linked Facebook page ID */
    linkedFacebookPageId?: string;
  }): Promise<void> {
    const { SocialAccountModel } = await import('../models/Social/SocialAccount');
    await SocialAccountModel.findOneAndUpdate(
      { platform: params.platform, accountId: params.accountId },
      {
        $set: {
          platform: params.platform,
          accountId: params.accountId,
          username: params.pageName,
          pageName: params.pageName,
          profilePictureUrl: params.profilePictureUrl,
          workspaceId: params.workspaceId.toString(),
          connectionStatus: 'ACTIVE',
          connectedAt: new Date(),
          lastSyncAt: new Date(),
          isActive: true,
          tokenStatus: params.accessToken ? 'valid' : 'missing',
          ...(params.accessToken ? { accessToken: params.accessToken } : {}),
          // Store cross-platform link metadata for grouping in the UI
          platformMetadata: {
            ...(params.linkedInstagramAccountId ? { linkedInstagramAccountId: params.linkedInstagramAccountId } : {}),
            ...(params.linkedFacebookPageId ? { linkedFacebookPageId: params.linkedFacebookPageId } : {}),
          },
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  /**
   * Upsert AuthorizedBrand records for each page returned by Meta OAuth.
   * Idempotent — safe to call multiple times for the same user + page.
   * Satisfies Requirements 3.1, 3.4, 8.1, 8.6
   */
  async upsertAuthorizedBrands(userId: string, pages: MetaPage[]): Promise<IAuthorizedBrand[]> {
    const results: IAuthorizedBrand[] = [];
    for (const page of pages) {
      const updateFields: Record<string, any> = {
        pageName: page.pageName,
        pageProfilePictureUrl: page.pageProfilePictureUrl,
        linkedInstagramAccountId: page.linkedInstagramAccountId,
        linkedInstagramUsername: page.linkedInstagramUsername,
        authorizationTokenRef: page.tokenRef,
        tokenExpiresAt: page.tokenExpiresAt,
        authorizedAt: new Date(),
        // Store the actual access token so importAuthorizedBrand can use it
        accessToken: page.accessToken || null,
        userAccessToken: page.userAccessToken || null,
        // Always reset to INACTIVE on fresh OAuth so user can pick workspace
        status: 'INACTIVE',
      };
      const brand = await AuthorizedBrandModel.findOneAndUpdate(
        { userId, pageId: page.pageId },
        { $set: updateFields },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      results.push(brand);
    }
    return results;
  }

  /**
   * Rename a workspace, enforcing uniqueness and length constraints.
   * Satisfies Requirements 9.1, 9.2
   */
  async renameWorkspace(workspaceId: string, newName: string, userId: string): Promise<IWorkspace> {
    const trimmed = newName.trim();
    if (!trimmed || trimmed.length < 1 || trimmed.length > 100) {
      throw new WorkspaceError('INVALID_WORKSPACE_NAME', 'Workspace name must be between 1 and 100 characters.');
    }
    // Case-insensitive uniqueness check
    const namePattern = new RegExp('^' + escapeRegExp(trimmed.toLowerCase()) + '$', 'i');
    const duplicate = await WorkspaceModel.findOne({
      ownerId: userId,
      status: { $ne: 'DELETED' },
      name: namePattern,
      _id: { $ne: workspaceId },
    });
    if (duplicate) throw new WorkspaceError('WORKSPACE_NAME_CONFLICT', 'A workspace with this name already exists.');
    const updated = await WorkspaceModel.findOneAndUpdate(
      { _id: workspaceId, ownerId: userId, status: { $ne: 'DELETED' } },
      { name: trimmed, updatedAt: new Date() },
      { new: true }
    );
    if (!updated) throw new WorkspaceError('NOT_FOUND_OR_UNAUTHORIZED', 'Workspace not found or access denied.');
    return updated;
  }

  /**
   * Soft-delete a workspace, cascading to WorkspaceMember and SocialAccount records.
   * Prevents deletion of the user's last active workspace.
   * Satisfies Requirements 1.6, 9.3, 9.4, 9.5
   */
  async deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // 1. Load workspace and verify ownership
        const workspace = await WorkspaceModel.findById(workspaceId).session(session);
        if (!workspace || workspace.ownerId !== userId) {
          throw new WorkspaceError('NOT_FOUND_OR_UNAUTHORIZED', 'Workspace not found or access denied.');
        }

        // 2. Prevent deletion of last ACTIVE workspace
        const activeCount = await WorkspaceModel.countDocuments({
          ownerId: userId,
          status: 'ACTIVE',
        }).session(session);
        if (activeCount <= 1) {
          throw new WorkspaceError('CANNOT_DELETE_LAST_WORKSPACE', 'Cannot delete your only active workspace.');
        }

        // 3. Soft-delete workspace
        await WorkspaceModel.updateOne({ _id: workspaceId }, { status: 'DELETED' }, { session });

        // 4. Cascade: mark all WorkspaceMember records as DELETED
        await WorkspaceMemberModel.updateMany(
          { workspaceId },
          { status: 'DELETED' },
          { session }
        );

        // 5. Cascade: mark all SocialAccounts as DISCONNECTED (import model lazily)
        const { SocialAccountModel } = await import('../models/Social/SocialAccount');
        await SocialAccountModel.updateMany(
          { workspaceId },
          { connectionStatus: 'DISCONNECTED' },
          { session }
        );

        // 6. Update user's activeWorkspaceId to the oldest remaining ACTIVE workspace
        const nextWorkspace = await WorkspaceModel.findOne({
          ownerId: userId,
          status: 'ACTIVE',
          _id: { $ne: workspaceId },
        }).sort({ createdAt: 1 }).session(session);

        await User.updateOne(
          { firebaseUid: userId },
          { activeWorkspaceId: nextWorkspace?._id || null },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }
  }

  /**
   * Return all non-deleted workspaces owned by the given user.
   * Satisfies Requirement 7.3
   */
  async getUserWorkspaces(userId: string): Promise<IWorkspace[]> {
    return WorkspaceModel.find({ ownerId: userId, status: { $ne: 'DELETED' } }).sort({ createdAt: 1 });
  }

  /**
   * Alias for getUserWorkspaces — used by legacy WorkspaceController which
   * calls getWorkspacesByUserId(). Keeps backward compatibility without
   * requiring the controller to be refactored.
   */
  async getWorkspacesByUserId(userId: string): Promise<IWorkspace[]> {
    return this.getUserWorkspaces(userId);
  }

  /**
   * Return a single workspace by ID, ensuring the requesting user is a member.
   * Returns null if not found or user is not a member.
   * Satisfies Requirement 6.4
   */
  async getWorkspaceById(workspaceId: string, userId: string): Promise<IWorkspace | null> {
    const { WorkspaceMemberModel } = await import('../models/Workspace/WorkspaceMemberModel');
    const member = await WorkspaceMemberModel.findOne({ workspaceId, userId, status: 'ACTIVE' });
    if (!member) return null;
    return WorkspaceModel.findOne({ _id: workspaceId, status: { $ne: 'DELETED' } });
  }

  /**
   * Called when a user's subscription plan is downgraded.
   * If the user has more workspaces than the new plan allows, marks the
   * most recently created excess workspaces as SUSPENDED (descending createdAt order).
   * The oldest M workspaces remain ACTIVE, where M = new plan limit.
   * Satisfies Requirement 2.4
   */
  async handlePlanDowngrade(userId: string, newPlan: WorkspacePlan, customLimit?: number | null): Promise<{
    suspendedCount: number;
    suspendedWorkspaceIds: string[];
  }> {
    const newLimit = this.resolveLimit(newPlan, customLimit ?? null);

    // Fetch all non-deleted workspaces sorted oldest-first
    const workspaces = await WorkspaceModel.find({
      ownerId: userId,
      status: { $ne: 'DELETED' },
    }).sort({ createdAt: 1 });

    if (newLimit === null || workspaces.length <= newLimit) {
      // No suspension needed
      return { suspendedCount: 0, suspendedWorkspaceIds: [] };
    }

    // The M oldest stay ACTIVE; the remainder (most recently created) get SUSPENDED
    const toSuspend = workspaces.slice(newLimit); // descending by recency (they were sorted asc)

    const suspendedIds = toSuspend.map(w => String(w._id));

    await WorkspaceModel.updateMany(
      { _id: { $in: suspendedIds } },
      { status: 'SUSPENDED' }
    );

    return {
      suspendedCount: suspendedIds.length,
      suspendedWorkspaceIds: suspendedIds,
    };
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Resolve the effective workspace limit for a given plan, respecting any
   * Enterprise-only custom override.
   * Satisfies Requirement 2.5
   */
  private resolveLimit(plan: WorkspacePlan, customLimit?: number | null): number | null {
    if (plan === 'ENTERPRISE') {
      return customLimit ?? null;
    }
    return PLAN_LIMITS[plan] ?? PLAN_LIMITS['FREE'];
  }

  /**
   * Determine whether the status of an AuthorizedBrand should be reset to INACTIVE
   * when performing an upsert. Returns true if the brand has not yet been imported.
   * Satisfies Requirement 3.4
   */
  private async shouldResetStatus(userId: string, pageId: string): Promise<boolean> {
    const brand = await AuthorizedBrandModel.findOne({ userId, pageId }).lean();
    return !brand || brand.status !== 'IMPORTED';
  }

  /**
   * Creates a workspace within an existing Mongoose session (no new session).
   * Enforces plan limits and bootstraps the OWNER WorkspaceMember record.
   * Satisfies Requirements 2.1, 2.7, 10.1
   */
  private async createWorkspaceInSession(
    input: CreateWorkspaceInput,
    session: mongoose.ClientSession | null
  ): Promise<IWorkspace> {
    const limit = this.resolveLimit(input.plan);
    const countQuery = WorkspaceModel.countDocuments({
      ownerId: input.ownerId,
      status: { $ne: 'DELETED' },
    });
    if (session) countQuery.session(session);
    const currentCount = await countQuery;
    if (limit !== null && currentCount >= limit) {
      throw new WorkspaceError(
        'WORKSPACE_LIMIT_REACHED',
        `Plan ${input.plan} allows a maximum of ${limit} workspace(s).`
      );
    }
    const createOptions = session ? { session } : {};
    const [workspace] = await WorkspaceModel.create(
      [{ ownerId: input.ownerId, name: input.name.trim(), plan: input.plan, status: 'ACTIVE' }],
      createOptions
    );
    await WorkspaceMemberModel.create(
      [{
        workspaceId: workspace._id,
        userId: input.ownerId,
        role: 'OWNER',
        status: 'ACTIVE',
        invitedAt: workspace.createdAt,
        joinedAt: workspace.createdAt,
      }],
      createOptions
    );
    return workspace;
  }

  /**
   * Imports a single SocialAccount within an existing Mongoose session.
   * Maps pageName → username (required field on SocialAccountModel).
   * Throws SOCIAL_ACCOUNT_ALREADY_IMPORTED on duplicate key violation.
   * Satisfies Requirements 1.5, 3.5, 5.4
   */
  private async importSocialAccountInSession(
    params: {
      platform: string;
      accountId: string;
      pageName: string;
      profilePictureUrl: string;
      workspaceId: any;
      userId: string;
    },
    session: mongoose.ClientSession
  ): Promise<void> {
    const { SocialAccountModel } = await import('../models/Social/SocialAccount');
    try {
      // Use upsert so that if the Settings OAuth flow already created this record,
      // we update it to point to the new workspace instead of throwing a duplicate error.
      await SocialAccountModel.findOneAndUpdate(
        {
          platform: params.platform,
          accountId: params.accountId,
        },
        {
          $set: {
            platform: params.platform,
            accountId: params.accountId,
            username: params.pageName,
            pageName: params.pageName,
            profilePictureUrl: params.profilePictureUrl,
            workspaceId: params.workspaceId,
            connectionStatus: 'ACTIVE',
            connectedAt: new Date(),
            lastSyncAt: new Date(),
            isActive: true,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true, new: true, session, setDefaultsOnInsert: true }
      );
    } catch (err: any) {
      // Still catch unexpected errors but allow duplicates to be handled via upsert
      if (err.code === 11000 || err.name === 'MongoServerError') {
        throw new WorkspaceError(
          'SOCIAL_ACCOUNT_ALREADY_IMPORTED',
          `Account ${params.accountId} (${params.platform}) is already active in another workspace.`
        );
      }
      throw err;
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const workspaceService = new WorkspaceService();
