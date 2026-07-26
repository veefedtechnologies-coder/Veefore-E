import { ListeningSyncStatusModel } from '../../models/SocialListening/ListeningSyncStatus';
import { SyncStatusService } from './sync-status.service';
import { slog, slogError } from '../../utils/social-listening-debug-logger';

/**
 * Background refresh scheduler for Social Listening.
 *
 * Keeps each workspace's intelligence warm by running a DAILY background sync
 * (using OpenAI Batch API at 50% discount). Because it runs on a schedule,
 * the user almost always lands on already-fresh, already-cached data, so their
 * manual "Sync Live Data" click is cheap (mostly cache hits) and fast.
 *
 * Niche deduplication: workspaces sharing the same niche share one background
 * fetch run — the results are copied to all sibling workspaces after the primary
 * completes, saving AI cost and API calls proportional to the number of shared
 * niches.
 *
 * If a user clicks "Sync Live Data" mid-refresh, the interactive run supersedes
 * the background one: it bumps the runId and cancels the in-flight OpenAI batch.
 *
 * Enabled by default; opt out with SOCIAL_LISTENING_BG_REFRESH=false.
 */

const ENABLED = () => String(process.env.SOCIAL_LISTENING_BG_REFRESH || 'true').toLowerCase() !== 'false';
const INTERVAL_MS = Number(process.env.SOCIAL_LISTENING_BG_REFRESH_INTERVAL_MS || 20 * 60 * 60 * 1000); // 20h default
const STALE_AFTER_MS = Number(process.env.SOCIAL_LISTENING_BG_STALE_MS || 20 * 60 * 60 * 1000); // refresh if older than 20h
const MAX_PER_TICK = Number(process.env.SOCIAL_LISTENING_BG_MAX_PER_TICK || 3); // throttle batches created per tick

let timer: ReturnType<typeof setInterval> | null = null;
let running = false;

/**
 * Copy social listening data from a primary workspace to sibling workspaces
 * that share the same niche. This is the niche-deduplication fan-out step:
 * instead of fetching and analyzing the same data N times, we fetch once and
 * replicate. Posts/trends/hooks are duplicated with each workspace's own ID so
 * workspace-scoped reads work transparently.
 */
async function copyNicheDataToWorkspaces(
  primaryId: string,
  targetIds: string[],
  niche: string
): Promise<void> {
  if (targetIds.length === 0) return;

  const {
    ListeningPostModel,
    ListeningTrendModel,
    ListeningHookModel,
    ListeningAggregationModel,
    ListeningCommentModel,
  } = await import('../../models/SocialListening').catch(() => ({
    ListeningPostModel: null, ListeningTrendModel: null,
    ListeningHookModel: null, ListeningAggregationModel: null, ListeningCommentModel: null,
  }));

  // Fallback individual model imports if barrel import fails
  const PostModel = ListeningPostModel ||
    (await import('../../models/SocialListening/ListeningPost')).ListeningPostModel;
  const TrendModel = ListeningTrendModel ||
    (await import('../../models/SocialListening/ListeningTrend')).ListeningTrendModel;

  for (const targetId of targetIds) {
    try {
      // Copy posts
      const posts = await PostModel.find({ workspaceId: primaryId }).lean();
      if (posts.length > 0) {
        await PostModel.deleteMany({ workspaceId: targetId });
        const cloned = posts.map((p: any) => {
          const { _id, ...rest } = p;
          return { ...rest, workspaceId: targetId };
        });
        await PostModel.insertMany(cloned, { ordered: false }).catch(() => {});
      }

      // Copy trends
      const trends = await TrendModel.find({ workspaceId: primaryId }).lean();
      if (trends.length > 0) {
        await TrendModel.deleteMany({ workspaceId: targetId });
        const cloned = trends.map((t: any) => {
          const { _id, ...rest } = t;
          return { ...rest, workspaceId: targetId };
        });
        await TrendModel.insertMany(cloned, { ordered: false }).catch(() => {});
      }

      // Mark the target workspace as completed
      await SyncStatusService.complete(targetId, trends.length);
      console.log(`[SocialListening:BGRefresh] Copied niche="${niche}" data from ${primaryId} → ${targetId} (${posts.length} posts, ${trends.length} trends)`);
      slog('bg.niche-copy-done', { primaryId, targetId, niche, posts: posts.length, trends: trends.length });
    } catch (err) {
      console.warn(`[SocialListening:BGRefresh] Niche copy to ${targetId} failed:`, (err as Error).message);
      slogError('bg.niche-copy-error', err, { primaryId, targetId, niche });
    }
  }
}

/**
 * Trigger an immediate interactive social-listening sync for a workspace on
 * first OAuth connection. Uses the user's onboarding niche. This is the
 * entry point called from the Instagram OAuth callback.
 *
 * Shared-niche optimization: if another workspace already has fresh data for
 * the same niche (synced within the last 2 hours), we copy it instead of
 * running a full new fetch — saving both time and API cost.
 */
export async function triggerFirstConnectSync(workspaceId: string, niche: string): Promise<void> {
  if (!niche || !workspaceId) return;

  const normalizedNiche = niche.trim().toLowerCase();

  try {
    // Check if a recent sync for this niche exists on another workspace.
    // If so, copy it immediately (fast path) instead of waiting for a fresh fetch.
    const TWO_HOURS_AGO = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const recentShared = await ListeningSyncStatusModel.findOne({
      workspaceId: { $ne: workspaceId },
      niche: { $regex: new RegExp(`^${normalizedNiche.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
      phase: 'completed',
      finishedAt: { $gte: TWO_HOURS_AGO },
    }).lean();

    if (recentShared) {
      const sourceId = String(recentShared.workspaceId);
      console.log(`[SocialListening:FirstConnect] Fresh shared niche="${niche}" data found in workspace ${sourceId} — copying instead of re-fetching`);
      slog('first-connect.shared-niche-copy', { workspaceId, sourceId, niche });
      await copyNicheDataToWorkspaces(sourceId, [workspaceId], niche);
      return;
    }

    // No recent shared data — run a fresh interactive sync.
    console.log(`[SocialListening:FirstConnect] Triggering immediate sync for workspace ${workspaceId} niche="${niche}"`);
    slog('first-connect.sync-start', { workspaceId, niche });

    const { runLiveSync } = await import('../../routes/social-listening');
    const runId = await SyncStatusService.begin(workspaceId, niche, 'interactive');

    // Fire-and-forget; the frontend picks it up via sync-status polling.
    runLiveSync(workspaceId, niche, { mode: 'interactive', runId }).catch(async (err) => {
      if ((err as Error)?.message === 'SUPERSEDED') return;
      console.error(`[SocialListening:FirstConnect] Sync for ${workspaceId} failed:`, err);
      slogError('first-connect.sync-failed', err, { workspaceId, niche, runId });
      await SyncStatusService.fail(workspaceId, (err as Error)?.message || 'First-connect sync failed').catch(() => {});
    });
  } catch (err) {
    console.warn(`[SocialListening:FirstConnect] Could not trigger sync for ${workspaceId}:`, (err as Error).message);
    slogError('first-connect.error', err, { workspaceId, niche });
  }
}

export class BackgroundRefreshService {
  /** Start the periodic background refresh loop (no-op if disabled). */
  static start(): void {
    if (timer) return;
    if (!ENABLED()) {
      console.log('[SocialListening:BGRefresh] Disabled (set SOCIAL_LISTENING_BG_REFRESH=true to enable).');
      slog('bg.disabled');
      return;
    }
    console.log(`[SocialListening:BGRefresh] Enabled — refresh every ${Math.round(INTERVAL_MS / 3600000)}h if data older than ${Math.round(STALE_AFTER_MS / 3600000)}h. Analysis cache: 14-day TTL (saves ~80% of AI tokens). Niche deduplication: ON.`);
    slog('bg.enabled', { intervalHours: Math.round(INTERVAL_MS / 3600000), staleAfterHours: Math.round(STALE_AFTER_MS / 3600000), maxPerTick: MAX_PER_TICK });
    // First tick shortly after boot, then on the interval.
    setTimeout(() => void this.tick(), 60_000);
    timer = setInterval(() => void this.tick(), INTERVAL_MS);
  }

  /** Stop the loop (used on shutdown / tests). */
  static stop(): void {
    if (timer) { clearInterval(timer); timer = null; }
  }

  /** One pass: find stale workspaces and kick a background refresh for each.
   *
   * Niche deduplication: if multiple workspaces share the same niche, we run
   * ONE background fetch for that niche and then copy the results to every
   * workspace that uses it. This avoids N redundant identical fetches when a
   * user has multiple workspaces in the same niche.
   */
  static async tick(): Promise<void> {
    if (running) return;
    running = true;
    try {
      const cutoff = new Date(Date.now() - STALE_AFTER_MS);

      const candidates = await ListeningSyncStatusModel.find({
        niche: { $nin: [null, ''] },
        $or: [
          { phase: { $in: ['completed', 'failed', 'idle'] } },
          { phase: { $exists: false } },
        ],
      })
        .sort({ finishedAt: 1, updatedAt: 1 })
        .limit(50)
        .lean();

      const due = candidates.filter((c: any) => {
        const last = c.finishedAt ? new Date(c.finishedAt).getTime() : 0;
        return last < cutoff.getTime();
      });

      slog('bg.tick', { candidates: candidates.length, due: due.length, staleAfterHours: Math.round(STALE_AFTER_MS / 3600000) });
      if (due.length === 0) return;

      const { runLiveSync } = await import('../../routes/social-listening');

      // Group due workspaces by normalized niche so we run one fetch per niche
      // and fan the results to all workspaces that share it.
      const nicheToWorkspaces = new Map<string, string[]>();
      for (const c of due) {
        const niche = String(c.niche || '').trim().toLowerCase();
        if (!niche) continue;
        const list = nicheToWorkspaces.get(niche) || [];
        list.push(String(c.workspaceId));
        nicheToWorkspaces.set(niche, list);
      }

      let started = 0;
      for (const [niche, workspaceIds] of nicheToWorkspaces) {
        if (started >= MAX_PER_TICK) break;

        // For shared niches: pick the primary workspace (oldest stale) to run
        // the actual fetch. Other workspaces with the same niche will have their
        // sync-status doc piggy-backed once the primary finishes.
        const primaryId = workspaceIds[0];
        const otherIds = workspaceIds.slice(1);

        if (await SyncStatusService.isActive(primaryId)) {
          slog('bg.skip-active', { workspaceId: primaryId, niche });
          continue;
        }

        const runId = await SyncStatusService.begin(primaryId, niche, 'background');
        started++;
        console.log(`[SocialListening:BGRefresh] Refreshing niche="${niche}" via ${primaryId}${otherIds.length ? ` (shared with ${otherIds.length} other workspace(s))` : ''}`);
        slog('bg.run-start', { workspaceId: primaryId, niche, runId, sharedWith: otherIds });

        // Mark sibling workspaces as queued so they show "refreshing" in the UI
        for (const sibId of otherIds) {
          SyncStatusService.begin(sibId, niche, 'background').catch(() => {});
        }

        runLiveSync(primaryId, niche, { mode: 'background', runId }).then(async () => {
          // Fan the freshly-written data from primaryId to all sibling workspaces.
          if (otherIds.length > 0) {
            await copyNicheDataToWorkspaces(primaryId, otherIds, niche).catch((err) => {
              console.warn(`[SocialListening:BGRefresh] Niche copy to siblings failed:`, err?.message);
            });
          }
        }).catch(async (err) => {
          if ((err as Error)?.message === 'SUPERSEDED') {
            slog('bg.run-superseded', { workspaceId: primaryId, runId });
            return;
          }
          console.error(`[SocialListening:BGRefresh] Background run for ${primaryId} failed:`, err);
          slogError('bg.run-failed', err, { workspaceId: primaryId, runId });
          await SyncStatusService.fail(primaryId, (err as Error)?.message || 'Background refresh failed').catch(() => {});
          // Mark siblings as failed too
          for (const sibId of otherIds) {
            SyncStatusService.fail(sibId, 'Primary workspace sync failed').catch(() => {});
          }
        });
      }
      if (started > 0) {
        console.log(`[SocialListening:BGRefresh] Started ${started} background refresh run(s) covering ${due.length} workspace(s).`);
        slog('bg.tick-done', { started, totalWorkspaces: due.length });
      }
    } catch (e) {
      console.error('[SocialListening:BGRefresh] tick error:', (e as Error).message);
      slogError('bg.tick-error', e);
    } finally {
      running = false;
    }
  }
}
