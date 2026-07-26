import type { ProfileFormData } from '../types/profile.types';

/**
 * Build the canonical profile-form values directly from the loaded user record.
 *
 * This is the single source of truth for what the Settings form displays when
 * the user hasn't made any local edits yet. Deriving it from `userData` at
 * render time (instead of copying into state via useEffect) eliminates the
 * React Query timing bug where the form initialized before `preferences`/`niche`
 * hydrated and got stuck showing an empty value.
 *
 * Niche resolution: the niche lives in two places that must stay consistent —
 * `user.preferences.contentNiche` (used by AI features) and `user.niche`
 * (top-level, used by social listening). We prefer the preference value and
 * fall back to the top-level field.
 */
export function deriveFormFromUser(userData: any): ProfileFormData {
  const prefs = userData?.preferences || {};
  const niche = prefs.contentNiche || userData?.niche || '';
  const businessType = userData?.businessType || 'solo';
  return {
    displayName: userData?.displayName || '',
    username: userData?.username || '',
    phone: prefs.phone || '',
    timezone: prefs.timezone || 'Asia/Kolkata (IST)',
    language: prefs.language || 'English (US)',
    bio: prefs.bio || '',
    businessType,
    primaryPlatform: prefs.primaryPlatform || '',
    contentNiche: niche,
    creatorAudienceSize: prefs.creatorAudienceSize || '',
    postingFrequency: prefs.postingFrequency || '',
    startupStage: prefs.startupStage || '',
    startupTeamSize: prefs.startupTeamSize || '',
    startupGrowthChannel: prefs.startupGrowthChannel || '',
    timeline: prefs.timeline || '',
    agencyClientCount: prefs.agencyClientCount || '',
    agencyServices: prefs.agencyServices || '',
    agencyNiche: prefs.agencyNiche || (businessType === 'agency' ? (userData?.niche || '') : ''),
    agencyMonthlyOutput: prefs.agencyMonthlyOutput || '',
    enterpriseIndustry: prefs.enterpriseIndustry || '',
    enterpriseDepartment: prefs.enterpriseDepartment || '',
    enterpriseSecurity: prefs.enterpriseSecurity || '',
    enterpriseBudget: prefs.enterpriseBudget || '',
  };
}
