/**
 * VeeGPT Chat Routes — HTTP streaming (NDJSON over the message POST request).
 *
 * Streaming uses the SAME HTTP request that sends the user's message (the way
 * ChatGPT/Claude/OpenAI do it), NOT a WebSocket. The response body stays open
 * and the server writes newline-delimited JSON events as the model generates:
 *   {"type":"conversation",...}   (new chat only)
 *   {"type":"userMessage",...}
 *   {"type":"status","status":"..."}
 *   {"type":"chunk","content":"<cumulative text>","messageId":N}
 *   {"type":"complete","messageId":N,"finalContent":"..."}
 *   {"type":"error","error":"..."}
 * The client reads this with a fetch ReadableStream reader. This removes all the
 * WebSocket fragility (connect/subscribe race, mid-stream reconnect, replay).
 *
 * Responses follow the workspace AI configuration saved on Settings → AI
 * Configuration (workspace.aiConfiguration): model, creativity/temperature,
 * persona, tone/style, response length, language, safety and provider keys.
 */

import { Router, type Response, type NextFunction } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/require-auth';
import { ChatConversation, ChatMessage, UserMemory } from '../models/Chat';
import { storage } from '../mongodb-storage';
import {
  aiServiceManager,
  type UserAIPreferences,
  type AIAttachment,
} from '../services/AIServiceManager';
import { vlog } from '../utils/veegpt-debug-logger';
import {
  selectShallowWindow,
  planLongTermWindow,
  LONG_TERM_VERBATIM,
  type MemoryMode,
} from './veegpt-memory.logic';
import {
  mergeMemoryItems,
  computeUsage,
  hasSaveIntent,
  extractSaveIntentFact,
  clampItemText,
  isMemoryFull,
  dedupeMemoryItems,
  detectTopic,
} from './veegpt-user-memory.logic';
import {
  VEEGPT_CHAT_TOOLS,
  VEEGPT_MEMORY_TOOLS_ALL,
  VEEGPT_DATA_TOOLS,
  VEEGPT_EDIT_TOOLS,
  VEEGPT_INSIGHT_TOOLS,
  VEEGPT_ACCOUNT_TOOLS,
  VEEGPT_IMAGE_TOOLS,
  VEEGPT_VIDEO_TOOLS,
} from './veegpt-tools';
import {
  resolveVeeGPTTier,
  filterToolsByTier,
  isToolAllowedForTier,
  TIER_MIN_PLAN,
  TOOL_MIN_TIER,
  type VeeGPTTier,
} from '../config/veegpt-tiers';
import type { ChatTool } from '../services/AIServiceManager';
import {
  parsePostIntentDeterministic,
  mergePostIntent,
} from './veegpt-post-intent.logic';
import {
  ALL_SUPPORTED_TYPES,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  resolveMimeType,
  SUPPORTED_SUMMARY,
  kindOf,
} from '@shared/attachment-support';
import {
  uploadFileToGemini,
  resolveGeminiApiKey,
} from '../services/gemini-files.service';
import {
  getWorkspaceContextForPrompt,
  getIdentityContextForPrompt,
} from '../services/WorkspaceContextAccessor';
import {
  agentPublicView,
  getAgentDirectivesForTier,
  agentsForTier,
} from './veegpt-agents';
// ── Context composition layer (spec: veegpt-context-optimization) ────────────
// The optimized context path (classifyIntent → selectModules → selectTools →
// compose) is now the ONLY context-assembly path: the legacy `buildPrompt`
// builder and its `Optimization_Flag`/seam were removed.
import { classifyIntent } from './veegpt-intent.logic';
import {
  selectModules,
  type ComposeInput,
  type PromptPreferences,
} from './veegpt-modules';
import { compose } from './veegpt-context-composer';
import { recordTokenTelemetry } from './veegpt-token-telemetry';
import { selectTools } from './veegpt-tool-selection.logic';
import { reduceToolResult } from './veegpt-tool-result.logic';
import { getContextConfig } from '../config/veegpt-context.config';
import {
  ctxDebugEnabled,
  ctxDebugTextEnabled,
  appendCtxDebug,
  preview,
} from './veegpt-context-debug';
import type { Msg } from './veegpt-memory.logic';
import { withAIFeature, recordToolRun } from '../services/aiUsageTracker';
import { veeGPTBasicGuards } from '../middleware/ai-route-guards';
import { resolveVeegptPlan } from '../services/veegpt-plan';
import { getReservationEngine } from '../services/veegpt-reservation.engine';
import { getRedisClient } from '../lib/redis';
import { meterAI } from '../middleware/meter-ai';
import { withVGU, VGUQuotaError } from '../services/veegpt-metering';
import {
  canUpgrade,
  DEEP_RESEARCH_FEATURE,
  featureMonthlyCap,
  featureSpec,
  NEXT_PLAN,
  usageNotice,
  VGU_ERROR,
} from '../config/veegpt-vgu.config';
import { estimateVGURange } from '../services/veegpt-vgu';
import { TIER_DEFAULT_MODEL } from '@shared/veegpt-model-tiers';
import type { PlanId } from '../config/plan-config';
import { providerCostUSD } from '../config/veegpt-pricing.registry';
import {
  aiCreditMeteringService,
  InsufficientAICreditsError,
} from '../features/subscription/services/AICreditMeteringService';
// ── Image capability (Gemini native image generation/editing) ────────────────
import {
  generateOrEditImage,
  ImageGenerationError,
} from '../services/gemini-image.service';
import {
  selectImageModel,
  aspectForPlatform,
  toServerFetchableImageUrl,
  selfFetchBaseUrl,
  IMAGE_ASPECT_RATIOS,
  MAX_IMAGE_INPUTS,
  SUPPORTED_IMAGE_INPUT_MIME,
  imageDeliveryMode,
  imageSignedUrlTtlSeconds,
  shouldRedirectImage,
  cloudFrontConfig,
  cloudFrontUrlForKey,
} from '../config/veegpt-image.config';
import { getSignedUrl as getCloudFrontSignedUrl } from '@aws-sdk/cloudfront-signer';
import { storageKeyFromMediaUrl } from '../config/publish-media-url';
import { AiImageAsset } from '../models/AiImageAsset';
import { storageService } from '../features/storage/services/storage.service';
import { randomUUID as randomAssetId } from 'crypto';

const router = Router();

// ── Selectable VeeGPT agents (personas) — client dropdown metadata ───────────
// Returns only the public view (id/name/description/icon); prompt directives
// stay server-side and are applied by the chat handlers.
router.get('/agents', requireAuth, async (req: any, res: Response) => {
  // Only offer personas the user's plan can actually deliver — a Free user
  // shouldn't see "Trend Researcher"/"Analytics Expert" that rely on Full-tier
  // tools they don't have.
  const tier = await resolveVeeGPTTier(req.user?.id);
  res.json({ agents: agentsForTier(tier).map(agentPublicView) });
});

// ─── TESTING FLAG ───────────────────────────────────────────────────────────
// When true, ALL regex/deterministic shortcuts are bypassed so we can verify
// the LLM handles everything (post intent, memory save-intent, caption/hashtag)
// on its own. Set back to false to restore the production fast-paths/fallbacks.
const DISABLE_REGEX_FOR_TESTING = true;

// Startup marker so we can confirm in the log that THIS version is live (used to
// diagnose stale-process / no-reload issues).
vlog('routes:loaded', {
  version: 'memory-v3-deterministic',
  at: new Date().toISOString(),
});
console.log('[VEEGPT] routes loaded — memory-v3-deterministic');

/**
 * Reasoning-model ids (OpenAI GPT-5 family). Must stay in sync with
 * litellm/config.yaml model_names, the gateway's TEMPERATURE_LOCKED_MODELS, and
 * the client MODELS_WITHOUT_CREATIVITY. Used to label the "thinking" status
 * honestly (these models reason before emitting text).
 */
const REASONING_MODEL_IDS = new Set<string>([
  'openai-gpt-5-nano',
  'openai-gpt-5-mini',
  'openai-gpt-5',
  'openai-gpt-5.5',
  'openai-gpt-5.6-sol',
  'openai-gpt-5.6-luna',
  'openai-gpt-5.6-terra',
]);

/**
 * Single source of truth for the human-friendly status shown while each VeeGPT
 * tool runs. EVERY tool in veegpt-tools.ts MUST have an entry so the chat never
 * shows a stale/generic label when a real tool (web search, research, etc.) is
 * working. `toolStatusLabel()` provides a safe humanized fallback for any tool
 * added later before it's mapped here — it derives the label from the tool name
 * rather than showing a random/rotating phrase.
 */
const TOOL_STATUS_LABELS: Record<string, string> = {
  // Content / posting
  schedule_post: 'Preparing your post…',
  reschedule_post: 'Rescheduling your post…',
  cancel_scheduled_post: 'Cancelling that scheduled post…',
  update_post_caption: 'Updating the caption…',
  delete_post: 'Deleting that post…',
  duplicate_post: 'Duplicating the post…',
  generate_caption: 'Writing caption ideas…',
  generate_hashtags: 'Finding the best hashtags…',
  generate_document: 'Putting your document together…',
  generate_image: 'Creating your image…',
  edit_image: 'Editing your image…',
  video_editor: 'Opening the video editor…',
  // Analytics
  get_analytics_insight: 'Analysing your performance…',
  get_best_posting_time: 'Working out your best time to post…',
  get_workspace_data: 'Checking your workspace…',
  get_account_details: 'Reading your account analytics…',
  // Web / research
  research_trends: 'Researching current trends…',
  search_web: 'Searching the web…',
  deep_research: 'Running deep research…',
  // Memory
  remember_fact: 'Saving that to memory…',
  update_memory: 'Updating your saved details…',
  forget_memory: 'Removing that from memory…',
};

/** Friendly status for a tool; humanizes unknown names instead of a random phrase. */
function toolStatusLabel(name: string): string {
  return (
    TOOL_STATUS_LABELS[name] ||
    `Working on ${String(name).replace(/_/g, ' ').trim()}…`
  );
}

/**
 * Short gerund fragments (no leading capital, no trailing ellipsis) used to
 * compose a NATURAL combined status when several tools run at once — instead of
 * the awkward "Searching the web… (+1 more)". Keep in sync with the tool set.
 */
const SHORT_TOOL_PHRASE: Record<string, string> = {
  schedule_post: 'preparing your post',
  reschedule_post: 'rescheduling your post',
  cancel_scheduled_post: 'cancelling that post',
  update_post_caption: 'updating the caption',
  delete_post: 'deleting that post',
  duplicate_post: 'duplicating the post',
  generate_caption: 'writing caption ideas',
  generate_hashtags: 'finding the best hashtags',
  generate_document: 'putting your document together',
  generate_image: 'creating your image',
  edit_image: 'editing your image',
  get_analytics_insight: 'analysing your performance',
  get_best_posting_time: 'finding your best time to post',
  get_workspace_data: 'checking your workspace',
  get_account_details: 'reading your account analytics',
  research_trends: 'researching current trends',
  search_web: 'searching the web',
  deep_research: 'running deep research',
  remember_fact: 'saving that to memory',
  update_memory: 'updating your saved details',
  forget_memory: 'removing that from memory',
};

function shortToolPhrase(name: string): string {
  return SHORT_TOOL_PHRASE[name] || String(name).replace(/_/g, ' ').trim();
}

/**
 * Build ONE natural status line for however many tools are running, e.g.
 *   1 tool  → "Searching the web…"
 *   2 tools → "Searching the web and researching current trends…"
 *   3+ tools→ "Searching the web, researching current trends, and analysing your performance…"
 * Reads like a real thought, never "(+N more)".
 */
function combinedToolStatus(names: string[]): string {
  const uniq = Array.from(new Set(names.filter(Boolean)));
  if (uniq.length === 0) return 'Working on it…';
  if (uniq.length === 1) return toolStatusLabel(uniq[0]);
  const phrases = uniq.map(shortToolPhrase);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  if (phrases.length === 2) return `${cap(phrases[0])} and ${phrases[1]}…`;
  return `${cap(phrases[0])}, ${phrases.slice(1, -1).join(', ')}, and ${phrases[phrases.length - 1]}…`;
}

type FullPreferences = UserAIPreferences & {
  optimizationGoals?: string;
  autoHashtags?: boolean;
  aiMemory?: string;
  autoLearning?: boolean;
};

// Tracks conversations that are actively generating so the stop endpoint and a
// client disconnect can abort the in-flight model stream.
const activeGenerations = new Map<number, boolean>();
// AbortController per actively-generating conversation. Aborting it cancels the
// upstream model request (OpenAI/GitHub) so Stop saves tokens instead of letting
// the model finish in the background.
const activeAbortControllers = new Map<number, AbortController>();

// Live deep-research progress, buffered per conversation, so a user who
// navigates away mid-research and returns can RESUME the live activity feed
// (sources read, searches run, step timeline) — not just a spinner. It mirrors
// the client's ResearchProgressState accumulation and keeps updating even after
// the client disconnects (that's the whole point). A returning client polls
// GET /conversations/:id/research-progress. In-memory + single-instance, same
// as activeGenerations; on a multi-instance deploy a poll that lands on another
// instance simply falls back to the plain working indicator.
interface ServerResearchProgress {
  active: boolean;
  phase: string;
  steps: Array<{
    kind: string;
    label: string;
    detail?: string;
    queries?: string[];
    count?: number;
  }>;
  sources: Array<{ title: string; url: string; domain: string; favicon?: string }>;
  sourceCount: number;
  searchCount: number;
  messageId: number;
  updatedAt: number;
}
const activeResearchProgress = new Map<number, ServerResearchProgress>();

// Cross-instance mirror of the research buffer: the in-memory map above is the
// fast path on the generating instance; this Redis copy lets a returning client
// whose poll lands on ANOTHER instance still resume the live feed. Expires on
// its own so a crashed generation can't leave a stale key forever.
const RESEARCH_PROGRESS_KEY = (convId: number) => `veegpt:research:${convId}`;
const RESEARCH_PROGRESS_TTL_SEC = 30 * 60;

// How long a half-finished post's carried-over state (media/time/account) stays
// reusable across turns. This lives in the DB on the conversation doc and is
// NEVER injected into the model prompt, so a longer window costs ZERO extra
// tokens — it only lets a user resume "schedule this…" later in the day instead
// of losing the media/time they already gave. Nothing is ever published from it
// silently: the reused media/time is shown on the confirm card, which the user
// must click before anything posts. Previously 30 min, which felt like amnesia.
const PENDING_POST_TTL_MS = 24 * 60 * 60 * 1000;

function mirrorResearchProgressToRedis(convId: number, state: ServerResearchProgress): void {
  // Fire-and-forget; a Redis hiccup must never disrupt generation.
  try {
    getRedisClient()
      .set(RESEARCH_PROGRESS_KEY(convId), JSON.stringify(state), 'EX', RESEARCH_PROGRESS_TTL_SEC)
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

// ── Live partial-answer buffer (resume-on-reopen) ───────────────────────────
// The token stream lives only on the client's HTTP connection. If the user
// closes the tab / app mid-generation, reopening can't replay that stream. So
// while a reply generates we buffer the CUMULATIVE partial text (throttled) in
// memory + Redis, and expose it via GET /generation-state. A returning client
// polls it and shows the real partial answer (updating live) with a working
// indicator — instead of a blank "working on it" — until the finished reply
// lands via the messages poll. Cleared when the turn finishes/stops.
interface ServerGenerationState {
  messageId: number;
  content: string;
  updatedAt: number;
}
const activeGenerationText = new Map<number, ServerGenerationState>();
const GENERATION_STATE_KEY = (convId: number) => `veegpt:gen:${convId}`;
const GENERATION_STATE_TTL_SEC = 30 * 60;
const generationMirrorAt = new Map<number, number>();

/** Throttled record of the cumulative partial answer for a conversation. */
function recordPartialAnswer(convId: number, messageId: number, content: string): void {
  if (!convId || !messageId) return;
  const state: ServerGenerationState = { messageId, content, updatedAt: Date.now() };
  activeGenerationText.set(convId, state);
  // Mirror to Redis at most ~once/sec so a poll on another instance can resume.
  const last = generationMirrorAt.get(convId) || 0;
  if (Date.now() - last >= 1000) {
    generationMirrorAt.set(convId, Date.now());
    try {
      getRedisClient()
        .set(GENERATION_STATE_KEY(convId), JSON.stringify(state), 'EX', GENERATION_STATE_TTL_SEC)
        .catch(() => {});
    } catch {
      /* ignore */
    }
  }
}

/** Drop the partial-answer buffer once the turn is finished/stopped. */
function clearPartialAnswer(convId: number): void {
  if (!convId) return;
  activeGenerationText.delete(convId);
  generationMirrorAt.delete(convId);
  try {
    getRedisClient().del(GENERATION_STATE_KEY(convId)).catch(() => {});
  } catch {
    /* ignore */
  }
}

function clearResearchProgress(convId: number): void {
  activeResearchProgress.delete(convId);
  try {
    getRedisClient()
      .del(RESEARCH_PROGRESS_KEY(convId))
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

// ── Live image-generation/editing progress (resume-on-reopen) ───────────────
// The animated "generating your image…" card lives only on the client's HTTP
// stream (as a transient liveImageCard). If the user refreshes or closes the app
// mid-generation, the card is lost and the reply looks like a blank "working on
// it". So while an image tool runs we buffer its live state (operation/subject)
// in memory + Redis and expose it via GET /image-progress. A returning client
// polls it and re-shows the SAME animated card until the finished image lands
// via the messages poll. Cleared when the turn finishes/stops.
interface ServerImageProgress {
  messageId: number;
  operation: string; // 'generation' | 'editing'
  status: string; // 'generating'
  subject?: string;
  updatedAt: number;
}
const activeImageProgress = new Map<number, ServerImageProgress>();
const IMAGE_PROGRESS_KEY = (convId: number) => `veegpt:image:${convId}`;
const IMAGE_PROGRESS_TTL_SEC = 30 * 60;

/** Record the live image card so a returning client can resume it. */
function recordImageProgress(
  convId: number,
  messageId: number,
  p: { operation: string; status: string; subject?: string }
): void {
  if (!convId || !messageId) return;
  const state: ServerImageProgress = {
    messageId,
    operation: p.operation,
    status: p.status,
    subject: p.subject,
    updatedAt: Date.now(),
  };
  activeImageProgress.set(convId, state);
  try {
    getRedisClient()
      .set(IMAGE_PROGRESS_KEY(convId), JSON.stringify(state), 'EX', IMAGE_PROGRESS_TTL_SEC)
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Drop the image-progress buffer once the turn is finished/stopped. */
function clearImageProgress(convId: number): void {
  if (!convId) return;
  activeImageProgress.delete(convId);
  try {
    getRedisClient().del(IMAGE_PROGRESS_KEY(convId)).catch(() => {});
  } catch {
    /* ignore */
  }
}

// ── Live video-editor progress (resume-on-reopen) ───────────────────────────
// The inline "editing your video…" card (phase/percent/plan checklist) lives
// only on the client's HTTP stream (as a transient liveVideoCard). If the user
// refreshes or closes the app mid-edit, the card is lost and the reply looks
// like a blank "working on it". So while the `video_editor` tool runs we buffer
// its live state in memory + Redis and expose it via GET /video-editor-progress.
// A returning client polls it and re-shows the SAME animated card (with its
// plan checklist + step counter) until the finished video lands via the
// messages poll. Cleared when the turn finishes/stops.
interface ServerVideoEditorProgress {
  messageId: number;
  phase: string;
  percent: number;
  status?: string;
  subject?: string;
  plan?: any[];
  activeStepIndex?: number;
  updatedAt: number;
}
const activeVideoEditorProgress = new Map<number, ServerVideoEditorProgress>();
const VIDEO_EDITOR_PROGRESS_KEY = (convId: number) => `veegpt:video-editor:${convId}`;
const VIDEO_EDITOR_PROGRESS_TTL_SEC = 30 * 60;

/** Record the live video-editor card so a returning client can resume it. */
function recordVideoEditorProgress(
  convId: number,
  messageId: number,
  p: {
    phase: string;
    percent: number;
    status?: string;
    subject?: string;
    plan?: any[];
    activeStepIndex?: number;
  }
): void {
  if (!convId || !messageId) return;
  // Merge onto any prior state for this turn so a progress event that carries
  // only phase/percent doesn't wipe the plan/subject captured earlier.
  const prev = activeVideoEditorProgress.get(convId);
  const state: ServerVideoEditorProgress = {
    messageId,
    phase: p.phase,
    percent: p.percent,
    status: p.status ?? prev?.status,
    subject: p.subject ?? prev?.subject,
    plan: p.plan ?? prev?.plan,
    activeStepIndex:
      typeof p.activeStepIndex === 'number' ? p.activeStepIndex : prev?.activeStepIndex,
    updatedAt: Date.now(),
  };
  activeVideoEditorProgress.set(convId, state);
  try {
    getRedisClient()
      .set(
        VIDEO_EDITOR_PROGRESS_KEY(convId),
        JSON.stringify(state),
        'EX',
        VIDEO_EDITOR_PROGRESS_TTL_SEC
      )
      .catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Drop the video-editor-progress buffer once the turn is finished/stopped. */
function clearVideoEditorProgress(convId: number): void {
  if (!convId) return;
  activeVideoEditorProgress.delete(convId);
  try {
    getRedisClient().del(VIDEO_EDITOR_PROGRESS_KEY(convId)).catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Accumulate one deep-research progress event into the per-conversation buffer,
 *  using the SAME merge rules as the client so a resumed feed looks identical. */
function recordResearchProgress(convId: number, messageId: number, p: any): void {
  const cur = activeResearchProgress.get(convId) || {
    active: true,
    phase: 'planning',
    steps: [],
    sources: [],
    sourceCount: 0,
    searchCount: 0,
    messageId,
    updatedAt: Date.now(),
  };
  const sources = cur.sources.slice();
  if (Array.isArray(p.newSources)) {
    for (const s of p.newSources) if (!sources.some(x => x.url === s.url)) sources.push(s);
  }
  const cumulative = typeof p.sourceCount === 'number' ? p.sourceCount : sources.length;
  const steps = cur.steps.slice();
  if (p.kind === 'reading') {
    const last = steps[steps.length - 1];
    if (last?.kind === 'reading') steps[steps.length - 1] = { ...last, count: cumulative };
    else steps.push({ kind: p.kind, label: p.label, detail: p.detail, count: cumulative });
  } else {
    steps.push({ kind: p.kind, label: p.label, detail: p.detail, queries: p.queries });
  }
  const next: ServerResearchProgress = {
    active: p.kind !== 'done',
    phase: p.kind,
    steps,
    sources,
    sourceCount: cumulative,
    searchCount: cur.searchCount + (p.kind === 'searching' ? p.queries?.length || 1 : 0),
    messageId,
    updatedAt: Date.now(),
  };
  activeResearchProgress.set(convId, next);
  mirrorResearchProgressToRedis(convId, next);
}

/**
 * Resolve the AI preferences for a workspace from its saved aiConfiguration.
 * Falls back to sensible defaults when the workspace has not configured AI yet.
 *
 * Resilient lookup: the conversation's stored `workspaceId` may be a synthetic
 * id (e.g. "ws_xxxx") that isn't a Mongo ObjectId, so storage.getWorkspace()
 * can't resolve it. In that case we fall back to the user's default workspace,
 * so the AI configuration (model, keys, persona, …) is still applied.
 */
async function getWorkspaceAIPreferences(
  workspaceId?: string,
  userId?: string
): Promise<FullPreferences> {
  try {
    let workspace = workspaceId
      ? await storage.getWorkspace(workspaceId)
      : undefined;

    // Fallback: stored workspaceId didn't resolve (non-ObjectId / synthetic id).
    if (!workspace && userId) {
      vlog('ai-config:fallback-default-workspace', { workspaceId, userId });
      workspace = await storage.getDefaultWorkspace(userId);
    }

    const cfg = (workspace as any)?.aiConfiguration;
    if (!cfg) {
      vlog('ai-config:none', {
        workspaceId,
        resolvedId: (workspace as any)?.id,
        note: 'no aiConfiguration, using defaults',
      });
      // Memory is an always-on VeeGPT capability — default it to long-term so
      // the assistant learns durable facts even before the user touches AI config.
      return { aiMemory: 'long-term' };
    }
    vlog('ai-config:loaded', {
      workspaceId,
      resolvedId: (workspace as any)?.id,
      aiModel: cfg.aiModel,
      creativityLevel: cfg.creativityLevel,
      reasoningEffort: cfg.reasoningEffort,
      aiPersona: cfg.aiPersona,
      captionStyle: cfg.captionStyle,
      responseLength: cfg.responseLength,
      multilingual: cfg.multilingual,
      contentSafety: cfg.contentSafety,
      optimizationGoals: cfg.optimizationGoals,
      autoHashtags: cfg.autoHashtags,
      aiMemory: cfg.aiMemory,
      autoLearning: cfg.autoLearning,
      hasOpenAiKey: !!cfg.openAiKey,
      hasGoogleKey: !!cfg.googleAiStudioKey,
    });
    return {
      aiModel: cfg.aiModel,
      creativityLevel: cfg.creativityLevel,
      // Reasoning effort for GPT-5 (reasoning) models — controls latency vs depth.
      reasoningEffort: cfg.reasoningEffort,
      // Whether to stream Gemini's thinking summary (the "Thinking" panel).
      showThinking: cfg.showThinking,
      optimizationGoals: cfg.optimizationGoals,
      aiPersona: cfg.aiPersona,
      captionStyle: cfg.captionStyle,
      responseLength: cfg.responseLength,
      multilingual: cfg.multilingual,
      contentSafety: cfg.contentSafety,
      // Default to long-term memory unless the user explicitly chose another mode
      // ('short-term' / 'off'), so VeeGPT learns durable facts out of the box.
      aiMemory: cfg.aiMemory || 'long-term',
      autoHashtags: cfg.autoHashtags,
      autoLearning: cfg.autoLearning,
      googleAiStudioKey: cfg.googleAiStudioKey,
      openAiKey: cfg.openAiKey,
    };
  } catch (error: any) {
    vlog('ai-config:error', { workspaceId, error: error?.message });
    console.error(
      '[VEEGPT] Failed to load workspace AI configuration:',
      error?.message
    );
    return {};
  }
}

/**
 * What the user reads when deep research is refused.
 *
 * Every branch names the real reason and what to do about it. A generic "try
 * again later" for a monthly allowance that resets in three weeks would be a lie,
 * and the difference between "your allowance is spent" and "one is already
 * running" is the difference between upgrading and waiting thirty seconds.
 */
function deepResearchRefusalText(err: VGUQuotaError): string {
  switch (err.code) {
    case VGU_ERROR.FEATURE_QUOTA_EXHAUSTED:
      return (
        'You\u2019ve used your Deep Research allowance for this billing period. ' +
        'It resets at the start of your next period, and upgrading raises the limit. ' +
        'I can still run a normal web search on this if that helps.'
      );
    case VGU_ERROR.FEATURE_CONCURRENCY_LIMIT:
      return (
        'A Deep Research job is already running. Deep Research is limited to one at ' +
        'a time because each one makes many provider calls \u2014 wait for that one ' +
        'to finish and ask me again.'
      );
    case VGU_ERROR.MODEL_NOT_IN_PLAN:
    case VGU_ERROR.MODEL_QUOTA_EXHAUSTED:
      return (
        'Deep Research needs a model your plan can\u2019t run right now. ' +
        'Switch to a lighter model in AI Configuration, or upgrade, and I\u2019ll run it.'
      );
    case VGU_ERROR.MONTHLY_QUOTA_EXHAUSTED:
    case VGU_ERROR.SEAT_SHARE_EXHAUSTED:
    case VGU_ERROR.WORKSPACE_POOL_EXHAUSTED:
      return (
        'Deep Research is one of the most expensive things I do, and your VeeGPT ' +
        'allowance for this period is spent. It resets next period; upgrading ' +
        'restores it immediately.'
      );
    case VGU_ERROR.BURST_QUOTA_EXHAUSTED:
      return (
        'You\u2019ve used your short-term VeeGPT capacity, and Deep Research needs a ' +
        'lot of it. Capacity frees up continuously \u2014 try again shortly.'
      );
    default:
      return `I couldn\u2019t start Deep Research: ${err.message}`;
  }
}

// ── Per-request memos ───────────────────────────────────────────────────────
// The VGU gate has to know WHICH model the turn will run on before the handler
// starts, because the model's tier decides the estimate and the tier allowance.
// That selection lives in the workspace's AI configuration, i.e. in the database.
// Reading it twice (once in the middleware, once in the handler) would add a
// query to every chat message, so both share one memoised promise stored on the
// request. Same reads as before, just earlier.

interface VeegptRequestMemo {
  __veegptPrefs?: Promise<FullPreferences>;
  __veegptConv?: Promise<any>;
}

/** The conversation this request targets, loaded at most once. */
function requestConversation(req: any, convId: number): Promise<any> {
  const memo = req as VeegptRequestMemo;
  if (!memo.__veegptConv) {
    // Memoize the executed PROMISE (via .exec()), not the raw Mongoose Query.
    // A Query can only be executed once, so caching the Query object and
    // awaiting it in more than one place (this handler awaits it, as does the
    // AI-preferences resolver) threw "Query was already executed" — which is
    // what broke every follow-up message. A Promise is safe to await repeatedly.
    memo.__veegptConv = ChatConversation.findOne({ id: convId }).exec();
  }
  return memo.__veegptConv;
}

/**
 * "Continue with Fast" (spec §28, §43).
 *
 * When the user's selected model is refused for quota, the server does NOT swap
 * models — it returns MODEL_QUOTA_EXHAUSTED and the client asks. If the user then
 * clicks "Continue with Fast", the client resends the SAME message with
 * `continueWithFast: true`, which is an explicit choice to run on the Light tier.
 * That is not a silent downgrade: the user made the decision.
 *
 * The cheap tier is always `full` access on every plan, so this always clears the
 * tier gate; it may still be refused by the burst/monthly budget, which no model
 * choice can solve.
 */
function wantsFastFallback(req: any): boolean {
  return req?.body?.continueWithFast === true;
}

/** The effective AI configuration for this request, loaded at most once. */
function requestAIPreferences(req: any): Promise<FullPreferences> {
  const memo = req as VeegptRequestMemo;
  if (memo.__veegptPrefs) return memo.__veegptPrefs;
  memo.__veegptPrefs = (async () => {
    const userId = req.user?.id;
    let workspaceId: string | undefined =
      req.body?.workspaceId || req.user?.workspaceId;
    // An existing conversation owns its workspace; use that, exactly as the
    // handler does, so the gate and the run agree on the model.
    const convId = Number(req.params?.conversationId);
    if (Number.isFinite(convId) && convId > 0) {
      const conv = await requestConversation(req, convId);
      if (conv?.workspaceId) workspaceId = conv.workspaceId;
    }
    if (!workspaceId) {
      workspaceId = (await storage.getDefaultWorkspace(userId))?.id;
    }
    const prefs = await getWorkspaceAIPreferences(workspaceId, userId);
    // Explicit "Continue with Fast": override the model for THIS request only.
    // The stored AI Configuration is untouched, so the next message goes back to
    // the user's real selection.
    if (wantsFastFallback(req)) {
      return { ...prefs, aiModel: TIER_DEFAULT_MODEL.cheap };
    }
    return prefs;
  })();
  return memo.__veegptPrefs;
}

/** The model the user selected, for the pre-flight VGU estimate. */
async function requestSelectedModel(req: any): Promise<string | undefined> {
  try {
    return (await requestAIPreferences(req)).aiModel;
  } catch {
    // Unknown beats assuming cheap: an unrecognised model is priced as premium.
    return 'unknown';
  }
}

/**
 * Resolve a canonical workspace id for memory keying. The conversation's stored
 * workspaceId may be a synthetic id (e.g. "ws_xxxx") that doesn't resolve; in
 * that case we fall back to the user's default workspace. This keeps cross-chat
 * memory consistently keyed whether it's written from chat or read from
 * Settings (which passes the real workspace id).
 */
async function resolveMemoryWorkspaceId(
  workspaceId?: string,
  userId?: string
): Promise<string | undefined> {
  try {
    if (workspaceId) {
      const ws = await storage.getWorkspace(workspaceId);
      if (ws) return (ws as any).id?.toString() || workspaceId;
    }
    if (userId) {
      // The stored id didn't resolve (synthetic "ws_xxxx"). Prefer the user's
      // workspace that actually has connected social accounts (so VeeGPT sees
      // real data), otherwise fall back to the default workspace.
      try {
        const workspaces = await storage.getWorkspacesByUserId(userId);
        for (const ws of workspaces || []) {
          const wsId = (ws as any).id?.toString();
          if (!wsId) continue;
          const accounts = await storage
            .getSocialAccountsByWorkspace(wsId)
            .catch(() => []);
          if (accounts && accounts.length > 0) {
            vlog('memory:workspace-with-accounts', {
              wsId,
              accountCount: accounts.length,
            });
            return wsId;
          }
        }
      } catch (e: any) {
        vlog('memory:resolve-accounts-error', { error: e?.message });
      }
      const def = await storage.getDefaultWorkspace(userId);
      if (def) return (def as any).id?.toString();
    }
  } catch (err: any) {
    vlog('user-memory:resolve-workspace-error', {
      workspaceId,
      userId,
      error: err?.message,
    });
  }
  return workspaceId;
}

/** Map the responseLength setting to a concrete length instruction. */
function responseLengthDirective(responseLength?: string): string {
  switch ((responseLength || '').toLowerCase()) {
    case 'short':
      return 'Default to concise replies (a few sentences), but still fully answer the question. Expand only if the question genuinely needs it.';
    case 'long':
      return 'Give thorough, in-depth answers: cover the topic comprehensively with structure, concrete examples, trade-offs and actionable steps. There is no upper limit — length should be driven by the question.';
    case 'medium':
    default:
      return 'There is NO fixed answer size — the question decides. Keep simple questions short and direct (1-3 sentences). For complex, open-ended or "how/why/explain/compare/plan" questions, write a complete, well-structured, in-depth answer and let it run as long as the topic genuinely needs. Never cut a complex answer short to keep it brief.';
  }
}

/**
 * Optimized context-assembly path (spec: veegpt-context-optimization, task 5.4).
 *
 * This is the sole context-assembly path: it derives the request's capability
 * intent (`classifyIntent`), selects the `Context_Module`s that intent needs
 * (`selectModules`), and assembles the final prompt (`compose`).
 *
 * Tool-context content (posts-with-ids, posting context, account-scope hint,
 * forced-tool directive, tier-capability notes) is already assembled by the
 * route handler into `toolContext`. Those five modules are therefore EXCLUDED
 * from the composed body and the pre-built `toolContext` is appended verbatim
 * so that content is never duplicated.
 *
 * DEVELOPER-RETRIEVABLE TELEMETRY (spec: task 12.2, Req 16.3/16.4). `compose`
 * builds a privacy-safe `Token_Telemetry` record for the composed request; this
 * function emits it through the EXISTING observability path via
 * `recordTokenTelemetry` (a metadata-only debug log + the ledger-`meta` payload
 * it returns). That makes the composition decision — which `Context_Module`s
 * were selected, which tools were exposed, whether compaction/memory/caching
 * occurred, whether a fallback was taken, and which model/provider was used —
 * retrievable by a developer WITHOUT ever logging full prompts or user content
 * (Req 16.4). Emission is best-effort and never throws.
 *
 * DB-free: it reads only its arguments and the module render outputs, and its
 * only side effect is the best-effort telemetry log above. It never throws for
 * expected-empty inputs; any unexpected error propagates to the handler's outer
 * try/catch, which surfaces a clean error event to the client.
 */
function composeWithComposer(args: {
  history: Array<{ role: string; content: string }>;
  prefs: FullPreferences;
  memorySummary?: string;
  userMemoryProfile?: string;
  workspaceContext?: string;
  memoryNote?: string;
  toolContext?: string;
  tools?: ChatTool[];
  tier: VeeGPTTier;
  selectedAgentId?: string | null;
  forcedTool?: string;
  selectedAccountId?: string | null;
  hasMedia: boolean;
  /**
   * A rendered manifest of the images available in this conversation (uploaded
   * / generated / edited), so the LLM is AWARE of the media and can choose which
   * to act on per the user's intent. Appended verbatim as developer-trust
   * context. Empty when the conversation has no media.
   */
  mediaContext?: string;
  /** The model selected for this turn (recorded in telemetry — Req 16.3). */
  model?: string;
  /** The provider selected for this turn (recorded in telemetry — Req 16.3). */
  provider?: string;
  /** Privacy-safe request identifiers for the telemetry log (never content). */
  telemetryCtx?: { userId?: string; workspaceId?: string; requestId?: string };
}): string {
  const historyArr = Array.isArray(args.history) ? args.history : [];

  // The current user message is the last turn of the transcript; classify from
  // it plus the prior turns. If the last turn is (unexpectedly) an assistant
  // message, treat the whole array as prior history and the current message as
  // empty rather than misattributing it.
  const lastIdx = historyArr.length - 1;
  const last = lastIdx >= 0 ? historyArr[lastIdx] : undefined;
  const hasCurrent = !!last && last.role !== 'assistant';
  const currentMessage = hasCurrent ? last!.content ?? '' : '';
  const priorMessages = (hasCurrent
    ? historyArr.slice(0, lastIdx)
    : historyArr) as unknown as Msg[];

  const tier: VeeGPTTier = args.tier ?? 'advanced';

  const input: ComposeInput = {
    prefs: args.prefs as unknown as PromptPreferences,
    // The persona module re-resolves tier gating from the id via
    // `getAgentDirectivesForTier(selectedAgentId, tier)`, producing the same
    // outcome as the legacy `agentBlock` (Req 10).
    selectedAgentId: args.selectedAgentId ?? null,
    history: priorMessages,
    currentMessage,
    memorySummary: args.memorySummary,
    userMemoryProfile: args.userMemoryProfile,
    workspaceContext: args.workspaceContext,
    memoryNote: args.memoryNote,
    tier,
  };

  const intent = classifyIntent({
    message: currentMessage,
    priorMessages,
    hasMedia: args.hasMedia,
    forcedTool: args.forcedTool,
    selectedAccountId: args.selectedAccountId,
  });

  // The tool-context modules are supplied verbatim by the pre-built
  // `toolContext` string, so exclude them from the composed body to avoid
  // emitting that content twice.
  const TOOL_CONTEXT_MODULE_IDS = new Set<string>([
    'content-ids',
    'posting-context',
    'account-scope',
    'forced-tool',
    'tier-capability',
  ]);
  const modules = selectModules(intent, input).filter(
    m => !TOOL_CONTEXT_MODULE_IDS.has(m.id)
  );

  const composed = compose(modules, args.tools ?? [], input, {
    usedFallback: intent.usedFallback,
    // Metadata recorded in Token_Telemetry so a developer can see which model
    // answered and how the request was classified (Req 16.2/16.3). None of
    // these are prompt or user content.
    model: args.model,
    provider: args.provider,
    requestType: intent.intents[0] ?? 'chat',
    // Memory was retrieved for this turn iff a memory scope contributed content.
    memoryRetrieved: Boolean(args.userMemoryProfile || args.memorySummary),
  });

  // Developer-retrievable telemetry surface (task 12.2, Req 16.3/16.4): emit the
  // composed request's privacy-safe telemetry through the existing observability
  // path. `recordTokenTelemetry` logs ONLY counts + selection metadata (selected
  // modules, exposed tools, compaction/memory/cache/fallback flags, model) and
  // NEVER the prompt or user content, and never throws.
  recordTokenTelemetry(composed.telemetry, args.telemetryCtx);

  // Attach the pre-built tool-context block (posts-with-ids, account-scope hint,
  // posting/tier notes) ONLY when the turn is actually about the user's account
  // or content — or when a tool was explicitly forced, or intent failed open.
  // For pure chat / conceptual / content-writing / research / memory-only turns
  // this block is irrelevant noise, so dropping it removes ~1k+ input tokens
  // from those requests. Nothing is lost: when a turn unexpectedly needs live
  // workspace data the model still fetches it on demand via get_workspace_data.
  const ACCOUNT_RELEVANT_INTENTS = [
    'workspace_data',
    'account_data',
    'analytics',
    'posting',
    'edit_content',
  ];
  const toolContextRelevant =
    intent.usedFallback ||
    intent.ambiguous ||
    Boolean(args.forcedTool) ||
    intent.intents.some(c => ACCOUNT_RELEVANT_INTENTS.includes(c as string));
  const toolContext =
    toolContextRelevant && args.toolContext && args.toolContext.trim()
      ? args.toolContext.trim()
      : '';
  // The conversation-media manifest makes the LLM aware of every image it can
  // act on (so "edit it, then schedule it" targets the edited image, and the
  // user can also ask for a specific earlier one). Included whenever media
  // exists — media awareness is relevant beyond account/posting intents.
  const mediaContext =
    args.mediaContext && args.mediaContext.trim() ? args.mediaContext.trim() : '';
  const finalPrompt =
    composed.prompt +
    (toolContext ? `\n\n${toolContext}` : '') +
    (mediaContext ? `\n\n${mediaContext}` : '');

  // Verification aid (off unless VEEGPT_CTX_DEBUG=true): persist WHAT the
  // composer built for this turn — detected intent, selected modules, exposed
  // tools, the per-category token breakdown, and the exact composed-prompt size
  // — so it can be read from a file instead of racing past in the console. This
  // is the "compose" half; `recordAIUsage` writes the matching "usage" half with
  // the real provider token counts. Self-guarded; never affects the request.
  if (ctxDebugEnabled()) {
    const t = composed.telemetry;
    appendCtxDebug({
      kind: 'compose',
      requestId: args.telemetryCtx?.requestId,
      userId: args.telemetryCtx?.userId,
      workspaceId: args.telemetryCtx?.workspaceId,
      model: args.model,
      tier,
      intent: {
        capabilities: intent.intents,
        ambiguous: intent.ambiguous,
        usedFallback: intent.usedFallback,
      },
      selectedModuleIds: composed.selectedModuleIds,
      selectedModuleCount: composed.selectedModuleIds.length,
      exposedTools: t.exposedTools,
      exposedToolCount: t.exposedTools.length,
      perCategoryTokens: t.perCategoryTokens,
      estimatedInputTokens: t.totalInputTokens,
      composedPromptChars: finalPrompt.length,
      toolContextIncluded: toolContextRelevant,
      toolContextChars: toolContext.length,
      toolContextAvailableChars: (args.toolContext ?? '').length,
      message: ctxDebugTextEnabled() ? preview(currentMessage) : undefined,
    });
  }

  return finalPrompt;
}

/** Write one newline-delimited JSON event to the streaming HTTP response. */
function writeEvent(res: Response, event: Record<string, unknown>): void {
  try {
    res.write(JSON.stringify(event) + '\n');
  } catch (_) {
    /* response already closed */
  }
}

/**
 * Build a compact list of the user's scheduled + draft posts (WITH their ids)
 * to inject into the tool context. This is what lets the model resolve a
 * reference like "the first scheduled post" or "my draft about X" to a real
 * contentId and call reschedule_post / cancel_scheduled_post / update_post_caption
 * IN ONE PASS (no second round-trip). Read-only; ids are opaque.
 */
async function buildContentContext(workspaceId?: string): Promise<string> {
  if (!workspaceId) return '';
  try {
    const [scheduled, all] = await Promise.all([
      storage.getScheduledContent(workspaceId).catch(() => []),
      storage.getContentByWorkspace(workspaceId, 50).catch(() => []),
    ]);
    const drafts = ((all as any[]) || [])
      .filter(c => (c.status || 'draft') === 'draft')
      .slice(0, 15);
    const sched = ((scheduled as any[]) || []).slice(0, 15);
    if (!sched.length && !drafts.length) return '';
    const fmt = (c: any, i: number) => {
      const id = (c.id || c._id)?.toString();
      const when = c.scheduledAt
        ? new Date(c.scheduledAt).toLocaleString()
        : '';
      const cap = (c.description || c.contentData?.text || c.title || '')
        .toString()
        .slice(0, 60);
      return `  ${i + 1}. id="${id}" ${c.type || 'post'}${when ? ` @ ${when}` : ''}${cap ? ` — "${cap}"` : ''}`;
    };
    const lines: string[] = [
      "--- The user's current posts (FOR INTERNAL ID LOOKUP ONLY — do NOT list these in prose) ---",
    ];
    if (sched.length) {
      lines.push(`Scheduled (${sched.length}):`);
      sched.forEach((c, i) => lines.push(fmt(c, i)));
    }
    if (drafts.length) {
      lines.push(`Drafts (${drafts.length}):`);
      drafts.forEach((c, i) => lines.push(fmt(c, i)));
    }
    lines.push(
      'When the user refers to a post by position ("the first one"), recency, time, or topic, map it to the matching id above and pass that contentId to the edit tool.'
    );
    lines.push(
      'CRITICAL: This list is ONLY so you can resolve ids. Whenever the user asks to SEE, LIST, SHOW, or COUNT their posts/scheduled/drafts/published ("how many posts are scheduled", "what\u2019s scheduled", "show my drafts"), you MUST call get_workspace_data so the posts render as visual CARDS — do NOT answer by listing the posts in text from this context. When you call get_workspace_data or any edit tool, output NO prose at all (only the tool call); the system shows the cards and a summary automatically.'
    );
    return lines.join('\n');
  } catch {
    return '';
  }
}

/**
 * Strip any leaked raw tool-call syntax from assistant prose. When a model can't
 * emit a real function call (e.g. a non-tool fallback model), it sometimes
 * writes the call as TEXT — "[schedule_post(accountId=..., schedule=True)]" or a
 * bare JSON blob — which is risky to show (looks like an action happened, leaks
 * internal tool names/ids). This removes those artifacts so the user only ever
 * sees clean prose; the REAL action only happens via an actual tool call.
 */
function stripLeakedToolSyntax(text: string): string {
  if (!text) return text;
  let out = text;
  // [tool_name(...)] or tool_name(...) for any known tool, across newlines.
  out = out.replace(
    /\[?\b(schedule_post|remember_fact|get_workspace_data|reschedule_post|cancel_scheduled_post|update_post_caption|update_memory|forget_memory|delete_post|duplicate_post|generate_caption|generate_hashtags|generate_document|generate_image|edit_image|get_analytics_insight|get_best_posting_time|research_trends|search_web|deep_research)\s*\([\s\S]*?\)\]?/gi,
    ''
  );
  // A standalone JSON object that mentions a tool field (best-effort, single line).
  out = out.replace(
    /\{[^{}]*\b(accountId|scheduledLocal|generateCaption|"fact"|contentId|resource)\b[^{}]*\}/gi,
    ''
  );
  // Collapse the blank lines the removal may leave behind.
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

/**
 * Recover tool call(s) that a non-tool-capable model wrote as TEXT instead of
 * real function calls, e.g.:
 *   reschedule_post(contentId="abc", scheduledLocal="2026-06-29T21:00:00")
 *   update_post_caption(contentId="x", caption="hi")
 * Returns ALL recognizable tool calls found (multi-tool), or [] if none.
 */
function recoverLeakedToolCalls(
  text: string
): Array<{ name: string; args: Record<string, unknown> }> {
  if (!text) return [];
  const known = [
    'schedule_post',
    'reschedule_post',
    'cancel_scheduled_post',
    'update_post_caption',
    'get_workspace_data',
    'remember_fact',
    'update_memory',
    'forget_memory',
    'delete_post',
    'duplicate_post',
    'generate_caption',
    'generate_hashtags',
    'generate_document',
    'generate_image',
    'edit_image',
    'get_analytics_insight',
    'get_best_posting_time',
    'research_trends',
    'search_web',
    'deep_research',
  ];
  const found: Array<{ name: string; args: Record<string, unknown> }> = [];
  for (const name of known) {
    // Find EVERY occurrence of this tool name being called as text.
    const re = new RegExp(`\\b${name}\\s*\\(([\\s\\S]*?)\\)`, 'gi');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const inner = (m[1] || '').trim();
      const jsonMatch = /\{[\s\S]*\}/.exec(inner);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed && typeof parsed === 'object') {
            found.push({ name, args: parsed as Record<string, unknown> });
            continue;
          }
        } catch {
          /* fall through to kv parse */
        }
      }
      const args: Record<string, unknown> = {};
      const kv =
        /([a-zA-Z_]+)\s*=\s*("([^"]*)"|'([^']*)'|true|false|\d+(?:\.\d+)?)/g;
      let k: RegExpExecArray | null;
      while ((k = kv.exec(inner)) !== null) {
        const key = k[1];
        const raw = k[2];
        let val: unknown;
        if (raw === 'true') val = true;
        else if (raw === 'false') val = false;
        else if (/^["']/.test(raw)) val = k[3] ?? k[4] ?? '';
        else if (/^\d/.test(raw)) val = Number(raw);
        else val = raw;
        args[key] = val;
      }
      if (Object.keys(args).length) found.push({ name, args });
      else if (name === 'get_workspace_data')
        found.push({ name, args: { resource: 'scheduled_posts' } });
    }
  }
  return found;
}

/**
 * Build the situational context the chat model needs to fill a `schedule_post`
 * tool call correctly: the user's CURRENT local time (so "tomorrow 5pm" resolves
 * to the right absolute date — without this the model guesses a stale date from
 * its training data), the connected accounts it may post to, and whether media
 * is attached. Also gives the model explicit guidance on when NOT to call the
 * tool (e.g. no media yet → ask the user for it in plain text).
 */
function buildToolContext(
  accounts: any[],
  localNow?: string,
  timezone?: string,
  hasMedia = false
): string {
  const accountList = (accounts || []).map((a: any) => ({
    id: (a.id || a._id || a.accountId)?.toString(),
    username: a.username,
    platform: a.platform || 'instagram',
  }));
  const now =
    localNow && String(localNow).trim()
      ? String(localNow)
      : new Date().toISOString();
  const lines: string[] = [];
  lines.push('--- Posting context (for the schedule_post tool) ---');
  lines.push(
    `Current local date-time: "${now}"${timezone ? ` (timezone ${timezone})` : ''}. Resolve all relative times (e.g. "tomorrow", "tonight", "5pm") against THIS, never against any other date.`
  );
  lines.push(
    `Connected accounts (${accountList.length}): ${JSON.stringify(accountList)}.`
  );
  if (accountList.length === 1)
    lines.push(
      `Only one account is connected — use accountId "${accountList[0].id}" automatically; do not ask which account.`
    );
  lines.push(`Media attached to this message: ${hasMedia ? 'YES' : 'NO'}.`);
  if (hasMedia) {
    lines.push(
      'The user has attached media for a post. When their message indicates they want to publish or schedule it ' +
        '(e.g. "post this", "schedule my reel", "share this tomorrow 5pm", or they previously asked to post and are now ' +
        'providing the media/time), you MUST call schedule_post — do not just reply in text. ' +
        'Use type "reel" for a video unless the user says story. If the time is unclear, still call schedule_post with ' +
        'schedule=true and scheduledLocal=null (the system will ask the user for the time); if they want it live now, use schedule=false.'
    );
  } else {
    lines.push(
      'No media is attached to this message. ' +
        'When the user is asking to PUBLISH or SCHEDULE a post — including time-only requests like "schedule my post tomorrow at 1pm", "post this at 12am", "publish now" — you MUST call schedule_post (set schedule=true with the given scheduledLocal, or schedule=false for now). The system will then ask the user to attach the image/video. ' +
        'This is an ACTION/TASK: do NOT memorize it with remember_fact, do NOT invent a recurring posting habit from a one-off request, and do NOT just chat about it. ' +
        'For ordinary chat, questions, ideas, or durable statements (e.g. "my brand color is blue"), reply normally and do NOT call schedule_post.'
    );
  }
  return lines.join('\n');
}

/**
 * Build the "selected account" scope hint for the tool context. Returned only
 * when the user picked a valid account in the composer. It tells the model which
 * account is in focus and that it must fetch that account's data on demand via
 * get_account_details (never guess), while NOT calling it for turns that don't
 * need account data.
 */
function buildAccountScopeHint(
  accounts: any[],
  selectedAccountId: string
): string {
  if (!accounts?.length) return '';
  const list = accounts
    .map((a: any) => `@${a.username} (${a.platform})`)
    .join(', ');
  const common =
    'Be SELECTIVE: pass only the metrics the question needs (e.g. metrics ["followers"] for "how many followers"; ["reach","engagement"] with a timeframe for a period question). Use metrics ["all"] only when the user wants the full/overall analytics. You can request a time range (timeframe/days) — it is auto-capped to the user\'s subscription plan; if it gets capped, say so and note that upgrading unlocks a longer history. ' +
    'Do NOT call get_account_details for greetings, general how-to/strategy questions, or brainstorming.';

  const acct = selectedAccountId
    ? accounts.find(
        (a: any) =>
          String(a.id || a._id || a.accountId) === String(selectedAccountId)
      )
    : null;

  if (acct) {
    const handle = acct.username ? `@${acct.username}` : 'their account';
    const platform = acct.platform || 'instagram';
    return [
      '--- Selected account (conversation focus) ---',
      `The user has SELECTED their ${platform} account ${handle} (id: ${selectedAccountId}) as the focus of this conversation.`,
      'When they say "my account", or ask about followers, following, engagement, reach, impressions, likes, comments, shares, saves, views, growth, audience/demographics, top posts, or performance over any time period, they mean THIS account.',
      "You do NOT have this account's analytics in the prompt — call get_account_details to fetch the LIVE numbers (same data as their dashboard) BEFORE answering. Never guess or invent numbers.",
      common,
    ].join('\n');
  }

  // No specific account selected → "All accounts" mode (workspace-wide analytics).
  return [
    '--- Analytics access (all connected accounts) ---',
    `The user has NOT selected a specific account (the composer shows "All accounts"). Connected accounts: ${list}.`,
    'When they ask about followers, engagement, reach, impressions, likes, comments, shares, saves, views, growth, audience/demographics, top posts, or performance over any period — for their account(s) or overall — call get_account_details to fetch the LIVE numbers (same data as their dashboard). With no account named it returns workspace-wide/combined analytics; pass a `username` to scope to one connected account. Never guess or invent numbers.',
    common,
  ].join('\n');
}

/** Tools the user may explicitly force-run from the composer "+" → Tools menu. */
const FORCEABLE_TOOLS = new Set<string>([
  'search_web',
  'research_trends',
  'deep_research',
  'get_account_details',
  'get_analytics_insight',
  'get_best_posting_time',
  'generate_caption',
  'generate_hashtags',
  'caption_and_hashtags',
  'get_workspace_data',
]);

/**
 * When the user explicitly selected a tool in the composer, build a directive
 * that forces the model to run exactly that tool this turn (using their message
 * as the input). Returns '' for an unknown/empty selection.
 */
function buildForcedToolDirective(
  forcedTool: string,
  tier: VeeGPTTier = 'advanced'
): string {
  if (!forcedTool || !FORCEABLE_TOOLS.has(forcedTool)) return '';
  // Tier gate: the composite "caption_and_hashtags" maps to generate_caption /
  // generate_hashtags (both Basic). Any other forced tool must be allowed for
  // the user's tier — otherwise tell the model to explain the upgrade instead
  // of pretending to run a tool that isn't available.
  if (
    forcedTool !== 'caption_and_hashtags' &&
    !isToolAllowedForTier(forcedTool, tier)
  ) {
    const minTier = TIER_MIN_PLAN[TOOL_MIN_TIER[forcedTool] ?? 'advanced'];
    return [
      '--- Requested tool is not available on this plan ---',
      `The user tried to run "${forcedTool}", but their current plan doesn't include it. Do NOT attempt to run it or fabricate its output.`,
      `Briefly tell them this capability is available on the ${minTier} plan and above, and offer what you CAN do instead.`,
    ].join('\n');
  }
  // Combined caption/hashtags tool → let the model pick caption, hashtags, or both.
  if (forcedTool === 'caption_and_hashtags') {
    return [
      '--- Tool explicitly selected by the user: "Caption & hashtags" (RUN IT NOW) ---',
      "Based on the user's message, call the right tool(s) this turn, using their message as the topic:",
      '- If they want a caption (or ask for "both", or don\'t specify which), call generate_caption.',
      '- If they want hashtags (or ask for "both"), call generate_hashtags.',
      '- If they clearly want ONLY one of the two, call only that one.',
      'When they want both, emit BOTH tool calls in this turn. Do not ask for confirmation — run the tool(s) now.',
    ].join('\n');
  }
  return [
    '--- Tool explicitly selected by the user (RUN IT NOW) ---',
    `The user tapped the "${forcedTool}" tool for THIS message. You MUST call ${forcedTool} this turn, using their message as the input (query/topic/etc.).`,
    'Do not ask for confirmation and do not answer from memory instead — run the tool now. You may still call other tools too if the message clearly needs them.',
  ].join('\n');
}

/**
 * Plan-capability context for VeeGPT. Tells the model exactly which actions are
 * NOT available on the user's current tier and which plan unlocks each — so it
 * NEVER silently plays along (asking for details / running a substitute tool)
 * when a user requests a capability their plan doesn't include. It states this
 * clearly and points them to upgrade, while offering the allowed alternative.
 *
 * Returns '' for the advanced tier (everything available → no restriction note).
 */
function buildTierCapabilityContext(tier: VeeGPTTier): string {
  if (tier === 'advanced') return '';

  const locked: string[] = [];
  if (tier === 'basic') {
    locked.push(
      '- Scheduling, publishing, or editing posts FROM CHAT (schedule / reschedule / cancel / delete / duplicate a post) → requires the Creator plan.',
      '- Live web search and trend research → requires the Creator plan.',
      '- On-demand account analytics (followers, reach, engagement, impressions, top posts, audience) → requires the Creator plan.',
      '- Growth recommendations and performance insights → requires the Creator plan.',
      '- Deep, multi-source research reports → requires the Pro plan.'
    );
  } else if (tier === 'full') {
    locked.push(
      '- Deep, multi-source research reports → requires the Pro plan.'
    );
  }

  const canDo =
    tier === 'basic'
      ? 'hold normal conversations, remember facts about them, read their workspace data (scheduled/draft/published posts and counts), generate captions and hashtags, and tell them their best time to post'
      : 'everything in Basic plus schedule/edit posts from chat, web & trend research, account analytics, and growth recommendations';

  return [
    `--- VeeGPT plan capabilities (the user's current VeeGPT tier is "${tier}") ---`,
    'The user is on a plan with LIMITED VeeGPT capabilities. These actions are NOT available to them right now:',
    ...locked,
    'RULE: If the user asks for any capability listed above, do NOT ask them for details, do NOT gather information, and do NOT run a different tool as a stand-in. Instead, in ONE short reply: (1) tell them honestly that this capability isn\u2019t on their current plan, (2) name the plan that unlocks it and point them to Plan / Billing to upgrade, and (3) offer what you CAN do for them on their current plan.',
    'Special case — scheduling/publishing: on their current plan you cannot schedule or publish from chat, but they CAN still create and schedule a post manually from the Create page. Mention that as the no-cost alternative, alongside the upgrade option.',
    `On their current plan you CAN still: ${canDo}.`,
  ].join('\n');
}

/**
 * Normalize a raw `schedule_post` tool-call argument object into the `plan`
 * shape the confirm card + /post-agent/execute already understand. Light,
 * deterministic shaping only (defaults + types); account auto-pick and the
 * past-time guard are applied at confirm/execute time where workspace + the
 * user's local clock are available.
 */
function normalizeSchedulePlan(args: Record<string, unknown>): any {
  const a = args || {};
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map(x => String(x)).filter(Boolean) : [];
  return {
    type: ['post', 'reel', 'story'].includes(String(a.type))
      ? String(a.type)
      : 'post',
    accountId: a.accountId ? String(a.accountId) : '',
    caption: typeof a.caption === 'string' ? a.caption : '',
    generateCaption: a.generateCaption === true,
    generateHashtags: a.generateHashtags === true,
    hashtags: arr(a.hashtags),
    mentions: arr(a.mentions),
    collaborators: arr(a.collaborators),
    schedule: a.schedule === true,
    scheduledLocal:
      typeof a.scheduledLocal === 'string' && a.scheduledLocal.trim()
        ? a.scheduledLocal
        : null,
    summary: typeof a.summary === 'string' ? a.summary : '',
    // 1-based index into the conversation's media manifest (1 = most recent),
    // set by the model when the user asks for a SPECIFIC earlier image rather
    // than the default (most recent). Omitted/0 → use the default resolution.
    mediaOrdinal:
      Number.isFinite(Number(a.mediaOrdinal)) && Number(a.mediaOrdinal) > 0
        ? Math.floor(Number(a.mediaOrdinal))
        : undefined,
  };
}

/**
 * Validate a schedule plan against the user's local clock. Returns an "ask"
 * message string when the plan can't proceed (no time given, or a past time),
 * or null when the plan is good to confirm. Pure/deterministic — the same guards
 * the legacy post-agent applied, now reused on the tool-calling path.
 */
function validateSchedulePlan(plan: any, localNow?: string): string | null {
  if (!plan?.schedule) return null; // post-now needs no time check
  if (!plan.scheduledLocal) {
    return 'Sure — what date and time should I schedule it for? (For example, "today 7 PM" or "tomorrow 10 AM".)';
  }
  const parseLocal = (s: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(s));
    if (!m) return null;
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]),
      Number(m[5])
    );
  };
  const scheduled = parseLocal(plan.scheduledLocal);
  const now = parseLocal(localNow || '') || new Date();
  if (scheduled && scheduled.getTime() <= now.getTime() + 60 * 1000) {
    const when = scheduled.toLocaleString([], {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    return `${when} has already passed. Want me to schedule it for that time tomorrow, pick another time, or post it now?`;
  }
  return null;
}

/** Parse a "YYYY-MM-DDTHH:mm" LOCAL string to a Date (server local time). */
function parseLocalDateTime(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(s));
  if (!m) return null;
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5])
  );
}

/** Compact a content doc to the fields the model needs to answer/edit. */
function summarizeContentForTool(c: any): Record<string, unknown> {
  const cd = c.contentData || {};
  const mediaUrls: string[] = Array.isArray(cd.mediaUrls)
    ? cd.mediaUrls.filter((u: any) => typeof u === 'string' && u)
    : [];
  const hashtags: string[] = Array.isArray(cd.hashtags)
    ? cd.hashtags
    : Array.isArray(c.hashtags)
      ? c.hashtags
      : [];
  const mentions: string[] = Array.isArray(cd.mentions)
    ? cd.mentions
    : Array.isArray(c.mentions)
      ? c.mentions
      : [];
  const collaborators: string[] = Array.isArray(cd.collaborators)
    ? cd.collaborators
    : Array.isArray(c.collaborators)
      ? c.collaborators
      : [];
  return {
    id: (c.id || c._id)?.toString(),
    title: c.title || undefined,
    type: c.type || undefined,
    platform: c.platform || undefined,
    status: c.status || undefined,
    caption:
      typeof c.description === 'string' && c.description
        ? c.description
        : cd.text
          ? String(cd.text)
          : undefined,
    hashtags: hashtags.length
      ? hashtags.map(h => String(h).replace(/^#+/, ''))
      : undefined,
    mentions: mentions.length
      ? mentions.map(m => String(m).replace(/^@+/, ''))
      : undefined,
    collaborators: collaborators.length
      ? collaborators.map(m => String(m).replace(/^@+/, ''))
      : undefined,
    mediaUrls: mediaUrls.length ? mediaUrls : undefined,
    scheduledAt: c.scheduledAt
      ? new Date(c.scheduledAt).toISOString()
      : undefined,
    publishedAt: c.publishedAt
      ? new Date(c.publishedAt).toISOString()
      : undefined,
  };
}

/**
 * Build the result of a read-only `get_workspace_data` call: a structured list
 * card (when the resource is a list of posts) plus a short text summary the model
 * can paraphrase. Strictly read-only and workspace-scoped. Never throws.
 */
async function buildDataResult(
  workspaceId: string | undefined,
  args: Record<string, unknown>
): Promise<{ listCard: any | null; summaryText: string; items?: any[] }> {
  if (!workspaceId)
    return { listCard: null, summaryText: 'No workspace in context.' };
  const resource = String(args?.resource || 'overview');
  const limit = Math.max(1, Math.min(Number(args?.limit) || 20, 50));
  const titles: Record<string, string> = {
    scheduled_posts: 'Scheduled posts',
    published_posts: 'Published posts',
    draft_posts: 'Drafts',
    recent_content: 'Recent content',
  };
  try {
    if (
      [
        'scheduled_posts',
        'published_posts',
        'draft_posts',
        'recent_content',
      ].includes(resource)
    ) {
      let items: any[];
      if (resource === 'scheduled_posts') {
        items =
          (await storage.getScheduledContent(workspaceId).catch(() => [])) ||
          [];
      } else {
        const all =
          (await storage
            .getContentByWorkspace(workspaceId, 100)
            .catch(() => [])) || [];
        const wanted =
          resource === 'published_posts'
            ? 'published'
            : resource === 'draft_posts'
              ? 'draft'
              : null;
        items = wanted
          ? all.filter((c: any) => (c.status || 'draft') === wanted)
          : all;
      }
      const summarized = items.slice(0, limit).map(summarizeContentForTool);
      const listCard = summarized.length
        ? {
            kind: resource,
            title: titles[resource] || 'Posts',
            items: summarized,
          }
        : null;
      const label = (titles[resource] || 'items').toLowerCase();
      const summaryText = items.length
        ? `You have ${items.length} ${label === 'recent content' ? 'recent item(s)' : label} — here ${items.length === 1 ? 'it is' : 'they are'}:`
        : `You don\u2019t have any ${label} right now.`;
      return { listCard, summaryText, items: summarized };
    }
    if (resource === 'content_summary') {
      const all =
        (await storage
          .getContentByWorkspace(workspaceId, 500)
          .catch(() => [])) || [];
      const counts: Record<string, number> = {};
      for (const c of all as any[]) {
        const s = c.status || 'draft';
        counts[s] = (counts[s] || 0) + 1;
      }
      return {
        listCard: null,
        summaryText: `Content totals — total ${all.length}; ${
          Object.entries(counts)
            .map(([k, v]) => `${v} ${k}`)
            .join(', ') || 'none'
        }.`,
      };
    }
    if (resource === 'accounts') {
      const accts =
        (await storage
          .getSocialAccountsByWorkspace(workspaceId)
          .catch(() => [])) || [];
      const text = accts.length
        ? accts
            .map(
              (a: any) =>
                `${a.platform} @${a.username}: ${a.followersCount ?? '?'} followers, ${a.mediaCount ?? '?'} posts, ${a.engagementRate ?? '?'}% engagement`
            )
            .join('; ')
        : 'No connected accounts.';
      return { listCard: null, summaryText: `Accounts — ${text}` };
    }
    // overview
    const [scheduled, all, accts] = await Promise.all([
      storage.getScheduledContent(workspaceId).catch(() => []),
      storage.getContentByWorkspace(workspaceId, 500).catch(() => []),
      storage.getSocialAccountsByWorkspace(workspaceId).catch(() => []),
    ]);
    const counts: Record<string, number> = {};
    for (const c of (all as any[]) || []) {
      const s = c.status || 'draft';
      counts[s] = (counts[s] || 0) + 1;
    }
    const scheduledItems = ((scheduled as any[]) || [])
      .slice(0, limit)
      .map(summarizeContentForTool);
    const listCard = scheduledItems.length
      ? {
          kind: 'scheduled_posts',
          title: 'Scheduled posts',
          items: scheduledItems,
        }
      : null;
    const summaryText = `Overview — ${(scheduled as any[])?.length || 0} scheduled; content totals: ${
      Object.entries(counts)
        .map(([k, v]) => `${v} ${k}`)
        .join(', ') || 'none'
    }; ${((accts as any[]) || []).length} connected account(s).`;
    return { listCard, summaryText, items: scheduledItems };
  } catch (err: any) {
    return {
      listCard: null,
      summaryText: `Could not load workspace data: ${err?.message || 'unknown error'}.`,
    };
  }
}

/**
 * Build an EDIT CONFIRMATION card for a proposed change (reschedule/cancel/
 * update caption) WITHOUT applying it. Verifies the content belongs to the
 * workspace and computes the current vs proposed values for the user to review.
 * The mutation runs later on confirm. Never throws.
 */
async function buildEditCard(
  workspaceId: string | undefined,
  name: string,
  args: Record<string, unknown>,
  localNow?: string
): Promise<{ card?: any; intro?: string; error?: string }> {
  if (!workspaceId) return { error: 'No workspace in context.' };
  const contentId = String(args?.contentId || '').trim();
  if (!contentId)
    return { error: 'I couldn\u2019t identify which post to edit.' };
  const existing: any = await storage
    .getContent(contentId)
    .catch(() => undefined);
  if (!existing || String(existing.workspaceId) !== String(workspaceId)) {
    return { error: 'That post wasn\u2019t found in your workspace.' };
  }
  const currentCaption =
    existing.description || existing.contentData?.text || '';
  const title = existing.title || existing.type || 'post';
  const currentPost = summarizeContentForTool(existing);
  if (name === 'reschedule_post') {
    const when = parseLocalDateTime(String(args?.scheduledLocal || ''));
    if (!when) return { error: 'What new date and time should I move it to?' };
    const now = parseLocalDateTime(localNow || '') || new Date();
    if (when.getTime() <= now.getTime() + 60 * 1000) {
      return {
        error: `${when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} is in the past — please pick a future time.`,
      };
    }
    return {
      intro: 'Review this reschedule and confirm:',
      card: {
        action: 'reschedule_post',
        contentId,
        title,
        post: currentPost,
        current: {
          scheduledAt: existing.scheduledAt
            ? new Date(existing.scheduledAt).toISOString()
            : null,
        },
        proposed: { scheduledLocal: String(args?.scheduledLocal) },
        status: 'idle',
      },
    };
  }
  if (name === 'cancel_scheduled_post') {
    return {
      intro: 'Confirm cancelling this scheduled post:',
      card: {
        action: 'cancel_scheduled_post',
        contentId,
        title,
        post: currentPost,
        current: {
          status: existing.status,
          scheduledAt: existing.scheduledAt
            ? new Date(existing.scheduledAt).toISOString()
            : null,
        },
        proposed: { status: 'draft' },
        status: 'idle',
      },
    };
  }
  if (name === 'update_post_caption') {
    const caption = String(args?.caption || '').trim();
    if (!caption) return { error: 'What should the new caption say?' };
    return {
      intro: 'Review the new caption and confirm:',
      card: {
        action: 'update_post_caption',
        contentId,
        title,
        post: currentPost,
        current: { caption: currentCaption },
        proposed: { caption },
        status: 'idle',
      },
    };
  }
  if (name === 'delete_post') {
    return {
      intro: 'Confirm deleting this post (this cannot be undone):',
      card: {
        action: 'delete_post',
        contentId,
        title,
        post: currentPost,
        current: { status: existing.status },
        proposed: { deleted: true },
        status: 'idle',
      },
    };
  }
  if (name === 'duplicate_post') {
    const asType = String(args?.asType || '').trim();
    const newType = ['post', 'reel', 'story'].includes(asType)
      ? asType
      : existing.type || 'post';
    return {
      intro: 'Confirm duplicating this post as a new draft:',
      card: {
        action: 'duplicate_post',
        contentId,
        title,
        post: currentPost,
        current: { type: existing.type },
        proposed: { type: newType, status: 'draft', asType: newType },
        status: 'idle',
      },
    };
  }
  return { error: `Unknown edit action: ${name}.` };
}

/**
 * Apply a previously-confirmed EDIT to the user's workspace content. Verifies
 * ownership before mutating. Returns a human-readable result. Never throws.
 */
async function executeEditTool(
  workspaceId: string | undefined,
  name: string,
  args: Record<string, unknown>,
  localNow?: string
): Promise<{ ok: boolean; message: string }> {
  if (!workspaceId) return { ok: false, message: 'No workspace in context.' };
  const contentId = String(args?.contentId || '').trim();
  if (!contentId) return { ok: false, message: 'No contentId provided.' };
  try {
    // Ownership check: the target must belong to THIS workspace.
    const existing: any = await storage
      .getContent(contentId)
      .catch(() => undefined);
    if (!existing || String(existing.workspaceId) !== String(workspaceId)) {
      return {
        ok: false,
        message: 'That post was not found in your workspace.',
      };
    }

    if (name === 'reschedule_post') {
      const when = parseLocalDateTime(String(args?.scheduledLocal || ''));
      if (!when)
        return {
          ok: false,
          message: 'I need a valid new date and time to reschedule.',
        };
      const now = parseLocalDateTime(localNow || '') || new Date();
      if (when.getTime() <= now.getTime() + 60 * 1000) {
        return {
          ok: false,
          message: `${when.toLocaleString()} is in the past — please pick a future time.`,
        };
      }
      await storage.updateContent(contentId, {
        status: 'scheduled',
        scheduledAt: when,
      } as any);
      return {
        ok: true,
        message: `Rescheduled to ${when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.`,
      };
    }
    if (name === 'cancel_scheduled_post') {
      await storage.updateContent(contentId, {
        status: 'draft',
        scheduledAt: null,
      } as any);
      return {
        ok: true,
        message:
          'Cancelled — the post is now an unscheduled draft and will not publish.',
      };
    }
    if (name === 'update_post_caption') {
      const caption = String(args?.caption || '').trim();
      if (!caption)
        return { ok: false, message: 'I need the new caption text.' };
      const contentData = { ...(existing.contentData || {}), text: caption };
      await storage.updateContent(contentId, {
        description: caption,
        contentData,
      } as any);
      return { ok: true, message: 'Caption updated.' };
    }
    if (name === 'delete_post') {
      await storage.deleteContent(contentId);
      return {
        ok: true,
        message:
          'Deleted — the post has been permanently removed from your workspace.',
      };
    }
    if (name === 'duplicate_post') {
      const asType = String(args?.asType || '').trim();
      const newType = ['post', 'reel', 'story'].includes(asType)
        ? asType
        : existing.type || 'post';
      const cd = existing.contentData || {};
      const created: any = await storage.createContent({
        workspaceId: existing.workspaceId,
        type: newType,
        title: existing.title || (existing.description || 'Copy').slice(0, 50),
        description: existing.description || cd.text || '',
        platform: existing.platform || 'instagram',
        status: 'draft',
        contentData: {
          ...cd,
          // A duplicate starts as an unscheduled draft.
          scheduledAt: undefined,
        },
      } as any);
      const newId = (created?.id || created?._id)?.toString();
      return {
        ok: true,
        message: `Duplicated as a new ${newType} draft${newId ? '' : ''}. You can edit or schedule it whenever you like.`,
      };
    }
    return { ok: false, message: `Unknown edit action: ${name}.` };
  } catch (err: any) {
    return {
      ok: false,
      message: `Could not complete that change: ${err?.message || 'unknown error'}.`,
    };
  }
}

/**
 * Build an INFO CARD for a non-mutating "assist" tool (caption/hashtag
 * generation, analytics insight, best posting time, trend research). Returns a
 * card object (rendered client-side) plus a short text line for the reply.
 * Reuses the SAME AI services as the dashboard/post flow. Never throws.
 *
 * Card shape: { kind, title, ... } where kind drives the client renderer:
 *   - 'captions'   → { options: string[] }
 *   - 'hashtags'   → { hashtags: string[] }
 *   - 'insight'    → { headline, tip, emoji }
 *   - 'recommendations' → { recommendations: [{icon,title,description,priority,category}] }
 *   - 'best_time'  → { bestLabel, windowLabel, day, daily: [{day_name,best_hour}] , account }
 *   - 'trends'     → { summary, citations: [{title,url}] }
 */
async function buildInfoCard(
  toolName: string,
  args: Record<string, unknown>,
  ctx: { userId?: string; workspaceId?: string; conversationId?: number },
  prefs: FullPreferences,
  mediaUrls: string[] = [],
  onStatus?: (status: string) => void,
  /** Aborts the metered generation (and refunds it) when the user cancels. */
  signal?: AbortSignal,
  /** Live deep-research progress (streaming banner). */
  onProgress?: (event: import('../services/research/webResearch.service').ResearchProgressEvent) => void,
  /**
   * Freshly-uploaded image attachments for THIS turn (base64 bytes). When the
   * user uploads an image and asks to edit it, these are the exact source bytes
   * fed to `edit_image` as inline inputs — the durable path that doesn't depend
   * on the image having been uploaded to storage or on a fetchable URL.
   */
  imageAttachments: { mimeType: string; data: string }[] = [],
  /**
   * Freshly-uploaded VIDEO attachment bytes for THIS turn (base64). When a small
   * video is attached inline, these bytes are ingested directly. Large videos
   * arrive as a hosted URL in `mediaUrls` instead (see the `video_editor`
   * branch), so this is usually empty.
   */
  videoAttachments: { mimeType: string; data: string; name?: string }[] = [],
  /**
   * Live video-editor progress sink. The `video_editor` tool DRIVES the edit
   * server-side and streams stage-derived progress (phase/percent/plan) through
   * this callback, which the call site relays as `videoEditorProgress` events so
   * the inline card renders live progress without any embedded editor chat.
   */
  onVideoProgress?: (progress: import('../features/video-editor/services/chat-video-edit.service').ChatEditProgress) => void
): Promise<{ card?: any; cards?: any[]; summaryText: string }> {
  const userId = ctx.userId;
  const workspaceId = ctx.workspaceId;
  const conversationId = ctx.conversationId;
  try {
    if (toolName === 'show_media_options') {
      // A VISUAL picker: show every image in this conversation as thumbnails the
      // user can preview and pick from — never a list of paths/URLs. The user
      // then references one by its number (schedule_post.mediaOrdinal maps it).
      const imgs = conversationId ? await listConversationImages(conversationId) : [];
      if (!imgs.length) {
        return {
          summaryText:
            'I don\u2019t see any images in this chat yet. Upload one or ask me to generate an image, then I can schedule it.',
        };
      }
      const items = imgs.map((img, i) => ({
        ordinal: i + 1,
        url: img.url,
        mimeType: img.mimeType,
        label: img.label,
        recent: i === 0,
      }));
      return {
        card: {
          kind: 'media_choices',
          title: 'Choose an image to schedule',
          items,
        },
        summaryText:
          'Here are the images in this chat — click a picture to schedule it, or tap the preview icon to view it first. The most recent is used by default.',
      };
    }
    if (toolName === 'generate_image' || toolName === 'edit_image') {
      // Gemini NATIVE image capability. Metered on the existing credit system:
      // reserve → generate → upload → reconcile (runMetered refunds on failure/
      // abort). Editing sends the user's attached image to the model as real
      // input; generation is text-to-image. No separate "Nano Banana" product.
      const isEdit = toolName === 'edit_image';
      const clamp = (v: any, n = 4000) => String(v ?? '').slice(0, n);
      onStatus?.(isEdit ? 'Analyzing your image…' : 'Understanding your creative brief…');

      // Resolve aspect ratio (explicit → platform → sensible default).
      const arId =
        args?.aspectRatio && IMAGE_ASPECT_RATIOS[String(args.aspectRatio)]
          ? String(args.aspectRatio)
          : args?.platform
            ? aspectForPlatform(String(args.platform))
            : isEdit
              ? undefined
              : 'square';
      const ar = arId ? IMAGE_ASPECT_RATIOS[arId] : undefined;
      const premium = args?.premium === true;
      // Derive the image model from the user's AI-config selection (prefs.aiModel):
      // a Gemini selection maps to its image sibling; a non-Gemini selection
      // (e.g. GPT) falls back to the Gemini image model since native image
      // generation is always a Gemini capability.
      const model = selectImageModel({
        preferredModel: prefs?.aiModel,
        premiumRequested: premium,
        complex: premium,
      });
      // Variations: generate up to 4 options (generation only). Each option is a
      // separate metered call, so failed options are refunded, never charged.
      const count = isEdit
        ? 1
        : Math.max(1, Math.min(Number(args?.count) || 1, 4));

      // Resolve the image(s) to edit. If the user didn't attach one but is
      // continuing an editing thread, reuse the MOST RECENT generated/edited
      // image in this conversation (seamless multi-turn editing) and keep the
      // lineage (sourceAssetId + sessionId) so version history stays intact.
      // Fresh uploads arrive as URLs; a reused prior result is loaded as BYTES
      // directly from storage by its key (durable, instance-independent, immune
      // to relative/expiring URLs). Both feed the model as image inputs.
      let inputUrls = isEdit ? (mediaUrls || []).slice(0, 1) : [];
      const imageInputs: { mimeType: string; data: string }[] = [];
      let sourceAssetId: string | undefined;
      let sessionId: string | undefined;
      // Freshly-uploaded image(s) on THIS turn are the primary edit source —
      // pass their exact bytes inline (no upload/URL round-trip needed). This is
      // what makes "upload an image → 'add a man near me'" work on the FIRST
      // message, where there's no prior generated asset to reuse.
      if (isEdit && imageAttachments.length) {
        for (const a of imageAttachments.slice(0, MAX_IMAGE_INPUTS)) {
          if (a?.data && SUPPORTED_IMAGE_INPUT_MIME.has(a.mimeType)) {
            imageInputs.push({ mimeType: a.mimeType, data: a.data });
          }
        }
        // Don't also try the URL slot — the inline bytes take precedence.
        if (imageInputs.length) inputUrls = [];
      }
      if (isEdit && !inputUrls.length && !imageInputs.length && conversationId) {
        try {
          // Two independent sources for "the image to edit", because a user can
          // mean ANY image in the conversation no matter why it got there:
          //   A) the most recent AI-generated/edited image (AiImageAsset) — this
          //      also carries version lineage (sourceAssetId + sessionId), and
          //   B) the most recent image the user UPLOADED (e.g. an image attached
          //      to schedule a post) or that rode in on a scheduling card.
          // Pick whichever is NEWER so multi-turn editing and "upload → edit"
          // both work. Ties favour the generated asset (keeps version history).
          const [prevAsset, prevMsgImg] = await Promise.all([
            AiImageAsset.findOne({ conversationId }).sort({ createdAt: -1 }).lean(),
            findLatestConversationImage(conversationId),
          ]);
          const assetTime = prevAsset?.createdAt ? new Date(prevAsset.createdAt as any).getTime() : -1;
          const msgTime = prevMsgImg?.createdAt ? new Date(prevMsgImg.createdAt).getTime() : -1;

          const pushBytesFromKey = async (key: string, fallbackMime?: string, fallbackUrl?: string) => {
            try {
              const file = await storageService.downloadFile(key);
              imageInputs.push({
                mimeType: file.contentType || fallbackMime || 'image/png',
                data: file.buffer.toString('base64'),
              });
            } catch {
              if (fallbackUrl) inputUrls = [fallbackUrl];
            }
          };

          if (prevAsset && assetTime >= msgTime) {
            // Newest is an AI-generated/edited image → reuse it (with lineage).
            sourceAssetId = prevAsset.assetId;
            sessionId = prevAsset.sessionId;
            if (prevAsset.storageKey) {
              await pushBytesFromKey(prevAsset.storageKey, prevAsset.mimeType, prevAsset.storageUrl);
            } else if (prevAsset.storageUrl) {
              inputUrls = [prevAsset.storageUrl];
            }
          } else if (prevMsgImg) {
            // Newest is a user-uploaded / scheduled image → load it by storage
            // key (durable, no auth cookie needed). Falls back to the URL when
            // the key can't be derived (e.g. legacy local /uploads paths).
            const key = storageKeyFromMediaUrl(prevMsgImg.url);
            if (key) {
              await pushBytesFromKey(key, prevMsgImg.mimeType, prevMsgImg.url);
            } else {
              inputUrls = [prevMsgImg.url];
            }
          }
        } catch {
          /* best-effort lineage lookup */
        }
      }
      if (isEdit && !inputUrls.length && !imageInputs.length) {
        return {
          summaryText:
            'Please attach the image you\u2019d like me to edit, then tell me the change.',
        };
      }

      // Any remaining URL inputs (fresh uploads, or the legacy fallback above)
      // may be root-relative (/uploads/…) in local-storage mode, which the
      // browser resolves but Node's fetch cannot. Rewrite to an absolute,
      // server-reachable URL. Absolute S3/R2 URLs pass through unchanged.
      if (inputUrls.length) {
        const selfBase = selfFetchBaseUrl();
        inputUrls = inputUrls.map(u => toServerFetchableImageUrl(u, selfBase));
      }

      // Compact brand context (best-effort) so generated creatives match the
      // workspace's niche/profile. Never blocks generation if unavailable.
      let brand = ''
      if (!isEdit) {
        try {
          brand = (await getFreshProfileHint(userId)) || ''
        } catch {
          /* no brand context available */
        }
      }

      // Build the structured image instruction (the calling model already did the
      // creative planning; we add brand + technical output + preservation).
      const prompt = isEdit
        ? `Edit the provided image. ${clamp(args?.instruction, 2000)}.` +
          (args?.preserve ? ` Preserve exactly, unchanged: ${clamp(args.preserve, 1000)}.` : '') +
          (ar ? ` Output aspect ratio ${ar.ratio}.` : '') +
          ' Keep it photorealistic and high quality unless asked otherwise.'
        : `${clamp(args?.prompt, 4000)}` +
          (brand ? `\n\nBrand context (match where relevant): ${clamp(brand, 600)}` : '') +
          (ar ? `\n\nAspect ratio: ${ar.ratio} (${ar.width}x${ar.height}px).` : '') +
          '\nProfessional, high-resolution, sharp, well-composed. Avoid watermarks and gibberish text.';

      onStatus?.(isEdit ? 'Applying the edit…' : 'Rendering the image…');
      // One metered generation → upload → persist → observability. Reused per
      // variation. Each call reserves/reconciles credits independently.
      const runOne = async (variationIndex: number) => {
        const startedAt = Date.now();
        const { result, settlement } = await aiCreditMeteringService.runMetered(
          'imageGeneration',
          'veegpt.image_generation',
          { userId: userId || '', workspaceId },
          async (opSignal?: AbortSignal) => {
            const img = await generateOrEditImage({
              prompt,
              imageInputs,
              imageUrls: inputUrls,
              model,
              // Use the user's own Google AI Studio key (same one their text
              // model uses) so the image capability has valid Gemini access.
              apiKey: prefs?.googleAiStudioKey,
              // Structured aspect ratio — the ONLY thing the model honours for
              // non-square output (a prompt hint alone yields 1:1).
              aspectRatio: ar?.ratio,
              signal: opSignal,
            });
            onStatus?.('Finalizing your creative…');
            const ext = img.mimeType.includes('jpeg')
              ? 'jpg'
              : img.mimeType.includes('webp')
                ? 'webp'
                : 'png';
            const uploaded = await storageService.uploadFile({
              buffer: img.buffer,
              originalName: `veegpt-image-${Date.now()}-${variationIndex}.${ext}`,
              mimetype: img.mimeType,
              folder: `ai-images/${workspaceId || 'workspace'}`,
            });
            return { url: uploaded.url, key: uploaded.key, mimeType: img.mimeType };
          },
          0,
          signal
        );
        const assetId = randomAssetId();
        const useSession = sessionId || assetId;
        AiImageAsset.create({
          assetId,
          workspaceId,
          userId,
          conversationId,
          sessionId: useSession,
          sourceAssetId,
          operation: isEdit ? 'editing' : 'generation',
          provider: 'gemini',
          model,
          instruction: isEdit ? clamp(args?.instruction, 2000) : clamp(args?.prompt, 2000),
          mimeType: result.mimeType,
          storageKey: result.key,
          storageUrl: result.url,
          width: ar?.width,
          height: ar?.height,
          aspectRatio: ar?.ratio,
          creditsUsed: settlement.charged,
        }).catch(() => {});
        // Observability (§29) — metadata only, never the image or full prompt.
        vlog('generate:image-ok', {
          convId: conversationId,
          operation: isEdit ? 'editing' : 'generation',
          model,
          aspectRatio: ar?.ratio || null,
          width: ar?.width || null,
          height: ar?.height || null,
          latencyMs: Date.now() - startedAt,
          creditsUsed: settlement.charged,
          variation: variationIndex + 1,
        });
        return {
          assetId,
          // Serve through the authenticated, access-controlled proxy — NOT the
          // raw S3 URL. The bucket stays private; the proxy streams the bytes
          // only to the owning user. This URL is stable (survives reloads) and
          // never expires. Raw storageUrl/storageKey stay in the DB for lineage.
          url: `/api/chat/image/${assetId}`,
          mimeType: result.mimeType,
          credits: settlement.charged,
          remaining: settlement.remaining,
        };
      };

      try {
        const cards: any[] = [];
        let firstErr: any = null;
        for (let i = 0; i < count; i++) {
          if (signal?.aborted) break;
          try {
            const r = await runOne(i);
            cards.push({
              kind: 'image',
              operation: isEdit ? 'editing' : 'generation',
              title:
                (typeof args?.title === 'string' && args.title.trim()) ||
                (isEdit
                  ? 'Edited image'
                  : count > 1
                    ? `Option ${i + 1}`
                    : 'Generated image'),
              url: r.url,
              mimeType: r.mimeType,
              aspectRatio: ar?.ratio,
              assetId: r.assetId,
              creditsUsed: r.credits,
              remainingCredits: r.remaining,
            });
          } catch (e) {
            firstErr = e // failed variation is refunded; keep any that succeeded
          }
        }
        if (!cards.length)
          throw firstErr || new ImageGenerationError('No image produced.', 'no_image');
        return {
          cards,
          summaryText: isEdit
            ? 'Here\u2019s your edited image \u2014 view it below, then edit again, download, or use it in a post.'
            : cards.length > 1
              ? `Here are ${cards.length} options \u2014 view any, then edit, download, or use it in a post.`
              : 'Here\u2019s your creative \u2014 view it below, then edit, download, or use it in a post.',
        };
      } catch (imgErr: any) {
        // runMetered already refunded the reservation because the op threw.
        const friendly =
          imgErr instanceof ImageGenerationError
            ? imgErr.message
            : imgErr instanceof InsufficientAICreditsError
              ? 'You don\u2019t have enough credits to generate an image right now.'
              : 'Your image couldn\u2019t be generated this time. Your credits were not charged.';
        vlog('generate:image-error', {
          tool: toolName,
          category: imgErr?.category || 'unknown',
          message: String(imgErr?.message || '').slice(0, 300),
        });
        return { summaryText: friendly };
      }
    }
    if (toolName === 'video_editor') {
      // AI Video Editor — SERVER-DRIVEN, multi-turn over the MAIN VeeGPT composer.
      // Each turn: (1) ensures a Video_Project for this workspace/user (reusing
      // the newest one), (2) resolves the source to edit — either freshly
      // ingesting an attached video OR REUSING the project's newest analyzed
      // source on a follow-up (no re-upload), and (3) DRIVES the edit turn
      // server-side (Intent_Router → new Version → Editing_Planner → deterministic
      // execution) via `runChatVideoEditTurn`, streaming stage-derived progress
      // as `videoEditorProgress` events and returning a final `video_editor` card
      // carrying the rendered artifact — or, when the edit needs more input, a
      // plain clarification message the user answers in the composer (multi-turn).
      // No-Mock: a real failure surfaces plainly and never a fabricated result.
      const instruction = String((args as any)?.instruction ?? '').slice(0, 2000).trim();
      if (!workspaceId || !userId) {
        return {
          summaryText:
            'I couldn\u2019t open the video editor because your workspace context wasn\u2019t available. Please try again.',
        };
      }

      // Resolve ALL freshly-attached source bytes for THIS turn (not just the
      // first). Large videos arrive as hosted attachment URLs in `mediaUrls`;
      // small ones inline as base64. Ingesting every attached clip into its own
      // Video_Source unlocks single-turn multi-clip assembly (the video-editor
      // driver already gathers all project sources).
      //
      // Ordering (documented, stable): inline base64 attachments FIRST, then
      // hosted URLs, each preserving the order they arrived. We ingest
      // SEQUENTIALLY so the LAST successfully ingested source is the NEWEST —
      // which the driver's `defaultGetSourceForEdit` (newest) treats as the
      // primary/current source and `getAllSourcesForEdit` (all, chronological)
      // consumes in order. This keeps the common single-video case fully
      // backward compatible (a lone clip is both first and last).
      const VIDEO_URL_RE = /\.(mp4|mov|webm|m4v|avi|mkv|m3u8)(\?|#|$)/i;
      // Cap per-turn fan-out to a sane limit to avoid abuse and to protect the
      // shared ffmpeg/probe pipeline. Beyond this we ingest the first N.
      const MAX_VIDEOS_PER_TURN = 10;
      type FreshVideoInput =
        | { kind: 'inline'; attachment: { mimeType: string; data: string; name?: string } }
        | { kind: 'url'; url: string };
      const freshVideoInputs: FreshVideoInput[] = [
        ...(videoAttachments || [])
          .filter((a) => (a?.data || '').length > 0)
          .map((attachment) => ({ kind: 'inline' as const, attachment })),
        ...(mediaUrls || [])
          .filter((u) => VIDEO_URL_RE.test(u))
          .map((url) => ({ kind: 'url' as const, url })),
      ];
      const videoInputsForTurn = freshVideoInputs.slice(0, MAX_VIDEOS_PER_TURN);
      const droppedForCap = freshVideoInputs.length - videoInputsForTurn.length;
      if (droppedForCap > 0) {
        vlog('generate:video-editor-cap', {
          convId: conversationId,
          total: freshVideoInputs.length,
          ingesting: videoInputsForTurn.length,
          dropped: droppedForCap,
        });
      }
      const hasFreshUpload = videoInputsForTurn.length > 0;

      try {
        // Lazily load the video-editor pieces so the heavy pipeline is never
        // constructed on a non-video turn (and to avoid a module-load cycle).
        const [
          { getMediaIngestionService },
          { mongoVideoProjectStore },
          { VideoSourceModel },
          { runChatVideoEditTurn },
          { randomUUID },
        ] = await Promise.all([
          import('../features/video-editor/services/media-ingestion.service'),
          import('../features/video-editor/api/project.routes'),
          import('../models/VideoEditor'),
          import('../features/video-editor/services/chat-video-edit.service'),
          import('crypto'),
        ]);
        const ingestion = getMediaIngestionService();

        // (1) Ensure a Video_Project — reuse the newest active one, else create.
        let projectId: string;
        const existing = await mongoVideoProjectStore
          .listByOwner(workspaceId, userId)
          .catch(() => [] as Awaited<ReturnType<typeof mongoVideoProjectStore.listByOwner>>);
        if (existing.length > 0) {
          projectId = existing[0].projectId;
        } else {
          const created = await mongoVideoProjectStore.create({
            projectId: randomUUID(),
            userId,
            workspaceId,
            name: 'Chat video edit',
          });
          projectId = created.projectId;
        }

        // (2) Resolve the source. A fresh upload is ingested + probed; otherwise
        //     REUSE the project's newest analyzed source (durationMs > 0).
        let sourceId: string | null = null;
        let durationMs = 0;
        if (hasFreshUpload) {
          onStatus?.('Preparing your video for editing\u2026');
          // Fan out over EVERY attached video this turn, reusing the SAME
          // single-video ingestion path (validateAndAccept → probeAndPrepare)
          // for each. Sequential to avoid overwhelming ffmpeg/probe. The LAST
          // successfully ingested source is the newest and becomes the
          // primary/current source used by the rest of the turn.
          const ingestedSourceIds: string[] = [];
          let lastIngestError: unknown = null;
          let lastFailureMessage: string | null = null;
          const multi = videoInputsForTurn.length > 1;

          // Hard ceiling for EACH ingestion step (download / validate+store /
          // probe+prepare). No matter which internal await stalls (S3, ffprobe,
          // ffmpeg on a large HEVC .mov), the step rejects so the turn can never
          // hang forever at "Analyzing your video…". Env: INGEST_STEP_TIMEOUT_MS
          // (default 120s). The rejection is caught by the per-clip catch below,
          // which degrades honestly instead of spinning.
          const INGEST_STEP_TIMEOUT_MS = (() => {
            const raw = Number(process.env.INGEST_STEP_TIMEOUT_MS);
            return Number.isFinite(raw) && raw > 0 ? raw : 120_000;
          })();
          const withIngestTimeout = async <T>(p: Promise<T>, label: string): Promise<T> => {
            const startedAt = Date.now();
            vlog('generate:video-ingest-step-start', { convId: conversationId, projectId, step: label });
            try {
              const result = await Promise.race([
                p,
                new Promise<T>((_, reject) =>
                  setTimeout(
                    () => reject(new Error(`Video ${label} timed out after ${INGEST_STEP_TIMEOUT_MS}ms`)),
                    INGEST_STEP_TIMEOUT_MS,
                  ),
                ),
              ]);
              vlog('generate:video-ingest-step-done', {
                convId: conversationId,
                projectId,
                step: label,
                ms: Date.now() - startedAt,
              });
              return result;
            } catch (err) {
              vlog('generate:video-ingest-step-error', {
                convId: conversationId,
                projectId,
                step: label,
                ms: Date.now() - startedAt,
                error: String((err as Error)?.message || err).slice(0, 200),
              });
              throw err;
            }
          };

          for (let i = 0; i < videoInputsForTurn.length; i++) {
            const input = videoInputsForTurn[i];
            try {
              let acceptedSourceId: string;
              if (input.kind === 'url') {
                const key = storageKeyFromMediaUrl(input.url);
                if (!key) {
                  // Non-throwing condition the single-video path surfaced with a
                  // plain message; skip this clip but remember it in case NONE
                  // of the inputs can be ingested.
                  lastFailureMessage =
                    'I couldn\u2019t read that video file for editing. Please re-attach it and try again.';
                  vlog('generate:video-editor-ingest-skip', {
                    convId: conversationId,
                    projectId,
                    index: i,
                    kind: input.kind,
                    reason: 'missing-storage-key',
                  });
                  continue;
                }
                const file = await withIngestTimeout(storageService.downloadFile(key), 'download');
                const accept = await withIngestTimeout(
                  ingestion.validateAndAccept({
                    projectId,
                    workspaceId,
                    userId,
                    buffer: file.buffer,
                    originalName: key.split('/').pop() || 'video',
                    declaredMimeType: file.contentType ?? null,
                  }),
                  'validation',
                );
                acceptedSourceId = accept.source.sourceId;
              } else {
                const buffer = Buffer.from(input.attachment.data, 'base64');
                const accept = await withIngestTimeout(
                  ingestion.validateAndAccept({
                    projectId,
                    workspaceId,
                    userId,
                    buffer,
                    originalName: input.attachment.name || 'video',
                    declaredMimeType: input.attachment.mimeType ?? null,
                  }),
                  'validation',
                );
                acceptedSourceId = accept.source.sourceId;
              }

              onStatus?.(
                multi
                  ? `Analyzing your videos\u2026 (${i + 1}/${videoInputsForTurn.length})`
                  : 'Analyzing your video\u2026',
              );
              const prepared = await withIngestTimeout(
                ingestion.probeAndPrepare(acceptedSourceId),
                'analysis',
              );
              const preparedDuration = prepared.source.durationMs;
              if (!preparedDuration || preparedDuration <= 0) {
                lastFailureMessage =
                  'I stored your video but couldn\u2019t read its timeline, so I can\u2019t edit it yet. Please try re-attaching it.';
                vlog('generate:video-editor-ingest-skip', {
                  convId: conversationId,
                  projectId,
                  index: i,
                  kind: input.kind,
                  reason: 'empty-duration',
                });
                continue;
              }

              // Success — record it. The LAST success stays newest/primary.
              ingestedSourceIds.push(acceptedSourceId);
              sourceId = acceptedSourceId;
              durationMs = preparedDuration;
            } catch (perVideoErr) {
              // Robustness: one bad clip must not fail the whole turn. Log and
              // continue; we only surface an error if NONE could be ingested.
              lastIngestError = perVideoErr;
              vlog('generate:video-editor-ingest-skip', {
                convId: conversationId,
                projectId,
                index: i,
                kind: input.kind,
                message: String((perVideoErr as any)?.message || '').slice(0, 200),
              });
            }
          }

          if (!sourceId) {
            // No-Mock: nothing valid was ingested this turn. Preserve the exact
            // single-video failure behavior — rethrow a real ingestion error
            // into the outer catch (which honors MediaIngestionRejectedError),
            // otherwise return the remembered plain message.
            if (lastIngestError) throw lastIngestError;
            return {
              summaryText:
                lastFailureMessage ||
                'I couldn\u2019t read that video file for editing. Please re-attach it and try again.',
            };
          }

          vlog('generate:video-editor-ingested', {
            convId: conversationId,
            projectId,
            attempted: videoInputsForTurn.length,
            ingested: ingestedSourceIds.length,
            primarySourceId: sourceId,
          });
        } else {
          // Follow-up refinement: reuse the newest analyzed source for the project.
          const existingSource = await VideoSourceModel.findOne({ projectId })
            .sort({ createdAt: -1 })
            .lean()
            .catch(() => null);
          const s = existingSource as Record<string, unknown> | null;
          const resolvedId = typeof s?.sourceId === 'string' ? s.sourceId : null;
          const resolvedDuration = typeof s?.durationMs === 'number' ? s.durationMs : 0;
          if (!resolvedId || resolvedDuration <= 0) {
            return {
              summaryText:
                'Please attach the video you\u2019d like me to edit, then tell me the change (for example, "reframe to 9:16" or "trim to 10 seconds").',
            };
          }
          sourceId = resolvedId;
          durationMs = resolvedDuration;
        }

        // (3) DRIVE the edit turn server-side, streaming stage-derived progress.
        const result = await runChatVideoEditTurn(
          {
            projectId,
            workspaceId,
            userId,
            message: instruction,
            sourceId,
            aiModel: prefs?.aiModel,
            // Use the workspace's OWN Google AI Studio key for the generative
            // video calls (same key the image capability uses). Google meters its
            // generative-video daily quota per API KEY, so without this every
            // workspace shares one small pool and a single heavy tenant starves
            // the rest. Falls back to the shared env key when unset.
            apiKey: prefs?.googleAiStudioKey,
            onProgress: (p) => onVideoProgress?.(p),
          },
        );

        vlog('generate:video-editor-turn', {
          convId: conversationId,
          projectId,
          sourceId,
          outcome: result.outcome,
        });

        if (result.outcome === 'rendered') {
          // The chained-edit summary already lists every applied op AND any
          // best-effort caption-skip note (e.g. "…Captions skipped — no clear
          // speech detected."). Surface it BOTH as the assistant message and on
          // the card so the user sees exactly what was applied with the result.
          return {
            card: {
              kind: 'video_editor',
              phase: 'complete',
              percent: 100,
              projectId,
              sourceId,
              workspaceId,
              instruction,
              durationMs,
              resultArtifactId: result.artifactId,
              versionId: result.versionId,
              resultKind: result.kind,
              summary: result.summary,
            },
            summaryText: result.summary,
          };
        }

        if (result.outcome === 'needs_async') {
          // Honest: the edit is planned but needs the async generative/render
          // pipeline. Show a card with the source + status (no fabricated result).
          return {
            card: {
              kind: 'video_editor',
              phase: 'queued',
              percent: 60,
              projectId,
              sourceId,
              workspaceId,
              instruction,
              durationMs,
              resultKind: result.kind,
            },
            summaryText: result.message,
          };
        }

        // clarification / no_op / error → a plain assistant message the user
        // answers in the MAIN composer (multi-turn contract), no result card.
        return { summaryText: result.message };
      } catch (vErr: any) {
        // No-Mock: a real ingestion/probe/pipeline failure surfaces plainly.
        const rejected =
          vErr instanceof Error &&
          (vErr.name === 'MediaIngestionRejectedError' ||
            typeof (vErr as { reason?: unknown }).reason === 'string');
        vlog('generate:video-editor-error', {
          convId: conversationId,
          message: String(vErr?.message || '').slice(0, 300),
          rejected,
        });
        const detail = String(vErr?.message || '').slice(0, 200);
        return {
          summaryText: rejected
            ? `I couldn\u2019t use that video: ${vErr.message}`
            : `I couldn\u2019t process that video for editing${detail ? ` (${detail})` : ''}. Please re-attach it (a common MP4/MOV works best) and try again.`,
        };
      }
    }
    if (toolName === 'generate_document') {
      // Pure/deterministic: the model already authored the content in `args`.
      // We only sanitise + bound it and hand it to the client, which builds the
      // real file (PDF/Word/Excel/PowerPoint) on download. No AI call, no credits.
      const rawType = String(args?.type || '').toLowerCase();
      const docType = ['pdf', 'docx', 'xlsx', 'pptx'].includes(rawType)
        ? rawType
        : 'pdf';
      const clampStr = (v: any, n = 20000) => String(v ?? '').slice(0, n);
      const clampNum = (v: any) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
      };
      const title = clampStr(args?.title, 300).trim() || 'Document';
      const subtitle = clampStr(args?.subtitle, 300).trim();
      const summary = clampStr(args?.summary, 500).trim();
      const highlights = Array.isArray(args?.highlights)
        ? args.highlights
            .slice(0, 6)
            .map((h: any) => ({
              label: clampStr(h?.label, 120),
              value: clampStr(h?.value, 60),
              sublabel: h?.sublabel ? clampStr(h.sublabel, 120) : undefined,
            }))
            .filter((h: any) => h.label || h.value)
        : undefined;
      const sanitizeChart = (c: any) => {
        if (!c || !Array.isArray(c.points) || !c.points.length) return undefined;
        const points = c.points
          .slice(0, 24)
          .map((p: any) => ({ label: clampStr(p?.label, 60), value: clampNum(p?.value) }))
          .filter((p: any) => p.label);
        return points.length
          ? { title: c?.title ? clampStr(c.title, 160) : undefined, points }
          : undefined;
      };
      const sections = Array.isArray(args?.sections)
        ? args.sections.slice(0, 300).map((s: any) => ({
            heading: s?.heading ? clampStr(s.heading, 300) : undefined,
            body: s?.body ? clampStr(s.body, 20000) : undefined,
            bullets: Array.isArray(s?.bullets)
              ? s.bullets.slice(0, 200).map((b: any) => clampStr(b, 2000))
              : undefined,
            callout: s?.callout ? clampStr(s.callout, 2000) : undefined,
            chart: sanitizeChart(s?.chart),
          }))
        : undefined;
      const sheets = Array.isArray(args?.sheets)
        ? args.sheets.slice(0, 20).map((sh: any) => ({
            name: sh?.name ? clampStr(sh.name, 60) : undefined,
            columns: Array.isArray(sh?.columns)
              ? sh.columns.slice(0, 60).map((c: any) => clampStr(c, 200))
              : [],
            rows: Array.isArray(sh?.rows)
              ? sh.rows.slice(0, 5000).map((r: any) =>
                  Array.isArray(r)
                    ? r
                        .slice(0, 60)
                        .map((c: any) =>
                          typeof c === 'number' ? c : clampStr(c, 2000)
                        )
                    : []
                )
              : [],
          }))
        : undefined;
      const slides = Array.isArray(args?.slides)
        ? args.slides.slice(0, 100).map((sl: any) => ({
            title: sl?.title ? clampStr(sl.title, 300) : undefined,
            bullets: Array.isArray(sl?.bullets)
              ? sl.bullets.slice(0, 30).map((b: any) => clampStr(b, 1000))
              : undefined,
            body: sl?.body ? clampStr(sl.body, 5000) : undefined,
          }))
        : undefined;
      const typeLabel: Record<string, string> = {
        pdf: 'PDF',
        docx: 'Word document',
        xlsx: 'Excel spreadsheet',
        pptx: 'PowerPoint deck',
      };
      return {
        card: {
          kind: 'document',
          docType,
          title,
          subtitle: subtitle || undefined,
          summary: summary || undefined,
          highlights: highlights && highlights.length ? highlights : undefined,
          spec: { sections, sheets, slides },
        },
        summaryText:
          summary ||
          `Here\u2019s your ${typeLabel[docType]} — \u201C${title}\u201D. You can download it below.`,
      };
    }
    if (toolName === 'generate_caption') {
      const topic = String(args?.topic || '').trim() || 'social media post';
      const count = Math.max(1, Math.min(Number(args?.count) || 3, 3));
      const postType = ['post', 'reel', 'story'].includes(
        String(args?.postType)
      )
        ? (String(args?.postType) as any)
        : 'post';
      // If the user attached media this turn, ground the caption in what the
      // image/video actually shows (image understanding in the post flow).
      let mediaAnalysis: string | undefined;
      if (mediaUrls.length) {
        try {
          const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(mediaUrls[0]);
          const desc = await withAIFeature(
            'veegpt.media_analysis',
            { userId, workspaceId },
            () =>
              aiServiceManager.analyzeMedia(
                mediaUrls[0],
                isVideo ? 'video' : 'image',
                prefs
              )
          );
          if (desc) mediaAnalysis = `Visual analysis: ${desc}`;
        } catch {
          /* best-effort */
        }
      }
      const { result: options, settlement } =
        await aiCreditMeteringService.runMetered(
          'captionGeneration',
          'veegpt.post_caption',
          { userId: userId || '', workspaceId },
          async (opSignal?: AbortSignal) => {
            const variations = await aiServiceManager.generateInstagramCaptions(
              {
                userId: userId || '',
                workspaceId: workspaceId || userId || '',
                topic,
                mediaAnalysis,
                postType,
                platform: 'Instagram',
                preferences: prefs,
                singleVariation: count === 1,
                signal: opSignal,
              }
            );
            const generatedOptions = (variations || [])
              .slice(0, count)
              .map((variation: any) =>
                String(variation?.caption || '')
                  .replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, '')
                  .trim()
              )
              .filter(Boolean);
            if (!generatedOptions.length)
              throw new Error('AI returned no usable captions');
            return generatedOptions;
          },
          0,
          signal
        );
      return {
        card: {
          kind: 'captions',
          title: count > 1 ? 'Caption options' : 'Caption',
          options,
          creditsUsed: settlement.charged,
          remainingCredits: settlement.remaining,
        },
        summaryText:
          count > 1
            ? `Here are ${options.length} caption options — tap to copy:`
            : 'Here\u2019s a caption — tap to copy:',
      };
    }

    if (toolName === 'generate_hashtags') {
      const topic = String(args?.topic || '').trim() || 'social media post';
      const count = Math.max(5, Math.min(Number(args?.count) || 12, 30));
      const htPrompt =
        `Generate ${count} relevant, high-quality Instagram hashtags for: "${topic}". ` +
        'Mix popular and niche tags for discoverability. ' +
        'Return ONLY a JSON array of strings WITHOUT the # symbol, e.g. ["travel","sunset"].';
      const { result: hashtags, settlement } =
        await aiCreditMeteringService.runMetered(
          'hashtagGeneration',
          'veegpt.post_hashtags',
          { userId: userId || '', workspaceId },
          async (opSignal?: AbortSignal) => {
            const htResult = await aiServiceManager.generateJSON(
              htPrompt,
              { ...prefs, responseLength: 'short', creativityLevel: 0.4 },
              { signal: opSignal }
            );
            const arr = Array.isArray(htResult)
              ? htResult
              : Array.isArray((htResult as any)?.hashtags)
                ? (htResult as any).hashtags
                : [];
            const normalized = Array.from(
              new Set(
                arr
                  .map((hashtag: any) =>
                    String(hashtag).replace(/^#+/, '').trim()
                  )
                  .filter(Boolean)
              )
            ).slice(0, count) as string[];
            if (!normalized.length)
              throw new Error('AI returned no usable hashtags');
            return normalized;
          },
          0,
          signal
        );
      return {
        card: {
          kind: 'hashtags',
          title: 'Suggested hashtags',
          hashtags,
          creditsUsed: settlement.charged,
          remainingCredits: settlement.remaining,
        },
        summaryText: `Here are ${hashtags.length} hashtags for "${topic}" — tap to copy:`,
      };
    }

    if (toolName === 'get_analytics_insight') {
      if (!workspaceId)
        return {
          summaryText: 'I need a workspace to analyze your performance.',
        };
      const kind = String(args?.kind || 'recommendations');
      const { buildRecommendationsData, buildBannerData } =
        await import('../services/InsightsDataService');
      if (kind === 'insight') {
        const { data } = await buildBannerData(workspaceId, 'month', null);
        const insight = await withAIFeature(
          'growth.insight',
          { userId, workspaceId },
          () => aiServiceManager.generateAnalyticsInsight(data, prefs, signal)
        );
        return {
          card: {
            kind: 'insight',
            title: insight.title || 'Performance insight',
            emoji: insight.emoji,
            headline: insight.headline,
            tip: insight.tip,
          },
          summaryText: `${insight.emoji || '📊'} ${insight.headline}`,
        };
      }
      const { data } = await buildRecommendationsData(workspaceId);
      const recommendations = await withAIFeature(
        'growth.recommendations',
        { userId, workspaceId },
        () =>
          aiServiceManager.generateGrowthRecommendations(data, prefs, signal)
      );
      if (!recommendations?.length)
        return {
          summaryText:
            'I don\u2019t have enough data yet to give solid recommendations — keep posting and I\u2019ll learn what works.',
        };
      return {
        card: {
          kind: 'recommendations',
          title: 'Growth recommendations',
          recommendations,
        },
        summaryText: `Here are ${recommendations.length} prioritized ways to grow, based on your real data:`,
      };
    }

    if (toolName === 'get_best_posting_time') {
      if (!workspaceId)
        return {
          summaryText:
            'I need a connected account to work out your best posting time.',
        };
      const { getSmartBestTime } = await import('../services/bestTimeService');
      const smart = await getSmartBestTime(workspaceId);
      if (!smart?.bestSlot) {
        return {
          summaryText:
            'I\u2019m still gathering engagement signals from your posts to find your best posting time. Keep posting consistently and check back soon.',
        };
      }
      const accts =
        (await storage
          .getSocialAccountsByWorkspace(workspaceId)
          .catch(() => [])) || [];
      const account = (accts as any[]).find(
        a => a.platform === 'instagram'
      )?.username;
      const daily = smart.dailyBest
        .filter(d => d.dayScore > 0)
        .map(d => ({
          day_name: d.dayName,
          best_hour: d.hour,
          is_peak: d.dow === smart.bestDay?.dow,
        }));
      const bestSlot = smart.bestSlot;
      return {
        card: {
          kind: 'best_time',
          title: 'Best time to post',
          bestLabel: bestSlot.hourLabel,
          windowLabel: `${bestSlot.hourLabel} on ${bestSlot.dayName}`,
          day: bestSlot.dayName,
          status: smart.summary,
          account,
          daily,
        },
        summaryText: `Your best time to post is ${bestSlot.dayName} at ${bestSlot.hourLabel} (${smart.confidenceLevel.toLowerCase()} confidence).`,
      };
    }

    if (toolName === 'research_trends' || toolName === 'search_web') {
      let query = String(args?.query || '').trim();
      if (!query)
        return { summaryText: 'What topic or niche should I look up?' };
      // NICHE GROUNDING: the user's niche is app-level PROFILE data (not social-
      // account data), and the model often drops it from the query. Resolve it
      // FRESH from the DB (bypasses any stale cached snapshot) and fold it into
      // the query so "what's trending in my niche" researches THEIR niche — not
      // generic trends. For trends we always scope to the niche; for a general
      // web search only when the user referenced their own niche/industry.
      try {
        if (userId) {
          const { resolveNiche } = await import('../services/niche.util');
          const u = await storage.getUser(userId).catch(() => null);
          const niche = resolveNiche(u);
          const refersOwnNiche =
            /\b(my|our)\s+(niche|industry|space|field|audience)\b/i.test(query);
          if (
            niche &&
            !query.toLowerCase().includes(niche.toLowerCase()) &&
            (toolName === 'research_trends' || refersOwnNiche)
          ) {
            query = `${query} — focused on the ${niche} niche`;
          }
        }
      } catch {
        /* non-fatal — fall back to the model's query */
      }
      const { research, isResearchConfigured } =
        await import('../services/research/webResearch.service');
      if (!isResearchConfigured()) {
        return {
          summaryText:
            'Live web research isn\u2019t available right now (no search/extraction provider is configured).',
        };
      }
      const mode =
        toolName === 'research_trends'
          ? 'trends'
          : String((args as any)?.mode) === 'competitors'
            ? 'competitors'
            : 'search';
      const result = await research(query, {
        mode: mode as any,
        preferences: prefs,
        userId,
        workspaceId,
        onStatus,
        signal,
      });
      if (!result.answer && !result.sources.length) {
        return {
          summaryText:
            'I couldn\u2019t find anything solid on that right now — try rephrasing or again shortly.',
        };
      }
      const citations = result.sources.map(s => ({
        title: s.title,
        url: s.url,
        domain: s.domain,
        date: s.date,
      }));
      // The prose ANSWER streams as normal message text (reveal loop) for a
      // natural typing feel; the card carries only the structured extras
      // (trends, key points, sources) so it doesn't duplicate the prose.
      // Show the REAL, varying number of sources actually cited right in the
      // (persistent) card title — this is the honest count that changes per
      // query, unlike the near-constant search-hit count.
      const srcCount = citations.length;
      const srcSuffix = srcCount > 0 ? ` · ${srcCount} ${srcCount === 1 ? 'source' : 'sources'}` : '';
      return {
        card: {
          kind: 'research',
          title:
            (mode === 'trends' ? 'Trends: ' : 'Research: ') +
            query.slice(0, 48) +
            srcSuffix,
          keyPoints: result.keyPoints,
          trends: result.trends,
          citations,
        },
        summaryText:
          result.answer ||
          (mode === 'trends'
            ? 'Here\u2019s what\u2019s trending right now:'
            : 'Here\u2019s what I found:'),
      };
    }

    if (toolName === 'deep_research') {
      const query = String(args?.query || '').trim();
      if (!query) return { summaryText: 'What should I run deep research on?' };
      const { deepResearch, isResearchConfigured } =
        await import('../services/research/webResearch.service');
      if (!isResearchConfigured()) {
        return {
          summaryText:
            'Deep research isn\u2019t available right now (no search/extraction provider is configured).',
        };
      }
      // Track live progress for a persisted, collapsible summary on the card
      // (searches run + sources read + step timeline), and forward each event
      // to the streaming banner via onProgress.
      let searchCount = 0;
      let lastSourceCount = 0;
      const progressSteps: Array<{ kind: string; label: string; detail?: string }> = [];

      // ── Deep research gets its OWN governed scope (spec §22) ────────────────
      // It used to run inside the chat turn's reservation, which meant NONE of its
      // own ceilings applied: the chat turn's 120 VGU cap governed a job whose own
      // limit is 250, its monthly allowance was never checked, and "max 1
      // concurrent research job" was not enforced at all.
      //
      // A NESTED reservation fixes that. It skips only the plan-wide concurrency
      // slot (the chat turn already holds it) and applies everything that makes
      // this feature bounded: per-job VGU ceiling, monthly feature allowance,
      // one-at-a-time concurrency, provider-call limit, wall-clock budget and
      // retry limit. It also lands in the ledger as its own event, which is what
      // lets the UI show "Deep Research: used / allowance" separately from chat.
      const drPlan = userId ? await resolveVeegptPlan(userId) : null;
      let report: Awaited<ReturnType<typeof deepResearch>>;
      const runResearch = () =>
        deepResearch(query, {
          preferences: prefs,
          userId,
          workspaceId,
          onStatus,
          signal,
          onProgress: e => {
            if (e.kind === 'searching') searchCount += Array.isArray(e.queries) && e.queries.length ? e.queries.length : 1;
            if (typeof e.sourceCount === 'number') lastSourceCount = e.sourceCount;
            if (e.kind !== 'reading' || progressSteps[progressSteps.length - 1]?.kind !== 'reading') {
              progressSteps.push({ kind: e.kind, label: e.label, detail: e.detail });
            }
            onProgress?.(e);
          },
        });

      if (!userId) {
        // No quota owner (system/anonymous path): still runs, still measured by the
        // surrounding scope, but there is nobody to reserve against.
        report = await runResearch();
      } else {
        try {
          const { result } = await withVGU(
            {
              userId,
              workspaceId,
              plan: drPlan ?? 'free',
              feature: DEEP_RESEARCH_FEATURE,
              model: prefs.aiModel,
              modelChosenBy: 'user',
              nested: true,
              promptChars: query.length,
              meta: { userId, source: 'chat-tool', query: query.slice(0, 120) },
            },
            runResearch
          );
          report = result;
        } catch (err) {
          // A refusal is reported in the chat as a normal, readable answer — it is
          // not a crash, and it must not take down the whole turn. The rest of the
          // reply (and any other tool) continues.
          if (err instanceof VGUQuotaError) {
            vlog('deep-research:refused', { code: err.code, convId: undefined });
            return { summaryText: deepResearchRefusalText(err) };
          }
          throw err;
        }
      }
      if (!report.executiveSummary && !report.sources.length) {
        return {
          summaryText:
            'I couldn\u2019t complete the deep research right now — try again shortly.',
        };
      }
      const citations = report.sources.map(s => ({
        title: s.title,
        url: s.url,
        domain: s.domain,
        date: s.date,
      }));
      // Stream the executive summary as normal message text; the card keeps the
      // structured sections (findings, trends, opportunities, risks, sources)
      // plus a collapsed research-activity summary that persists on reload.
      const sourceTotal = lastSourceCount || report.sources.length;
      // Keep the INLINE chat reply short — a one-line hand-off. The FULL report
      // (executive summary + all sections) lives in the card / full-screen view,
      // so the chat thread doesn't get flooded with the entire report.
      const inlineIntro =
        `Here's your research report on "${query.slice(0, 60)}"` +
        (sourceTotal
          ? ` — I read ${sourceTotal} ${sourceTotal === 1 ? 'source' : 'sources'}` +
            (searchCount ? ` across ${searchCount} ${searchCount === 1 ? 'search' : 'searches'}` : '') +
            '.'
          : '.') +
        ' Open the report below for the full breakdown.';
      return {
        card: {
          kind: 'deep_research',
          title: `Research report: ${query.slice(0, 60)}`,
          // Full report content now lives ON the card (condensed preview in-chat,
          // full report in the expandable full-screen viewer).
          reportMarkdown: report.reportMarkdown,
          executiveSummary: report.executiveSummary,
          keyFindings: report.keyFindings,
          trends: report.trends,
          opportunities: report.opportunities,
          risks: report.risks,
          citations,
          research: {
            searches: searchCount,
            sourceCount: sourceTotal,
            steps: progressSteps.slice(0, 40),
          },
        },
        summaryText: inlineIntro,
      };
    }

    return { summaryText: '' };
  } catch (err: any) {
    if (err instanceof InsufficientAICreditsError) {
      return {
        summaryText: `You need up to ${err.required} AI credits for that generation, but have ${err.remaining} remaining. Plain VeeGPT chat is still free.`,
      };
    }
    vlog('generate:info-card-error', { toolName, error: err?.message });
    const rl = /429|quota|rate.?limit|too many requests/i.test(
      String(err?.message || '')
    );
    return {
      summaryText: rl
        ? 'I\u2019m getting rate-limited by the AI provider right now — please try again in a minute.'
        : `I couldn\u2019t complete that just now: ${err?.message || 'unknown error'}.`,
    };
  }
}

/** The account the user selected in the composer (drives on-demand fetching). */
interface AccountScope {
  userId?: string;
  workspaceId?: string;
  accountId?: string;
}

/** Format an audience Map/object as a compact "Top: a x, b y" line. */
function topAudience(map: any, n = 5): string {
  if (!map) return '';
  const entries: Array<[string, number]> =
    map instanceof Map
      ? Array.from(map.entries())
      : Object.entries(map as Record<string, number>);
  if (!entries.length) return '';
  return entries
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, n)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
}

/** A single "Label: value" fact line (only when the value is present). */
function fact(label: string, value: unknown, suffix = ''): string | null {
  if (value === null || value === undefined || value === '') return null;
  return `- ${label}: ${value}${suffix}`;
}

/** Authoritative, dashboard-matching metrics for the selected account. */
interface AccountMetrics {
  followers?: number;
  followingCount?: number;
  mediaCount?: number;
  engagementRate?: number;
  reach?: number;
  avgEngagement?: number;
  posts?: number;
  monthlyGrowth?: number;
  monthlyGained?: number;
  monthlyLost?: number;
  weeklyGrowth?: number;
  growthPercentage?: number;
  trend?: string;
  audience?: { country?: any; city?: any; genderAge?: any; activeTime?: any };
}

/** Pick the first present (non-null) numeric value. */
function firstNum(...vals: any[]): number | undefined {
  for (const v of vals) if (v !== null && v !== undefined && v !== '') return v;
  return undefined;
}

/** Resolved analytics time window (already clamped to the plan). */
interface Timeframe {
  requestedDays: number;
  effectiveDays: number;
  clamped: boolean;
  capDays: number; // Infinity = unlimited
  from: string;
  to: string;
  label: string;
}

const DAY_MS = 86400000;

/** Plan-derived analytics entitlements for the current user. */
interface PlanAnalyticsInfo {
  /** History cap in days; Infinity = unlimited. */
  capDays: number;
  /** Creator+ — audience demographics access. */
  audienceInsights: boolean;
  /** Creator+ — top-content / content-performance access. */
  contentPerformance: boolean;
  /** Creator+ — combined multi-platform ("All accounts") analytics. */
  crossPlatform: boolean;
}

/**
 * Resolve the user's analytics entitlements from their subscription plan in ONE
 * cached call. History cap: Free = 30, Creator = 365, Pro/Business = 730,
 * Enterprise = unlimited. Never throws (defaults to the Free tier).
 */
async function getPlanAnalyticsInfo(
  userId?: string
): Promise<PlanAnalyticsInfo> {
  const FREE: PlanAnalyticsInfo = {
    capDays: 30,
    audienceInsights: false,
    contentPerformance: false,
    crossPlatform: false,
  };
  if (!userId) return FREE;
  try {
    const { getEntitlementService } =
      await import('../features/subscription/services/EntitlementService');
    const { getRedisClient } = await import('../lib/redis');
    const SubscriptionRepository = (
      await import('../features/subscription/db/repositories/SubscriptionRepository')
    ).default;
    const svc = getEntitlementService(
      getRedisClient(),
      new SubscriptionRepository()
    );
    const limits: any = await svc.getEffectiveLimits(userId);
    const days = Number(limits?.analyticsHistoryDays);
    return {
      capDays: days === -1 ? Infinity : Number.isFinite(days) ? days : 30,
      audienceInsights: !!limits?.features?.audienceInsights,
      contentPerformance: !!limits?.features?.contentPerformance,
      crossPlatform: !!limits?.features?.crossPlatformAnalytics,
    };
  } catch {
    return FREE;
  }
}

/**
 * Build a FRESH profile hint (niche / audience / content style) straight from
 * the DB for the current request. The workspace-context snapshot is cached and
 * can be stale, and the niche is app-level PROFILE data (not social-account
 * data), so we read it live here and inject it into the per-turn tool context.
 * When no niche is set, we tell the model to ASK rather than assume. Never throws.
 */
async function getFreshProfileHint(userId?: string): Promise<string> {
  if (!userId) return '';
  try {
    const { resolveNiche } = await import('../services/niche.util');
    const u: any = await storage.getUser(userId).catch(() => null);
    if (!u) return '';
    const niche = resolveNiche(u);
    const bits: string[] = [];
    if (niche) bits.push(`niche: ${niche}`);
    if (u.targetAudience) bits.push(`target audience: ${u.targetAudience}`);
    if (u.contentStyle) bits.push(`content style: ${u.contentStyle}`);
    if (!bits.length) {
      return '--- User profile ---\nThe user has NOT set a niche in their profile yet. If a question depends on their niche/industry (e.g. "trends in my niche"), ASK them what their niche is instead of researching generic trends or assuming one.';
    }
    return `--- User profile (authoritative, fresh) ---\n${bits.join(', ')}.\nWhenever a request depends on the user's niche/industry (e.g. "what's trending in my niche", "ideas for my audience"), USE this niche explicitly (in research queries, content, and analysis) — never answer generically.`;
  } catch {
    return '';
  }
}

/** Turn the tool's timeframe/days args into a concrete, plan-clamped window. */
function resolveTimeframe(
  args: Record<string, unknown>,
  capDays: number
): Timeframe {
  const presets: Record<string, number> = {
    today: 1,
    '7d': 7,
    '30d': 30,
    '90d': 90,
    '6m': 180,
    '1y': 365,
  };
  let requestedDays: number;
  const daysArg = Number(args?.days);
  if (Number.isFinite(daysArg) && daysArg > 0) {
    requestedDays = Math.round(daysArg);
  } else {
    const tf = String(args?.timeframe || '30d');
    requestedDays =
      tf === 'all'
        ? Number.isFinite(capDays)
          ? capDays
          : 730
        : (presets[tf] ?? 30);
  }
  const effectiveDays = Number.isFinite(capDays)
    ? Math.min(requestedDays, capDays)
    : requestedDays;
  const clamped = Number.isFinite(capDays) && requestedDays > capDays;
  const to = new Date();
  const from = new Date(to.getTime() - effectiveDays * DAY_MS);
  const label = effectiveDays === 1 ? 'today' : `last ${effectiveDays} days`;
  return {
    requestedDays,
    effectiveDays,
    clamped,
    capDays,
    from: from.toISOString(),
    to: to.toISOString(),
    label,
  };
}

/**
 * Map the user's plain-word metric requests to canonical analytics keys, and
 * decide whether the audience/top-content sections are wanted. Empty/"all" ⇒
 * the whole set.
 */
function selectMetrics(args: Record<string, unknown>): {
  wantAll: boolean;
  keys: Set<string>;
  wantAudience: boolean;
  wantTopContent: boolean;
  wantProfile: boolean;
} {
  const ALIAS: Array<[RegExp, string[]]> = [
    [/follower growth rate|growth rate/, ['follower_growth_rate']],
    [/net follower|net growth/, ['net_followers']],
    [
      /new follower|gained|follower growth|grow/,
      ['new_followers', 'net_followers', 'follower_growth_rate'],
    ],
    [/lost follower|unfollow|churn/, ['lost_followers']],
    [/follower|audience size/, ['followers_total']],
    [/reach/, ['reach_total']],
    [/impression/, ['impressions_total']],
    [
      /engagement rate/,
      [
        'engagement_rate_by_impressions',
        'engagement_rate_by_followers',
        'engagement_rate_by_reach',
      ],
    ],
    [/engagement/, ['total_engagements', 'engagement_rate_by_impressions']],
    [/like/, ['likes']],
    [/comment/, ['comments']],
    [/\bshares?\b|sharing/, ['shares']],
    [/\bsaves?\b|saved/, ['saves']],
    [/view|watch/, ['video_views']],
    [/profile visit|profile view/, ['profile_visits']],
    [/website click|link click/, ['website_clicks']],
    [/published|posts? count|how many posts|post count/, ['published_posts']],
    [/failed post/, ['failed_posts']],
    [/success rate/, ['publishing_success_rate']],
    [/reaction/, ['facebook_reactions']],
    [/page view/, ['facebook_page_views']],
    [/post click/, ['facebook_post_clicks']],
  ];
  const raw = Array.isArray(args?.metrics)
    ? (args!.metrics as any[])
        .map(m => String(m).toLowerCase().trim())
        .filter(Boolean)
    : [];
  const include = Array.isArray(args?.include)
    ? (args!.include as any[]).map(m => String(m).toLowerCase())
    : [];
  const wantAll =
    raw.length === 0 ||
    raw.some(
      t =>
        t === 'all' ||
        t === 'everything' ||
        t === 'full' ||
        t === 'overview' ||
        t === 'report'
    );

  const keys = new Set<string>();
  let wantAudience = include.includes('audience');
  let wantTopContent =
    include.includes('top_content') || include.includes('top content');
  let wantProfile = false;
  for (const term of raw) {
    if (
      /audience|demographic|country|countries|city|cities|gender|age|location/.test(
        term
      )
    )
      wantAudience = true;
    if (/top|best|performing|top post|top content/.test(term))
      wantTopContent = true;
    if (/follower|following|posts?|profile|bio/.test(term)) wantProfile = true;
    for (const [re, ks] of ALIAS)
      if (re.test(term)) ks.forEach(k => keys.add(k));
  }
  if (wantAll) {
    wantAudience = true;
    wantTopContent = true;
    wantProfile = true;
  }
  return { wantAll, keys, wantAudience, wantTopContent, wantProfile };
}

const num = (n: any) => typeof n === 'number' && Number.isFinite(n);
/** Format a number compactly with locale separators. */
function fmt(v: number): string {
  return num(v)
    ? Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })
    : String(v);
}

/**
 * Pull dashboard-accurate metrics for the workspace's account. IMPORTANT: the
 * per-account `followersCount` field on the SocialAccount doc is often 0/stale —
 * the dashboard's real follower count comes from AnalyticsService (Instagram
 * follower snapshots + follower analytics). We use that same source here so
 * VeeGPT's numbers always match the dashboard. Never throws.
 */
async function fetchAccountMetrics(
  workspaceId: string,
  platform: string
): Promise<AccountMetrics> {
  const m: AccountMetrics = {};
  try {
    const { analyticsService } = await import('../services/index');
    const [follow, perf] = await Promise.all([
      analyticsService.getFollowerAnalytics(workspaceId).catch(() => null),
      analyticsService.getPerformanceSummary(workspaceId, 30).catch(() => null),
    ]);
    const p = (platform || '').toLowerCase();
    if (follow) {
      m.followers =
        p === 'instagram'
          ? follow.instagramFollowers
          : p === 'facebook'
            ? follow.facebookFollowers
            : follow.currentFollowers;
      // Fall back to the combined count if the per-platform value is 0/empty.
      if (!m.followers) m.followers = follow.currentFollowers || undefined;
      m.monthlyGrowth = follow.monthlyGrowth;
      m.monthlyGained = follow.monthlyGained;
      m.monthlyLost = follow.monthlyLost;
      m.weeklyGrowth = follow.weeklyGrowth;
      m.growthPercentage = follow.growthPercentage;
      m.trend = follow.trend;
    }
    if (perf) {
      m.reach = perf.reach || perf.overview?.totalReach || undefined;
      m.avgEngagement =
        perf.engagement || perf.overview?.avgEngagement || undefined;
      m.posts = perf.posts || undefined;
      m.audience = perf.audience
        ? {
            country: perf.audience.country,
            city: perf.audience.city,
            genderAge: perf.audience.genderAge,
            activeTime: perf.audience.activeTime,
          }
        : undefined;
    }
  } catch (err: any) {
    vlog('generate:account-metrics-error', {
      workspaceId,
      error: err?.message,
    });
  }
  return m;
}

/**
 * Fetch dashboard-accurate KPIs for the selected account over a window, using
 * the SAME path the analytics dashboard uses (`legacyDashboardService`). Returns
 * a map of canonical key → { title, value, changePercent, trend } plus top
 * content. Never throws.
 */
async function fetchDashboardKpis(
  workspaceId: string,
  platform: string,
  tf: Timeframe,
  wantTopContent: boolean
): Promise<{ kpis: any[]; topContent: any[] }> {
  try {
    const { legacyDashboardService, multiPlatformRollupStore } =
      await import('../features/analytics/bridge');
    const spanMs = Date.parse(tf.to) - Date.parse(tf.from);
    const readQuery: any = {
      workspaceId,
      platforms: platform ? [platform] : [],
      granularity: 'daily',
      from: tf.from,
      to: tf.to,
    };
    const resp = await legacyDashboardService.buildDashboard('custom', {
      ...readQuery,
      accounts: [],
      // Previous equal-length window so KPIs carry change % + trend.
      compareFrom: new Date(Date.parse(tf.from) - spanMs).toISOString(),
      compareTo: tf.from,
      page: 1,
      pageSize: 50,
    });
    let topContent: any[] = [];
    if (wantTopContent) {
      topContent =
        (await multiPlatformRollupStore
          .getTopContent(readQuery)
          .catch(() => [])) || [];
    }
    return { kpis: Array.isArray(resp?.kpis) ? resp.kpis : [], topContent };
  } catch (err: any) {
    vlog('generate:dashboard-kpis-error', { workspaceId, error: err?.message });
    return { kpis: [], topContent: [] };
  }
}

/**
 * On-demand fetch of the SELECTED account's analytics — the same data the
 * dashboard shows. Plan-aware (the requested time range is clamped to the
 * subscription's analyticsHistoryDays) and SELECTIVE (returns only the metrics
 * the question needs, or the whole set on request). Follower/profile totals come
 * from AnalyticsService (dashboard source); time-ranged metrics come from the
 * dashboard read store; both avoid the stale account-doc fields.
 */
async function buildAccountDataText(
  scope: AccountScope | undefined,
  args: Record<string, unknown>
): Promise<string> {
  const workspaceId = scope?.workspaceId;
  if (!workspaceId) return 'No workspace/account context available.';

  const accounts: any[] =
    (await storage.getSocialAccountsByWorkspace(workspaceId).catch(() => [])) ||
    [];
  if (!accounts.length)
    return 'The user has no social accounts connected in this workspace, so there is no account data to report.';

  const wantId = scope?.accountId ? String(scope.accountId) : '';
  const wantUser =
    typeof args?.username === 'string'
      ? String(args.username).replace(/^@+/, '').toLowerCase()
      : '';
  const idOf = (a: any) => String(a.id || a._id || a.accountId || '');
  // Resolve a SPECIFIC account by selected id, by named @handle, or when the
  // workspace has exactly one account. Otherwise we're in workspace/all-accounts
  // mode (no single account in focus).
  const acct =
    (wantId && accounts.find(a => idOf(a) === wantId)) ||
    (wantUser &&
      accounts.find(
        a => String(a.username || '').toLowerCase() === wantUser
      )) ||
    (accounts.length === 1 ? accounts[0] : null) ||
    null;
  // The user named a handle we don't have connected.
  if (wantUser && !acct) {
    const list = accounts.map(a => `@${a.username} (${a.platform})`).join(', ');
    return `There's no connected account matching @${wantUser} in this workspace. Connected accounts: ${list}.`;
  }

  // Plan-aware time window + metric selection + feature gating.
  const plan = await getPlanAnalyticsInfo(scope?.userId);
  const tf = resolveTimeframe(args, plan.capDays);
  const sel = selectMetrics(args);
  const audienceAllowed = sel.wantAudience && plan.audienceInsights;
  const topContentAllowed = sel.wantTopContent && plan.contentPerformance;

  // Determine the platform scope. Single account → its platform. Workspace mode:
  // combine ALL platforms when the plan allows cross-platform analytics; otherwise
  // (Free) restrict to one platform and note the limitation.
  const allPlatforms = [
    ...new Set(accounts.map(a => String(a.platform || 'instagram'))),
  ];
  let platform: string; // '' = all platforms combined
  let crossPlatformNote = '';
  if (acct) {
    platform = String(acct.platform || 'instagram');
  } else if (plan.crossPlatform || allPlatforms.length === 1) {
    platform = ''; // combined
  } else {
    platform = allPlatforms[0];
    crossPlatformNote = `Combined multi-platform ("All accounts") analytics is a Creator+ feature — showing ${platform} only on the current plan.`;
  }
  const primary = acct || accounts[0]; // for doc-level fallbacks (bio/audience/sync)

  // Profile basics (current totals + follower growth) always come from the
  // proven AnalyticsService source; KPIs for the window come from the dashboard.
  const [profile, dash] = await Promise.all([
    fetchAccountMetrics(workspaceId, platform),
    fetchDashboardKpis(workspaceId, platform, tf, topContentAllowed),
  ]);

  vlog('generate:account-analytics', {
    workspaceId,
    account: acct ? acct.username : `ALL(${allPlatforms.join('+')})`,
    platform: platform || 'all',
    days: tf.effectiveDays,
    clamped: tf.clamped,
    cap: tf.capDays,
    wantAll: sel.wantAll,
    keys: [...sel.keys],
  });

  const scopeLabel = acct
    ? `@${acct.username} on ${platform}${acct.isVerified ? ' (verified)' : ''}`
    : platform
      ? `your ${platform} account(s)`
      : `your workspace — all connected accounts (${accounts.map(a => `@${a.username} on ${a.platform}`).join(', ')})`;

  const L: string[] = [];
  L.push(
    `LIVE analytics for ${scopeLabel} — time window: ${tf.label} (${tf.from.slice(0, 10)} → ${tf.to.slice(0, 10)}).`
  );
  if (crossPlatformNote)
    L.push(
      `- NOTE: ${crossPlatformNote} Mention that upgrading unlocks combined cross-platform analytics.`
    );
  if (tf.clamped) {
    L.push(
      `- NOTE: the user's plan allows ${Number.isFinite(tf.capDays) ? tf.capDays + ' days' : 'unlimited'} of analytics history, so the range was capped to ${tf.effectiveDays} days. Mention this and that upgrading unlocks a longer history.`
    );
  }

  // ── Profile / follower totals (current, not window-bound) ──────────────────
  if (sel.wantProfile || sel.keys.has('followers_total')) {
    const followers = firstNum(profile.followers, acct?.followersCount);
    const suffix = !acct && !platform ? ' (all accounts combined)' : '';
    L.push(
      followers != null
        ? `- Followers (current)${suffix}: ${fmt(followers as number)}`
        : '- Followers: not available yet (account needs a sync)'
    );
  }
  if (sel.wantProfile) {
    const line = [
      // Following/posts totals are per-account; only show for a single account.
      acct &&
        fact(
          'Following',
          firstNum(profile.followingCount, acct.followingCount)
        ),
      fact(
        'Total posts',
        firstNum(profile.posts, profile.mediaCount, acct?.mediaCount)
      ),
    ].filter(Boolean) as string[];
    L.push(...line);
    if (acct?.biography && sel.wantAll) L.push(`- Bio: ${acct.biography}`);
  }
  // Follower growth for the window.
  if (
    sel.wantAll ||
    sel.keys.has('new_followers') ||
    sel.keys.has('net_followers') ||
    sel.keys.has('follower_growth_rate') ||
    sel.keys.has('lost_followers')
  ) {
    const g = [
      fact('New followers (this window)', profile.monthlyGained),
      fact('Lost followers (this window)', profile.monthlyLost),
      fact('Net follower growth (this window)', profile.monthlyGrowth),
      fact('Follower growth rate', profile.growthPercentage, '%'),
      profile.trend && `- Follower trend: ${profile.trend}`,
    ].filter(Boolean) as string[];
    L.push(...g);
  }

  // ── Dashboard KPIs for the window (selective) ──────────────────────────────
  const skipKeys = new Set([
    'followers_total',
    'new_followers',
    'lost_followers',
    'net_followers',
    'follower_growth_rate',
  ]);
  const kpis = (dash.kpis || []).filter((k: any) => {
    if (k?.value === null || k?.value === undefined) return false;
    if (skipKeys.has(k.key)) return false; // already covered above from the proven source
    return sel.wantAll || sel.keys.has(k.key);
  });
  if (kpis.length) {
    L.push(`Metrics for ${tf.label}:`);
    for (const k of kpis) {
      const isRate = /rate|_by_/.test(k.key);
      const val = `${fmt(k.value)}${isRate ? '%' : ''}`;
      const chg = num(k.changePercent)
        ? ` (${k.changePercent > 0 ? '+' : ''}${k.changePercent}% vs previous ${tf.effectiveDays}d, trend ${k.trend})`
        : '';
      L.push(`- ${k.title}: ${val}${chg}`);
    }
  }

  // ── Audience demographics (Creator+ feature) ───────────────────────────────
  if (sel.wantAudience && !plan.audienceInsights) {
    L.push(
      "- Audience demographics are a Creator+ feature — not available on the user's current plan. Mention that upgrading unlocks audience insights."
    );
  } else if (audienceAllowed) {
    const country = topAudience(
      profile.audience?.country ?? primary?.audienceCountry,
      5
    );
    const city = topAudience(
      profile.audience?.city ?? primary?.audienceCity,
      5
    );
    const genderAge = topAudience(
      profile.audience?.genderAge ?? primary?.audienceGenderAge,
      6
    );
    if (country) L.push(`- Top audience countries: ${country}`);
    if (city) L.push(`- Top audience cities: ${city}`);
    if (genderAge) L.push(`- Audience gender/age: ${genderAge}`);
    if (!country && !city && !genderAge)
      L.push('- Audience demographics: not available yet for this account.');
  }

  // ── Top-performing content (Creator+ feature) ──────────────────────────────
  if (sel.wantTopContent && !plan.contentPerformance) {
    L.push(
      "- Top-performing-content analytics are a Creator+ feature — not available on the user's current plan. Mention that upgrading unlocks it."
    );
  } else if (topContentAllowed && dash.topContent?.length) {
    L.push('Top-performing posts:');
    for (const t of dash.topContent.slice(0, 5)) {
      const bits = [
        t.metrics?.reach != null && `${fmt(t.metrics.reach)} reach`,
        t.metrics?.likes != null && `${fmt(t.metrics.likes)} likes`,
        t.metrics?.comments != null && `${fmt(t.metrics.comments)} comments`,
      ]
        .filter(Boolean)
        .join(', ');
      L.push(
        `- ${t.label || t.id}${bits ? ` — ${bits}` : t.value != null ? ` — ${fmt(t.value)}` : ''}`
      );
    }
  }

  if (primary?.lastSyncAt)
    L.push(
      `(Last synced: ${new Date(primary.lastSyncAt).toISOString().slice(0, 10)}.)`
    );
  return L.join('\n');
}

/**
 * FIX 3: resolve a post's caption (and hashtags) up-front so the confirm card
 * shows real text instead of "Caption will be generated on confirm". This uses
 * the SAME code path as the /post-agent/execute endpoint (media analysis →
 * generateInstagramCaptions → hashtag extraction) so the card and the confirmed
 * post agree. Best-effort: on any failure it returns the plan's existing values,
 * so the flow falls back to the previous "generated on confirm" behaviour.
 */
async function resolvePlanCaptionForCard(
  plan: any,
  mediaUrls: string[],
  ctx: { userId?: string; workspaceId?: string },
  prefs: FullPreferences
): Promise<{ caption: string; hashtags: string[] }> {
  const userId = ctx.userId;
  const workspaceId = ctx.workspaceId;
  let caption = (plan?.caption || '').toString();
  let hashtags: string[] = Array.isArray(plan?.hashtags) ? plan.hashtags : [];
  if (
    (plan?.generateCaption || plan?.generateHashtags) &&
    Array.isArray(mediaUrls) &&
    mediaUrls.length
  ) {
    try {
      const isVideo =
        plan?.type === 'reel' ||
        /\.(mp4|mov|webm|m4v)(\?|$)/i.test(mediaUrls[0] || '');
      let mediaAnalysis: string | undefined;
      try {
        const desc = await withAIFeature(
          'veegpt.media_analysis',
          { userId, workspaceId },
          () =>
            aiServiceManager.analyzeMedia(
              mediaUrls[0],
              isVideo ? 'video' : 'image',
              prefs
            )
        );
        if (desc) mediaAnalysis = `Visual analysis: ${desc}`;
      } catch {
        /* best-effort media analysis */
      }
      const variations = await withAIFeature(
        'veegpt.post_caption',
        { userId, workspaceId },
        () =>
          aiServiceManager.generateInstagramCaptions({
            userId: userId || '',
            workspaceId: workspaceId || userId || '',
            topic: caption || 'Social media post',
            mediaAnalysis,
            postType:
              plan?.type === 'story' || plan?.type === 'reel'
                ? plan.type
                : 'post',
            platform: 'Instagram',
            preferences: prefs,
            singleVariation: true,
          })
      );
      const best = variations?.[0];
      if (best?.caption && plan?.generateCaption) caption = best.caption;
      if (plan?.generateHashtags) {
        const bestHashtags = (best as any)?.hashtags;
        if (Array.isArray(bestHashtags) && bestHashtags.length) {
          hashtags = bestHashtags.map((h: string) =>
            String(h).replace(/^#+/, '')
          );
        } else {
          const source: string = best?.caption || caption || '';
          const found = (source.match(/#[\p{L}\p{N}_]+/gu) || []).map(
            (h: string) => h.replace(/^#+/, '')
          );
          if (found.length) hashtags = Array.from(new Set(found));
        }
      }
    } catch {
      /* best-effort: fall back to the plan's existing caption/hashtags */
    }
  }
  // Strip a trailing hashtag block from the caption when we have a separate
  // hashtag list, so the card doesn't render them twice.
  if (hashtags.length && caption) {
    caption = caption.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, '').trim();
  }
  return { caption, hashtags };
}

async function streamGeneration(
  res: Response,
  convId: number,
  history: Array<{ role: string; content: string }>,
  preferences: FullPreferences,
  memorySummary?: string,
  userMemoryProfile?: string,
  workspaceContext?: string,
  memoryNote?: string,
  attachments: AIAttachment[] = [],
  tools?: ChatTool[],
  toolContext?: string,
  toolMediaUrls: string[] = [],
  toolLocalNow?: string,
  toolAccountUsernames: string[] = [],
  memorySave?: { userId?: string; workspaceId?: string },
  usageCtx?: { userId?: string; workspaceId?: string },
  /** When set, stream into this EXISTING assistant message (regeneration) and,
   *  on completion, append the result as a new variant instead of creating a
   *  brand-new message. Keeps the reply in the same position with 1/2, 2/2. */
  regenerate?: { messageId: number },
  /** Advanced VeeGPT options: the selected agent's persona directives, the
   *  selected social account scope (for on-demand get_account_details fetches),
   *  and the resolved VeeGPT tier (used to hard-block higher-tier tool calls). */
  advanced?: {
    agentDirectives?: string;
    accountScope?: AccountScope;
    veeGPTTier?: VeeGPTTier;
    /** The persona the user picked (id), for the composer's tier-gated
     *  persona module. */
    selectedAgentId?: string;
    /** A tool the user explicitly forced this turn, for intent classification
     *  on the composer path. */
    forcedTool?: string;
  }
): Promise<void> {
  // ── VeeGPT budget ──────────────────────────────────────────────────────────
  // Quota is NOT handled here any more. The turn already ran through the single
  // VGU engine in the `meterAI` middleware on this route, which:
  //   • atomically reserved the estimate before the request reached a provider,
  //   • established the metered context this stream runs inside, so every
  //     provider call below is recorded,
  //   • reconciles the charge from the real token counts when the stream ends.
  //
  // Two behaviours were deliberately deleted with the old code:
  //   1. The up-front `chargeVeegptUnits` write. It used the GET→INCRBY pattern
  //      that concurrent requests could race, and it charged a flat per-tier
  //      weight instead of measured usage.
  //   2. The silent step-down of an out-of-plan model selection. An explicit
  //      choice is now either honoured or refused with MODEL_QUOTA_EXHAUSTED
  //      before the stream opens — the server never quietly answers with a
  //      different model than the user picked.
  vlog('generate:start', {
    convId,
    historyLength: history.length,
    aiModel: preferences.aiModel,
    attachments: attachments.length,
    tools: tools?.length || 0,
    regenerate: !!regenerate,
  });

  const aiMessage = regenerate
    ? await ChatMessage.findOne({ id: regenerate.messageId })
    : await ChatMessage.create({
        id: (Date.now() % 1000000000) + Math.floor(Math.random() * 1000),
        conversationId: convId,
        role: 'assistant',
        content: ' ',
        tokensUsed: 0,
      });
  if (!aiMessage) {
    // The message to regenerate vanished — nothing to do.
    writeEvent(res, {
      type: 'error',
      error: 'Message not found',
      conversationId: convId,
    });
    return;
  }
  vlog('generate:placeholder-created', { convId, messageId: aiMessage.id });

  writeEvent(res, {
    type: 'aiMessageStart',
    messageId: aiMessage.id,
    conversationId: convId,
  });

  // There is no `modelNotice` any more: the model the user selected is the model
  // that answers. When their selection is out of quota the request is refused
  // before the stream opens, with a structured code the client turns into a
  // "Continue with Fast / Upgrade" choice — the decision belongs to the user.

  // Honest "thinking" status shown while we wait for the model's first token.
  // We do NOT fabricate fake progress phases anymore. For reasoning models
  // (GPT-5 family) the model is genuinely reasoning before it emits text, so we
  // label it as such and surface the configured effort. Once real text streams
  // (or a tool runs), this is replaced by the actual signal. A keep-alive
  // re-emits the SAME honest label so the client's auto-clear timeout doesn't
  // hide it during a long reasoning pass. (OpenAI does not expose the raw
  // chain-of-thought over the chat API, so we never invent reasoning steps.)
  // A single honest label shown until the first token. For a media turn we say
  // WHAT we're doing ("Watching your video…") instead of a blank "Thinking…",
  // so a long multimodal analysis reads as progress, not a stuck spinner. We do
  // NOT append the reasoning-effort level — it's an internal setting.
  const mediaThinkingStatus = (() => {
    const a = attachments || [];
    if (a.some(x => (x.mimeType || '').startsWith('video/')))
      return 'Watching your video…';
    if (a.some(x => x.mimeType === 'application/pdf'))
      return 'Reading your document…';
    if (a.some(x => /^image\//i.test(x.mimeType || '')))
      return 'Looking at your image…';
    return '';
  })();
  const thinkingStatus = mediaThinkingStatus || 'Thinking…';

  // De-duplicating status emitter. Two research-type tools running together
  // (e.g. search_web + research_trends) each stream the SAME phase phrases
  // ("Searching the web…", "Reading N sources…", "Analysing and summarising…"),
  // which looked like stuttering repeats. We emit each DISTINCT status only once
  // per turn so the sequence reads like a single, progressive line of reasoning.
  // (The keep-alive below is exempt — it must re-assert "Thinking…" to stay
  // visible — so it calls writeEvent directly.)
  const emittedStatuses = new Set<string>();
  const sendStatus = (status: string) => {
    if (!status || !activeGenerations.get(convId)) return;
    if (emittedStatuses.has(status)) return;
    emittedStatuses.add(status);
    writeEvent(res, { type: 'status', status, conversationId: convId });
  };
  writeEvent(res, {
    type: 'status',
    status: thinkingStatus,
    conversationId: convId,
  });
  // Keep-alive: re-assert the SAME honest label every 5s so it doesn't get
  // auto-cleared on the client during long reasoning. No fabricated phrasing.
  const statusInterval = setInterval(() => {
    writeEvent(res, {
      type: 'status',
      status: thinkingStatus,
      conversationId: convId,
    });
  }, 5000);

  let streamed = '';
  // Accumulated model "thinking"/reasoning summary. Persisted alongside the
  // answer (and on stop/abort) so the Thoughts panel is never lost.
  let reasoningText = '';
  let streamErrMsg = '';
  // Cancels the upstream model request when the user stops — so we stop spending
  // tokens instead of letting the model finish generating in the background.
  const abortController = new AbortController();
  activeAbortControllers.set(convId, abortController);
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  try {
    // ── Selective tool exposure (Req 11.6 / 11.7 / 15.2) ─────────────────────
    // When selective exposure is enabled (config default ON), narrow the
    // already-tier-filtered set to the intent∩tier union via `selectTools()`:
    //   • a tier-permitted, explicitly forced tool is ALWAYS kept (Req 11.6) —
    //     the forced-tool *directive* is already in `toolContext` unchanged;
    //   • `availableTools` is the set the handler built, and `selectTools`
    //     re-applies the tier filter idempotently, so nothing above the user's
    //     tier can ever slip in (never widens exposure);
    //   • selection FAILS OPEN to the full tier set when intent is ambiguous /
    //     empty, when selective exposure is unavailable, or on any error —
    //     `selectTools` never throws, and this block is additionally wrapped so
    //     any unexpected failure degrades to the untouched tier set (Req 19.6).
    if (tools?.length && getContextConfig().selectiveTools) {
      try {
        const historyArr = Array.isArray(history) ? history : [];
        const lastIdx = historyArr.length - 1;
        const last = lastIdx >= 0 ? historyArr[lastIdx] : undefined;
        const hasCurrent = !!last && last.role !== 'assistant';
        const currentMessage = hasCurrent ? last!.content ?? '' : '';
        const priorMessages = (
          hasCurrent ? historyArr.slice(0, lastIdx) : historyArr
        ) as unknown as Msg[];
        // Same classification the composer derives — deterministic, LLM-free,
        // and reused for tool selection so intent is resolved once per request.
        // Attached-video signal for the `video_edit` hybrid gate: a base64 video
        // attachment OR a hosted video URL forwarded via mediaUrls (large videos
        // always take the hosted path). Paired with a video keyword in the
        // classifier, this surfaces the tier-permitted `video_editor` tool.
        const hasVideoSignal =
          (attachments || []).some((a) => (a.mimeType || '').startsWith('video/')) ||
          (toolMediaUrls || []).some((u) =>
            /\.(mp4|mov|webm|m4v|avi|mkv|m3u8)(\?|#|$)/i.test(u)
          );
        const intent = classifyIntent({
          message: currentMessage,
          priorMessages,
          hasMedia: attachments.length > 0 || toolMediaUrls.length > 0,
          hasVideo: hasVideoSignal,
          forcedTool: advanced?.forcedTool,
          selectedAccountId: advanced?.accountScope?.accountId,
        });
        const selection = selectTools({
          tier: advanced?.veeGPTTier ?? 'advanced',
          intents: intent.intents,
          ambiguous: intent.ambiguous,
          forcedTool: advanced?.forcedTool,
          // No registered model advertises a distinct "selective exposure"
          // capability; the config flag is the single switch. `selectTools`
          // still fails open on ambiguity/empty intent, so unsupported features
          // are never forced onto a model (Req 15.2).
          selectiveToolsSupported: true,
          // Narrow only WITHIN what the handler already built (already
          // tier-filtered) — never re-introduce a tool the route withheld.
          availableTools: tools,
        });

        // ── ALWAYS-ON native capabilities: image generation / editing ─────────
        // The image tools are a first-class capability the MODEL must always be
        // free to decide on itself — never gated by the deterministic intent
        // classifier. They are not mapped to any `Capability`, so `selectTools`
        // could only keep them via fail-open. That produced a paradox: a CLEAR
        // request ("generate a luxury car image") classified as content_generation
        // (caption/hashtag) and DROPPED the image tools, so the model wrongly said
        // it couldn't create images — while a vague brief that failed open still
        // worked. We do NOT fix this with a keyword/regex intent rule; instead we
        // keep the image tools exposed whenever they are tier-permitted (i.e. the
        // handler already built them into `tools`) and let the LLM's own
        // understanding drive the call under `tool_choice: 'auto'`. Cost is ~2
        // tool definitions. Tier gating is preserved: a tier without image tools
        // never had them in `tools`, so nothing is re-introduced for it.
        const ALWAYS_ON_TOOLS = new Set(['generate_image', 'edit_image']);
        const selectedNames = new Set(
          selection.tools.map((t) => t.function?.name).filter((n): n is string => Boolean(n)),
        );
        const restoredAlwaysOn = tools.filter((t) => {
          const n = t.function?.name;
          return !!n && ALWAYS_ON_TOOLS.has(n) && !selectedNames.has(n);
        });
        tools = restoredAlwaysOn.length
          ? [...selection.tools, ...restoredAlwaysOn]
          : selection.tools;
        vlog('generate:selective-tools', {
          convId,
          exposed: tools.length,
          usedFallback: selection.usedFallback,
          alwaysOnRestored: restoredAlwaysOn.map((t) => t.function?.name),
        });
      } catch (err) {
        // Fail open: keep the full tier-permitted set the handler built and
        // surface a regression indicator (the optimized path degraded).
        vlog('generate:selective-tools-degraded', {
          convId,
          regression: true,
          error: (err as any)?.message || String(err),
        });
      }
    }

    // ── Context assembly (spec: veegpt-context-optimization) ─────────────────
    // The composed context path is the ONLY path. Any unexpected error here is
    // caught by this handler's outer try/catch, which surfaces a clean error
    // event to the client (there is no legacy fallback any more).
    // Make the LLM aware of every image in this conversation (uploaded /
    // generated / edited) so it can reason about WHICH one the user means when
    // they ask to edit or schedule — the "edit first, then post the edited one"
    // intent. Best-effort; never blocks the turn. Kept for the whole turn so the
    // schedule handler can validate a model-picked media URL against it.
    let convImagesForTurn: ConversationImage[] = [];
    let mediaContext = '';
    try {
      if (convId) {
        convImagesForTurn = await listConversationImages(convId);
        mediaContext = renderMediaManifest(convImagesForTurn);
      }
    } catch {
      /* best-effort media manifest */
    }

    // Make the model aware when a VIDEO is attached to THIS turn (the video
    // itself isn't passed as multimodal frames on the tool path). This is the
    // reliable signal that lets it choose the `video_editor` tool for an edit
    // request. Included via the always-on media-context channel so it survives
    // the composer's tool-context relevance gate. Video is detected from a
    // base64 attachment OR a hosted video URL forwarded in `mediaUrls`.
    {
      const hasVideoThisTurn =
        (attachments || []).some((a) => (a.mimeType || '').startsWith('video/')) ||
        (toolMediaUrls || []).some((u) =>
          /\.(mp4|mov|webm|m4v|avi|mkv|m3u8)(\?|#|$)/i.test(u)
        );
      if (hasVideoThisTurn) {
        const videoNote =
          'The user attached a VIDEO to this turn. If they are asking to EDIT or transform the video ' +
          '(trim/cut, remove an object/person, change or remove the background, add captions, apply a ' +
          'colour/cinematic look, reframe/aspect ratio, speed, reels/shorts export, etc.), call the ' +
          '`video_editor` tool with a clear `instruction`. Do NOT try to edit the video yourself and do ' +
          'NOT use `edit_image` for a video. When editing the video\u2019s captions/subtitles, call ONLY ' +
          '`video_editor` \u2014 do NOT also call `generate_caption`/`generate_hashtags` in the same turn ' +
          '(those write a social-media POST caption, which is a separate follow-up request). ' +
          'If they only want it described, answer normally.';
        mediaContext = mediaContext ? `${mediaContext}\n\n${videoNote}` : videoNote;
      }
    }

    // Follow-up-turn detection. When NO video is attached this turn (and there
    // is no blocking, non-image/non-video attachment), the workspace/user may
    // still have a previously-uploaded, analyzed video that the execution path
    // (runChatVideoEditTurn) will REUSE. In that case the model must still be
    // offered the `video_editor` tool and told the video is available WITHOUT
    // re-upload — otherwise it asks the user to re-attach it. This mirrors the
    // EXACT source resolution the execution path uses (newest project →
    // newest analyzed source with durationMs > 0), so exposure and execution
    // can never disagree. Best-effort: any error degrades to `false` and never
    // throws into the turn (same discipline as the media-manifest block above).
    let hasExistingVideoForEdit = false;
    try {
      const hasVideoThisTurn =
        (attachments || []).some((a) => (a.mimeType || '').startsWith('video/')) ||
        (toolMediaUrls || []).some((u) =>
          /\.(mp4|mov|webm|m4v|avi|mkv|m3u8)(\?|#|$)/i.test(u)
        );
      const hasBlockingAttachment = (attachments || []).some((a) => {
        const m = a.mimeType || '';
        return !m.startsWith('image/') && !m.startsWith('video/');
      });
      const alreadyHasVideoTool = (tools || []).some(
        (t) => t.function?.name === 'video_editor'
      );
      const wsId = usageCtx?.workspaceId;
      const uId = usageCtx?.userId;
      // Pure follow-up turn only: no fresh video, no blocking attachment, tool
      // not already offered, and both scope ids present.
      if (
        !hasVideoThisTurn &&
        !hasBlockingAttachment &&
        !alreadyHasVideoTool &&
        wsId &&
        uId
      ) {
        const [{ mongoVideoProjectStore }, { VideoSourceModel }] = await Promise.all([
          import('../features/video-editor/api/project.routes'),
          import('../models/VideoEditor'),
        ]);
        const projects = await mongoVideoProjectStore
          .listByOwner(wsId, uId)
          .catch(
            () => [] as Awaited<ReturnType<typeof mongoVideoProjectStore.listByOwner>>
          );
        if (projects.length > 0) {
          const projectId = projects[0].projectId;
          const src = await VideoSourceModel.findOne({ projectId })
            .sort({ createdAt: -1 })
            .lean()
            .catch(() => null);
          const s = src as Record<string, unknown> | null;
          hasExistingVideoForEdit =
            !!s && typeof s.durationMs === 'number' && (s.durationMs as number) > 0;
        }
      }
    } catch {
      /* best-effort follow-up video detection; degrade to false */
    }
    if (hasExistingVideoForEdit) {
      const followUpVideoNote =
        'A previously-uploaded video from earlier in this conversation is available to edit. ' +
        'If the user asks to edit/transform the video (trim, captions, colour/cinematic look, ' +
        'reframe/aspect ratio, speed, reels/shorts, remove object/background, etc.), call the ' +
        '`video_editor` tool with a clear `instruction` \u2014 do NOT ask them to re-upload the ' +
        'video, and do NOT describe the edit in prose instead of calling the tool.';
      mediaContext = mediaContext
        ? `${mediaContext}\n\n${followUpVideoNote}`
        : followUpVideoNote;
    }

    const prompt: string = composeWithComposer({
      history,
      prefs: preferences,
      memorySummary,
      userMemoryProfile,
      workspaceContext,
      memoryNote,
      toolContext,
      tools,
      tier: advanced?.veeGPTTier ?? 'advanced',
      selectedAgentId: advanced?.selectedAgentId,
      forcedTool: advanced?.forcedTool,
      selectedAccountId: advanced?.accountScope?.accountId,
      hasMedia: attachments.length > 0 || toolMediaUrls.length > 0,
      mediaContext,
      // Selected model + privacy-safe request ids for the developer-
      // retrievable telemetry surface (task 12.2, Req 16.3). No content.
      model: preferences.aiModel,
      telemetryCtx: {
        userId: usageCtx?.userId,
        workspaceId: usageCtx?.workspaceId,
        requestId: String(convId),
      },
    });
    vlog('generate:prompt-built', { convId, promptLength: prompt.length });

    let firstChunk = true;
    let chunkCount = 0;
    // Split attachments: images can go through the tool path (the model can call
    // edit_image/generate_image on them — and, via LiteLLM/Gemini, still SEE
    // them because we pass them as inline image inputs to the tool stream).
    // Non-image attachments (PDF/video) must keep the multimodal analysis path
    // (generateTextStream), which is where document/video understanding lives.
    const imageAttachmentsForTools = (attachments || []).filter((a) =>
      (a.mimeType || '').startsWith('image/')
    );
    const videoAttachmentsForTools = (attachments || []).filter((a) =>
      (a.mimeType || '').startsWith('video/')
    );
    const nonImageAttachments = (attachments || []).filter(
      (a) => !(a.mimeType || '').startsWith('image/')
    );
    // Truly-blocking attachments are the ones that MUST take the plain
    // multimodal analysis path (PDFs and any other non-image, non-video file).
    // Images and videos are handled by the native tool path, so they must NOT
    // disable tools.
    const blockingAttachments = (attachments || []).filter((a) => {
      const m = a.mimeType || '';
      return !m.startsWith('image/') && !m.startsWith('video/');
    });
    // A video attached THIS turn: a small inline (base64) attachment OR a hosted
    // video URL forwarded via `mediaUrls` (large videos always take the hosted
    // /api/chat/attachments/upload path, so their bytes never ride in the base64
    // attachments array). Either signal means the model should be free to call
    // the `video_editor` tool.
    const VIDEO_URL_RE = /\.(mp4|mov|webm|m4v|avi|mkv|m3u8)(\?|#|$)/i;
    const hostedVideoUrlForTurn =
      (toolMediaUrls || []).find((u) => VIDEO_URL_RE.test(u)) || null;
    const hasVideoForEdit =
      videoAttachmentsForTools.length > 0 || !!hostedVideoUrlForTurn;
    // Native image tools must stay available on an image-only upload turn. The
    // message endpoints disable ALL tools whenever any attachment is present, so
    // on a first-message image upload `tools` arrives empty and edit_image is
    // never offered (the exact bug: upload + "add a man near me" → empty reply).
    // Re-add the tier-permitted image tools here; the model still decides whether
    // to call them (no keyword/intent heuristic).
    if (imageAttachmentsForTools.length && blockingAttachments.length === 0) {
      const tier = advanced?.veeGPTTier ?? 'advanced';
      const imgTools = filterToolsByTier(VEEGPT_IMAGE_TOOLS, tier);
      const existing = new Set((tools || []).map((t) => t.function?.name).filter(Boolean));
      const toAdd = imgTools.filter(
        (t) => t.function?.name && !existing.has(t.function.name)
      );
      if (toAdd.length) tools = [...(tools || []), ...toAdd];
    }
    // Native video-editor tool must likewise stay available on a video-upload
    // turn. A lone video no longer forces the plain multimodal path — we re-add
    // the tier-permitted `video_editor` tool and let the model decide whether to
    // call it. PDFs/other files still disable tools and route to analysis below.
    if (hasVideoForEdit && blockingAttachments.length === 0) {
      const tier = advanced?.veeGPTTier ?? 'advanced';
      const vidTools = filterToolsByTier(VEEGPT_VIDEO_TOOLS, tier);
      const existing = new Set((tools || []).map((t) => t.function?.name).filter(Boolean));
      const toAdd = vidTools.filter(
        (t) => t.function?.name && !existing.has(t.function.name)
      );
      if (toAdd.length) tools = [...(tools || []), ...toAdd];
    }
    // Pure follow-up turn: NO video attached this turn, but the workspace/user
    // already has a previously-uploaded analyzed video source that the execution
    // path will REUSE (detected up in the media-context block). Expose the same
    // tier-permitted video tools so the model can call `video_editor` without
    // asking the user to re-upload. Same dedup pattern as the block above.
    if (
      hasExistingVideoForEdit &&
      !hasVideoForEdit &&
      blockingAttachments.length === 0
    ) {
      const tier = advanced?.veeGPTTier ?? 'advanced';
      const vidTools = filterToolsByTier(VEEGPT_VIDEO_TOOLS, tier);
      const existing = new Set((tools || []).map((t) => t.function?.name).filter(Boolean));
      const toAdd = vidTools.filter(
        (t) => t.function?.name && !existing.has(t.function.name)
      );
      if (toAdd.length) tools = [...(tools || []), ...toAdd];
    }
    // Use the tool-aware stream when tools are provided AND there are no
    // BLOCKING attachments. An image- or video-only upload ("edit this") keeps
    // its tools (previously any attachment disabled all tools, so edit_image /
    // video_editor was never available and the turn produced an empty response).
    // PDFs/other files still route to the plain multimodal analysis stream below.
    const useTools = !!tools?.length && blockingAttachments.length === 0;
    try {
      // IMPORTANT: run the ENTIRE stream consumption inside withAIFeature, not
      // just the generator creation. AsyncLocalStorage context is only active
      // for the duration of the callback — if we only wrap the `create()` call
      // and then `for await` outside it, the generator's body (including its
      // final recordAIUsage) executes with NO context and the usage is logged
      // as 'other' instead of 'veegpt.chat'. Wrapping the loop keeps the feature
      // tag (and thus correct dashboard attribution + cache stats) intact.
      await withAIFeature('veegpt.chat', usageCtx, async () => {
        if (useTools) {
          const stream = aiServiceManager.generateChatStreamWithTools(
            prompt,
            tools!,
            preferences,
            abortController.signal,
            // Give the tool-calling model the uploaded media so it can SEE it
            // AND decide edit vs. describe itself. Images ride the Gemini/LiteLLM
            // path; a video routes the turn to native Gemini (the only model that
            // reads video) which watches it AND can still call video_editor.
            [...imageAttachmentsForTools, ...videoAttachmentsForTools]
          );
          for await (const ev of stream) {
            if (!activeGenerations.get(convId)) {
              vlog('generate:stopped', { convId });
              abortController.abort();
              break;
            }
            if (ev.type === 'reasoning') {
              // Real model thinking (Gemini). Stream it as a distinct event so
              // the client shows a live "Thinking" panel instead of hardcoded
              // status text. Does not touch the answer text. Accumulated so it
              // can be persisted (survives refresh and stop/abort).
              reasoningText += ev.delta ?? '';
              writeEvent(res, {
                type: 'reasoning',
                delta: ev.delta,
                messageId: aiMessage.id,
                conversationId: convId,
              });
            } else if (ev.type === 'text') {
              if (firstChunk) {
                clearInterval(statusInterval);
                firstChunk = false;
                vlog('generate:first-chunk', {
                  convId,
                  messageId: aiMessage.id,
                });
              }
              chunkCount += 1;
              streamed += ev.delta;
              writeEvent(res, {
                type: 'chunk',
                content: streamed,
                messageId: aiMessage.id,
              });
              recordPartialAnswer(convId, aiMessage.id, streamed);
            } else if (ev.type === 'toolCall') {
              // Guard against the model emitting the SAME singleton tool twice
              // in one stream (e.g. two research calls) — keep only the first.
              // remember_fact is intentionally NOT a singleton — the model may save
              // several distinct durable facts in one turn.
              const SINGLETON = new Set([
                'get_workspace_data',
                'get_account_details',
                'get_analytics_insight',
                'get_best_posting_time',
                'research_trends',
                'search_web',
                'deep_research',
              ]);
              const already =
                SINGLETON.has(ev.name) &&
                toolCalls.some(t => t.name === ev.name);
              if (!already) {
                toolCalls.push({ name: ev.name, args: ev.args });
                vlog('generate:tool-call', { convId, name: ev.name });
              }
            }
          }

          // ── MULTI-TOOL AGENTIC FOLLOW-UP ──────────────────────────────────
          // Smaller models (esp. Gemini) often emit only ONE tool call per turn
          // even when the user asked for several actions. To make VeeGPT a real
          // multitasker, we re-prompt up to 2 more times: "you already did X —
          // what OTHER tool calls does the user's request still need?" and merge
          // any new calls. We stop as soon as a pass yields no new tool call.
          // Skip the agentic multi-step loop when the turn ONLY involves
          // research/info singletons — those are one-shot and re-prompting just
          // risks a duplicate card and wastes an LLM call. Only run follow-ups
          // when an action-capable tool (post/edit/memory) was used.
          const INFO_ONLY = new Set([
            'get_workspace_data',
            'get_account_details',
            'get_analytics_insight',
            'get_best_posting_time',
            'research_trends',
            'search_web',
            'deep_research',
          ]);
          const onlyInfoSingletons =
            toolCalls.length > 0 && toolCalls.every(t => INFO_ONLY.has(t.name));
          let followUps = 0;
          while (
            !onlyInfoSingletons &&
            toolCalls.length > 0 &&
            followUps < 2 &&
            activeGenerations.get(convId)
          ) {
            const done = toolCalls
              .map(t => `${t.name}(${JSON.stringify(t.args)})`)
              .join('; ');
            const followPrompt =
              prompt +
              `\n\n[MULTI-STEP CHECK] You have ALREADY made these tool calls this turn: ${done}. ` +
              "Re-read the user's LAST message. If it requested MORE distinct actions that are NOT yet covered by the calls above, " +
              'emit ONLY the additional tool call(s) now (no text, no repeats). ' +
              'If every requested action is already covered, respond with a single word: DONE.';
            let newCallsThisPass = 0;
            let followText = '';
            try {
              const fstream = aiServiceManager.generateChatStreamWithTools(
                followPrompt,
                tools!,
                preferences,
                abortController.signal
              );
              for await (const ev of fstream) {
                if (!activeGenerations.get(convId)) {
                  abortController.abort();
                  break;
                }
                if (ev.type === 'text') {
                  followText += ev.delta;
                } else if (ev.type === 'toolCall') {
                  // Singleton tools (read-only research/data/insight) make sense
                  // only ONCE per turn — dedup by NAME so a follow-up pass can't
                  // add a second research/search card with reworded args. Action
                  // tools (edit/memory) still dedup by name+args so the model can
                  // act on multiple distinct posts.
                  const SINGLETON = new Set([
                    'get_workspace_data',
                    'get_account_details',
                    'get_analytics_insight',
                    'get_best_posting_time',
                    'research_trends',
                    'search_web',
                    'deep_research',
                  ]);
                  const dup = SINGLETON.has(ev.name)
                    ? toolCalls.some(t => t.name === ev.name)
                    : toolCalls.some(
                        t =>
                          t.name === ev.name &&
                          JSON.stringify(t.args) === JSON.stringify(ev.args)
                      );
                  if (!dup) {
                    toolCalls.push({ name: ev.name, args: ev.args });
                    newCallsThisPass += 1;
                    vlog('generate:tool-call-followup', {
                      convId,
                      name: ev.name,
                      pass: followUps + 1,
                    });
                  }
                }
              }
            } catch (e: any) {
              vlog('generate:followup-error', { convId, error: e?.message });
              break;
            }
            followUps += 1;
            // Stop when the model signals completion or adds nothing new.
            if (newCallsThisPass === 0 || /\bDONE\b/i.test(followText)) break;
          }
        } else {
          const chatStream = aiServiceManager.generateTextStream(
            prompt,
            preferences,
            attachments,
            abortController.signal
          );
          for await (const chunk of chatStream) {
            if (!activeGenerations.get(convId)) {
              vlog('generate:stopped', { convId });
              abortController.abort();
              break;
            }
            if (firstChunk) {
              clearInterval(statusInterval);
              firstChunk = false;
              vlog('generate:first-chunk', { convId, messageId: aiMessage.id });
            }
            chunkCount += 1;
            streamed += chunk;
            // Cumulative text — client SETs (not appends), so duplicate frames are harmless.
            writeEvent(res, {
              type: 'chunk',
              content: streamed,
              messageId: aiMessage.id,
            });
            recordPartialAnswer(convId, aiMessage.id, streamed);
          }
        }
      });
      vlog('generate:stream-finished', {
        convId,
        chunkCount,
        streamedLength: streamed.length,
        toolCalls: toolCalls.length,
      });
    } catch (streamErr: any) {
      vlog('generate:stream-error', {
        convId,
        error: streamErr?.message,
        streamedLength: streamed.length,
      });
      streamErrMsg = streamErr?.message || '';
      console.error('[VEEGPT] Streaming failed:', streamErr?.message);
    }

    // NOTE: there is deliberately NO "retry the whole thing without streaming"
    // fallback here any more. It fired a SECOND full model call after the first
    // had already failed, doubling the wait before the user saw an error, while
    // re-running the SAME model that had just failed — so it almost never
    // recovered anything. A failed stream now surfaces as a real error.

    clearInterval(statusInterval);

    // RECOVERY: a non-tool-capable fallback model sometimes writes the tool call
    // as TEXT (e.g. 'reschedule_post(contentId="...", scheduledLocal="...")')
    // instead of a real function call. Detect that pattern and convert it into a
    // proper toolCall so the right card is produced — and clear the leaked text.
    if (!toolCalls.length && streamed) {
      const recovered = recoverLeakedToolCalls(streamed);
      if (recovered.length) {
        toolCalls.push(...recovered);
        vlog('generate:recovered-tool-call', {
          convId,
          names: recovered.map(r => r.name),
        });
        streamed = '';
      }
    }

    // ── Deduplicate research tools ────────────────────────────────────────────
    // Deep research already runs a full multi-agent web-research pass. If the
    // model ALSO emitted search_web / research_trends in the same turn, running
    // them produces a redundant second research (an extra card, a re-appearing
    // "Searching the web…" status, and a duplicate/summary-less answer). When
    // deep_research is present, drop the lighter research tools entirely.
    if (toolCalls.some(t => t.name === 'deep_research')) {
      const before = toolCalls.length;
      const kept = toolCalls.filter(
        t => !['search_web', 'research_trends'].includes(t.name)
      );
      if (kept.length !== before) {
        toolCalls.length = 0;
        toolCalls.push(...kept);
        vlog('generate:dedupe-research', { convId, dropped: before - kept.length });
      }
    }

    // ── Tool-status feedback (#10) ────────────────────────────────────────────
    // The info/data/edit tools can take a few seconds (analytics, web research).
    // Emit a human status so the chat shows "Researching trends…" instead of
    // sitting silent until the card appears.
    if (toolCalls.length && activeGenerations.get(convId)) {
      // Always surface a specific, correct status for the tool(s) actually being
      // called — using the shared TOOL_STATUS_LABELS map (complete for every
      // tool) with a humanized fallback so nothing ever shows a stale/random
      // phrase. If several tools fire together, show the first with a "+N more".
      const names = toolCalls.map(t => t.name).filter(Boolean);
      if (names.length) {
        // Stop the generic "Thinking…" keep-alive so it can't overwrite the
        // specific tool label a few seconds later (which made tool statuses
        // appear to flip back to "Thinking…" / never stick).
        clearInterval(statusInterval);
        // ONE natural line for all the tools running (no "(+N more)").
        sendStatus(combinedToolStatus(names));
      }
    }

    // ── RELIABLE MEMORY (tool-only, never misses) ─────────────────────────────
    // A single-pass model often just answers and never emits remember_fact —
    // especially deep in an agent persona or when other tools are competing. So
    // when long-term memory is on and the model did NOT already act on memory
    // this turn, run ONE focused pass that offers ONLY the memory tools. With no
    // other tool or persona pulling on it, the model reliably calls remember_fact
    // for any durable fact. It's still the TOOL doing the saving (handled below),
    // just given a clean, dedicated turn — no separate heuristic extractor.
    const memHandledInline = toolCalls.some(t =>
      ['remember_fact', 'update_memory', 'forget_memory'].includes(t.name)
    );
    if (
      memorySave?.userId &&
      memorySave?.workspaceId &&
      !memHandledInline &&
      activeGenerations.get(convId)
    ) {
      try {
        const lastUser =
          [...history]
            .reverse()
            .find(h => h.role === 'user')
            ?.content?.trim() || '';
        if (lastUser) {
          const memPrompt =
            'You maintain a long-term memory about a user across all their chats with VeeGPT (a social-media assistant).\n' +
            (userMemoryProfile && userMemoryProfile.trim()
              ? `Things you ALREADY remember (do NOT save these again):\n${userMemoryProfile.trim()}\n\n`
              : '') +
            `The user's latest message was:\n"""${lastUser}"""\n\n` +
            'Decide what (if anything) to remember from THIS message:\n' +
            "- If it states a DURABLE fact about the user or their brand/business (name, brand, niche, product/app they built, target audience, goals, ongoing projects, posting schedule, tone/style, dos & don'ts, locations, or any stable preference), call remember_fact ONCE FOR EACH distinct fact (third person, concise).\n" +
            '- If they explicitly asked you to remember/note something, save exactly that.\n' +
            "- If a new detail REPLACES an existing remembered fact on the same topic, call update_memory with that fact's id.\n" +
            '- Do NOT save transient chit-chat, greetings, pure questions, or one-off task requests (e.g. "schedule this post"), and do NOT re-save anything already remembered.\n' +
            'Respond with ONLY the tool call(s), or the single word NONE if there is nothing durable to save.';
          await withAIFeature('veegpt.memory_update', usageCtx, async () => {
            const memStream = aiServiceManager.generateChatStreamWithTools(
              memPrompt,
              VEEGPT_MEMORY_TOOLS_ALL,
              preferences,
              abortController.signal
            );
            for await (const ev of memStream) {
              if (!activeGenerations.get(convId)) break;
              if (
                ev.type === 'toolCall' &&
                ['remember_fact', 'update_memory', 'forget_memory'].includes(
                  ev.name
                )
              ) {
                const dup = toolCalls.some(
                  t =>
                    t.name === ev.name &&
                    JSON.stringify(t.args) === JSON.stringify(ev.args)
                );
                if (!dup) {
                  toolCalls.push({ name: ev.name, args: ev.args });
                  vlog('generate:memory-pass-call', { convId, name: ev.name });
                }
              }
              // ignore any text — this pass exists only to emit memory tool calls
            }
          });
        }
      } catch (e: any) {
        vlog('generate:memory-pass-error', { convId, error: e?.message });
      }
    }

    // ── Data + edit tools (workspace access) — MULTI-TOOL ─────────────────────
    // The model may call SEVERAL tools in one turn (e.g. update one post's
    // caption AND cancel another, plus look up data). We process ALL of them:
    //   • get_workspace_data → a LIST CARD (read-only)
    //   • each edit tool → its OWN EDIT CONFIRM CARD (applied only on confirm)
    //   • schedule_post → a post-confirm card (handled below)
    //   • remember_fact → saved (handled below)
    let listCardForDb: any = null;
    const editCardsForDb: any[] = [];
    const infoCardsForDb: any[] = [];
    const wsId = usageCtx?.workspaceId || memorySave?.workspaceId;
    // Defense-in-depth: the model is only offered tier-allowed tools, but drop
    // any tool call that isn't permitted for this tier before we dispatch it
    // (belt-and-suspenders against any non-model-originated tool call).
    const veeGPTTier: VeeGPTTier = advanced?.veeGPTTier ?? 'advanced';
    const allowedCalls = toolCalls.filter(t =>
      isToolAllowedForTier(t.name, veeGPTTier)
    );
    const editCalls = allowedCalls.filter(t =>
      [
        'reschedule_post',
        'cancel_scheduled_post',
        'update_post_caption',
        'delete_post',
        'duplicate_post',
      ].includes(t.name)
    );
    const infoCallsRaw = allowedCalls.filter(t =>
      [
        'generate_caption',
        'generate_hashtags',
        'generate_document',
        'generate_image',
        'edit_image',
        'video_editor',
        'show_media_options',
        'get_analytics_insight',
        'get_best_posting_time',
        'research_trends',
        'search_web',
        'deep_research',
      ].includes(t.name)
    );
    // Same-turn intent guard: a `video_editor` call means this turn is EDITING
    // the video (e.g. burning captions/subtitles INTO the video), NOT authoring
    // a social post. Models nonetheless sometimes ALSO fire `generate_caption`/
    // `generate_hashtags` in the same turn — the observed misfire. That produces
    // an unwanted social-post caption the user didn't ask for AND stalls the
    // rendered-video result card behind the parallel caption/hashtag tool. So
    // when `video_editor` is present we DROP those social-post content tools
    // from this turn. If the user actually wants a post caption for the edited
    // video, that's a separate follow-up turn (the editor already supports
    // re-editing the existing video without re-upload). Computed from
    // `infoCallsRaw` so it's independent of the image-dedup filter below.
    const hasVideoEditorCall = infoCallsRaw.some(t => t.name === 'video_editor');
    // Collapse duplicate image-producing calls: a single user request is ONE
    // image. Models sometimes emit edit_image/generate_image TWICE in one turn
    // (the exact "one edit → two identical images" bug). Keep only the FIRST
    // image tool call and drop the rest; variations are produced INSIDE a single
    // generate_image via its `count`, never via repeated calls. Non-image info
    // tools are unaffected.
    let sawImageCall = false;
    const infoCalls = infoCallsRaw.filter(t => {
      // Drop social-post content tools when this turn is a video edit (see note
      // above). No-op for every non-video-editor turn — normal post/caption
      // flows are untouched.
      if (
        hasVideoEditorCall &&
        (t.name === 'generate_caption' || t.name === 'generate_hashtags')
      ) {
        vlog('generate:suppress-post-caption-on-video-edit', {
          convId,
          dropped: t.name,
        });
        return false;
      }
      if (t.name === 'generate_image' || t.name === 'edit_image') {
        if (sawImageCall) {
          vlog('generate:dedup-image-call', { convId, tool: t.name });
          return false;
        }
        sawImageCall = true;
      }
      return true;
    });
    const dataCall = allowedCalls.find(t => t.name === 'get_workspace_data');
    const introLines: string[] = [];
    // The single image produced by an image tool THIS turn (edit_image or a
    // single-option generate_image). When the same turn also schedules a post,
    // this becomes the post's media so "edit it, then schedule" always publishes
    // the EDITED image — not the original upload. Only a single result binds
    // (multi-option generations leave the choice to the user).
    let producedImageUrl: string | null = null;

    // ── SELECTED-ACCOUNT on-demand data → grounded synthesis ──────────────────
    // The model decided this question needs the selected account's real data, so
    // we fetch it now (from the Redis snapshot) and run a second, grounded pass
    // that answers the user's question using ONLY those live numbers. This is how
    // the account's heavy data stays OUT of every prompt yet is available the
    // moment a question actually needs it.
    const accountCall = toolCalls.find(t => t.name === 'get_account_details');
    if (accountCall && activeGenerations.get(convId)) {
      // Route through the de-duplicating emitter so it never repeats a status
      // already shown (e.g. when paired with another tool in the same turn).
      sendStatus('Reading your account data…');
      let dataText = await buildAccountDataText(
        advanced?.accountScope,
        accountCall.args
      );
      // Tool-result reduction (Req 12). The account data is opaque,
      // reasoning-required analytics text, so `reduceToolResult` retains it
      // whole even above the budget (Req 12.4 fail-safe); the guard exists so
      // that any oversized tool payload re-entering this synthesis pass is
      // bounded rather than inflating input tokens on the next request.
      {
        const { toolResultMaxTokens } = getContextConfig();
        const reduced = reduceToolResult(dataText, [], toolResultMaxTokens);
        dataText = String(reduced.payload ?? dataText);
        vlog('generate:tool-result-reduce', {
          convId,
          tool: 'get_account_details',
          reduced: reduced.reduced,
          retainedAboveMax: reduced.retainedAboveMax,
          tokensBefore: reduced.tokensBefore,
          tokensAfter: reduced.tokensAfter,
        });
      }
      vlog('generate:account-synthesis', { convId, hasData: !!dataText });
      const synthPrompt =
        prompt +
        `\n\n--- Selected account — LIVE data fetched from the database for THIS question ---\n${dataText}\n\n` +
        "[CRITICAL: Answer the user's LAST message using ONLY the numbers in the data block above. " +
        'Report each figure EXACTLY as written — do not round, scale, estimate, combine, or invent any number. ' +
        'If a specific value is "not available" or absent from the block above, say it isn\'t available yet (suggest syncing/reconnecting the account) — NEVER make up a number. ' +
        'Be specific and conversational, and add one useful takeaway.]';
      try {
        await withAIFeature('veegpt.chat', usageCtx, async () => {
          const synth = aiServiceManager.generateTextStream(
            synthPrompt,
            preferences,
            [],
            abortController.signal
          );
          let synthFirst = true;
          for await (const chunk of synth) {
            if (!activeGenerations.get(convId)) break;
            if (synthFirst) {
              clearInterval(statusInterval);
              synthFirst = false;
            }
            streamed += chunk;
            writeEvent(res, {
              type: 'chunk',
              content: streamed,
              messageId: aiMessage.id,
            });
            recordPartialAnswer(convId, aiMessage.id, streamed);
          }
        });
      } catch (synthErr: any) {
        vlog('generate:account-synthesis-error', {
          convId,
          error: synthErr?.message,
        });
        if (!streamed.trim()) introLines.push(dataText);
      }
    }

    if (dataCall && activeGenerations.get(convId)) {
      const built = await buildDataResult(wsId, dataCall.args);
      vlog('generate:tool-data', {
        convId,
        resource: (dataCall.args as any)?.resource,
        count: built.items?.length || 0,
      });
      if (built.listCard) {
        listCardForDb = built.listCard;
        writeEvent(res, {
          type: 'listCard',
          listCard: listCardForDb,
          messageId: aiMessage.id,
          conversationId: convId,
        });
      }
      introLines.push(built.summaryText);
    }

    if (editCalls.length && activeGenerations.get(convId)) {
      for (const call of editCalls) {
        const built = await buildEditCard(
          wsId,
          call.name,
          call.args,
          toolLocalNow
        );
        if (built.error) {
          introLines.push(built.error);
        } else if (built.card) {
          const cardWithId = {
            id: `${aiMessage.id}_${editCardsForDb.length}`,
            ...built.card,
          };
          editCardsForDb.push(cardWithId);
          writeEvent(res, {
            type: 'editCard',
            editCard: cardWithId,
            messageId: aiMessage.id,
            conversationId: convId,
          });
          vlog('generate:edit-card', { convId, action: call.name });
        }
      }
      if (
        editCardsForDb.length &&
        !introLines.some(l => /review|confirm/i.test(l))
      ) {
        introLines.push(
          editCardsForDb.length > 1
            ? `I\u2019ve prepared ${editCardsForDb.length} changes — review and confirm each below:`
            : 'Review this change and confirm below:'
        );
      }
    }

    // ── Info/assist tools (caption/hashtag/insight/best-time/trends) ──────────
    // Non-mutating tools that produce an INFO CARD. Each is independent so a
    // multi-tool turn (e.g. caption + hashtags) renders multiple cards.
    if (infoCalls.length && activeGenerations.get(convId)) {
      // Deep research (Tavily multi-agent) can run for minutes with long gaps
      // between status phrases. Emit a byte-level keep-alive (a bare newline the
      // client safely skips) every 10s so proxies/tunnels don't drop the idle
      // streaming connection while we wait for the research task to finish.
      // Long provider calls (deep research, and image generation/editing which
      // can take 15-40s) leave the stream idle. Without periodic bytes, proxies
      // / tunnels (e.g. cloudflared) drop the connection and the client shows
      // "Load failed". Emit a keep-alive newline every 10s for these tools.
      const needsKeepAlive = infoCalls.some(
        c =>
          c.name === 'deep_research' ||
          c.name === 'generate_image' ||
          c.name === 'edit_image' ||
          c.name === 'video_editor'
      );
      const keepAlive = needsKeepAlive
        ? setInterval(() => {
            if (activeGenerations.get(convId)) res.write('\n');
          }, 10000)
        : null;
      try {
      for (const call of infoCalls) {
        // Dedupe phase phrases so parallel research tools don't stutter the
        // same "Reading sources…/Analysing…" lines.
        const onStatus = (status: string) => sendStatus(status);
        // Live deep-research progress → streaming banner on the client.
        const onProgress =
          call.name === 'deep_research'
            ? (ev: any) => {
                // Buffer FIRST — unconditionally — so the activity feed keeps
                // accumulating even after the user navigated away (the client is
                // gone but generation continues). This is what lets a returning
                // user resume the live feed via the research-progress endpoint.
                recordResearchProgress(convId, aiMessage.id, ev);
                if (!activeGenerations.get(convId)) return;
                writeEvent(res, {
                  type: 'researchProgress',
                  progress: ev,
                  messageId: aiMessage.id,
                  conversationId: convId,
                });
              }
            : undefined;
        // Record that this tool ran. deep_research fans out to a dozen LLM calls
        // plus a paid Tavily request, and much of that cost is orchestration
        // overhead no single token count reflects — so reconciliation adds a
        // fan-out surcharge for it. Recorded at START, not on success, because
        // aborting halfway must not make the expensive part free. The token cost
        // of the tool's own model calls is captured separately and automatically,
        // since they run inside this same metered context.
        recordToolRun(call.name);
        vlog('generate:tool-run-recorded', { convId, tool: call.name });
        // Surface the shimmering status for document generation so the user sees
        // "Putting your document together…" while the card is prepared.
        if (
          call.name === 'generate_document' ||
          call.name === 'generate_image' ||
          call.name === 'edit_image' ||
          call.name === 'video_editor'
        )
          sendStatus(toolStatusLabel(call.name));
        // Video editor: emit a LIVE "preparing" card immediately (before the
        // ingestion/probe work) so the user sees the editor surface right away —
        // mirrors the image tools' live card. It's replaced by the final
        // video_editor info-card (or cleared on error) when the turn finalizes.
        if (call.name === 'video_editor') {
          const rawSubject = String((call.args as any)?.instruction || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 60);
          // Buffer it so a client that refreshes / reopens the app mid-edit can
          // resume the SAME animated card via GET /video-editor-progress.
          recordVideoEditorProgress(convId, aiMessage.id, {
            phase: 'preparing',
            percent: 5,
            subject: rawSubject,
          });
          writeEvent(res, {
            type: 'videoEditorProgress',
            messageId: aiMessage.id,
            conversationId: convId,
            phase: 'preparing',
            percent: 5,
            subject: rawSubject,
          });
        }
        // Image tools: emit a LIVE generating card immediately (before the
        // provider call) so the user sees the animated generation surface right
        // away — not just the status shimmer. It's replaced by the final
        // image card (or cleared on error) when the turn finalizes.
        if (call.name === 'generate_image' || call.name === 'edit_image') {
          // A short human subject for the live card's rotating text (so it reads
          // like it understood the request, e.g. "Sketching your sneaker ad…").
          const rawSubject =
            (call.args as any)?.title ||
            (call.args as any)?.prompt ||
            (call.args as any)?.instruction ||
            '';
          const subject = String(rawSubject)
            .replace(/\s+/g, ' ')
            .trim()
            .split(/[.,\n]/)[0]
            .slice(0, 60);
          const imgOperation = call.name === 'edit_image' ? 'editing' : 'generation';
          // Buffer it so a client that refreshes / reopens the app mid-generation
          // can resume the SAME animated card via GET /image-progress.
          recordImageProgress(convId, aiMessage.id, {
            operation: imgOperation,
            status: 'generating',
            subject,
          });
          writeEvent(res, {
            type: 'imageProgress',
            messageId: aiMessage.id,
            conversationId: convId,
            operation: imgOperation,
            status: 'generating',
            subject,
          });
        }
        const built = await buildInfoCard(
          call.name,
          call.args,
          {
            userId: usageCtx?.userId || memorySave?.userId,
            workspaceId: wsId,
            conversationId: convId,
          },
          preferences,
          toolMediaUrls,
          onStatus,
          abortController.signal,
          onProgress,
          // Uploaded image bytes for THIS turn → the exact edit source for
          // edit_image on a first-message upload.
          imageAttachmentsForTools.map((a) => ({ mimeType: a.mimeType, data: a.data })),
          // Uploaded video bytes for THIS turn (small inline uploads) → the
          // source for video_editor. Large videos arrive as a hosted URL in
          // toolMediaUrls instead and are ingested by storageKey in the branch.
          videoAttachmentsForTools.map((a) => ({
            mimeType: a.mimeType,
            data: a.data,
            name: a.name,
          })),
          // Live video-editor progress → streamed as `videoEditorProgress` so the
          // inline (progress-only) card renders the server-driven edit live.
          call.name === 'video_editor'
            ? (p) => {
                if (!activeGenerations.get(convId)) return;
                // Buffer the latest live state so a returning client can resume
                // the SAME card (plan checklist + step counter) after an app kill.
                recordVideoEditorProgress(convId, aiMessage.id, {
                  phase: p.phase,
                  percent: p.percent,
                  status: p.status,
                  plan: p.plan,
                  activeStepIndex:
                    typeof p.activeStepIndex === 'number' ? p.activeStepIndex : undefined,
                });
                writeEvent(res, {
                  type: 'videoEditorProgress',
                  messageId: aiMessage.id,
                  conversationId: convId,
                  phase: p.phase,
                  status: p.status,
                  percent: p.percent,
                  ...(p.plan ? { plan: p.plan } : {}),
                  // Index into the SAME `plan` array of the step being worked on.
                  // The card derives BOTH its checklist highlight and its overlay
                  // "Step N of M" counter from it, so the two cannot disagree.
                  ...(typeof p.activeStepIndex === 'number'
                    ? { activeStepIndex: p.activeStepIndex }
                    : {}),
                });
              }
            : undefined
        );
        // A tool may return ONE card (`card`) or MANY (`cards`, e.g. image
        // variations). Emit each as its own infoCard so they all render + persist.
        const builtCards: any[] = (built as any).cards?.length
          ? (built as any).cards
          : built.card
            ? [built.card]
            : [];
        // Remember the produced image so a same-turn schedule_post binds to it.
        // edit_image always yields ONE image; generate_image binds only when it
        // produced exactly one option (otherwise the user picks).
        if (call.name === 'edit_image' || call.name === 'generate_image') {
          const imgCards = builtCards.filter(
            (c) => c?.kind === 'image' && typeof c?.url === 'string' && c.url
          );
          if (imgCards.length === 1) producedImageUrl = imgCards[0].url;
        }
        for (const c of builtCards) {
          const cardWithId = {
            id: `${aiMessage.id}_info_${infoCardsForDb.length}`,
            ...c,
          };
          infoCardsForDb.push(cardWithId);
          writeEvent(res, {
            type: 'infoCard',
            infoCard: cardWithId,
            messageId: aiMessage.id,
            conversationId: convId,
          });
          vlog('generate:info-card', {
            convId,
            tool: call.name,
            kind: c.kind,
          });
        }
        if (built.summaryText) introLines.push(built.summaryText);
      }
      } finally {
        if (keepAlive) clearInterval(keepAlive);
      }
    }

    // Emit the combined intro text (for data/edit/info turns) so it lands with cards.
    if (
      (dataCall || editCalls.length || infoCalls.length) &&
      introLines.length &&
      !streamed.trim()
    ) {
      streamed = introLines.join(' ');
      writeEvent(res, {
        type: 'chunk',
        content: streamed,
        messageId: aiMessage.id,
      });
    }

    // If the model emitted a schedule_post tool call, validate it and surface a
    // confirm card (the LLM decided to post — no regex/triage needed). All the
    // guards the legacy post-agent applied now live here on the single path:
    //   • no media → ask for it in text (no card)
    //   • scheduling with no time / a past time → ask for a valid time (no card)
    //   • a proactive growth suggestion is appended to the reply
    let postCardPlan: any = null;
    // schedule_post is Full+; use the tier-filtered call list so a lower tier
    // can't produce a post-confirm card even via a stray tool call.
    const scheduleCall = allowedCalls.find(t => t.name === 'schedule_post');
    if (scheduleCall) {
      const plan = normalizeSchedulePlan(scheduleCall.args);
      // FIX 1/2: recover account + time gathered on an earlier turn and set the
      // resolved account on the plan so the card/confirm target it correctly.
      let pendingPost: any = null;
      try {
        const convDoc = await ChatConversation.findOne({ id: convId }).lean();
        const pp = (convDoc as any)?.pendingPost;
        if (
          pp &&
          pp.updatedAt &&
          Date.now() - new Date(pp.updatedAt).getTime() < PENDING_POST_TTL_MS
        )
          pendingPost = pp;
      } catch {
        /* best-effort pending-post read */
      }
      // ── Media binding (spec: "edit then schedule publishes the EDITED image")
      // Resolve the post's media in priority order so the schedule always uses
      // the image the user actually means:
      //   1. An image edited/generated THIS turn → it IS the post subject, so it
      //      supersedes any earlier upload (the whole point of "edit it, then
      //      schedule": publish the edit, not the original).
      //   2. Media provided/uploaded this turn (toolMediaUrls already set).
      //   3. Media from a schedule in progress on an earlier turn (pendingPost),
      //      so a later "schedule it" turn recovers the last-known image.
      if (producedImageUrl) {
        // An image edited/generated THIS turn is the subject — it supersedes
        // any earlier upload ("edit it, then schedule" posts the edited image).
        toolMediaUrls.length = 0;
        toolMediaUrls.push(producedImageUrl);
      } else if (!toolMediaUrls.length) {
        // No fresh media provided this turn. Recover the intended image in
        // priority order:
        //   a) a SPECIFIC image the user asked for — the model sets
        //      mediaOrdinal (1-based into the conversation media manifest,
        //      1 = most recent). Mapped server-side to a real image so the
        //      user never has to deal with URLs/paths,
        //   b) media from a schedule already in progress (earlier turn),
        //   c) the most recent image in the conversation (edited/generated/
        //      uploaded) — the default.
        const ordinal = Number(plan.mediaOrdinal);
        const picked =
          Number.isFinite(ordinal) && ordinal >= 1 && ordinal <= convImagesForTurn.length
            ? convImagesForTurn[ordinal - 1]
            : undefined;
        if (picked?.url) {
          toolMediaUrls.push(picked.url);
        } else if (
          Array.isArray(pendingPost?.mediaUrls) &&
          pendingPost.mediaUrls.length
        ) {
          toolMediaUrls.push(
            ...pendingPost.mediaUrls.filter((u: any) => typeof u === 'string' && u)
          );
        } else if (convId) {
          try {
            const latest =
              convImagesForTurn[0] || (await findLatestConversationImage(convId));
            if (latest?.url) toolMediaUrls.push(latest.url);
          } catch {
            /* best-effort latest-image recovery */
          }
        }
      }
      const hasMedia = toolMediaUrls.length > 0;
      // ── Deterministic account + media-type resolution (shared by every branch)
      // The connected accounts drive BOTH the platform-correct wording of any
      // follow-up ask AND the hard rule that the user — not the model — chooses
      // the target account when more than one is connected. We NEVER let the
      // model's guessed `accountId` stand in that case. Best-effort DB read,
      // once per schedule turn; on failure we degrade to the prior behaviour.
      let scheduleAccts: any[] = [];
      try {
        const wsId = memorySave?.workspaceId || usageCtx?.workspaceId;
        if (wsId)
          scheduleAccts =
            (await storage
              .getSocialAccountsByWorkspace(wsId)
              .catch(() => [])) || [];
      } catch {
        /* degrade: no account gating */
      }
      const acctIdOf = (a: any) =>
        String(a?.id || a?._id || a?.accountId || '');
      // "Explicit" = the user actually chose it (dropdown / single account /
      // typed handle / remembered from an earlier explicit turn). A model guess
      // in plan.accountId is deliberately NOT an explicit signal.
      const explicitAccountId = String(
        advanced?.accountScope?.accountId || pendingPost?.accountId || ''
      );
      const targetAcct = explicitAccountId
        ? scheduleAccts.find(a => acctIdOf(a) === explicitAccountId) || null
        : scheduleAccts.length === 1
          ? scheduleAccts[0]
          : null;
      // Resolve the platform for platform-correct wording.
      let schedulePlatform = 'instagram';
      if (targetAcct)
        schedulePlatform = String((targetAcct as any).platform || 'instagram');
      else if (scheduleAccts.length) {
        const ps = new Set(
          scheduleAccts.map(a => String(a.platform || 'instagram'))
        );
        if (ps.size === 1) schedulePlatform = [...ps][0];
      }
      const scheduleAccountHandles = scheduleAccts
        .map(a => '@' + String(a.username || '').replace(/^@+/, ''))
        .filter(h => h !== '@')
        .join(' or ');
      // More than one account connected and the user hasn't chosen → REQUIRE it.
      const accountUnchosen = scheduleAccts.length > 1 && !targetAcct;
      // Did the user name a media type anywhere in the conversation? The model
      // defaults plan.type to "post" when unsure, so a bare "post" is NOT an
      // explicit choice — we ask, because the type matters (feed/reel/story).
      const userTextAll = history
        .filter(h => h?.role === 'user')
        .map(h => h.content || '')
        .join(' \n ');
      // The most recent assistant + user turns, so a one-word reply to the type
      // question ("post") is accepted as an explicit answer.
      let lastAssistantContent = '';
      let lastUserContent = '';
      for (let i = history.length - 1; i >= 0; i--) {
        if (!lastUserContent && history[i]?.role === 'user')
          lastUserContent = history[i].content || '';
        if (!lastAssistantContent && history[i]?.role === 'assistant')
          lastAssistantContent = history[i].content || '';
        if (lastUserContent && lastAssistantContent) break;
      }
      // Did we just ask the type question? If so, a bare "post"/"feed"/"reel"/
      // "story" reply is an unambiguous choice (feed = feed post) — accept it.
      const askedType = /feed post, a reel, or a story/i.test(
        lastAssistantContent
      );
      const typeSpecified =
        /\b(reel|reels|story|stories|feed post|carousel)\b/i.test(userTextAll) ||
        /\bas a post\b/i.test(userTextAll) ||
        (askedType &&
          /^\s*(a\s+)?(feed\s*)?(post|feed|reel|story|carousel)\s*$/i.test(
            lastUserContent
          )) ||
        (askedType && /\b(feed|reel|story|carousel)\b/i.test(lastUserContent));
      // Bind the plan's account to the EXPLICIT choice; never let a model guess
      // survive when the user must still pick among multiple accounts.
      if (targetAcct) plan.accountId = acctIdOf(targetAcct);
      else if (explicitAccountId) plan.accountId = explicitAccountId;
      else if (accountUnchosen) plan.accountId = '';
      if (plan.schedule && !plan.scheduledLocal && pendingPost?.scheduledLocal)
        plan.scheduledLocal = pendingPost.scheduledLocal;
      // Best-effort persist/clear of the durable pending-post state.
      const persistPending = () => {
        ChatConversation.updateOne(
          { id: convId },
          {
            $set: {
              pendingPost: {
                mediaUrls: toolMediaUrls.slice(),
                scheduledLocal: plan.scheduledLocal || undefined,
                accountId: plan.accountId || undefined,
                updatedAt: new Date(),
              },
            },
          }
        ).catch(() => {});
      };
      const clearPending = () => {
        ChatConversation.updateOne(
          { id: convId },
          { $unset: { pendingPost: 1 } }
        ).catch(() => {});
      };
      // Defensive scrub: the model sometimes adds the user's OWN connected
      // account as a mention/hashtag, or invents hashtags. Strip any mention or
      // hashtag that matches a connected account username so we never tag the
      // user's own handle without them asking.
      const ownHandles = new Set(
        (toolAccountUsernames || [])
          .map(u =>
            String(u || '')
              .replace(/^@+/, '')
              .toLowerCase()
          )
          .filter(Boolean)
      );
      if (ownHandles.size) {
        plan.mentions = (plan.mentions || []).filter(
          (m: string) =>
            !ownHandles.has(String(m).replace(/^@+/, '').toLowerCase())
        );
        plan.hashtags = (plan.hashtags || []).filter(
          (h: string) =>
            !ownHandles.has(
              String(h)
                .replace(/^[#@]+/, '')
                .toLowerCase()
            )
        );
      }
      const timeIssue = validateSchedulePlan(plan, toolLocalNow);
      // Verification aid (VEEGPT_CTX_DEBUG): record which branch the schedule
      // handler takes so the "repeated generic ask" is traceable from the file.
      if (ctxDebugEnabled()) {
        appendCtxDebug({
          kind: 'schedule-decision',
          convId,
          hasMedia,
          mediaCount: toolMediaUrls.length,
          timeIssue: timeIssue || null,
          planAccountId: plan.accountId || null,
          planScheduledLocal: plan.scheduledLocal || null,
          branch: !hasMedia ? 'no-media' : timeIssue ? 'needs-time' : 'card',
        });
      }

      if (!hasMedia) {
        vlog('generate:tool-no-media', { convId, messageId: aiMessage.id });
        // FIX 1: remember the time/account gathered so far so the media the user
        // attaches next lands in a plan that already knows when/where to post.
        persistPending();
        if (!streamed.trim()) {
          // Field-aware deterministic ask (0 tokens): request ONLY what's still
          // missing and acknowledge what we already captured. Reuses the hoisted
          // account/type/platform resolution so wording matches the platform
          // (Instagram vs Facebook Page) and we ask for the account only when
          // more than one is connected and none was chosen.
          const asks: string[] = [
            'attach the image or video you\u2019d like to post',
          ];
          if (!typeSpecified) {
            asks.push(
              schedulePlatform === 'facebook'
                ? 'let me know whether it should be a feed post, a reel, or a story on your Facebook Page'
                : 'let me know whether it should be a feed post, a reel, or a story'
            );
          }
          if (accountUnchosen && scheduleAccountHandles) {
            asks.push(
              `tell me which account to post to (${scheduleAccountHandles})`
            );
          }

          // Time: acknowledge a known/valid schedule time; only ask for one when
          // scheduling was requested but no valid future time is set yet.
          let timeSentence = '';
          if (plan.schedule) {
            const when = parseLocalDateTime(plan.scheduledLocal);
            if (when && when.getTime() > Date.now() + 60 * 1000) {
              const whenLabel = when.toLocaleString([], {
                dateStyle: 'medium',
                timeStyle: 'short',
              });
              timeSentence = ` I\u2019ve already got the time set for ${whenLabel}, so once that\u2019s in I can schedule it.`;
            } else {
              asks.push(
                'let me know when to publish it (for example, "today 7 PM" or "tomorrow 10 AM")'
              );
            }
          }

          const listed =
            asks.length === 1
              ? asks[0]
              : asks.slice(0, -1).join(', ') +
                ', and ' +
                asks[asks.length - 1];
          streamed = `Sure \u2014 to get this ${plan.schedule ? 'scheduled' : 'posted'} I just need you to ${listed}.${timeSentence}`;
          writeEvent(res, {
            type: 'chunk',
            content: streamed,
            messageId: aiMessage.id,
          });
        }
      } else if (timeIssue) {
        // Scheduling requested but no concrete/valid time → ask, don't card.
        vlog('generate:tool-needs-time', {
          convId,
          scheduledLocal: plan.scheduledLocal,
        });
        // FIX 1: remember media (+ any account) so the time follow-up turn keeps
        // it and doesn't fall back to the no-media prompt.
        persistPending();
        if (!streamed.trim()) {
          streamed = timeIssue;
          writeEvent(res, {
            type: 'chunk',
            content: streamed,
            messageId: aiMessage.id,
          });
        }
      } else if ((accountUnchosen && !!scheduleAccountHandles) || !typeSpecified) {
        // Media + time are present, but the user still hasn't CHOSEN the target
        // account (more than one connected) and/or the media type. Never auto-
        // decide and never show a card in that case — ask deterministically
        // (0 tokens) and keep the media/time so the next turn completes the card.
        vlog('generate:tool-needs-account-or-type', {
          convId,
          accountUnchosen,
          typeSpecified,
        });
        persistPending();
        if (!streamed.trim()) {
          const missing: string[] = [];
          if (accountUnchosen && scheduleAccountHandles)
            missing.push(
              `let me know which account to post to (${scheduleAccountHandles})`
            );
          if (!typeSpecified)
            missing.push(
              schedulePlatform === 'facebook'
                ? 'whether it should be a feed post, a reel, or a story on your Facebook Page'
                : 'whether it should be a feed post, a reel, or a story'
            );
          const listed =
            missing.length === 1
              ? missing[0]
              : missing.slice(0, -1).join(', ') +
                ', and ' +
                missing[missing.length - 1];
          streamed = `Almost there \u2014 just ${listed}.`;
          writeEvent(res, {
            type: 'chunk',
            content: streamed,
            messageId: aiMessage.id,
          });
        }
      } else {
        // Good to confirm. Bake the uploaded media URLs into the card so confirm
        // has everything it needs.
        // FIX 3: generate the caption/hashtags NOW so the card shows real text
        // instead of "Caption will be generated on confirm". Best-effort — on
        // failure the plan keeps its existing values and the old deferred
        // behaviour still applies.
        if (
          toolMediaUrls.length &&
          (plan.generateCaption || plan.generateHashtags) &&
          !String(plan.caption || '').trim()
        ) {
          try {
            const { caption, hashtags } = await resolvePlanCaptionForCard(
              plan,
              toolMediaUrls,
              usageCtx || memorySave || {},
              preferences
            );
            if (caption) plan.caption = caption;
            if (hashtags.length) plan.hashtags = hashtags;
          } catch {
            /* keep the "generated on confirm" fallback */
          }
        }
        // FIX 1: the flow reached a confirm card — clear the durable pending
        // state so a later, unrelated message doesn't reuse this media/time.
        clearPending();
        postCardPlan = plan;
        const suggestion =
          typeof (scheduleCall.args as any)?.suggestion === 'string'
            ? (scheduleCall.args as any).suggestion.trim()
            : '';
        if (suggestion) {
          const base =
            streamed.trim() || (plan.summary ? plan.summary.trim() : '');
          streamed = `${base ? base + '\n\n' : ''}💡 ${suggestion} Just say the word and I'll update it before you confirm.`;
          writeEvent(res, {
            type: 'chunk',
            content: streamed,
            messageId: aiMessage.id,
          });
        }
        writeEvent(res, {
          type: 'toolCall',
          name: 'schedule_post',
          plan: postCardPlan,
          mediaUrls: toolMediaUrls,
          messageId: aiMessage.id,
          conversationId: convId,
        });
        vlog('generate:tool-emitted', {
          convId,
          messageId: aiMessage.id,
          schedule: !!postCardPlan?.schedule,
          media: toolMediaUrls.length,
        });
      }
    }

    // remember_fact tool: the model spotted a durable fact while writing its
    // reply — save it WITHOUT any extra LLM call (the fact is already extracted
    // in the tool args). This folds memory detection into the single chat call,
    // replacing the previous per-message saveMemoryViaLLM extraction.
    type RememberStatus =
      'saved' | 'duplicate' | 'skipped' | 'full' | 'updated';
    let rememberStatus: RememberStatus | null = null;
    let rememberedFact = '';
    const rememberCalls = toolCalls.filter(t => t.name === 'remember_fact');
    if (rememberCalls.length && memorySave?.userId && memorySave?.workspaceId) {
      const savedFacts: string[] = [];
      let anyDuplicate = false;
      let anyFull = false;
      // De-dupe identical fact strings the model may have emitted twice in one turn.
      const seen = new Set<string>();
      for (const call of rememberCalls) {
        const fact =
          typeof (call.args as any)?.fact === 'string'
            ? (call.args as any).fact.trim()
            : '';
        if (!fact) continue;
        const key = fact.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const r = await saveMemoryFact(
          memorySave.userId,
          memorySave.workspaceId,
          fact
        );
        vlog('generate:tool-remember', {
          convId,
          status: r.status,
          fact: r.fact,
        });
        // 'saved' (new) and 'updated' (replaced an existing on the same topic) both
        // mean the fact is now stored.
        if (r.status === 'saved' || r.status === 'updated')
          savedFacts.push(r.fact || fact);
        else if (r.status === 'duplicate') anyDuplicate = true;
        else if (r.status === 'full') anyFull = true;
      }
      // Summarize for the acknowledgment line below (prefer "saved" over the rest).
      // The `as` keeps the wide union so downstream status comparisons stay valid.
      rememberStatus = (
        savedFacts.length
          ? 'saved'
          : anyFull
            ? 'full'
            : anyDuplicate
              ? 'duplicate'
              : null
      ) as RememberStatus | null;
      if (savedFacts.length) rememberedFact = savedFacts.join('; ');
    }

    // update_memory / forget_memory: the user changed or retracted a stored fact.
    // These keep memory clean (one fact per topic) instead of piling duplicates.
    // We collect results and render ONE concise summary at the end (a per-fact
    // line dump is unreadable when many facts are removed at once).
    const updatedFacts: string[] = [];
    const forgottenFacts: string[] = [];
    let updateNotFound = 0;
    for (const call of toolCalls.filter(t => t.name === 'update_memory')) {
      if (!memorySave?.userId || !memorySave?.workspaceId) break;
      const id = String((call.args as any)?.id || '');
      const fact = String((call.args as any)?.fact || '');
      const r = await updateMemoryFact(
        memorySave.userId,
        memorySave.workspaceId,
        id,
        fact
      );
      vlog('generate:tool-update-memory', { convId, status: r.status, id });
      if (r.status === 'updated' && r.fact) updatedFacts.push(r.fact);
      else if (r.status === 'notfound') updateNotFound += 1;
    }
    for (const call of toolCalls.filter(t => t.name === 'forget_memory')) {
      if (!memorySave?.userId || !memorySave?.workspaceId) break;
      const id = String((call.args as any)?.id || '');
      const r = await forgetMemoryFact(
        memorySave.userId,
        memorySave.workspaceId,
        id
      );
      vlog('generate:tool-forget-memory', { convId, status: r.status, id });
      if (r.status === 'deleted' && r.fact) forgottenFacts.push(r.fact);
      else if (r.status === 'deleted') forgottenFacts.push('');
    }

    const memoryNotes: string[] = [];
    // Show up to this many example facts before collapsing to a plain count.
    const MAX_LISTED = 5;
    if (updatedFacts.length === 1) {
      memoryNotes.push(`✏️ Updated that — it now reads: "${updatedFacts[0]}".`);
    } else if (updatedFacts.length > 1) {
      memoryNotes.push(
        `✏️ Updated ${updatedFacts.length} facts in your memory.`
      );
    }
    if (updateNotFound > 0 && updatedFacts.length === 0) {
      memoryNotes.push(
        'I couldn\u2019t find that earlier note to update, so nothing changed.'
      );
    }
    if (forgottenFacts.length === 1) {
      const f = forgottenFacts[0];
      memoryNotes.push(
        f
          ? `🗑️ Done — I\u2019ve forgotten that: "${f}".`
          : '🗑️ Done — I\u2019ve forgotten that.'
      );
    } else if (forgottenFacts.length > 1) {
      const named = forgottenFacts.filter(Boolean);
      let line = `🗑️ Cleaned up your memory — removed ${forgottenFacts.length} facts.`;
      if (named.length) {
        const examples = named.slice(0, MAX_LISTED).map(f => `• ${f}`);
        const more =
          named.length > MAX_LISTED
            ? `\n…and ${named.length - MAX_LISTED} more.`
            : '';
        line += `\n\n${examples.join('\n')}${more}`;
      }
      memoryNotes.push(line);
    }
    if (memoryNotes.length && activeGenerations.get(convId)) {
      streamed = `${streamed.trim() ? streamed.trim() + '\n\n' : ''}${memoryNotes.join('\n\n')}`;
      writeEvent(res, {
        type: 'chunk',
        content: streamed,
        messageId: aiMessage.id,
      });
    }

    // If memory was saved alongside OTHER actions (cards already carry the rest),
    // append a short memory acknowledgment so the user knows it was remembered —
    // the no-text fallback below won't run because `streamed` is already set.
    if (
      rememberStatus &&
      rememberStatus !== 'skipped' &&
      (postCardPlan || editCardsForDb.length || listCardForDb) &&
      activeGenerations.get(convId)
    ) {
      const memLine =
        rememberStatus === 'saved'
          ? `\n\n🧠 Noted — I\u2019ll remember that${rememberedFact ? `: ${rememberedFact}` : ''}.`
          : rememberStatus === 'updated'
            ? `\n\n✏️ Updated that${rememberedFact ? ` — ${rememberedFact}` : ''}.`
            : rememberStatus === 'full'
              ? `\n\n⚠️ I couldn\u2019t save that — your VeeGPT memory is full. Remove a few facts in Settings → AI Configuration to make room.`
              : `\n\n🧠 I\u2019ve already got that noted${rememberedFact ? `: ${rememberedFact}` : ''}.`;
      streamed = `${streamed.trim()}${memLine}`;
      writeEvent(res, {
        type: 'chunk',
        content: streamed,
        messageId: aiMessage.id,
      });
    }

    // No-text fallback for a tool-only turn that has NO confirm card to carry the
    // message (e.g. the model called remember_fact and emitted no prose, which
    // gpt-4o-mini often does). Generate a real conversational reply so the bubble
    // isn't empty. This is the ONLY extra LLM call, and only on these rare turns
    // — ordinary chat already streamed its text above. We tell the model the
    // memory action that just happened so its reply is truthful.
    if (activeGenerations.get(convId) && !streamed.trim() && !postCardPlan) {
      vlog('generate:tool-only-fallback', { convId, remember: rememberStatus });
      try {
        let fbPrompt = prompt;
        if (rememberStatus === 'saved')
          fbPrompt += `\n\n[You just saved this NEW fact to long-term memory: "${rememberedFact}". Briefly acknowledge you'll remember it. Do NOT say it was already saved.]`;
        else if (rememberStatus === 'updated')
          fbPrompt += `\n\n[You just UPDATED an existing fact on this topic to: "${rememberedFact}" (it replaced the old value — no duplicate was created). Briefly confirm you've updated it.]`;
        else if (rememberStatus === 'duplicate')
          fbPrompt += `\n\n[This fact was ALREADY in long-term memory: "${rememberedFact}". Tell the user you already have it noted — do not act surprised or re-save it.]`;
        else if (rememberStatus === 'full')
          fbPrompt += `\n\n[You could NOT save this fact because the user's long-term memory is FULL. Tell them their VeeGPT memory storage is full and they should remove a few facts in Settings → AI Configuration to make room, then you can remember new things.]`;
        const fullText = await withAIFeature('veegpt.chat', usageCtx, () =>
          aiServiceManager.generateText(fbPrompt, preferences)
        );
        const tokens = (fullText || '').split(/(\s+)/);
        for (const token of tokens) {
          if (!activeGenerations.get(convId)) break;
          streamed += token;
          writeEvent(res, {
            type: 'chunk',
            content: streamed,
            messageId: aiMessage.id,
          });
          await new Promise(r => setTimeout(r, 12));
        }
      } catch (fbErr: any) {
        vlog('generate:tool-only-fallback-error', {
          convId,
          error: fbErr?.message,
        });
      }
    }

    // A tool-only turn has no assistant prose; give it a short confirming line
    // so the bubble isn't empty (the confirm card carries the detail).
    const isRateLimited =
      /429|quota|rate.?limit|too many requests|exceeded your current quota/i.test(
        streamErrMsg
      );
    const noProviderMsg = isRateLimited
      ? 'I\u2019m getting rate-limited by the AI provider right now (quota exceeded). Please try again in a minute — your request wasn\u2019t lost.'
      : 'I had trouble reaching the AI service just now. Please try again in a moment.';
    const rawPersisted =
      streamed.trim() ||
      (postCardPlan
        ? postCardPlan.summary ||
          'Here\u2019s your post — review and confirm below.'
        : editCardsForDb.length
          ? editCardsForDb.length > 1
            ? `I\u2019ve prepared ${editCardsForDb.length} changes — review and confirm each below:`
            : 'Review this change and confirm below:'
          : listCardForDb
            ? 'Here you go:'
            : rememberStatus === 'duplicate'
              ? `I\u2019ve already got that noted${rememberedFact ? ` — ${rememberedFact}` : ''}.`
              : rememberStatus === 'saved'
                ? `Got it — I\u2019ll remember that${rememberedFact ? `: ${rememberedFact}` : ''}.`
                : rememberStatus === 'updated'
                  ? `Updated that${rememberedFact ? ` — ${rememberedFact}` : ''}.`
                  : rememberStatus === 'full'
                    ? `Your VeeGPT memory is full, so I couldn\u2019t save that. Remove a few facts in Settings \u2192 AI Configuration to make room.`
                    : streamErrMsg
                      ? noProviderMsg
                      : 'I apologize, but I was unable to generate a response.');
    // Safety scrub: never persist/show leaked raw tool-call syntax. If stripping
    // empties the message (it was ONLY a leaked call), fall back to a safe line.
    let persisted = stripLeakedToolSyntax(rawPersisted);
    if (!persisted) {
      persisted = postCardPlan
        ? postCardPlan.summary ||
          'Here\u2019s your post — review and confirm below.'
        : 'I apologize, but I had trouble completing that. Please try again in a moment.';
    }
    // If the scrub changed the text mid-stream, push the corrected version so the
    // client doesn't keep showing the leaked syntax it already received.
    if (persisted !== streamed.trim()) {
      writeEvent(res, {
        type: 'chunk',
        content: persisted,
        messageId: aiMessage.id,
      });
    }
    const cardForDb = postCardPlan
      ? { plan: postCardPlan, mediaUrls: toolMediaUrls, status: 'idle' }
      : undefined;
    // If the user STOPPED this generation, the /stop endpoint owns the persisted
    // text (the exact partial the user saw). Skip our write entirely so we never
    // overwrite it with the model's full output, and don't emit complete (the
    // client connection is already gone).
    if (!activeGenerations.get(convId)) {
      vlog('generate:stopped-skip-persist', {
        convId,
        messageId: aiMessage.id,
      });
      // The /stop endpoint owns the CONTENT (the exact partial the user saw), so
      // we don't touch content here. But the reasoning/thinking is only known
      // here — persist it so the Thoughts panel survives the stop instead of
      // vanishing. Also backfill content with whatever streamed so far IF the
      // message is still the empty placeholder (covers an incidental disconnect
      // where no /stop arrives), so the partial answer isn't lost either.
      try {
        const update: Record<string, unknown> = {};
        if (reasoningText.trim()) update.reasoning = reasoningText;
        const current = await ChatMessage.findOne({ id: aiMessage.id });
        const isPlaceholder = !((current as any)?.content || '').trim();
        if (isPlaceholder && streamed.trim()) {
          update.content = streamed;
          update.tokensUsed = Math.ceil(streamed.length / 4);
        }
        if (Object.keys(update).length > 0) {
          await ChatMessage.updateOne({ id: aiMessage.id }, update);
        }
      } catch (e: any) {
        vlog('generate:stopped-persist-reasoning-failed', {
          convId,
          error: e?.message,
        });
      }
      return;
    }
    vlog('generate:persisting', {
      convId,
      messageId: aiMessage.id,
      finalLength: persisted.length,
      regenerate: !!regenerate,
    });
    let variantsForEvent: any = undefined;
    let activeVariantForEvent: number | undefined = undefined;
    if (regenerate) {
      // Append this fresh reply as a new variant; migrate the original reply to
      // variant 0 the first time. content/cards mirror the now-active variant.
      const prior =
        Array.isArray((aiMessage as any).variants) &&
        (aiMessage as any).variants.length
          ? (aiMessage as any).variants.slice()
          : [
              {
                content: (aiMessage as any).content,
                postCard: (aiMessage as any).postCard,
                listCard: (aiMessage as any).listCard,
                editCards: (aiMessage as any).editCards,
                infoCards: (aiMessage as any).infoCards,
                createdAt: (aiMessage as any).createdAt,
              },
            ];
      prior.push({
        content: persisted,
        postCard: cardForDb,
        listCard: listCardForDb || undefined,
        editCards: editCardsForDb.length ? editCardsForDb : undefined,
        infoCards: infoCardsForDb.length ? infoCardsForDb : undefined,
        createdAt: new Date(),
      });
      variantsForEvent = prior;
      activeVariantForEvent = prior.length - 1;
      await ChatMessage.updateOne(
        { id: aiMessage.id },
        {
          content: persisted,
          tokensUsed: Math.ceil(persisted.length / 4),
          postCard: cardForDb,
          listCard: listCardForDb || undefined,
          editCards: editCardsForDb.length ? editCardsForDb : undefined,
          infoCards: infoCardsForDb.length ? infoCardsForDb : undefined,
          reasoning: reasoningText.trim() ? reasoningText : undefined,
          retryable: (!streamed.trim() && !!streamErrMsg) || undefined,
          deliveryStatus: streamErrMsg ? 'failed' : undefined,
          variants: prior,
          activeVariant: activeVariantForEvent,
        }
      );
      // Same message (new variant) → don't bump messageCount.
      await ChatConversation.updateOne(
        { id: convId },
        { lastMessageAt: new Date(), updatedAt: new Date() }
      );
    } else {
      await ChatMessage.updateOne(
        { id: aiMessage.id },
        {
          content: persisted,
          tokensUsed: Math.ceil(persisted.length / 4),
          postCard: cardForDb,
          listCard: listCardForDb || undefined,
          editCards: editCardsForDb.length ? editCardsForDb : undefined,
          infoCards: infoCardsForDb.length ? infoCardsForDb : undefined,
          reasoning: reasoningText.trim() ? reasoningText : undefined,
          retryable: (!streamed.trim() && !!streamErrMsg) || undefined,
          deliveryStatus: streamErrMsg ? 'failed' : undefined,
        }
      );
      await ChatConversation.updateOne(
        { id: convId },
        {
          lastMessageAt: new Date(),
          updatedAt: new Date(),
          $inc: { messageCount: 1 },
        }
      );
    }

    writeEvent(res, {
      type: 'complete',
      messageId: aiMessage.id,
      conversationId: convId,
      finalContent: persisted,
      postCard: cardForDb,
      listCard: listCardForDb || undefined,
      editCards: editCardsForDb.length ? editCardsForDb : undefined,
      infoCards: infoCardsForDb.length ? infoCardsForDb : undefined,
      reasoning: reasoningText.trim() ? reasoningText : undefined,
      retryable: !streamed.trim() && !!streamErrMsg,
      deliveryStatus: streamErrMsg ? 'failed' : undefined,
      variants: variantsForEvent,
      activeVariant: activeVariantForEvent,
    });
    vlog('generate:complete', { convId, messageId: aiMessage.id });
  } catch (error: any) {
    clearInterval(statusInterval);
    vlog('generate:fatal-error', { convId, error: error?.message });
    console.error('[VEEGPT] AI generation error:', error?.message);
    const fallbackMsg =
      'I apologize, but I encountered an error while generating a response.';
    await ChatMessage.updateOne(
      { id: aiMessage.id },
      { content: fallbackMsg, tokensUsed: 20, deliveryStatus: 'failed' }
    ).catch(() => {});
    writeEvent(res, {
      type: 'error',
      error: 'Failed to generate response',
      messageId: aiMessage.id,
      deliveryStatus: 'failed',
    });
  } finally {
    // Only clear the shared per-conversation slots if THIS generation still owns
    // them. Because the maps are keyed by conversationId, a NEWER generation for
    // the same chat may have replaced our controller (e.g. the user returned and
    // sent another message while our post-disconnect run was still finishing).
    // Blindly clearing here would flip that newer generation's flag off and
    // delete its controller mid-stream — which is exactly what made a follow-up
    // message fail to generate. Guarding by identity keeps each generation
    // independent.
    if (activeAbortControllers.get(convId) === abortController) {
      activeGenerations.set(convId, false);
      activeAbortControllers.delete(convId);
      // Research is over (the report is now persisted as the message content, so
      // a returning client sees it via the messages poll). Drop the live buffer
      // from both the in-memory map and the cross-instance Redis mirror.
      clearResearchProgress(convId);
      // The finished reply is now persisted (returning clients read it via the
      // messages poll), so drop the live partial-answer buffer too.
      clearPartialAnswer(convId);
      // The final image card (in infoCards) is now persisted, so drop the live
      // image-progress buffer.
      clearImageProgress(convId);
      // The final video_editor card (in infoCards) is now persisted, so drop the
      // live video-editor-progress buffer.
      clearVideoEditorProgress(convId);
    }
  }
}

/** Set headers for a streaming NDJSON response. */
function initStreamResponse(res: Response): void {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering
  (res as any).flushHeaders?.();
}

// ── Long-term memory (rolling summarization) ────────────────────────────────────
// To give chats effectively *unlimited* memory without an unbounded prompt, we
// keep the most recent messages verbatim and fold everything older into a
// running natural-language summary stored on the conversation. The summary is
// fed back into every prompt, so the assistant "remembers" the whole history.
// The pure windowing/overflow math lives in ./veegpt-memory.logic for testing.

// ── Attachments (images, HEIC, video and PDFs for multimodal analysis) ────────
// The accepted list lives in shared/attachment-support.ts so the composer and this
// endpoint can never disagree — they used to keep separate hardcoded lists, which
// is how HEIC ended up accepted by one and rejected by the other.
const ALLOWED_ATTACHMENT_TYPES = ALL_SUPPORTED_TYPES;

/**
 * Validate + normalize incoming attachments from the request body. Enforces the
 * 5-file cap, allowed MIME types, and a per-file size limit. Returns a sanitized
 * list (strips any data: prefix) and a human-readable error if invalid.
 */
function parseAttachments(raw: any): {
  attachments: AIAttachment[];
  error?: string;
} {
  if (!raw) return { attachments: [] };
  if (!Array.isArray(raw))
    return { attachments: [], error: 'Attachments must be an array' };
  if (raw.length > MAX_ATTACHMENTS)
    return {
      attachments: [],
      error: `You can attach at most ${MAX_ATTACHMENTS} files.`,
    };

  const attachments: AIAttachment[] = [];
  for (const a of raw) {
    // Recover a missing/na mime type from the filename — browsers report an
    // empty File.type for .heic and sometimes .mov.
    const mimeType = resolveMimeType(
      String(a?.name || ''),
      String(a?.mimeType || '')
    ).toLowerCase();
    let data = String(a?.data || '');
    const comma = data.indexOf(',');
    if (data.startsWith('data:') && comma !== -1) data = data.slice(comma + 1);
    if (!mimeType || !data)
      return {
        attachments: [],
        error: 'Each attachment needs a mimeType and data.',
      };
    if (!ALLOWED_ATTACHMENT_TYPES.includes(mimeType)) {
      return {
        attachments: [],
        error: `Unsupported file type: ${mimeType || 'unknown'}. Supported: ${SUPPORTED_SUMMARY}.`,
      };
    }
    const approxBytes = Math.floor((data.length * 3) / 4);
    if (approxBytes > MAX_ATTACHMENT_BYTES) {
      return {
        attachments: [],
        error: `A file exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB limit.`,
      };
    }
    attachments.push({
      mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType,
      data,
      name: a?.name,
    });
  }
  return { attachments };
}

/** One image known to a conversation, with where it came from. */
interface ConversationImage {
  /** Hosted URL (image proxy or attachment proxy) — renders + is publishable. */
  url: string;
  mimeType: string;
  /** How the image entered the chat. */
  origin: 'edited' | 'generated' | 'uploaded';
  /** A short human label for the media manifest (e.g. "Edited image"). */
  label: string;
  createdAt: Date;
}

const IS_IMAGE_URL = (u?: string) =>
  !!u && !/\.(mp4|mov|webm|m4v|avi|mkv|3gp)(\?|#|$)/i.test(u);

/**
 * List the images known to a conversation, MOST-RECENT-FIRST, regardless of why
 * each entered the chat. This is the shared source of truth for both:
 *   • the media the LLM is made aware of (the media manifest in context), and
 *   • the server-side "which image to act on" resolution (edit / schedule).
 *
 * Sources scanned per message (newest message first):
 *   • AI image info-cards (`kind:'image'`) — generated or edited results,
 *   • user-message attachments — uploaded images (incl. scheduling uploads),
 *   • a scheduling post card's `mediaUrls`.
 * Within a message the LAST image is taken (the most recent result of that turn).
 * De-duplicated by URL so the same image isn't listed twice.
 */
async function listConversationImages(
  conversationId: number,
  limitImages = 12
): Promise<ConversationImage[]> {
  const msgs = await ChatMessage.find({ conversationId })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();

  // Origin is decided by the image's IDENTITY, not by where it was first seen.
  // An AI image (`/api/chat/image/<assetId>`) can also appear in a schedule
  // card's mediaUrls — if we classified by location, that edited image would be
  // mislabeled "uploaded". So first collect the operation (edit vs generate) for
  // every AI image the conversation has produced (from its info-cards), keyed by
  // assetId, then classify each URL by its scheme.
  const opByAssetId = new Map<string, 'editing' | 'generation'>();
  for (const m of msgs) {
    const cards = (m as any)?.infoCards;
    if (!Array.isArray(cards)) continue;
    for (const c of cards) {
      if (c?.kind === 'image' && typeof c?.url === 'string') {
        const asset = assetIdOfImageUrl(c.url);
        if (asset && (c.operation === 'editing' || c.operation === 'generation')) {
          if (!opByAssetId.has(asset)) opByAssetId.set(asset, c.operation);
        }
      }
    }
  }

  const classify = (url: string, mimeType?: string): ConversationImage => {
    const asset = assetIdOfImageUrl(url);
    if (asset) {
      // AI-produced image. Edited vs generated from the recorded operation.
      const op = opByAssetId.get(asset);
      const edited = op === 'editing';
      return {
        url,
        mimeType: mimeType || 'image/png',
        origin: edited ? 'edited' : 'generated',
        label: edited ? 'Edited image' : 'Generated image',
        createdAt: new Date(),
      };
    }
    return {
      url,
      mimeType: mimeType || 'image/jpeg',
      origin: 'uploaded',
      label: 'Uploaded image',
      createdAt: new Date(),
    };
  };

  const out: ConversationImage[] = [];
  const seenUrls = new Set<string>();
  const push = (url: string, mimeType: string | undefined, createdAt: Date) => {
    if (!url || seenUrls.has(url)) return;
    seenUrls.add(url);
    out.push({ ...classify(url, mimeType), createdAt });
  };

  for (const m of msgs) {
    if (out.length >= limitImages) break;
    // AI image info-cards (assistant turns) — the primary source of AI images.
    const cards = (m as any)?.infoCards;
    if (Array.isArray(cards)) {
      for (let i = cards.length - 1; i >= 0; i--) {
        const c = cards[i];
        if (c?.kind === 'image' && typeof c?.url === 'string' && c.url) {
          push(c.url, c.mimeType, m.createdAt);
        }
      }
    }
    // Uploaded images on user messages.
    if (Array.isArray(m.attachments)) {
      for (let i = m.attachments.length - 1; i >= 0; i--) {
        const a = m.attachments[i];
        if (a?.url && (a.mimeType?.startsWith('image/') || IS_IMAGE_URL(a.url))) {
          push(a.url, a.mimeType, m.createdAt);
        }
      }
    }
    // Images referenced by a scheduling post card.
    const media = (m as any)?.postCard?.mediaUrls;
    if (Array.isArray(media)) {
      for (let i = media.length - 1; i >= 0; i--) {
        const u = media[i];
        if (typeof u === 'string' && IS_IMAGE_URL(u)) push(u, undefined, m.createdAt);
      }
    }
  }
  return out.slice(0, limitImages);
}

/** The AI-image assetId in a `/api/chat/image/<assetId>` URL, or null. */
function assetIdOfImageUrl(url: string): string | null {
  const m = String(url || '').match(/\/api\/chat\/image\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * The most recent image in a conversation — REGARDLESS of why it entered the
 * chat. Used as the default "image to act on" when the user doesn't name one.
 */
async function findLatestConversationImage(
  conversationId: number
): Promise<{ url: string; mimeType: string; createdAt: Date } | null> {
  const [first] = await listConversationImages(conversationId, 1);
  return first ? { url: first.url, mimeType: first.mimeType, createdAt: first.createdAt } : null;
}

/**
 * Render the conversation's media as a compact, developer-trust context block so
 * the LLM is AWARE of every image available and can decide — per the user's
 * intent — which one to act on. The most recent image is the default when the
 * user doesn't name one (e.g. right after an edit, the edited image is #1). To
 * post a SPECIFIC earlier image the model copies that item's exact URL into the
 * schedule_post `mediaUrls`; otherwise it omits media and the latest is used.
 * Returns '' when the conversation has no images (no noise added).
 */
function renderMediaManifest(images: ConversationImage[]): string {
  if (!images.length) return '';
  // IMPORTANT: we deliberately DO NOT reveal per-image details (type, order,
  // URLs) here. Giving the model a readable inventory makes it echo that list as
  // prose ("Most recent edited image, Second edited image…") instead of showing
  // the pictures. With only a COUNT, the model cannot enumerate the images in
  // text — the only way to actually surface them is the show_media_options tool
  // (a visual picker). This is what makes the model reach for the tool.
  const n = images.length;
  return (
    '--- Images in this conversation (INTERNAL) ---\n' +
    `This chat has ${n} image(s), numbered 1..${n} (1 = most recent). ` +
    'You do NOT have their contents and CANNOT see or describe them.\n' +
    'HARD RULES for images (follow exactly):\n' +
    '1. NEVER describe, list, or enumerate the images in text — no numbered/bulleted lists, no "Most recent edited image / Second edited image…", no URLs, paths, or IDs. You literally do not know what they look like.\n' +
    '2. When the user wants to SEE, LIST, CHOOSE, or PICK an image (e.g. "give me the option of images", "options again", "which image should I post", "let me pick", "show my images"), you MUST call the show_media_options tool — it renders the pictures as a tappable visual picker. This is the ONLY way to present images to the user. Do NOT answer such requests with text.\n' +
    '3. To post/schedule without the user naming an image, call schedule_post — the most recent image is attached by default (after an edit, that is the edited image).\n' +
    '4. For a specific image, call schedule_post with mediaOrdinal (1 = most recent).'
  );
}

/**
 * Build the persisted attachment metadata for a USER message from (a) any
 * base64 attachments the client sent for analysis (PDFs etc.) and (b) the
 * already-uploaded hosted media URLs the unified posting path sends. Storing
 * the hosted URLs on the user message is what lets the image/video thumbnail
 * render straight from the messages cache (and survive a refresh) — the same
 * way ChatGPT shows an uploaded image: from the persisted message, not from
 * ephemeral optimistic state.
 */
function buildUserMessageAttachments(
  baseAttachments: Array<AIAttachment & { storageKey?: string }>,
  mediaUrls: string[],
  extraRecords: Array<{ name?: string; mimeType: string; deliveryId: string }> = []
): Array<{ name?: string; mimeType: string; url?: string; deliveryId?: string }> | undefined {
  const out: Array<{ name?: string; mimeType: string; url?: string; deliveryId?: string }> = [];
  for (const a of baseAttachments || [])
    // A `storageKey` (set when the file was uploaded to object storage and sent
    // as a key) becomes the message attachment's deliveryId, so the bubble
    // renders the thumbnail through the authenticated /veegpt/attachment proxy.
    out.push({ name: a.name, mimeType: a.mimeType, ...(a.storageKey ? { deliveryId: a.storageKey } : {}) });
  for (const url of mediaUrls || []) {
    if (!url || typeof url !== 'string') continue;
    const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
    out.push({ mimeType: isVideo ? 'video/mp4' : 'image/jpeg', url });
  }
  // Files uploaded to storage but not fed to the model (too large / unsupported
  // for the model) still get a bubble via their storage key.
  for (const r of extraRecords || [])
    out.push({ name: r.name, mimeType: r.mimeType, deliveryId: r.deliveryId });
  return out.length ? out : undefined;
}

/**
 * Resolve uploaded-file STORAGE KEYS (returned by /attachments/upload) into
 * attachments the model can read AND persistable records the chat bubble can
 * render.
 *
 * The mobile client uploads each file to object storage (S3) first, then sends
 * only the opaque storage keys — never base64 bytes or fragile hosted URLs over
 * the wire. Here we pull each object back: supported files within the byte cap
 * are handed to the model as inline bytes AND carry their `storageKey` so the
 * user-message bubble renders the thumbnail through the authenticated
 * `/veegpt/attachment/:key` proxy. Files too large / unsupported for the model
 * still get a bubble (via `extraRecords`) but aren't sent to the model.
 */
/**
 * Inline ceiling. Gemini's `inlineData` (base64 bytes in the request) is capped
 * at ~20MB per request, so anything below this we inline (fast, one call).
 * Video/PDF above it go through the Gemini Files API (upload once, reference by
 * `fileUri`) which has no such per-request limit — this is what lets a normal
 * phone video actually reach the model instead of becoming bubble-only.
 */
const INLINE_ATTACHMENT_BYTES = 18 * 1024 * 1024; // 18MB

async function resolveStorageKeyAttachments(
  keys: string[],
  geminiApiKey: string,
  signal?: AbortSignal
): Promise<{
  attachments: Array<AIAttachment & { storageKey?: string }>;
  extraRecords: Array<{ name?: string; mimeType: string; deliveryId: string }>;
}> {
  const attachments: Array<AIAttachment & { storageKey?: string }> = [];
  const extraRecords: Array<{ name?: string; mimeType: string; deliveryId: string }> = [];
  for (const key of (keys || []).slice(0, MAX_ATTACHMENTS)) {
    try {
      const file = await storageService.downloadFile(key);
      const name = decodeURIComponent(String(key).split('/').pop() || 'file');
      let mimeType = (file.contentType || resolveMimeType(name, '') || 'application/octet-stream').toLowerCase();
      if (mimeType === 'image/jpg') mimeType = 'image/jpeg';
      const size = file.buffer?.length ?? 0;
      const kind = kindOf(mimeType);
      if (!kind) {
        extraRecords.push({ name, mimeType, deliveryId: key });
        continue;
      }
      const inlineIt = () => {
        attachments.push({ mimeType, data: file.buffer.toString('base64'), name, storageKey: key });
      };
      const tryFilesApi = async (): Promise<boolean> => {
        if (!geminiApiKey) return false;
        try {
          const uploaded = await uploadFileToGemini({
            buffer: file.buffer,
            mimeType,
            displayName: name,
            apiKey: geminiApiKey,
            signal,
          });
          attachments.push({ mimeType, data: '', fileUri: uploaded.fileUri, name, storageKey: key });
          vlog('attachments:files-api-ok', { name: name.slice(0, 60), mimeType, sizeMB: Math.round(size / (1024 * 1024)) });
          return true;
        } catch (e: any) {
          vlog('attachments:files-api-failed', { name: name.slice(0, 60), mimeType, error: String(e?.message || '').slice(0, 160) });
          return false;
        }
      };

      // VIDEO always goes through the Files API — even small clips. Inlining a
      // video as ~15MB base64 makes the model request huge, and under load Google
      // rejects those heavy multimodal requests with 503 "high demand" (a tiny
      // PDF request on the same key succeeds). A `fileUri` request is a few bytes,
      // so it's far more reliable AND is Google's documented path for video.
      if (kind === 'video') {
        if (await tryFilesApi()) continue;
        // Upload failed → inline only if it fits, else bubble-only.
        if (size <= INLINE_ATTACHMENT_BYTES) inlineIt();
        else extraRecords.push({ name, mimeType, deliveryId: key });
        continue;
      }

      // Images / PDF / HEIC: inline when small (fast, works on every path incl.
      // LiteLLM), Files API when too big to inline. A large image can't use a
      // fileUri (it goes through the gateway, which can't reference one), so it
      // stays bubble-only.
      if (size <= INLINE_ATTACHMENT_BYTES) {
        inlineIt();
        continue;
      }
      if ((kind === 'document' || kind === 'heic') && (await tryFilesApi())) continue;
      extraRecords.push({ name, mimeType, deliveryId: key });
    } catch {
      vlog('attachments:resolve-key-failed', { key: String(key).slice(0, 80) });
    }
  }
  return { attachments, extraRecords };
}

/**
 * Resolve the id to use for a freshly-created user message. When the client
 * supplies its own id (`userMessageId`) we honor it — provided it isn't already
 * taken — so the client's optimistic bubble and the persisted record share ONE
 * identity and collapse to a single bubble (no duplicates, no content-matching
 * heuristics). Falls back to a generated id on collision/absence.
 */
async function resolveClientMessageId(raw: unknown): Promise<number> {
  const id = Number(raw);
  if (id && !Number.isNaN(id) && !(await ChatMessage.exists({ id }))) return id;
  return (Date.now() % 1000000000) + Math.floor(Math.random() * 1000);
}

/** Build a short note appended to the prompt so the model knows what's attached. */
function attachmentsPromptNote(attachments: AIAttachment[]): string {
  if (!attachments.length) return '';
  const list = attachments
    .map((a, i) => `${i + 1}. ${a.name || 'file'} (${a.mimeType})`)
    .join('; ');
  return `\n\nThe user attached ${attachments.length} file(s) for you to analyze: ${list}. Analyze them and address the user's message about them.`;
}

/** Summarize a batch of older messages, merging into any existing summary. */
async function summarizeMessages(
  previousSummary: string,
  batch: Array<{ role: string; content: string }>,
  preferences: FullPreferences,
  usageCtx?: { userId?: string; workspaceId?: string }
): Promise<string> {
  const transcript = batch
    .map(m => `${m.role === 'assistant' ? 'VeeGPT' : 'User'}: ${m.content}`)
    .join('\n');
  const prompt =
    'You maintain a running memory summary of a chat between a user and VeeGPT.\n' +
    (previousSummary
      ? `Here is the existing summary so far:\n"""${previousSummary}"""\n\n`
      : '') +
    'Update the summary to also capture the key facts, decisions, preferences, ' +
    'goals, names and unresolved questions from these newer messages. Keep it ' +
    'compact (bullet points, under ~250 words), factual, and written so a future ' +
    'reply can rely on it. Output ONLY the updated summary.\n\n' +
    `Newer messages:\n${transcript}`;
  // Use a fast/cheap config for the background summary (short, low temperature).
  const summary = await withAIFeature('veegpt.memory_summary', usageCtx, () =>
    aiServiceManager.generateText(prompt, {
      ...preferences,
      responseLength: 'short',
      creativityLevel: 0.3,
    })
  );
  return (summary || previousSummary).trim();
}

/**
 * Build the history window + long-term memory summary for a conversation,
 * honoring the aiMemory setting. For 'long-term' it rolls older messages into a
 * stored summary (true unlimited memory); for 'short-term' it just sends the
 * last few turns with no summary.
 */
async function buildHistoryWithMemory(
  convId: number,
  prefs: FullPreferences,
  usageCtx?: { userId?: string; workspaceId?: string }
): Promise<{
  history: Array<{ role: string; content: string }>;
  memorySummary: string;
}> {
  // Off / short-term: shallow window, no rolling summary. selectShallowWindow
  // distinguishes 'off' (stateless: current message only) from 'short-term'
  // (last few turns).
  if (prefs.aiMemory !== 'long-term') {
    const all = await ChatMessage.find({ conversationId: convId })
      .sort({ createdAt: 1 })
      .lean();
    const ordered = all.map(m => ({ role: m.role, content: m.content }));
    const history = selectShallowWindow(prefs.aiMemory as MemoryMode, ordered);
    vlog(prefs.aiMemory === 'off' ? 'memory:off' : 'memory:short-term', {
      convId,
      historySent: history.length,
    });
    return { history, memorySummary: '' };
  }

  // Long-term: rolling summary + verbatim recent window.
  const conv = await ChatConversation.findOne({ id: convId }).lean();
  let memorySummary = (conv as any)?.memorySummary || '';
  let summarizedCount = (conv as any)?.summarizedMessageCount || 0;

  const all = await ChatMessage.find({ conversationId: convId })
    .sort({ createdAt: 1 })
    .lean();
  const ordered = all.map(m => ({ role: m.role, content: m.content }));
  const plan = planLongTermWindow(ordered, summarizedCount);

  let history = plan.history;
  if (plan.needsSummarization) {
    try {
      memorySummary = await summarizeMessages(
        memorySummary,
        plan.toSummarize,
        prefs,
        usageCtx
      );
      summarizedCount = plan.newSummarizedCount;
      await ChatConversation.updateOne(
        { id: convId },
        {
          memorySummary,
          summarizedMessageCount: summarizedCount,
          updatedAt: new Date(),
        }
      );
      vlog('memory:summarized', {
        convId,
        folded: plan.toSummarize.length,
        summarizedCount,
        summaryLength: memorySummary.length,
      });
    } catch (err: any) {
      vlog('memory:summarize-error', { convId, error: err?.message });
      // On failure, fall back to a bounded verbatim window so the prompt stays small.
      history = ordered.slice(-LONG_TERM_VERBATIM);
    }
  }

  vlog('memory:long-term', {
    convId,
    historySent: history.length,
    hasSummary: !!memorySummary,
    summaryLength: memorySummary.length,
  });
  return { history, memorySummary };
}

// ── Cross-chat memory layer (ChatGPT-style "Memory") ────────────────────────────
// Durable facts about the user that persist across ALL their chats in a
// workspace. Only active when AI Memory = long-term ("Remember past
// interactions"). short-term and off never read or write it.

/**
 * Fetch the user's cross-chat memory as a prompt-ready text block (durable
 * facts, newest first). Empty when there's no memory yet.
 */
async function getUserMemoryProfile(
  userId?: string,
  workspaceId?: string
): Promise<string> {
  if (!userId || !workspaceId) return '';
  try {
    const mem = await UserMemory.findOne({ userId, workspaceId }).lean();
    const items = ((mem as any)?.items || []) as Array<{
      id: string;
      text: string;
    }>;
    if (!items.length) return '';
    // Include each fact's id so the model can UPDATE or FORGET a specific fact
    // (e.g. when the user changes their brand color) instead of adding a
    // duplicate/contradicting fact.
    return items.map(it => `- [id:${it.id}] ${it.text}`).join('\n');
  } catch (err: any) {
    vlog('user-memory:read-error', {
      userId,
      workspaceId,
      error: err?.message,
    });
    return '';
  }
}

/** Update an existing memory fact's text (by id). Workspace-scoped. */
async function updateMemoryFact(
  userId: string | undefined,
  workspaceId: string | undefined,
  id: string,
  newText: string
): Promise<{ status: 'updated' | 'notfound' | 'skipped'; fact?: string }> {
  if (!userId || !workspaceId || !id) return { status: 'skipped' };
  const text = clampItemText(
    String(newText || '')
      .trim()
      .replace(/^["']|["']$/g, '')
  );
  if (!text || text.length < 2) return { status: 'skipped' };
  try {
    const r = await UserMemory.updateOne(
      { userId, workspaceId, 'items.id': id },
      { $set: { 'items.$.text': text, updatedAt: new Date() } }
    );
    if (!r.matchedCount) return { status: 'notfound' };
    // Editing a fact's text can make it identical to another existing fact (e.g.
    // two posting-schedule entries both becoming "Sunday and Monday"). Collapse
    // any duplicates so memory keeps one copy per distinct fact.
    const after = await UserMemory.findOne({ userId, workspaceId });
    if (after) {
      const items = (after.items || []).map((it: any) => ({
        id: it.id,
        text: it.text,
        createdAt: it.createdAt,
      }));
      const { items: deduped, removed } = dedupeMemoryItems(items);
      if (removed > 0) {
        await UserMemory.updateOne(
          { userId, workspaceId },
          { $set: { items: deduped, updatedAt: new Date() } }
        );
        vlog('user-memory:update-deduped', { workspaceId, id, removed });
      }
    }
    vlog('user-memory:updated', { workspaceId, id, fact: text });
    return { status: 'updated', fact: text };
  } catch (err: any) {
    vlog('user-memory:update-error', { workspaceId, error: err?.message });
    return { status: 'skipped' };
  }
}

/** Delete a memory fact (by id). Workspace-scoped. */
async function forgetMemoryFact(
  userId: string | undefined,
  workspaceId: string | undefined,
  id: string
): Promise<{ status: 'deleted' | 'notfound' | 'skipped'; fact?: string }> {
  if (!userId || !workspaceId || !id) return { status: 'skipped' };
  try {
    const existing = await UserMemory.findOne({
      userId,
      workspaceId,
      'items.id': id,
    }).lean();
    const item = ((existing as any)?.items || []).find(
      (it: any) => it.id === id
    );
    const r = await UserMemory.updateOne(
      { userId, workspaceId },
      { $pull: { items: { id } }, $set: { updatedAt: new Date() } }
    );
    if (!r.modifiedCount) return { status: 'notfound' };
    vlog('user-memory:forgot', { workspaceId, id, fact: item?.text });
    return { status: 'deleted', fact: item?.text };
  } catch (err: any) {
    vlog('user-memory:forget-error', { workspaceId, error: err?.message });
    return { status: 'skipped' };
  }
}

/**
 * Persist a pre-extracted durable fact to cross-chat memory (DB-only, NO LLM
 * call). Used when the fact is already known (e.g. from the triage classifier),
 * so we don't pay for a second extraction. Deduped against existing items.
 */
async function saveMemoryFact(
  userId: string | undefined,
  workspaceId: string | undefined,
  rawFact: string,
  _prefs?: FullPreferences
): Promise<{
  status: 'saved' | 'duplicate' | 'skipped' | 'full' | 'updated';
  fact?: string;
}> {
  if (!userId || !workspaceId) return { status: 'skipped' };
  const fact = clampItemText(
    String(rawFact || '')
      .trim()
      .replace(/^["']|["']$/g, '')
  );
  if (!fact || fact.length < 2) return { status: 'skipped' };
  try {
    const existing = await UserMemory.findOne({ userId, workspaceId });
    const existingItems = (existing?.items || []).map((it: any) => ({
      id: it.id,
      text: it.text,
      createdAt: it.createdAt,
    }));
    const { items, added, skippedDuplicate, replaced } = mergeMemoryItems(
      existingItems,
      [fact],
      () =>
        `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    );
    // Exact near-duplicate of an existing fact — nothing to do.
    if (added === 0 && replaced === 0 && skippedDuplicate > 0) {
      vlog('user-memory:fact-duplicate', { workspaceId, fact });
      return { status: 'duplicate', fact };
    }
    // A brand-new fact (not a replacement) would grow storage — refuse when full
    // rather than silently evicting the user's older memories.
    if (added > 0 && isMemoryFull(existingItems)) {
      vlog('user-memory:fact-full', {
        workspaceId,
        fact,
        totalItems: existingItems.length,
      });
      return { status: 'full', fact };
    }
    await UserMemory.updateOne(
      { userId, workspaceId },
      {
        $set: { items, updatedAt: new Date() },
        $setOnInsert: {
          userId,
          workspaceId,
          processedConversationIds: [],
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );
    if (replaced > 0 && added === 0) {
      vlog('user-memory:fact-replaced', {
        workspaceId,
        fact,
        totalItems: items.length,
      });
      return { status: 'updated', fact };
    }
    vlog('user-memory:fact-saved', {
      workspaceId,
      fact,
      totalItems: items.length,
    });
    return { status: 'saved', fact };
  } catch (err: any) {
    vlog('user-memory:fact-error', { workspaceId, error: err?.message });
    return { status: 'skipped' };
  }
}

/**
 * After a conversation finishes a turn, mine it for durable facts and merge them
 * into the user's cross-chat memory as discrete items (under hard storage caps).
 * Runs in the background (best-effort) and only when aiMemory = long-term.
 */
async function updateUserMemoryFromConversation(
  userId: string | undefined,
  workspaceId: string | undefined,
  convId: number,
  prefs: FullPreferences
): Promise<void> {
  if (!userId || !workspaceId || prefs.aiMemory !== 'long-term') return;
  try {
    const existing = await UserMemory.findOne({ userId, workspaceId });
    const existingItems = (existing?.items || []).map((it: any) => ({
      id: it.id,
      text: it.text,
      createdAt: it.createdAt,
    }));
    const existingText = existingItems.map(it => `- ${it.text}`).join('\n');

    const messages = await ChatMessage.find({ conversationId: convId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    const transcript = messages
      .reverse()
      .map(m => `${m.role === 'assistant' ? 'VeeGPT' : 'User'}: ${m.content}`)
      .join('\n');
    if (!transcript.trim()) return;

    const prompt =
      'You maintain a long-term memory of a user across all their chats with ' +
      'VeeGPT (a social-media assistant).\n' +
      (existingText
        ? `Things you already remember:\n${existingText}\n\n`
        : '') +
      'Extract NEW facts to remember from the recent messages below. Rules:\n' +
      '- Record facts ABOUT THE USER, written in third person (e.g. "User posts on ' +
      'weekends", "User\'s brand is a Bollywood movie-review page"). NEVER store ' +
      'VeeGPT\'s own replies or phrasing like "I\'ve noted that...".\n' +
      '1) EXPLICIT/INDIRECT SAVE REQUESTS — if the user asks you to remember, save, ' +
      'note, keep in mind, or "don\'t forget" something, capture exactly what they ' +
      'asked you to remember (even a preference or one-off detail). This takes priority.\n' +
      '2) DURABLE PROFILE FACTS — otherwise capture durable, reusable facts: name, ' +
      'brand/business, niche, audience, platforms, goals, ongoing projects, stable ' +
      'preferences. Ignore transient chit-chat and one-off questions.\n' +
      '- Do NOT repeat or rephrase anything already remembered (treat semantically ' +
      'equivalent facts as duplicates and skip them).\n' +
      'Return each new fact as ONE short line, no bullets or numbering. If there is ' +
      'nothing new worth remembering, return an empty response.\n\n' +
      `Recent messages:\n${transcript}`;

    const raw = (
      await withAIFeature('veegpt.memory_update', { userId, workspaceId }, () =>
        aiServiceManager.generateText(prompt, {
          ...prefs,
          responseLength: 'short',
          creativityLevel: 0.2,
        })
      )
    )?.trim();
    if (!raw) return;

    const incoming = raw
      .split('\n')
      .map(l => l.replace(/^[\s\-*•\d.)]+/, '').trim())
      .filter(Boolean);
    if (!incoming.length) return;

    const { items, added, evicted, replaced } = mergeMemoryItems(
      existingItems,
      incoming,
      () =>
        `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    );
    if (added === 0 && evicted === 0 && replaced === 0) {
      // Still record that we've processed this conversation.
      await UserMemory.updateOne(
        { userId, workspaceId },
        {
          $addToSet: { processedConversationIds: convId },
          $setOnInsert: { userId, workspaceId, createdAt: new Date() },
        },
        { upsert: true }
      );
      return;
    }

    await UserMemory.updateOne(
      { userId, workspaceId },
      {
        $set: { items, updatedAt: new Date() },
        $addToSet: { processedConversationIds: convId },
        $setOnInsert: { userId, workspaceId, createdAt: new Date() },
      },
      { upsert: true }
    );
    vlog('user-memory:updated', {
      userId,
      workspaceId,
      convId,
      added,
      evicted,
      totalItems: items.length,
    });
  } catch (err: any) {
    vlog('user-memory:update-error', {
      userId,
      workspaceId,
      convId,
      error: err?.message,
    });
  }
}

// ── List conversations ────────────────────────────────────────────────────────
router.get('/conversations', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    // Scope conversations to the workspace the user is actively viewing so
    // switching VeeFore accounts/workspaces shows only that workspace's chats.
    const workspaceId = req.query.workspaceId
      ? String(req.query.workspaceId)
      : undefined;
    const filter: any = { userId, isArchived: { $ne: true } };
    if (workspaceId) filter.workspaceId = workspaceId;
    const conversations = await ChatConversation.find(filter)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();
    res.json(conversations);
  } catch (error: any) {
    console.error('[VEEGPT] Get conversations error:', error?.message);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// ── Album: every AI image (generated + edited) across the user's chats ──────────
// Powers the sidebar "Album" gallery. Scans the user's (workspace-scoped, non-
// archived) conversations for persisted image info-cards and returns a flat,
// newest-first, URL-deduplicated list with the origin (generated/edited), the
// prompt/subject, and the source conversation so the gallery can link back.
// Uploaded images are intentionally excluded — this is the user's OWN creations.
router.get('/album', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const workspaceId = req.query.workspaceId
      ? String(req.query.workspaceId)
      : undefined;
    const convFilter: any = { userId, isArchived: { $ne: true } };
    if (workspaceId) convFilter.workspaceId = workspaceId;
    const convs = await ChatConversation.find(convFilter)
      .select({ id: 1, title: 1 })
      .lean();
    if (!convs.length) {
      res.json({ images: [] });
      return;
    }
    const convIds = convs.map((c: any) => c.id);
    const titleById = new Map<number, string>(
      convs.map((c: any) => [c.id, c.title])
    );
    const msgs = await ChatMessage.find({
      conversationId: { $in: convIds },
      infoCards: { $exists: true, $ne: null },
    })
      .select({ conversationId: 1, infoCards: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .lean();

    const seen = new Set<string>();
    const images: Array<{
      url: string;
      mimeType: string;
      origin: 'generated' | 'edited';
      prompt: string;
      conversationId: number;
      conversationTitle: string;
      createdAt: Date;
    }> = [];
    for (const m of msgs) {
      const cards = (m as any).infoCards;
      if (!Array.isArray(cards)) continue;
      for (const c of cards) {
        if (c?.kind !== 'image' || typeof c?.url !== 'string' || !c.url) continue;
        if (seen.has(c.url)) continue;
        seen.add(c.url);
        // Any image info-card is an AI creation (uploads are attachments, not
        // info-cards). Edited vs generated from the recorded operation.
        const origin: 'generated' | 'edited' =
          c.operation === 'editing' ? 'edited' : 'generated';
        images.push({
          url: c.url,
          mimeType: c.mimeType || 'image/png',
          origin,
          prompt: String(c.subject || c.prompt || c.title || '').slice(0, 240),
          conversationId: (m as any).conversationId,
          conversationTitle: titleById.get((m as any).conversationId) || 'Chat',
          createdAt: (m as any).createdAt,
        });
      }
    }
    res.json({ images });
  } catch (error: any) {
    console.error('[VEEGPT] Get album error:', error?.message);
    res.status(500).json({ error: 'Failed to fetch album' });
  }
});

// ── Search conversations (ChatGPT-style) ────────────────────────────────────
// Searches BOTH conversation titles and message content (including the text of
// card responses, which is stringified) for the query. Returns one result per
// matching conversation with a snippet around the first match and the matched
// messageId so the client can scroll to and highlight it on open.
router.get('/search', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const q = String(req.query.q || '').trim();
    const workspaceId = req.query.workspaceId
      ? String(req.query.workspaceId)
      : undefined;
    const convFilter: any = { userId, isArchived: { $ne: true } };
    if (workspaceId) convFilter.workspaceId = workspaceId;
    const convs = await ChatConversation.find(convFilter)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();

    // No query → return all conversations (the client groups them by date).
    if (!q) {
      return res.json({
        results: convs.map((c: any) => ({
          conversationId: c.id,
          title: c.title,
          lastMessageAt: c.lastMessageAt || c.updatedAt,
          snippet: null,
          matchedMessageId: null,
          titleMatch: true,
        })),
      });
    }

    const lower = q.toLowerCase();
    const convById = new Map<number, any>(convs.map((c: any) => [c.id, c]));
    // ChatMessage.conversationId is a Number; some conversations carry an
    // ObjectId-string id (legacy/synthetic) that can't cast — filter those out
    // of the $in query so a single bad id can't 500 the whole search.
    const convIds = convs
      .map((c: any) => (typeof c.id === 'number' ? c.id : Number(c.id)))
      .filter((v: number) => Number.isFinite(v));

    // Pull messages for the user's conversations and scan in-memory so we can
    // also match the stringified card text, not just the prose `content`.
    const messages = await ChatMessage.find({
      conversationId: { $in: convIds },
    })
      .select(
        'id conversationId role content postCard listCard editCards infoCards createdAt'
      )
      .sort({ createdAt: -1 })
      .lean();

    // Build a searchable haystack per message: prose + any card text.
    const haystackOf = (m: any): string => {
      let s = m.content || '';
      for (const f of ['postCard', 'listCard', 'editCards', 'infoCards']) {
        if (m[f]) {
          try {
            s += ' ' + JSON.stringify(m[f]);
          } catch {
            /* ignore */
          }
        }
      }
      return s;
    };

    const resultByConv = new Map<number, any>();
    for (const m of messages as any[]) {
      const conv = convById.get(m.conversationId);
      if (!conv) continue;
      if (resultByConv.has(m.conversationId)) continue; // keep the most recent match only
      const hay = haystackOf(m);
      const idx = hay.toLowerCase().indexOf(lower);
      if (idx === -1) continue;
      // Build a snippet window around the match.
      const start = Math.max(0, idx - 40);
      const end = Math.min(hay.length, idx + q.length + 80);
      let snippet = hay.slice(start, end).replace(/\s+/g, ' ').trim();
      if (start > 0) snippet = '…' + snippet;
      if (end < hay.length) snippet = snippet + '…';
      resultByConv.set(m.conversationId, {
        conversationId: m.conversationId,
        title: conv.title,
        lastMessageAt: conv.lastMessageAt || conv.updatedAt,
        snippet,
        matchedMessageId: m.id,
      });
    }

    // Title-only matches (no message hit) still surface.
    for (const c of convs as any[]) {
      if (resultByConv.has(c.id)) continue;
      if ((c.title || '').toLowerCase().includes(lower)) {
        resultByConv.set(c.id, {
          conversationId: c.id,
          title: c.title,
          lastMessageAt: c.lastMessageAt || c.updatedAt,
          snippet: null,
          matchedMessageId: null,
          titleMatch: true,
        });
      }
    }

    const results = Array.from(resultByConv.values())
      .sort(
        (a, b) =>
          new Date(b.lastMessageAt || 0).getTime() -
          new Date(a.lastMessageAt || 0).getTime()
      )
      .slice(0, 50);
    res.json({ results });
  } catch (error: any) {
    vlog('search:error', { error: error?.message });
    console.error('[VEEGPT] Search conversations error:', error?.message);
    res.status(500).json({ error: 'Failed to search conversations' });
  }
});

// ── Get messages for a conversation ─────────────────────────────────────────────
router.get(
  '/conversations/:conversationId/messages',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const convId = parseInt(req.params.conversationId, 10);
      const messages = await ChatMessage.find({ conversationId: convId })
        .sort({ createdAt: 1 })
        .lean();
      res.json(messages);
    } catch (error: any) {
      console.error('[VEEGPT] Get messages error:', error?.message);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  }
);

// ── Live deep-research progress for a conversation ──────────────────────────────
// Lets a client that reconnected (user navigated away mid-research and came
// back) RESUME the live activity feed. Returns the buffered progress snapshot
// (steps / sources / counts) or { active: false } when nothing is in flight.
router.get(
  '/conversations/:conversationId/research-progress',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const convId = parseInt(req.params.conversationId, 10);
      // Fast path: this instance is running the generation. Fallback: another
      // instance is — read the Redis mirror so the feed still resumes.
      let state: ServerResearchProgress | null = activeResearchProgress.get(convId) || null;
      if (!state) {
        try {
          const raw = await getRedisClient().get(RESEARCH_PROGRESS_KEY(convId));
          if (raw) state = JSON.parse(raw) as ServerResearchProgress;
        } catch {
          /* Redis unavailable — degrade to the plain working indicator */
        }
      }
      if (!state) {
        res.json({ active: false });
        return;
      }
      // Only the conversation's owner may read its progress.
      const conv = await requestConversation(req, convId);
      if (!conv || (conv.userId && req.user?.id && String(conv.userId) !== String(req.user.id))) {
        res.json({ active: false });
        return;
      }
      res.json(state);
    } catch (error: any) {
      console.error('[VEEGPT] Get research progress error:', error?.message);
      res.status(500).json({ error: 'Failed to fetch research progress' });
    }
  }
);

// GET the LIVE partial-answer buffer for a conversation whose reply is still
// generating server-side. A client that reconnects (navigated away, or closed
// and reopened the app mid-generation) polls this to show the REAL partial text
// as it builds — instead of a blank "working on it" — until the finished reply
// lands via the messages poll. Returns { active, messageId, content } or
// { active: false } when nothing is in flight.
router.get(
  '/conversations/:conversationId/generation-state',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const convId = parseInt(req.params.conversationId, 10);
      let state: ServerGenerationState | null = activeGenerationText.get(convId) || null;
      if (!state) {
        try {
          const raw = await getRedisClient().get(GENERATION_STATE_KEY(convId));
          if (raw) state = JSON.parse(raw) as ServerGenerationState;
        } catch {
          /* Redis unavailable — degrade to the plain working indicator */
        }
      }
      if (!state) {
        res.json({ active: false });
        return;
      }
      // Only the conversation's owner may read its in-flight answer.
      const conv = await requestConversation(req, convId);
      if (!conv || (conv.userId && req.user?.id && String(conv.userId) !== String(req.user.id))) {
        res.json({ active: false });
        return;
      }
      res.json({ active: true, messageId: state.messageId, content: state.content });
    } catch (error: any) {
      console.error('[VEEGPT] Get generation state error:', error?.message);
      res.status(500).json({ error: 'Failed to fetch generation state' });
    }
  }
);

// GET the LIVE image-generation/editing card for a conversation whose reply is
// still generating server-side. A client that refreshed or reopened the app
// mid-generation polls this to re-show the SAME animated image card (instead of
// a blank "working on it") until the finished image lands via the messages poll.
// Returns { active, messageId, operation, status, subject } or { active: false }.
router.get(
  '/conversations/:conversationId/image-progress',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const convId = parseInt(req.params.conversationId, 10);
      let state: ServerImageProgress | null = activeImageProgress.get(convId) || null;
      if (!state) {
        try {
          const raw = await getRedisClient().get(IMAGE_PROGRESS_KEY(convId));
          if (raw) state = JSON.parse(raw) as ServerImageProgress;
        } catch {
          /* Redis unavailable — degrade to the plain working indicator */
        }
      }
      if (!state) {
        res.json({ active: false });
        return;
      }
      // Only the conversation's owner may read its in-flight image state.
      const conv = await requestConversation(req, convId);
      if (!conv || (conv.userId && req.user?.id && String(conv.userId) !== String(req.user.id))) {
        res.json({ active: false });
        return;
      }
      res.json({
        active: true,
        messageId: state.messageId,
        operation: state.operation,
        status: state.status,
        subject: state.subject,
      });
    } catch (error: any) {
      console.error('[VEEGPT] Get image progress error:', error?.message);
      res.status(500).json({ error: 'Failed to fetch image progress' });
    }
  }
);

// ── Live video-editor progress (resume-on-reopen) ───────────────────────────
// A client that reopened the app while the `video_editor` tool was still running
// polls this to re-show the SAME animated editor card (phase/percent/plan
// checklist + step counter) instead of a blank "working on it", until the
// finished video lands via the messages poll. Returns
// { active, messageId, phase, percent, status, subject, plan, activeStepIndex }
// or { active: false }.
router.get(
  '/conversations/:conversationId/video-editor-progress',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const convId = parseInt(req.params.conversationId, 10);
      let state: ServerVideoEditorProgress | null =
        activeVideoEditorProgress.get(convId) || null;
      if (!state) {
        try {
          const raw = await getRedisClient().get(VIDEO_EDITOR_PROGRESS_KEY(convId));
          if (raw) state = JSON.parse(raw) as ServerVideoEditorProgress;
        } catch {
          /* Redis unavailable — degrade to the plain working indicator */
        }
      }
      if (!state) {
        res.json({ active: false });
        return;
      }
      // Only the conversation's owner may read its in-flight edit state.
      const conv = await requestConversation(req, convId);
      if (!conv || (conv.userId && req.user?.id && String(conv.userId) !== String(req.user.id))) {
        res.json({ active: false });
        return;
      }
      res.json({
        active: true,
        messageId: state.messageId,
        phase: state.phase,
        percent: state.percent,
        status: state.status,
        subject: state.subject,
        plan: state.plan,
        activeStepIndex: state.activeStepIndex,
      });
    } catch (error: any) {
      console.error('[VEEGPT] Get video editor progress error:', error?.message);
      res.status(500).json({ error: 'Failed to fetch video editor progress' });
    }
  }
);

// ── Send a message to an existing conversation (STREAMS the reply) ──────────────
// VeeGPT tier gating: this single endpoint currently serves Basic, Full, and
// Advanced VeeGPT uniformly — there is no in-handler branching yet that
// restricts capabilities by plan tier (veeGPTFullGuards / veeGPTAdvancedGuards
// from ai-route-guards.ts are defined but have no corresponding tier-specific
// code path to attach to here). We apply veeGPTBasicGuards so every request
// still requires an active subscription. Plain VeeGPT conversation is free;
// only generate_caption and generate_hashtags settle credits inside buildInfoCard.
router.post(
  '/conversations/:conversationId/messages',
  requireAuth,
  // The ONE VGU gate. It also performs the per-plan request-rate check, so there
  // is no separate rate-limit middleware to disagree with it. Reserves atomically BEFORE the stream opens, so an
  // over-quota turn is refused with a structured 429 instead of a half-written
  // SSE stream, and reconciles from real tokens when the response ends.
  meterAI({
    feature: 'veegpt.chat',
    model: requestSelectedModel,
    // The user picked this model in AI Configuration, so their tier allowance
    // applies and an out-of-plan choice is refused rather than swapped.
    modelChosenBy: 'user',
    attachments: req => parseAttachments(req.body?.attachments).attachments.length,
    // Prompt size feeds the estimate; the text is only fingerprinted for
    // duplicate detection and is never stored.
    promptChars: req => (typeof req.body?.content === 'string' ? req.body.content.length : undefined),
    promptText: req => (typeof req.body?.content === 'string' ? req.body.content : undefined),
  }),
  ...veeGPTBasicGuards,
  async (req: any, res: Response) => {
    const convId = parseInt(req.params.conversationId, 10);
    try {
      const { content } = req.body;
      const { attachments, error: attachErr } = parseAttachments(
        req.body?.attachments
      );
      if (attachErr) return res.status(400).json({ error: attachErr });
      // Files the client uploaded to storage first and sent as opaque KEYS.
      // Resolve them into model-readable bytes + persistable bubble records.
      const attachmentKeys: string[] = Array.isArray(req.body?.attachmentIds)
        ? req.body.attachmentIds.filter((k: any) => typeof k === 'string' && k)
        : [];
      const geminiApiKey = resolveGeminiApiKey(await requestAIPreferences(req));
      const { attachments: keyAttachments, extraRecords: keyRecords } =
        await resolveStorageKeyAttachments(attachmentKeys, geminiApiKey);
      attachments.push(...keyAttachments);
      // Hosted media URLs (unified posting path) count as content too — a media-only
      // post message has no text and no base64 attachments, just uploaded URLs.
      const hasMediaUrls =
        Array.isArray(req.body?.mediaUrls) &&
        req.body.mediaUrls.some((u: any) => typeof u === 'string' && u);
      // Allow a message that has attachments/media even if the text is empty.
      if (!content?.trim() && attachments.length === 0 && !hasMediaUrls && keyRecords.length === 0) {
        return res.status(400).json({ error: 'Message content is required' });
      }

      const conversation = await requestConversation(req, convId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found' });
      }

      const safeContent = (content || '').trim();
      // When only files are attached (no text), store a single space (content is
      // required) — the bubble renders the attachment chips, not this placeholder.
      const displayContent = safeContent || ' ';

      // `skipUserMessage` is set when this stream is a continuation of the
      // post-agent CHAT route: the post-agent flow already persisted the user
      // message (via /conversations/log) and already ran memory detection in its
      // triage call. We therefore neither re-create the user message (would
      // duplicate it) nor re-run the per-turn memory LLM (would double the cost).
      const skipUserMessage =
        req.body?.skipUserMessage === true ||
        !!(Number(req.body?.regenerateMessageId) || 0);
      // When set, this request re-answers an existing assistant message (ChatGPT-
      // style regenerate): no new user message, and the result is appended to that
      // message as a new variant (handled in streamGeneration).
      const regenerateMessageId = Number(req.body?.regenerateMessageId) || null;
      // Already-uploaded hosted media URLs from the unified posting path. We
      // persist these on the user message so its image/video thumbnail renders
      // from the messages cache (and survives refresh) — no optimistic seeding.
      const mediaUrlsForMsg: string[] = Array.isArray(req.body?.mediaUrls)
        ? req.body.mediaUrls.filter((u: any) => typeof u === 'string' && u)
        : [];

      let userMessage: any = null;
      if (!skipUserMessage) {
        const userMessageDoc = {
          conversationId: convId,
          role: 'user' as const,
          content: displayContent,
          attachments: buildUserMessageAttachments(attachments, mediaUrlsForMsg, keyRecords),
          tokensUsed: 0,
        };
        // The `id` field is unique; resolveClientMessageId checks-then-inserts, so
        // a rare race (or a client-reused id) can still collide and throw E11000.
        // Retry a couple of times with a freshly generated id so a follow-up
        // message is never lost to a transient id clash (this was surfacing as a
        // hard 500 "Failed to create message").
        let created = false;
        for (let attempt = 0; attempt < 3 && !created; attempt++) {
          try {
            userMessage = await ChatMessage.create({
              id: await resolveClientMessageId(
                attempt === 0 ? req.body?.userMessageId : undefined
              ),
              ...userMessageDoc,
            });
            created = true;
          } catch (e: any) {
            const isDup = e?.code === 11000 || /duplicate key/i.test(e?.message || '');
            if (!isDup || attempt === 2) throw e;
            vlog('send-message:user-id-collision-retry', { convId, attempt });
          }
        }
        await ChatConversation.updateOne(
          { id: convId },
          {
            lastMessageAt: new Date(),
            updatedAt: new Date(),
            $inc: { messageCount: 1 },
          }
        );
      } else {
        // The post-agent routeToChat flow already persisted this user message via
        // /conversations/log. Don't create a second one — but DO emit the existing
        // one as a `userMessage` event below so the client reconciles its optimistic
        // bubble exactly like the normal chat path (prevents duplicate bubbles).
        userMessage = await ChatMessage.findOne({
          conversationId: convId,
          role: 'user',
        })
          .sort({ createdAt: -1 })
          .lean();
      }

      activeGenerations.set(convId, true);
      vlog('send-message:received', {
        convId,
        contentLength: safeContent.length,
        attachments: attachments.length,
        skipUserMessage,
      });

      // Begin streaming response on this same request.
      initStreamResponse(res);
      // Always emit the user message (freshly created OR the pre-persisted one) so
      // the client can replace its optimistic temp bubble with the canonical record.
      if (userMessage)
        writeEvent(res, {
          type: 'userMessage',
          message: userMessage,
          conversationId: convId,
        });

      // The client disconnected (navigated to another chat, closed VeeGPT, or
      // closed the whole app). DO NOT stop generation — let it run to completion
      // and persist server-side so the answer (and the reasoning) is waiting when
      // the user comes back, exactly like ChatGPT/Claude. Only the explicit
      // /stop endpoint halts a generation. `writeEvent` already no-ops once the
      // socket is gone, so continuing to "stream" into a dead response is safe.
      // (Generation is only ever stopped on purpose via /stop, never by leaving.)

      const preferences = await requestAIPreferences(req);
      // NOTE: image-generation turns hide the "thinking" panel purely on the
      // client (ChatInterface hides Thoughts whenever a message has a live image
      // card or an image infoCard). We deliberately do NOT pattern-match the
      // message here — the model decides entirely on its own whether to call the
      // image tool, with no server-side keyword/regex pre-hint.
      // History window + long-term memory. 'long-term' rolls older messages into a
      // persisted running summary (true unlimited memory) and keeps the recent
      // turns verbatim; 'short-term' just sends the last few turns. We never send
      // the entire raw transcript, which would balloon the prompt and slow the
      // model's time-to-first-token.
      const { history, memorySummary } = await buildHistoryWithMemory(
        convId,
        preferences,
        {
          userId: req.user?.id,
          workspaceId: req.body?.workspaceId || conversation.workspaceId,
        }
      );
      // Regenerate: drop the trailing assistant turn(s) so the model re-answers the
      // user's prompt fresh (it must not see its own previous answer in history).
      if (regenerateMessageId) {
        while (
          history.length &&
          history[history.length - 1].role === 'assistant'
        )
          history.pop();
      }
      // When skipping the user-message write, the post-agent's /conversations/log
      // call may not have committed yet (it's fire-and-forget for an existing
      // conversation), so the DB history might not include this turn. Ensure the
      // latest user message is present so the model always sees it.
      const lastHist = history[history.length - 1];
      if (
        !lastHist ||
        lastHist.role !== 'user' ||
        lastHist.content.trim() !== safeContent
      ) {
        if (safeContent) history.push({ role: 'user', content: safeContent });
      }
      // Tell the model what files are attached (the binary parts go to the model
      // separately via generateTextStream).
      if (attachments.length && history.length) {
        history[history.length - 1].content +=
          attachmentsPromptNote(attachments);
      }
      // Media-only posting turn (hosted URLs, no text): make the user's intent
      // explicit so the model still acts. Without this the turn looks empty and
      // the model neither replies nor calls the tool. We append (or add) a short
      // instruction reflecting that the user just provided the media for the post
      // they were preparing.
      if (mediaUrlsForMsg.length && !safeContent) {
        const note =
          'The user just attached the media for the post we were preparing. Use it to fulfill their posting request (call schedule_post when ready, or ask for the still-missing detail).';
        if (history.length && history[history.length - 1].role === 'user') {
          history[history.length - 1].content = (
            history[history.length - 1].content.trim() +
            '\n' +
            note
          ).trim();
        } else {
          history.push({ role: 'user', content: note });
        }
      }
      // Cross-chat memory: durable facts about the user from their other chats.
      // Prefer the workspace the user is actively viewing (sent by the client);
      // fall back to the conversation's stored workspaceId.
      const memWorkspaceId = await resolveMemoryWorkspaceId(
        req.body?.workspaceId || conversation.workspaceId,
        req.user?.id
      );

      // Read the EXISTING memory profile BEFORE any explicit save, so a freshly
      // saved fact doesn't appear pre-saved (which made the model say "already
      // noted" on the first save).
      const userMemoryProfile = await getUserMemoryProfile(
        req.user?.id,
        memWorkspaceId
      );

      // Explicit "remember X" → save it DETERMINISTICALLY now (no LLM, can't fail
      // on quota). The status drives a truthful reply: saved (new) vs already-saved.
      // Skipped when the post-agent triage already handled memory for this turn.
      let memoryNote = '';
      // Durable-fact detection is now folded into the MAIN chat call via the
      // `remember_fact` tool (see streamGeneration) — no separate per-message
      // extraction LLM call. We still handle an EXPLICIT "remember X" here, but
      // DETERMINISTICALLY (zero LLM, can't fail on quota), so it's guaranteed even
      // on turns where tools aren't offered (e.g. image/PDF analysis). It's deduped
      // against memory, so if the tool also captured it there's no double-save.
      const explicitIntent =
        !skipUserMessage &&
        !DISABLE_REGEX_FOR_TESTING &&
        preferences.aiMemory === 'long-term' &&
        hasSaveIntent(safeContent);
      vlog('user-memory:intent-check', {
        convId,
        aiMemory: preferences.aiMemory,
        hasSaveIntent: hasSaveIntent(safeContent),
        disabledForTesting: DISABLE_REGEX_FOR_TESTING,
        content: safeContent.slice(0, 80),
      });
      if (explicitIntent) {
        const r = await saveMemoryFact(
          req.user?.id,
          memWorkspaceId,
          extractSaveIntentFact(safeContent) || '',
          preferences
        );
        if (r.status === 'saved')
          memoryNote = `IMPORTANT: You have JUST saved this NEW fact to long-term memory: "${r.fact}". It was NOT remembered before. Confirm you'll remember it now — do NOT say it was already saved.`;
        else if (r.status === 'updated')
          memoryNote = `You have JUST UPDATED an existing fact on this topic to: "${r.fact}" (it replaced the old value, no duplicate was created). Confirm you've updated it.`;
        else if (r.status === 'duplicate')
          memoryNote = `This was ALREADY in long-term memory before now: "${r.fact}". Tell the user it's already saved.`;
        else if (r.status === 'full')
          memoryNote = `You could NOT save "${r.fact}" because the user's long-term memory is FULL. Tell them their VeeGPT memory storage is full and they need to remove a few facts in Settings → AI Configuration before you can remember new things.`;
        vlog('user-memory:explicit', {
          convId,
          status: r.status,
          fact: r.fact,
          memWorkspaceId,
        });
      }

      // Live workspace/account data (from Redis cache, refreshed by a worker).
      // Only loaded when the message actually needs it — the cheap router
      // (post-agent triage) sets `includeWorkspaceContext`. For ordinary chat,
      // ideas, and how-to turns we skip this large block entirely to cut prompt
      // size and cost. Defaults to TRUE for direct calls (no flag) so behavior is
      // unchanged when the streaming endpoint is hit outside the router.
      // Advanced VeeGPT selectors (composer dropdowns): the chosen persona/agent
      // and the specific social account the user wants VeeGPT focused on.
      const selectedAccountId =
        typeof req.body?.selectedAccountId === 'string' &&
        req.body.selectedAccountId.trim()
          ? req.body.selectedAccountId.trim()
          : '';
      // Resolve the VeeGPT tier once (Free=basic, Creator=full, Pro/Business=
      // advanced) and use it for persona gating, tool gating, and the capability
      // context below.
      const veeGPTTier: VeeGPTTier = await resolveVeeGPTTier(req.user?.id);
      // A persona the plan doesn't include falls back to the default (no
      // directives) so a crafted selectedAgentId can't apply a higher-tier persona.
      const agentDirectives = getAgentDirectivesForTier(
        req.body?.selectedAgentId,
        veeGPTTier
      );
      const forcedTool =
        typeof req.body?.forcedTool === 'string'
          ? req.body.forcedTool.trim()
          : '';
      // When the user has SELECTED a specific account, we skip the HEAVY per-account
      // analytics snapshot (followers/audience/reach/recent posts) — VeeGPT pulls
      // that on demand via get_account_details, only when a question needs it. But
      // we STILL inject the lightweight identity block (name, plan, niche, workspace)
      // so VeeGPT always knows who it's talking to (e.g. "what is my name").
      const wantContext = req.body?.includeWorkspaceContext !== false;
      const workspaceContext = !wantContext
        ? ''
        : selectedAccountId
          ? await getIdentityContextForPrompt(memWorkspaceId, req.user?.id)
          : await getWorkspaceContextForPrompt(memWorkspaceId, req.user?.id);
      vlog('send-message:workspace-context', {
        convId,
        included: wantContext,
        identityOnly: !!selectedAccountId,
        length: workspaceContext.length,
        selectedAccountId: selectedAccountId || null,
      });
      // Tool-calling (function-calling) lets the model act mid-chat WITHOUT a
      // separate regex/triage step or a separate per-message memory LLM call.
      // Gated behind `enableTools`. The MEMORY tool (remember_fact) is always
      // offered (long-term memory only needs a user, not a connected account);
      // schedule_post is added only when the workspace has connected accounts.
      // Tools require the OpenAI/GitHub text path, so they're disabled when there
      // are binary attachments (those use the Gemini multimodal path).
      let chatTools: ChatTool[] | undefined;
      let toolContext: string | undefined;
      let toolAccountUsernames: string[] = [];
      // mediaUrls: already-uploaded hosted URLs the client sends with a posting
      // message (the unified path uploads media first, then sends URLs — NOT
      // binary attachments, so the OpenAI tool path stays usable).
      const toolMediaUrls: string[] = Array.isArray(req.body?.mediaUrls)
        ? req.body.mediaUrls.filter((u: any) => typeof u === 'string' && u)
        : [];
      // ── FIX 1/2: durable "pending post" carry-over + account resolution ──────
      // The scheduling flow spans turns; state (media/time/account) that lived
      // only for a single request was lost on follow-ups, so the handler kept
      // hitting the no-media branch. We (a) restore earlier media when the
      // current turn has none, and (b) resolve the target account from the
      // dropdown, a single connected account, or a typed username. All
      // best-effort — never throw in the request path.
      const pendingPost: any = (conversation as any)?.pendingPost || null;
      const pendingFresh =
        !!pendingPost &&
        !!pendingPost.updatedAt &&
        Date.now() - new Date(pendingPost.updatedAt).getTime() <
          PENDING_POST_TTL_MS;
      // (a) Media fallback: keep the earlier upload across the account/time turn.
      if (
        toolMediaUrls.length === 0 &&
        pendingFresh &&
        Array.isArray(pendingPost.mediaUrls)
      ) {
        for (const u of pendingPost.mediaUrls)
          if (typeof u === 'string' && u) toolMediaUrls.push(u);
      }
      // (b) Resolve the effective account id: explicit dropdown → single
      // connected account → a connected username typed in the latest message →
      // the account remembered from an earlier turn.
      let resolvedAccountId = selectedAccountId || '';
      try {
        if (memWorkspaceId) {
          const connectedAccts =
            (await storage
              .getSocialAccountsByWorkspace(memWorkspaceId)
              .catch(() => [])) || [];
          const acctId = (a: any) =>
            String(a?.id || a?._id || a?.accountId || '');
          if (!resolvedAccountId && connectedAccts.length === 1) {
            resolvedAccountId = acctId(connectedAccts[0]);
          } else if (!resolvedAccountId && connectedAccts.length > 1) {
            const text = (safeContent || '').toLowerCase();
            const match = connectedAccts.find((a: any) => {
              const uname = String(a?.username || '')
                .replace(/^@+/, '')
                .toLowerCase();
              return uname && text.includes(uname);
            });
            if (match) resolvedAccountId = acctId(match);
          }
        }
      } catch {
        /* best-effort account resolution */
      }
      if (!resolvedAccountId && pendingFresh && pendingPost.accountId) {
        resolvedAccountId = String(pendingPost.accountId);
      }
      // Remember the current turn's media (posting path) so a follow-up turn can
      // recover it. Dotted $set preserves any time/account already persisted.
      if (toolMediaUrls.length) {
        ChatConversation.updateOne(
          { id: convId },
          {
            $set: {
              'pendingPost.mediaUrls': toolMediaUrls.slice(),
              ...(resolvedAccountId
                ? { 'pendingPost.accountId': resolvedAccountId }
                : {}),
              'pendingPost.updatedAt': new Date(),
            },
          }
        ).catch(() => {});
      }
      const hasMedia = toolMediaUrls.length > 0;
      // Verification aid (VEEGPT_CTX_DEBUG): show how media/account were resolved
      // for this turn so a scheduling follow-up (e.g. a bare account-name reply)
      // is debuggable from the file instead of racing past in the console.
      if (ctxDebugEnabled()) {
        appendCtxDebug({
          kind: 'schedule-media',
          convId,
          bodyMediaCount: mediaUrlsForMsg.length,
          finalMediaCount: toolMediaUrls.length,
          pendingFresh,
          pendingMediaCount: Array.isArray(pendingPost?.mediaUrls)
            ? pendingPost.mediaUrls.length
            : 0,
          resolvedAccountId: resolvedAccountId || null,
          message: ctxDebugTextEnabled() ? preview(safeContent) : undefined,
        });
      }
      const memoryToolEnabled =
        preferences.aiMemory === 'long-term' &&
        !skipUserMessage &&
        !!memWorkspaceId;
      // Whether the remember_fact/update/forget tools were actually offered to the
      // model this turn. When true, the LLM decides what to save in-band — so we
      // must NOT also run the periodic background extraction (that's what caused
      // facts to be saved on a fixed every-N-messages cadence regardless of intent).
      let memoryToolOffered = false;
      // Seed the prompt with the user's plan-capability context ALWAYS (even on
      // the media/attachment path where tools are disabled), so VeeGPT knows what
      // it can't do and tells the user which plan unlocks it instead of playing
      // along (asking for details / running a substitute). Every tool array below
      // is also filtered by veeGPTTier.
      {
        const tierContext = buildTierCapabilityContext(veeGPTTier);
        if (tierContext) toolContext = tierContext;
      }
      if (req.body?.enableTools === true && attachments.length === 0) {
        const tools: ChatTool[] = [];
        if (memoryToolEnabled) {
          const memTools = filterToolsByTier(
            VEEGPT_MEMORY_TOOLS_ALL,
            veeGPTTier
          );
          tools.push(...memTools);
          memoryToolOffered = memTools.length > 0;
        }
        if (memWorkspaceId) {
          // Read tool is Basic; edit tools are Full+; insight tools are a mix
          // (caption/hashtag/best-time = Basic, insight/search/trends = Full,
          // deep_research = Advanced) — filterToolsByTier applies the right cut.
          tools.push(
            ...filterToolsByTier(VEEGPT_DATA_TOOLS, veeGPTTier),
            ...filterToolsByTier(VEEGPT_EDIT_TOOLS, veeGPTTier),
            ...filterToolsByTier(VEEGPT_INSIGHT_TOOLS, veeGPTTier)
          );
          // Inject the user's posts (with ids) so the model can resolve "the first
          // scheduled post" → a real contentId and call an edit tool in one pass.
          const contentCtx = await buildContentContext(memWorkspaceId);
          if (contentCtx)
            toolContext =
              (toolContext ? toolContext + '\n\n' : '') + contentCtx;
          try {
            const accts =
              (await storage
                .getSocialAccountsByWorkspace(memWorkspaceId)
                .catch(() => [])) || [];
            if (accts.length > 0) {
              // schedule_post is Full+ — only add the posting tool + its context
              // when the tier allows it.
              const chatToolsForTier = filterToolsByTier(
                VEEGPT_CHAT_TOOLS,
                veeGPTTier
              );
              if (chatToolsForTier.length) {
                tools.push(...chatToolsForTier);
                toolContext =
                  buildToolContext(
                    accts,
                    req.body?.localNow,
                    req.body?.timezone,
                    hasMedia
                  ) + (toolContext ? `\n\n${toolContext}` : '');
                toolAccountUsernames = accts
                  .map((a: any) => a.username)
                  .filter(Boolean);
              }
              // get_account_details is Full+ — only offer it + the scope hint when
              // the tier allows it (otherwise the model would reference a tool it
              // can't call).
              const accountToolsForTier = filterToolsByTier(
                VEEGPT_ACCOUNT_TOOLS,
                veeGPTTier
              );
              if (accountToolsForTier.length) {
                const scopeHint = buildAccountScopeHint(
                  accts,
                  selectedAccountId
                );
                if (scopeHint) {
                  tools.push(...accountToolsForTier);
                  toolContext = `${scopeHint}\n\n${toolContext}`;
                }
              }
            }
          } catch {
            /* no accounts → no posting tool */
          }
        }
        // Always give the model the user's FRESH niche/profile (app-level data) so
        // niche-dependent questions (trends, ideas) use the real niche, not stale
        // cache or a generic guess.
        const profileHint = await getFreshProfileHint(req.user?.id);
        if (profileHint)
          toolContext = profileHint + (toolContext ? `\n\n${toolContext}` : '');
        // User explicitly picked a tool to run → force it (prepended so it leads),
        // but only if the tier allows that tool; otherwise emit an upgrade note.
        const forcedDirective = buildForcedToolDirective(
          forcedTool,
          veeGPTTier
        );
        if (forcedDirective)
          toolContext =
            forcedDirective + (toolContext ? `\n\n${toolContext}` : '');
        if (tools.length) chatTools = tools;
      }
      await streamGeneration(
        res,
        convId,
        history,
        preferences,
        memorySummary,
        userMemoryProfile,
        workspaceContext,
        memoryNote,
        attachments,
        chatTools,
        toolContext,
        toolMediaUrls,
        req.body?.localNow,
        toolAccountUsernames,
        memoryToolEnabled
          ? { userId: req.user?.id, workspaceId: memWorkspaceId }
          : undefined,
        { userId: req.user?.id, workspaceId: memWorkspaceId },
        regenerateMessageId ? { messageId: regenerateMessageId } : undefined,
        {
          agentDirectives,
          accountScope: {
            userId: req.user?.id,
            workspaceId: memWorkspaceId,
            // FIX 2: feed the RESOLVED account (dropdown / single / typed name /
            // remembered) so the schedule plan and on-demand account fetches
            // target the right account even when the user only typed a name.
            accountId: resolvedAccountId || undefined,
          },
          veeGPTTier,
          selectedAgentId:
            typeof req.body?.selectedAgentId === 'string'
              ? req.body.selectedAgentId
              : undefined,
          forcedTool,
        }
      );
      res.end();

      // Background (fire-and-forget, AFTER the response): mine the conversation for
      // OTHER durable facts via the LLM — but ONLY as a fallback when the in-band
      // remember_fact tool was NOT available this turn (e.g. attachment analysis or
      // tools disabled). When the tool WAS offered, the model already decided what
      // (if anything) to save, so we don't run a fixed-cadence extraction.
      // Memory is handled TOOL-ONLY: in-band remember_fact plus the focused memory
      // pass inside streamGeneration (which guarantees durable facts aren't missed).
      // No separate heuristic text-extraction runs here.
      void memoryToolOffered;
    } catch (error: any) {
      // Log the FULL error (message + stack) so the real cause is visible in the
      // server console, and return the message to the client so a 500 is
      // diagnosable instead of a generic "Failed to create message".
      console.error('[VEEGPT] Create message error:', error?.message, error?.stack);
      const detail =
        typeof error?.message === 'string' ? error.message : 'Failed to create message';
      if (!res.headersSent) {
        res.status(500).json({ error: `Failed to create message: ${detail}` });
      } else {
        writeEvent(res, { type: 'error', error: `Failed to create message: ${detail}` });
        res.end();
      }
    }
  }
);

// ── Stop an in-flight generation ────────────────────────────────────────────────
router.post(
  '/conversations/:conversationId/stop',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const convId = parseInt(req.params.conversationId, 10);
      // Halt the generation loop FIRST so streamGeneration's persist sees the stop
      // and skips writing — the client's partial below becomes authoritative.
      activeGenerations.set(convId, false);
      // Cancel the upstream model request so token usage stops immediately.
      try {
        activeAbortControllers.get(convId)?.abort();
      } catch {
        /* noop */
      }

      // The client sends the exact text it had revealed on screen when the user hit
      // Stop. Persist EXACTLY that — never the model's (often already-complete) full
      // output — so Stop truly stops where the user saw it.
      const messageId = Number(req.body?.messageId) || null;
      const partial =
        typeof req.body?.content === 'string' ? req.body.content : null;
      if (messageId && partial != null) {
        const msg = await ChatMessage.findOne({ id: messageId });
        if (msg) {
          const hadContent = !!(
            (msg as any).content && (msg as any).content.trim()
          );
          const hasVariants =
            Array.isArray((msg as any).variants) &&
            (msg as any).variants.length > 0;
          if (hadContent || hasVariants) {
            // Stopped a REGENERATE → keep the original as a variant and add the
            // stopped partial as the active variant (1/2, 2/2 preserved).
            const prior = hasVariants
              ? (msg as any).variants.slice()
              : [
                  {
                    content: (msg as any).content,
                    postCard: (msg as any).postCard,
                    listCard: (msg as any).listCard,
                    editCards: (msg as any).editCards,
                    infoCards: (msg as any).infoCards,
                    createdAt: (msg as any).createdAt,
                  },
                ];
            prior.push({ content: partial || ' ', createdAt: new Date() });
            await ChatMessage.updateOne(
              { id: messageId },
              {
                content: partial || ' ',
                variants: prior,
                activeVariant: prior.length - 1,
                deliveryStatus: 'stopped',
              }
            );
          } else {
            // Stopped a fresh reply → persist the partial text and flag it as
            // stopped so the header shows "Stopped" (not "Response ready").
            await ChatMessage.updateOne(
              { id: messageId },
              { content: partial || ' ', deliveryStatus: 'stopped' }
            );
          }
        }
      }
      res.json({ success: true, message: 'Generation stopped' });
    } catch (error: any) {
      console.error('[VEEGPT] Stop generation error:', error?.message);
      res.status(500).json({ error: 'Failed to stop generation' });
    }
  }
);

// ── Rename a conversation ───────────────────────────────────────────────────────
router.patch(
  '/conversations/:conversationId',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const convId = parseInt(req.params.conversationId, 10);
      const { title } = req.body;
      if (!title?.trim())
        return res.status(400).json({ error: 'Title is required' });
      await ChatConversation.updateOne(
        { id: convId },
        { title: title.trim(), updatedAt: new Date() }
      );
      res.json({ success: true, conversationId: convId });
    } catch (error: any) {
      console.error('[VEEGPT] Rename conversation error:', error?.message);
      res.status(500).json({ error: 'Failed to rename conversation' });
    }
  }
);

// ── Archive a conversation ──────────────────────────────────────────────────────
router.post(
  '/conversations/:conversationId/archive',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const convId = parseInt(req.params.conversationId, 10);
      await ChatConversation.updateOne(
        { id: convId },
        { isArchived: true, updatedAt: new Date() }
      );
      res.json({ success: true, conversationId: convId });
    } catch (error: any) {
      console.error('[VEEGPT] Archive conversation error:', error?.message);
      res.status(500).json({ error: 'Failed to archive conversation' });
    }
  }
);

// ── Delete a conversation (and its messages) ────────────────────────────────────
router.delete(
  '/conversations/:conversationId',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const convId = parseInt(req.params.conversationId, 10);
      await ChatMessage.deleteMany({ conversationId: convId });
      await ChatConversation.deleteOne({ id: convId });
      res.json({ success: true, conversationId: convId });
    } catch (error: any) {
      console.error('[VEEGPT] Delete conversation error:', error?.message);
      res.status(500).json({ error: 'Failed to delete conversation' });
    }
  }
);

// ── Create a new conversation (first message) — STREAMS the reply ───────────────
// VeeGPT tier gating: same rationale as /conversations/:conversationId/messages
// above — this creates a new conversation with the first message and streams
// the AI reply, so it needs the same base subscription guard.
router.post(
  '/conversations',
  requireAuth,
  meterAI({
    feature: 'veegpt.chat',
    model: requestSelectedModel,
    modelChosenBy: 'user',
    attachments: req => parseAttachments(req.body?.attachments).attachments.length,
    promptChars: req => (typeof req.body?.content === 'string' ? req.body.content.length : undefined),
    promptText: req => (typeof req.body?.content === 'string' ? req.body.content : undefined),
  }),
  ...veeGPTBasicGuards,
  async (req: any, res: Response) => {
    try {
      const { content } = req.body;
      const userId = req.user.id;
      const { attachments, error: attachErr } = parseAttachments(
        req.body?.attachments
      );
      if (attachErr) return res.status(400).json({ error: attachErr });
      // Files uploaded to storage first and sent as opaque KEYS (see handler above).
      const attachmentKeys: string[] = Array.isArray(req.body?.attachmentIds)
        ? req.body.attachmentIds.filter((k: any) => typeof k === 'string' && k)
        : [];
      const geminiApiKey = resolveGeminiApiKey(await requestAIPreferences(req));
      const { attachments: keyAttachments, extraRecords: keyRecords } =
        await resolveStorageKeyAttachments(attachmentKeys, geminiApiKey);
      attachments.push(...keyAttachments);
      const hasMediaUrls =
        Array.isArray(req.body?.mediaUrls) &&
        req.body.mediaUrls.some((u: any) => typeof u === 'string' && u);
      if (!content?.trim() && attachments.length === 0 && !hasMediaUrls && keyRecords.length === 0)
        return res.status(400).json({ error: 'Message content is required' });

      const safeContent = (content || '').trim();
      const displayContent = safeContent || ' ';

      // Prefer the workspace the user is actively viewing (sent by the client),
      // then the user's stored workspace, then their default.
      const defaultWorkspace = await storage.getDefaultWorkspace(userId);
      const workspaceId =
        req.body?.workspaceId || req.user.workspaceId || defaultWorkspace?.id;
      if (!workspaceId)
        return res.status(400).json({ error: 'No workspace found' });

      const preferences = await requestAIPreferences(req);

      // Use a quick placeholder title from the first message so we can start
      // streaming the reply IMMEDIATELY (no blocking title-generation LLM call on
      // the critical path — that was adding seconds of latency before the first
      // token, even for short messages). A proper AI title is generated in the
      // background after the reply finishes and pushed via a `conversationTitle` event.
      const placeholderTitle = displayContent.slice(0, 50) || 'New chat';

      const convId =
        (Date.now() % 1000000000) + Math.floor(Math.random() * 1000);
      const conversation = await ChatConversation.create({
        id: convId,
        userId,
        workspaceId,
        title: placeholderTitle,
        messageCount: 1,
        lastMessageAt: new Date(),
      });
      // Already-uploaded hosted media URLs (unified posting path) persisted on the
      // user message so its thumbnail renders from cache and survives refresh.
      const createMediaUrls: string[] = Array.isArray(req.body?.mediaUrls)
        ? req.body.mediaUrls.filter((u: any) => typeof u === 'string' && u)
        : [];
      const userMessage = await ChatMessage.create({
        id: await resolveClientMessageId(req.body?.userMessageId),
        conversationId: convId,
        role: 'user',
        content: displayContent,
        attachments: buildUserMessageAttachments(attachments, createMediaUrls, keyRecords),
        tokensUsed: 0,
      });

      activeGenerations.set(convId, true);
      vlog('create-conversation:done', {
        convId,
        workspaceId,
        attachments: attachments.length,
      });

      // Stream: first send the conversation + user message, then the AI reply.
      initStreamResponse(res);
      writeEvent(res, { type: 'conversation', conversation });
      writeEvent(res, {
        type: 'userMessage',
        message: userMessage,
        conversationId: convId,
      });

      // Client disconnect (navigated away / closed the app) must NOT stop the
      // first reply — it keeps generating and persists so it's there on return,
      // like ChatGPT/Claude. Only /stop halts generation. `writeEvent` no-ops
      // once the socket is gone, so continuing is safe.

      const createMediaForHistory: string[] = Array.isArray(req.body?.mediaUrls)
        ? req.body.mediaUrls.filter((u: any) => typeof u === 'string' && u)
        : [];
      const firstMsgContent =
        createMediaForHistory.length && !safeContent
          ? 'The user attached the media for a post they want to publish. Use it to fulfill their posting request (call schedule_post when ready, or ask for the still-missing detail).'
          : safeContent + attachmentsPromptNote(attachments);
      const history = [{ role: 'user', content: firstMsgContent }];
      // Cross-chat memory: a returning user should be recognized even in a brand
      // new chat (when AI Memory = long-term). The per-conversation summary is
      // empty here since this is the first message.
      const memWorkspaceId = await resolveMemoryWorkspaceId(
        workspaceId,
        userId
      );

      // Read EXISTING memory before any explicit save (so a freshly saved fact
      // isn't shown as pre-existing).
      const userMemoryProfile = await getUserMemoryProfile(
        userId,
        memWorkspaceId
      );

      // Explicit "remember X" on the FIRST message of a new chat → save it
      // deterministically now (no LLM, can't fail on quota). Durable-fact
      // detection otherwise folds into the main chat call via the remember_fact
      // tool (no separate extraction call).
      let memoryNote = '';
      const explicitIntent =
        !DISABLE_REGEX_FOR_TESTING &&
        preferences.aiMemory === 'long-term' &&
        hasSaveIntent(safeContent);
      vlog('user-memory:intent-check', {
        convId,
        where: 'create-conversation',
        aiMemory: preferences.aiMemory,
        hasSaveIntent: hasSaveIntent(safeContent),
        disabledForTesting: DISABLE_REGEX_FOR_TESTING,
        content: safeContent.slice(0, 80),
      });
      if (explicitIntent) {
        const r = await saveMemoryFact(
          userId,
          memWorkspaceId,
          extractSaveIntentFact(safeContent) || '',
          preferences
        );
        if (r.status === 'saved')
          memoryNote = `IMPORTANT: You have JUST saved this NEW fact to long-term memory: "${r.fact}". It was NOT remembered before. Confirm you'll remember it now — do NOT say it was already saved.`;
        else if (r.status === 'updated')
          memoryNote = `You have JUST UPDATED an existing fact on this topic to: "${r.fact}" (it replaced the old value, no duplicate was created). Confirm you've updated it.`;
        else if (r.status === 'duplicate')
          memoryNote = `This was ALREADY in long-term memory before now: "${r.fact}". Tell the user it's already saved.`;
        else if (r.status === 'full')
          memoryNote = `You could NOT save "${r.fact}" because the user's long-term memory is FULL. Tell them their VeeGPT memory storage is full and they need to remove a few facts in Settings → AI Configuration before you can remember new things.`;
        vlog('user-memory:explicit', {
          convId,
          where: 'create-conversation',
          status: r.status,
          fact: r.fact,
          memWorkspaceId,
        });
      }

      // Advanced VeeGPT selectors (composer dropdowns).
      const selectedAccountId =
        typeof req.body?.selectedAccountId === 'string' &&
        req.body.selectedAccountId.trim()
          ? req.body.selectedAccountId.trim()
          : '';
      // Resolve the VeeGPT tier once and gate the persona by it (a plan that
      // doesn't include the persona falls back to the default, no directives).
      const veeGPTTier: VeeGPTTier = await resolveVeeGPTTier(userId);
      const agentDirectives = getAgentDirectivesForTier(
        req.body?.selectedAgentId,
        veeGPTTier
      );
      const forcedTool =
        typeof req.body?.forcedTool === 'string'
          ? req.body.forcedTool.trim()
          : '';
      // Skip the HEAVY account analytics snapshot when a specific account is
      // selected (VeeGPT fetches it on demand via get_account_details), but keep
      // the lightweight identity block so it still knows the user's name/plan/niche.
      const workspaceContext = selectedAccountId
        ? await getIdentityContextForPrompt(memWorkspaceId, userId)
        : await getWorkspaceContextForPrompt(memWorkspaceId, userId);
      // Generate a proper AI title CONCURRENTLY with the reply (not after it) and
      // push it as soon as it's ready — so the sidebar shows the real title within
      // a second or two instead of only when a (possibly long) reply finishes.
      const titlePromise = (async () => {
        try {
          const generated = await withAIFeature(
            'veegpt.title',
            { userId, workspaceId: memWorkspaceId },
            () =>
              aiServiceManager.generateText(
                `Generate a short, 3-6 word title (no quotes, no trailing punctuation) for a chat that starts with this message:\n\n"${displayContent}"`,
                { ...preferences, responseLength: 'short' }
              )
          );
          const title = generated
            ?.trim()
            .replace(/^["']|["']$/g, '')
            .slice(0, 60);
          if (title) {
            await ChatConversation.updateOne({ id: convId }, { title });
            if (!res.writableEnded)
              writeEvent(res, {
                type: 'conversationTitle',
                conversationId: convId,
                title,
              });
          }
        } catch (err: any) {
          console.warn(
            '[VEEGPT] Background title generation failed:',
            err?.message
          );
        }
      })();

      // Tool-calling on the first message of a new chat (same gating as /messages):
      // memory tool always (long-term), posting tool only with connected accounts.
      let chatTools: ChatTool[] | undefined;
      let toolContext: string | undefined;
      let toolAccountUsernames: string[] = [];
      const toolMediaUrls: string[] = Array.isArray(req.body?.mediaUrls)
        ? req.body.mediaUrls.filter((u: any) => typeof u === 'string' && u)
        : [];
      const memoryToolEnabled =
        preferences.aiMemory === 'long-term' && !!memWorkspaceId;
      // Seed the plan-capability context always (incl. the media/attachment path).
      // veeGPTTier was resolved above and also filters every tool array below.
      {
        const tierContext = buildTierCapabilityContext(veeGPTTier);
        if (tierContext) toolContext = tierContext;
      }
      if (req.body?.enableTools === true && attachments.length === 0) {
        const tools: ChatTool[] = [];
        if (memoryToolEnabled)
          tools.push(...filterToolsByTier(VEEGPT_MEMORY_TOOLS_ALL, veeGPTTier));
        if (memWorkspaceId) {
          tools.push(
            ...filterToolsByTier(VEEGPT_DATA_TOOLS, veeGPTTier),
            ...filterToolsByTier(VEEGPT_EDIT_TOOLS, veeGPTTier),
            ...filterToolsByTier(VEEGPT_INSIGHT_TOOLS, veeGPTTier)
          );
          const contentCtx = await buildContentContext(memWorkspaceId);
          if (contentCtx)
            toolContext =
              (toolContext ? toolContext + '\n\n' : '') + contentCtx;
          try {
            const accts =
              (await storage
                .getSocialAccountsByWorkspace(memWorkspaceId)
                .catch(() => [])) || [];
            if (accts.length > 0) {
              const chatToolsForTier = filterToolsByTier(
                VEEGPT_CHAT_TOOLS,
                veeGPTTier
              );
              if (chatToolsForTier.length) {
                tools.push(...chatToolsForTier);
                toolContext =
                  buildToolContext(
                    accts,
                    req.body?.localNow,
                    req.body?.timezone,
                    toolMediaUrls.length > 0
                  ) + (toolContext ? `\n\n${toolContext}` : '');
                toolAccountUsernames = accts
                  .map((a: any) => a.username)
                  .filter(Boolean);
              }
              const accountToolsForTier = filterToolsByTier(
                VEEGPT_ACCOUNT_TOOLS,
                veeGPTTier
              );
              if (accountToolsForTier.length) {
                const scopeHint = buildAccountScopeHint(
                  accts,
                  selectedAccountId
                );
                if (scopeHint) {
                  tools.push(...accountToolsForTier);
                  toolContext = `${scopeHint}\n\n${toolContext}`;
                }
              }
            }
          } catch {
            /* no accounts → no posting tool */
          }
        }
        const profileHint = await getFreshProfileHint(userId);
        if (profileHint)
          toolContext = profileHint + (toolContext ? `\n\n${toolContext}` : '');
        const forcedDirective = buildForcedToolDirective(
          forcedTool,
          veeGPTTier
        );
        if (forcedDirective)
          toolContext =
            forcedDirective + (toolContext ? `\n\n${toolContext}` : '');
        if (tools.length) chatTools = tools;
      }
      await streamGeneration(
        res,
        convId,
        history,
        preferences,
        '',
        userMemoryProfile,
        workspaceContext,
        memoryNote,
        attachments,
        chatTools,
        toolContext,
        toolMediaUrls,
        req.body?.localNow,
        toolAccountUsernames,
        memoryToolEnabled ? { userId, workspaceId: memWorkspaceId } : undefined,
        { userId, workspaceId: memWorkspaceId },
        undefined,
        {
          agentDirectives,
          accountScope: {
            userId,
            workspaceId: memWorkspaceId,
            accountId: selectedAccountId || undefined,
          },
          veeGPTTier,
          selectedAgentId:
            typeof req.body?.selectedAgentId === 'string'
              ? req.body.selectedAgentId
              : undefined,
          forcedTool,
        }
      );

      // Make sure the concurrent title event is flushed before we end the stream.
      await titlePromise;

      // Memory is handled TOOL-ONLY (the focused memory pass in streamGeneration
      // reliably captures durable facts from the first message too) — no separate
      // heuristic text-extraction here.
      res.end();
    } catch (error: any) {
      console.error('[VEEGPT] Create conversation error:', error?.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create conversation' });
      } else {
        writeEvent(res, {
          type: 'error',
          error: 'Failed to create conversation',
        });
        res.end();
      }
    }
  }
);

// ── Persist a non-streamed exchange (e.g. the post-composer flow) ───────────────
// The VeeGPT post/schedule flow doesn't go through the streaming generator (the
// "reply" is the composer UI + a canned confirmation), so it was never saved and
// vanished on refresh. This endpoint persists such an exchange as a real
// conversation so it shows in the sidebar history.
router.post(
  '/conversations/log',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const { messages, title } = req.body || {};
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages[] is required' });
      }

      const defaultWorkspace = await storage.getDefaultWorkspace(userId);
      const workspaceId =
        req.body?.workspaceId || req.user.workspaceId || defaultWorkspace?.id;
      if (!workspaceId)
        return res.status(400).json({ error: 'No workspace found' });

      let convId = Number(req.body?.conversationId);
      let conversation: any;
      let createdNew = false;
      if (convId && !Number.isNaN(convId)) {
        conversation = await ChatConversation.findOne({ id: convId, userId });
      }
      if (!conversation) {
        convId = (Date.now() % 1000000000) + Math.floor(Math.random() * 1000);
        const firstUser = messages.find((m: any) => m.role === 'user');
        const placeholderTitle = (title || firstUser?.content || 'New chat')
          .toString()
          .slice(0, 60);
        conversation = await ChatConversation.create({
          id: convId,
          userId,
          workspaceId,
          title: placeholderTitle,
          messageCount: 0,
          lastMessageAt: new Date(),
        });
        createdNew = true;
      }

      const created: any[] = [];
      for (const m of messages) {
        const role = m?.role === 'assistant' ? 'assistant' : 'user';
        const content = (m?.content ?? '').toString();
        if (
          !content.trim() &&
          !(Array.isArray(m?.attachments) && m.attachments.length)
        )
          continue;
        // Honor a client-supplied message id when present and valid. This is the
        // KEY to single-identity rendering: the client renders an optimistic
        // bubble with this exact id, so when the persisted record (same id) lands
        // in the messages cache, the UI's id-based dedup collapses them into ONE
        // bubble — no duplicate, no content-matching heuristics. We guard against
        // collisions (a different message already using that id) by falling back
        // to a generated id.
        let msgId = Number(m?.id);
        if (
          !msgId ||
          Number.isNaN(msgId) ||
          (await ChatMessage.exists({ id: msgId }))
        ) {
          msgId = (Date.now() % 1000000000) + Math.floor(Math.random() * 1000);
        }
        const msg = await ChatMessage.create({
          id: msgId,
          conversationId: convId,
          role,
          content: content || ' ',
          attachments:
            Array.isArray(m?.attachments) && m.attachments.length
              ? m.attachments.map((a: any) => ({
                  name: a?.name,
                  mimeType: a?.mimeType,
                  url: a?.url,
                }))
              : undefined,
          postCard:
            m?.postCard && typeof m.postCard === 'object'
              ? m.postCard
              : undefined,
          tokensUsed: 0,
        });
        created.push(msg);
      }

      await ChatConversation.updateOne(
        { id: convId },
        {
          lastMessageAt: new Date(),
          updatedAt: new Date(),
          $inc: { messageCount: created.length },
        }
      );

      // For a brand-new conversation (e.g. the post/schedule flow, which doesn't
      // go through the streaming generator), generate a proper short AI title so
      // the sidebar shows a clean label instead of the raw message text. Fire and
      // forget — never block the response or fail the log on quota errors.
      if (createdNew) {
        const firstUser = messages.find((m: any) => m.role === 'user');
        const seed = (firstUser?.content || '').toString().trim();
        if (seed) {
          (async () => {
            try {
              const generated = await withAIFeature(
                'veegpt.title',
                { userId, workspaceId },
                () =>
                  aiServiceManager.generateText(
                    `Generate a short, 3-6 word title (no quotes, no trailing punctuation) for a chat that starts with this message:\n\n"${seed}"`,
                    { responseLength: 'short' } as any
                  )
              );
              const aiTitle = generated
                ?.trim()
                .replace(/^["']|["']$/g, '')
                .slice(0, 60);
              if (aiTitle)
                await ChatConversation.updateOne(
                  { id: convId },
                  { title: aiTitle }
                );
            } catch (err: any) {
              vlog('conversation:title-gen-failed', {
                convId,
                error: err?.message,
              });
            }
          })();
        }
      }

      vlog('conversation:logged', { convId, count: created.length });
      res.json({ conversation, messages: created });
    } catch (error: any) {
      console.error('[VEEGPT] Log conversation error:', error?.message);
      res.status(500).json({ error: 'Failed to log conversation' });
    }
  }
);

// Update a persisted user message's attachments (e.g. swap the placeholder for
// hosted media URLs once the upload finishes) so thumbnails survive refresh.
router.post(
  '/messages/:messageId/attachments',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const messageId = Number(req.params.messageId);
      if (Number.isNaN(messageId))
        return res.status(400).json({ error: 'Invalid message id' });
      const { attachments } = req.body || {};
      if (!Array.isArray(attachments))
        return res.status(400).json({ error: 'attachments[] required' });
      const clean = attachments.map((a: any) => ({
        name: a?.name,
        mimeType: a?.mimeType,
        url: a?.url,
      }));
      await ChatMessage.updateOne(
        { id: messageId },
        { attachments: clean.length ? clean : undefined }
      );
      res.json({ ok: true });
    } catch (error: any) {
      console.error(
        '[VEEGPT] Update message attachments error:',
        error?.message
      );
      res.status(500).json({ error: 'Failed to update attachments' });
    }
  }
);

// Switch which regenerated variant of an assistant message is active (ChatGPT
// 1/2, 2/2 navigation). Mirrors the chosen variant's content/cards to the
// top-level fields so reads AND conversation history use the selected variant.
router.post(
  '/messages/:messageId/active-variant',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const messageId = Number(req.params.messageId);
      const index = Number(req.body?.index);
      if (Number.isNaN(messageId) || Number.isNaN(index))
        return res.status(400).json({ error: 'messageId and index required' });
      const msg = await ChatMessage.findOne({ id: messageId });
      if (!msg) return res.status(404).json({ error: 'Message not found' });
      const conv = await ChatConversation.findOne({
        id: (msg as any).conversationId,
      }).lean();
      if (!conv || String((conv as any).userId) !== String(req.user.id))
        return res.status(403).json({ error: 'Forbidden' });
      const variants = Array.isArray((msg as any).variants)
        ? (msg as any).variants
        : [];
      if (index < 0 || index >= variants.length)
        return res.status(400).json({ error: 'Index out of range' });
      const v = variants[index];
      await ChatMessage.updateOne(
        { id: messageId },
        {
          activeVariant: index,
          content: v.content,
          postCard: v.postCard || undefined,
          listCard: v.listCard || undefined,
          editCards: v.editCards || undefined,
          infoCards: v.infoCards || undefined,
        }
      );
      res.json({ ok: true, activeVariant: index });
    } catch (error: any) {
      console.error('[VEEGPT] Switch variant error:', error?.message);
      res.status(500).json({ error: 'Failed to switch variant' });
    }
  }
);

// Update a persisted inline post-confirm card's status (e.g. after the user
// confirms → 'done', or cancels). Keeps the rehydrated card in sync so it can't
// be confirmed twice after a refresh.
router.post(
  '/messages/:messageId/post-card',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const messageId = Number(req.params.messageId);
      if (Number.isNaN(messageId))
        return res.status(400).json({ error: 'Invalid message id' });
      const { status, resultText, plan } = req.body || {};
      const msg = await ChatMessage.findOne({ id: messageId });
      if (!msg || !(msg as any).postCard)
        return res.status(404).json({ error: 'Card not found' });
      const card = { ...(msg as any).postCard };
      if (status) card.status = status;
      if (typeof resultText === 'string') card.resultText = resultText;
      if (plan && typeof plan === 'object') card.plan = plan;
      await ChatMessage.updateOne({ id: messageId }, { postCard: card });
      res.json({ ok: true });
    } catch (error: any) {
      console.error('[VEEGPT] Update post-card error:', error?.message);
      res.status(500).json({ error: 'Failed to update card' });
    }
  }
);

// Apply (or cancel) a confirmed EDIT card. On confirm we run the verified,
// workspace-scoped mutation; on cancel we just mark it dismissed. Supports BOTH
// the legacy single `editCard` and the multi-card `editCards` array (a cardId
// selects which one). The status is persisted so it can't be applied twice.
router.post(
  '/messages/:messageId/apply-edit',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const messageId = Number(req.params.messageId);
      if (Number.isNaN(messageId))
        return res.status(400).json({ error: 'Invalid message id' });
      const action = String(req.body?.action || 'confirm'); // 'confirm' | 'cancel'
      const cardId = req.body?.cardId ? String(req.body.cardId) : undefined;
      const localNow = req.body?.localNow as string | undefined;

      const msg = await ChatMessage.findOne({ id: messageId });
      if (!msg) return res.status(404).json({ error: 'Message not found' });
      const editCards: any[] = Array.isArray((msg as any).editCards)
        ? (msg as any).editCards
        : [];
      const legacy = (msg as any).editCard;

      // Locate the target card (multi-card by id, else the single legacy card).
      let target: any = null;
      if (editCards.length) {
        target = cardId ? editCards.find(c => c.id === cardId) : editCards[0];
      } else if (legacy) {
        target = legacy;
      }
      if (!target)
        return res.status(404).json({ error: 'Edit card not found' });
      if (target.status === 'done')
        return res.json({
          ok: true,
          status: 'done',
          resultText: target.resultText,
        });

      const conv = await ChatConversation.findOne({
        id: (msg as any).conversationId,
      }).lean();
      const workspaceId = await resolveMemoryWorkspaceId(
        req.body?.workspaceId || (conv as any)?.workspaceId,
        req.user?.id
      );

      if (action === 'cancel') {
        target.status = 'done';
        target.resultText = 'Cancelled — no changes made.';
      } else {
        const editArgs: Record<string, unknown> = {
          contentId: target.contentId,
          ...(target.proposed || {}),
        };
        const r = await executeEditTool(
          workspaceId,
          target.action,
          editArgs,
          localNow
        );
        target.status = r.ok ? 'done' : 'error';
        target.resultText = r.message;
        vlog('apply-edit', {
          messageId,
          cardId,
          action: target.action,
          ok: r.ok,
        });
      }

      // Persist back into the correct shape.
      if (editCards.length) {
        await ChatMessage.updateOne({ id: messageId }, { editCards });
      } else {
        await ChatMessage.updateOne({ id: messageId }, { editCard: target });
      }
      res.json({
        ok: target.status !== 'error',
        status: target.status,
        resultText: target.resultText,
      });
    } catch (error: any) {
      console.error('[VEEGPT] Apply edit error:', error?.message);
      res.status(500).json({ error: 'Failed to apply edit' });
    }
  }
);

// ── Cross-chat memory: list / usage / delete (Settings UI) ──────────────────────

/** GET the full VeeGPT memory for the workspace: durable facts + the live
 * workspace/account context (both stored in the same document) + usage. */
router.get('/memory', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const wsParam = (req.query.workspaceId as string) || req.user.workspaceId;
    const workspaceId = await resolveMemoryWorkspaceId(wsParam, userId);
    if (!workspaceId)
      return res.status(400).json({ error: 'No workspace found' });

    let mem = await UserMemory.findOne({ userId, workspaceId }).lean();

    // If the live context hasn't been stored yet, build + persist it once so the
    // memory is populated on first view (and a background refresh keeps it fresh).
    if (!(mem as any)?.workspaceContext) {
      try {
        const { refreshWorkspaceContext } =
          await import('../services/WorkspaceContextAccessor');
        await refreshWorkspaceContext(workspaceId, userId, 'memory-view');
        mem = await UserMemory.findOne({ userId, workspaceId }).lean();
      } catch {
        /* non-critical */
      }
    }

    const items = (
      ((mem as any)?.items || []) as Array<{
        id: string;
        text: string;
        createdAt: Date;
      }>
    )
      .slice()
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      // Tag each fact with its topic so the UI can group them into categories
      // (single-value topics like brand-color/posting-schedule are detected; the
      // rest fall under "general").
      .map(it => ({ ...it, topic: detectTopic(it.text) || 'general' }));
    const workspaceContext = (mem as any)?.workspaceContext || null;
    // Count the stored context toward usage so the bar reflects everything saved.
    const contextChars = workspaceContext
      ? JSON.stringify(workspaceContext).length
      : 0;
    const usage = computeUsage(
      items.map(it => ({ id: it.id, text: it.text })),
      contextChars
    );
    res.json({
      items,
      workspaceContext,
      workspaceContextUpdatedAt:
        (mem as any)?.workspaceContextUpdatedAt || null,
      usage,
      updatedAt: (mem as any)?.updatedAt || null,
    });
  } catch (error: any) {
    console.error('[VEEGPT] Get memory error:', error?.message);
    res.status(500).json({ error: 'Failed to fetch memory' });
  }
});

/** DELETE a single memory item by id. */
router.delete(
  '/memory/:itemId',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const workspaceId = await resolveMemoryWorkspaceId(
        (req.query.workspaceId as string) || req.user.workspaceId,
        userId
      );
      if (!workspaceId)
        return res.status(400).json({ error: 'No workspace found' });

      await UserMemory.updateOne(
        { userId, workspaceId },
        {
          $pull: { items: { id: req.params.itemId } },
          $set: { updatedAt: new Date() },
        }
      );
      const mem = await UserMemory.findOne({ userId, workspaceId }).lean();
      const items = ((mem as any)?.items || []) as Array<{
        id: string;
        text: string;
        createdAt: Date;
      }>;
      res.json({
        success: true,
        usage: computeUsage(items.map(it => ({ id: it.id, text: it.text }))),
      });
    } catch (error: any) {
      console.error('[VEEGPT] Delete memory item error:', error?.message);
      res.status(500).json({ error: 'Failed to delete memory item' });
    }
  }
);

/** DELETE all memory for the current workspace (clear). */
router.delete('/memory', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const workspaceId = await resolveMemoryWorkspaceId(
      (req.query.workspaceId as string) || req.user.workspaceId,
      userId
    );
    if (!workspaceId)
      return res.status(400).json({ error: 'No workspace found' });

    await UserMemory.updateOne(
      { userId, workspaceId },
      {
        $set: {
          items: [],
          processedConversationIds: [],
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
    res.json({ success: true, usage: computeUsage([]) });
  } catch (error: any) {
    console.error('[VEEGPT] Clear memory error:', error?.message);
    res.status(500).json({ error: 'Failed to clear memory' });
  }
});

// ── AI Token Usage (cost analysis) ──────────────────────────────────────────
// Aggregates EVERY recorded AI call (all features, all providers) so we can
// price the app accurately. Token counts are provider-reported where possible;
// stream calls without provider usage are character-estimated (flagged).

/**
 * USD cost of one recorded AI call.
 *
 * Prices come from the ONE versioned registry
 * (server/config/veegpt-pricing.registry.ts). This route previously carried its
 * own hard-coded table which listed only 7 models — every other model priced as
 * ZERO, silently under-reporting cost on the usage dashboard. The registry covers
 * every model, bills reasoning tokens, and falls back to a conservative price
 * instead of free.
 *
 * `at` selects the pricing version that was in force when the call happened, so
 * historical reports do not change when a provider changes its prices.
 */
function priceFor(
  model: string,
  promptTokens: number,
  completionTokens: number,
  cachedTokens = 0,
  reasoningTokens = 0,
  at?: Date
): number {
  return providerCostUSD(
    model,
    {
      inputTokens: promptTokens,
      outputTokens: completionTokens,
      cachedTokens,
      reasoningTokens,
    },
    at ?? new Date()
  ).usd;
}

/** GET token usage summary grouped by feature (and overall totals). */
router.get('/usage', requireAuth, async (req: any, res: Response) => {
  try {
    const { AIUsageEvent } = await import('../services/aiUsageTracker');
    const userId = req.user.id;
    const scope = (req.query.scope as string) || 'me'; // 'me' | 'all'
    const sinceParam = req.query.since as string | undefined;
    const match: any = {};
    if (scope === 'me') match.userId = userId;
    if (sinceParam) {
      const since = new Date(sinceParam);
      if (!isNaN(since.getTime())) match.createdAt = { $gte: since };
    }

    const events = await AIUsageEvent.find(match).lean();

    type Agg = {
      feature: string;
      calls: number;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      cachedTokens: number;
      estimatedCalls: number;
      cost: number;
      byModel: Record<string, any>;
    };
    const byFeature: Record<string, Agg> = {};
    const totals = {
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      cachedTokens: 0,
      estimatedCalls: 0,
      cost: 0,
    };

    for (const e of events as any[]) {
      const f = e.feature || 'other';
      if (!byFeature[f])
        byFeature[f] = {
          feature: f,
          calls: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cachedTokens: 0,
          estimatedCalls: 0,
          cost: 0,
          byModel: {},
        };
      const a = byFeature[f];
      const cached = e.cachedTokens || 0;
      const cost = priceFor(
        e.model,
        e.promptTokens || 0,
        e.completionTokens || 0,
        cached
      );
      a.calls += 1;
      a.promptTokens += e.promptTokens || 0;
      a.completionTokens += e.completionTokens || 0;
      a.totalTokens += e.totalTokens || 0;
      a.cachedTokens += cached;
      a.cost += cost;
      if (e.estimated) a.estimatedCalls += 1;
      const mk = `${e.provider}:${e.model}`;
      if (!a.byModel[mk])
        a.byModel[mk] = {
          provider: e.provider,
          model: e.model,
          calls: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cachedTokens: 0,
          cost: 0,
        };
      const m = a.byModel[mk];
      m.calls += 1;
      m.promptTokens += e.promptTokens || 0;
      m.completionTokens += e.completionTokens || 0;
      m.totalTokens += e.totalTokens || 0;
      m.cachedTokens += cached;
      m.cost += cost;
      totals.calls += 1;
      totals.promptTokens += e.promptTokens || 0;
      totals.completionTokens += e.completionTokens || 0;
      totals.totalTokens += e.totalTokens || 0;
      totals.cachedTokens += cached;
      totals.cost += cost;
      if (e.estimated) totals.estimatedCalls += 1;
    }

    const features = Object.values(byFeature)
      .map(a => ({ ...a, byModel: Object.values(a.byModel) }))
      .sort((x, y) => y.totalTokens - x.totalTokens);

    // Augment with Social Listening batch stats and analysis cache stats
    let batchStats: any = null;
    let cacheStats: any = null;
    try {
      const { ListeningBatchJobModel } =
        await import('../models/SocialListening/ListeningBatchJob');
      const batchMatch: any = scope === 'me' ? {} : {}; // batch jobs are workspace-level, not user-level
      const [pendingCount, completedCount, failedCount] = await Promise.all([
        ListeningBatchJobModel.countDocuments({ status: 'pending' }),
        ListeningBatchJobModel.countDocuments({ status: 'completed' }),
        ListeningBatchJobModel.countDocuments({
          status: { $in: ['failed', 'superseded'] },
        }),
      ]);
      const recentCompleted = await ListeningBatchJobModel.find({
        status: 'completed',
      })
        .sort({ completedAt: -1 })
        .limit(5)
        .select('workspaceId niche submittedAt completedAt analysisInputs')
        .lean();
      batchStats = {
        pending: pendingCount,
        completed: completedCount,
        failed: failedCount,
        recentCompleted: recentCompleted.map((j: any) => ({
          niche: j.niche,
          postsAnalyzed: j.analysisInputs?.length || 0,
          submittedAt: j.submittedAt,
          completedAt: j.completedAt,
          turnaroundMinutes:
            j.completedAt && j.submittedAt
              ? Math.round(
                  (new Date(j.completedAt).getTime() -
                    new Date(j.submittedAt).getTime()) /
                    60000
                )
              : null,
        })),
      };
    } catch {
      /* non-fatal */
    }

    try {
      const { ListeningAnalysisCacheModel } =
        await import('../models/SocialListening/ListeningAnalysisCache');
      const [totalCached, recentHits] = await Promise.all([
        ListeningAnalysisCacheModel.countDocuments({}),
        ListeningAnalysisCacheModel.aggregate([
          {
            $group: {
              _id: null,
              totalHits: { $sum: '$hits' },
              avgHits: { $avg: '$hits' },
            },
          },
        ]),
      ]);
      cacheStats = {
        cachedAnalyses: totalCached,
        totalCacheHits: recentHits[0]?.totalHits || 0,
        avgHitsPerEntry: recentHits[0]
          ? Math.round((recentHits[0].avgHits || 0) * 10) / 10
          : 0,
        // Estimated tokens saved: each cache hit avoids ~500 tokens of analysis
        estimatedTokensSaved: (recentHits[0]?.totalHits || 0) * 500,
      };
    } catch {
      /* non-fatal */
    }

    res.json({
      scope,
      totals,
      features,
      eventCount: events.length,
      batchStats,
      cacheStats,
    });
  } catch (error: any) {
    console.error('[VEEGPT] Usage summary error:', error?.message);
    res.status(500).json({ error: 'Failed to compute usage' });
  }
});

/** GET the most recent individual AI call events (for a live feed/debug). */
router.get('/usage/recent', requireAuth, async (req: any, res: Response) => {
  try {
    const { AIUsageEvent } = await import('../services/aiUsageTracker');
    const userId = req.user.id;
    const scope = (req.query.scope as string) || 'me';
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const match: any = {};
    if (scope === 'me') match.userId = userId;
    const events = await AIUsageEvent.find(match)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({
      events: (events as any[]).map(e => ({
        feature: e.feature,
        provider: e.provider,
        model: e.model,
        promptTokens: e.promptTokens,
        completionTokens: e.completionTokens,
        totalTokens: e.totalTokens,
        cachedTokens: e.cachedTokens || 0,
        estimated: e.estimated,
        callType: e.callType,
        createdAt: e.createdAt,
        cost: priceFor(
          e.model,
          e.promptTokens || 0,
          e.completionTokens || 0,
          e.cachedTokens || 0
        ),
      })),
    });
  } catch (error: any) {
    console.error('[VEEGPT] Usage recent error:', error?.message);
    res.status(500).json({ error: 'Failed to fetch recent usage' });
  }
});

/** POST reset AI usage counters to zero. Deletes recorded usage events for the
 *  caller (scope=me, default) or ALL users (scope=all). This is a hard reset so
 *  cost tracking can start fresh. */
router.post('/usage/reset', requireAuth, async (req: any, res: Response) => {
  try {
    const { AIUsageEvent } = await import('../services/aiUsageTracker');
    const userId = req.user.id;
    const scope = (req.body?.scope as string) || 'me'; // 'me' | 'all'
    const match: any = {};
    if (scope === 'me') match.userId = userId;
    const result = await AIUsageEvent.deleteMany(match);
    vlog('usage:reset', {
      scope,
      deleted: result?.deletedCount ?? 0,
      by: userId,
    });
    res.json({ success: true, scope, deleted: result?.deletedCount ?? 0 });
  } catch (error: any) {
    console.error('[VEEGPT] Usage reset error:', error?.message);
    res.status(500).json({ error: 'Failed to reset usage' });
  }
});

// ── Workspace context (what VeeGPT knows): view + manual refresh ────────────────

/** GET the cached workspace-context snapshot (the data VeeGPT sees). */
router.get('/context', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const workspaceId = await resolveMemoryWorkspaceId(
      (req.query.workspaceId as string) || req.user.workspaceId,
      userId
    );
    if (!workspaceId)
      return res.status(400).json({ error: 'No workspace found' });

    const { getStoredWorkspaceContext } =
      await import('../services/WorkspaceContextAccessor');
    let snapshot = await getStoredWorkspaceContext(userId, workspaceId);
    if (!snapshot) {
      // Nothing stored yet — build once and persist into the memory doc so the
      // UI isn't empty on first view.
      const { buildWorkspaceContext } =
        await import('../services/WorkspaceContextService');
      const { refreshWorkspaceContext } =
        await import('../services/WorkspaceContextAccessor');
      snapshot = await buildWorkspaceContext(workspaceId, userId);
      void refreshWorkspaceContext(workspaceId, userId, 'first-view');
    }
    res.json(snapshot);
  } catch (error: any) {
    console.error('[VEEGPT] Get context error:', error?.message);
    res.status(500).json({ error: 'Failed to fetch workspace context' });
  }
});

/** POST to force a refresh of the workspace-context snapshot. */
router.post(
  '/context/refresh',
  requireAuth,
  meterAI({ feature: 'other' }),
  async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const workspaceId = await resolveMemoryWorkspaceId(
        (req.body?.workspaceId as string) || req.user.workspaceId,
        userId
      );
      if (!workspaceId)
        return res.status(400).json({ error: 'No workspace found' });

      const { refreshWorkspaceContext } =
        await import('../services/WorkspaceContextAccessor');
      await refreshWorkspaceContext(workspaceId, userId, 'manual');
      res.json({ success: true });
    } catch (error: any) {
      console.error('[VEEGPT] Refresh context error:', error?.message);
      res.status(500).json({ error: 'Failed to refresh workspace context' });
    }
  }
);

// ── Post Agent: resolve AI fields (caption/hashtags) before the client posts ────
// The actual create+schedule/publish is done by the client via the proven
// /api/content endpoints (same path the manual composer used). This endpoint
// only does the AI work (generate caption/hashtags, analyze media) and returns
// the finalized plan, so we keep one reliable posting path.
router.post(
  '/post-agent/execute',
  requireAuth,
  meterAI({ feature: 'veegpt.post_agent' }),
  async (req: any, res: Response) => {
    try {
      const { plan, mediaUrls } = req.body || {};
      const userId = req.user.id;
      const workspaceId =
        (req.body?.workspaceId as string) || req.user.workspaceId;
      if (!plan) return res.status(400).json({ error: 'plan is required' });

      const prefs = await getWorkspaceAIPreferences(workspaceId, userId);

      let caption = (plan.caption || '').toString();
      let hashtags: string[] = Array.isArray(plan.hashtags)
        ? plan.hashtags
        : [];

      if (
        (plan.generateCaption || plan.generateHashtags) &&
        Array.isArray(mediaUrls) &&
        mediaUrls.length
      ) {
        try {
          const isVideo = plan.type === 'reel';
          let mediaAnalysis: string | undefined;
          try {
            const desc = await withAIFeature(
              'veegpt.media_analysis',
              { userId, workspaceId },
              () =>
                aiServiceManager.analyzeMedia(
                  mediaUrls[0],
                  isVideo ? 'video' : 'image',
                  prefs
                )
            );
            if (desc) mediaAnalysis = `Visual analysis: ${desc}`;
          } catch {}
          const variations = await withAIFeature(
            'veegpt.post_caption',
            { userId, workspaceId },
            () =>
              aiServiceManager.generateInstagramCaptions({
                userId,
                workspaceId: workspaceId || userId,
                topic: caption || 'Social media post',
                mediaAnalysis,
                postType:
                  plan.type === 'story' || plan.type === 'reel'
                    ? plan.type
                    : 'post',
                platform: 'Instagram',
                preferences: prefs,
                singleVariation: true,
              })
          );
          const best = variations?.[0];
          if (best?.caption && plan.generateCaption) caption = best.caption;
          // The caption generator embeds hashtags at the END of the caption text
          // (there's no separate hashtags array). Extract them so the card can
          // show a dedicated hashtag list. Prefer an explicit array if present.
          if (plan.generateHashtags) {
            const bestHashtags = (best as any)?.hashtags;
            if (Array.isArray(bestHashtags) && bestHashtags.length) {
              hashtags = bestHashtags.map((h: string) =>
                String(h).replace(/^#+/, '')
              );
            } else {
              const source: string = best?.caption || caption || '';
              const found = (source.match(/#[\p{L}\p{N}_]+/gu) || []).map(
                (h: string) => h.replace(/^#+/, '')
              );
              if (found.length) hashtags = Array.from(new Set(found));
            }
          }
        } catch (e: any) {
          vlog('post-agent:caption-error', { error: e?.message });
        }
      }

      // Dedicated hashtag generation: the caption generator doesn't reliably emit
      // hashtags, so when they were requested but we still have none, make ONE
      // small, focused call to produce them from the caption/topic.
      if (plan.generateHashtags && !hashtags.length) {
        try {
          const seed = (caption || plan.caption || 'social media post').slice(
            0,
            400
          );
          const htPrompt =
            'Generate 8 to 12 relevant, high-quality Instagram hashtags for the post below. ' +
            'Mix popular and niche tags for discoverability. ' +
            'Return ONLY a JSON array of strings WITHOUT the # symbol, e.g. ["travel","sunset"].\n\n' +
            `Post: "${seed}"`;
          const htResult = await withAIFeature(
            'veegpt.post_hashtags',
            { userId, workspaceId },
            () =>
              aiServiceManager.generateJSON(htPrompt, {
                ...prefs,
                responseLength: 'short',
                creativityLevel: 0.4,
              })
          );
          const arr = Array.isArray(htResult)
            ? htResult
            : Array.isArray(htResult?.hashtags)
              ? htResult.hashtags
              : [];
          const cleaned = arr
            .map((h: any) => String(h).replace(/^#+/, '').trim())
            .filter(Boolean);
          if (cleaned.length) hashtags = Array.from(new Set(cleaned));
        } catch (e: any) {
          vlog('post-agent:hashtag-fallback-error', { error: e?.message });
        }
      }

      // If we have hashtags as a separate list, strip the trailing hashtag block
      // from the caption text so the card doesn't show them twice (caption + chips).
      if (hashtags.length && caption) {
        caption = caption.replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, '').trim();
      }

      vlog('post-agent:resolved', {
        hasCaption: !!caption,
        hashtags: hashtags.length,
      });
      res.json({ caption, hashtags });
    } catch (error: any) {
      console.error('[VEEGPT] post-agent execute error:', error?.message);
      res
        .status(500)
        .json({ error: error?.message || 'Failed to resolve post' });
    }
  }
);

// ── Research history + background trend refresh ─────────────────────────────

/** GET recent research reports for the workspace (durable history). */
router.get(
  '/research/history',
  requireAuth,
  async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const workspaceId = await resolveMemoryWorkspaceId(
        (req.query.workspaceId as string) || req.user.workspaceId,
        userId
      );
      if (!workspaceId)
        return res.status(400).json({ error: 'No workspace found' });
      const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 50));
      const { ResearchReport } =
        await import('../models/Research/ResearchModels');
      const reports = await ResearchReport.find({ workspaceId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      res.json({ success: true, reports });
    } catch (error: any) {
      console.error('[VEEGPT] research history error:', error?.message);
      res.status(500).json({ error: 'Failed to fetch research history' });
    }
  }
);

/** GET the latest stored trend snapshot for a niche (workspace-scoped). */
router.get('/research/trends', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const workspaceId = await resolveMemoryWorkspaceId(
      (req.query.workspaceId as string) || req.user.workspaceId,
      userId
    );
    if (!workspaceId)
      return res.status(400).json({ error: 'No workspace found' });
    const { TrendTopic } = await import('../models/Research/ResearchModels');
    const niche = (req.query.niche as string)?.toLowerCase().trim();
    const docs = niche
      ? await TrendTopic.find({ workspaceId, niche }).lean()
      : await TrendTopic.find({ workspaceId })
          .sort({ updatedAt: -1 })
          .limit(10)
          .lean();
    res.json({ success: true, trends: docs });
  } catch (error: any) {
    console.error('[VEEGPT] research trends error:', error?.message);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

/** POST trigger a background refresh of trends for a niche/query. */
router.post(
  '/research/refresh',
  requireAuth,
  meterAI({ feature: 'trend.intelligence' }),
  async (req: any, res: Response) => {
    try {
      const userId = req.user.id;
      const workspaceId = await resolveMemoryWorkspaceId(
        req.body?.workspaceId || req.user.workspaceId,
        userId
      );
      if (!workspaceId)
        return res.status(400).json({ error: 'No workspace found' });

      const query = String(req.body?.query || '').trim();
      if (!query) return res.status(400).json({ error: 'query is required' });
      const kind = ['trends', 'competitors', 'niche-insights'].includes(
        req.body?.kind
      )
        ? req.body.kind
        : 'trends';

      const { isResearchQueueAvailable, ResearchQueueManager } =
        await import('../queues/researchQueue');
      if (isResearchQueueAvailable()) {
        const enqueued = await ResearchQueueManager.enqueue({
          kind,
          workspaceId,
          userId,
          query,
        });
        return res.json({
          success: true,
          status: enqueued ? 'queued' : 'unavailable',
        });
      }
      // No queue → run inline (best-effort, fire-and-forget).
      const { research } =
        await import('../services/research/webResearch.service');
      void research(query, {
        mode: kind === 'competitors' ? 'competitors' : 'trends',
        userId,
        workspaceId,
      }).catch(() => {});
      res.json({ success: true, status: 'inline' });
    } catch (error: any) {
      console.error('[VEEGPT] research refresh error:', error?.message);
      res.status(500).json({ error: 'Failed to refresh research' });
    }
  }
);

// ── Pre-flight cost estimate for an expensive job (spec §22) ────────────────
// "Estimated VeeGPT usage: ~40–100 VGU", shown BEFORE the user commits to a
// Deep Research run. A range, not a number: research on a narrow question and on
// a broad one differ several-fold, and quoting one figure would be misleading.
// Also returns the remaining allowance and the hard per-job ceiling, so the client
// can warn when a job would not fit instead of failing halfway through.
router.get('/estimate', requireAuth, async (req: any, res: Response) => {
  try {
    const feature =
      typeof req.query?.feature === 'string' && req.query.feature
        ? req.query.feature
        : DEEP_RESEARCH_FEATURE;
    const plan = await resolveVeegptPlan(req.user.id);
    if (!plan) {
      res.json({ feature, estimate: null, allowance: null });
      return;
    }
    const prefs = await requestAIPreferences(req);
    const promptChars =
      typeof req.query?.query === 'string' ? req.query.query.length : undefined;
    const range = estimateVGURange({ feature, model: prefs.aiModel, promptChars });

    const workspaceId = req.query?.workspaceId || req.user?.workspaceId;
    const snapshot = await getReservationEngine().usageSnapshot(
      req.user.id,
      plan,
      typeof workspaceId === 'string' ? workspaceId : undefined
    );
    const featureLine = snapshot.features.find(f => f.feature === feature);
    const spec = featureSpec(feature);
    const cap = featureMonthlyCap(feature, plan);

    res.json({
      feature,
      label: spec.label,
      estimate: {
        low: range.low,
        high: range.high,
        // The hard stop: a job is never billed beyond this, whatever it does.
        maxPerJob: range.ceiling,
        text: `Estimated VeeGPT usage: ~${range.low}\u2013${range.high} VGU`,
      },
      allowance: {
        usedVGU: featureLine?.usedVGU ?? 0,
        maxVGU: cap === Number.POSITIVE_INFINITY ? null : cap,
        remainingVGU: featureLine?.remainingVGU ?? null,
        // True when even the LOW estimate would not fit — worth telling the user
        // before they wait five minutes for a refusal.
        wouldExceed:
          featureLine?.remainingVGU != null && featureLine.remainingVGU < range.low,
      },
      limits: {
        concurrent: spec.concurrency ?? null,
        maxProviderCalls: spec.maxProviderCalls ?? null,
        timeoutMs: spec.timeoutMs ?? null,
        maxRetries: spec.maxRetries ?? 0,
      },
      period: {
        billingPeriodId: snapshot.billingPeriodId,
        resetAt: snapshot.period.resetAt,
      },
    });
  } catch (error: any) {
    console.error('[VEEGPT] estimate error:', error?.message);
    res.status(500).json({ error: 'Failed to estimate usage' });
  }
});

// ── VeeGPT usage limits ─────────────────────────────────────────────────────
// Read-only snapshot the UI polls to show remaining capacity. It reads the SAME
// Redis counters the reservation engine gates on, so the number shown can never
// disagree with what the user is actually allowed to do. Reserves nothing.
//
// `session`/`monthly` are kept as aliases of the burst/period windows so the
// existing client keeps working while the VGU-aware UI lands in a later block.
router.get('/limits', requireAuth, async (req: any, res: Response) => {
  try {
    const plan = await resolveVeegptPlan(req.user.id);
    if (!plan) {
      res.json({ plan: null, session: null, monthly: null });
      return;
    }
    const workspaceId = req.query?.workspaceId || req.user?.workspaceId;
    const snapshot = await getReservationEngine().usageSnapshot(
      req.user.id,
      plan,
      typeof workspaceId === 'string' ? workspaceId : undefined
    );

    // §42: a single plain-language notice, derived from whichever window is
    // closest to its limit. Users see "you're using VeeGPT heavily", never
    // "37/1200 VGU". Nothing is shown below 70%.
    const monthly = snapshot.period;
    const burst = snapshot.burst;
    const monthlyNotice = usageNotice(monthly.used, monthly.limit ?? 0, 'monthly');
    const burstNotice = usageNotice(burst.used, burst.limit ?? 0, 'session');
    // Whichever is more severe leads; the monthly limit wins ties because it is
    // the one that costs money to raise.
    const notice =
      burstNotice.fraction > monthlyNotice.fraction ? burstNotice : monthlyNotice;

    res.json({
      ...snapshot,
      session: burst,
      monthly,
      // §42 plain-language notice + §44 upgrade recommendation.
      notice: {
        band: notice.band,
        message: notice.message,
        scope: notice === burstNotice ? 'session' : 'monthly',
        resetAt: notice === burstNotice ? burst.resetAt : monthly.resetAt,
      },
      upgrade: canUpgrade(plan)
        ? { available: true, recommendedPlan: NEXT_PLAN[plan] ?? null }
        : { available: false, recommendedPlan: null },
    });
  } catch (error: any) {
    console.error('[VEEGPT] limits error:', error?.message);
    res.status(500).json({ error: 'Failed to load usage limits' });
  }
});

// ── Chat attachment upload ───────────────────────────────────────────────────
// Uploads a user-attached image/video to the SAME private S3 bucket used for
// AI-generated images. Returns a proxy URL (`/api/chat/attachment/:key`) that:
//   • streams bytes through the authenticated server (private bucket, per-user
//     authz — same model as /api/chat/image/:assetId)
//   • is durable across page reloads (not an ephemeral object URL)
//   • survives conversation reloads from the DB
//
// This is the standard pattern: ChatGPT, Claude and most AI SaaS products store
// user-attached files in object storage on send so the thumbnail persists.
// Videos are far larger than images, so the ceiling must accommodate a real
// phone reel/clip. 200 MB covers typical 1080p short-form; larger sources should
// use the video-editor resumable-upload path.
const ATTACHMENT_MAX_BYTES = 200 * 1024 * 1024; // 200 MB
const attachmentMemoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACHMENT_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype.startsWith('image/') ||
      file.mimetype.startsWith('video/') ||
      file.mimetype === 'application/pdf';
    if (!ok) {
      // Surface an explicit, actionable reason instead of silently dropping the
      // file (which the client could only report as a generic failure).
      cb(new Error(`Unsupported file type: ${file.mimetype || 'unknown'}`));
      return;
    }
    cb(null, true);
  },
});

/**
 * Run the single-file multer upload but convert its errors (size/type) into a
 * clean JSON response the client can show verbatim, instead of the opaque
 * Express default (which the composer could only report as "too large or
 * unsupported"). This is what lets a failed video upload say exactly why.
 */
function attachmentUploadMiddleware(req: any, res: Response, next: NextFunction) {
  attachmentMemoryUpload.single('file')(req, res, (err: any) => {
    if (err) {
      const isSize = err?.code === 'LIMIT_FILE_SIZE';
      const status = isSize ? 413 : 400;
      const message = isSize
        ? `That file is too large. The maximum is ${Math.floor(ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB.`
        : String(err?.message || 'The file could not be accepted.');
      vlog('chat-attachment:upload-rejected', { status, message: message.slice(0, 200) });
      return res.status(status).json({ error: message });
    }
    next();
  });
}

router.post(
  '/attachments/upload',
  requireAuth,
  attachmentUploadMiddleware,
  async (req: any, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided' });
      }
      const userId = String(req.user?.id || 'unknown');
      const workspaceId = String(req.headers['x-workspace-id'] || req.user?.workspaceId || 'ws');
      const folder = `chat-attachments/${workspaceId}`;
      // ── Upload observability + hard timeout ──────────────────────────────────
      // The S3 PutObject (storageService.uploadFile) is the "Uploading your
      // video…" phase the client shows. It was previously UNLOGGED on success and
      // had NO timeout, so a slow/stalled upload to the (production) S3 bucket
      // left the user stuck on the spinner forever with nothing in veegpt-debug.log
      // (the S3 attempt only console.log's to stdout). We now log start/ok/timeout
      // into the same debug file the operator reads, and cap the wait so a stalled
      // upload fails loudly instead of hanging. Env-tunable; default 120s.
      const uploadTimeoutMs = Number(process.env.CHAT_ATTACHMENT_UPLOAD_TIMEOUT_MS || 120_000);
      const uploadStartedAt = Date.now();
      vlog('chat-attachment:upload-start', {
        userId,
        workspaceId,
        name: String(req.file.originalname || '').slice(0, 120),
        mimeType: req.file.mimetype,
        sizeBytes: req.file.size ?? req.file.buffer?.length ?? 0,
      });
      const uploaded = await Promise.race([
        storageService.uploadFile({
          buffer: req.file.buffer,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          folder,
          metadata: { userId, uploadedFor: 'chat-attachment' },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Upload timed out after ${uploadTimeoutMs}ms`)),
            uploadTimeoutMs
          )
        ),
      ]);
      vlog('chat-attachment:upload-ok', {
        userId,
        workspaceId,
        key: uploaded.key,
        sizeBytes: uploaded.size,
        ms: Date.now() - uploadStartedAt,
      });
      // The stored key is under `chat-attachments/<workspaceId>/...`.
      // Serve it through the same authenticated proxy (streams bytes only to
      // the owner's session — bucket stays private, no raw S3 URL exposed).
      // Also return the S3 key so the server-side publishing worker can read
      // the file directly via storageService (has IAM, doesn't need the proxy).
      return res.json({
        key: uploaded.key,
        url: `/api/chat/attachment/${encodeURIComponent(uploaded.key)}`,
        // Absolute proxy URL for contexts that need a full URL (scheduling cards)
        absoluteUrl: `${(process.env.BASE_URL || process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '')}/api/chat/attachment/${encodeURIComponent(uploaded.key)}`,
        // Raw S3 URL — only used server-side (publishing worker has IAM access)
        storageUrl: uploaded.url,
        mimeType: req.file.mimetype,
        name: req.file.originalname,
        size: uploaded.size,
      });
    } catch (err: any) {
      const isTimeout = /timed out/i.test(String(err?.message || ''));
      vlog('chat-attachment:upload-error', {
        message: String(err?.message || '').slice(0, 200),
        timeout: isTimeout,
      });
      return res
        .status(isTimeout ? 504 : 500)
        .json({
          error: isTimeout
            ? 'The upload took too long and was cancelled. Please check your connection and try again.'
            : 'Upload failed',
        });
    }
  }
);

// ── Chat attachment proxy ─────────────────────────────────────────────────────
// Serves a user-uploaded chat attachment by its storage key. Uses the same
// delivery stack as AI-generated images (CloudFront redirect / streaming).
router.get('/attachment/*', requireAuth, async (req: any, res: Response) => {
  try {
    // The wildcard captures the full S3 key (may contain slashes).
    const key = decodeURIComponent((req.params as any)[0] || '');
    if (!key || !key.startsWith('chat-attachments/')) {
      return res.status(400).json({ error: 'Invalid key' });
    }

    // Delivery: same two-mode approach as AI images — redirect or stream.
    const deliveryMode = imageDeliveryMode();
    const isDownload = String(req.query.download || '') === '1';
    if (deliveryMode === 'cloudfront' && !isDownload) {
      try {
        const ttl = imageSignedUrlTtlSeconds();
        const cfUrl = getReusableCloudFrontUrl(key, ttl);
        if (cfUrl) {
          res.setHeader('Cache-Control', `private, max-age=${Math.max(0, ttl - 60)}`);
          return res.redirect(302, cfUrl);
        }
      } catch { /* fall through */ }
    }
    if (deliveryMode === 'redirect' && !isDownload) {
      try {
        const ttl = imageSignedUrlTtlSeconds();
        const signed = await getReusableSignedUrl(key, ttl);
        if (shouldRedirectImage({ mode: 'redirect', isDownload, signedUrl: signed })) {
          res.setHeader('Cache-Control', `private, max-age=${Math.max(0, ttl - 60)}`);
          return res.redirect(302, signed);
        }
      } catch { /* fall through */ }
    }
    const file = await storageService.downloadFile(key);
    const total = file.size ?? file.buffer.length;
    res.setHeader('Cache-Control', 'private, max-age=86400');
    // Advertise range support so native video players (WKWebView on iOS) will
    // stream/seek instead of refusing to play. Without this a <video> often
    // stays blank because it can't issue the range requests it expects.
    res.setHeader('Accept-Ranges', 'bytes');
    if (isDownload) res.setHeader('Content-Disposition', 'attachment');
    // Honor a Range request (partial content) — this is what lets a large video
    // start playing immediately and be seekable, exactly like ChatGPT streaming
    // media from a URL rather than loading the whole file up front.
    const rangeHeader =
      typeof req.headers.range === 'string' ? req.headers.range : '';
    const rangeMatch = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
    if (rangeMatch) {
      let start = rangeMatch[1] ? parseInt(rangeMatch[1], 10) : 0;
      let end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : total - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= total) end = total - 1;
      if (start > end || start >= total) {
        res.setHeader('Content-Range', `bytes */${total}`);
        return res.status(416).end();
      }
      res.status(206);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
      res.setHeader('Content-Length', String(end - start + 1));
      return res.end(file.buffer.subarray(start, end + 1));
    }
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(total));
    return res.status(200).end(file.buffer);
  } catch (err: any) {
    vlog('chat-attachment:proxy-error', { message: String(err?.message || '').slice(0, 200) });
    return res.status(500).json({ error: 'Failed to load attachment' });
  }
});

// ── Signed-URL micro-cache ───────────────────────────────────────────────────
// In "redirect" delivery mode every proxy hit would otherwise mint a brand-new
// pre-signed URL (fresh signature query params → a different URL each time),
// which (a) burns CPU re-signing on every <img> load and (b) defeats browser
// caching of the S3 response because the target URL keeps changing. We cache the
// signed URL per storageKey in-process and reuse it until shortly before it
// expires, so repeated loads of the same image return a STABLE target the
// browser can cache. Bounded in size; entries self-expire.
const SIGNED_URL_CACHE = new Map<string, { url: string; expiresAtMs: number }>();
const SIGNED_URL_CACHE_MAX = 1000;
// Stop reusing a cached URL this long before it actually expires, so a redirect
// never hands the browser a URL that dies mid-flight.
const SIGNED_URL_SAFETY_MS = 60_000;

// Same reuse strategy for CloudFront signed URLs (keyed separately so the two
// delivery modes never return each other's URLs).
const CF_SIGNED_URL_CACHE = new Map<string, { url: string; expiresAtMs: number }>();

/**
 * A reusable CloudFront signed URL for a storage key. Signs `https://<domain>/<key>`
 * with a canned policy expiring in `ttlSeconds`. Returns '' when CloudFront isn't
 * configured or signing fails, so the caller falls back to the next delivery mode.
 */
function getReusableCloudFrontUrl(storageKey: string, ttlSeconds: number): string {
  const cfg = cloudFrontConfig();
  if (!cfg) return '';
  const now = Date.now();
  const hit = CF_SIGNED_URL_CACHE.get(storageKey);
  if (hit && hit.expiresAtMs - SIGNED_URL_SAFETY_MS > now) {
    return hit.url;
  }
  try {
    const url = getCloudFrontSignedUrl({
      url: cloudFrontUrlForKey(cfg.domain, storageKey),
      keyPairId: cfg.keyPairId,
      privateKey: cfg.privateKey,
      dateLessThan: new Date(now + ttlSeconds * 1000).toISOString(),
    });
    if (CF_SIGNED_URL_CACHE.size >= SIGNED_URL_CACHE_MAX) {
      const oldest = CF_SIGNED_URL_CACHE.keys().next().value;
      if (oldest !== undefined) CF_SIGNED_URL_CACHE.delete(oldest);
    }
    CF_SIGNED_URL_CACHE.set(storageKey, { url, expiresAtMs: now + ttlSeconds * 1000 });
    return url;
  } catch (err: any) {
    vlog('image-proxy:cloudfront-sign-error', { message: String(err?.message || '').slice(0, 200) });
    return '';
  }
}

async function getReusableSignedUrl(storageKey: string, ttlSeconds: number, contentType?: string): Promise<string> {
  const now = Date.now();
  const hit = SIGNED_URL_CACHE.get(storageKey);
  if (hit && hit.expiresAtMs - SIGNED_URL_SAFETY_MS > now) {
    return hit.url;
  }
  const signed = await storageService.getSignedUrl(storageKey, {
    expiresIn: ttlSeconds,
    ...(contentType ? { responseContentType: contentType } : {}),
  });
  // Only cache absolute (S3) URLs; local storage returns a relative path we
  // never redirect to.
  if (/^https?:\/\//i.test(signed.url)) {
    if (SIGNED_URL_CACHE.size >= SIGNED_URL_CACHE_MAX) {
      // Evict the oldest-inserted entry (Map preserves insertion order).
      const oldest = SIGNED_URL_CACHE.keys().next().value;
      if (oldest !== undefined) SIGNED_URL_CACHE.delete(oldest);
    }
    SIGNED_URL_CACHE.set(storageKey, {
      url: signed.url,
      expiresAtMs: signed.expiresAt instanceof Date ? signed.expiresAt.getTime() : now + ttlSeconds * 1000,
    });
  }
  return signed.url;
}

// ── Secure image proxy ──────────────────────────────────────────────────────
// Serves an AI-generated/edited image by assetId. The S3 bucket is PRIVATE, so
// access is always gated by auth + per-user/workspace authorization first.
//
// Delivery is env-gated (IMAGE_DELIVERY):
//   • "stream"   (default) — the server downloads the object and pipes the bytes
//     through itself. Works for local storage and S3, no CORS, stable URL.
//   • "redirect" — after authorization passes, the server 302-redirects to a
//     short-lived pre-signed S3 URL so the bytes flow S3 → browser directly and
//     never use server egress. The bucket stays private (the signed URL is
//     time-boxed + only minted for an authorized caller). This is the standard
//     bandwidth-offload pattern used by large object-serving products.
//
// `?download=1` always streams (same-origin) and forces a file download, so the
// client's fetch()+blob path needs no cross-origin CORS on the bucket.
router.get('/image/:assetId', requireAuth, async (req: any, res: Response) => {
  try {
    const assetId = String(req.params.assetId || '');
    if (!assetId) return res.status(400).json({ error: 'Missing assetId' });

    const asset = await AiImageAsset.findOne({ assetId }).lean();
    if (!asset || !asset.storageKey) {
      return res.status(404).json({ error: 'Image not found' });
    }

    // Authorization: the requester must own the asset, or belong to the same
    // workspace it was created in. Never serve one user's image to another.
    const userId = String(req.user?.id || '');
    const workspaceId = String((req as any).workspaceId || req.headers['x-workspace-id'] || '');
    const ownsByUser = asset.userId && String(asset.userId) === userId;
    const ownsByWorkspace = asset.workspaceId && String(asset.workspaceId) === workspaceId;
    if (!ownsByUser && !ownsByWorkspace) {
      // Fall back to user-only match if no workspace context was supplied.
      if (!ownsByUser) return res.status(403).json({ error: 'Forbidden' });
    }

    const isDownload = String(req.query.download || '') === '1';
    const deliveryMode = imageDeliveryMode();

    // CDN path: hand the authorized browser a short-lived CloudFront SIGNED URL
    // and let it fetch bytes from the nearest edge. Bucket stays private (OAC).
    // Never for downloads (keeps that same-origin). Falls through to the S3
    // redirect / streaming paths if CloudFront isn't configured or signing fails.
    if (deliveryMode === 'cloudfront' && !isDownload) {
      const ttl = imageSignedUrlTtlSeconds();
      const cfUrl = getReusableCloudFrontUrl(asset.storageKey, ttl);
      if (cfUrl) {
        res.setHeader('Cache-Control', `private, max-age=${Math.max(0, ttl - 60)}`);
        // Observability (metadata only — no signature/bytes): confirms images are
        // delivered from the CloudFront edge, not streamed or served from disk.
        vlog('image-proxy:cloudfront-redirect', {
          assetId,
          host: (cfUrl.split('/')[2] || '').slice(0, 60),
        });
        return res.redirect(302, cfUrl);
      }
      // CloudFront not usable → fall through to streaming below.
    }

    // Bandwidth-offload path: hand the authorized browser a short-lived signed
    // S3 URL and let it fetch bytes directly. Only for absolute (S3) URLs and
    // never for downloads. Any failure falls through to streaming below.
    if (deliveryMode === 'redirect' && !isDownload) {
      try {
        const ttl = imageSignedUrlTtlSeconds();
        const signedUrl = await getReusableSignedUrl(asset.storageKey, ttl, asset.mimeType);
        if (shouldRedirectImage({ mode: 'redirect', isDownload, signedUrl })) {
          // Let the browser cache the redirect itself (per-user) for < the TTL,
          // so subsequent <img> loads reuse the cached S3 target.
          res.setHeader('Cache-Control', `private, max-age=${Math.max(0, ttl - 60)}`);
          return res.redirect(302, signedUrl);
        }
      } catch (redirectErr: any) {
        vlog('image-proxy:redirect-fallback', {
          message: String(redirectErr?.message || '').slice(0, 200),
        });
        // fall through to streaming
      }
    }

    // Streaming path (default, and fallback for local storage / presign errors).
    const file = await storageService.downloadFile(asset.storageKey);
    const filename = `${(asset.instruction || 'veefore-image')
      .replace(/[^\w-]+/g, '-')
      .toLowerCase()
      .slice(0, 40)}.${file.contentType.includes('jpeg') ? 'jpg' : file.contentType.includes('webp') ? 'webp' : 'png'}`;

    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.size));
    // Private cache only (per-user); allow the browser to cache within the tab.
    res.setHeader('Cache-Control', 'private, max-age=86400');
    if (isDownload) {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    return res.status(200).end(file.buffer);
  } catch (err: any) {
    vlog('image-proxy:error', { message: String(err?.message || '').slice(0, 200) });
    return res.status(500).json({ error: 'Failed to load image' });
  }
});

export default router;
