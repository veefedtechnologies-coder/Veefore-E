/**
 * WorkspaceSelectionModal
 *
 * MANDATORY workspace selection after a plan downgrade.
 *
 * When the user has more workspaces than their current plan allows AND has not
 * yet explicitly chosen which ones to keep active, the server returns
 * `requiresWorkspaceSelection: true` on the /api/workspaces response. This modal
 * then blocks the app until the user picks their allowed workspace(s).
 *
 * Key behaviours:
 *  - NOT dismissible: no backdrop-close, no X, no "continue anyway". The only
 *    way out is to confirm a selection (or upgrade the plan).
 *  - Server-driven: the decision comes from `requiresWorkspaceSelection`, so it
 *    survives page reloads and app restarts — there is no localStorage bypass.
 *  - Upgrade path: the "Upgrade plan" button navigates to billing; the modal
 *    hides only while ON the billing page so the user can complete payment. If
 *    they leave billing without upgrading, the modal reappears.
 *  - Once the user confirms (preferred workspaces saved server-side) or upgrades
 *    (over-limit condition cleared), the flag flips to false and the modal is
 *    gone — no data is ever deleted.
 */

import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Building2, Lock, Crown, Sparkles, ArrowRight, Shield, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useLocation } from 'wouter'
import { setActiveWorkspaceCookie } from '@/lib/bootstrap'

// ─── Helpers ────────────────────────────────────────────────────────────────

function getThemeGradient(theme: string) {
  const map: Record<string, string> = {
    space: 'from-purple-500 to-indigo-600',
    ocean: 'from-blue-500 to-cyan-600',
    forest: 'from-green-500 to-emerald-600',
    sunset: 'from-orange-500 to-red-600',
  }
  return map[theme] ?? 'from-indigo-500 to-purple-600'
}

function getPersonalityIcon(personality: string) {
  const map: Record<string, string> = {
    creative: '🎨', casual: '😊', technical: '⚙️', friendly: '🤝',
  }
  return map[personality] ?? '💼'
}

// ─── Component ───────────────────────────────────────────────────────────────

export function WorkspaceSelectionModal() {
  const [location, setLocation] = useLocation()
  const queryClient = useQueryClient()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const { data: workspacesResponse } = useQuery({
    queryKey: ['/api/workspaces'],
    queryFn: () => apiRequest('/api/workspaces'),
    staleTime: 60_000,
  })

  // Server's authoritative signal — the mandatory modal shows iff this is true.
  const requiresSelection: boolean = workspacesResponse?.requiresWorkspaceSelection === true

  const allWorkspaces: any[] = React.useMemo(() => {
    const raw = workspacesResponse?.data ?? workspacesResponse ?? []
    return Array.isArray(raw) ? raw.map((w: any) => ({ ...w, id: w.id ?? w._id })) : []
  }, [workspacesResponse])

  const visibleWorkspaces = allWorkspaces.filter((w: any) => w.status !== 'DELETED')
  const lockedWorkspaces = visibleWorkspaces.filter((w: any) => w.locked)
  const accessibleWorkspaces = visibleWorkspaces.filter((w: any) => !w.locked)

  // planLimit = how many accessible slots the plan allows
  const planLimit = accessibleWorkspaces.length

  const currentActiveId = React.useMemo(() => {
    try { return localStorage.getItem('currentWorkspaceId') ?? null } catch { return null }
  }, [])

  // Hide the modal while the user is on the billing page so they can complete
  // an upgrade. It reappears if they leave billing while still required.
  const onBillingPage = /\/(settings\/)?billing/.test(location) || /billing/i.test(location)

  const open = requiresSelection && visibleWorkspaces.length > 0 && !onBillingPage

  // Pre-select currently-accessible workspaces (server's current pick)
  useEffect(() => {
    if (open && selectedIds.length === 0 && visibleWorkspaces.length > 0) {
      const preselected = accessibleWorkspaces.map((w: any) => w.id).slice(0, planLimit)
      if (currentActiveId && visibleWorkspaces.find((w: any) => w.id === currentActiveId)) {
        const withActive = [
          currentActiveId,
          ...preselected.filter((id: string) => id !== currentActiveId),
        ].slice(0, Math.max(planLimit, 1))
        setSelectedIds(withActive)
      } else {
        setSelectedIds(preselected)
      }
    }
  }, [open, visibleWorkspaces.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSelect = (id: string) => {
    setErrorMsg(null)
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev // keep at least one
        return prev.filter((x) => x !== id)
      }
      if (prev.length >= planLimit) {
        if (planLimit === 1) return [id] // single-select for free plan
        setErrorMsg(`Your plan allows ${planLimit} workspace${planLimit !== 1 ? 's' : ''}. Deselect one first.`)
        return prev
      }
      return [...prev, id]
    })
  }

  const handleConfirm = async () => {
    if (selectedIds.length === 0 || saving) return
    if (selectedIds.length > planLimit) {
      setErrorMsg(`Please select at most ${planLimit} workspace${planLimit !== 1 ? 's' : ''}.`)
      return
    }
    setSaving(true)
    setErrorMsg(null)
    try {
      await apiRequest('/api/workspaces-v2/preferred-active', {
        method: 'POST',
        body: JSON.stringify({ workspaceIds: selectedIds }),
      })

      const activeId = selectedIds[0]
      localStorage.setItem('currentWorkspaceId', activeId)
      setActiveWorkspaceCookie(activeId)
      window.dispatchEvent(new Event('workspace-changed'))

      // Refetch so `requiresWorkspaceSelection` flips to false and the modal closes.
      await queryClient.invalidateQueries({ queryKey: ['/api/workspaces'] })
      await queryClient.invalidateQueries({ queryKey: ['workspaces-v2'] })
    } catch (err: any) {
      setErrorMsg(err?.message ?? 'Failed to save workspace selection. Please try again.')
      setSaving(false)
      return
    }
    setSaving(false)
  }

  const handleUpgrade = () => {
    // Navigate to billing — the modal auto-hides there (see `onBillingPage`),
    // and reappears if the user returns still over-limit without upgrading.
    setLocation('/settings/billing')
  }

  if (!open) return null

  const totalCount = visibleWorkspaces.length

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)' }}
      aria-modal="true"
      role="dialog"
      aria-labelledby="ws-modal-title"
      /* Intentionally NO onClick backdrop-dismiss — this modal is mandatory. */
    >
      <div
        className={cn(
          'w-full max-w-lg rounded-2xl bg-white dark:bg-gray-900',
          'border border-gray-200 dark:border-gray-700',
          'shadow-2xl overflow-hidden',
        )}
      >
        {/* Top accent bar */}
        <div className="h-1 bg-gradient-to-r from-amber-400 via-orange-500 to-red-500" />

        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
              <Lock className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <h2
                id="ws-modal-title"
                className="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight"
              >
                Choose your {planLimit === 1 ? 'workspace' : `${planLimit} workspaces`}
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
                You have <strong className="text-gray-700 dark:text-gray-300">{totalCount} workspaces</strong> but your plan only allows{' '}
                <strong className="text-gray-700 dark:text-gray-300">{planLimit}</strong>.{' '}
                Pick {planLimit === 1 ? 'the one' : `up to ${planLimit}`} you want to work in to continue —{' '}
                <span className="text-green-600 dark:text-green-400 font-medium">all data stays safe.</span>
              </p>
            </div>
          </div>
        </div>

        {/* Workspace selection list */}
        <div className="px-6 pb-2 space-y-2 max-h-64 overflow-y-auto">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500 pt-1">
            Select {planLimit === 1 ? '1 workspace' : `up to ${planLimit} workspaces`}
          </p>
          {visibleWorkspaces.map((ws: any) => {
            const isSelected = selectedIds.includes(ws.id)
            const isCurrentlyLocked = !!ws.locked

            return (
              <button
                key={ws.id}
                type="button"
                onClick={() => toggleSelect(ws.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all',
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600 ring-2 ring-blue-300 dark:ring-blue-700'
                    : isCurrentlyLocked
                    ? 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50/40 dark:hover:bg-blue-900/10'
                    : 'bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800 hover:border-blue-300 dark:hover:border-blue-700',
                )}
                aria-pressed={isSelected}
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-lg flex items-center justify-center text-white flex-shrink-0',
                    isSelected || !isCurrentlyLocked
                      ? `bg-gradient-to-br ${getThemeGradient(ws.theme)}`
                      : 'bg-gradient-to-br from-gray-300 to-gray-400 dark:from-gray-600 dark:to-gray-700',
                  )}
                >
                  <Building2 className="w-4 h-4" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      'text-sm font-semibold truncate',
                      isSelected
                        ? 'text-blue-700 dark:text-blue-300'
                        : 'text-gray-900 dark:text-gray-100',
                    )}>{ws.name}</span>
                    {ws.isDefault && <Crown className="w-3 h-3 text-yellow-500 flex-shrink-0" />}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
                    <span>{getPersonalityIcon(ws.aiPersonality)} {ws.aiPersonality}</span>
                    {ws.credits != null && (
                      <span className="flex items-center gap-0.5">
                        <Sparkles className="w-3 h-3" /> {ws.credits}
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={cn(
                    'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                    isSelected
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300 dark:border-gray-600',
                  )}
                >
                  {isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                </div>
              </button>
            )
          })}
        </div>

        {errorMsg && (
          <div className="mx-6 mb-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
          </div>
        )}

        <div className="mx-6 my-3 flex items-center gap-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800">
          <Shield className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <p className="text-xs text-blue-700 dark:text-blue-300 leading-snug">
            <strong>{selectedIds.length}/{planLimit} selected.</strong>{' '}
            Workspaces you don't select stay locked — nothing is deleted.
            Upgrade any time to unlock all.
          </p>
        </div>

        {/* Actions — no dismiss/close; selection is required */}
        <div className="px-6 pb-6 flex flex-col sm:flex-row gap-3">
          <button
            onClick={handleConfirm}
            disabled={selectedIds.length === 0 || saving}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl',
              'bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm',
              'hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md hover:shadow-lg',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            )}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                Confirm &amp; continue
                <Check className="w-4 h-4" />
              </>
            )}
          </button>

          <button
            onClick={handleUpgrade}
            className={cn(
              'flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium',
              'border border-indigo-200 dark:border-indigo-800',
              'text-indigo-600 dark:text-indigo-400',
              'hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors',
            )}
          >
            Upgrade plan
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
