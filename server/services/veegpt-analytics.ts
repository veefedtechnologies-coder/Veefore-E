/**
 * Admin usage analytics (spec §45, §46).
 *
 * Aggregates the durable usage ledger (VeegptUsageEvent) into the breakdowns the
 * internal dashboard needs: by plan, model, feature and workspace, plus the AI
 * gross-contribution summary.
 *
 * WHY IT READS THE LEDGER, NOT REDIS
 * Redis holds the live counters that GATE requests; it is not a historical store
 * and it rolls. The ledger is the durable, per-event record with the pricing
 * version stamped at execution time, so every cost figure here is reproducible
 * and survives a Redis flush. This is analytics, never enforcement — it is only
 * ever read by an authenticated admin.
 *
 * REVENUE
 * Provider COST comes from the ledger (real money paid to OpenAI/Google). Revenue
 * (subscription + credit) is a separate ledger this module does not own, so it is
 * an INPUT: the admin route supplies it and this module computes the contribution.
 * Conflating cost with revenue, or contribution with net profit, is exactly the
 * confusion §46 warns against, so the shapes are kept distinct.
 */

import { VeegptUsageEvent } from './veegpt-ledger';
import type { PlanId } from '../config/plan-config';

export interface AnalyticsWindow {
  /** Inclusive start. */
  from: Date;
  /** Exclusive end. */
  to: Date;
}

/** Only billable, reconciled events count toward usage and cost. */
function billableMatch(win: AnalyticsWindow): Record<string, unknown> {
  return {
    createdAt: { $gte: win.from, $lt: win.to },
    // RELEASED/refunded events carry actualVGU 0 and no real cost; excluding
    // them keeps "requests" meaning "requests that actually did work".
    status: { $in: ['RECONCILED', 'FAILED', 'COMPLETED', 'EXPIRED'] },
  };
}

export interface PlanBreakdown {
  plan: PlanId | string;
  users: number;
  requests: number;
  vgu: number;
  providerCostUSD: number;
  /** Latency percentiles are not on the ledger yet; reserved for when they are. */
  p50?: number;
  p90?: number;
  p95?: number;
  p99?: number;
}

export interface ModelBreakdown {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  vgu: number;
  providerCostUSD: number;
  costPerRequestUSD: number;
  failureRate: number;
}

export interface FeatureBreakdown {
  feature: string;
  requests: number;
  vgu: number;
  providerCostUSD: number;
}

export interface WorkspaceBreakdown {
  workspaceId: string;
  requests: number;
  vgu: number;
  providerCostUSD: number;
}

/** Round money to 6 dp (sub-cent), VGU to 2 dp. */
const usd = (n: number): number => Math.round((n || 0) * 1e6) / 1e6;
const vgu = (n: number): number => Math.round((n || 0) * 100) / 100;

/** Usage grouped by plan (spec §45 · Plan). */
export async function analyticsByPlan(win: AnalyticsWindow): Promise<PlanBreakdown[]> {
  const rows = await VeegptUsageEvent.aggregate([
    { $match: billableMatch(win) },
    {
      $group: {
        _id: '$plan',
        requests: { $sum: 1 },
        vgu: { $sum: '$actualVGU' },
        providerCostUSD: { $sum: '$actualProviderCostUSD' },
        users: { $addToSet: '$userId' },
      },
    },
    { $sort: { providerCostUSD: -1 } },
  ]);
  return rows.map(r => ({
    plan: r._id ?? 'unknown',
    users: Array.isArray(r.users) ? r.users.length : 0,
    requests: r.requests || 0,
    vgu: vgu(r.vgu),
    providerCostUSD: usd(r.providerCostUSD),
  }));
}

/** Usage grouped by model (spec §45 · Model). */
export async function analyticsByModel(win: AnalyticsWindow): Promise<ModelBreakdown[]> {
  const rows = await VeegptUsageEvent.aggregate([
    { $match: billableMatch(win) },
    {
      $group: {
        _id: '$model',
        requests: { $sum: 1 },
        inputTokens: { $sum: '$inputTokens' },
        outputTokens: { $sum: '$outputTokens' },
        vgu: { $sum: '$actualVGU' },
        providerCostUSD: { $sum: '$actualProviderCostUSD' },
        failures: { $sum: { $cond: [{ $eq: ['$status', 'FAILED'] }, 1, 0] } },
      },
    },
    { $sort: { providerCostUSD: -1 } },
  ]);
  return rows.map(r => ({
    model: r._id ?? 'unknown',
    requests: r.requests || 0,
    inputTokens: r.inputTokens || 0,
    outputTokens: r.outputTokens || 0,
    vgu: vgu(r.vgu),
    providerCostUSD: usd(r.providerCostUSD),
    costPerRequestUSD: r.requests ? usd(r.providerCostUSD / r.requests) : 0,
    failureRate: r.requests ? Math.round((r.failures / r.requests) * 1000) / 1000 : 0,
  }));
}

/** Usage grouped by feature (spec §45 · Feature). */
export async function analyticsByFeature(win: AnalyticsWindow): Promise<FeatureBreakdown[]> {
  const rows = await VeegptUsageEvent.aggregate([
    { $match: billableMatch(win) },
    {
      $group: {
        _id: '$feature',
        requests: { $sum: 1 },
        vgu: { $sum: '$actualVGU' },
        providerCostUSD: { $sum: '$actualProviderCostUSD' },
      },
    },
    { $sort: { providerCostUSD: -1 } },
  ]);
  return rows.map(r => ({
    feature: r._id ?? 'unknown',
    requests: r.requests || 0,
    vgu: vgu(r.vgu),
    providerCostUSD: usd(r.providerCostUSD),
  }));
}

/** Highest-consuming workspaces (spec §45 · Workspace). */
export async function analyticsByWorkspace(
  win: AnalyticsWindow,
  limit = 20
): Promise<WorkspaceBreakdown[]> {
  const rows = await VeegptUsageEvent.aggregate([
    { $match: { ...billableMatch(win), workspaceId: { $exists: true, $ne: null } } },
    {
      $group: {
        _id: '$workspaceId',
        requests: { $sum: 1 },
        vgu: { $sum: '$actualVGU' },
        providerCostUSD: { $sum: '$actualProviderCostUSD' },
      },
    },
    { $sort: { providerCostUSD: -1 } },
    { $limit: Math.max(1, Math.min(200, limit)) },
  ]);
  return rows.map(r => ({
    workspaceId: String(r._id),
    requests: r.requests || 0,
    vgu: vgu(r.vgu),
    providerCostUSD: usd(r.providerCostUSD),
  }));
}

export interface CostSummary {
  providerCostUSD: number;
  vgu: number;
  requests: number;
  /** Supplied by the caller from the revenue ledger this module does not own. */
  subscriptionRevenueUSD: number;
  creditRevenueUSD: number;
  /**
   * AI Gross Contribution = Subscription + Credit revenue − AI provider cost.
   * §46 is explicit: this is NOT company net profit.
   */
  aiGrossContributionUSD: number;
}

/**
 * The §46 cost-monitoring summary. Revenue is an input because it lives in a
 * different ledger; pass 0 to get a pure cost/usage rollup.
 */
export async function costSummary(
  win: AnalyticsWindow,
  revenue: { subscriptionRevenueUSD?: number; creditRevenueUSD?: number } = {}
): Promise<CostSummary> {
  const rows = await VeegptUsageEvent.aggregate([
    { $match: billableMatch(win) },
    {
      $group: {
        _id: null,
        providerCostUSD: { $sum: '$actualProviderCostUSD' },
        vgu: { $sum: '$actualVGU' },
        requests: { $sum: 1 },
      },
    },
  ]);
  const agg = rows[0] || { providerCostUSD: 0, vgu: 0, requests: 0 };
  const subscriptionRevenueUSD = usd(revenue.subscriptionRevenueUSD ?? 0);
  const creditRevenueUSD = usd(revenue.creditRevenueUSD ?? 0);
  const providerCostUSD = usd(agg.providerCostUSD);
  return {
    providerCostUSD,
    vgu: vgu(agg.vgu),
    requests: agg.requests || 0,
    subscriptionRevenueUSD,
    creditRevenueUSD,
    aiGrossContributionUSD: usd(
      subscriptionRevenueUSD + creditRevenueUSD - providerCostUSD
    ),
  };
}

/** Everything the admin dashboard needs, in one call. */
export async function usageOverview(
  win: AnalyticsWindow,
  revenue?: { subscriptionRevenueUSD?: number; creditRevenueUSD?: number }
): Promise<{
  window: { from: string; to: string };
  cost: CostSummary;
  byPlan: PlanBreakdown[];
  byModel: ModelBreakdown[];
  byFeature: FeatureBreakdown[];
  topWorkspaces: WorkspaceBreakdown[];
}> {
  const [cost, byPlan, byModel, byFeature, topWorkspaces] = await Promise.all([
    costSummary(win, revenue),
    analyticsByPlan(win),
    analyticsByModel(win),
    analyticsByFeature(win),
    analyticsByWorkspace(win),
  ]);
  return {
    window: { from: win.from.toISOString(), to: win.to.toISOString() },
    cost,
    byPlan,
    byModel,
    byFeature,
    topWorkspaces,
  };
}
