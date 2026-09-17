/**
 * Tenant isolation helper (spec: production-security-hardening, Requirement 13).
 *
 * `server/middleware/workspace-validation.ts` provides Express MIDDLEWARE guards,
 * which work when the workspace id arrives in a fixed, known location. This module
 * provides the same authorization decision as a plain FUNCTION, for the cases the
 * middleware cannot express:
 *
 *   - the workspace id is only discoverable AFTER a database lookup (e.g. an
 *     endpoint addressed by `accountId`, where the owning workspace comes from the
 *     resolved row) — the classic IDOR shape;
 *   - the id may arrive in one of several mutually exclusive body fields, so a
 *     fixed-source middleware would reject legitimate request forms.
 *
 * Fails CLOSED: any error, missing user, or missing id yields `false`. An
 * availability problem must never widen access.
 */

import type { Request, Response, NextFunction } from 'express';
import { recordAuthEventFromRequest } from './auth-audit';

/**
 * True when the authenticated user on `req` is a member of `workspaceId`.
 *
 * Membership is resolved through the same legacy storage call the middleware
 * guards use (`getWorkspacesByUserId`), so this function and the middleware can
 * never disagree about who has access.
 */
export async function userCanAccessWorkspace(
  req: Request,
  workspaceId: string | null | undefined
): Promise<boolean> {
  try {
    const userId = (req as any)?.user?.id;
    if (!userId) return false;

    const target = String(workspaceId ?? '').trim();
    if (!target) return false;

    const { storage } = await import('../mongodb-storage');
    const workspaces = await storage.getWorkspacesByUserId(String(userId));
    if (!Array.isArray(workspaces)) return false;

    return workspaces.some((w: any) => String(w?.id ?? w?._id ?? '') === target);
  } catch (error) {
    console.error('[workspace-access] membership check failed — denying:', error);
    return false;
  }
}

/**
 * Resolve the caller's own workspace ids. Useful for endpoints that should
 * operate across "all my workspaces" without ever trusting a client-supplied id.
 * Returns an empty array on any failure (fail closed).
 */
export async function listAccessibleWorkspaceIds(req: Request): Promise<string[]> {
  try {
    const userId = (req as any)?.user?.id;
    if (!userId) return [];

    const { storage } = await import('../mongodb-storage');
    const workspaces = await storage.getWorkspacesByUserId(String(userId));
    if (!Array.isArray(workspaces)) return [];

    return workspaces
      .map((w: any) => String(w?.id ?? w?._id ?? ''))
      .filter((id) => id.length > 0);
  } catch (error) {
    console.error('[workspace-access] failed to list workspaces — denying:', error);
    return [];
  }
}

/**
 * Express middleware factory: authorize a request addressed by RESOURCE id.
 *
 * This closes the IDOR shape where a route is keyed by an opaque resource id
 * (`:ruleId`, `:analyticsId`, `:accountId`) rather than a workspace id. The
 * workspace is not in the request at all — it has to be discovered by loading the
 * resource — so none of the fixed-source middleware guards can express it, and
 * `requireAuth` alone proves only that SOMEONE is logged in.
 *
 * @param paramName        Route param holding the resource id.
 * @param resolveWorkspace Loads the owning workspace id for that resource.
 *                         Return null/undefined when the resource does not exist.
 * @param label            Used in the denial log line.
 *
 * Responds 404 (never 403) for both "missing" and "not yours", so the endpoint
 * cannot be used to probe which resource ids exist (Requirement 13.2).
 */
export function requireResourceWorkspaceAccess(
  paramName: string,
  resolveWorkspace: (resourceId: string) => Promise<string | null | undefined>,
  label = 'resource'
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const resourceId = String((req.params as any)?.[paramName] ?? '').trim();
      if (!resourceId) {
        res.status(400).json({ error: `Missing ${paramName} parameter` });
        return;
      }

      const workspaceId = await resolveWorkspace(resourceId);
      if (!workspaceId) {
        res.status(404).json({ error: 'Not found' });
        return;
      }

      if (!(await userCanAccessWorkspace(req, workspaceId))) {
        console.warn(`[IDOR PREVENTED] ${label} access denied:`, {
          userId: (req as any).user?.id,
          [paramName]: resourceId,
          workspaceId,
          path: req.path,
        });
        // Requirement 13.5: record the attempted tenant-isolation violation.
        recordAuthEventFromRequest(req, {
          type: 'tenant_violation',
          userId: (req as any).user?.id ?? null,
          reason: `${label}_access_denied`,
          detail: { [paramName]: resourceId, workspaceId: String(workspaceId) },
        });
        res.status(404).json({ error: 'Not found' });
        return;
      }

      // Expose the verified workspace so handlers need not re-derive it.
      (req as any).workspaceId = String(workspaceId);
      next();
    } catch (error) {
      // Fail closed — an error here must not fall through to the handler.
      console.error(`[workspace-access] ${label} authorization failed — denying:`, error);
      res.status(500).json({ error: 'Authorization failed' });
    }
  };
}

/** Resolve the owning workspace of an automation rule. */
export async function automationRuleWorkspace(ruleId: string): Promise<string | null> {
  try {
    const { AutomationRuleModel } = await import('../models/Automation/AutomationRule');
    const doc: any = await AutomationRuleModel.findById(ruleId).select('workspaceId').lean();
    const ws = doc?.workspaceId;
    return ws ? String(ws) : null;
  } catch {
    return null;
  }
}

/**
 * Load a workspace ONLY if `userId` is entitled to it, else null.
 *
 * Exists because the AI controllers repeatedly did:
 *
 *     const workspace = await storage.getWorkspace(clientSuppliedId)
 *     if (workspace?.aiConfiguration) preferences = { ...preferences, ...workspace.aiConfiguration }
 *
 * — an existence check (`if (!workspace) 404`) is NOT an authorization check, so
 * this read another tenant's AI configuration (brand voice, tone, personality) and
 * then generated content under it. Pairing the load with the check in one function
 * makes the unsafe form hard to write by accident.
 *
 * Entitlement here means workspace MEMBERSHIP (the same rule the middleware guards
 * apply), with an additional owner-id comparison so it also accepts the legacy
 * `workspace.userId === firebaseUid` shape those controllers relied on.
 *
 * Fails closed: returns null on any error.
 */
export async function getAuthorizedWorkspace(
  workspaceId: string | null | undefined,
  userId: string | null | undefined
): Promise<any | null> {
  try {
    const target = String(workspaceId ?? '').trim();
    const uid = String(userId ?? '').trim();
    if (!target || !uid) return null;

    const { storage } = await import('../mongodb-storage');
    const workspace = await storage.getWorkspace(target);
    if (!workspace) return null;

    // Primary rule: membership.
    const workspaces = await storage.getWorkspacesByUserId(uid).catch(() => []);
    if (Array.isArray(workspaces) && workspaces.some((w: any) => String(w?.id ?? w?._id ?? '') === target)) {
      return workspace;
    }

    // Legacy fallback: direct ownership, including the firebaseUid form.
    const ownerId = (workspace as any)?.userId?.toString?.() ?? String((workspace as any)?.userId ?? '');
    if (ownerId && ownerId === uid) return workspace;

    const user = await storage.getUser(uid).catch(() => null);
    const firebaseUid = (user as any)?.firebaseUid;
    if (firebaseUid && ownerId === String(firebaseUid)) return workspace;

    return null;
  } catch (error) {
    console.error('[workspace-access] getAuthorizedWorkspace failed — denying:', error);
    return null;
  }
}
