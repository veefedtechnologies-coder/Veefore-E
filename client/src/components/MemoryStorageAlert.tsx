import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { useQuery } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Brain, AlertTriangle, Settings as SettingsIcon } from 'lucide-react'

/**
 * Global VeeGPT memory-storage alert.
 *
 * Watches the user's cross-chat memory usage for the active workspace and, when
 * it crosses 80%, 90% or 100%, shows a one-time popup nudging them to free up
 * space (or warning that new facts won't be saved at 100%).
 *
 * Behaviour:
 *  - Each threshold (80/90/100) alerts ONCE.
 *  - If the user deletes facts (usage drops below the threshold) and it later
 *    refills, we do NOT alert again immediately — a cooldown must elapse first
 *    (prevents nagging while hovering around the limit).
 *  - All state is persisted in localStorage, scoped per workspace, so it
 *    survives reloads and doesn't leak across workspaces.
 */

const THRESHOLDS = [100, 90, 80] as const
type Threshold = (typeof THRESHOLDS)[number]

/** How long to wait before re-alerting a threshold the user already saw and
 * then dropped below. 24 hours. */
const COOLDOWN_MS = 24 * 60 * 60 * 1000

type ThresholdState = { shownAt: number; wentBelow: boolean }
type AlertState = Partial<Record<string, ThresholdState>>

type MemoryUsage = {
  itemCount: number
  maxItems: number
  usedChars: number
  maxChars: number
  usedPercent: number
  remainingPercent: number
}
type MemoryResponse = { usage?: MemoryUsage }

function storageKey(workspaceId: string) {
  return `veegpt-mem-alert-${workspaceId}`
}

function readState(workspaceId: string): AlertState {
  try {
    const raw = localStorage.getItem(storageKey(workspaceId))
    return raw ? (JSON.parse(raw) as AlertState) : {}
  } catch {
    return {}
  }
}

function writeState(workspaceId: string, state: AlertState) {
  try {
    localStorage.setItem(storageKey(workspaceId), JSON.stringify(state))
  } catch {
    /* ignore quota/availability errors */
  }
}

/** Pick the highest threshold the current usage has crossed (or null). */
function topThreshold(pct: number): Threshold | null {
  for (const t of THRESHOLDS) {
    if (pct >= t) return t
  }
  return null
}

export default function MemoryStorageAlert() {
  const { currentWorkspaceId } = useCurrentWorkspace()
  const [, setLocation] = useLocation()
  const [active, setActive] = useState<Threshold | null>(null)

  const { data } = useQuery<MemoryResponse>({
    queryKey: ['/api/chat/memory', currentWorkspaceId, 'usage-alert'],
    queryFn: () =>
      apiRequest(`/api/chat/memory?workspaceId=${encodeURIComponent(currentWorkspaceId || '')}`),
    enabled: !!currentWorkspaceId,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchOnWindowFocus: true,
  })

  const pct = data?.usage?.usedPercent ?? 0

  useEffect(() => {
    if (!currentWorkspaceId || !data?.usage) return

    const state = readState(currentWorkspaceId)
    let changed = false

    // Record, for every threshold, whether usage is currently below it. This is
    // what later allows a "refill" to re-trigger an alert (after cooldown).
    for (const t of THRESHOLDS) {
      const entry = state[String(t)]
      if (entry && pct < t && !entry.wentBelow) {
        entry.wentBelow = true
        changed = true
      }
    }

    const top = topThreshold(pct)
    if (top !== null) {
      const key = String(top)
      const entry = state[key]
      const now = Date.now()

      let shouldShow = false
      if (!entry) {
        // First time crossing this threshold.
        shouldShow = true
      } else if (entry.wentBelow && now - entry.shownAt >= COOLDOWN_MS) {
        // They dropped below and refilled, and the cooldown has elapsed.
        shouldShow = true
      }

      if (shouldShow) {
        state[key] = { shownAt: now, wentBelow: false }
        changed = true
        setActive(top)
      }
    }

    if (changed) writeState(currentWorkspaceId, state)
    // We intentionally depend on pct (the meaningful value) rather than the
    // whole data object to avoid redundant runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct, currentWorkspaceId, data?.usage])

  const content = useMemo(() => {
    if (active === 100) {
      return {
        icon: <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />,
        iconBg: 'bg-red-50 dark:bg-red-900/20',
        title: 'VeeGPT memory is full',
        body:
          "Your memory storage is 100% full, so VeeGPT can't save any new facts or preferences right now. Remove a few existing facts to make room and let VeeGPT keep learning about you.",
        cta: 'Free up space',
      }
    }
    if (active === 90) {
      return {
        icon: <Brain className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
        iconBg: 'bg-amber-50 dark:bg-amber-900/20',
        title: 'VeeGPT memory is 90% full',
        body:
          "You're almost out of memory storage. Once it fills up, VeeGPT won't be able to remember new facts about you. Clear out a few facts you no longer need to keep things running smoothly.",
        cta: 'Manage facts',
      }
    }
    return {
      icon: <Brain className="w-6 h-6 text-blue-600 dark:text-blue-400" />,
      iconBg: 'bg-blue-50 dark:bg-blue-900/20',
      title: 'VeeGPT memory is 80% full',
      body:
        "Your memory storage is filling up. To make sure VeeGPT can keep remembering what matters, consider removing a few older facts you no longer need.",
      cta: 'Manage facts',
    }
  }, [active])

  const close = () => setActive(null)

  const goToSettings = () => {
    setActive(null)
    setLocation('/settings?tab=ai')
  }

  return (
    <Dialog open={active !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-2 ${content.iconBg}`}>
            {content.icon}
          </div>
          <DialogTitle className="text-xl">{content.title}</DialogTitle>
          <DialogDescription className="text-base leading-relaxed pt-1">
            {content.body}
          </DialogDescription>
        </DialogHeader>

        {/* Usage bar */}
        <div className="mt-1">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            <span>Memory used</span>
            <span className="font-medium">{pct}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                pct >= 100 ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-blue-600'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        <DialogFooter className="mt-2 gap-2 sm:gap-2">
          <Button variant="ghost" onClick={close}>
            Maybe later
          </Button>
          <Button onClick={goToSettings} className="gap-1.5">
            <SettingsIcon className="w-4 h-4" />
            {content.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
