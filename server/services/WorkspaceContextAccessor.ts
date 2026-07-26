/**
 * WorkspaceContextAccessor — the read-side used by the chat route.
 *
 * The workspace/account context lives INSIDE the single VeeGPT memory document
 * (UserMemory.workspaceContext), alongside the remembered facts. It is refreshed
 * in place by the background worker whenever the underlying data changes.
 *
 * Strategy (DB-exploit-safe):
 *   1. Read the snapshot from the memory document (one indexed lookup).
 *   2. If it's missing or older than the freshness window, enqueue a background
 *      refresh (BullMQ worker rebuilds + stores it) — but still return whatever
 *      we have so the reply isn't blocked.
 *   3. If the queue is unavailable and nothing is stored yet, build inline ONCE
 *      and store it, so the feature still works without a running worker.
 */

import {
  WorkspaceContextQueueManager,
  isWorkspaceContextQueueAvailable,
  WORKSPACE_CONTEXT_TTL_SECONDS,
} from '../queues/workspaceContextQueue';
import { UserMemory } from '../models/Chat';
import {
  buildWorkspaceContext,
  renderWorkspaceContext,
  renderIdentityContext,
  type WorkspaceContextSnapshot,
} from './WorkspaceContextService';
import { vlog } from '../utils/veegpt-debug-logger';

/** Freshness window — enqueue a background refresh if the snapshot is older. */
const FRESHNESS_MS = (WORKSPACE_CONTEXT_TTL_SECONDS / 2) * 1000; // 3h

/** Get the stored snapshot from the memory document (or null). Never throws. */
export async function getStoredWorkspaceContext(
  userId: string,
  workspaceId: string,
): Promise<WorkspaceContextSnapshot | null> {
  try {
    const mem = await UserMemory.findOne({ userId, workspaceId })
      .select('workspaceContext')
      .lean();
    return ((mem as any)?.workspaceContext as WorkspaceContextSnapshot) || null;
  } catch {
    return null;
  }
}

/** Persist a freshly-built snapshot into the memory document (upsert). */
async function storeWorkspaceContext(
  userId: string,
  workspaceId: string,
  snapshot: WorkspaceContextSnapshot,
): Promise<void> {
  await UserMemory.updateOne(
    { userId, workspaceId },
    {
      $set: { workspaceContext: snapshot, workspaceContextUpdatedAt: new Date(), updatedAt: new Date() },
      $setOnInsert: { userId, workspaceId, items: [], processedConversationIds: [], createdAt: new Date() },
    },
    { upsert: true },
  ).catch(() => {});
}

/**
 * Return a prompt-ready context block for the workspace, refreshing in the
 * background when stale. Reads from the single memory document.
 */
export async function getWorkspaceContextForPrompt(
  workspaceId?: string,
  userId?: string,
): Promise<string> {
  if (!workspaceId || !userId) return '';

  let stored = await getStoredWorkspaceContext(userId, workspaceId);

  // If nothing is stored yet, build it INLINE right now so the very first
  // message already has the user's data (don't wait for a background job — that
  // left early messages with no context). This is a one-time cost; once stored,
  // subsequent messages just read it.
  if (!stored) {
    try {
      const snapshot = await buildWorkspaceContext(workspaceId, userId);
      await storeWorkspaceContext(userId, workspaceId, snapshot);
      vlog('wsctx:inline-built', { workspaceId, accounts: snapshot.socialAccounts.length });
      return renderWorkspaceContext(snapshot);
    } catch (err: any) {
      vlog('wsctx:inline-error', { workspaceId, error: err?.message });
      return '';
    }
  }

  // Stored but stale → refresh in the background; still return what we have.
  const ageMs = Date.now() - new Date(stored.generatedAt).getTime();
  if (ageMs > FRESHNESS_MS) {
    if (isWorkspaceContextQueueAvailable()) {
      void WorkspaceContextQueueManager.enqueue({ workspaceId, userId, reason: 'stale' });
      vlog('wsctx:refresh-enqueued', { workspaceId, ageMs });
    } else {
      // No worker — refresh inline so it doesn't stay stale forever.
      try {
        const snapshot = await buildWorkspaceContext(workspaceId, userId);
        await storeWorkspaceContext(userId, workspaceId, snapshot);
        stored = snapshot;
      } catch { /* keep serving the stale one */ }
    }
  }

  return renderWorkspaceContext(stored);
}

/**
 * Return the lightweight IDENTITY-only context block (name/plan/niche/workspace)
 * from the same cached snapshot. Used when the heavy per-account analytics are
 * being fetched on demand (a specific account is selected) but we still want
 * VeeGPT to know who it's talking to. Never throws; builds inline on a miss.
 */
export async function getIdentityContextForPrompt(
  workspaceId?: string,
  userId?: string,
): Promise<string> {
  if (!workspaceId || !userId) return '';
  let stored = await getStoredWorkspaceContext(userId, workspaceId);
  if (!stored) {
    try {
      stored = await buildWorkspaceContext(workspaceId, userId);
      await storeWorkspaceContext(userId, workspaceId, stored);
    } catch {
      return '';
    }
  }
  return renderIdentityContext(stored);
}

/**
 * Force a refresh of a workspace's context. Used by the data-change hooks and
 * the manual Settings refresh. Enqueues a worker job; falls back to inline
 * rebuild + store when the queue is unavailable.
 */
export async function refreshWorkspaceContext(
  workspaceId: string,
  userId: string,
  reason: string,
): Promise<void> {
  if (isWorkspaceContextQueueAvailable()) {
    await WorkspaceContextQueueManager.enqueue({ workspaceId, userId, reason });
    return;
  }
  try {
    const snapshot = await buildWorkspaceContext(workspaceId, userId);
    await storeWorkspaceContext(userId, workspaceId, snapshot);
  } catch (err: any) {
    vlog('wsctx:refresh-inline-error', { workspaceId, reason, error: err?.message });
  }
}
