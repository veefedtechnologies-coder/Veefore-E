/**
 * WorkspaceContextService — assembles a consolidated, prompt-ready snapshot of
 * EVERYTHING VeeGPT should know about a user + their workspace:
 *   - user identity (name, username, email, plan, niche, goals…)
 *   - workspace info
 *   - every connected social account + its real stats/analytics
 *   - recent content
 *   - AI growth recommendations + the performance (AI banner) insight
 *
 * Two important production properties:
 *  1. SECRET-SAFE: tokens/keys are never included in the snapshot.
 *  2. DB-EXPLOIT-SAFE: the snapshot is built once by a BullMQ worker and cached
 *     in Redis. The chat path only ever reads the cached blob, so chatting does
 *     NOT hit MongoDB. A content signature lets us skip regenerating when
 *     nothing changed.
 */

import { storage } from '../mongodb-storage';
import { insightsCacheKey } from '../queues/insightsQueue';
import { getRedisClient } from '../lib/redis';
import { resolveNiche } from './niche.util';
import { createHash } from 'crypto';

export interface WorkspaceContextSnapshot {
  generatedAt: string;
  signature: string;
  user: Record<string, any>;
  workspace: Record<string, any>;
  socialAccounts: Array<Record<string, any>>;
  recentContent: Array<Record<string, any>>;
  recommendations: any[];
  performanceInsight: any | null;
}

/** Round dates/objects into a stable string for change detection. */
function stableStringify(value: any): string {
  return JSON.stringify(value, (_k, v) => (v instanceof Date ? v.toISOString() : v));
}

/** Build the raw (uncached) snapshot straight from MongoDB + Redis insights. */
export async function buildWorkspaceContext(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceContextSnapshot> {
  const [user, workspace, socialAccounts, recentContent, recommendations] = await Promise.all([
    storage.getUser(userId).catch(() => undefined),
    storage.getWorkspace(workspaceId).catch(() => undefined),
    storage.getSocialAccountsByWorkspace(workspaceId).catch(() => [] as any[]),
    storage.getContentByWorkspace(workspaceId, 10).catch(() => [] as any[]),
    storage.getContentRecommendations(workspaceId, undefined, 8).catch(() => [] as any[]),
  ]);

  // Pull the latest AI performance banner from the insights cache (if present).
  let performanceInsight: any = null;
  try {
    const redis = getRedisClient();
    for (const period of ['week', 'month', 'day']) {
      const raw = await redis.get(insightsCacheKey('banner', workspaceId, period));
      if (raw) {
        const parsed = JSON.parse(raw);
        performanceInsight = { period, ...(parsed.banner || {}), generatedAt: parsed.generatedAt };
        break;
      }
    }
  } catch {
    /* insights cache optional */
  }

  // ── Shape each section, EXCLUDING secrets (tokens/keys). ──────────────────
  // Resolve a human name the same way the app header does: displayName, else a
  // readable name derived from the email, else the username.
  const deriveName = (): string | undefined => {
    if ((user as any)?.displayName) return (user as any).displayName;
    const email = (user as any)?.email as string | undefined;
    if (email) {
      return email
        .split('@')[0]
        .replace(/_\d+$/, '')
        .replace(/[._]/g, ' ')
        .replace(/\b\w/g, (l) => l.toUpperCase());
    }
    return (user as any)?.username;
  };

  const userView = user
    ? {
        name: deriveName(),
        username: (user as any).username,
        email: (user as any).email,
        plan: (user as any).plan,
        // Niche lives in either the top-level `niche` field OR
        // `preferences.contentNiche` (onboarding) — resolve both so VeeGPT always
        // knows the user's niche (it's app/profile data, not social-account data).
        niche: resolveNiche(user) || (user as any).niche,
        targetAudience: (user as any).targetAudience,
        contentStyle: (user as any).contentStyle,
        postingFrequency: (user as any).postingFrequency,
        businessType: (user as any).businessType,
        experienceLevel: (user as any).experienceLevel,
        primaryObjective: (user as any).primaryObjective,
        goals: (user as any).goals,
        isOnboarded: (user as any).isOnboarded,
      }
    : {};

  const workspaceView = workspace
    ? {
        name: (workspace as any).name,
        description: (workspace as any).description,
        theme: (workspace as any).theme,
        aiPersonality: (workspace as any).aiPersonality,
        credits: (workspace as any).credits,
      }
    : {};

  const accountsView = (socialAccounts || []).map((a: any) => ({
    // Stable id so the chat route can match the account the user selected in
    // the composer dropdown (selectedAccountId) to this cached snapshot entry.
    id: (a.id || a._id || a.accountId)?.toString(),
    platform: a.platform,
    username: a.username,
    accountType: a.accountType,
    isBusinessAccount: a.isBusinessAccount,
    isVerified: a.isVerified,
    biography: a.biography,
    website: a.website,
    followersCount: a.followersCount,
    followingCount: a.followingCount,
    mediaCount: a.mediaCount,
    avgLikes: a.avgLikes,
    avgComments: a.avgComments,
    avgReach: a.avgReach,
    engagementRate: a.engagementRate,
    totalLikes: a.totalLikes,
    totalComments: a.totalComments,
    totalReach: a.totalReach,
    totalImpressions: a.totalImpressions,
    totalShares: a.totalShares,
    totalSaves: a.totalSaves,
    postsAnalyzed: a.postsAnalyzed,
    audienceCountry: a.audienceCountry,
    audienceCity: a.audienceCity,
    audienceGenderAge: a.audienceGenderAge,
    audienceActiveTime: a.audienceActiveTime,
    lastSyncAt: a.lastSyncAt,
  }));

  const contentView = (recentContent || []).map((c: any) => ({
    title: c.title,
    type: c.type,
    platform: c.platform,
    status: c.status,
    publishedAt: c.publishedAt,
    likes: c.likes ?? c.engagement?.likes,
    comments: c.comments ?? c.engagement?.comments,
    reach: c.reach ?? c.engagement?.reach,
  }));

  const recommendationsView = (recommendations || []).map((r: any) => ({
    title: r.title,
    description: r.description,
    type: r.type,
    priority: r.priority,
  }));

  const snapshotCore = {
    user: userView,
    workspace: workspaceView,
    socialAccounts: accountsView,
    recentContent: contentView,
    recommendations: recommendationsView,
    performanceInsight,
  };

  const signature = createHash('sha1').update(stableStringify(snapshotCore)).digest('hex');

  try {
    const { vlog } = await import('../utils/veegpt-debug-logger');
    vlog('wsctx:built', {
      workspaceId,
      userId,
      userName: userView.name || null,
      veeforeUsername: userView.username || null,
      accountCount: accountsView.length,
      accountHandles: accountsView.map((a) => `${a.platform}:@${a.username}`),
    });
  } catch { /* logging optional */ }

  return {
    generatedAt: new Date().toISOString(),
    signature,
    ...snapshotCore,
  };
}

/**
 * Render ONLY the user's identity/profile (name, username, email, plan, niche,
 * workspace) — NOT their account analytics or content. This lightweight block
 * is always safe to inject, even when the heavy per-account data is being pulled
 * on demand instead (e.g. when the user has selected a specific account). It's
 * what lets VeeGPT still answer "what is my name" without stuffing the prompt
 * with follower counts, audience maps, and recent posts.
 */
export function renderIdentityContext(ctx: WorkspaceContextSnapshot | null): string {
  if (!ctx) return '';
  const lines: string[] = [];
  const u = ctx.user || {};
  if (u.name) lines.push(`The user's name is ${u.name}. When they ask "what is my name", answer "${u.name}".`);
  if (u.username) lines.push(`Their Veefore account username is "${u.username}" (this is NOT their social media handle).`);
  if (u.email) lines.push(`Their email is ${u.email}.`);
  if (u.plan) lines.push(`Their Veefore plan is ${u.plan}.`);
  const profileBits = [
    u.niche && `niche: ${u.niche}`,
    u.targetAudience && `audience: ${u.targetAudience}`,
    u.contentStyle && `content style: ${u.contentStyle}`,
    u.primaryObjective && `goal: ${u.primaryObjective}`,
    u.businessType && `business: ${u.businessType}`,
  ].filter(Boolean);
  if (profileBits.length) lines.push(`Their profile — ${profileBits.join(', ')}.`);
  if (ctx.workspace?.name) {
    lines.push(`Current workspace: "${ctx.workspace.name}"${ctx.workspace.description ? ` — ${ctx.workspace.description}` : ''}.`);
  }
  return lines.join('\n');
}

/**
 * Render the snapshot into a compact, prompt-ready text block injected into the
 * VeeGPT system prompt. Kept concise so it doesn't blow up the prompt size.
 */
export function renderWorkspaceContext(ctx: WorkspaceContextSnapshot | null): string {
  if (!ctx) return '';
  const lines: string[] = [];
  const u = ctx.user || {};

  // --- The person you are talking to (their Veefore identity) ---
  if (u.name) {
    lines.push(`The user's name is ${u.name}. When they ask "what is my name", answer "${u.name}".`);
  }
  if (u.username) lines.push(`Their Veefore account username is "${u.username}" (this is NOT their social media handle).`);
  if (u.email) lines.push(`Their email is ${u.email}.`);
  if (u.plan) lines.push(`Their Veefore plan is ${u.plan}.`);

  const profileBits = [
    u.niche && `niche: ${u.niche}`,
    u.targetAudience && `audience: ${u.targetAudience}`,
    u.contentStyle && `content style: ${u.contentStyle}`,
    u.primaryObjective && `goal: ${u.primaryObjective}`,
    u.businessType && `business: ${u.businessType}`,
  ].filter(Boolean);
  if (profileBits.length) lines.push(`Their profile — ${profileBits.join(', ')}.`);

  if (ctx.workspace?.name) {
    lines.push(`Current workspace: "${ctx.workspace.name}"${ctx.workspace.description ? ` — ${ctx.workspace.description}` : ''}.`);
  }

  // --- Their connected social media accounts (separate from identity) ---
  if (!ctx.socialAccounts?.length) {
    lines.push('They have no social media accounts connected in this workspace.');
  } else {
    lines.push('Connected social media accounts in this workspace:');
    for (const a of ctx.socialAccounts) {
      const stats = [
        a.followersCount != null && `${a.followersCount} followers`,
        a.mediaCount != null && `${a.mediaCount} posts`,
        a.engagementRate != null && `${a.engagementRate}% engagement`,
        a.avgLikes != null && `avg ${a.avgLikes} likes`,
        a.avgReach != null && `avg ${a.avgReach} reach`,
      ].filter(Boolean);
      // Be explicit: this is the social handle on that platform.
      lines.push(
        `  • ${a.platform} account handle: @${a.username}${a.isVerified ? ' (verified)' : ''}` +
          (stats.length ? ` — ${stats.join(', ')}` : ''),
      );
      if (a.audienceCountry && Object.keys(a.audienceCountry).length) {
        const top = Object.entries(a.audienceCountry as Record<string, number>)
          .sort((x, y) => y[1] - x[1])
          .slice(0, 3)
          .map(([c, v]) => `${c} ${v}`)
          .join(', ');
        if (top) lines.push(`    Top audience countries: ${top}.`);
      }
    }
  }

  if (ctx.recentContent?.length) {
    const posts = ctx.recentContent
      .slice(0, 5)
      .map((c) => `${c.title || c.type || 'post'}${c.likes != null ? ` (${c.likes} likes)` : ''}`)
      .join('; ');
    lines.push(`Recent content: ${posts}.`);
  }

  if (ctx.recommendations?.length) {
    const recs = ctx.recommendations.slice(0, 4).map((r) => r.title).filter(Boolean).join('; ');
    if (recs) lines.push(`Active growth recommendations: ${recs}.`);
  }

  if (ctx.performanceInsight?.headline) {
    lines.push(`Latest performance insight: ${ctx.performanceInsight.headline}`);
  }

  return lines.join('\n');
}
