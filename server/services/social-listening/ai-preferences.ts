import { storage } from '../../storage';
import { resolveNiche } from '../niche.util';

/**
 * Load the effective AI configuration for a workspace, exactly like the rest of
 * the app (caption generation, growth recommendations, analytics banner):
 *   user.preferences  <-  workspace.aiConfiguration (workspace overrides user)
 *
 * This is what makes Social Listening honor the user's AI Configuration from
 * Settings — model, creativity, persona, tone, language, content safety, and
 * any per-workspace API keys — instead of being hardcoded to gpt-4o-mini.
 */
export async function loadSocialListeningPreferences(
  userId: string | undefined,
  workspaceId: string | undefined
): Promise<any> {
  let preferences: any = {};

  try {
    if (userId) {
      const userObj = await storage.getUser(userId);
      if (userObj?.preferences) preferences = { ...userObj.preferences };
      // Guarantee the niche is present even for older accounts.
      if (userObj && !preferences.contentNiche) {
        const niche = resolveNiche(userObj);
        if (niche) preferences.contentNiche = niche;
      }
    }
  } catch (e) {
    console.warn('[SocialListening] Failed to load user preferences:', (e as Error).message);
  }

  try {
    if (workspaceId) {
      const workspace = await storage.getWorkspace(workspaceId);
      if (workspace?.aiConfiguration) {
        // Workspace AI configuration takes precedence over user defaults.
        preferences = { ...preferences, ...workspace.aiConfiguration };
      }
    }
  } catch (e) {
    console.warn('[SocialListening] Failed to load workspace AI configuration:', (e as Error).message);
  }

  return preferences;
}
