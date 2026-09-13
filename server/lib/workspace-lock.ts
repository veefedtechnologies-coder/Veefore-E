/**
 * Shared workspace lock-annotation logic.
 *
 * A single source of truth for deciding which of a user's workspaces are
 * "locked" (over their current plan's limit). Used by EVERY place that
 * returns a workspace list to the client so the `locked` flag is consistent:
 *   - WorkspaceController.getUserWorkspaces  (GET /api/workspaces)
 *   - workspace.routes.ts GET /              (GET /api/workspaces-v2)
 *   - html-bootstrap.ts                      (SSR-seeded /api/workspaces cache)
 *
 * Data is NEVER deleted on downgrade — workspaces stay in the DB and remain
 * visible, but the ones beyond the plan limit are marked `locked: true`.
 *
 * Selection rule:
 *   1. The user's chosen `preferredWorkspaceIds` (set via the downgrade modal)
 *      are kept accessible first, in order, up to the plan limit.
 *   2. Any remaining accessible slots are filled with the OLDEST workspaces.
 *   3. Everything else is locked.
 */

/**
 * Resolve the Mongo `_id` for a user given either a Mongo `_id` OR a Firebase
 * UID. Entitlement/subscription records are keyed by Mongo `_id`, but callers
 * pass different id shapes (`req.user.id` vs `req.user.firebaseUid`), which was
 * the cause of silent plan-lookup misses.
 */
export async function resolveMongoUserId(idOrUid: string): Promise<string> {
  try {
    const { User } = await import('../models/User/User');
    // Mongo ObjectId hex is 24 chars. Build a safe $or that only includes an
    // `_id` clause when the input actually looks like an ObjectId (a non-hex
    // value passed to `_id` throws a CastError).
    const or: any[] = [{ firebaseUid: idOrUid }];
    if (/^[a-f0-9]{24}$/i.test(idOrUid)) or.push({ _id: idOrUid });

    const doc = await User.findOne({ $or: or }).select('_id').lean().catch(() => null);
    return doc ? String((doc as any)._id) : idOrUid;
  } catch {
    return idOrUid;
  }
}

export interface WorkspaceLockState {
  /** Workspaces annotated with `locked: true` where over the plan limit. */
  annotated: any[];
  /**
   * True when the user is over their plan limit AND has NOT yet made an
   * explicit workspace selection covering all their allowed slots. The client
   * uses this to force the (mandatory) workspace-selection modal. Once the user
   * confirms a selection (preferredWorkspaceIds is filled to the plan limit),
   * this becomes false even though some workspaces remain locked.
   */
  requiresSelection: boolean;
  /** The plan's workspace limit (Infinity for unlimited). */
  planLimit: number;
  /** How many workspaces are locked. */
  lockedCount: number;
}

/**
 * Compute the full lock state for a user's workspace list: which are locked,
 * and whether a mandatory selection is still required.
 *
 * @param userIdOrUid  Either the Mongo `_id` or Firebase UID of the user.
 * @param workspaces   The user's workspaces (Mongoose docs or plain objects).
 */
export async function computeWorkspaceLockState(
  userIdOrUid: string,
  workspaces: any[],
): Promise<WorkspaceLockState> {
  const empty: WorkspaceLockState = {
    annotated: workspaces,
    requiresSelection: false,
    planLimit: Infinity,
    lockedCount: 0,
  };

  if (!Array.isArray(workspaces) || workspaces.length === 0) return empty;

  try {
    const { getEntitlementService } = await import('../features/subscription/services/EntitlementService');
    const { getRedisClient } = await import('./redis');
    const SubscriptionRepository = (await import('../features/subscription/db/repositories/SubscriptionRepository')).default;

    // Entitlement records are keyed by Mongo _id — resolve it up front so the
    // plan lookup can't silently miss when a firebaseUid was passed.
    const mongoUserId = await resolveMongoUserId(userIdOrUid);

    const entitlementService = getEntitlementService(getRedisClient(), new SubscriptionRepository());
    const plan = await entitlementService.getPlan(mongoUserId);

    // Enterprise → never lock
    if (plan === 'enterprise') return empty;

    const maxWorkspaces = await entitlementService.getLimit(mongoUserId, 'maxWorkspaces');

    // Unlimited or within limit → nothing to lock
    if (maxWorkspaces === Infinity || maxWorkspaces >= workspaces.length) {
      return { ...empty };
    }

    // Resolve the user's preferred workspace IDs (chosen via the downgrade modal)
    const { User } = await import('../models/User/User');
    const userDoc = await User.findById(mongoUserId).select('preferredWorkspaceIds').lean().catch(() => null);
    const preferred: string[] = (userDoc as any)?.preferredWorkspaceIds ?? [];
    const allIds = workspaces.map((w: any) => String(w._id ?? w.id));

    const validPreferred = preferred.filter((id) => allIds.includes(id));
    const accessibleSet = new Set<string>(validPreferred.slice(0, maxWorkspaces));

    if (accessibleSet.size < maxWorkspaces) {
      const sorted = [...workspaces].sort(
        (a: any, b: any) =>
          new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
      );
      for (const w of sorted) {
        if (accessibleSet.size >= maxWorkspaces) break;
        accessibleSet.add(String(w._id ?? w.id));
      }
    }

    const annotated = workspaces.map((w: any) => {
      const wid = String(w._id ?? w.id);
      if (accessibleSet.has(wid)) return w;
      const plain = typeof w.toObject === 'function' ? w.toObject() : { ...w };
      return {
        ...plain,
        locked: true,
        lockedReason: `Upgrade your plan to access more than ${maxWorkspaces} workspace${maxWorkspaces === 1 ? '' : 's'}`,
      };
    });

    const lockedCount = annotated.filter((w: any) => w.locked).length;

    // A mandatory selection is required whenever the user's explicitly-chosen
    // set doesn't EXACTLY match their current plan limit:
    //   - fewer than the limit (or none)  → they haven't finished choosing
    //   - MORE than the limit             → they downgraded again to a smaller
    //     limit than their previous pick, so they must re-choose which to keep
    // Once `validPreferred.length === maxWorkspaces`, the choice is settled and
    // the modal stops forcing (even though other workspaces remain locked).
    const requiresSelection = validPreferred.length !== maxWorkspaces;

    return { annotated, requiresSelection, planLimit: maxWorkspaces, lockedCount };
  } catch (err) {
    // Fail open — never trap a user out of their workspace list on an
    // entitlement error.
    console.warn('[workspace-lock] lock-state computation failed (non-fatal):', err);
    return empty;
  }
}

/**
 * Annotate a workspace list with `locked: true` for workspaces beyond the
 * user's current plan limit. Returns a NEW array (never mutates input docs).
 * Thin wrapper over computeWorkspaceLockState for callers that only need the
 * annotated list.
 */
export async function annotateWorkspacesWithLock(
  userIdOrUid: string,
  workspaces: any[],
): Promise<any[]> {
  const state = await computeWorkspaceLockState(userIdOrUid, workspaces);
  return state.annotated;
}

/**
 * Given a user's workspace list + plan limit resolution, return the set of
 * workspace IDs that are ACCESSIBLE (not locked). Used by the access-time
 * middleware so it enforces the exact same selection the annotation produces.
 *
 * Returns `null` when nothing should be locked (enterprise / unlimited / within
 * limit), signalling "all accessible".
 */
export async function resolveAccessibleWorkspaceIds(
  userIdOrUid: string,
  workspaces: any[],
): Promise<Set<string> | null> {
  if (!Array.isArray(workspaces) || workspaces.length === 0) return null;

  const { getEntitlementService } = await import('../features/subscription/services/EntitlementService');
  const { getRedisClient } = await import('./redis');
  const SubscriptionRepository = (await import('../features/subscription/db/repositories/SubscriptionRepository')).default;

  const mongoUserId = await resolveMongoUserId(userIdOrUid);
  const entitlementService = getEntitlementService(getRedisClient(), new SubscriptionRepository());

  const plan = await entitlementService.getPlan(mongoUserId);
  if (plan === 'enterprise') return null;

  const maxWorkspaces = await entitlementService.getLimit(mongoUserId, 'maxWorkspaces');
  if (maxWorkspaces === Infinity || maxWorkspaces >= workspaces.length) return null;

  const { User } = await import('../models/User/User');
  const userDoc = await User.findById(mongoUserId).select('preferredWorkspaceIds').lean().catch(() => null);
  const preferred: string[] = (userDoc as any)?.preferredWorkspaceIds ?? [];
  const allIds = workspaces.map((w: any) => String(w._id ?? w.id));

  const validPreferred = preferred.filter((id) => allIds.includes(id));
  const accessibleSet = new Set<string>(validPreferred.slice(0, maxWorkspaces));

  if (accessibleSet.size < maxWorkspaces) {
    const sorted = [...workspaces].sort(
      (a: any, b: any) =>
        new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime(),
    );
    for (const w of sorted) {
      if (accessibleSet.size >= maxWorkspaces) break;
      accessibleSet.add(String(w._id ?? w.id));
    }
  }

  return accessibleSet;
}
