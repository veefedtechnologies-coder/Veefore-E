/**
 * VeeGPT admin routes — usage analytics, cost monitoring, emergency controls,
 * alerts and on-demand repair (spec §45–§49, §57).
 *
 * Mounted at /api/admin/veegpt. Every route requires an authenticated admin
 * (signed admin JWT), and mutating routes additionally require an elevated role
 * and record a full audit entry (administrator, previous value, new value,
 * timestamp, reason) per §49.
 *
 * These are OPERATOR tools. Nothing here is on the user hot path; nothing here
 * changes how a user request is priced except the emergency levers, which are the
 * whole point of §48 (contain a cost incident without a redeploy).
 */

import { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import {
  requireAdminAuth as requireAdminAuthRaw,
  requireRole as requireRoleRaw,
  logAdminAction,
  type AdminRequest,
} from '../admin-auth';
import {
  loadAdminControls,
  resetAdminControls,
  updateAdminControls,
} from '../services/veegpt-admin-controls';
import { usageOverview } from '../services/veegpt-analytics';
import { recentAlerts, clearAlerts, scanForAlerts } from '../services/veegpt-alerts';
import { runRepair } from '../services/veegpt-repair.service';
import { videoUsageAnalytics } from '../features/video-editor/services/video-analytics.service';

/**
 * `requireAdminAuth` / `requireRole` are declared against the `AdminRequest`
 * subtype (it carries `req.admin`), which is not assignable to Express's
 * `RequestHandler` signature. Narrowing the type here keeps the router strongly
 * typed without weakening the middleware itself — the same pattern used by the
 * subscription admin router.
 */
const requireAdminAuth = requireAdminAuthRaw as unknown as RequestHandler;
const requireRole = (roles: string[]): RequestHandler =>
  requireRoleRaw(roles) as unknown as RequestHandler;

/** Pull the authenticated admin off the request (set by requireAdminAuth). */
function adminOf(req: Request): AdminRequest['admin'] {
  return (req as AdminRequest).admin;
}

/** Only these roles may pull emergency levers or run repairs. */
const CONTROL_ROLES = ['superadmin', 'admin'];
/** Read-only analytics may also be seen by support/analyst roles. */
const READ_ROLES = [...CONTROL_ROLES, 'support', 'analyst'];

export const veegptAdminRouter = Router();
veegptAdminRouter.use(requireAdminAuth);

// ---------------------------------------------------------------------------
// Analytics + cost monitoring (§45, §46)
// ---------------------------------------------------------------------------

/** Parse a from/to window from the query, defaulting to the last 30 days. */
function windowFromQuery(q: Record<string, unknown>): { from: Date; to: Date } {
  const now = Date.now();
  const parse = (v: unknown, fallback: number): Date => {
    if (typeof v === 'string') {
      const t = Date.parse(v);
      if (Number.isFinite(t)) return new Date(t);
    }
    return new Date(fallback);
  };
  const to = parse(q.to, now);
  const from = parse(q.from, to.getTime() - 30 * 86400_000);
  return { from, to };
}

/**
 * GET /usage — the §45 dashboard rollup (plan/model/feature/workspace) plus the
 * §46 cost summary. Revenue is optional query input, since it lives in a
 * different ledger; omitting it yields a pure cost/usage view.
 */
veegptAdminRouter.get(
  '/usage',
  requireRole(READ_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const win = windowFromQuery(req.query as Record<string, unknown>);
      const revenue = {
        subscriptionRevenueUSD: Number(req.query.subscriptionRevenueUSD) || 0,
        creditRevenueUSD: Number(req.query.creditRevenueUSD) || 0,
      };
      const overview = await usageOverview(win, revenue);
      res.json(overview);
    } catch (err) {
      res.status(500).json({ error: 'Failed to compute usage analytics' });
    }
  }
);

/**
 * GET /video-usage — the video-editor AI-usage rollup (Req 22.5). Extends the
 * §45 AI-usage view with a VIDEO-specific breakdown: completed edit / generative
 * counts, real provider generation calls, net provider spend in credits, and the
 * success / retry / quality-control failure rates. Read-only, computed over the
 * same from/to window as `/usage`.
 */
veegptAdminRouter.get(
  '/video-usage',
  requireRole(READ_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const win = windowFromQuery(req.query as Record<string, unknown>);
      res.json(await videoUsageAnalytics(win));
    } catch (err) {
      res.status(500).json({ error: 'Failed to compute video usage analytics' });
    }
  }
);

// ---------------------------------------------------------------------------
// Emergency controls (§48, §49)
// ---------------------------------------------------------------------------

/** GET /controls — the current emergency-control state. */
veegptAdminRouter.get(
  '/controls',
  requireRole(READ_ROLES),
  async (_req: Request, res: Response): Promise<void> => {
    res.json(await loadAdminControls());
  }
);

const tierEnum = z.enum(['cheap', 'medium', 'premium', 'ultra']);
const controlsPatchSchema = z.object({
  disabledModels: z.array(z.string()).optional(),
  disabledTiers: z.array(tierEnum).optional(),
  disabledFeatures: z.array(z.string()).optional(),
  disabledProviders: z.array(z.string()).optional(),
  concurrencyFactor: z.number().min(0).max(1).optional(),
  tierMultiplier: z.record(z.number().min(0)).optional(),
  featureMultiplier: z.record(z.number().min(0)).optional(),
  // §49: a reason is REQUIRED for every change.
  reason: z.string().min(3).max(500),
});

/**
 * POST /controls — apply an emergency change. Elevated role + reason required.
 * Records the full §49 audit entry (admin, previous value, new value, reason).
 */
veegptAdminRouter.post(
  '/controls',
  requireRole(CONTROL_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = controlsPatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({
        error: 'invalid_request',
        message: parsed.error.issues[0]?.message ?? 'Invalid control change.',
      });
      return;
    }
    const { reason, ...patch } = parsed.data;
    const admin = adminOf(req);
    const adminId = String(admin?.id ?? 'unknown');
    const { previous, next } = await updateAdminControls(
      patch as Parameters<typeof updateAdminControls>[0],
      { adminId, reason }
    );
    await logAdminAction(
      Number(admin?.id) || 0,
      'veegpt.emergency_controls.update',
      'veegpt_admin_controls',
      String(next.version),
      previous,
      next,
      req.ip,
      req.headers['user-agent']
    );
    res.json({ ok: true, controls: next });
  }
);

/** POST /controls/reset — clear every lever (the "all clear"). Audited. */
veegptAdminRouter.post(
  '/controls/reset',
  requireRole(CONTROL_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const reason =
      typeof req.body?.reason === 'string' && req.body.reason.length >= 3
        ? req.body.reason
        : 'incident cleared';
    const admin = adminOf(req);
    const adminId = String(admin?.id ?? 'unknown');
    const { previous, next } = await resetAdminControls({ adminId, reason });
    await logAdminAction(
      Number(admin?.id) || 0,
      'veegpt.emergency_controls.reset',
      'veegpt_admin_controls',
      String(next.version),
      previous,
      next,
      req.ip,
      req.headers['user-agent']
    );
    res.json({ ok: true, controls: next });
  }
);

// ---------------------------------------------------------------------------
// Alerts (§57)
// ---------------------------------------------------------------------------

/** GET /alerts — recent alerts, newest first. */
veegptAdminRouter.get(
  '/alerts',
  requireRole(READ_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));
    res.json({ alerts: await recentAlerts(limit) });
  }
);

/** POST /alerts/scan — run a scan now (also runs on the scheduler). */
veegptAdminRouter.post(
  '/alerts/scan',
  requireRole(CONTROL_ROLES),
  async (_req: Request, res: Response): Promise<void> => {
    res.json({ raised: await scanForAlerts() });
  }
);

/** POST /alerts/clear — acknowledge and clear the recent-alerts list. Audited. */
veegptAdminRouter.post(
  '/alerts/clear',
  requireRole(CONTROL_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    await clearAlerts();
    const admin = adminOf(req);
    await logAdminAction(
      Number(admin?.id) || 0,
      'veegpt.alerts.clear',
      'veegpt_alerts',
      '',
      undefined,
      undefined,
      req.ip,
      req.headers['user-agent']
    );
    res.json({ ok: true });
  }
);

// ---------------------------------------------------------------------------
// Repair (§55)
// ---------------------------------------------------------------------------

/**
 * POST /repair — run a consistency pass now. `apply=false` (default) is a dry
 * run that reports divergence without changing anything; `apply=true` fixes it.
 */
veegptAdminRouter.post(
  '/repair',
  requireRole(CONTROL_ROLES),
  async (req: Request, res: Response): Promise<void> => {
    const apply = req.body?.apply === true;
    const report = await runRepair({ apply });
    const admin = adminOf(req);
    await logAdminAction(
      Number(admin?.id) || 0,
      apply ? 'veegpt.repair.apply' : 'veegpt.repair.dryrun',
      'veegpt_repair',
      '',
      undefined,
      { findings: report.findings.length, healthy: report.healthy },
      req.ip,
      req.headers['user-agent']
    );
    res.json(report);
  }
);

export default veegptAdminRouter;
