/**
 * UpgradeDialog — modal shown when the server returns a 403 with an
 * `upgradeHint` field.  All content (reason, limits, plan names, upgrade URL)
 * comes directly from the server — nothing is hardcoded here.
 *
 * Usage:
 *   1. Render <UpgradeDialogHost /> once near the app root.
 *   2. Call setupUpgradeDialogInterceptor() on mount so the fetch/ApiClient
 *      interceptor can surface 403 hints automatically.
 *   3. Alternatively, render <UpgradeDialog isOpen={...} onClose={...}
 *      upgradeHint={...} /> directly when you already have a hint object.
 */

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { UpgradeHint } from '@/hooks/useSubscription';

// ---------------------------------------------------------------------------
// Re-export UpgradeHint so consumers can import from one place
// ---------------------------------------------------------------------------
export type { UpgradeHint };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface UpgradeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  upgradeHint: UpgradeHint;
}

// ---------------------------------------------------------------------------
// UpgradeDialog component
// ---------------------------------------------------------------------------

export function UpgradeDialog({ isOpen, onClose, upgradeHint }: UpgradeDialogProps) {
  const { reason, currentLimit, nextPlan, nextPlanLimit, upgradeUrl } = upgradeHint;

  const handleUpgrade = () => {
    onClose();
    window.location.href = upgradeUrl;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">🚀</span>
            Upgrade to continue
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-4 pt-2">
              {/* Reason */}
              <p className="text-sm text-foreground">{reason}</p>

              {/* Current vs next plan limit */}
              <div className="rounded-lg border bg-muted/50 p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Your current limit</span>
                  <span className="font-medium tabular-nums">
                    {currentLimit === -1 ? 'Unlimited' : currentLimit}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    On{' '}
                    <span className="font-semibold capitalize text-foreground">
                      {nextPlan}
                    </span>{' '}
                    plan
                  </span>
                  <span className="font-semibold text-green-600 tabular-nums">
                    {nextPlanLimit === -1 ? 'Unlimited' : nextPlanLimit}
                  </span>
                </div>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Maybe later
          </Button>
          <Button onClick={handleUpgrade} className="gap-1">
            Upgrade to{' '}
            <span className="capitalize font-bold">{nextPlan}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Global interceptor state — a lightweight event bus that avoids a full
// context dependency.  The interceptor writes here; UpgradeDialogHost reads.
// ---------------------------------------------------------------------------

type UpgradeDialogListener = (hint: UpgradeHint) => void;

const listeners = new Set<UpgradeDialogListener>();

function emitUpgradeHint(hint: UpgradeHint) {
  listeners.forEach((fn) => fn(hint));
}

/** Subscribe to upgrade-hint events; returns an unsubscribe function. */
export function subscribeToUpgradeHints(fn: UpgradeDialogListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------------------
// setupUpgradeDialogInterceptor
// ---------------------------------------------------------------------------

let interceptorInstalled = false;

/**
 * Monkey-patches the global `fetch` to intercept 403 responses that carry an
 * `upgradeHint` field in the JSON body, then emits the hint to all
 * UpgradeDialogHost subscribers.
 *
 * Call once at app startup (e.g. in main.tsx or App.tsx).
 */
export function setupUpgradeDialogInterceptor(): void {
  if (interceptorInstalled) return;
  interceptorInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const response = await originalFetch(input, init);

    if (response.status === 403) {
      // Clone so the original can still be consumed by the caller
      const clone = response.clone();
      clone
        .json()
        .then((body: unknown) => {
          if (
            body &&
            typeof body === 'object' &&
            'upgradeHint' in body &&
            body.upgradeHint &&
            typeof body.upgradeHint === 'object'
          ) {
            const hint = body.upgradeHint as UpgradeHint;
            if (hint.reason && hint.upgradeUrl) {
              emitUpgradeHint(hint);
            }
          }
        })
        .catch(() => {
          // Non-JSON 403 — nothing to do
        });
    }

    return response;
  };
}

// ---------------------------------------------------------------------------
// UpgradeDialogHost — render this once near the app root
// ---------------------------------------------------------------------------

/**
 * Self-contained host that listens for upgrade-hint events emitted by the
 * fetch interceptor and renders the modal automatically.
 *
 * ```tsx
 * // In App.tsx or main layout:
 * <UpgradeDialogHost />
 * ```
 */
export function UpgradeDialogHost() {
  const [hint, setHint] = React.useState<UpgradeHint | null>(null);

  React.useEffect(() => {
    return subscribeToUpgradeHints((incoming) => {
      setHint(incoming);
    });
  }, []);

  if (!hint) return null;

  return (
    <UpgradeDialog
      isOpen={!!hint}
      onClose={() => setHint(null)}
      upgradeHint={hint}
    />
  );
}

export default UpgradeDialog;
