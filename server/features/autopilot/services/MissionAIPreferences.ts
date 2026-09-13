/**
 * Auto Pilot — MissionAIPreferences.
 *
 * Loads the workspace's configured AI settings (`Workspace.aiConfiguration` —
 * the same "AI Models" settings page every other AI feature in the app reads
 * via `getAIPreferences`) so Auto Pilot's LLM/vision calls honor the user's
 * chosen model, BYO API keys, persona/style, creativity, content-safety level,
 * and memory setting — instead of silently using hardcoded defaults.
 *
 * This is intentionally read-only and best-effort: a missing/unreadable
 * workspace config degrades to `{}` (the `AIServiceManager` defaults), so a
 * configuration problem never breaks the Operating Loop.
 *
 * Callers overlay mission-specific fields (e.g. `multilingual` from the
 * mission's `localLanguage`) on top of the returned base preferences.
 */

import { logger } from '../../../config/logger'
import type { UserAIPreferences } from '../../../services/AIServiceManager'

const COMPONENT = 'autopilot.MissionAIPreferences'

/**
 * Load the base `UserAIPreferences` for a mission's workspace, from
 * `Workspace.aiConfiguration` — the same settings the AI Models page writes.
 * Returns `{}` when the workspace has no configuration or can't be read.
 */
export async function loadWorkspaceAIPreferences(workspaceId: unknown): Promise<UserAIPreferences> {
  try {
    const { storage } = await import('../../../mongodb-storage')
    const workspace = await storage.getWorkspace(String(workspaceId))
    const config = (workspace as { aiConfiguration?: UserAIPreferences } | undefined)?.aiConfiguration
    return config ? { ...config } : {}
  } catch (error) {
    logger.warn('MissionAIPreferences: failed to load workspace AI configuration', {
      component: COMPONENT,
      workspaceId: String(workspaceId),
      error: error instanceof Error ? error.message : String(error),
    })
    return {}
  }
}
