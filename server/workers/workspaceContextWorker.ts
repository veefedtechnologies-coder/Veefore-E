import { Worker, Job } from 'bullmq';
import { getSharedRedisConnection } from '../lib/redis';
import {
  WorkspaceContextJobData,
  workspaceContextLockKey,
} from '../queues/workspaceContextQueue';
import { buildWorkspaceContext } from '../services/WorkspaceContextService';
import { UserMemory } from '../models/Chat';

let worker: Worker | null = null;

/**
 * Lazy-initialised BullMQ worker that rebuilds a workspace's VeeGPT context
 * snapshot from MongoDB and stores it DIRECTLY in the user's memory document
 * (UserMemory.workspaceContext) — the same single storage that holds the
 * remembered facts. The chat path reads that one document; it never queries the
 * underlying collections, keeping chat fast and the DB protected.
 */
export const getWorkspaceContextWorker = (): Worker | null => {
  if (worker) return worker;

  const connection = getSharedRedisConnection();
  if (!connection) {
    console.warn('⚠️ Redis unavailable, Workspace Context Worker cannot be initialized');
    return null;
  }

  console.log('🧠 Lazy-initializing Workspace Context Worker on first use...');

  worker = new Worker<WorkspaceContextJobData>(
    'workspace-context',
    async (job: Job<WorkspaceContextJobData>) => {
      const { workspaceId, userId, reason } = job.data;
      const redis = getSharedRedisConnection();
      try {
        const snapshot = await buildWorkspaceContext(workspaceId, userId);
        // Store the snapshot in the SAME memory document (upsert), updating it
        // in place — no separate store.
        await UserMemory.updateOne(
          { userId, workspaceId },
          {
            $set: {
              workspaceContext: snapshot,
              workspaceContextUpdatedAt: new Date(),
              updatedAt: new Date(),
            },
            $setOnInsert: { userId, workspaceId, items: [], processedConversationIds: [], createdAt: new Date() },
          },
          { upsert: true },
        );
        console.log(
          `[WSCTX WORKER] ✅ Context stored in memory for ${workspaceId} (reason=${reason || 'n/a'}, accounts=${snapshot.socialAccounts.length})`,
        );
        return { status: 'success', signature: snapshot.signature };
      } catch (error) {
        console.error(`[WSCTX WORKER] ❌ Failed for ${workspaceId}:`, (error as Error).message);
        throw error;
      } finally {
        try {
          await redis.del(workspaceContextLockKey(workspaceId));
        } catch {
          /* noop */
        }
      }
    },
    {
      connection: connection as any,
      concurrency: 4,
    },
  );

  worker.on('failed', (job, err) => {
    console.error(`[WSCTX WORKER] 🚨 Job ${job?.id} failed:`, err?.message);
  });

  return worker;
};

export const startWorkspaceContextWorker = getWorkspaceContextWorker;
