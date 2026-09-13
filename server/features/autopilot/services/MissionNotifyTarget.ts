/**
 * Auto Pilot — MissionNotifyTarget.
 *
 * Resolves WHO to notify for a Mission's autonomous actions: the workspace
 * owner, plus whatever session/device/email info the {@link NotificationDispatcher}
 * needs to actually deliver it. Centralised so every "I just did this
 * autonomously" notification (a published post, an activated automation) uses
 * the exact same resolution instead of re-deriving it ad hoc — this is the
 * "notify before/after it happens" half of Autopilot mode: the agent acts on
 * its own, and this is how the user finds out.
 *
 * Best-effort by design: a failure to resolve the owner degrades to `null`, so
 * a notification failure never blocks or fails the Operating Loop.
 */

import { logger } from '../../../config/logger'
import type { SessionContext } from './NotificationDispatcher'

const COMPONENT = 'autopilot.MissionNotifyTarget'

/** Everything {@link NotificationDispatcher.dispatch} needs, for one user. */
export interface NotifyTarget {
  userId: string
  sessionContext: SessionContext
  deviceToken: string | null
  email: string | null
}

/** Resolve the workspace owner (and their contact info) for a mission's workspace. */
export async function resolveMissionNotifyTarget(workspaceId: unknown): Promise<NotifyTarget | null> {
  try {
    const { workspaceRepository } = await import('../../../repositories/WorkspaceRepository')
    const workspace = await workspaceRepository.findById(String(workspaceId))
    const ownerId = (workspace as { ownerId?: unknown } | null)?.ownerId
    if (!ownerId) return null

    let email: string | null = null
    try {
      const { storage } = await import('../../../mongodb-storage')
      const user = await storage.getUser(String(ownerId))
      email = (user as { email?: string } | undefined)?.email ?? null
    } catch {
      /* best-effort — email fallback simply won't be available */
    }

    return { userId: String(ownerId), sessionContext: 'web', deviceToken: null, email }
  } catch (error) {
    logger.warn('MissionNotifyTarget: failed to resolve workspace owner', {
      component: COMPONENT,
      workspaceId: String(workspaceId),
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}
