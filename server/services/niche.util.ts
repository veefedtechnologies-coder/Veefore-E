/**
 * Centralized niche resolution and synchronization.
 *
 * Historically the user's niche lived in TWO places that drifted out of sync:
 *   - `user.niche`                      (used by Social Listening)
 *   - `user.preferences.contentNiche`   (used by all AI features)
 *
 * This module makes them a single logical value. Use `resolveNiche` to read the
 * effective niche anywhere, and `syncNicheUpdate` to build an update patch that
 * keeps both locations consistent whenever either one changes.
 */

export const DEFAULT_NICHE = 'lifestyle';

/**
 * Resolve the effective niche for a user, regardless of which field it was
 * saved in. Prefers the explicit top-level `niche`, then `preferences.contentNiche`.
 */
export function resolveNiche(user: any): string | undefined {
  if (!user) return undefined;

  const top = typeof user.niche === 'string' ? user.niche.trim() : '';
  if (top) return top;

  const pref = user?.preferences?.contentNiche;
  if (typeof pref === 'string' && pref.trim()) return pref.trim();

  // Fallback for accounts whose niche was only persisted in the onboarding blob
  // (older/alternate onboarding paths) and never mirrored to the fields above.
  const od = user?.onboardingData;
  if (od && typeof od === 'object') {
    const candidates = [
      od.niche,
      od.contentNiche,
      od.userProfile?.niche,
      od.userProfile?.contentNiche,
      od.questionnaire?.contentNiche,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim()) return c.trim();
    }
  }

  return undefined;
}

/**
 * Resolve the niche or fall back to the platform default. Useful for AI
 * features that always need a niche to operate.
 */
export function resolveNicheOrDefault(user: any, fallback: string = DEFAULT_NICHE): string {
  return resolveNiche(user) || fallback;
}

/**
 * Given an incoming profile/preferences update, return an update patch that
 * keeps `niche` and `preferences.contentNiche` synchronized.
 *
 * - If the update sets a new top-level `niche`, mirror it into preferences.
 * - If the update sets `preferences.contentNiche` (and no explicit niche),
 *   mirror it up to the top-level `niche`.
 *
 * `existingPreferences` is merged so we never drop unrelated preference keys
 * when the caller only sends a partial preferences object.
 */
export function syncNicheUpdate(
  update: Record<string, any>,
  existingPreferences: Record<string, any> = {}
): Record<string, any> {
  const patch: Record<string, any> = { ...update };

  const incomingPreferences = update.preferences && typeof update.preferences === 'object'
    ? update.preferences
    : undefined;

  const explicitNiche = typeof update.niche === 'string' ? update.niche.trim() : undefined;
  const prefNiche = incomingPreferences && typeof incomingPreferences.contentNiche === 'string'
    ? incomingPreferences.contentNiche.trim()
    : undefined;

  // Determine the authoritative niche value from this update.
  const effective = explicitNiche || prefNiche;

  if (!effective) {
    // The update contained no usable niche value. If it included an empty or
    // whitespace-only niche, drop it so we never persist a blank niche; but
    // leave a genuinely niche-less update untouched.
    if ('niche' in update && (explicitNiche === undefined || explicitNiche === '')) {
      delete patch.niche;
    }
    if (incomingPreferences && 'contentNiche' in incomingPreferences && !prefNiche) {
      patch.preferences = { ...existingPreferences, ...incomingPreferences };
      delete patch.preferences.contentNiche;
    }
    return patch;
  }

  // Always keep top-level niche in sync.
  patch.niche = effective;

  // Always keep preferences.contentNiche in sync, preserving other prefs.
  patch.preferences = {
    ...existingPreferences,
    ...(incomingPreferences || {}),
    contentNiche: effective
  };

  return patch;
}
