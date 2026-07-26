import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { auth } from '@/lib/firebase'

/**
 * OnboardingConnectMeta
 *
 * Onboarding step 5: Connect Meta (Facebook / Instagram)
 *
 * Responsibilities:
 * 1. Show a "Connect Meta" button that redirects to Meta OAuth via
 *    /api/facebook/auth/start?context=onboarding
 * 2. On mount, read `authorizedBrandCount` from URL params (placed there
 *    by the backend callback redirect).
 * 3. authorizedBrandCount === 0  → show error + "Reconnect Meta" button
 * 4. authorizedBrandCount === 1  → auto-import first brand, store
 *    workspace.id in localStorage, redirect to /
 * 5. authorizedBrandCount  > 1  → advance to onboarding-brand-selection
 * 6. Show loading states during API calls.
 * 7. On failure → show error with retry; do NOT redirect.
 *
 * **Validates: Requirements 4.2, 4.3, 4.4, 4.5**
 */

interface OnboardingConnectMetaProps {
  setCurrentStep: (step: any) => void
  createdFirebaseUser: any
}

type ViewState =
  | 'idle'          // initial — user has not yet clicked Connect
  | 'loading'       // API call in progress
  | 'no-pages'      // authorizedBrandCount === 0
  | 'error'         // import failed

/** Get a fresh Firebase ID token — works regardless of whether the user was
 *  passed as a prop (sign-up flow) or is available on the Firebase auth instance
 *  (Meta OAuth callback return flow). Returns empty string on failure. */
async function getIdToken(firebaseUser?: any): Promise<string> {
  try {
    const user = firebaseUser ?? auth.currentUser
    if (user?.getIdToken) {
      return await user.getIdToken(/* forceRefresh */ false)
    }
  } catch { /* ignore */ }
  return ''
}

/** Build Authorization header if we have a token. */
async function authHeaders(firebaseUser?: any): Promise<Record<string, string>> {
  const token = await getIdToken(firebaseUser)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function OnboardingConnectMeta({
  setCurrentStep,
  createdFirebaseUser,
}: OnboardingConnectMetaProps) {
  const { toast } = useToast()
  const [viewState, setViewState] = useState<ViewState>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')

  // On mount: check if we returned from Meta OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const countParam = params.get('authorizedBrandCount')
    const metaErrorParam = params.get('meta_error')

    if (countParam === null && metaErrorParam === null) return // Not a callback — normal first load

    // Clean up URL to avoid re-processing on next mount
    const cleanUrl = window.location.pathname
    window.history.replaceState({}, '', cleanUrl)

    // Handle error returned from callback
    if (metaErrorParam) {
      setErrorMessage(decodeURIComponent(metaErrorParam))
      setViewState('error')
      return
    }

    const count = parseInt(countParam!, 10)

    if (count === 0) {
      setViewState('no-pages')
      return
    }

    if (count > 1) {
      // Multiple brands — let user pick in the next step
      setCurrentStep('onboarding-brand-selection')
      return
    }

    // Exactly 1 brand — auto-import
    handleAutoImport()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleAutoImport = async () => {
    setViewState('loading')
    setErrorMessage('')

    try {
      // Get Firebase ID token once — used for all authenticated API calls below
      // Wait for auth.currentUser if not immediately available
      let hdrs = await authHeaders(createdFirebaseUser)
      if (!hdrs.Authorization) {
        await new Promise(r => setTimeout(r, 1000))
        hdrs = await authHeaders(createdFirebaseUser)
      }

      // 1. Fetch the list of authorized brands
      const brandsRes = await fetch('/api/authorized-brands', {
        headers: hdrs,
        credentials: 'include',
      })
      if (!brandsRes.ok) {
        const body = await brandsRes.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? body?.message ?? `Failed to fetch authorized brands (${brandsRes.status}).`)
      }
      const brandsData = await brandsRes.json()
      const brands: any[] = brandsData?.data ?? brandsData ?? []

      if (brands.length === 0) {
        throw new Error('No authorized brands found. Please reconnect Meta.')
      }

      const firstBrand = brands[0]
      const pageId: string = firstBrand.pageId

      // 2. Import the brand → creates workspace + social accounts
      const importRes = await fetch(`/api/authorized-brands/${pageId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...hdrs },
        credentials: 'include',
      })

      if (!importRes.ok) {
        const errBody = await importRes.json().catch(() => ({}))
        throw new Error(
          errBody?.error?.message ?? errBody?.message ?? `Import failed (${importRes.status}). Please try again.`
        )
      }

      const importData = await importRes.json()
      // importData shape: { success: true, data: IWorkspace }
      // IWorkspace has _id (MongoDB ObjectId), which gets serialized as _id string
      const workspaceRaw = importData?.data?.workspace ?? importData?.workspace ?? importData?.data
      const workspaceId: string =
        workspaceRaw?._id?.toString?.() ??
        workspaceRaw?.id?.toString?.() ??
        workspaceRaw?._id ??
        workspaceRaw?.id ??
        ''

      if (!workspaceId) {
        throw new Error('Import succeeded but workspace ID was not returned.')
      }

      // 3. Persist the active workspace
      localStorage.setItem('currentWorkspaceId', workspaceId)

      // 4. Mark the user as fully onboarded so the gate in App.tsx lets them through
      try {
        await fetch('/api/user/complete-onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...hdrs },
          credentials: 'include',
          body: JSON.stringify({ preferences: {} }),
        })
      } catch (onboardingErr) {
        console.warn('[OnboardingConnectMeta] completeOnboarding call failed (non-fatal):', onboardingErr)
      }

      // 5. Also persist onboarded flag in localStorage so useOnboardingStatus
      //    immediately knows without waiting for a fresh /api/user fetch
      try {
        localStorage.setItem('isOnboarded', 'true')
        // Clear onboarding step — user has completed onboarding
        sessionStorage.removeItem('veefore_onboarding_step')
      } catch { /* ignore */ }

      toast({
        title: 'Welcome! 🎉',
        description: `Your workspace is ready.`,
      })

      // 6. Navigate to dashboard — use replace() so the onboarding URL is not in history
      window.location.replace('/')
    } catch (err: any) {
      console.error('[OnboardingConnectMeta] Auto-import failed:', err)
      setErrorMessage(err.message ?? 'Something went wrong. Please try again.')
      setViewState('error')
      toast({
        title: 'Import Failed',
        description: err.message ?? 'Could not import your brand. Please try again.',
        variant: 'destructive',
      })
    }
  }

  const handleConnectMeta = () => {
    window.location.href = '/api/facebook/auth/start?context=onboarding'
  }

  return (
    <motion.div
      key="onboarding-connect-meta"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 py-4"
    >
      {/* Header */}
      <div className="text-center">
        {/* Meta / Facebook logo mark */}
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 bg-blue-500/20 border border-blue-500/30">
          <svg
            className="w-7 h-7 text-blue-400"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.514c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-white mb-2">Connect your Meta account</h2>
        <p className="text-sm text-white/50 max-w-xs mx-auto">
          This connects your Facebook Pages and Instagram accounts so Veefore can manage
          your content and analytics in one place.
        </p>
      </div>

      {/* State: Loading */}
      {viewState === 'loading' && (
        <div className="flex flex-col items-center gap-3 py-4">
          <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
          <p className="text-sm text-white/60">Setting up your workspace…</p>
        </div>
      )}

      {/* State: No pages authorized */}
      {viewState === 'no-pages' && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-200">
              No Facebook Pages were authorized. Please reconnect Meta and authorize at
              least one Page.
            </p>
          </div>
          <button
            type="button"
            onClick={handleConnectMeta}
            className="w-full h-10 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:from-teal-600 hover:to-emerald-700 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Reconnect Meta
          </button>
        </div>
      )}

      {/* State: Import error */}
      {viewState === 'error' && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-200">{errorMessage}</p>
          </div>
          <button
            type="button"
            onClick={handleAutoImport}
            className="w-full h-10 rounded-lg bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:from-teal-600 hover:to-emerald-700 transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Retry
          </button>
        </div>
      )}

      {/* State: Idle — show Connect button */}
      {viewState === 'idle' && (
        <button
          type="button"
          onClick={handleConnectMeta}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold text-sm flex items-center justify-center gap-3 hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-900/30"
        >
          {/* Meta logo inline */}
          <svg
            className="w-5 h-5 shrink-0"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.514c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z" />
          </svg>
          Connect Meta
        </button>
      )}

      {/* Informational footer */}
      {viewState === 'idle' && (
        <p className="text-center text-white/30 text-xs px-4">
          You'll be redirected to Meta (Facebook) to authorize access. Veefore only requests
          the permissions needed to manage your pages and view analytics.
        </p>
      )}
    </motion.div>
  )
}
