/**
 * Model_Router — DB-backed service with provider health tracking and audit
 * (task 10.3, Req 6.6, 6.7, 6.8).
 *
 * This is the thin, IO-bearing shell around the pure `model-router.logic.ts`
 * core. Every routing RULE (deterministic-first, capability/health/priority
 * selection, fallback, the explicit `unavailable` outcome) lives in the pure
 * core and is exercised by property tests (task 10.2); this service adds only
 * the three responsibilities the pure core cannot own:
 *
 *   1. Provider health tracking (Req 6.7, 6.8). The service holds the mutable
 *      set of unhealthy providers/models and, per routing call, builds an
 *      immutable {@link ProviderHealthView} from it via the pure core's
 *      `healthViewFromUnhealthy`. Because the view is rebuilt from the CURRENT
 *      set on every call, a provider that recovers between operations is
 *      naturally re-included for subsequently evaluated operations (Req 6.8) and
 *      an unhealthy one is excluded from candidate selection (Req 6.7).
 *
 *   2. Capability sourcing. The pure core needs a SYNCHRONOUS `CapabilityQuery`;
 *      the DB-backed `ProviderCapabilityRegistryService` is async. The service
 *      pre-fetches the candidate lists for the operation kind (and any configured
 *      fallback kinds) into an in-memory snapshot, then hands the pure core a
 *      synchronous adapter over that snapshot. Deterministic-performable kinds
 *      short-circuit before any candidate fetch, preserving the deterministic-first
 *      guarantee without a needless DB read.
 *
 *   3. Persistence + audit of the decision (Req 6.6). A provider-bearing decision
 *      (generative/analysis) is written into the operation's `routing` record
 *      (provider/model/reason) on the `VideoEditOperation` document; an
 *      `unavailable` decision marks the operation `unavailable` with the reason as
 *      its limitation. Every decision is additionally appended to the model-call
 *      audit trail via `recordModelCall` (reusing `server/services/ai-call-log.ts`).
 *
 * The service performs NO routing arithmetic of its own — it delegates to
 * `routeOperation` and records what the core decided.
 */

import type { Model } from 'mongoose';
import { logger as defaultLogger } from '../../../config/logger';
import { recordModelCall } from '../../../services/ai-call-log';
import {
  VideoEditOperationModel as DefaultVideoEditOperationModel,
  type IVideoEditOperation,
} from '../../../models/VideoEditor';
import {
  routeOperation,
  healthViewFromUnhealthy,
  type RoutableOperation,
  type RoutingDecision,
  type RoutingPolicy,
  type ProviderHealthView,
  type CapabilityQuery,
} from './model-router.logic';
import {
  getProviderCapabilityRegistry,
  type ProviderCapabilityRegistryService,
} from './provider-capability-registry.service';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Identifies the operation being routed for persistence + audit. `operationId`
 * targets the `VideoEditOperation` document whose routing record is written
 * (Req 6.6); the rest are recorded on the audit trail for traceability.
 */
export interface RouteContext {
  /** Target `VideoEditOperation.operationId` whose routing record is written. */
  operationId: string;
  /** Owning project (audit context). */
  projectId?: string;
  /** Owning job, when routing happens inside a job (audit context). */
  jobId?: string;
}

/** Outcome of a routing call: the pure decision plus whether it was persisted. */
export interface RouteResult {
  decision: RoutingDecision;
  /** True when the decision was durably written to the operation record. */
  persisted: boolean;
}

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface ModelRouterServiceDeps {
  registry?: ProviderCapabilityRegistryService;
  operationModel?: Model<IVideoEditOperation>;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** Monotonic clock in ms; injectable so audit latency is testable. */
  now?: () => number;
  /** Routing policy (fallback operation-kind chain, Req 6.5). */
  policy?: RoutingPolicy;
  /** Audit sink; defaults to `recordModelCall`. Injectable for tests. */
  audit?: typeof recordModelCall;
}

// ---------------------------------------------------------------------------
// Health-key helper (matches the pure core's NUL-separated keying)
// ---------------------------------------------------------------------------

/** Stable composite key for a provider/model pair (matches `model-router.logic`). */
function providerModelKey(provider: string, model: string): string {
  return `${provider}\u0000${model}`;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Model_Router service: tracks provider health, routes each operation through
 * the pure core, and persists + audits the decision (Req 6.6, 6.7, 6.8).
 */
export class ModelRouterService {
  private readonly registry: ProviderCapabilityRegistryService;
  private readonly operationModel: Model<IVideoEditOperation>;
  private readonly log: ModelRouterServiceDeps['logger'];
  private readonly now: () => number;
  private readonly policy: RoutingPolicy;
  private readonly audit: typeof recordModelCall;

  /**
   * The mutable set of unhealthy identifiers. An entry is either a bare provider
   * id (all its models unhealthy) or a `providerModelKey(provider, model)` (one
   * model unhealthy), matching `healthViewFromUnhealthy`'s contract.
   */
  private readonly unhealthy = new Set<string>();

  constructor(deps: ModelRouterServiceDeps = {}) {
    this.registry = deps.registry ?? getProviderCapabilityRegistry();
    this.operationModel = deps.operationModel ?? DefaultVideoEditOperationModel;
    this.log = deps.logger ?? defaultLogger;
    this.now = deps.now ?? (() => Date.now());
    this.policy = deps.policy ?? {};
    this.audit = deps.audit ?? recordModelCall;
  }

  // -------------------------------------------------------------------------
  // Provider health tracking (Req 6.7, 6.8)
  // -------------------------------------------------------------------------

  /**
   * Mark a provider (or a specific provider/model) unhealthy so it is excluded
   * from candidate selection for subsequently evaluated operations (Req 6.7).
   * Omit `model` to exclude every model of the provider.
   */
  markUnhealthy(provider: string, model?: string): void {
    this.unhealthy.add(model ? providerModelKey(provider, model) : provider);
  }

  /**
   * Mark a provider (or a specific provider/model) healthy again so it is
   * re-included in the candidate set for subsequently evaluated operations
   * (Req 6.8). Omit `model` to clear a provider-wide exclusion.
   */
  markHealthy(provider: string, model?: string): void {
    this.unhealthy.delete(model ? providerModelKey(provider, model) : provider);
  }

  /** True iff the given provider/model is currently routable. */
  isHealthy(provider: string, model: string): boolean {
    return !this.unhealthy.has(provider) && !this.unhealthy.has(providerModelKey(provider, model));
  }

  /** Build an immutable health view from the CURRENT unhealthy set (Req 6.7, 6.8). */
  private healthView(): ProviderHealthView {
    return healthViewFromUnhealthy(this.unhealthy);
  }

  // -------------------------------------------------------------------------
  // Capability sourcing
  // -------------------------------------------------------------------------

  /**
   * Build a synchronous {@link CapabilityQuery} for the pure core. Deterministic-
   * performable kinds short-circuit (no DB read) — the returned adapter reports
   * an empty candidate list for any type in that case, and the core routes to the
   * Deterministic_Editor before ever consulting candidates. Otherwise the
   * candidate lists for the primary kind plus every configured fallback kind are
   * pre-fetched into a snapshot the adapter serves synchronously.
   */
  private async buildCapabilityQuery(op: RoutableOperation): Promise<CapabilityQuery> {
    const isDeterministic = this.registry.isDeterministicPerformable(op.kind);

    const snapshot = new Map<string, Awaited<ReturnType<ProviderCapabilityRegistryService['candidatesFor']>>>();
    if (!isDeterministic && (op.type === 'generative' || op.type === 'analysis')) {
      const kinds = [op.kind, ...(this.policy.fallbackOperationKinds ?? [])];
      for (const kind of kinds) {
        if (!snapshot.has(kind)) {
          snapshot.set(kind, await this.registry.candidatesFor(kind));
        }
      }
    }

    return {
      isDeterministicPerformable: (kind: string) => this.registry.isDeterministicPerformable(kind),
      candidatesFor: (operationType: string) => snapshot.get(operationType) ?? [],
    };
  }

  // -------------------------------------------------------------------------
  // Routing (Req 6.6)
  // -------------------------------------------------------------------------

  /**
   * Route a single planned operation. Delegates the decision entirely to the pure
   * `routeOperation`, then persists a provider-bearing decision into the
   * operation's routing record / marks an `unavailable` operation, and appends
   * the decision to the model-call audit trail (Req 6.6). Returns the decision
   * and whether it was persisted.
   */
  async route(op: RoutableOperation, ctx: RouteContext): Promise<RouteResult> {
    const startedAt = this.now();

    const capabilities = await this.buildCapabilityQuery(op);
    const decision = routeOperation(op, capabilities, this.healthView(), this.policy);

    const persisted = await this.persistDecision(op, decision, ctx);
    this.auditDecision(op, decision, ctx, this.now() - startedAt);

    return { decision, persisted };
  }

  /**
   * Write the decision into the `VideoEditOperation` document (Req 6.6):
   *  - generative/analysis → set `routing = { provider, model, reason }`;
   *  - unavailable → set `status = 'unavailable'` and `limitation = reason`;
   *  - deterministic/render → no provider, nothing to persist (returns false).
   * A missing operation document (unknown id) persists nothing and returns false.
   */
  private async persistDecision(
    op: RoutableOperation,
    decision: RoutingDecision,
    ctx: RouteContext,
  ): Promise<boolean> {
    try {
      if (decision.engine === 'generative' || decision.engine === 'analysis') {
        const res = await this.operationModel
          .updateOne(
            { operationId: ctx.operationId },
            {
              $set: {
                routing: {
                  provider: decision.provider,
                  model: decision.model,
                  reason: decision.reason,
                },
              },
            },
          )
          .exec();
        return res.matchedCount > 0;
      }

      if (decision.engine === 'unavailable') {
        const res = await this.operationModel
          .updateOne(
            { operationId: ctx.operationId },
            { $set: { status: 'unavailable', limitation: decision.reason } },
          )
          .exec();
        return res.matchedCount > 0;
      }

      // deterministic / render: no provider selected, no routing record to write.
      return false;
    } catch (error) {
      this.log?.error?.('Failed to persist Model_Router decision', error, {
        component: 'ModelRouterService',
        operationId: ctx.operationId,
        projectId: ctx.projectId,
        engine: decision.engine,
      });
      return false;
    }
  }

  /**
   * Append the routing decision to the model-call audit trail via `recordModelCall`
   * (Req 6.6). Provider-bearing decisions record the selected provider/model as a
   * successful selection; an `unavailable` decision records a failed selection
   * with the reason. Deterministic/render decisions record the deterministic
   * engine identifier so the trail is complete without implying a provider call.
   */
  private auditDecision(
    op: RoutableOperation,
    decision: RoutingDecision,
    ctx: RouteContext,
    ms: number,
  ): void {
    try {
      const feature = `video-editor.route${ctx.jobId ? `:${ctx.jobId}` : ''}`;

      if (decision.engine === 'generative' || decision.engine === 'analysis') {
        this.audit({
          feature,
          requested: decision.model,
          used: decision.model,
          provider: decision.provider,
          transport: 'native',
          capability: op.kind,
          ms,
          ok: true,
        });
        return;
      }

      if (decision.engine === 'unavailable') {
        this.audit({
          feature,
          requested: op.kind,
          used: 'none',
          provider: 'none',
          transport: 'native',
          capability: op.kind,
          ms,
          ok: false,
          error: decision.reason,
        });
        return;
      }

      // deterministic / render → executed by the local FFmpeg engine, no provider.
      this.audit({
        feature,
        requested: op.kind,
        used: decision.engine === 'render' ? 'render-engine' : 'ffmpeg',
        provider: 'ffmpeg',
        transport: 'native',
        capability: op.kind,
        ms,
        ok: true,
      });
    } catch (error) {
      // Auditing must never break routing.
      this.log?.warn?.('Failed to audit Model_Router decision', {
        component: 'ModelRouterService',
        operationId: ctx.operationId,
        error: (error as Error)?.message,
      });
    }
  }
}

/** Lazily-instantiated shared Model_Router service instance. */
let sharedRouter: ModelRouterService | null = null;

/**
 * Get the process-wide Model_Router service. Health state is per-instance, so the
 * shared instance accumulates provider health across the process lifetime.
 */
export function getModelRouterService(): ModelRouterService {
  if (!sharedRouter) {
    sharedRouter = new ModelRouterService();
  }
  return sharedRouter;
}
