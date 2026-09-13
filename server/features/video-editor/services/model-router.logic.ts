/**
 * Model_Router — pure (DB-free, provider-free) routing core.
 *
 * For every planned operation the Model_Router decides which execution engine
 * runs it and, for generative/analysis operations, which provider/model. This
 * module is the deterministic decision core (design §"Model_Router") kept pure
 * and side-effect-free so it can be exercised by property tests
 * (`model-router.logic.test.ts`, task 10.2), matching the `veegpt-*.logic.ts`
 * convention. The DB-backed `model-router.service.ts` (task 10.3) wraps this
 * core, sources provider health, and writes the returned decision into the
 * operation's routing record via `recordModelCall`.
 *
 * The two governing principles are enforced structurally here:
 *
 *  1. Deterministic-first (Req 6.1, 6.2, 8.1, 8.2, 24.1). An operation whose kind
 *     the Provider_Capability_Registry marks deterministic-performable is routed
 *     to the Deterministic_Editor WITHOUT considering any provider candidate — no
 *     generative provider is ever selected for it.
 *  2. Capability-, health-, and priority-correct generative selection
 *     (Req 6.3–6.8). Candidates are restricted to providers whose CURRENT
 *     capability supports the requested operation, unhealthy providers are
 *     excluded, and the highest `priorityRank` wins with registry order as the
 *     tie-break. When no candidate survives (even after the configured fallback
 *     policy) the operation is marked `unavailable` with a reason and NO provider
 *     call is initiated.
 *
 * Every non-deterministic decision carries the selected provider, model, and a
 * human-readable reason (Req 6.6). Because the function is pure over the health
 * view passed in per operation, a provider that recovers between operations is
 * naturally re-included for subsequently evaluated operations (Req 6.8) — the
 * caller simply passes an updated health view.
 */

import type { VideoModelCapabilities } from './provider-capability-registry.logic';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The coarse operation classification carried by an editing-plan operation. */
export type OperationType = 'deterministic' | 'generative' | 'analysis' | 'render';

/**
 * The minimal shape of a plan operation the router needs. Kept structural (rather
 * than importing the not-yet-built `editing-planner.logic.ts` `PlanOperation`) so
 * the router core stays decoupled and independently testable; the real
 * `PlanOperation` is assignable to this.
 */
export interface RoutableOperation {
  /** Coarse operation type (exactly one). */
  type: OperationType;
  /** Specific operation kind, e.g. 'trim', 'remove_object', 'scene_detect'. */
  kind: string;
  /**
   * Whether the operation changes existing visual content (Req 6.2). Optional and
   * informational — a `generative`-typed op inherently changes visual content; the
   * flag does not alter routing but is preserved for callers/auditing.
   */
  changesVisualContent?: boolean;
}

/**
 * The routing decision (design §"Model_Router"). `deterministic`/`render` carry
 * only a reason; `generative`/`analysis` additionally carry the selected
 * provider/model; `unavailable` is the explicit no-provider-call outcome
 * (Req 6.5). Every variant carries a `reason` so the service can record it
 * (Req 6.6).
 */
export type RoutingDecision =
  | { engine: 'deterministic'; reason: string }
  | { engine: 'generative'; provider: string; model: string; reason: string }
  | { engine: 'analysis'; provider: string; model: string; reason: string }
  | { engine: 'render'; reason: string }
  | { engine: 'unavailable'; reason: string };

/**
 * Provider health as seen by the router at the moment an operation is evaluated.
 * Unhealthy providers are excluded from candidate selection (Req 6.7). Passing a
 * fresh view per operation is how a recovered provider is re-included for later
 * operations (Req 6.8).
 */
export interface ProviderHealthView {
  /** True iff the given provider/model is currently healthy and routable. */
  isHealthy(provider: string, model: string): boolean;
}

/**
 * The read surface of the Provider_Capability_Registry the router depends on.
 * Both `ProviderCapabilityRegistryCore` and any rehydrated wrapper satisfy it,
 * keeping the router decoupled from persistence.
 */
export interface CapabilityQuery {
  /** Whether a kind is performable by deterministic media processing (Req 6.1). */
  isDeterministicPerformable(operationKind: string): boolean;
  /** Current candidates supporting an operation type, in registry order (Req 6.3, 6.4). */
  candidatesFor(operationType: string): VideoModelCapabilities[];
}

/**
 * Configurable routing policy. `fallbackOperationKinds` is the ordered fallback
 * chain applied when the primary operation kind yields no healthy candidate
 * (Req 6.5); each alternative kind is tried in order and the first that yields a
 * healthy candidate is used.
 */
export interface RoutingPolicy {
  /** Ordered alternative operation kinds tried on no primary candidate (Req 6.5). */
  fallbackOperationKinds?: readonly string[];
}

// ---------------------------------------------------------------------------
// Candidate selection (Req 6.4, 6.7)
// ---------------------------------------------------------------------------

/**
 * Select the best healthy candidate: highest `priorityRank`, ties broken by
 * registry order (the earlier-listed candidate wins). Returns `null` when every
 * candidate is unhealthy or the list is empty. Because we only replace on a
 * STRICTLY greater rank while iterating in registry order, the first of
 * equal-rank candidates is retained (Req 6.4). Unhealthy providers are filtered
 * out first (Req 6.7).
 */
export function selectBestCandidate(
  candidates: readonly VideoModelCapabilities[],
  health: ProviderHealthView,
): VideoModelCapabilities | null {
  let best: VideoModelCapabilities | null = null;
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (!health.isHealthy(candidate.provider, candidate.model)) continue;
    if (best === null || candidate.priorityRank > best.priorityRank) {
      best = candidate;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Routing (Req 6.1–6.8, 8.1, 8.2)
// ---------------------------------------------------------------------------

/**
 * Route a single planned operation to an execution engine.
 *
 * Decision order:
 *  1. `render`-typed operations go to the Render_Engine.
 *  2. Deterministic-performable kinds go to the Deterministic_Editor with NO
 *     provider candidate considered (Req 6.1, 8.2) — this is checked before any
 *     candidate lookup so a generative provider can never be selected for them.
 *  3. `deterministic`-typed operations go to the Deterministic_Editor (Req 8.1).
 *  4. `generative`/`analysis` operations select a provider: candidates supporting
 *     the operation kind (Req 6.3), unhealthy excluded (Req 6.7), highest
 *     `priorityRank` then registry order (Req 6.4). On no candidate, the fallback
 *     policy is applied in order (Req 6.5); if it still yields none, the operation
 *     is `unavailable` with a reason and no provider call (Req 6.5).
 *
 * The returned decision always includes a reason, and generative/analysis
 * decisions include the selected provider and model (Req 6.6). The function is
 * pure: the same operation, registry, health view, and policy always produce the
 * same decision.
 */
export function routeOperation(
  op: RoutableOperation,
  capabilities: CapabilityQuery,
  health: ProviderHealthView,
  policy: RoutingPolicy = {},
): RoutingDecision {
  // (1) Render operations.
  if (op.type === 'render') {
    return { engine: 'render', reason: "Operation type is 'render'; routed to Render_Engine." };
  }

  // (2) Deterministic-first — decided BEFORE any provider candidate is considered
  // so a deterministic-performable kind can never reach a generative provider
  // (Req 6.1, 8.2, 24.1).
  if (capabilities.isDeterministicPerformable(op.kind)) {
    return {
      engine: 'deterministic',
      reason: `Operation kind '${op.kind}' is deterministic-performable; routed to Deterministic_Editor with no provider candidate considered.`,
    };
  }

  // (3) Explicit deterministic-typed operations.
  if (op.type === 'deterministic') {
    return {
      engine: 'deterministic',
      reason: `Operation type is 'deterministic'; routed to Deterministic_Editor.`,
    };
  }

  // (4) Generative / analysis provider selection.
  const engine: 'generative' | 'analysis' = op.type === 'analysis' ? 'analysis' : 'generative';

  const primaryCandidates = capabilities.candidatesFor(op.kind);
  let selected = selectBestCandidate(primaryCandidates, health);
  let matchedKind = op.kind;
  let viaFallback = false;

  if (selected === null && policy.fallbackOperationKinds) {
    for (const fallbackKind of policy.fallbackOperationKinds) {
      const fallbackCandidates = capabilities.candidatesFor(fallbackKind);
      const fallbackSelected = selectBestCandidate(fallbackCandidates, health);
      if (fallbackSelected !== null) {
        selected = fallbackSelected;
        matchedKind = fallbackKind;
        viaFallback = true;
        break;
      }
    }
  }

  // No supported, healthy provider after fallback → explicit unavailable, no call.
  if (selected === null) {
    const anySupport = primaryCandidates.length > 0;
    const reason = anySupport
      ? `No healthy provider supports operation '${op.kind}' after applying the fallback policy; operation marked unavailable and no provider call is initiated.`
      : `No provider capability supports operation '${op.kind}' after applying the fallback policy; operation marked unavailable and no provider call is initiated.`;
    return { engine: 'unavailable', reason };
  }

  const reason = viaFallback
    ? `Selected ${selected.provider}/${selected.model} for '${op.kind}' via fallback operation '${matchedKind}' (priorityRank ${selected.priorityRank}, registry-order tie-break).`
    : `Selected ${selected.provider}/${selected.model} for operation '${op.kind}' (highest priorityRank ${selected.priorityRank}, registry-order tie-break).`;

  return { engine, provider: selected.provider, model: selected.model, reason };
}

// ---------------------------------------------------------------------------
// Health-view helpers
// ---------------------------------------------------------------------------

/** Stable composite key for a provider/model pair (matches the registry keying). */
function providerModelKey(provider: string, model: string): string {
  return `${provider}\u0000${model}`;
}

/**
 * Build a {@link ProviderHealthView} from a set of unhealthy identifiers. An
 * entry may be a bare provider id (marks ALL its models unhealthy) or a
 * `providerModelKey(provider, model)` (marks that single model unhealthy). A
 * provider/model is healthy iff neither its provider id nor its provider/model
 * key is present. Passing a smaller unhealthy set for a later operation is how a
 * recovered provider is re-included (Req 6.8).
 */
export function healthViewFromUnhealthy(unhealthy: Iterable<string>): ProviderHealthView {
  const set = new Set<string>(unhealthy);
  return {
    isHealthy(provider: string, model: string): boolean {
      return !set.has(provider) && !set.has(providerModelKey(provider, model));
    },
  };
}

/** A health view in which every provider/model is healthy (no exclusions). */
export const ALL_HEALTHY: ProviderHealthView = {
  isHealthy: () => true,
};
