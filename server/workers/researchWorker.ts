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
        const result = await research(query, { mode: mode as any, preferences: preferences || {}, userId, workspaceId });
        console.log(`[RESEARCH WORKER] ✅ ${kind} refreshed for ${workspaceId} — ${result.sources.length} sources`);
        return { ok: true, sources: result.sources.length };
      } catch (err: any) {
        console.error(`[RESEARCH WORKER] ❌ ${kind} failed for ${workspaceId}:`, err?.message);
        // Single attempt — leave previous cached/persisted result in place.
        return { ok: false };
      }
    },
    { connection, concurrency: 2 },
  );

  researchWorker.on('failed', (job, err) => {
    console.error('[RESEARCH WORKER] Job failed:', job?.id, err?.message);
  });

  return researchWorker;
};
