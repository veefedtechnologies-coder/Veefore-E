/**
 * Video Editor (client) — gating resolver (pure).
 *
 * Turns the raw workspace + subscription loading state into the editor's gate
 * decision (Requirements 1.4–1.6):
 *   - No active workspace  → the editor MUST NOT open (Req 1.6).
 *   - Context unavailable  → the editor opens but credit-consuming actions are
 *                            blocked with an error indication (Req 1.5).
 *   - Context available    → tier/credits/brand applied; paid actions allowed
 *                            (Req 1.4).
 *
 * Kept pure (no React, no I/O) so the gate logic is unit-testable in isolation;
 * the {@link useVideoEditorContext} hook wires the real data sources into it.
 */

import type { VideoEditorGate, VideoEditorBrandProfile } from '../types';

export interface ResolveVideoEditorGateInput {
  /** Whether the workspace list is still loading. */
  workspaceLoading: boolean;
  /** Whether an active workspace is associated with the session. */
  hasActiveWorkspace: boolean;
  /** Whether the subscription/credit context is still loading. */
  subscriptionLoading: boolean;
  /** Whether the subscription/credit context failed to load. */
  subscriptionError: boolean;
  /** Subscription tier / plan id, or null when unavailable. */
  subscriptionTier: string | null;
  /** Remaining credit balance, or null when unavailable. */
  creditBalance: number | null;
  /** Brand profile, or null when unavailable. */
  brandProfile: VideoEditorBrandProfile | null;
}

/**
 * Resolve the editor gate from the current context-loading state.
 *
 * Precedence:
 *  1. Workspace still loading           → `loading`.
 *  2. No active workspace               → `no-workspace` (editor not opened).
 *  3. Workspace present                 → `ready`. `contextAvailable` is true
 *     only when the subscription context has resolved without error and tier,
 *     credit balance, and brand profile are all present.
 */
export function resolveVideoEditorGate(input: ResolveVideoEditorGateInput): VideoEditorGate {
  const {
    workspaceLoading,
    hasActiveWorkspace,
    subscriptionLoading,
    subscriptionError,
    subscriptionTier,
    creditBalance,
    brandProfile,
  } = input;

  if (workspaceLoading) {
    return {
      status: 'loading',
      contextResolving: true,
      contextAvailable: false,
      canConsumeCredits: false,
    };
  }

  // Req 1.6 — an active workspace is required; do not open the editor without one.
  if (!hasActiveWorkspace) {
    return {
      status: 'no-workspace',
      contextResolving: false,
      contextAvailable: false,
      canConsumeCredits: false,
    };
  }

  // Workspace is active → the editor opens. Now determine whether the paid
  // context (tier + credits + brand) is fully available (Req 1.4/1.5).
  const contextResolving = subscriptionLoading;
  const contextAvailable =
    !subscriptionLoading &&
    !subscriptionError &&
    subscriptionTier !== null &&
    creditBalance !== null &&
    brandProfile !== null;

  return {
    status: 'ready',
    contextResolving,
    contextAvailable,
    // Never allow credit-consuming actions unless the full context is present.
    canConsumeCredits: contextAvailable,
  };
}
