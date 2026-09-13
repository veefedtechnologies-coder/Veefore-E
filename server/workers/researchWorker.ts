import { Worker, Job } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import { ResearchJobData } from '../queues/researchQueue';

let researchWorker: Worker | null = null;

/**
 * Lazy-initialised BullMQ worker that re-runs research (trends / competitors /
 * niche insights) in the background and lets the engine persist + cache the
 * result. HTTP/chat paths read the cached/persisted value; this just keeps it
 * fresh. Single attempt (research hits paid AI + search APIs).
 */
export const getResearchWorker = (): Worker | null => {
  if (researchWorker) return researchWorker;

  const connection = getSharedRedisConnection();
  if (!connection) {
    console.warn('⚠️ Redis unavailable, Research Worker cannot be initialized');
    return null;
  }

  console.log('🔎 Lazy-initializing Research Worker on first use...');

  researchWorker = new Worker<ResearchJobData>(
    'research-refresh',
    async (job: Job<ResearchJobData>) => {
      const { kind, workspaceId, userId, query, preferences } = job.data;
      try {
        const { research } = await import('../services/research/webResearch.service');
        const mode = kind === 'competitors' ? 'competitors' : kind === 'trends' ? 'trends' : 'search';
        // Background work goes through the SAME quota engine as user traffic.
        // Research hits paid LLM and search APIs, so enqueuing must never be a
        // way to spend outside the user's budget. The BullMQ job id is reused as
        // the idempotency key, so a re-delivered job re-uses its reservation
        // instead of charging twice.
        const { withVGUForUser } = await import('../services/veegpt-metering');
        const { result } = await withVGUForUser(
          {
            userId,
            workspaceId,
            feature: kind === 'competitors' ? 'competitor.analysis' : 'trend.intelligence',
            requestId: job.id ? `research_${job.id}` : undefined,
            // Server-generated id: a re-delivery is the same job, not a new one.
            requestIdTrusted: true,
            meta: { userId, source: 'research-worker', kind },
          },
          () =>
            research(query, {
              mode: mode as any,
              preferences: preferences || {},
              userId,
              workspaceId,
            })
        );
        console.log(`[RESEARCH WORKER] ✅ ${kind} refreshed for ${workspaceId} — ${result.sources.length} sources`);
        return { ok: true, sources: result.sources.length };
      } catch (err: any) {
        // A quota refusal is a normal outcome for a background refresh, not an
        // incident: the previously cached result simply stays in place.
        const refused = err?.name === 'VGUQuotaError';
        console[refused ? 'log' : 'error'](
          `[RESEARCH WORKER] ${refused ? '⏭️ skipped (quota)' : '❌ failed'} ${kind} for ${workspaceId}:`,
          err?.message
        );
        return { ok: false, ...(refused ? { skipped: 'quota' } : {}) };
      }
    },
    { connection, concurrency: 2 },
  );

  researchWorker.on('failed', (job, err) => {
    console.error('[RESEARCH WORKER] Job failed:', job?.id, err?.message);
  });

  return researchWorker;
};
