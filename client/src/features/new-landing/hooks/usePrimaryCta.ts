import { useCallback } from 'react'

import { useEarlyAccessCheck } from '../../../hooks/useEarlyAccessCheck'

/**
 * Waitlist-aware primary CTA.
 *
 * Mirrors the behaviour of the legacy landing page / MainNavigation:
 *  - A visitor who has NOT been approved for beta sees a "Join Waitlist" CTA
 *    that routes to `/waitlist`.
 *  - A visitor who HAS early access sees a "Get Started" CTA that routes to
 *    `/signup` (the global App.tsx gate then lets them through).
 *
 * The early-access status comes from {@link useEarlyAccessCheck}, the single
 * source of truth (localStorage + `/api/early-access/status`, kept in sync via
 * the `veefore:auth_update` / storage / focus listeners).
 *
 * @param onNavigate host router navigation handler (page key without slash).
 */
export interface PrimaryCta {
  /** `true` once the visitor is approved for beta access. */
  hasEarlyAccess: boolean
  /** Button label appropriate to the current access state. */
  label: string
  /** Short label variant for compact controls (e.g. the nav button). */
  shortLabel: string
  /** Navigates to `/signup` when approved, otherwise `/waitlist`. */
  go: () => void
}

export function usePrimaryCta(onNavigate?: (page: string) => void): PrimaryCta {
  const { hasEarlyAccess } = useEarlyAccessCheck()

  const navigate = useCallback(
    (page: string) => {
      if (onNavigate) {
        onNavigate(page)
        return
      }
      // Fallback when mounted without a router handler (tests / standalone).
      if (typeof window !== 'undefined') {
        window.location.assign(`/${page}`)
      }
    },
    [onNavigate],
  )

  const go = useCallback(() => {
    navigate(hasEarlyAccess ? 'signup' : 'waitlist')
  }, [navigate, hasEarlyAccess])

  return {
    hasEarlyAccess,
    label: hasEarlyAccess ? 'Get Started' : 'Join Waitlist',
    shortLabel: hasEarlyAccess ? 'Sign Up' : 'Join Waitlist',
    go,
  }
}
