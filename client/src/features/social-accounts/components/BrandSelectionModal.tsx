/**
 * BrandSelectionModal
 *
 * Shows the user's INACTIVE authorized brands and lets them pick ONE brand
 * to connect to the current workspace (or to create a new workspace for).
 *
 * HARD RULE: One brand per workspace. If the workspace already has a connected
 * brand, shows an "upgrade your plan" prompt instead of brand list.
 */

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Loader2, CheckCircle, AlertCircle, Building2,
  Instagram, Facebook, Lock, ArrowRight, Crown,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { auth } from '@/lib/firebase'
import { useQueryClient } from '@tanstack/react-query'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AuthorizedBrand {
  pageId: string
  pageName: string
  pageProfilePictureUrl: string
  linkedInstagramAccountId: string | null
  linkedInstagramUsername: string | null
  status: 'INACTIVE' | 'IMPORTED' | 'EXPIRED'
}

export interface BrandSelectionModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  title?: string
  description?: string
  createNewWorkspace?: boolean
  onSuccess?: (workspaceId: string) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getIdToken(): Promise<string> {
  try {
    const user = auth.currentUser
    if (user?.getIdToken) return await user.getIdToken(false)
  } catch { /* ignore */ }
  return ''
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getIdToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BrandSelectionModal({
  open,
  onOpenChange,
  workspaceId,
  title = 'Choose a brand to connect',
  description = 'Each workspace manages one brand. Other authorized brands need their own workspace.',
  createNewWorkspace = false,
  onSuccess,
}: BrandSelectionModalProps) {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const [brands, setBrands] = useState<AuthorizedBrand[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [isLoadingBrands, setIsLoadingBrands] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  /** true when the current workspace already has a brand connected */
  const [workspaceHasBrand, setWorkspaceHasBrand] = useState(false)
  /** true when the user is at plan workspace limit */
  const [atPlanLimit, setAtPlanLimit] = useState(false)

  useEffect(() => {
    if (open) {
      setSelectedPageId(null)
      setImportError(null)
      setWorkspaceHasBrand(false)
      setAtPlanLimit(false)
      fetchBrands()
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchBrands = async () => {
    setIsLoadingBrands(true)
    setFetchError(null)
    try {
      const hdrs = await authHeaders()

      // Check if workspace already has a connected brand (one-brand rule)
      if (!createNewWorkspace && workspaceId) {
        const saRes = await fetch(
          `/api/social-accounts?workspaceId=${encodeURIComponent(workspaceId)}`,
          { headers: hdrs, credentials: 'include' }
        )
        if (saRes.ok) {
          const saData = await saRes.json()
          const accounts = saData?.data ?? saData ?? []
          const activeAccounts = Array.isArray(accounts)
            ? accounts.filter((a: any) => a.connectionStatus === 'ACTIVE' || a.isActive !== false)
            : []
          if (activeAccounts.length > 0) {
            setWorkspaceHasBrand(true)
            setIsLoadingBrands(false)
            return
          }
        }
      }

      // Check if user is at plan workspace limit (for new workspace creation)
      if (createNewWorkspace) {
        const limitsRes = await fetch('/api/workspaces-v2/limits', { headers: hdrs, credentials: 'include' })
          .catch(() => fetch('/api/workspaces/limits', { headers: hdrs, credentials: 'include' }))
        if (limitsRes.ok) {
          const limitsData = await limitsRes.json()
          const limits = limitsData?.data ?? limitsData
          if (limits?.remainingCapacity === 0) {
            setAtPlanLimit(true)
            setIsLoadingBrands(false)
            return
          }
        }
      }

      // Fetch authorized brands
      const res = await fetch('/api/authorized-brands', { headers: hdrs, credentials: 'include' })
      if (!res.ok) throw new Error(`Could not load brands (${res.status})`)
      const data = await res.json()
      const list: AuthorizedBrand[] = data?.data ?? data ?? []
      setBrands(list.filter((b) => b.status === 'INACTIVE'))
    } catch (err: any) {
      setFetchError(err.message ?? 'Failed to load brands')
    } finally {
      setIsLoadingBrands(false)
    }
  }

  const handleConfirm = async () => {
    if (!selectedPageId) return
    setIsImporting(true)
    setImportError(null)

    try {
      const hdrs = await authHeaders()
      const body: Record<string, string> = {}
      if (!createNewWorkspace && workspaceId) {
        body.workspaceId = workspaceId
      }

      const res = await fetch(`/api/authorized-brands/${selectedPageId}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...hdrs },
        credentials: 'include',
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        // Surface the server's one-brand error clearly
        const msg = errData?.error?.message ?? errData?.message ?? `Import failed (${res.status})`
        throw new Error(msg)
      }

      const importData = await res.json()
      const selectedBrand = brands.find((b) => b.pageId === selectedPageId)

      const workspaceRaw = importData?.data?.workspace ?? importData?.workspace ?? importData?.data
      const newWorkspaceId: string =
        workspaceRaw?._id?.toString?.() ?? workspaceRaw?.id?.toString?.() ??
        workspaceRaw?._id ?? workspaceRaw?.id ?? workspaceId

      if (newWorkspaceId && createNewWorkspace) {
        localStorage.setItem('currentWorkspaceId', newWorkspaceId)
        try { localStorage.setItem('isOnboarded', 'true') } catch { /* ignore */ }
      }

      toast({
        title: 'Brand Connected! 🎉',
        description: `"${selectedBrand?.pageName ?? 'Brand'}" has been connected to your workspace.`,
      })

      queryClient.invalidateQueries({ queryKey: ['/api/social-accounts'] })
      queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] })
      queryClient.invalidateQueries({ queryKey: ['/api/authorized-brands'] })

      onSuccess?.(newWorkspaceId)
      onOpenChange(false)

      if (createNewWorkspace) {
        window.location.href = '/'
      }
    } catch (err: any) {
      setImportError(err.message ?? 'Import failed. Please try again.')
    } finally {
      setIsImporting(false)
    }
  }

  // ─── Render states ──────────────────────────────────────────────────────────

  const renderBody = () => {
    if (isLoadingBrands) {
      return (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-sm text-gray-500">Checking workspace…</span>
        </div>
      )
    }

    // Workspace already has a brand → show upgrade prompt
    if (workspaceHasBrand) {
      return (
        <div className="py-2 space-y-4">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  This workspace already has a brand connected
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  Each workspace can only manage one brand. To connect a different brand, you need
                  a separate workspace. Upgrade your plan to add more workspaces.
                </p>
              </div>
            </div>
          </div>
          <a
            href="/settings?tab=billing"
            className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm hover:from-amber-600 hover:to-orange-600 transition-all"
            onClick={() => onOpenChange(false)}
          >
            <Crown className="w-4 h-4" />
            Upgrade Plan
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      )
    }

    // At plan workspace limit → show upgrade prompt
    if (atPlanLimit) {
      return (
        <div className="py-2 space-y-4">
          <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 p-4">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  Workspace limit reached
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  You've reached the maximum number of workspaces for your current plan.
                  Upgrade to manage more brands across multiple workspaces.
                </p>
              </div>
            </div>
          </div>
          <a
            href="/settings?tab=billing"
            className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm hover:from-amber-600 hover:to-orange-600 transition-all"
            onClick={() => onOpenChange(false)}
          >
            <Crown className="w-4 h-4" />
            Upgrade Plan
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      )
    }

    if (fetchError) {
      return (
        <div className="py-2 space-y-3">
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{fetchError}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={fetchBrands}>Retry</Button>
        </div>
      )
    }

    if (brands.length === 0) {
      return (
        <div className="text-center py-10 text-gray-500">
          <Building2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="text-sm font-medium">No authorized brands available</p>
          <p className="text-xs mt-1 text-gray-400">
            Connect Meta from Settings → Social Accounts to authorize brands first.
          </p>
        </div>
      )
    }

    return (
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
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
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-400 dark:border-blue-600'
                  : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
              }`}
              aria-pressed={isSelected}
            >
              <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                {brand.pageProfilePictureUrl ? (
                  <img src={brand.pageProfilePictureUrl} alt={brand.pageName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-bold text-gray-500">{brand.pageName.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Facebook className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{brand.pageName}</p>
                </div>
                {brand.linkedInstagramAccountId && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <Instagram className="w-3 h-3 text-pink-500 flex-shrink-0" />
                    <p className="text-xs text-gray-500 truncate">
                      {brand.linkedInstagramUsername ? `@${brand.linkedInstagramUsername}` : 'Instagram included'}
                    </p>
                  </div>
                )}
              </div>
              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300 dark:border-gray-600'
              }`}>
                {isSelected && <CheckCircle className="w-full h-full text-white" />}
              </div>
            </button>
          )
        })}
      </div>
    )
  }

  const showFooter = !isLoadingBrands && !workspaceHasBrand && !atPlanLimit && !fetchError

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-gray-900 dark:text-white">
            <Building2 className="w-5 h-5 text-blue-500" />
            {workspaceHasBrand ? 'One brand per workspace' : atPlanLimit ? 'Plan limit reached' : title}
          </DialogTitle>
          <DialogDescription className="text-gray-500 dark:text-gray-400">
            {workspaceHasBrand || atPlanLimit ? '' : description}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-2">
          {renderBody()}

          {importError && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300">{importError}</p>
            </div>
          )}
        </div>

        {showFooter && (
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={!selectedPageId || isImporting || brands.length === 0}
              className="bg-blue-600 hover:bg-blue-700 text-white min-w-[130px]"
            >
              {isImporting ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Connecting…</>
              ) : 'Connect Brand'}
            </Button>
          </DialogFooter>
        )}

        {(workspaceHasBrand || atPlanLimit) && (
          <DialogFooter className="pt-0">
            <Button variant="ghost" onClick={() => onOpenChange(false)} className="w-full text-gray-500">
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
