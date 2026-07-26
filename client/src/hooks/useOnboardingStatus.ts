import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useFirebaseAuth } from './useFirebaseAuth'

/**
 * Resolves whether the currently authenticated user has completed onboarding.
 *
 * This intentionally reuses the exact same react-query keys (`/api/user` and
 * `/api/workspaces`) that AuthenticatedApp uses, so the data is fetched once and
 * shared from cache — there is no duplicate network cost.
 *
 * It exists so App.tsx can decide, BEFORE mounting AuthenticatedApp, whether a
 * logged-in user is allowed into the authenticated dashboard. A user who has not
 * finished onboarding must never see the dashboard (not even for a flash); they
 * belong on the public onboarding/signup flow instead.
 */
export interface OnboardingStatus {
  /** Auth or onboarding data is still resolving; caller should show a loader. */
  isResolving: boolean
  /** True only when we positively know the user has completed onboarding. */
  isOnboarded: boolean
}

export function useOnboardingStatus(): OnboardingStatus {
  const { user, loading: authLoading } = useFirebaseAuth()

  // Fast-path: check localStorage immediately before any API calls.
  // This handles the case where the user just completed onboarding and
  // window.location.href = '/' fired before the DB update propagated.
  const localOnboarded = (() => {
    try {
      return localStorage.getItem('isOnboarded') === 'true'
    } catch {
      return false
    }
  })()

  const { data: userData, isLoading: userDataLoading, isError: userDataError, isFetching: userDataFetching } = useQuery({
    queryKey: ['/api/user'],
    queryFn: () => apiRequest('/api/user'),
    enabled: !!user && !localOnboarded, // skip if already know from localStorage
    staleTime: 5 * 60 * 1000,
    retry: 3,
    retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })

  const { data: workspacesRaw, isLoading: workspacesLoading } = useQuery({
    queryKey: ['/api/workspaces'],
    queryFn: () => apiRequest('/api/workspaces'),
    enabled: !!user && !!userData && !localOnboarded, // skip if already know
    staleTime: 5 * 60 * 1000,
    retry: 3,
  })

  // No authenticated user: nothing to resolve.
  if (!user) {
    return { isResolving: authLoading, isOnboarded: false }
  }

  // Fast-path: localStorage flag is set — user completed onboarding this session.
  // Return immediately without waiting for API responses.
  if (localOnboarded) {
    return { isResolving: false, isOnboarded: true }
  }

  // Wait until we have the user profile before deciding anything.
  // Keep resolving if: still loading, OR fetching (includes retries), OR no data yet
  if (authLoading || userDataLoading || userDataFetching || !userData) {
    // Only unblock if the query has definitively errored (all retries exhausted)
    if (!userDataError) {
      return { isResolving: true, isOnboarded: false }
    }
  }

  const rawWorkspaces = (workspacesRaw as any)?.data ?? workspacesRaw ?? []
  const workspaces = Array.isArray(rawWorkspaces) ? rawWorkspaces : []
  const workspacesLoaded = typeof workspacesRaw !== 'undefined'
  const hasWorkspaces = workspacesLoaded && workspaces.length > 0

  // Positive signals that onboarding is complete.
  // /api/user returns { success: true, data: { isOnboarded, ... } }
  // Handle all response shapes: { data: user }, { user: user }, flat user
  const userRecord =
    (userData as any)?.data?.user ??
    (userData as any)?.data ??
    (userData as any)?.user ??
    userData

  if ((userRecord as any)?.isOnboarded === true || hasWorkspaces) {
    return { isResolving: false, isOnboarded: true }
  }

  // Not onboarded, but workspaces may still be loading — keep resolving so we
  // don't prematurely treat the user as not-onboarded and bounce them out.
  if (!workspacesLoaded) {
    return { isResolving: true, isOnboarded: false }
  }

  // Profile says not onboarded and there are no workspaces: definitely not onboarded.
  return { isResolving: false, isOnboarded: false }
}
