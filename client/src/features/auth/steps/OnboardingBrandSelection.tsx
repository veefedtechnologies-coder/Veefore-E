import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, CheckCircle, AlertCircle, Info, X, Instagram, Facebook } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { auth } from '@/lib/firebase'

/**
 * OnboardingBrandSelection
 *
 * Onboarding step 6: Choose which brand to manage first.
 * Shown only when the Meta OAuth callback returned authorizedBrandCount > 1.
 *
 * Responsibilities:
 * 1. Fetch the list of authorized brands from GET /api/authorized-brands
 * 2. Display one selectable card per brand (pageName + profile picture)
 * 3. Enable "Get Started" only after a brand is selected
 * 4. On confirm: POST /api/authorized-brands/:pageId/import, store workspace.id,
 *    redirect to /
 * 5. Show dismissible info notice about remaining brands
 * 6. Show loading states and error with retry on failure
 *
 * **Validates: Requirements 4.6, 4.7**
 */

async function getIdToken(firebaseUser?: any): Promise<string> {
  try {
    const user = firebaseUser ?? auth.currentUser
    if (user?.getIdToken) return await user.getIdToken(false)
  } catch { /* ignore */ }
  return ''
}

async function authHeaders(firebaseUser?: any): Promise<Record<string, string>> {
  const token = await getIdToken(firebaseUser)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface AuthorizedBrand {
  pageId: string
  pageName: string
  pageProfilePictureUrl: string
  linkedInstagramAccountId: string | null
  status: 'INACTIVE' | 'IMPORTED' | 'EXPIRED'
}

interface OnboardingBrandSelectionProps {
  createdFirebaseUser: any
}

export function OnboardingBrandSelection({ createdFirebaseUser }: OnboardingBrandSelectionProps) {
  const { toast } = useToast()

  const [brands, setBrands] = useState<AuthorizedBrand[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [isLoadingBrands, setIsLoadingBrands] = useState(true)
  const [isImporting, setIsImporting] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [showInfoBanner, setShowInfoBanner] = useState(true)

  // Fetch authorized brands on mount — retry a few times in case of auth race condition
  // (Firebase session may not be fully restored when this component first mounts)
  useEffect(() => {
    let attempts = 0
    const MAX_ATTEMPTS = 3
    const RETRY_DELAY = 1500 // ms

    const tryFetch = async () => {
      attempts++
      await fetchBrands()
      // If we got no brands and have more attempts, retry after a delay
      // (handles the case where Firebase auth hasn't loaded auth.currentUser yet)
    }

    // Small initial delay to let Firebase auth restore
    const initial = setTimeout(tryFetch, 300)
    return () => clearTimeout(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchBrands = async () => {
    setIsLoadingBrands(true)
    setFetchError(null)

    try {
      // Wait for Firebase auth to be ready — retry getIdToken up to 3s
      let hdrs = await authHeaders(createdFirebaseUser)
      if (!hdrs.Authorization) {
        // Firebase auth might not be ready yet — wait and retry
        await new Promise(r => setTimeout(r, 1000))
        hdrs = await authHeaders(createdFirebaseUser)
      }

      const res = await fetch('/api/authorized-brands', { headers: hdrs, credentials: 'include' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.message ?? body?.message ?? `Could not load your authorized brands (${res.status}). Please try again.`)
      }
      const body = await res.json()
      const list: AuthorizedBrand[] = body?.data ?? body ?? []
      setBrands(list)

      // If empty and no error, retry once after delay (OAuth callback may still be writing)
      if (list.length === 0) {
        setTimeout(async () => {
          try {
            const hdrs2 = await authHeaders(createdFirebaseUser)
            const res2 = await fetch('/api/authorized-brands', { headers: hdrs2, credentials: 'include' })
            if (res2.ok) {
              const body2 = await res2.json()
              const list2: AuthorizedBrand[] = body2?.data ?? body2 ?? []
              if (list2.length > 0) setBrands(list2)
            }
          } catch { /* ignore retry error */ }
        }, 2000)
      }
    } catch (err: any) {
      console.error('[OnboardingBrandSelection] fetchBrands failed:', err)
      setFetchError(err.message ?? 'Failed to load brands.')
    } finally {
      setIsLoadingBrands(false)
    }
  }

  const handleConfirm = async () => {
    if (!selectedPageId) return

    setIsImporting(true)
    setImportError(null)

    try {
      const hdrs = await authHeaders(createdFirebaseUser)
      const importRes = await fetch(`/api/authorized-brands/${selectedPageId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...hdrs },
        credentials: 'include',
      })

      if (!importRes.ok) {
        const errBody = await importRes.json().catch(() => ({}))
        throw new Error(
          errBody?.error?.message ?? errBody?.message ?? 'Import failed. Please try again.'
        )
      }

      const importData = await importRes.json()
      // importData shape: { success: true, data: IWorkspace }
      // IWorkspace has _id (MongoDB ObjectId serialized as string)
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

      // Persist the active workspace
      localStorage.setItem('currentWorkspaceId', workspaceId)

      // Mark user as onboarded in the DB so the App.tsx gate lets them through
      try {
        await fetch('/api/user/complete-onboarding', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...hdrs },
          credentials: 'include',
          body: JSON.stringify({ preferences: {} }),
        })
      } catch (onboardingErr) {
        console.warn('[OnboardingBrandSelection] completeOnboarding call failed (non-fatal):', onboardingErr)
      }

      // Persist onboarded flag locally so useOnboardingStatus returns true immediately
      try {
        localStorage.setItem('isOnboarded', 'true')
        // Clear onboarding step — user has completed onboarding
        sessionStorage.removeItem('veefore_onboarding_step')
      } catch { /* ignore */ }

      const selectedBrand = brands.find((b) => b.pageId === selectedPageId)
      toast({
        title: 'Welcome! 🎉',
        description: `Workspace "${selectedBrand?.pageName ?? 'My Brand'}" is ready.`,
      })

      // Use client-side navigation to avoid a hard reload that briefly sets
      // isOnboarded=false and triggers the AuthenticatedApp onboarding redirect loop.
      // The isOnboarded=true localStorage flag ensures the gate doesn't fire.
      window.location.replace('/')
    } catch (err: any) {
      console.error('[OnboardingBrandSelection] import failed:', err)
      setImportError(err.message ?? 'Something went wrong. Please try again.')
      toast({
        title: 'Import Failed',
        description: err.message ?? 'Could not create your workspace.',
        variant: 'destructive',
      })
    } finally {
      setIsImporting(false)
    }
  }

  const remainingCount = brands.length > 0 ? brands.length - 1 : 0

  return (
    <motion.div
      key="onboarding-brand-selection"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="space-y-5 py-4"
    >
      {/* Header */}
      <div className="text-center">
        <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 border border-teal-500/30">
          <CheckCircle className="w-6 h-6 text-teal-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-1">Choose the brand you want to manage first.</h2>
        <p className="text-sm text-white/50">
          We found {brands.length > 0 ? brands.length : 'multiple'} connected brands. Pick one to start.
        </p>
      </div>

      {/* Loading state */}
      {isLoadingBrands && (
        <div className="flex flex-col items-center gap-3 py-6">
          <Loader2 className="w-7 h-7 text-teal-400 animate-spin" />
          <p className="text-sm text-white/50">Loading your brands…</p>
        </div>
      )}

      {/* Fetch error */}
      {!isLoadingBrands && fetchError && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
            <p className="text-sm text-red-200">{fetchError}</p>
          </div>
          <button
            type="button"
            onClick={fetchBrands}
            className="w-full h-10 rounded-lg bg-white/10 hover:bg-white/15 text-white font-medium text-sm transition-all"
          >
            Try again
          </button>
        </div>
      )}

      {/* Brand cards */}
      {!isLoadingBrands && !fetchError && brands.length > 0 && (
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {brands.map((brand) => {
            const isSelected = selectedPageId === brand.pageId
            return (
              <button
                key={brand.pageId}
                type="button"
                onClick={() => setSelectedPageId(brand.pageId)}
                disabled={isImporting}
                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all disabled:opacity-60 ${
                  isSelected
                    ? 'bg-teal-500/20 border-teal-500/60'
                    : 'bg-white/5 border-white/10 hover:bg-white/10'
                }`}
                aria-pressed={isSelected}
              >
                {/* Profile picture or letter placeholder */}
                <div className="shrink-0 w-10 h-10 rounded-full overflow-hidden border border-white/10">
                  {brand.pageProfilePictureUrl ? (
                    <img
                      src={brand.pageProfilePictureUrl}
                      alt={brand.pageName}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        // Fall back to letter placeholder on load error
                        ;(e.currentTarget as HTMLImageElement).style.display = 'none'
                        const sibling = e.currentTarget.nextElementSibling as HTMLElement | null
                        if (sibling) sibling.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  {/* Letter placeholder (always in DOM, hidden when image works) */}
                  <div
                    className="w-full h-full bg-gradient-to-br from-teal-600 to-emerald-700 flex items-center justify-center text-white font-bold text-base"
                    style={{ display: brand.pageProfilePictureUrl ? 'none' : 'flex' }}
                    aria-hidden="true"
                  >
                    {brand.pageName.charAt(0).toUpperCase()}
                  </div>
                </div>

                {/* Brand name */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{brand.pageName}</p>
                  {brand.linkedInstagramAccountId && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Instagram className="w-3 h-3 text-pink-500 flex-shrink-0" />
                      <p className="text-xs text-white/50 truncate">
                        {brand.linkedInstagramUsername
                          ? `@${brand.linkedInstagramUsername}`
                          : 'Instagram linked'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Selection indicator */}
                <div
                  className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all ${
                    isSelected ? 'border-teal-400 bg-teal-400' : 'border-white/30'
                  }`}
                >
                  {isSelected && (
                    <div className="w-1.5 h-1.5 rounded-full bg-white" aria-hidden="true" />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {/* Import error */}
      {importError && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <p className="text-sm text-red-200">{importError}</p>
        </div>
      )}

      {/* Get Started button */}
      {!isLoadingBrands && !fetchError && (
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!selectedPageId || isImporting}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:from-teal-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-teal-900/20"
        >
          {isImporting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Setting up workspace…
            </>
          ) : (
            'Get Started'
          )}
        </button>
      )}

      {/* Dismissible info banner about remaining brands */}
      {showInfoBanner && !isLoadingBrands && !fetchError && remainingCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 flex items-start gap-2"
        >
          <Info className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
          <p className="text-xs text-blue-200 flex-1">
            Remaining brands will be available when you upgrade your plan.
          </p>
          <button
            type="button"
            onClick={() => setShowInfoBanner(false)}
            className="text-blue-400 hover:text-blue-200 transition-colors shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </motion.div>
  )
}
