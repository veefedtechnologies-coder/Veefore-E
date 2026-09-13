/**
 * Editing_Planner — LLM-bearing service shell (task 9.3, Req 5.1, 21.4).
 *
 * This is the thin IO/LLM shell that completes the Editing_Planner. Every
 * correctness rule of the plan — ordered typed operations, well-formed ranges,
 * preservation constraints, unavailable-op handling, preset/brand application,
 * and variant fan-out — lives in the PURE `editing-planner.logic.ts` core
 * (task 9.1) and is exercised by property tests (task 9.2). This service adds
 * ONLY the one responsibility the pure core cannot own: asking the LLM to reason
 * about the project GOAL and editing STYLE (design §"Editing_Planner").
 *
 * Division of responsibility:
 *   • The LLM (via `AIServiceManager`) produces free-form goal/style reasoning —
 *     a concise human project goal and an editing-style description — nothing
 *     more. It NEVER decides operations, ranges, or engine classification.
 *   • The pure `buildEditingPlan` deterministically turns the `VideoIntent` +
 *     `VideoAnalysis` into the well-formed, never-null `EditingPlan` (Req 5.1–5.6).
 *   • `applyPlatformPreset` / `applyBrandProfile` / `planVariants` (also pure)
 *     apply preset/brand/variant transformations; rejections leave the plan
 *     unchanged and are surfaced as warnings (Req 13.3, 13.5, 16.10).
 *
 * The LLM goal/style is stamped onto the plan's `projectGoal` only. If the LLM
 * call fails or times out, the service falls back to the pure core's derived
 * goal — it never fabricates a plan (No-Mock, Req 23). Token usage is captured
 * by wrapping the call in `collectAIUsage('video.generation', …)`.
 */

import { logger as defaultLogger } from '../../../config/logger';
import { AIServiceManager } from '../../../services/AIServiceManager';
import type { UserAIPreferences } from '../../../services/AIServiceManager';
import { collectAIUsage, type AIUsageSample } from '../../../services/aiUsageTracker';
import type { VideoIntent } from './intent-extraction.logic';
import {
  buildEditingPlan,
  applyPlatformPreset,
  applyBrandProfile,
  planVariants,
  type EditingPlan,
  type PlannerAnalysis,
  type BrandProfile,
  type PlannerError,
} from './editing-planner.logic';
import { emitLifecycleEvent } from './video-editor-events';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maximum wall-clock budget for the single goal/style reasoning call. The call
 * is aborted when this elapses; a timeout degrades to the pure core's derived
 * goal rather than blocking plan production.
 */
export const PLAN_REASONING_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Input to {@link EditingPlannerService.plan}. */
export interface PlanRequest {
  /** The structured, already-classified intent for this editing turn. */
  intent: VideoIntent;
  /** Analysis inputs (source duration, scene boundaries, protected regions). */
  analysis: PlannerAnalysis;
  /**
   * Platform key to stamp preset (aspect/duration/export profile) onto the plan.
   * Defaults to `intent.targetPlatform` when omitted. An unknown platform leaves
   * the plan unchanged and adds a warning (Req 13.3).
   */
  platform?: string | null;
  /**
   * When true, apply the workspace brand profile to the plan. A missing profile
   * leaves the plan unchanged and adds a warning (Req 13.5).
   */
  applyBrand?: boolean;
  /** The workspace brand profile, when available. */
  brandProfile?: BrandProfile | null;
  /**
   * Number of independent plan variants to fan out (1–5). When omitted (or 1),
   * only the primary plan is returned. >5 is rejected via the pure core (Req 16.10).
   */
  variantCount?: number;
  /** Whether to append a final render operation (defaults to true). */
  includeRenderOperation?: boolean;
  /** Owning user (usage tagging / metering context). */
  userId?: string;
  /** Active workspace (usage tagging / metering context). */
  workspaceId?: string;
  /** Workspace AI model preference; forwarded to `AIServiceManager`. */
  aiModel?: string;
  /** External abort signal; combined with the internal reasoning timeout. */
  signal?: AbortSignal;
}

/** The goal/style reasoning the LLM contributed (or the pure-core fallback). */
export interface PlanReasoning {
  /** Concise human-readable project goal stamped onto the plan. */
  projectGoal: string;
  /** Editing-style description, or null when unspecified. */
  editingStyle: string | null;
  /** True when the goal/style came from a successful LLM call. */
  usedLLM: boolean;
}

/** Result of {@link EditingPlannerService.plan}. */
export interface PlanResult {
  /** The primary well-formed, never-null editing plan (Req 5.1, 5.2). */
  plan: EditingPlan;
  /** Independent variant plans, present only when >1 variant was requested. */
  variants?: EditingPlan[];
  /** The goal/style reasoning applied to the plan. */
  reasoning: PlanReasoning;
  /** Token usage captured for the reasoning call (empty when no call was made). */
  usage: AIUsageSample[];
  /**
   * Non-fatal warnings — e.g. an unknown platform or missing brand profile that
   * left the plan unchanged (Req 13.3, 13.5). The plan is still valid.
   */
  warnings: PlannerError[];
}

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface EditingPlannerServiceDeps {
  aiService?: Pick<AIServiceManager, 'generateText'>;
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** Reasoning budget in ms; defaults to {@link PLAN_REASONING_TIMEOUT_MS}. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * Editing_Planner service: obtains LLM goal/style reasoning, then delegates all
 * structural planning to the pure core. Returns a never-null `EditingPlan`
 * (plus optional variants) with the reasoning stamped onto its goal (Req 5.1).
 */
export class EditingPlannerService {
  private readonly ai: Pick<AIServiceManager, 'generateText'>;
  private readonly log: EditingPlannerServiceDeps['logger'];
  private readonly timeoutMs: number;

  constructor(deps: EditingPlannerServiceDeps = {}) {
    this.ai = deps.aiService ?? AIServiceManager.getInstance();
    this.log = deps.logger ?? defaultLogger;
    this.timeoutMs = deps.timeoutMs ?? PLAN_REASONING_TIMEOUT_MS;
  }

  /**
   * Produce a structured editing plan for the given intent + analysis (Req 5.1).
   *
   * 1. Ask the LLM for goal/style reasoning (bounded, non-fatal on failure).
   * 2. Delegate structural planning to the pure `buildEditingPlan`.
   * 3. Stamp the reasoned goal onto the plan.
   * 4. Apply platform preset / brand profile via the pure core, collecting any
   *    rejection as a non-fatal warning that leaves the plan unchanged.
   * 5. Fan out variants via the pure core when requested (>1).
   */
  async plan(request: PlanRequest): Promise<PlanResult> {
    const warnings: PlannerError[] = [];

    // Stage 1 — LLM goal/style reasoning (never fabricates a plan on failure).
    const { reasoning, usage } = await this.reason(request);

    // Stage 2 — structural planning is entirely the pure core's job.
    const buildInput = {
      intent: request.intent,
      analysis: request.analysis,
      includeRenderOperation: request.includeRenderOperation,
    };

    // Fan out variants when >1 requested; otherwise a single plan (Req 16.9/16.10).
    const wantsVariants =
      typeof request.variantCount === 'number' && request.variantCount > 1;
    let variants: EditingPlan[] | undefined;
    if (wantsVariants) {
      const variantResult = planVariants(buildInput, request.variantCount as number);
      if (!variantResult.ok) {
        // Reject variant fan-out but still return the single primary plan so the
        // caller has a valid plan and a clear warning (Req 16.10).
        warnings.push(variantResult.error);
      } else {
        variants = variantResult.plans;
      }
    }

    let plan: EditingPlan = variants ? variants[0] : buildEditingPlan(buildInput);

    // Stage 3 — stamp the reasoned goal onto the plan (the only field the LLM
    // contributes to; operations remain the pure core's output, Req 5.1).
    plan = { ...plan, projectGoal: reasoning.projectGoal };
    if (variants) variants = variants.map((v) => ({ ...v, projectGoal: reasoning.projectGoal }));

    // Stage 4 — Platform_Preset application (pure). Unknown platform → warning,
    // plan unchanged (Req 13.3).
    const platform =
      typeof request.platform === 'string' && request.platform.trim().length > 0
        ? request.platform
        : request.intent.targetPlatform;
    if (typeof platform === 'string' && platform.trim().length > 0) {
      const presetResult = applyPlatformPreset(plan, platform);
      if (presetResult.ok) {
        plan = presetResult.plan;
        if (variants) {
          variants = variants.map((v) => {
            const r = applyPlatformPreset(v, platform);
            return r.ok ? r.plan : v;
          });
        }
      } else {
        warnings.push(presetResult.error);
      }
    }

    // Stage 5 — brand profile application (pure). Missing profile → warning,
    // plan unchanged (Req 13.5).
    if (request.applyBrand) {
      const brandResult = applyBrandProfile(plan, request.brandProfile ?? null);
      if (brandResult.ok) {
        plan = brandResult.plan;
        if (variants) {
          variants = variants.map((v) => {
            const r = applyBrandProfile(v, request.brandProfile ?? null);
            return r.ok ? r.plan : v;
          });
        }
      } else {
        warnings.push(brandResult.error);
      }
    }

    // Structured lifecycle event: plan created (Req 22.1). Carries only ids and
    // non-sensitive counts — never the source media or a credential.
    emitLifecycleEvent(
      'plan_created',
      {
        userId: request.userId,
        workspaceId: request.workspaceId,
        details: {
          operationCount: plan.operations.length,
          variantCount: variants ? variants.length : 1,
          warningCount: warnings.length,
          usedLLM: reasoning.usedLLM,
        },
      },
      { logger: this.log },
    );

    return { plan, variants, reasoning, usage, warnings };
  }

  // -------------------------------------------------------------------------
  // LLM goal/style reasoning
  // -------------------------------------------------------------------------

  /**
   * Run the single bounded goal/style reasoning call. Returns the reasoned
   * goal/style plus captured usage. On any failure/timeout, falls back to the
   * pure core's derived goal with `usedLLM: false` — never blocking plan
   * production and never fabricating operations.
   */
  private async reason(
    request: PlanRequest,
  ): Promise<{ reasoning: PlanReasoning; usage: AIUsageSample[] }> {
    // The pure core's derived goal is the deterministic fallback.
    const fallbackGoal = buildEditingPlan({
      intent: request.intent,
      analysis: request.analysis,
      includeRenderOperation: request.includeRenderOperation,
    }).projectGoal;
    const fallback: PlanReasoning = {
      projectGoal: fallbackGoal,
      editingStyle: request.intent.editingStyle ?? null,
      usedLLM: false,
    };

    const prompt = buildReasoningPrompt(request.intent, request.analysis);
    const preferences: UserAIPreferences = {
      aiModel: request.aiModel,
      // Goal/style reasoning is concise and non-creative.
      creativityLevel: 0.2,
      responseLength: 'short',
    };

    const { signal, cancel } = withTimeout(request.signal, this.timeoutMs);
    try {
      const { result: raw, usage } = await collectAIUsage(
        'video.generation',
        { userId: request.userId, workspaceId: request.workspaceId },
        () => this.ai.generateText(prompt, preferences, signal),
      );
      const parsed = parseReasoning(raw);
      if (!parsed) return { reasoning: fallback, usage };
      return {
        reasoning: {
          projectGoal:
            parsed.projectGoal && parsed.projectGoal.trim().length > 0
              ? parsed.projectGoal.trim()
              : fallbackGoal,
          editingStyle: parsed.editingStyle ?? request.intent.editingStyle ?? null,
          usedLLM: true,
        },
        usage,
      };
    } catch (error) {
      this.log?.warn?.('Plan goal/style reasoning failed; using derived goal', {
        component: 'EditingPlannerService',
        workspaceId: request.workspaceId,
        error: (error as Error)?.message,
      });
      return { reasoning: fallback, usage: [] };
    } finally {
      cancel();
    }
  }
}

/** Lazily-instantiated shared Editing_Planner service instance. */
let sharedPlanner: EditingPlannerService | null = null;

/** Get the process-wide Editing_Planner service. */
export function getEditingPlannerService(): EditingPlannerService {
  if (!sharedPlanner) {
    sharedPlanner = new EditingPlannerService();
  }
  return sharedPlanner;
}

// ---------------------------------------------------------------------------
// Prompt construction (goal/style reasoning ONLY)
// ---------------------------------------------------------------------------

/**
 * Build the goal/style reasoning prompt. The model is given the structured
 * intent and a compact analysis summary and asked ONLY to articulate the project
 * goal and editing style as JSON. It is explicitly told NOT to plan operations —
 * that is the deterministic core's job.
 */
export function buildReasoningPrompt(intent: VideoIntent, analysis: PlannerAnalysis): string {
  const summary = {
    action: intent.action,
    requestedChanges: intent.requestedChanges,
    targetPlatform: intent.targetPlatform,
    targetAspectRatio: intent.targetAspectRatio,
    targetDurationMs: intent.targetDurationMs,
    editingStyle: intent.editingStyle,
    protectedElements: intent.protectedElements,
    sourceDurationMs: analysis?.sourceDurationMs ?? null,
  };

  return [
    'You are the goal/style reasoner for a video editor. Given a structured',
    'editing intent and a source analysis summary, articulate ONLY the overall',
    'project GOAL and the editing STYLE. Respond with ONLY a JSON object of shape:',
    '{"projectGoal": <one concise sentence describing what the edit should achieve>,',
    ' "editingStyle": <a short phrase describing pacing/tone/look, or null>}',
    '',
    'Rules:',
    '- Do NOT list, invent, or order any editing operations, timeline ranges, or',
    '  tools — those are decided deterministically elsewhere.',
    '- Keep projectGoal to a single sentence; keep editingStyle to a short phrase.',
    '- Use null for editingStyle if the intent does not imply one.',
    '- Output JSON only — no prose, no markdown fences.',
    '',
    'Intent + analysis summary:',
    JSON.stringify(summary),
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Reasoning JSON parsing
// ---------------------------------------------------------------------------

interface ParsedReasoning {
  projectGoal: string | null;
  editingStyle: string | null;
}

/** Parse the model's raw text into goal/style, tolerating fences/prose. */
export function parseReasoning(raw: string): ParsedReasoning | null {
  const json = extractFirstJsonObject(raw);
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  return {
    projectGoal: toStringOrNull(obj.projectGoal),
    editingStyle: toStringOrNull(obj.editingStyle),
  };
}

/** Extract the first balanced `{…}` JSON object substring from arbitrary text. */
function extractFirstJsonObject(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

/**
 * Build an `AbortSignal` that fires when either the caller's `parent` signal
 * aborts or `ms` elapses, plus a `cancel` to clear the timer.
 */
function withTimeout(
  parent: AbortSignal | undefined,
  ms: number,
): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const onParentAbort = () => controller.abort((parent as any)?.reason);
  if (parent) {
    if (parent.aborted) controller.abort((parent as any).reason);
    else parent.addEventListener('abort', onParentAbort, { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error('plan-reasoning-timeout')), ms);
  const cancel = () => {
    clearTimeout(timer);
    parent?.removeEventListener('abort', onParentAbort);
  };
  return { signal: controller.signal, cancel };
}
