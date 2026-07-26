/**
 * bestTimeService — shared server-side accessor for the unified best-time
 * recommendation (server/services/bestTimeEngine.ts).
 *
 * Gathers the same three DB-sourced signals the `/api/v1/analytics/best-time`
 * route uses (audience-online from SocialAccount, post performance + reach from
 * Content) and runs them through `computeBestTime()`. Centralising this here
 * lets every consumer — the HTTP route, AnalyticsService, InsightsDataService,
 * the VeeGPT best-time tool — share one implementation instead of duplicating
 * the aggregation logic (and drifting out of sync with each other).
 *
 * Never calls the Meta API directly — everything is read from MongoDB.
 */

import { computeBestTime, type BestTimeResult } from './bestTimeEngine';

export interface SmartBestTimeForWorkspace extends BestTimeResult {
  /** True if at least one Instagram account in the workspace has any signal. */
  hasData: boolean;
}

export async function getSmartBestTime(workspaceId: string): Promise<SmartBestTimeForWorkspace> {
  const { socialAccountRepository } = await import('../repositories/SocialAccountRepository');
  const accounts = await socialAccountRepository.findActiveByWorkspace(workspaceId);

  // ── Audience-online signal (from SocialAccount) ──────────────────────────
  const hourlyActive: Record<string, number> = {};
  const weeklyActive: Record<string, number> = {};

  for (const acc of accounts) {
    if ((acc as any).platform !== 'instagram') continue;
    const at = (acc as any).audienceActiveTime;
    if (at && typeof at === 'object') {
      const obj: Record<string, number> = at instanceof Map ? Object.fromEntries(at) : at;
      for (const [h, v] of Object.entries(obj)) {
        if (typeof v === 'number' && v > 0) hourlyActive[h] = (hourlyActive[h] ?? 0) + v;
      }
    }
    const wt = (acc as any).audienceActiveTimeWeekly;
    if (wt && typeof wt === 'object') {
      const wObj: Record<string, number> = wt instanceof Map ? Object.fromEntries(wt) : wt;
      for (const [k, v] of Object.entries(wObj)) {
        if (typeof v === 'number' && v > 0) weeklyActive[k] = (weeklyActive[k] ?? 0) + v;
      }
    }
  }

  // ── Post performance + reach signal (from Content, last 30 days) ────────
  const posts: Array<{ publishedAt: any; reach?: number; impressions?: number; views?: number; likes?: number; comments?: number; saves?: number; shares?: number }> = [];

  try {
    const { ContentModel } = await import('../models/Content/Content');
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const found = await ContentModel.find(
      {
        workspaceId,
        platform: 'instagram',
        publishedAt: { $gte: since30, $ne: null },
        $or: [{ 'metrics.reach': { $gt: 0 } }, { 'metrics.views': { $gt: 0 } }, { 'metrics.likes': { $gt: 0 } }],
      },
      { publishedAt: 1, 'metrics.reach': 1, 'metrics.views': 1, 'metrics.impressions': 1, 'metrics.likes': 1, 'metrics.comments': 1, 'metrics.saves': 1, 'metrics.shares': 1 }
    ).lean();

    for (const post of found) {
      const pm = (post as any).metrics ?? {};
      posts.push({
        publishedAt: (post as any).publishedAt,
        reach: pm.reach, impressions: pm.impressions, views: pm.views,
        likes: pm.likes, comments: pm.comments, saves: pm.saves, shares: pm.shares,
      });
    }
  } catch {
    // Non-fatal — the engine still works off audience data alone.
  }

  const smart = computeBestTime({ weeklyActive, hourlyActive, posts });

  const hasData = Object.values(hourlyActive).some((v) => v > 0) || Object.values(weeklyActive).some((v) => v > 0) || posts.length > 0;

  return { ...smart, hasData };
}
