/**
 * Variant orchestrator — independent per-variant plan/render/meter (task 19.3,
 * Req 16.9, 16.10).
 *
 * This is the IO-bearing orchestration shell that turns a single multi-variant
 * editing request into 1–5 INDEPENDENT variants, each of which is independently
 * planned, versioned, rendered, and metered. It owns no new business rules of
 * its own — every decision is delegated to an existing collaborator:
 *
 *   • The variant CEILING (1..5) and the fan-out into independent plans is the
 *     pure `editing-planner.logic#planVariants` core's decision (single source:
 *     `MAX_VARIANTS_PER_REQUEST`). A request for more than 5 variants is rejected
 *     up front with a `VARIANT_LIMIT_EXCEEDED` error and NOTHING is created — no
 *     version, no job, no render, no charge (Req 16.10).
 *
 *   • Each variant's structured plan comes from the Editing_Planner service
 *     (`plan()` with `variantCount`), which fans out that many structurally
 *     independent plans via the pure core (Req 16.9).
 *
 *   • Each variant gets its OWN immutable `Video_Version` (Version manager), its
 *     OWN `Video_Edit_Job` (Job_System), and its OWN render (Render_Engine).
 *     Metering runs per variant through the authoritative ledger with the job's
 *     unique idempotency key, so cost is attributed and charged independently
 *     (Req 16.9, 17.4).
 *
 * Independence is structural: each variant is processed in isolation and a
 * failure, block, or cancellation of one variant NEVER aborts the others — every
 * variant returns its own discrete result. Rendering and metering are delegated
 * to the Render_Engine and the generative metering service respectively, so a
 * variant whose plan carries generative work is metered while a purely
 * deterministic variant renders at zero cost with no metering wrapper.
 *
 * The mapping from a variant's `EditingPlan` to the authoritative `TimelineModel`
 * to render, and the per-variant generative cost basis, are supplied by the
 * caller (Timeline_Engine + Provider_Capability_Registry own that domain
 * knowledge); this orchestrator only sequences the independent lifecycle around
 * them.
 */

import { logger as defaultLogger } from '../../../config/logger';
import type { CreditSettlement } from '../../../features/subscription/services/AICreditMeteringService';
import {
  planVariants,
  type BuildEditingPlanInput,
  type BrandProfile,
  type EditingPlan,
  type PlannerAnalysis,
  type PlannerError,
} from './editing-planner.logic';
import type { VideoIntent } from './intent-extraction.logic';
import type { EditingPlannerService, PlanRequest } from './editing-planner.service';
import type {
  VersionManagerService,
  VersionIdentity,
} from './version-manager.service';
import type { JobSystemService, CreateJobInput } from './job-system.service';
import type {
  RenderEngineService,
  RenderRequest,
  RenderResult,
} from './render-engine.service';
import type {
  VideoGenerativeMeteringService,
  GenerativeCostBasis,
  ConfirmationRequester,
} from './generative-metering.service';

// ---------------------------------------------------------------------------
// Error codes
// ---------------------------------------------------------------------------

/** A variant's version could not be created (parent missing, persistence, …). */
export const VARIANT_ERROR_VERSION = 'VARIANT_VERSION_FAILED';
/** A variant's metered execution was blocked for insufficient credits (Req 17.9). */
export const VARIANT_ERROR_METERING_BLOCKED = 'VARIANT_METERING_BLOCKED';
/** A variant's metered execution was cancelled (timeout / decline / abort, Req 17.8, 17.10). */
export const VARIANT_ERROR_METERING_CANCELLED = 'VARIANT_METERING_CANCELLED';
/** A variant failed with an unexpected error while planning/rendering. */
export const VARIANT_ERROR_UNEXPECTED = 'VARIANT_UNEXPECTED_ERROR';

// ---------------------------------------------------------------------------
// Collaborator ports (structural subsets so the orchestrator is unit-testable)
// ---------------------------------------------------------------------------

/** The Editing_Planner surface the orchestrator uses (independent per-variant plans). */
export type PlannerPort = Pick<EditingPlannerService, 'plan'>;
/** The Version manager surface the orchestrator uses (one version per variant). */
export type VersionManagerPort = Pick<VersionManagerService, 'createVersion'>;
/** The Job_System surface the orchestrator uses (one job per variant). */
export type JobSystemPort = Pick<JobSystemService, 'createJob'>;
/** The Render_Engine surface the orchestrator uses (one render per variant). */
export type RenderPort = Pick<RenderEngineService, 'render'>;
/** The metering surface the orchestrator uses (one metered run per variant). */
export type MeteringPort = Pick<VideoGenerativeMeteringService, 'runGenerativeOperation'>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Scopes the whole request to one project owned within a workspace by a user. */
export interface VariantOrchestrationIdentity {
  projectId: string;
  workspaceId: string;
  userId: string;
}

/** Context passed to the caller-supplied timeline builder for one variant. */
export interface VariantTimelineContext {
  /** The variant's independent structured plan. */
  plan: EditingPlan;
  /** The immutable version created for this variant. */
  versionId: string;
  /** Zero-based variant index within the request. */
  index: number;
}

/** Context passed to the caller-supplied cost-basis resolver for one variant. */
export interface VariantCostContext {
  /** The variant's independent structured plan. */
  plan: EditingPlan;
  /** Zero-based variant index within the request. */
  index: number;
}

/** Options forwarded to the Editing_Planner for goal/style + preset/brand. */
export interface VariantPlanOptions {
  platform?: string | null;
  applyBrand?: boolean;
  brandProfile?: BrandProfile | null;
  includeRenderOperation?: boolean;
  aiModel?: string;
}

/** A request to fan out and independently plan/render/meter 1–5 variants. */
export interface OrchestrateVariantsRequest {
  identity: VariantOrchestrationIdentity;
  /** The structured, already-classified intent for the editing turn. */
  intent: VideoIntent;
  /** Analysis inputs (source duration, scene boundaries, protected regions). */
  analysis: PlannerAnalysis;
  /** Requested number of variants; 1..5 accepted, >5 rejected (Req 16.9, 16.10). */
  variantCount: number;
  /** Export profile id every variant renders to (resolved from single-source config). */
  exportProfileId: string;
  /** Planner options (platform preset, brand, render-op inclusion, model). */
  planOptions?: VariantPlanOptions;
  /**
   * Builds the authoritative `TimelineModel` to render for a planned variant.
   * The Timeline_Engine owns this mapping; the orchestrator only sequences it.
   */
  buildTimeline: (
    ctx: VariantTimelineContext,
  ) => RenderRequest['timeline'] | Promise<RenderRequest['timeline']>;
  /**
   * Resolves the metered generative cost basis for a variant, or `null` when the
   * variant is purely deterministic (rendered at zero cost, no metering wrapper).
   * Defaults to `null` for every variant when omitted.
   */
  costBasisFor?: (ctx: VariantCostContext) => GenerativeCostBasis | null;
  /** Derives the timeline snapshot id recorded on a variant's version. */
  timelineIdFor?: (index: number) => string;
  /** Presents each metered variant's estimate and awaits confirmation (Req 17.7). */
  confirm?: ConfirmationRequester;
  /** Caller abort signal, forwarded to every variant's metered render (Req 17.10). */
  signal?: AbortSignal;
}

/** The outcome of one independently processed variant. */
export interface VariantResult {
  /** Zero-based variant index within the request. */
  index: number;
  /** True iff this variant planned, rendered, and (when applicable) metered successfully. */
  ok: boolean;
  /** The variant's independent structured plan (always present once planned). */
  plan: EditingPlan;
  /** The immutable version created for this variant (absent if version creation failed). */
  versionId?: string;
  /** The variant's own render job (absent if it failed before job creation). */
  jobId?: string;
  /** The variant's render outcome (absent when blocked/cancelled before rendering). */
  render?: RenderResult;
  /** True iff this variant was run through the metering ledger. */
  metered: boolean;
  /** The ledger settlement for a metered, completed variant (net = measured usage). */
  settlement?: CreditSettlement;
  /** Why the variant did not succeed (absent on success). */
  error?: { code: string; message: string };
}

/**
 * The orchestration result. A `>5` (or otherwise invalid) variant count is
 * rejected wholesale with `ok: false` and NOTHING created (Req 16.10). Otherwise
 * every requested variant is processed independently and returned in order.
 */
export type OrchestrateVariantsResult =
  | { ok: false; error: PlannerError }
  | { ok: true; variants: VariantResult[] };

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface VariantOrchestratorDeps {
  planner: PlannerPort;
  versionManager: VersionManagerPort;
  jobSystem: JobSystemPort;
  renderEngine: RenderPort;
  metering: MeteringPort;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Orchestrates independent per-variant plan/render/meter (task 19.3). Delegates
 * the variant ceiling + fan-out to the pure core, structured planning to the
 * Editing_Planner, versioning to the Version manager, job lifecycle to the
 * Job_System, rendering to the Render_Engine, and cost to the metering ledger —
 * sequencing each variant in isolation so one variant's outcome never affects
 * another.
 */
export class VariantOrchestratorService {
  private readonly planner: PlannerPort;
  private readonly versionManager: VersionManagerPort;
  private readonly jobSystem: JobSystemPort;
  private readonly renderEngine: RenderPort;
  private readonly metering: MeteringPort;
  private readonly log: VariantOrchestratorDeps['logger'];

  constructor(deps: VariantOrchestratorDeps) {
    this.planner = deps.planner;
    this.versionManager = deps.versionManager;
    this.jobSystem = deps.jobSystem;
    this.renderEngine = deps.renderEngine;
    this.metering = deps.metering;
    this.log = deps.logger ?? defaultLogger;
  }

  /**
   * Fan out `variantCount` variants and independently plan, version, render, and
   * meter each (Req 16.9). A request for more than the configured maximum (5) is
   * rejected before anything is created, so no variant, version, job, render, or
   * charge results (Req 16.10).
   */
  async orchestrate(request: OrchestrateVariantsRequest): Promise<OrchestrateVariantsResult> {
    // Step 1 — enforce the variant ceiling via the pure single-source core. On
    // rejection NOTHING is created (Req 16.10).
    const baseBuildInput: BuildEditingPlanInput = {
      intent: request.intent,
      analysis: request.analysis,
      ...(request.planOptions?.includeRenderOperation !== undefined
        ? { includeRenderOperation: request.planOptions.includeRenderOperation }
        : {}),
    };
    const ceiling = planVariants(baseBuildInput, request.variantCount);
    if (!ceiling.ok) {
      this.log?.info?.('Variant request rejected by ceiling; no variant created', {
        component: 'VariantOrchestratorService',
        projectId: request.identity.projectId,
        workspaceId: request.identity.workspaceId,
        requestedVariantCount: request.variantCount,
        errorCode: ceiling.error.code,
      });
      return { ok: false, error: ceiling.error };
    }

    // Step 2 — obtain the independent, reasoned plans from the Editing_Planner
    // (it fans out `variantCount` structurally independent plans, Req 16.9).
    const planRequest: PlanRequest = {
      intent: request.intent,
      analysis: request.analysis,
      variantCount: request.variantCount,
      userId: request.identity.userId,
      workspaceId: request.identity.workspaceId,
      ...(request.planOptions?.platform !== undefined
        ? { platform: request.planOptions.platform }
        : {}),
      ...(request.planOptions?.applyBrand !== undefined
        ? { applyBrand: request.planOptions.applyBrand }
        : {}),
      ...(request.planOptions?.brandProfile !== undefined
        ? { brandProfile: request.planOptions.brandProfile }
        : {}),
      ...(request.planOptions?.includeRenderOperation !== undefined
        ? { includeRenderOperation: request.planOptions.includeRenderOperation }
        : {}),
      ...(request.planOptions?.aiModel !== undefined
        ? { aiModel: request.planOptions.aiModel }
        : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    };
    const planResult = await this.planner.plan(planRequest);
    // For >1 variants the planner returns `variants`; for exactly 1 it returns a
    // single primary plan. Normalise to a per-variant list of the requested size.
    const plans: EditingPlan[] =
      planResult.variants && planResult.variants.length > 0
        ? planResult.variants
        : [planResult.plan];

    // Step 3 — process each variant INDEPENDENTLY. A failure/block/cancel of one
    // variant never aborts another (Req 16.9).
    const variants: VariantResult[] = [];
    for (let index = 0; index < plans.length; index++) {
      variants.push(await this.processVariant(request, plans[index], index));
    }

    this.log?.info?.('Orchestrated independent variants', {
      component: 'VariantOrchestratorService',
      projectId: request.identity.projectId,
      workspaceId: request.identity.workspaceId,
      requestedVariantCount: request.variantCount,
      producedVariantCount: variants.length,
      succeededVariantCount: variants.filter((v) => v.ok).length,
    });
    return { ok: true, variants };
  }

  /**
   * Plan → version → job → render → meter a single variant in isolation. Every
   * failure path returns a discrete `VariantResult` (never throws) so the caller
   * can act on each variant independently.
   */
  private async processVariant(
    request: OrchestrateVariantsRequest,
    plan: EditingPlan,
    index: number,
  ): Promise<VariantResult> {
    const identity: VersionIdentity = {
      projectId: request.identity.projectId,
      workspaceId: request.identity.workspaceId,
      userId: request.identity.userId,
    };

    try {
      // (a) Create this variant's OWN immutable version (Req 16.9). Each variant
      //     derives from the project's active version but is a distinct version.
      const timelineId = request.timelineIdFor
        ? request.timelineIdFor(index)
        : `variant-${index}`;
      const created = await this.versionManager.createVersion(identity, { timelineId });
      if (!created.ok) {
        this.log?.warn?.('Variant version creation failed', {
          component: 'VariantOrchestratorService',
          projectId: request.identity.projectId,
          variantIndex: index,
          error: created.error,
        });
        return {
          index,
          ok: false,
          plan,
          metered: false,
          error: { code: VARIANT_ERROR_VERSION, message: created.error },
        };
      }
      const versionId = created.version.versionId;

      // (b) Create this variant's OWN render job (Req 16.9). We render inline
      //     below, so the job is created but not enqueued.
      const jobInput: CreateJobInput = {
        type: 'render',
        projectId: request.identity.projectId,
        workspaceId: request.identity.workspaceId,
        userId: request.identity.userId,
        versionId,
        opId: `variant-${index}`,
        enqueue: false,
      };
      const job = await this.jobSystem.createJob(jobInput);

      // (c) Build the authoritative timeline for this variant's plan.
      const timeline = await request.buildTimeline({ plan, versionId, index });

      const renderRequest: RenderRequest = {
        projectId: request.identity.projectId,
        workspaceId: request.identity.workspaceId,
        userId: request.identity.userId,
        jobId: job.jobId,
        inputVersionId: versionId,
        timeline,
        exportProfileId: request.exportProfileId,
      };

      // (d) Meter + render INDEPENDENTLY. A variant with a generative cost basis
      //     is run through the ledger (unique idempotency key per variant, so it
      //     is charged independently, Req 16.9/17.4); a purely deterministic
      //     variant renders at zero cost with no metering wrapper.
      const costBasis = request.costBasisFor
        ? request.costBasisFor({ plan, index })
        : null;

      if (costBasis) {
        return await this.renderMetered(request, plan, index, versionId, job.jobId, renderRequest, costBasis);
      }

      const render = await this.renderEngine.render(renderRequest);
      return {
        index,
        ok: render.ok,
        plan,
        versionId,
        jobId: job.jobId,
        render,
        metered: false,
        ...(render.ok
          ? {}
          : { error: { code: render.errorCode, message: `Render failed: ${render.errorCode}` } }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log?.error?.('Variant processing failed unexpectedly', error as Error, {
        component: 'VariantOrchestratorService',
        projectId: request.identity.projectId,
        variantIndex: index,
      });
      return {
        index,
        ok: false,
        plan,
        metered: false,
        error: { code: VARIANT_ERROR_UNEXPECTED, message },
      };
    }
  }

  /**
   * Render a variant under the authoritative metering ledger (Req 16.9, 17.x).
   * The job's unique idempotency key attributes and charges this variant
   * independently. Blocked (insufficient credits) and cancelled (timeout /
   * decline / abort) outcomes yield a discrete unsuccessful `VariantResult` with
   * no render — never affecting other variants.
   */
  private async renderMetered(
    request: OrchestrateVariantsRequest,
    plan: EditingPlan,
    index: number,
    versionId: string,
    jobId: string,
    renderRequest: RenderRequest,
    cost: GenerativeCostBasis,
  ): Promise<VariantResult> {
    const run = await this.metering.runGenerativeOperation<RenderResult>({
      context: {
        userId: request.identity.userId,
        workspaceId: request.identity.workspaceId,
        idempotencyKey: jobId,
      },
      cost,
      operation: () => this.renderEngine.render(renderRequest),
      ...(request.confirm ? { confirm: request.confirm } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    });

    if (run.status === 'completed') {
      const render = run.result;
      return {
        index,
        ok: render.ok,
        plan,
        versionId,
        jobId,
        render,
        metered: true,
        settlement: run.settlement,
        ...(render.ok
          ? {}
          : { error: { code: render.errorCode, message: `Render failed: ${render.errorCode}` } }),
      };
    }

    if (run.status === 'blocked') {
      this.log?.info?.('Variant blocked: insufficient credits', {
        component: 'VariantOrchestratorService',
        projectId: request.identity.projectId,
        variantIndex: index,
        required: run.required,
        remaining: run.remaining,
      });
      return {
        index,
        ok: false,
        plan,
        versionId,
        jobId,
        metered: true,
        error: { code: VARIANT_ERROR_METERING_BLOCKED, message: run.reason },
      };
    }

    // status === 'cancelled'
    return {
      index,
      ok: false,
      plan,
      versionId,
      jobId,
      metered: true,
      error: {
        code: VARIANT_ERROR_METERING_CANCELLED,
        message: `Variant metering cancelled: ${run.cause}`,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Production factory
// ---------------------------------------------------------------------------

/** Lazily-instantiated shared orchestrator instance. */
let sharedOrchestrator: VariantOrchestratorService | null = null;

/**
 * Get the process-wide variant orchestrator, wiring the real Editing_Planner,
 * Version manager, Job_System, Render_Engine, and metering services (task 19.3).
 */
export async function getVariantOrchestratorService(): Promise<VariantOrchestratorService> {
  if (sharedOrchestrator) return sharedOrchestrator;

  const { getEditingPlannerService } = await import('./editing-planner.service');
  const { versionManagerService } = await import('./version-manager.service');
  const { getJobSystemService } = await import('./job-system.service');
  const { renderEngineService } = await import('./render-engine.service');
  const { getVideoGenerativeMeteringService } = await import('./generative-metering.service');

  sharedOrchestrator = new VariantOrchestratorService({
    planner: getEditingPlannerService(),
    versionManager: versionManagerService,
    jobSystem: await getJobSystemService(),
    renderEngine: renderEngineService,
    metering: getVideoGenerativeMeteringService(),
  });
  return sharedOrchestrator;
}
