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

import { Router, type Response } from 'express';
import { requireAuth } from '../middleware/require-auth';
import { ChatConversation, ChatMessage, UserMemory } from '../models/Chat';
import { storage } from '../mongodb-storage';
import { aiServiceManager, type UserAIPreferences, type AIAttachment } from '../services/AIServiceManager';
import { vlog } from '../utils/veegpt-debug-logger';
import {
  selectShallowWindow,
  planLongTermWindow,
  LONG_TERM_VERBATIM,
  type MemoryMode,
} from './veegpt-memory.logic';
import { mergeMemoryItems, computeUsage, hasSaveIntent, extractSaveIntentFact, clampItemText, isMemoryFull, dedupeMemoryItems, detectTopic } from './veegpt-user-memory.logic';
import { VEEGPT_CHAT_TOOLS, VEEGPT_MEMORY_TOOLS_ALL, VEEGPT_DATA_TOOLS, VEEGPT_EDIT_TOOLS, VEEGPT_INSIGHT_TOOLS, VEEGPT_ACCOUNT_TOOLS } from './veegpt-tools';
import type { ChatTool } from '../services/AIServiceManager';
import { parsePostIntentDeterministic, mergePostIntent } from './veegpt-post-intent.logic';
import { getWorkspaceContextForPrompt, getIdentityContextForPrompt } from '../services/WorkspaceContextAccessor';
import { VEEGPT_AGENTS, agentPublicView, getAgentDirectives } from './veegpt-agents';
import { withAIFeature } from '../services/aiUsageTracker';
import { veeGPTBasicGuards } from '../middleware/ai-route-guards';
import {
  aiCreditMeteringService,
  InsufficientAICreditsError,
} from '../features/subscription/services/AICreditMeteringService';

const router = Router();

// ── Selectable VeeGPT agents (personas) — client dropdown metadata ───────────
// Returns only the public view (id/name/description/icon); prompt directives
// stay server-side and are applied by the chat handlers.
router.get('/agents', requireAuth, async (_req: any, res: Response) => {
  res.json({ agents: VEEGPT_AGENTS.map(agentPublicView) });
});

// ─── TESTING FLAG ───────────────────────────────────────────────────────────
// When true, ALL regex/deterministic shortcuts are bypassed so we can verify
// the LLM handles everything (post intent, memory save-intent, caption/hashtag)
// on its own. Set back to false to restore the production fast-paths/fallbacks.
const DISABLE_REGEX_FOR_TESTING = true;

// Startup marker so we can confirm in the log that THIS version is live (used to
// diagnose stale-process / no-reload issues).
vlog('routes:loaded', { version: 'memory-v3-deterministic', at: new Date().toISOString() });
console.log('[VEEGPT] routes loaded — memory-v3-deterministic');

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

/**
 * Resolve the AI preferences for a workspace from its saved aiConfiguration.
 * Falls back to sensible defaults when the workspace has not configured AI yet.
 *
 * Resilient lookup: the conversation's stored `workspaceId` may be a synthetic
 * id (e.g. "ws_xxxx") that isn't a Mongo ObjectId, so storage.getWorkspace()
 * can't resolve it. In that case we fall back to the user's default workspace,
 * so the AI configuration (model, keys, persona, …) is still applied.
 */
async function getWorkspaceAIPreferences(workspaceId?: string, userId?: string): Promise<FullPreferences> {
  try {
    let workspace = workspaceId ? await storage.getWorkspace(workspaceId) : undefined;

    // Fallback: stored workspaceId didn't resolve (non-ObjectId / synthetic id).
    if (!workspace && userId) {
      vlog('ai-config:fallback-default-workspace', { workspaceId, userId });
      workspace = await storage.getDefaultWorkspace(userId);
    }

    const cfg = (workspace as any)?.aiConfiguration;
    if (!cfg) {
      vlog('ai-config:none', { workspaceId, resolvedId: (workspace as any)?.id, note: 'no aiConfiguration, using defaults' });
      // Memory is an always-on VeeGPT capability — default it to long-term so
      // the assistant learns durable facts even before the user touches AI config.
      return { aiMemory: 'long-term' };
    }
    vlog('ai-config:loaded', {
      workspaceId,
      resolvedId: (workspace as any)?.id,
      aiModel: cfg.aiModel,
      creativityLevel: cfg.creativityLevel,
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
    console.error('[VEEGPT] Failed to load workspace AI configuration:', error?.message);
    return {};
  }
}

/**
 * Resolve a canonical workspace id for memory keying. The conversation's stored
 * workspaceId may be a synthetic id (e.g. "ws_xxxx") that doesn't resolve; in
 * that case we fall back to the user's default workspace. This keeps cross-chat
 * memory consistently keyed whether it's written from chat or read from
 * Settings (which passes the real workspace id).
 */
async function resolveMemoryWorkspaceId(workspaceId?: string, userId?: string): Promise<string | undefined> {
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
          const accounts = await storage.getSocialAccountsByWorkspace(wsId).catch(() => []);
          if (accounts && accounts.length > 0) {
            vlog('memory:workspace-with-accounts', { wsId, accountCount: accounts.length });
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
    vlog('user-memory:resolve-workspace-error', { workspaceId, userId, error: err?.message });
  }
  return workspaceId;
}

/** Map the responseLength setting to a concrete length instruction. */
function responseLengthDirective(responseLength?: string): string {
  switch ((responseLength || '').toLowerCase()) {
    case 'short':
      return 'Default to concise replies (a few sentences), but still fully answer the question. Expand only if the question genuinely needs it.';
    case 'long':
      return 'Give thorough, in-depth answers: cover the topic comprehensively with structure, concrete examples, trade-offs and actionable steps.';
    case 'medium':
    default:
      return 'Match the depth to the question: keep simple questions short and direct, but when the user asks something complex, open-ended, or "how/why/explain/compare", give a complete, well-structured answer — do not cut it short.';
  }
}

/**
 * Build the full prompt, baking in EVERY saved AI configuration setting so
 * VeeGPT consistently follows the workspace's settings. (Model, temperature,
 * safety and provider keys are also applied by AIServiceManager from prefs.)
 */
function buildPrompt(
  history: Array<{ role: string; content: string }>,
  prefs: FullPreferences,
  memorySummary?: string,
  userMemoryProfile?: string,
  workspaceContext?: string,
  memoryNote?: string,
  agentDirectives?: string,
): string {
  const directives: string[] = [];
  if (prefs.aiPersona) directives.push(`- Persona / voice: ${prefs.aiPersona}.`);
  if (prefs.captionStyle) directives.push(`- Writing tone & style: ${prefs.captionStyle}.`);
  directives.push(`- Response length: ${responseLengthDirective(prefs.responseLength)}`);
  if (prefs.optimizationGoals) {
    directives.push(`- Optimization goal: tailor advice and content to maximize ${prefs.optimizationGoals}.`);
  }
  if (prefs.multilingual && prefs.multilingual !== 'auto') {
    directives.push(`- Always respond in this language: ${prefs.multilingual}.`);
  } else {
    directives.push('- Respond in the same language the user writes in.');
  }
  if (prefs.autoHashtags) {
    directives.push('- When you suggest social posts or captions, append a few relevant, high-quality hashtags.');
  } else {
    directives.push('- Do not add hashtags unless the user explicitly asks for them.');
  }
  if (prefs.contentSafety === 'strict') {
    directives.push('- Keep all content strictly brand-safe, professional and free of edgy or risky material.');
  } else if (prefs.contentSafety === 'off') {
    directives.push('- Content filtering is relaxed; still avoid harmful content.');
  }
  if (prefs.aiMemory === 'long-term') {
    directives.push('- Maintain continuity with the earlier messages in this conversation.');
    directives.push(
      '- Memory handling: when the user asks you to remember/save something, first ' +
      'check the "VeeGPT Memory" section below. If it (or an equivalent fact) is ' +
      'ALREADY there, tell them it\'s already saved instead of acting like it\'s new. ' +
      'If it\'s new, confirm you\'ll remember it. If it updates/contradicts an existing ' +
      'memory, acknowledge you\'re updating it.',
    );
  }
  if (prefs.autoLearning) {
    directives.push(
      "- Learn from and adapt to the user's own writing: pay attention to their tone, vocabulary, " +
      'sentence length and phrasing across their messages, and progressively mirror that voice in your ' +
      'replies so you sound more like them as the conversation continues.',
    );
  }

  // ACTIVE EXPERT MODE — when the user has picked an agent/persona, this leads
  // the prompt so the model fully EMBODIES that specialist (not a bolt-on note).
  const agentBlock = agentDirectives && agentDirectives.trim()
    ? '━━━ ACTIVE EXPERT MODE (the user selected this specialist — fully embody it) ━━━\n' +
      agentDirectives.trim() +
      '\nStay in character as this expert for the entire conversation: think, prioritize, and answer the way this specialist would, at the top of their field. This expertise governs HOW you answer; the platform rules below still apply (use tools for real data, be accurate, follow the user\'s config).\n\n'
    : '';

  const systemBlock =
    agentBlock +
    'You are VeeGPT, an expert AI assistant for social media creators inside the Veefore platform. ' +
    'You are knowledgeable, specific, and genuinely useful — like a senior social-media strategist, not a generic chatbot.\n' +
    'ANSWERING STYLE (very important):\n' +
    '- Directly answer what was asked; never give vague, filler, or generic responses.\n' +
    '- Scale depth to the question. For complex, open-ended, or "how/why/explain/compare/strategy" questions, give a COMPLETE, well-organized answer using Markdown: short section headings, bullet/numbered lists, **bold** for key terms, and concrete examples or steps. For simple questions, answer briefly and directly — but never a bare one-word/one-fragment reply.\n' +
    '- PERSONAL / ACCOUNT questions (e.g. "what is my name", "what\'s my niche", "which accounts do I have", "tell me about my account"): answer in a warm, natural, COMPLETE sentence and proactively add the single most relevant related detail you already know from the memory/context (e.g. their name + plan or niche, or their handle + platform). Do NOT reply with just the raw value. If the answer needs their live account numbers, fetch them first (get_account_details / get_workspace_data) and then answer conversationally.\n' +
    '- Be concrete and specific to the user\'s niche, platform, and goals (use the memory/context below). Prefer real examples, numbers, and actionable steps over abstract advice.\n' +
    '- Do not pad with restating the question or generic intros/outros. Lead with the substance.\n' +
    '- Use Markdown formatting so the response is easy to scan.\n' +
    'WORKSPACE DATA & ACTIONS:\n' +
    '- You have live, read-only access to the user\'s workspace via get_workspace_data. When they ask anything factual about THEIR account/content (how many posts are scheduled, what\'s scheduled, drafts, follower counts, recent posts), you MUST CALL get_workspace_data and let it render the posts as cards — do NOT answer those from memory/context or list posts in plain prose. Never guess numbers.\n' +
    '- You can EDIT their existing content: reschedule_post (move a scheduled post), cancel_scheduled_post (unschedule → draft), update_post_caption. Before editing, call get_workspace_data to find the right contentId and make sure you act on the post the user means. The edit is NOT applied immediately — the user sees a confirmation card and approves it, so do NOT claim the change is already done; say you\'ve prepared it for their confirmation.\n' +
    '- MULTIPLE ACTIONS AT ONCE (multitasking): the user often asks for several things in one message (e.g. "schedule this AND add a hashtag to my other post AND remember my brand is X"). You MUST handle EVERY requested action in this turn by emitting a separate tool call for EACH one — schedule_post, reschedule_post, cancel_scheduled_post, update_post_caption, remember_fact, get_workspace_data can all be called together. Never do just the first action and ignore the rest. If you need a post\'s id for an edit, you already have the user\'s posts listed in the context.\n' +
    'Follow these workspace AI configuration rules:\n' +
    directives.join('\n');

  // Long-term memory: a running summary of earlier parts of the conversation
  // that are no longer included verbatim. Treat it as factual context the user
  // already shared.
  const memoryBlock =
    memorySummary && memorySummary.trim()
      ? `\n\n--- Summary of earlier conversation (long-term memory) ---\n${memorySummary.trim()}`
      : '';

  // VeeGPT Memory — a single block combining the live workspace/account data
  // and the durable facts learned from past chats. Both come from the same
  // stored memory document. Use it to personalize replies; never fabricate
  // beyond it.
  const memoryParts: string[] = [];
  if (workspaceContext && workspaceContext.trim()) memoryParts.push(workspaceContext.trim());
  if (userMemoryProfile && userMemoryProfile.trim()) {
    memoryParts.push(`Things you remember about this user:\n${userMemoryProfile.trim()}`);
  }
  const knowledgeBlock = memoryParts.length
    ? `\n\n--- VeeGPT Memory: what you know about this user (always up to date) ---\n${memoryParts.join('\n\n')}\n\n` +
      'Use this memory naturally. If the user states something that is ALREADY captured above, acknowledge that you already know it ' +
      '(e.g. "Yep, I\'ve got that noted — your brand color is blue.") and do NOT call remember_fact again for it. ' +
      'CONTRADICTIONS / CHANGES: if the user gives NEW info that REPLACES an existing fact on the SAME topic (e.g. memory says "brand color is blue" and they now say "my brand color is red"), call update_memory with that fact\'s [id:...] to REPLACE it — do NOT add a second contradicting fact. ' +
      'If the user says something is no longer true or to forget it, call forget_memory with its [id:...]. ' +
      'CLEANING UP DUPLICATES: if the user asks to remove duplicate or redundant facts, call forget_memory ONLY on the extra copies — keep one copy of each distinct fact, and never delete facts about different topics or wipe the whole memory. If multiple facts contradict each other on one topic, keep the newest/correct one and forget the stale ones only. ' +
      'If you are UNSURE whether the new info replaces the old fact or is an additional one (e.g. they might have two brand colors), do NOT guess — ask the user to confirm in plain text (e.g. "You previously told me your brand color is blue. Did it change to red, or do you use both?"). ' +
      'Only call remember_fact for a genuinely NEW topic not already in this memory.'
    : '';

  const transcript = history
    .map((m) => `${m.role === 'assistant' ? 'VeeGPT' : 'User'}: ${m.content}`)
    .join('\n');

  // Deterministic memory action just performed (save/duplicate) — tells the
  // model the TRUTH so its reply matches what was actually stored.
  const noteBlock = memoryNote && memoryNote.trim() ? `\n\n--- Memory update (already applied) ---\n${memoryNote.trim()}` : '';

  // PROMPT-CACHE-FRIENDLY ORDERING (static → dynamic; volatile bits LAST).
  // Providers (OpenAI/Azure/Anthropic) cache the longest IDENTICAL prefix from
  // the start of the prompt, billing cache hits at ~10% of input cost. The big
  // win is the append-only `transcript`: keeping it cacheable turn-to-turn
  // requires everything BEFORE it to stay byte-identical. So we place:
  //   1. systemBlock   — persona/config, stable for the whole session
  //   2. knowledgeBlock — workspace + user memory, changes slowly
  //   3. memoryBlock   — rolling summary, changes only on overflow (~every 10 turns)
  //   4. transcript    — grows append-only (the cacheable bulk)
  //   5. noteBlock     — PER-TURN volatile note, kept AFTER the transcript so it
  //      never shifts the cacheable prefix (and reads with good recency).
  return `${systemBlock}${knowledgeBlock}${memoryBlock}\n\n--- Conversation ---\n${transcript}${noteBlock}\n\nVeeGPT:`;
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
    const drafts = ((all as any[]) || []).filter((c) => (c.status || 'draft') === 'draft').slice(0, 15);
    const sched = ((scheduled as any[]) || []).slice(0, 15);
    if (!sched.length && !drafts.length) return '';
    const fmt = (c: any, i: number) => {
      const id = (c.id || c._id)?.toString();
      const when = c.scheduledAt ? new Date(c.scheduledAt).toLocaleString() : '';
      const cap = (c.description || c.contentData?.text || c.title || '').toString().slice(0, 60);
      return `  ${i + 1}. id="${id}" ${c.type || 'post'}${when ? ` @ ${when}` : ''}${cap ? ` — "${cap}"` : ''}`;
    };
    const lines: string[] = ['--- The user\'s current posts (FOR INTERNAL ID LOOKUP ONLY — do NOT list these in prose) ---'];
    if (sched.length) { lines.push(`Scheduled (${sched.length}):`); sched.forEach((c, i) => lines.push(fmt(c, i))); }
    if (drafts.length) { lines.push(`Drafts (${drafts.length}):`); drafts.forEach((c, i) => lines.push(fmt(c, i))); }
    lines.push('When the user refers to a post by position ("the first one"), recency, time, or topic, map it to the matching id above and pass that contentId to the edit tool.');
    lines.push('CRITICAL: This list is ONLY so you can resolve ids. Whenever the user asks to SEE, LIST, SHOW, or COUNT their posts/scheduled/drafts/published ("how many posts are scheduled", "what\u2019s scheduled", "show my drafts"), you MUST call get_workspace_data so the posts render as visual CARDS — do NOT answer by listing the posts in text from this context. When you call get_workspace_data or any edit tool, output NO prose at all (only the tool call); the system shows the cards and a summary automatically.');
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
  out = out.replace(/\[?\b(schedule_post|remember_fact|get_workspace_data|reschedule_post|cancel_scheduled_post|update_post_caption|update_memory|forget_memory|delete_post|duplicate_post|generate_caption|generate_hashtags|get_analytics_insight|get_best_posting_time|research_trends|search_web|deep_research)\s*\([\s\S]*?\)\]?/gi, '');
  // A standalone JSON object that mentions a tool field (best-effort, single line).
  out = out.replace(/\{[^{}]*\b(accountId|scheduledLocal|generateCaption|"fact"|contentId|resource)\b[^{}]*\}/gi, '');
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
function recoverLeakedToolCalls(text: string): Array<{ name: string; args: Record<string, unknown> }> {
  if (!text) return [];
  const known = ['schedule_post', 'reschedule_post', 'cancel_scheduled_post', 'update_post_caption', 'get_workspace_data', 'remember_fact', 'update_memory', 'forget_memory', 'delete_post', 'duplicate_post', 'generate_caption', 'generate_hashtags', 'get_analytics_insight', 'get_best_posting_time', 'research_trends', 'search_web', 'deep_research'];
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
          if (parsed && typeof parsed === 'object') { found.push({ name, args: parsed as Record<string, unknown> }); continue; }
        } catch { /* fall through to kv parse */ }
      }
      const args: Record<string, unknown> = {};
      const kv = /([a-zA-Z_]+)\s*=\s*("([^"]*)"|'([^']*)'|true|false|\d+(?:\.\d+)?)/g;
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
      else if (name === 'get_workspace_data') found.push({ name, args: { resource: 'scheduled_posts' } });
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
  hasMedia = false,
): string {
  const accountList = (accounts || []).map((a: any) => ({
    id: (a.id || a._id || a.accountId)?.toString(),
    username: a.username,
    platform: a.platform || 'instagram',
  }));
  const now = localNow && String(localNow).trim() ? String(localNow) : new Date().toISOString();
  const lines: string[] = [];
  lines.push('--- Posting context (for the schedule_post tool) ---');
  lines.push(`Current local date-time: "${now}"${timezone ? ` (timezone ${timezone})` : ''}. Resolve all relative times (e.g. "tomorrow", "tonight", "5pm") against THIS, never against any other date.`);
  lines.push(`Connected accounts (${accountList.length}): ${JSON.stringify(accountList)}.`);
  if (accountList.length === 1) lines.push(`Only one account is connected — use accountId "${accountList[0].id}" automatically; do not ask which account.`);
  lines.push(`Media attached to this message: ${hasMedia ? 'YES' : 'NO'}.`);
  if (hasMedia) {
    lines.push(
      'The user has attached media for a post. When their message indicates they want to publish or schedule it ' +
      '(e.g. "post this", "schedule my reel", "share this tomorrow 5pm", or they previously asked to post and are now ' +
      'providing the media/time), you MUST call schedule_post — do not just reply in text. ' +
      'Use type "reel" for a video unless the user says story. If the time is unclear, still call schedule_post with ' +
      'schedule=true and scheduledLocal=null (the system will ask the user for the time); if they want it live now, use schedule=false.',
    );
  } else {
    lines.push(
      'No media is attached to this message. ' +
      'When the user is asking to PUBLISH or SCHEDULE a post — including time-only requests like "schedule my post tomorrow at 1pm", "post this at 12am", "publish now" — you MUST call schedule_post (set schedule=true with the given scheduledLocal, or schedule=false for now). The system will then ask the user to attach the image/video. ' +
      'This is an ACTION/TASK: do NOT memorize it with remember_fact, do NOT invent a recurring posting habit from a one-off request, and do NOT just chat about it. ' +
      'For ordinary chat, questions, ideas, or durable statements (e.g. "my brand color is blue"), reply normally and do NOT call schedule_post.',
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
function buildAccountScopeHint(accounts: any[], selectedAccountId: string): string {
  if (!accounts?.length) return '';
  const list = accounts.map((a: any) => `@${a.username} (${a.platform})`).join(', ');
  const common =
    'Be SELECTIVE: pass only the metrics the question needs (e.g. metrics ["followers"] for "how many followers"; ["reach","engagement"] with a timeframe for a period question). Use metrics ["all"] only when the user wants the full/overall analytics. You can request a time range (timeframe/days) — it is auto-capped to the user\'s subscription plan; if it gets capped, say so and note that upgrading unlocks a longer history. ' +
    'Do NOT call get_account_details for greetings, general how-to/strategy questions, or brainstorming.';

  const acct = selectedAccountId
    ? accounts.find((a: any) => String(a.id || a._id || a.accountId) === String(selectedAccountId))
    : null;

  if (acct) {
    const handle = acct.username ? `@${acct.username}` : 'their account';
    const platform = acct.platform || 'instagram';
    return [
      '--- Selected account (conversation focus) ---',
      `The user has SELECTED their ${platform} account ${handle} (id: ${selectedAccountId}) as the focus of this conversation.`,
      'When they say "my account", or ask about followers, following, engagement, reach, impressions, likes, comments, shares, saves, views, growth, audience/demographics, top posts, or performance over any time period, they mean THIS account.',
      'You do NOT have this account\'s analytics in the prompt — call get_account_details to fetch the LIVE numbers (same data as their dashboard) BEFORE answering. Never guess or invent numbers.',
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
  'search_web', 'research_trends', 'deep_research',
  'get_account_details', 'get_analytics_insight', 'get_best_posting_time',
  'generate_caption', 'generate_hashtags', 'caption_and_hashtags', 'get_workspace_data',
]);

/**
 * When the user explicitly selected a tool in the composer, build a directive
 * that forces the model to run exactly that tool this turn (using their message
 * as the input). Returns '' for an unknown/empty selection.
 */
function buildForcedToolDirective(forcedTool: string): string {
  if (!forcedTool || !FORCEABLE_TOOLS.has(forcedTool)) return '';
  // Combined caption/hashtags tool → let the model pick caption, hashtags, or both.
  if (forcedTool === 'caption_and_hashtags') {
    return [
      '--- Tool explicitly selected by the user: "Caption & hashtags" (RUN IT NOW) ---',
      'Based on the user\'s message, call the right tool(s) this turn, using their message as the topic:',
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
 * Normalize a raw `schedule_post` tool-call argument object into the `plan`
 * shape the confirm card + /post-agent/execute already understand. Light,
 * deterministic shaping only (defaults + types); account auto-pick and the
 * past-time guard are applied at confirm/execute time where workspace + the
 * user's local clock are available.
 */
function normalizeSchedulePlan(args: Record<string, unknown>): any {
  const a = args || {};
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);
  return {
    type: ['post', 'reel', 'story'].includes(String(a.type)) ? String(a.type) : 'post',
    accountId: a.accountId ? String(a.accountId) : '',
    caption: typeof a.caption === 'string' ? a.caption : '',
    generateCaption: a.generateCaption === true,
    generateHashtags: a.generateHashtags === true,
    hashtags: arr(a.hashtags),
    mentions: arr(a.mentions),
    collaborators: arr(a.collaborators),
    schedule: a.schedule === true,
    scheduledLocal: typeof a.scheduledLocal === 'string' && a.scheduledLocal.trim() ? a.scheduledLocal : null,
    summary: typeof a.summary === 'string' ? a.summary : '',
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
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  };
  const scheduled = parseLocal(plan.scheduledLocal);
  const now = parseLocal(localNow || '') || new Date();
  if (scheduled && scheduled.getTime() <= now.getTime() + 60 * 1000) {
    const when = scheduled.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    return `${when} has already passed. Want me to schedule it for that time tomorrow, pick another time, or post it now?`;
  }
  return null;
}

/** Parse a "YYYY-MM-DDTHH:mm" LOCAL string to a Date (server local time). */
function parseLocalDateTime(s?: string | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(s));
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
}

/** Compact a content doc to the fields the model needs to answer/edit. */
function summarizeContentForTool(c: any): Record<string, unknown> {
  const cd = c.contentData || {};
  const mediaUrls: string[] = Array.isArray(cd.mediaUrls) ? cd.mediaUrls.filter((u: any) => typeof u === 'string' && u) : [];
  const hashtags: string[] = Array.isArray(cd.hashtags) ? cd.hashtags : (Array.isArray(c.hashtags) ? c.hashtags : []);
  const mentions: string[] = Array.isArray(cd.mentions) ? cd.mentions : (Array.isArray(c.mentions) ? c.mentions : []);
  const collaborators: string[] = Array.isArray(cd.collaborators) ? cd.collaborators : (Array.isArray(c.collaborators) ? c.collaborators : []);
  return {
    id: (c.id || c._id)?.toString(),
    title: c.title || undefined,
    type: c.type || undefined,
    platform: c.platform || undefined,
    status: c.status || undefined,
    caption: (typeof c.description === 'string' && c.description) ? c.description : (cd.text ? String(cd.text) : undefined),
    hashtags: hashtags.length ? hashtags.map((h) => String(h).replace(/^#+/, '')) : undefined,
    mentions: mentions.length ? mentions.map((m) => String(m).replace(/^@+/, '')) : undefined,
    collaborators: collaborators.length ? collaborators.map((m) => String(m).replace(/^@+/, '')) : undefined,
    mediaUrls: mediaUrls.length ? mediaUrls : undefined,
    scheduledAt: c.scheduledAt ? new Date(c.scheduledAt).toISOString() : undefined,
    publishedAt: c.publishedAt ? new Date(c.publishedAt).toISOString() : undefined,
  };
}

/**
 * Build the result of a read-only `get_workspace_data` call: a structured list
 * card (when the resource is a list of posts) plus a short text summary the model
 * can paraphrase. Strictly read-only and workspace-scoped. Never throws.
 */
async function buildDataResult(
  workspaceId: string | undefined,
  args: Record<string, unknown>,
): Promise<{ listCard: any | null; summaryText: string; items?: any[] }> {
  if (!workspaceId) return { listCard: null, summaryText: 'No workspace in context.' };
  const resource = String(args?.resource || 'overview');
  const limit = Math.max(1, Math.min(Number(args?.limit) || 20, 50));
  const titles: Record<string, string> = {
    scheduled_posts: 'Scheduled posts',
    published_posts: 'Published posts',
    draft_posts: 'Drafts',
    recent_content: 'Recent content',
  };
  try {
    if (['scheduled_posts', 'published_posts', 'draft_posts', 'recent_content'].includes(resource)) {
      let items: any[];
      if (resource === 'scheduled_posts') {
        items = (await storage.getScheduledContent(workspaceId).catch(() => [])) || [];
      } else {
        const all = (await storage.getContentByWorkspace(workspaceId, 100).catch(() => [])) || [];
        const wanted = resource === 'published_posts' ? 'published' : resource === 'draft_posts' ? 'draft' : null;
        items = wanted ? all.filter((c: any) => (c.status || 'draft') === wanted) : all;
      }
      const summarized = items.slice(0, limit).map(summarizeContentForTool);
      const listCard = summarized.length
        ? { kind: resource, title: titles[resource] || 'Posts', items: summarized }
        : null;
      const label = (titles[resource] || 'items').toLowerCase();
      const summaryText = items.length
        ? `You have ${items.length} ${label === 'recent content' ? 'recent item(s)' : label} — here ${items.length === 1 ? 'it is' : 'they are'}:`
        : `You don\u2019t have any ${label} right now.`;
      return { listCard, summaryText, items: summarized };
    }
    if (resource === 'content_summary') {
      const all = (await storage.getContentByWorkspace(workspaceId, 500).catch(() => [])) || [];
      const counts: Record<string, number> = {};
      for (const c of all as any[]) { const s = c.status || 'draft'; counts[s] = (counts[s] || 0) + 1; }
      return { listCard: null, summaryText: `Content totals — total ${all.length}; ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}.` };
    }
    if (resource === 'accounts') {
      const accts = (await storage.getSocialAccountsByWorkspace(workspaceId).catch(() => [])) || [];
      const text = accts.length
        ? accts.map((a: any) => `${a.platform} @${a.username}: ${a.followersCount ?? '?'} followers, ${a.mediaCount ?? '?'} posts, ${a.engagementRate ?? '?'}% engagement`).join('; ')
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
    for (const c of (all as any[]) || []) { const s = c.status || 'draft'; counts[s] = (counts[s] || 0) + 1; }
    const scheduledItems = ((scheduled as any[]) || []).slice(0, limit).map(summarizeContentForTool);
    const listCard = scheduledItems.length ? { kind: 'scheduled_posts', title: 'Scheduled posts', items: scheduledItems } : null;
    const summaryText = `Overview — ${(scheduled as any[])?.length || 0} scheduled; content totals: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}; ${((accts as any[]) || []).length} connected account(s).`;
    return { listCard, summaryText, items: scheduledItems };
  } catch (err: any) {
    return { listCard: null, summaryText: `Could not load workspace data: ${err?.message || 'unknown error'}.` };
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
  localNow?: string,
): Promise<{ card?: any; intro?: string; error?: string }> {
  if (!workspaceId) return { error: 'No workspace in context.' };
  const contentId = String(args?.contentId || '').trim();
  if (!contentId) return { error: 'I couldn\u2019t identify which post to edit.' };
  const existing: any = await storage.getContent(contentId).catch(() => undefined);
  if (!existing || String(existing.workspaceId) !== String(workspaceId)) {
    return { error: 'That post wasn\u2019t found in your workspace.' };
  }
  const currentCaption = existing.description || existing.contentData?.text || '';
  const title = existing.title || existing.type || 'post';
  const currentPost = summarizeContentForTool(existing);
  if (name === 'reschedule_post') {
    const when = parseLocalDateTime(String(args?.scheduledLocal || ''));
    if (!when) return { error: 'What new date and time should I move it to?' };
    const now = parseLocalDateTime(localNow || '') || new Date();
    if (when.getTime() <= now.getTime() + 60 * 1000) {
      return { error: `${when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} is in the past — please pick a future time.` };
    }
    return {
      intro: 'Review this reschedule and confirm:',
      card: {
        action: 'reschedule_post', contentId, title, post: currentPost,
        current: { scheduledAt: existing.scheduledAt ? new Date(existing.scheduledAt).toISOString() : null },
        proposed: { scheduledLocal: String(args?.scheduledLocal) },
        status: 'idle',
      },
    };
  }
  if (name === 'cancel_scheduled_post') {
    return {
      intro: 'Confirm cancelling this scheduled post:',
      card: {
        action: 'cancel_scheduled_post', contentId, title, post: currentPost,
        current: { status: existing.status, scheduledAt: existing.scheduledAt ? new Date(existing.scheduledAt).toISOString() : null },
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
        action: 'update_post_caption', contentId, title, post: currentPost,
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
        action: 'delete_post', contentId, title, post: currentPost,
        current: { status: existing.status },
        proposed: { deleted: true },
        status: 'idle',
      },
    };
  }
  if (name === 'duplicate_post') {
    const asType = String(args?.asType || '').trim();
    const newType = ['post', 'reel', 'story'].includes(asType) ? asType : (existing.type || 'post');
    return {
      intro: 'Confirm duplicating this post as a new draft:',
      card: {
        action: 'duplicate_post', contentId, title, post: currentPost,
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
  localNow?: string,
): Promise<{ ok: boolean; message: string }> {
  if (!workspaceId) return { ok: false, message: 'No workspace in context.' };
  const contentId = String(args?.contentId || '').trim();
  if (!contentId) return { ok: false, message: 'No contentId provided.' };
  try {
    // Ownership check: the target must belong to THIS workspace.
    const existing: any = await storage.getContent(contentId).catch(() => undefined);
    if (!existing || String(existing.workspaceId) !== String(workspaceId)) {
      return { ok: false, message: 'That post was not found in your workspace.' };
    }

    if (name === 'reschedule_post') {
      const when = parseLocalDateTime(String(args?.scheduledLocal || ''));
      if (!when) return { ok: false, message: 'I need a valid new date and time to reschedule.' };
      const now = parseLocalDateTime(localNow || '') || new Date();
      if (when.getTime() <= now.getTime() + 60 * 1000) {
        return { ok: false, message: `${when.toLocaleString()} is in the past — please pick a future time.` };
      }
      await storage.updateContent(contentId, { status: 'scheduled', scheduledAt: when } as any);
      return { ok: true, message: `Rescheduled to ${when.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}.` };
    }
    if (name === 'cancel_scheduled_post') {
      await storage.updateContent(contentId, { status: 'draft', scheduledAt: null } as any);
      return { ok: true, message: 'Cancelled — the post is now an unscheduled draft and will not publish.' };
    }
    if (name === 'update_post_caption') {
      const caption = String(args?.caption || '').trim();
      if (!caption) return { ok: false, message: 'I need the new caption text.' };
      const contentData = { ...(existing.contentData || {}), text: caption };
      await storage.updateContent(contentId, { description: caption, contentData } as any);
      return { ok: true, message: 'Caption updated.' };
    }
    if (name === 'delete_post') {
      await storage.deleteContent(contentId);
      return { ok: true, message: 'Deleted — the post has been permanently removed from your workspace.' };
    }
    if (name === 'duplicate_post') {
      const asType = String(args?.asType || '').trim();
      const newType = ['post', 'reel', 'story'].includes(asType) ? asType : (existing.type || 'post');
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
      return { ok: true, message: `Duplicated as a new ${newType} draft${newId ? '' : ''}. You can edit or schedule it whenever you like.` };
    }
    return { ok: false, message: `Unknown edit action: ${name}.` };
  } catch (err: any) {
    return { ok: false, message: `Could not complete that change: ${err?.message || 'unknown error'}.` };
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
  ctx: { userId?: string; workspaceId?: string },
  prefs: FullPreferences,
  mediaUrls: string[] = [],
  onStatus?: (status: string) => void,
  /** Aborts the metered generation (and refunds it) when the user cancels. */
  signal?: AbortSignal,
): Promise<{ card?: any; summaryText: string }> {
  const userId = ctx.userId;
  const workspaceId = ctx.workspaceId;
  try {
    if (toolName === 'generate_caption') {
      const topic = String(args?.topic || '').trim() || 'social media post';
      const count = Math.max(1, Math.min(Number(args?.count) || 3, 3));
      const postType = ['post', 'reel', 'story'].includes(String(args?.postType)) ? String(args?.postType) as any : 'post';
      // If the user attached media this turn, ground the caption in what the
      // image/video actually shows (image understanding in the post flow).
      let mediaAnalysis: string | undefined;
      if (mediaUrls.length) {
        try {
          const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(mediaUrls[0]);
          const desc = await withAIFeature('veegpt.media_analysis', { userId, workspaceId }, () =>
            aiServiceManager.analyzeMedia(mediaUrls[0], isVideo ? 'video' : 'image', prefs));
          if (desc) mediaAnalysis = `Visual analysis: ${desc}`;
        } catch { /* best-effort */ }
      }
      const { result: options, settlement } = await aiCreditMeteringService.runMetered(
        'captionGeneration',
        'veegpt.post_caption',
        { userId: userId || '', workspaceId },
        async (opSignal?: AbortSignal) => {
          const variations = await aiServiceManager.generateInstagramCaptions({
            userId: userId || '', workspaceId: workspaceId || userId || '',
            topic, mediaAnalysis, postType, platform: 'Instagram', preferences: prefs,
            singleVariation: count === 1, signal: opSignal,
          });
          const generatedOptions = (variations || [])
            .slice(0, count)
            .map((variation: any) => String(variation?.caption || '').replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, '').trim())
            .filter(Boolean);
          if (!generatedOptions.length) throw new Error('AI returned no usable captions');
          return generatedOptions;
        },
        0,
        signal,
      );
      return {
        card: { kind: 'captions', title: count > 1 ? 'Caption options' : 'Caption', options, creditsUsed: settlement.charged, remainingCredits: settlement.remaining },
        summaryText: count > 1 ? `Here are ${options.length} caption options — tap to copy:` : 'Here\u2019s a caption — tap to copy:',
      };
    }

    if (toolName === 'generate_hashtags') {
      const topic = String(args?.topic || '').trim() || 'social media post';
      const count = Math.max(5, Math.min(Number(args?.count) || 12, 30));
      const htPrompt =
        `Generate ${count} relevant, high-quality Instagram hashtags for: "${topic}". ` +
        'Mix popular and niche tags for discoverability. ' +
        'Return ONLY a JSON array of strings WITHOUT the # symbol, e.g. ["travel","sunset"].';
      const { result: hashtags, settlement } = await aiCreditMeteringService.runMetered(
        'hashtagGeneration',
        'veegpt.post_hashtags',
        { userId: userId || '', workspaceId },
        async (opSignal?: AbortSignal) => {
          const htResult = await aiServiceManager.generateJSON(
            htPrompt,
            { ...prefs, responseLength: 'short', creativityLevel: 0.4 },
            { signal: opSignal },
          );
          const arr = Array.isArray(htResult)
            ? htResult
            : (Array.isArray((htResult as any)?.hashtags) ? (htResult as any).hashtags : []);
          const normalized = Array.from(
            new Set(arr.map((hashtag: any) => String(hashtag).replace(/^#+/, '').trim()).filter(Boolean)),
          ).slice(0, count) as string[];
          if (!normalized.length) throw new Error('AI returned no usable hashtags');
          return normalized;
        },
        0,
        signal,
      );
      return {
        card: { kind: 'hashtags', title: 'Suggested hashtags', hashtags, creditsUsed: settlement.charged, remainingCredits: settlement.remaining },
        summaryText: `Here are ${hashtags.length} hashtags for "${topic}" — tap to copy:`,
      };
    }

    if (toolName === 'get_analytics_insight') {
      if (!workspaceId) return { summaryText: 'I need a workspace to analyze your performance.' };
      const kind = String(args?.kind || 'recommendations');
      const { buildRecommendationsData, buildBannerData } = await import('../services/InsightsDataService');
      if (kind === 'insight') {
        const { data } = await buildBannerData(workspaceId, 'month', null);
        const insight = await withAIFeature('growth.insight', { userId, workspaceId }, () =>
          aiServiceManager.generateAnalyticsInsight(data, prefs, signal));
        return {
          card: { kind: 'insight', title: insight.title || 'Performance insight', emoji: insight.emoji, headline: insight.headline, tip: insight.tip },
          summaryText: `${insight.emoji || '📊'} ${insight.headline}`,
        };
      }
      const { data } = await buildRecommendationsData(workspaceId);
      const recommendations = await withAIFeature('growth.recommendations', { userId, workspaceId }, () =>
        aiServiceManager.generateGrowthRecommendations(data, prefs, signal));
      if (!recommendations?.length) return { summaryText: 'I don\u2019t have enough data yet to give solid recommendations — keep posting and I\u2019ll learn what works.' };
      return {
        card: { kind: 'recommendations', title: 'Growth recommendations', recommendations },
        summaryText: `Here are ${recommendations.length} prioritized ways to grow, based on your real data:`,
      };
    }

    if (toolName === 'get_best_posting_time') {
      if (!workspaceId) return { summaryText: 'I need a connected account to work out your best posting time.' };
      const { getSmartBestTime } = await import('../services/bestTimeService');
      const smart = await getSmartBestTime(workspaceId);
      if (!smart?.bestSlot) {
        return { summaryText: 'I\u2019m still gathering engagement signals from your posts to find your best posting time. Keep posting consistently and check back soon.' };
      }
      const accts = (await storage.getSocialAccountsByWorkspace(workspaceId).catch(() => [])) || [];
      const account = (accts as any[]).find((a) => a.platform === 'instagram')?.username;
      const daily = smart.dailyBest
        .filter((d) => d.dayScore > 0)
        .map((d) => ({ day_name: d.dayName, best_hour: d.hour, is_peak: d.dow === smart.bestDay?.dow }));
      const bestSlot = smart.bestSlot;
      return {
        card: {
          kind: 'best_time', title: 'Best time to post',
          bestLabel: bestSlot.hourLabel, windowLabel: `${bestSlot.hourLabel} on ${bestSlot.dayName}`,
          day: bestSlot.dayName, status: smart.summary, account, daily,
        },
        summaryText: `Your best time to post is ${bestSlot.dayName} at ${bestSlot.hourLabel} (${smart.confidenceLevel.toLowerCase()} confidence).`,
      };
    }

    if (toolName === 'research_trends' || toolName === 'search_web') {
      let query = String(args?.query || '').trim();
      if (!query) return { summaryText: 'What topic or niche should I look up?' };
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
          const refersOwnNiche = /\b(my|our)\s+(niche|industry|space|field|audience)\b/i.test(query);
          if (niche && !query.toLowerCase().includes(niche.toLowerCase()) && (toolName === 'research_trends' || refersOwnNiche)) {
            query = `${query} — focused on the ${niche} niche`;
          }
        }
      } catch { /* non-fatal — fall back to the model's query */ }
      const { research, isResearchConfigured } = await import('../services/research/webResearch.service');
      if (!isResearchConfigured()) {
        return { summaryText: 'Live web research isn\u2019t available right now (no search/extraction provider is configured).' };
      }
      const mode = toolName === 'research_trends'
        ? 'trends'
        : (String((args as any)?.mode) === 'competitors' ? 'competitors' : 'search');
      const result = await research(query, { mode: mode as any, preferences: prefs, userId, workspaceId, onStatus, signal });
      if (!result.answer && !result.sources.length) {
        return { summaryText: 'I couldn\u2019t find anything solid on that right now — try rephrasing or again shortly.' };
      }
      const citations = result.sources.map((s) => ({ title: s.title, url: s.url, domain: s.domain, date: s.date }));
      // The prose ANSWER streams as normal message text (reveal loop) for a
      // natural typing feel; the card carries only the structured extras
      // (trends, key points, sources) so it doesn't duplicate the prose.
      return {
        card: {
          kind: 'research',
          title: (mode === 'trends' ? 'Trends: ' : 'Research: ') + query.slice(0, 60),
          keyPoints: result.keyPoints,
          trends: result.trends,
          citations,
        },
        summaryText: result.answer || (mode === 'trends' ? 'Here\u2019s what\u2019s trending right now:' : 'Here\u2019s what I found:'),
      };
    }

    if (toolName === 'deep_research') {
      const query = String(args?.query || '').trim();
      if (!query) return { summaryText: 'What should I run deep research on?' };
      const { deepResearch, isResearchConfigured } = await import('../services/research/webResearch.service');
      if (!isResearchConfigured()) {
        return { summaryText: 'Deep research isn\u2019t available right now (no search/extraction provider is configured).' };
      }
      const report = await deepResearch(query, { preferences: prefs, userId, workspaceId, onStatus, signal });
      if (!report.executiveSummary && !report.sources.length) {
        return { summaryText: 'I couldn\u2019t complete the deep research right now — try again shortly.' };
      }
      const citations = report.sources.map((s) => ({ title: s.title, url: s.url, domain: s.domain, date: s.date }));
      // Stream the executive summary as normal message text; the card keeps the
      // structured sections (findings, trends, opportunities, risks, sources).
      return {
        card: {
          kind: 'deep_research',
          title: `Research report: ${query.slice(0, 60)}`,
          keyFindings: report.keyFindings,
          trends: report.trends,
          opportunities: report.opportunities,
          risks: report.risks,
          citations,
        },
        summaryText: report.executiveSummary || 'Here\u2019s your research report:',
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
    const rl = /429|quota|rate.?limit|too many requests/i.test(String(err?.message || ''));
    return { summaryText: rl
      ? 'I\u2019m getting rate-limited by the AI provider right now — please try again in a minute.'
      : `I couldn\u2019t complete that just now: ${err?.message || 'unknown error'}.` };
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
  const entries: Array<[string, number]> = map instanceof Map
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
async function getPlanAnalyticsInfo(userId?: string): Promise<PlanAnalyticsInfo> {
  const FREE: PlanAnalyticsInfo = { capDays: 30, audienceInsights: false, contentPerformance: false, crossPlatform: false };
  if (!userId) return FREE;
  try {
    const { getEntitlementService } = await import('../features/subscription/services/EntitlementService');
    const { getRedisClient } = await import('../lib/redis');
    const SubscriptionRepository = (await import('../features/subscription/db/repositories/SubscriptionRepository')).default;
    const svc = getEntitlementService(getRedisClient(), new SubscriptionRepository());
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
function resolveTimeframe(args: Record<string, unknown>, capDays: number): Timeframe {
  const presets: Record<string, number> = { today: 1, '7d': 7, '30d': 30, '90d': 90, '6m': 180, '1y': 365 };
  let requestedDays: number;
  const daysArg = Number(args?.days);
  if (Number.isFinite(daysArg) && daysArg > 0) {
    requestedDays = Math.round(daysArg);
  } else {
    const tf = String(args?.timeframe || '30d');
    requestedDays = tf === 'all' ? (Number.isFinite(capDays) ? capDays : 730) : presets[tf] ?? 30;
  }
  const effectiveDays = Number.isFinite(capDays) ? Math.min(requestedDays, capDays) : requestedDays;
  const clamped = Number.isFinite(capDays) && requestedDays > capDays;
  const to = new Date();
  const from = new Date(to.getTime() - effectiveDays * DAY_MS);
  const label = effectiveDays === 1 ? 'today' : `last ${effectiveDays} days`;
  return { requestedDays, effectiveDays, clamped, capDays, from: from.toISOString(), to: to.toISOString(), label };
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
    [/new follower|gained|follower growth|grow/, ['new_followers', 'net_followers', 'follower_growth_rate']],
    [/lost follower|unfollow|churn/, ['lost_followers']],
    [/follower|audience size/, ['followers_total']],
    [/reach/, ['reach_total']],
    [/impression/, ['impressions_total']],
    [/engagement rate/, ['engagement_rate_by_impressions', 'engagement_rate_by_followers', 'engagement_rate_by_reach']],
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
  const raw = Array.isArray(args?.metrics) ? (args!.metrics as any[]).map((m) => String(m).toLowerCase().trim()).filter(Boolean) : [];
  const include = Array.isArray(args?.include) ? (args!.include as any[]).map((m) => String(m).toLowerCase()) : [];
  const wantAll = raw.length === 0 || raw.some((t) => t === 'all' || t === 'everything' || t === 'full' || t === 'overview' || t === 'report');

  const keys = new Set<string>();
  let wantAudience = include.includes('audience');
  let wantTopContent = include.includes('top_content') || include.includes('top content');
  let wantProfile = false;
  for (const term of raw) {
    if (/audience|demographic|country|countries|city|cities|gender|age|location/.test(term)) wantAudience = true;
    if (/top|best|performing|top post|top content/.test(term)) wantTopContent = true;
    if (/follower|following|posts?|profile|bio/.test(term)) wantProfile = true;
    for (const [re, ks] of ALIAS) if (re.test(term)) ks.forEach((k) => keys.add(k));
  }
  if (wantAll) { wantAudience = true; wantTopContent = true; wantProfile = true; }
  return { wantAll, keys, wantAudience, wantTopContent, wantProfile };
}

const num = (n: any) => (typeof n === 'number' && Number.isFinite(n));
/** Format a number compactly with locale separators. */
function fmt(v: number): string {
  return num(v) ? Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v);
}

/**
 * Pull dashboard-accurate metrics for the workspace's account. IMPORTANT: the
 * per-account `followersCount` field on the SocialAccount doc is often 0/stale —
 * the dashboard's real follower count comes from AnalyticsService (Instagram
 * follower snapshots + follower analytics). We use that same source here so
 * VeeGPT's numbers always match the dashboard. Never throws.
 */
async function fetchAccountMetrics(workspaceId: string, platform: string): Promise<AccountMetrics> {
  const m: AccountMetrics = {};
  try {
    const { analyticsService } = await import('../services/index');
    const [follow, perf] = await Promise.all([
      analyticsService.getFollowerAnalytics(workspaceId).catch(() => null),
      analyticsService.getPerformanceSummary(workspaceId, 30).catch(() => null),
    ]);
    const p = (platform || '').toLowerCase();
    if (follow) {
      m.followers = p === 'instagram'
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
      m.avgEngagement = perf.engagement || perf.overview?.avgEngagement || undefined;
      m.posts = perf.posts || undefined;
      m.audience = perf.audience
        ? { country: perf.audience.country, city: perf.audience.city, genderAge: perf.audience.genderAge, activeTime: perf.audience.activeTime }
        : undefined;
    }
  } catch (err: any) {
    vlog('generate:account-metrics-error', { workspaceId, error: err?.message });
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
  wantTopContent: boolean,
): Promise<{ kpis: any[]; topContent: any[] }> {
  try {
    const { legacyDashboardService, multiPlatformRollupStore } = await import('../features/analytics/bridge');
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
      topContent = (await multiPlatformRollupStore.getTopContent(readQuery).catch(() => [])) || [];
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
  args: Record<string, unknown>,
): Promise<string> {
  const workspaceId = scope?.workspaceId;
  if (!workspaceId) return 'No workspace/account context available.';

  const accounts: any[] = (await storage.getSocialAccountsByWorkspace(workspaceId).catch(() => [])) || [];
  if (!accounts.length) return 'The user has no social accounts connected in this workspace, so there is no account data to report.';

  const wantId = scope?.accountId ? String(scope.accountId) : '';
  const wantUser = typeof args?.username === 'string' ? String(args.username).replace(/^@+/, '').toLowerCase() : '';
  const idOf = (a: any) => String(a.id || a._id || a.accountId || '');
  // Resolve a SPECIFIC account by selected id, by named @handle, or when the
  // workspace has exactly one account. Otherwise we're in workspace/all-accounts
  // mode (no single account in focus).
  const acct =
    (wantId && accounts.find((a) => idOf(a) === wantId)) ||
    (wantUser && accounts.find((a) => String(a.username || '').toLowerCase() === wantUser)) ||
    (accounts.length === 1 ? accounts[0] : null) ||
    null;
  // The user named a handle we don't have connected.
  if (wantUser && !acct) {
    const list = accounts.map((a) => `@${a.username} (${a.platform})`).join(', ');
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
  const allPlatforms = [...new Set(accounts.map((a) => String(a.platform || 'instagram')))];
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
    workspaceId, account: acct ? acct.username : `ALL(${allPlatforms.join('+')})`, platform: platform || 'all',
    days: tf.effectiveDays, clamped: tf.clamped, cap: tf.capDays, wantAll: sel.wantAll, keys: [...sel.keys],
  });

  const scopeLabel = acct
    ? `@${acct.username} on ${platform}${acct.isVerified ? ' (verified)' : ''}`
    : platform
      ? `your ${platform} account(s)`
      : `your workspace — all connected accounts (${accounts.map((a) => `@${a.username} on ${a.platform}`).join(', ')})`;

  const L: string[] = [];
  L.push(`LIVE analytics for ${scopeLabel} — time window: ${tf.label} (${tf.from.slice(0, 10)} → ${tf.to.slice(0, 10)}).`);
  if (crossPlatformNote) L.push(`- NOTE: ${crossPlatformNote} Mention that upgrading unlocks combined cross-platform analytics.`);
  if (tf.clamped) {
    L.push(`- NOTE: the user's plan allows ${Number.isFinite(tf.capDays) ? tf.capDays + ' days' : 'unlimited'} of analytics history, so the range was capped to ${tf.effectiveDays} days. Mention this and that upgrading unlocks a longer history.`);
  }

  // ── Profile / follower totals (current, not window-bound) ──────────────────
  if (sel.wantProfile || sel.keys.has('followers_total')) {
    const followers = firstNum(profile.followers, acct?.followersCount);
    const suffix = !acct && !platform ? ' (all accounts combined)' : '';
    L.push(followers != null ? `- Followers (current)${suffix}: ${fmt(followers as number)}` : '- Followers: not available yet (account needs a sync)');
  }
  if (sel.wantProfile) {
    const line = [
      // Following/posts totals are per-account; only show for a single account.
      acct && fact('Following', firstNum(profile.followingCount, acct.followingCount)),
      fact('Total posts', firstNum(profile.posts, profile.mediaCount, acct?.mediaCount)),
    ].filter(Boolean) as string[];
    L.push(...line);
    if (acct?.biography && sel.wantAll) L.push(`- Bio: ${acct.biography}`);
  }
  // Follower growth for the window.
  if (sel.wantAll || sel.keys.has('new_followers') || sel.keys.has('net_followers') || sel.keys.has('follower_growth_rate') || sel.keys.has('lost_followers')) {
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
  const skipKeys = new Set(['followers_total', 'new_followers', 'lost_followers', 'net_followers', 'follower_growth_rate']);
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
      const chg = num(k.changePercent) ? ` (${k.changePercent > 0 ? '+' : ''}${k.changePercent}% vs previous ${tf.effectiveDays}d, trend ${k.trend})` : '';
      L.push(`- ${k.title}: ${val}${chg}`);
    }
  }

  // ── Audience demographics (Creator+ feature) ───────────────────────────────
  if (sel.wantAudience && !plan.audienceInsights) {
    L.push('- Audience demographics are a Creator+ feature — not available on the user\'s current plan. Mention that upgrading unlocks audience insights.');
  } else if (audienceAllowed) {
    const country = topAudience(profile.audience?.country ?? primary?.audienceCountry, 5);
    const city = topAudience(profile.audience?.city ?? primary?.audienceCity, 5);
    const genderAge = topAudience(profile.audience?.genderAge ?? primary?.audienceGenderAge, 6);
    if (country) L.push(`- Top audience countries: ${country}`);
    if (city) L.push(`- Top audience cities: ${city}`);
    if (genderAge) L.push(`- Audience gender/age: ${genderAge}`);
    if (!country && !city && !genderAge) L.push('- Audience demographics: not available yet for this account.');
  }

  // ── Top-performing content (Creator+ feature) ──────────────────────────────
  if (sel.wantTopContent && !plan.contentPerformance) {
    L.push('- Top-performing-content analytics are a Creator+ feature — not available on the user\'s current plan. Mention that upgrading unlocks it.');
  } else if (topContentAllowed && dash.topContent?.length) {
    L.push('Top-performing posts:');
    for (const t of dash.topContent.slice(0, 5)) {
      const bits = [
        t.metrics?.reach != null && `${fmt(t.metrics.reach)} reach`,
        t.metrics?.likes != null && `${fmt(t.metrics.likes)} likes`,
        t.metrics?.comments != null && `${fmt(t.metrics.comments)} comments`,
      ].filter(Boolean).join(', ');
      L.push(`- ${t.label || t.id}${bits ? ` — ${bits}` : t.value != null ? ` — ${fmt(t.value)}` : ''}`);
    }
  }

  if (primary?.lastSyncAt) L.push(`(Last synced: ${new Date(primary.lastSyncAt).toISOString().slice(0, 10)}.)`);
  return L.join('\n');
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
  /** Advanced VeeGPT options: the selected agent's persona directives and the
   *  selected social account scope (for on-demand get_account_details fetches). */
  advanced?: { agentDirectives?: string; accountScope?: AccountScope },
): Promise<void> {
  vlog('generate:start', { convId, historyLength: history.length, aiModel: preferences.aiModel, attachments: attachments.length, tools: tools?.length || 0, regenerate: !!regenerate });

  const aiMessage = regenerate
    ? await ChatMessage.findOne({ id: regenerate.messageId })
    : await ChatMessage.create({
        id: Date.now() % 1000000000 + Math.floor(Math.random() * 1000),
        conversationId: convId,
        role: 'assistant',
        content: ' ',
        tokensUsed: 0,
      });
  if (!aiMessage) {
    // The message to regenerate vanished — nothing to do.
    writeEvent(res, { type: 'error', error: 'Message not found', conversationId: convId });
    return;
  }
  vlog('generate:placeholder-created', { convId, messageId: aiMessage.id });

  writeEvent(res, { type: 'aiMessageStart', messageId: aiMessage.id, conversationId: convId });

  // Rotating "working" status shown ONLY while we genuinely wait for the model's
  // first token. It's cleared the instant real text streams. (The model doesn't
  // expose true reasoning steps over this API, so these are natural progress
  // phases — like most AI chat UIs use — not fabricated internal reasoning.)
  const statusSteps = [
    'Thinking…',
    'Understanding your request…',
    'Gathering ideas…',
    'Composing a response…',
    'Almost there…',
  ];
  let statusIndex = 0;
  writeEvent(res, { type: 'status', status: statusSteps[0], conversationId: convId });
  const statusInterval = setInterval(() => {
    statusIndex = Math.min(statusIndex + 1, statusSteps.length - 1);
    writeEvent(res, { type: 'status', status: statusSteps[statusIndex], conversationId: convId });
  }, 1200);

  let streamed = '';
  let streamErrMsg = '';
  // Cancels the upstream model request when the user stops — so we stop spending
  // tokens instead of letting the model finish generating in the background.
  const abortController = new AbortController();
  activeAbortControllers.set(convId, abortController);
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  try {
    const prompt = buildPrompt(history, preferences, memorySummary, userMemoryProfile, workspaceContext, memoryNote, advanced?.agentDirectives)
      + (toolContext && toolContext.trim() ? `\n\n${toolContext.trim()}` : '');
    vlog('generate:prompt-built', { convId, promptLength: prompt.length });

    let firstChunk = true;
    let chunkCount = 0;
    // Use the tool-aware stream ONLY when tools are provided AND there are no
    // attachments (the tool path is OpenAI/GitHub text chat; multimodal goes
    // through the Gemini-first generateTextStream). Otherwise behave exactly as
    // before — plain text streaming.
    const useTools = !!tools?.length && attachments.length === 0;
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
          const stream = aiServiceManager.generateChatStreamWithTools(prompt, tools!, preferences, abortController.signal);
          for await (const ev of stream) {
            if (!activeGenerations.get(convId)) { vlog('generate:stopped', { convId }); abortController.abort(); break; }
            if (ev.type === 'text') {
              if (firstChunk) { clearInterval(statusInterval); firstChunk = false; vlog('generate:first-chunk', { convId, messageId: aiMessage.id }); }
              chunkCount += 1;
              streamed += ev.delta;
              writeEvent(res, { type: 'chunk', content: streamed, messageId: aiMessage.id });
            } else if (ev.type === 'toolCall') {
              // Guard against the model emitting the SAME singleton tool twice
              // in one stream (e.g. two research calls) — keep only the first.
              // remember_fact is intentionally NOT a singleton — the model may save
              // several distinct durable facts in one turn.
              const SINGLETON = new Set(['get_workspace_data', 'get_account_details', 'get_analytics_insight', 'get_best_posting_time', 'research_trends', 'search_web', 'deep_research']);
              const already = SINGLETON.has(ev.name) && toolCalls.some((t) => t.name === ev.name);
              if (!already) { toolCalls.push({ name: ev.name, args: ev.args }); vlog('generate:tool-call', { convId, name: ev.name }); }
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
          const INFO_ONLY = new Set(['get_workspace_data', 'get_account_details', 'get_analytics_insight', 'get_best_posting_time', 'research_trends', 'search_web', 'deep_research']);
          const onlyInfoSingletons = toolCalls.length > 0 && toolCalls.every((t) => INFO_ONLY.has(t.name));
          let followUps = 0;
          while (!onlyInfoSingletons && toolCalls.length > 0 && followUps < 2 && activeGenerations.get(convId)) {
            const done = toolCalls.map((t) => `${t.name}(${JSON.stringify(t.args)})`).join('; ');
            const followPrompt = prompt +
              `\n\n[MULTI-STEP CHECK] You have ALREADY made these tool calls this turn: ${done}. ` +
              'Re-read the user\'s LAST message. If it requested MORE distinct actions that are NOT yet covered by the calls above, ' +
              'emit ONLY the additional tool call(s) now (no text, no repeats). ' +
              'If every requested action is already covered, respond with a single word: DONE.';
            let newCallsThisPass = 0;
            let followText = '';
            try {
              const fstream = aiServiceManager.generateChatStreamWithTools(followPrompt, tools!, preferences, abortController.signal);
              for await (const ev of fstream) {
                if (!activeGenerations.get(convId)) { abortController.abort(); break; }
                if (ev.type === 'text') {
                  followText += ev.delta;
                } else if (ev.type === 'toolCall') {
                  // Singleton tools (read-only research/data/insight) make sense
                  // only ONCE per turn — dedup by NAME so a follow-up pass can't
                  // add a second research/search card with reworded args. Action
                  // tools (edit/memory) still dedup by name+args so the model can
                  // act on multiple distinct posts.
                  const SINGLETON = new Set(['get_workspace_data', 'get_account_details', 'get_analytics_insight', 'get_best_posting_time', 'research_trends', 'search_web', 'deep_research']);
                  const dup = SINGLETON.has(ev.name)
                    ? toolCalls.some((t) => t.name === ev.name)
                    : toolCalls.some((t) => t.name === ev.name && JSON.stringify(t.args) === JSON.stringify(ev.args));
                  if (!dup) { toolCalls.push({ name: ev.name, args: ev.args }); newCallsThisPass += 1; vlog('generate:tool-call-followup', { convId, name: ev.name, pass: followUps + 1 }); }
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
          const chatStream = aiServiceManager.generateTextStream(prompt, preferences, attachments, abortController.signal);
          for await (const chunk of chatStream) {
            if (!activeGenerations.get(convId)) { vlog('generate:stopped', { convId }); abortController.abort(); break; }
            if (firstChunk) { clearInterval(statusInterval); firstChunk = false; vlog('generate:first-chunk', { convId, messageId: aiMessage.id }); }
            chunkCount += 1;
            streamed += chunk;
            // Cumulative text — client SETs (not appends), so duplicate frames are harmless.
            writeEvent(res, { type: 'chunk', content: streamed, messageId: aiMessage.id });
          }
        }
      });
      vlog('generate:stream-finished', { convId, chunkCount, streamedLength: streamed.length, toolCalls: toolCalls.length });
    } catch (streamErr: any) {
      vlog('generate:stream-error', { convId, error: streamErr?.message, streamedLength: streamed.length });
      streamErrMsg = streamErr?.message || '';
      console.error('[VEEGPT] Streaming failed, will fall back to non-streaming:', streamErr?.message);
    }

    // Fallback: if streaming produced no text AND no tool call, generate the
    // full reply at once. (A tool-call-only turn legitimately has empty text.)
    if (activeGenerations.get(convId) && !streamed.trim() && toolCalls.length === 0) {
      vlog('generate:fallback-start', { convId });
      try {
        const fullText = await withAIFeature('veegpt.chat', usageCtx, () => aiServiceManager.generateText(prompt, preferences));
        clearInterval(statusInterval);
        vlog('generate:fallback-text', { convId, textLength: (fullText || '').length });
        const tokens = (fullText || '').split(/(\s+)/);
        for (const token of tokens) {
          if (!activeGenerations.get(convId)) break;
          streamed += token;
          writeEvent(res, { type: 'chunk', content: streamed, messageId: aiMessage.id });
          await new Promise((r) => setTimeout(r, 15));
        }
      } catch (fallbackErr: any) {
        streamErrMsg = fallbackErr?.message || streamErrMsg;
        vlog('generate:fallback-error', { convId, error: fallbackErr?.message });
        console.error('[VEEGPT] Fallback generateText also failed:', fallbackErr?.message);
      }
    }

    clearInterval(statusInterval);

    // RECOVERY: a non-tool-capable fallback model sometimes writes the tool call
    // as TEXT (e.g. 'reschedule_post(contentId="...", scheduledLocal="...")')
    // instead of a real function call. Detect that pattern and convert it into a
    // proper toolCall so the right card is produced — and clear the leaked text.
    if (!toolCalls.length && streamed) {
      const recovered = recoverLeakedToolCalls(streamed);
      if (recovered.length) {
        toolCalls.push(...recovered);
        vlog('generate:recovered-tool-call', { convId, names: recovered.map((r) => r.name) });
        streamed = '';
      }
    }

    // ── Tool-status feedback (#10) ────────────────────────────────────────────
    // The info/data/edit tools can take a few seconds (analytics, web research).
    // Emit a human status so the chat shows "Researching trends…" instead of
    // sitting silent until the card appears.
    if (toolCalls.length && activeGenerations.get(convId)) {
      const TOOL_STATUS: Record<string, string> = {
        get_workspace_data: 'Checking your workspace…',
        reschedule_post: 'Preparing the reschedule…',
        cancel_scheduled_post: 'Preparing to cancel that post…',
        update_post_caption: 'Updating the caption…',
        delete_post: 'Preparing to delete that post…',
        duplicate_post: 'Duplicating the post…',
        generate_caption: 'Writing caption ideas…',
        generate_hashtags: 'Finding the best hashtags…',
        get_analytics_insight: 'Analyzing your performance…',
        get_best_posting_time: 'Working out your best time to post…',
        research_trends: 'Researching current trends…',
        search_web: 'Searching the web…',
        deep_research: 'Starting deep research…',
        schedule_post: 'Preparing your post…',
      };
      const first = toolCalls.find((t) => TOOL_STATUS[t.name]);
      if (first) writeEvent(res, { type: 'status', status: TOOL_STATUS[first.name], conversationId: convId });
    }

    // ── RELIABLE MEMORY (tool-only, never misses) ─────────────────────────────
    // A single-pass model often just answers and never emits remember_fact —
    // especially deep in an agent persona or when other tools are competing. So
    // when long-term memory is on and the model did NOT already act on memory
    // this turn, run ONE focused pass that offers ONLY the memory tools. With no
    // other tool or persona pulling on it, the model reliably calls remember_fact
    // for any durable fact. It's still the TOOL doing the saving (handled below),
    // just given a clean, dedicated turn — no separate heuristic extractor.
    const memHandledInline = toolCalls.some((t) => ['remember_fact', 'update_memory', 'forget_memory'].includes(t.name));
    if (memorySave?.userId && memorySave?.workspaceId && !memHandledInline && activeGenerations.get(convId)) {
      try {
        const lastUser = [...history].reverse().find((h) => h.role === 'user')?.content?.trim() || '';
        if (lastUser) {
          const memPrompt =
            'You maintain a long-term memory about a user across all their chats with VeeGPT (a social-media assistant).\n' +
            (userMemoryProfile && userMemoryProfile.trim() ? `Things you ALREADY remember (do NOT save these again):\n${userMemoryProfile.trim()}\n\n` : '') +
            `The user's latest message was:\n"""${lastUser}"""\n\n` +
            'Decide what (if anything) to remember from THIS message:\n' +
            '- If it states a DURABLE fact about the user or their brand/business (name, brand, niche, product/app they built, target audience, goals, ongoing projects, posting schedule, tone/style, dos & don\'ts, locations, or any stable preference), call remember_fact ONCE FOR EACH distinct fact (third person, concise).\n' +
            '- If they explicitly asked you to remember/note something, save exactly that.\n' +
            '- If a new detail REPLACES an existing remembered fact on the same topic, call update_memory with that fact\'s id.\n' +
            '- Do NOT save transient chit-chat, greetings, pure questions, or one-off task requests (e.g. "schedule this post"), and do NOT re-save anything already remembered.\n' +
            'Respond with ONLY the tool call(s), or the single word NONE if there is nothing durable to save.';
          await withAIFeature('veegpt.memory_update', usageCtx, async () => {
            const memStream = aiServiceManager.generateChatStreamWithTools(memPrompt, VEEGPT_MEMORY_TOOLS_ALL, preferences, abortController.signal);
            for await (const ev of memStream) {
              if (!activeGenerations.get(convId)) break;
              if (ev.type === 'toolCall' && ['remember_fact', 'update_memory', 'forget_memory'].includes(ev.name)) {
                const dup = toolCalls.some((t) => t.name === ev.name && JSON.stringify(t.args) === JSON.stringify(ev.args));
                if (!dup) { toolCalls.push({ name: ev.name, args: ev.args }); vlog('generate:memory-pass-call', { convId, name: ev.name }); }
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
    const editCalls = toolCalls.filter((t) => ['reschedule_post', 'cancel_scheduled_post', 'update_post_caption', 'delete_post', 'duplicate_post'].includes(t.name));
    const infoCalls = toolCalls.filter((t) => ['generate_caption', 'generate_hashtags', 'get_analytics_insight', 'get_best_posting_time', 'research_trends', 'search_web', 'deep_research'].includes(t.name));
    const dataCall = toolCalls.find((t) => t.name === 'get_workspace_data');
    const introLines: string[] = [];

    // ── SELECTED-ACCOUNT on-demand data → grounded synthesis ──────────────────
    // The model decided this question needs the selected account's real data, so
    // we fetch it now (from the Redis snapshot) and run a second, grounded pass
    // that answers the user's question using ONLY those live numbers. This is how
    // the account's heavy data stays OUT of every prompt yet is available the
    // moment a question actually needs it.
    const accountCall = toolCalls.find((t) => t.name === 'get_account_details');
    if (accountCall && activeGenerations.get(convId)) {
      writeEvent(res, { type: 'status', status: 'Reading your account data…', conversationId: convId });
      const dataText = await buildAccountDataText(advanced?.accountScope, accountCall.args);
      vlog('generate:account-synthesis', { convId, hasData: !!dataText });
      const synthPrompt =
        prompt +
        `\n\n--- Selected account — LIVE data fetched from the database for THIS question ---\n${dataText}\n\n` +
        '[CRITICAL: Answer the user\'s LAST message using ONLY the numbers in the data block above. ' +
        'Report each figure EXACTLY as written — do not round, scale, estimate, combine, or invent any number. ' +
        'If a specific value is "not available" or absent from the block above, say it isn\'t available yet (suggest syncing/reconnecting the account) — NEVER make up a number. ' +
        'Be specific and conversational, and add one useful takeaway.]';
      try {
        await withAIFeature('veegpt.chat', usageCtx, async () => {
          const synth = aiServiceManager.generateTextStream(synthPrompt, preferences, [], abortController.signal);
          let synthFirst = true;
          for await (const chunk of synth) {
            if (!activeGenerations.get(convId)) break;
            if (synthFirst) { clearInterval(statusInterval); synthFirst = false; }
            streamed += chunk;
            writeEvent(res, { type: 'chunk', content: streamed, messageId: aiMessage.id });
          }
        });
      } catch (synthErr: any) {
        vlog('generate:account-synthesis-error', { convId, error: synthErr?.message });
        if (!streamed.trim()) introLines.push(dataText);
      }
    }

    if (dataCall && activeGenerations.get(convId)) {
      const built = await buildDataResult(wsId, dataCall.args);
      vlog('generate:tool-data', { convId, resource: (dataCall.args as any)?.resource, count: built.items?.length || 0 });
      if (built.listCard) {
        listCardForDb = built.listCard;
        writeEvent(res, { type: 'listCard', listCard: listCardForDb, messageId: aiMessage.id, conversationId: convId });
      }
      introLines.push(built.summaryText);
    }

    if (editCalls.length && activeGenerations.get(convId)) {
      for (const call of editCalls) {
        const built = await buildEditCard(wsId, call.name, call.args, toolLocalNow);
        if (built.error) {
          introLines.push(built.error);
        } else if (built.card) {
          const cardWithId = { id: `${aiMessage.id}_${editCardsForDb.length}`, ...built.card };
          editCardsForDb.push(cardWithId);
          writeEvent(res, { type: 'editCard', editCard: cardWithId, messageId: aiMessage.id, conversationId: convId });
          vlog('generate:edit-card', { convId, action: call.name });
        }
      }
      if (editCardsForDb.length && !introLines.some((l) => /review|confirm/i.test(l))) {
        introLines.push(editCardsForDb.length > 1
          ? `I\u2019ve prepared ${editCardsForDb.length} changes — review and confirm each below:`
          : 'Review this change and confirm below:');
      }
    }

    // ── Info/assist tools (caption/hashtag/insight/best-time/trends) ──────────
    // Non-mutating tools that produce an INFO CARD. Each is independent so a
    // multi-tool turn (e.g. caption + hashtags) renders multiple cards.
    if (infoCalls.length && activeGenerations.get(convId)) {
      for (const call of infoCalls) {
        const onStatus = (status: string) => {
          if (activeGenerations.get(convId)) writeEvent(res, { type: 'status', status, conversationId: convId });
        };
        const built = await buildInfoCard(call.name, call.args, { userId: usageCtx?.userId || memorySave?.userId, workspaceId: wsId }, preferences, toolMediaUrls, onStatus, abortController.signal);
        if (built.card) {
          const cardWithId = { id: `${aiMessage.id}_info_${infoCardsForDb.length}`, ...built.card };
          infoCardsForDb.push(cardWithId);
          writeEvent(res, { type: 'infoCard', infoCard: cardWithId, messageId: aiMessage.id, conversationId: convId });
          vlog('generate:info-card', { convId, tool: call.name, kind: built.card.kind });
        }
        if (built.summaryText) introLines.push(built.summaryText);
      }
    }

    // Emit the combined intro text (for data/edit/info turns) so it lands with cards.
    if ((dataCall || editCalls.length || infoCalls.length) && introLines.length && !streamed.trim()) {
      streamed = introLines.join(' ');
      writeEvent(res, { type: 'chunk', content: streamed, messageId: aiMessage.id });
    }

    // If the model emitted a schedule_post tool call, validate it and surface a
    // confirm card (the LLM decided to post — no regex/triage needed). All the
    // guards the legacy post-agent applied now live here on the single path:
    //   • no media → ask for it in text (no card)
    //   • scheduling with no time / a past time → ask for a valid time (no card)
    //   • a proactive growth suggestion is appended to the reply
    let postCardPlan: any = null;
    const scheduleCall = toolCalls.find((t) => t.name === 'schedule_post');
    if (scheduleCall) {
      const hasMedia = toolMediaUrls.length > 0;
      const plan = normalizeSchedulePlan(scheduleCall.args);
      // Defensive scrub: the model sometimes adds the user's OWN connected
      // account as a mention/hashtag, or invents hashtags. Strip any mention or
      // hashtag that matches a connected account username so we never tag the
      // user's own handle without them asking.
      const ownHandles = new Set(
        (toolAccountUsernames || []).map((u) => String(u || '').replace(/^@+/, '').toLowerCase()).filter(Boolean),
      );
      if (ownHandles.size) {
        plan.mentions = (plan.mentions || []).filter((m: string) => !ownHandles.has(String(m).replace(/^@+/, '').toLowerCase()));
        plan.hashtags = (plan.hashtags || []).filter((h: string) => !ownHandles.has(String(h).replace(/^[#@]+/, '').toLowerCase()));
      }
      const timeIssue = validateSchedulePlan(plan, toolLocalNow);

      if (!hasMedia) {
        vlog('generate:tool-no-media', { convId, messageId: aiMessage.id });
        if (!streamed.trim()) {
          streamed = 'Sure — please attach the image or video you\u2019d like to post, and tell me when to publish it (now or a specific date and time).';
          writeEvent(res, { type: 'chunk', content: streamed, messageId: aiMessage.id });
        }
      } else if (timeIssue) {
        // Scheduling requested but no concrete/valid time → ask, don't card.
        vlog('generate:tool-needs-time', { convId, scheduledLocal: plan.scheduledLocal });
        if (!streamed.trim()) {
          streamed = timeIssue;
          writeEvent(res, { type: 'chunk', content: streamed, messageId: aiMessage.id });
        }
      } else {
        // Good to confirm. Bake the uploaded media URLs into the card so confirm
        // has everything it needs.
        postCardPlan = plan;
        const suggestion = typeof (scheduleCall.args as any)?.suggestion === 'string' ? (scheduleCall.args as any).suggestion.trim() : '';
        if (suggestion) {
          const base = streamed.trim() || (plan.summary ? plan.summary.trim() : '');
          streamed = `${base ? base + '\n\n' : ''}💡 ${suggestion} Just say the word and I'll update it before you confirm.`;
          writeEvent(res, { type: 'chunk', content: streamed, messageId: aiMessage.id });
        }
        writeEvent(res, { type: 'toolCall', name: 'schedule_post', plan: postCardPlan, mediaUrls: toolMediaUrls, messageId: aiMessage.id, conversationId: convId });
        vlog('generate:tool-emitted', { convId, messageId: aiMessage.id, schedule: !!postCardPlan?.schedule, media: toolMediaUrls.length });
      }
    }

    // remember_fact tool: the model spotted a durable fact while writing its
    // reply — save it WITHOUT any extra LLM call (the fact is already extracted
    // in the tool args). This folds memory detection into the single chat call,
    // replacing the previous per-message saveMemoryViaLLM extraction.
    type RememberStatus = 'saved' | 'duplicate' | 'skipped' | 'full' | 'updated';
    let rememberStatus: RememberStatus | null = null;
    let rememberedFact = '';
    const rememberCalls = toolCalls.filter((t) => t.name === 'remember_fact');
    if (rememberCalls.length && memorySave?.userId && memorySave?.workspaceId) {
      const savedFacts: string[] = [];
      let anyDuplicate = false;
      let anyFull = false;
      // De-dupe identical fact strings the model may have emitted twice in one turn.
      const seen = new Set<string>();
      for (const call of rememberCalls) {
        const fact = typeof (call.args as any)?.fact === 'string' ? (call.args as any).fact.trim() : '';
        if (!fact) continue;
        const key = fact.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const r = await saveMemoryFact(memorySave.userId, memorySave.workspaceId, fact);
        vlog('generate:tool-remember', { convId, status: r.status, fact: r.fact });
        // 'saved' (new) and 'updated' (replaced an existing on the same topic) both
        // mean the fact is now stored.
        if (r.status === 'saved' || r.status === 'updated') savedFacts.push(r.fact || fact);
        else if (r.status === 'duplicate') anyDuplicate = true;
        else if (r.status === 'full') anyFull = true;
      }
      // Summarize for the acknowledgment line below (prefer "saved" over the rest).
      // The `as` keeps the wide union so downstream status comparisons stay valid.
      rememberStatus = (savedFacts.length ? 'saved' : anyFull ? 'full' : anyDuplicate ? 'duplicate' : null) as RememberStatus | null;
      if (savedFacts.length) rememberedFact = savedFacts.join('; ');
    }

    // update_memory / forget_memory: the user changed or retracted a stored fact.
    // These keep memory clean (one fact per topic) instead of piling duplicates.
    // We collect results and render ONE concise summary at the end (a per-fact
    // line dump is unreadable when many facts are removed at once).
    const updatedFacts: string[] = [];
    const forgottenFacts: string[] = [];
    let updateNotFound = 0;
    for (const call of toolCalls.filter((t) => t.name === 'update_memory')) {
      if (!memorySave?.userId || !memorySave?.workspaceId) break;
      const id = String((call.args as any)?.id || '');
      const fact = String((call.args as any)?.fact || '');
      const r = await updateMemoryFact(memorySave.userId, memorySave.workspaceId, id, fact);
      vlog('generate:tool-update-memory', { convId, status: r.status, id });
      if (r.status === 'updated' && r.fact) updatedFacts.push(r.fact);
      else if (r.status === 'notfound') updateNotFound += 1;
    }
    for (const call of toolCalls.filter((t) => t.name === 'forget_memory')) {
      if (!memorySave?.userId || !memorySave?.workspaceId) break;
      const id = String((call.args as any)?.id || '');
      const r = await forgetMemoryFact(memorySave.userId, memorySave.workspaceId, id);
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
      memoryNotes.push(`✏️ Updated ${updatedFacts.length} facts in your memory.`);
    }
    if (updateNotFound > 0 && updatedFacts.length === 0) {
      memoryNotes.push('I couldn\u2019t find that earlier note to update, so nothing changed.');
    }
    if (forgottenFacts.length === 1) {
      const f = forgottenFacts[0];
      memoryNotes.push(f ? `🗑️ Done — I\u2019ve forgotten that: "${f}".` : '🗑️ Done — I\u2019ve forgotten that.');
    } else if (forgottenFacts.length > 1) {
      const named = forgottenFacts.filter(Boolean);
      let line = `🗑️ Cleaned up your memory — removed ${forgottenFacts.length} facts.`;
      if (named.length) {
        const examples = named.slice(0, MAX_LISTED).map((f) => `• ${f}`);
        const more = named.length > MAX_LISTED ? `\n…and ${named.length - MAX_LISTED} more.` : '';
        line += `\n\n${examples.join('\n')}${more}`;
      }
      memoryNotes.push(line);
    }
    if (memoryNotes.length && activeGenerations.get(convId)) {
      streamed = `${streamed.trim() ? streamed.trim() + '\n\n' : ''}${memoryNotes.join('\n\n')}`;
      writeEvent(res, { type: 'chunk', content: streamed, messageId: aiMessage.id });
    }

    // If memory was saved alongside OTHER actions (cards already carry the rest),
    // append a short memory acknowledgment so the user knows it was remembered —
    // the no-text fallback below won't run because `streamed` is already set.
    if (rememberStatus && rememberStatus !== 'skipped' && (postCardPlan || editCardsForDb.length || listCardForDb) && activeGenerations.get(convId)) {
      const memLine = rememberStatus === 'saved'
        ? `\n\n🧠 Noted — I\u2019ll remember that${rememberedFact ? `: ${rememberedFact}` : ''}.`
        : rememberStatus === 'updated'
        ? `\n\n✏️ Updated that${rememberedFact ? ` — ${rememberedFact}` : ''}.`
        : rememberStatus === 'full'
        ? `\n\n⚠️ I couldn\u2019t save that — your VeeGPT memory is full. Remove a few facts in Settings → AI Configuration to make room.`
        : `\n\n🧠 I\u2019ve already got that noted${rememberedFact ? `: ${rememberedFact}` : ''}.`;
      streamed = `${streamed.trim()}${memLine}`;
      writeEvent(res, { type: 'chunk', content: streamed, messageId: aiMessage.id });
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
        if (rememberStatus === 'saved') fbPrompt += `\n\n[You just saved this NEW fact to long-term memory: "${rememberedFact}". Briefly acknowledge you'll remember it. Do NOT say it was already saved.]`;
        else if (rememberStatus === 'updated') fbPrompt += `\n\n[You just UPDATED an existing fact on this topic to: "${rememberedFact}" (it replaced the old value — no duplicate was created). Briefly confirm you've updated it.]`;
        else if (rememberStatus === 'duplicate') fbPrompt += `\n\n[This fact was ALREADY in long-term memory: "${rememberedFact}". Tell the user you already have it noted — do not act surprised or re-save it.]`;
        else if (rememberStatus === 'full') fbPrompt += `\n\n[You could NOT save this fact because the user's long-term memory is FULL. Tell them their VeeGPT memory storage is full and they should remove a few facts in Settings → AI Configuration to make room, then you can remember new things.]`;
        const fullText = await withAIFeature('veegpt.chat', usageCtx, () => aiServiceManager.generateText(fbPrompt, preferences));
        const tokens = (fullText || '').split(/(\s+)/);
        for (const token of tokens) {
          if (!activeGenerations.get(convId)) break;
          streamed += token;
          writeEvent(res, { type: 'chunk', content: streamed, messageId: aiMessage.id });
          await new Promise((r) => setTimeout(r, 12));
        }
      } catch (fbErr: any) {
        vlog('generate:tool-only-fallback-error', { convId, error: fbErr?.message });
      }
    }

    // A tool-only turn has no assistant prose; give it a short confirming line
    // so the bubble isn't empty (the confirm card carries the detail).
    const isRateLimited = /429|quota|rate.?limit|too many requests|exceeded your current quota/i.test(streamErrMsg);
    const noProviderMsg = isRateLimited
      ? 'I\u2019m getting rate-limited by the AI provider right now (quota exceeded). Please try again in a minute — your request wasn\u2019t lost.'
      : 'I had trouble reaching the AI service just now. Please try again in a moment.';
    const rawPersisted = streamed.trim()
      || (postCardPlan ? (postCardPlan.summary || 'Here\u2019s your post — review and confirm below.')
        : editCardsForDb.length ? (editCardsForDb.length > 1 ? `I\u2019ve prepared ${editCardsForDb.length} changes — review and confirm each below:` : 'Review this change and confirm below:')
        : listCardForDb ? 'Here you go:'
        : rememberStatus === 'duplicate' ? `I\u2019ve already got that noted${rememberedFact ? ` — ${rememberedFact}` : ''}.`
        : rememberStatus === 'saved' ? `Got it — I\u2019ll remember that${rememberedFact ? `: ${rememberedFact}` : ''}.`
        : rememberStatus === 'updated' ? `Updated that${rememberedFact ? ` — ${rememberedFact}` : ''}.`
        : rememberStatus === 'full' ? `Your VeeGPT memory is full, so I couldn\u2019t save that. Remove a few facts in Settings \u2192 AI Configuration to make room.`
        : streamErrMsg ? noProviderMsg
        : 'I apologize, but I was unable to generate a response.');
    // Safety scrub: never persist/show leaked raw tool-call syntax. If stripping
    // empties the message (it was ONLY a leaked call), fall back to a safe line.
    let persisted = stripLeakedToolSyntax(rawPersisted);
    if (!persisted) {
      persisted = postCardPlan
        ? (postCardPlan.summary || 'Here\u2019s your post — review and confirm below.')
        : 'I apologize, but I had trouble completing that. Please try again in a moment.';
    }
    // If the scrub changed the text mid-stream, push the corrected version so the
    // client doesn't keep showing the leaked syntax it already received.
    if (persisted !== streamed.trim()) {
      writeEvent(res, { type: 'chunk', content: persisted, messageId: aiMessage.id });
    }
    const cardForDb = postCardPlan ? { plan: postCardPlan, mediaUrls: toolMediaUrls, status: 'idle' } : undefined;
    // If the user STOPPED this generation, the /stop endpoint owns the persisted
    // text (the exact partial the user saw). Skip our write entirely so we never
    // overwrite it with the model's full output, and don't emit complete (the
    // client connection is already gone).
    if (!activeGenerations.get(convId)) {
      vlog('generate:stopped-skip-persist', { convId, messageId: aiMessage.id });
      return;
    }
    vlog('generate:persisting', { convId, messageId: aiMessage.id, finalLength: persisted.length, regenerate: !!regenerate });
    let variantsForEvent: any = undefined;
    let activeVariantForEvent: number | undefined = undefined;
    if (regenerate) {
      // Append this fresh reply as a new variant; migrate the original reply to
      // variant 0 the first time. content/cards mirror the now-active variant.
      const prior = Array.isArray((aiMessage as any).variants) && (aiMessage as any).variants.length
        ? (aiMessage as any).variants.slice()
        : [{
            content: (aiMessage as any).content,
            postCard: (aiMessage as any).postCard,
            listCard: (aiMessage as any).listCard,
            editCards: (aiMessage as any).editCards,
            infoCards: (aiMessage as any).infoCards,
            createdAt: (aiMessage as any).createdAt,
          }];
      prior.push({ content: persisted, postCard: cardForDb, listCard: listCardForDb || undefined, editCards: editCardsForDb.length ? editCardsForDb : undefined, infoCards: infoCardsForDb.length ? infoCardsForDb : undefined, createdAt: new Date() });
      variantsForEvent = prior;
      activeVariantForEvent = prior.length - 1;
      await ChatMessage.updateOne(
        { id: aiMessage.id },
        { content: persisted, tokensUsed: Math.ceil(persisted.length / 4), postCard: cardForDb, listCard: listCardForDb || undefined, editCards: editCardsForDb.length ? editCardsForDb : undefined, infoCards: infoCardsForDb.length ? infoCardsForDb : undefined, retryable: (!streamed.trim() && !!streamErrMsg) || undefined, variants: prior, activeVariant: activeVariantForEvent },
      );
      // Same message (new variant) → don't bump messageCount.
      await ChatConversation.updateOne({ id: convId }, { lastMessageAt: new Date(), updatedAt: new Date() });
    } else {
      await ChatMessage.updateOne(
        { id: aiMessage.id },
        { content: persisted, tokensUsed: Math.ceil(persisted.length / 4), postCard: cardForDb, listCard: listCardForDb || undefined, editCards: editCardsForDb.length ? editCardsForDb : undefined, infoCards: infoCardsForDb.length ? infoCardsForDb : undefined, retryable: (!streamed.trim() && !!streamErrMsg) || undefined },
      );
      await ChatConversation.updateOne({ id: convId }, { lastMessageAt: new Date(), updatedAt: new Date(), $inc: { messageCount: 1 } });
    }

    writeEvent(res, { type: 'complete', messageId: aiMessage.id, conversationId: convId, finalContent: persisted, postCard: cardForDb, listCard: listCardForDb || undefined, editCards: editCardsForDb.length ? editCardsForDb : undefined, infoCards: infoCardsForDb.length ? infoCardsForDb : undefined, retryable: !streamed.trim() && !!streamErrMsg, variants: variantsForEvent, activeVariant: activeVariantForEvent });
    vlog('generate:complete', { convId, messageId: aiMessage.id });
  } catch (error: any) {
    clearInterval(statusInterval);
    vlog('generate:fatal-error', { convId, error: error?.message });
    console.error('[VEEGPT] AI generation error:', error?.message);
    const fallbackMsg = 'I apologize, but I encountered an error while generating a response.';
    await ChatMessage.updateOne({ id: aiMessage.id }, { content: fallbackMsg, tokensUsed: 20 }).catch(() => {});
    writeEvent(res, { type: 'error', error: 'Failed to generate response', messageId: aiMessage.id });
  } finally {
    activeGenerations.set(convId, false);
    activeAbortControllers.delete(convId);
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

// ── Attachments (images + PDFs for multimodal analysis) ────────────────────────
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB per file
const ALLOWED_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif', 'application/pdf'];

/**
 * Validate + normalize incoming attachments from the request body. Enforces the
 * 5-file cap, allowed MIME types, and a per-file size limit. Returns a sanitized
 * list (strips any data: prefix) and a human-readable error if invalid.
 */
function parseAttachments(raw: any): { attachments: AIAttachment[]; error?: string } {
  if (!raw) return { attachments: [] };
  if (!Array.isArray(raw)) return { attachments: [], error: 'Attachments must be an array' };
  if (raw.length > MAX_ATTACHMENTS) return { attachments: [], error: `You can attach at most ${MAX_ATTACHMENTS} files.` };

  const attachments: AIAttachment[] = [];
  for (const a of raw) {
    const mimeType = String(a?.mimeType || '').toLowerCase();
    let data = String(a?.data || '');
    const comma = data.indexOf(',');
    if (data.startsWith('data:') && comma !== -1) data = data.slice(comma + 1);
    if (!mimeType || !data) return { attachments: [], error: 'Each attachment needs a mimeType and data.' };
    if (!ALLOWED_ATTACHMENT_TYPES.includes(mimeType)) {
      return { attachments: [], error: `Unsupported file type: ${mimeType}. Only images and PDFs are allowed.` };
    }
    const approxBytes = Math.floor((data.length * 3) / 4);
    if (approxBytes > MAX_ATTACHMENT_BYTES) {
      return { attachments: [], error: `A file exceeds the ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB limit.` };
    }
    attachments.push({ mimeType: mimeType === 'image/jpg' ? 'image/jpeg' : mimeType, data, name: a?.name });
  }
  return { attachments };
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
  baseAttachments: AIAttachment[],
  mediaUrls: string[],
): Array<{ name?: string; mimeType: string; url?: string }> | undefined {
  const out: Array<{ name?: string; mimeType: string; url?: string }> = [];
  for (const a of baseAttachments || []) out.push({ name: a.name, mimeType: a.mimeType });
  for (const url of mediaUrls || []) {
    if (!url || typeof url !== 'string') continue;
    const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url);
    out.push({ mimeType: isVideo ? 'video/mp4' : 'image/jpeg', url });
  }
  return out.length ? out : undefined;
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
  return Date.now() % 1000000000 + Math.floor(Math.random() * 1000);
}

/** Build a short note appended to the prompt so the model knows what's attached. */
function attachmentsPromptNote(attachments: AIAttachment[]): string {
  if (!attachments.length) return '';
  const list = attachments.map((a, i) => `${i + 1}. ${a.name || 'file'} (${a.mimeType})`).join('; ');
  return `\n\nThe user attached ${attachments.length} file(s) for you to analyze: ${list}. Analyze them and address the user's message about them.`;
}

/** Summarize a batch of older messages, merging into any existing summary. */
async function summarizeMessages(
  previousSummary: string,
  batch: Array<{ role: string; content: string }>,
  preferences: FullPreferences,
  usageCtx?: { userId?: string; workspaceId?: string },
): Promise<string> {
  const transcript = batch
    .map((m) => `${m.role === 'assistant' ? 'VeeGPT' : 'User'}: ${m.content}`)
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
  const summary = await withAIFeature('veegpt.memory_summary', usageCtx, () => aiServiceManager.generateText(prompt, {
    ...preferences,
    responseLength: 'short',
    creativityLevel: 0.3,
  }));
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
  usageCtx?: { userId?: string; workspaceId?: string },
): Promise<{ history: Array<{ role: string; content: string }>; memorySummary: string }> {
  // Off / short-term: shallow window, no rolling summary. selectShallowWindow
  // distinguishes 'off' (stateless: current message only) from 'short-term'
  // (last few turns).
  if (prefs.aiMemory !== 'long-term') {
    const all = await ChatMessage.find({ conversationId: convId }).sort({ createdAt: 1 }).lean();
    const ordered = all.map((m) => ({ role: m.role, content: m.content }));
    const history = selectShallowWindow(prefs.aiMemory as MemoryMode, ordered);
    vlog(prefs.aiMemory === 'off' ? 'memory:off' : 'memory:short-term', { convId, historySent: history.length });
    return { history, memorySummary: '' };
  }

  // Long-term: rolling summary + verbatim recent window.
  const conv = await ChatConversation.findOne({ id: convId }).lean();
  let memorySummary = (conv as any)?.memorySummary || '';
  let summarizedCount = (conv as any)?.summarizedMessageCount || 0;

  const all = await ChatMessage.find({ conversationId: convId }).sort({ createdAt: 1 }).lean();
  const ordered = all.map((m) => ({ role: m.role, content: m.content }));
  const plan = planLongTermWindow(ordered, summarizedCount);

  let history = plan.history;
  if (plan.needsSummarization) {
    try {
      memorySummary = await summarizeMessages(memorySummary, plan.toSummarize, prefs, usageCtx);
      summarizedCount = plan.newSummarizedCount;
      await ChatConversation.updateOne(
        { id: convId },
        { memorySummary, summarizedMessageCount: summarizedCount, updatedAt: new Date() },
      );
      vlog('memory:summarized', { convId, folded: plan.toSummarize.length, summarizedCount, summaryLength: memorySummary.length });
    } catch (err: any) {
      vlog('memory:summarize-error', { convId, error: err?.message });
      // On failure, fall back to a bounded verbatim window so the prompt stays small.
      history = ordered.slice(-LONG_TERM_VERBATIM);
    }
  }

  vlog('memory:long-term', { convId, historySent: history.length, hasSummary: !!memorySummary, summaryLength: memorySummary.length });
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
async function getUserMemoryProfile(userId?: string, workspaceId?: string): Promise<string> {
  if (!userId || !workspaceId) return '';
  try {
    const mem = await UserMemory.findOne({ userId, workspaceId }).lean();
    const items = ((mem as any)?.items || []) as Array<{ id: string; text: string }>;
    if (!items.length) return '';
    // Include each fact's id so the model can UPDATE or FORGET a specific fact
    // (e.g. when the user changes their brand color) instead of adding a
    // duplicate/contradicting fact.
    return items.map((it) => `- [id:${it.id}] ${it.text}`).join('\n');
  } catch (err: any) {
    vlog('user-memory:read-error', { userId, workspaceId, error: err?.message });
    return '';
  }
}

/** Update an existing memory fact's text (by id). Workspace-scoped. */
async function updateMemoryFact(
  userId: string | undefined,
  workspaceId: string | undefined,
  id: string,
  newText: string,
): Promise<{ status: 'updated' | 'notfound' | 'skipped'; fact?: string }> {
  if (!userId || !workspaceId || !id) return { status: 'skipped' };
  const text = clampItemText(String(newText || '').trim().replace(/^["']|["']$/g, ''));
  if (!text || text.length < 2) return { status: 'skipped' };
  try {
    const r = await UserMemory.updateOne(
      { userId, workspaceId, 'items.id': id },
      { $set: { 'items.$.text': text, updatedAt: new Date() } },
    );
    if (!r.matchedCount) return { status: 'notfound' };
    // Editing a fact's text can make it identical to another existing fact (e.g.
    // two posting-schedule entries both becoming "Sunday and Monday"). Collapse
    // any duplicates so memory keeps one copy per distinct fact.
    const after = await UserMemory.findOne({ userId, workspaceId });
    if (after) {
      const items = (after.items || []).map((it: any) => ({ id: it.id, text: it.text, createdAt: it.createdAt }));
      const { items: deduped, removed } = dedupeMemoryItems(items);
      if (removed > 0) {
        await UserMemory.updateOne(
          { userId, workspaceId },
          { $set: { items: deduped, updatedAt: new Date() } },
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
  id: string,
): Promise<{ status: 'deleted' | 'notfound' | 'skipped'; fact?: string }> {
  if (!userId || !workspaceId || !id) return { status: 'skipped' };
  try {
    const existing = await UserMemory.findOne({ userId, workspaceId, 'items.id': id }).lean();
    const item = ((existing as any)?.items || []).find((it: any) => it.id === id);
    const r = await UserMemory.updateOne(
      { userId, workspaceId },
      { $pull: { items: { id } }, $set: { updatedAt: new Date() } },
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
  _prefs?: FullPreferences,
): Promise<{ status: 'saved' | 'duplicate' | 'skipped' | 'full' | 'updated'; fact?: string }> {
  if (!userId || !workspaceId) return { status: 'skipped' };
  const fact = clampItemText(String(rawFact || '').trim().replace(/^["']|["']$/g, ''));
  if (!fact || fact.length < 2) return { status: 'skipped' };
  try {
    const existing = await UserMemory.findOne({ userId, workspaceId });
    const existingItems = (existing?.items || []).map((it: any) => ({ id: it.id, text: it.text, createdAt: it.createdAt }));
    const { items, added, skippedDuplicate, replaced } = mergeMemoryItems(
      existingItems,
      [fact],
      () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    );
    // Exact near-duplicate of an existing fact — nothing to do.
    if (added === 0 && replaced === 0 && skippedDuplicate > 0) {
      vlog('user-memory:fact-duplicate', { workspaceId, fact });
      return { status: 'duplicate', fact };
    }
    // A brand-new fact (not a replacement) would grow storage — refuse when full
    // rather than silently evicting the user's older memories.
    if (added > 0 && isMemoryFull(existingItems)) {
      vlog('user-memory:fact-full', { workspaceId, fact, totalItems: existingItems.length });
      return { status: 'full', fact };
    }
    await UserMemory.updateOne(
      { userId, workspaceId },
      {
        $set: { items, updatedAt: new Date() },
        $setOnInsert: { userId, workspaceId, processedConversationIds: [], createdAt: new Date() },
      },
      { upsert: true },
    );
    if (replaced > 0 && added === 0) {
      vlog('user-memory:fact-replaced', { workspaceId, fact, totalItems: items.length });
      return { status: 'updated', fact };
    }
    vlog('user-memory:fact-saved', { workspaceId, fact, totalItems: items.length });
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
  prefs: FullPreferences,
): Promise<void> {
  if (!userId || !workspaceId || prefs.aiMemory !== 'long-term') return;
  try {
    const existing = await UserMemory.findOne({ userId, workspaceId });
    const existingItems = (existing?.items || []).map((it: any) => ({ id: it.id, text: it.text, createdAt: it.createdAt }));
    const existingText = existingItems.map((it) => `- ${it.text}`).join('\n');

    const messages = await ChatMessage.find({ conversationId: convId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    const transcript = messages
      .reverse()
      .map((m) => `${m.role === 'assistant' ? 'VeeGPT' : 'User'}: ${m.content}`)
      .join('\n');
    if (!transcript.trim()) return;

    const prompt =
      'You maintain a long-term memory of a user across all their chats with ' +
      'VeeGPT (a social-media assistant).\n' +
      (existingText ? `Things you already remember:\n${existingText}\n\n` : '') +
      'Extract NEW facts to remember from the recent messages below. Rules:\n' +
      '- Record facts ABOUT THE USER, written in third person (e.g. "User posts on ' +
      'weekends", "User\'s brand is a Bollywood movie-review page"). NEVER store ' +
      "VeeGPT's own replies or phrasing like \"I've noted that...\".\n" +
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
      await withAIFeature('veegpt.memory_update', { userId, workspaceId }, () => aiServiceManager.generateText(prompt, { ...prefs, responseLength: 'short', creativityLevel: 0.2 }))
    )?.trim();
    if (!raw) return;

    const incoming = raw
      .split('\n')
      .map((l) => l.replace(/^[\s\-*•\d.)]+/, '').trim())
      .filter(Boolean);
    if (!incoming.length) return;

    const { items, added, evicted, replaced } = mergeMemoryItems(
      existingItems,
      incoming,
      () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    );
    if (added === 0 && evicted === 0 && replaced === 0) {
      // Still record that we've processed this conversation.
      await UserMemory.updateOne(
        { userId, workspaceId },
        { $addToSet: { processedConversationIds: convId }, $setOnInsert: { userId, workspaceId, createdAt: new Date() } },
        { upsert: true },
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
      { upsert: true },
    );
    vlog('user-memory:updated', { userId, workspaceId, convId, added, evicted, totalItems: items.length });
  } catch (err: any) {
    vlog('user-memory:update-error', { userId, workspaceId, convId, error: err?.message });
  }
}

// ── List conversations ────────────────────────────────────────────────────────
router.get('/conversations', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    // Scope conversations to the workspace the user is actively viewing so
    // switching VeeFore accounts/workspaces shows only that workspace's chats.
    const workspaceId = req.query.workspaceId ? String(req.query.workspaceId) : undefined;
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

// ── Search conversations (ChatGPT-style) ────────────────────────────────────
// Searches BOTH conversation titles and message content (including the text of
// card responses, which is stringified) for the query. Returns one result per
// matching conversation with a snippet around the first match and the matched
// messageId so the client can scroll to and highlight it on open.
router.get('/search', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const q = String(req.query.q || '').trim();
    const workspaceId = req.query.workspaceId ? String(req.query.workspaceId) : undefined;
    const convFilter: any = { userId, isArchived: { $ne: true } };
    if (workspaceId) convFilter.workspaceId = workspaceId;
    const convs = await ChatConversation.find(convFilter)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .lean();

    // No query → return all conversations (the client groups them by date).
    if (!q) {
      return res.json({ results: convs.map((c: any) => ({ conversationId: c.id, title: c.title, lastMessageAt: c.lastMessageAt || c.updatedAt, snippet: null, matchedMessageId: null, titleMatch: true })) });
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
    const messages = await ChatMessage.find({ conversationId: { $in: convIds } })
      .select('id conversationId role content postCard listCard editCards infoCards createdAt')
      .sort({ createdAt: -1 })
      .lean();

    // Build a searchable haystack per message: prose + any card text.
    const haystackOf = (m: any): string => {
      let s = m.content || '';
      for (const f of ['postCard', 'listCard', 'editCards', 'infoCards']) {
        if (m[f]) { try { s += ' ' + JSON.stringify(m[f]); } catch { /* ignore */ } }
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
        resultByConv.set(c.id, { conversationId: c.id, title: c.title, lastMessageAt: c.lastMessageAt || c.updatedAt, snippet: null, matchedMessageId: null, titleMatch: true });
      }
    }

    const results = Array.from(resultByConv.values())
      .sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime())
      .slice(0, 50);
    res.json({ results });
  } catch (error: any) {
    vlog('search:error', { error: error?.message });
    console.error('[VEEGPT] Search conversations error:', error?.message);
    res.status(500).json({ error: 'Failed to search conversations' });
  }
});

// ── Get messages for a conversation ─────────────────────────────────────────────
router.get('/conversations/:conversationId/messages', requireAuth, async (req: any, res: Response) => {
  try {
    const convId = parseInt(req.params.conversationId, 10);
    const messages = await ChatMessage.find({ conversationId: convId }).sort({ createdAt: 1 }).lean();
    res.json(messages);
  } catch (error: any) {
    console.error('[VEEGPT] Get messages error:', error?.message);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// ── Send a message to an existing conversation (STREAMS the reply) ──────────────
// VeeGPT tier gating: this single endpoint currently serves Basic, Full, and
// Advanced VeeGPT uniformly — there is no in-handler branching yet that
// restricts capabilities by plan tier (veeGPTFullGuards / veeGPTAdvancedGuards
// from ai-route-guards.ts are defined but have no corresponding tier-specific
// code path to attach to here). We apply veeGPTBasicGuards so every request
// still requires an active subscription. Plain VeeGPT conversation is free;
// only generate_caption and generate_hashtags settle credits inside buildInfoCard.
router.post('/conversations/:conversationId/messages', requireAuth, ...veeGPTBasicGuards, async (req: any, res: Response) => {
  const convId = parseInt(req.params.conversationId, 10);
  try {
    const { content } = req.body;
    const { attachments, error: attachErr } = parseAttachments(req.body?.attachments);
    if (attachErr) return res.status(400).json({ error: attachErr });
    // Hosted media URLs (unified posting path) count as content too — a media-only
    // post message has no text and no base64 attachments, just uploaded URLs.
    const hasMediaUrls = Array.isArray(req.body?.mediaUrls) && req.body.mediaUrls.some((u: any) => typeof u === 'string' && u);
    // Allow a message that has attachments/media even if the text is empty.
    if (!content?.trim() && attachments.length === 0 && !hasMediaUrls) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const conversation = await ChatConversation.findOne({ id: convId });
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
    const skipUserMessage = req.body?.skipUserMessage === true || !!(Number(req.body?.regenerateMessageId) || 0);
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
      userMessage = await ChatMessage.create({
        id: await resolveClientMessageId(req.body?.userMessageId),
        conversationId: convId,
        role: 'user',
        content: displayContent,
        attachments: buildUserMessageAttachments(attachments, mediaUrlsForMsg),
        tokensUsed: 0,
      });
      await ChatConversation.updateOne({ id: convId }, { lastMessageAt: new Date(), updatedAt: new Date(), $inc: { messageCount: 1 } });
    } else {
      // The post-agent routeToChat flow already persisted this user message via
      // /conversations/log. Don't create a second one — but DO emit the existing
      // one as a `userMessage` event below so the client reconciles its optimistic
      // bubble exactly like the normal chat path (prevents duplicate bubbles).
      userMessage = await ChatMessage.findOne({ conversationId: convId, role: 'user' })
        .sort({ createdAt: -1 })
        .lean();
    }

    activeGenerations.set(convId, true);
    vlog('send-message:received', { convId, contentLength: safeContent.length, attachments: attachments.length, skipUserMessage });

    // Begin streaming response on this same request.
    initStreamResponse(res);
    // Always emit the user message (freshly created OR the pre-persisted one) so
    // the client can replace its optimistic temp bubble with the canonical record.
    if (userMessage) writeEvent(res, { type: 'userMessage', message: userMessage, conversationId: convId });

    // Abort generation if the client disconnects.
    req.on('close', () => { if (!res.writableEnded) { activeGenerations.set(convId, false); try { activeAbortControllers.get(convId)?.abort(); } catch { /* noop */ } } });

    const preferences = await getWorkspaceAIPreferences(conversation.workspaceId, req.user?.id);
    // History window + long-term memory. 'long-term' rolls older messages into a
    // persisted running summary (true unlimited memory) and keeps the recent
    // turns verbatim; 'short-term' just sends the last few turns. We never send
    // the entire raw transcript, which would balloon the prompt and slow the
    // model's time-to-first-token.
    const { history, memorySummary } = await buildHistoryWithMemory(convId, preferences, { userId: req.user?.id, workspaceId: req.body?.workspaceId || conversation.workspaceId });
    // Regenerate: drop the trailing assistant turn(s) so the model re-answers the
    // user's prompt fresh (it must not see its own previous answer in history).
    if (regenerateMessageId) {
      while (history.length && history[history.length - 1].role === 'assistant') history.pop();
    }
    // When skipping the user-message write, the post-agent's /conversations/log
    // call may not have committed yet (it's fire-and-forget for an existing
    // conversation), so the DB history might not include this turn. Ensure the
    // latest user message is present so the model always sees it.
    const lastHist = history[history.length - 1];
    if (!lastHist || lastHist.role !== 'user' || lastHist.content.trim() !== safeContent) {
      if (safeContent) history.push({ role: 'user', content: safeContent });
    }
    // Tell the model what files are attached (the binary parts go to the model
    // separately via generateTextStream).
    if (attachments.length && history.length) {
      history[history.length - 1].content += attachmentsPromptNote(attachments);
    }
    // Media-only posting turn (hosted URLs, no text): make the user's intent
    // explicit so the model still acts. Without this the turn looks empty and
    // the model neither replies nor calls the tool. We append (or add) a short
    // instruction reflecting that the user just provided the media for the post
    // they were preparing.
    if (mediaUrlsForMsg.length && !safeContent) {
      const note = 'The user just attached the media for the post we were preparing. Use it to fulfill their posting request (call schedule_post when ready, or ask for the still-missing detail).';
      if (history.length && history[history.length - 1].role === 'user') {
        history[history.length - 1].content = (history[history.length - 1].content.trim() + '\n' + note).trim();
      } else {
        history.push({ role: 'user', content: note });
      }
    }
    // Cross-chat memory: durable facts about the user from their other chats.
    // Prefer the workspace the user is actively viewing (sent by the client);
    // fall back to the conversation's stored workspaceId.
    const memWorkspaceId = await resolveMemoryWorkspaceId(req.body?.workspaceId || conversation.workspaceId, req.user?.id);

    // Read the EXISTING memory profile BEFORE any explicit save, so a freshly
    // saved fact doesn't appear pre-saved (which made the model say "already
    // noted" on the first save).
    const userMemoryProfile = await getUserMemoryProfile(req.user?.id, memWorkspaceId);

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
    const explicitIntent = !skipUserMessage && !DISABLE_REGEX_FOR_TESTING && preferences.aiMemory === 'long-term' && hasSaveIntent(safeContent);
    vlog('user-memory:intent-check', { convId, aiMemory: preferences.aiMemory, hasSaveIntent: hasSaveIntent(safeContent), disabledForTesting: DISABLE_REGEX_FOR_TESTING, content: safeContent.slice(0, 80) });
    if (explicitIntent) {
      const r = await saveMemoryFact(req.user?.id, memWorkspaceId, extractSaveIntentFact(safeContent) || '', preferences);
      if (r.status === 'saved') memoryNote = `IMPORTANT: You have JUST saved this NEW fact to long-term memory: "${r.fact}". It was NOT remembered before. Confirm you'll remember it now — do NOT say it was already saved.`;
      else if (r.status === 'updated') memoryNote = `You have JUST UPDATED an existing fact on this topic to: "${r.fact}" (it replaced the old value, no duplicate was created). Confirm you've updated it.`;
      else if (r.status === 'duplicate') memoryNote = `This was ALREADY in long-term memory before now: "${r.fact}". Tell the user it's already saved.`;
      else if (r.status === 'full') memoryNote = `You could NOT save "${r.fact}" because the user's long-term memory is FULL. Tell them their VeeGPT memory storage is full and they need to remove a few facts in Settings → AI Configuration before you can remember new things.`;
      vlog('user-memory:explicit', { convId, status: r.status, fact: r.fact, memWorkspaceId });
    }

    // Live workspace/account data (from Redis cache, refreshed by a worker).
    // Only loaded when the message actually needs it — the cheap router
    // (post-agent triage) sets `includeWorkspaceContext`. For ordinary chat,
    // ideas, and how-to turns we skip this large block entirely to cut prompt
    // size and cost. Defaults to TRUE for direct calls (no flag) so behavior is
    // unchanged when the streaming endpoint is hit outside the router.
    // Advanced VeeGPT selectors (composer dropdowns): the chosen persona/agent
    // and the specific social account the user wants VeeGPT focused on.
    const selectedAccountId = typeof req.body?.selectedAccountId === 'string' && req.body.selectedAccountId.trim()
      ? req.body.selectedAccountId.trim()
      : '';
    const agentDirectives = getAgentDirectives(req.body?.selectedAgentId);
    const forcedTool = typeof req.body?.forcedTool === 'string' ? req.body.forcedTool.trim() : '';
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
    vlog('send-message:workspace-context', { convId, included: wantContext, identityOnly: !!selectedAccountId, length: workspaceContext.length, selectedAccountId: selectedAccountId || null });
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
    const toolMediaUrls: string[] = Array.isArray(req.body?.mediaUrls) ? req.body.mediaUrls.filter((u: any) => typeof u === 'string' && u) : [];
    const hasMedia = toolMediaUrls.length > 0;
    const memoryToolEnabled = preferences.aiMemory === 'long-term' && !skipUserMessage && !!memWorkspaceId;
    // Whether the remember_fact/update/forget tools were actually offered to the
    // model this turn. When true, the LLM decides what to save in-band — so we
    // must NOT also run the periodic background extraction (that's what caused
    // facts to be saved on a fixed every-N-messages cadence regardless of intent).
    let memoryToolOffered = false;
    if (req.body?.enableTools === true && attachments.length === 0) {
      const tools: ChatTool[] = [];
      if (memoryToolEnabled) { tools.push(...VEEGPT_MEMORY_TOOLS_ALL); memoryToolOffered = true; }
      if (memWorkspaceId) {
        // Read + edit tools give VeeGPT live access to the user's workspace
        // (scheduled/published/draft counts, account stats) and let it edit
        // existing content (reschedule/cancel/update caption) — workspace-scoped.
        tools.push(...VEEGPT_DATA_TOOLS, ...VEEGPT_EDIT_TOOLS, ...VEEGPT_INSIGHT_TOOLS);
        // Inject the user's posts (with ids) so the model can resolve "the first
        // scheduled post" → a real contentId and call an edit tool in one pass.
        const contentCtx = await buildContentContext(memWorkspaceId);
        if (contentCtx) toolContext = (toolContext ? toolContext + '\n\n' : '') + contentCtx;
        try {
          const accts = await storage.getSocialAccountsByWorkspace(memWorkspaceId).catch(() => []) || [];
          if (accts.length > 0) {
            tools.push(...VEEGPT_CHAT_TOOLS);
            toolContext = buildToolContext(accts, req.body?.localNow, req.body?.timezone, hasMedia) + (toolContext ? `\n\n${toolContext}` : '');
            toolAccountUsernames = accts.map((a: any) => a.username).filter(Boolean);
            // Selected-account focus → offer the on-demand data tool + a scope hint.
            const scopeHint = buildAccountScopeHint(accts, selectedAccountId);
            if (scopeHint) {
              tools.push(...VEEGPT_ACCOUNT_TOOLS);
              toolContext = `${scopeHint}\n\n${toolContext}`;
            }
          }
        } catch { /* no accounts → no posting tool */ }
      }
      // Always give the model the user's FRESH niche/profile (app-level data) so
      // niche-dependent questions (trends, ideas) use the real niche, not stale
      // cache or a generic guess.
      const profileHint = await getFreshProfileHint(req.user?.id);
      if (profileHint) toolContext = profileHint + (toolContext ? `\n\n${toolContext}` : '');
      // User explicitly picked a tool to run → force it (prepended so it leads).
      const forcedDirective = buildForcedToolDirective(forcedTool);
      if (forcedDirective) toolContext = forcedDirective + (toolContext ? `\n\n${toolContext}` : '');
      if (tools.length) chatTools = tools;
    }
    await streamGeneration(res, convId, history, preferences, memorySummary, userMemoryProfile, workspaceContext, memoryNote, attachments, chatTools, toolContext, toolMediaUrls, req.body?.localNow, toolAccountUsernames, memoryToolEnabled ? { userId: req.user?.id, workspaceId: memWorkspaceId } : undefined, { userId: req.user?.id, workspaceId: memWorkspaceId }, regenerateMessageId ? { messageId: regenerateMessageId } : undefined, { agentDirectives, accountScope: { userId: req.user?.id, workspaceId: memWorkspaceId, accountId: selectedAccountId || undefined } });
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
    console.error('[VEEGPT] Create message error:', error?.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create message' });
    } else {
      writeEvent(res, { type: 'error', error: 'Failed to create message' });
      res.end();
    }
  }
});

// ── Stop an in-flight generation ────────────────────────────────────────────────
router.post('/conversations/:conversationId/stop', requireAuth, async (req: any, res: Response) => {
  try {
    const convId = parseInt(req.params.conversationId, 10);
    // Halt the generation loop FIRST so streamGeneration's persist sees the stop
    // and skips writing — the client's partial below becomes authoritative.
    activeGenerations.set(convId, false);
    // Cancel the upstream model request so token usage stops immediately.
    try { activeAbortControllers.get(convId)?.abort(); } catch { /* noop */ }

    // The client sends the exact text it had revealed on screen when the user hit
    // Stop. Persist EXACTLY that — never the model's (often already-complete) full
    // output — so Stop truly stops where the user saw it.
    const messageId = Number(req.body?.messageId) || null;
    const partial = typeof req.body?.content === 'string' ? req.body.content : null;
    if (messageId && partial != null) {
      const msg = await ChatMessage.findOne({ id: messageId });
      if (msg) {
        const hadContent = !!((msg as any).content && (msg as any).content.trim());
        const hasVariants = Array.isArray((msg as any).variants) && (msg as any).variants.length > 0;
        if (hadContent || hasVariants) {
          // Stopped a REGENERATE → keep the original as a variant and add the
          // stopped partial as the active variant (1/2, 2/2 preserved).
          const prior = hasVariants
            ? (msg as any).variants.slice()
            : [{ content: (msg as any).content, postCard: (msg as any).postCard, listCard: (msg as any).listCard, editCards: (msg as any).editCards, infoCards: (msg as any).infoCards, createdAt: (msg as any).createdAt }];
          prior.push({ content: partial || ' ', createdAt: new Date() });
          await ChatMessage.updateOne({ id: messageId }, { content: partial || ' ', variants: prior, activeVariant: prior.length - 1 });
        } else {
          // Stopped a fresh reply → just persist the partial text.
          await ChatMessage.updateOne({ id: messageId }, { content: partial || ' ' });
        }
      }
    }
    res.json({ success: true, message: 'Generation stopped' });
  } catch (error: any) {
    console.error('[VEEGPT] Stop generation error:', error?.message);
    res.status(500).json({ error: 'Failed to stop generation' });
  }
});

// ── Rename a conversation ───────────────────────────────────────────────────────
router.patch('/conversations/:conversationId', requireAuth, async (req: any, res: Response) => {
  try {
    const convId = parseInt(req.params.conversationId, 10);
    const { title } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    await ChatConversation.updateOne({ id: convId }, { title: title.trim(), updatedAt: new Date() });
    res.json({ success: true, conversationId: convId });
  } catch (error: any) {
    console.error('[VEEGPT] Rename conversation error:', error?.message);
    res.status(500).json({ error: 'Failed to rename conversation' });
  }
});

// ── Archive a conversation ──────────────────────────────────────────────────────
router.post('/conversations/:conversationId/archive', requireAuth, async (req: any, res: Response) => {
  try {
    const convId = parseInt(req.params.conversationId, 10);
    await ChatConversation.updateOne({ id: convId }, { isArchived: true, updatedAt: new Date() });
    res.json({ success: true, conversationId: convId });
  } catch (error: any) {
    console.error('[VEEGPT] Archive conversation error:', error?.message);
    res.status(500).json({ error: 'Failed to archive conversation' });
  }
});

// ── Delete a conversation (and its messages) ────────────────────────────────────
router.delete('/conversations/:conversationId', requireAuth, async (req: any, res: Response) => {
  try {
    const convId = parseInt(req.params.conversationId, 10);
    await ChatMessage.deleteMany({ conversationId: convId });
    await ChatConversation.deleteOne({ id: convId });
    res.json({ success: true, conversationId: convId });
  } catch (error: any) {
    console.error('[VEEGPT] Delete conversation error:', error?.message);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// ── Create a new conversation (first message) — STREAMS the reply ───────────────
// VeeGPT tier gating: same rationale as /conversations/:conversationId/messages
// above — this creates a new conversation with the first message and streams
// the AI reply, so it needs the same base subscription guard.
router.post('/conversations', requireAuth, ...veeGPTBasicGuards, async (req: any, res: Response) => {
  try {
    const { content } = req.body;
    const userId = req.user.id;
    const { attachments, error: attachErr } = parseAttachments(req.body?.attachments);
    if (attachErr) return res.status(400).json({ error: attachErr });
    const hasMediaUrls = Array.isArray(req.body?.mediaUrls) && req.body.mediaUrls.some((u: any) => typeof u === 'string' && u);
    if (!content?.trim() && attachments.length === 0 && !hasMediaUrls) return res.status(400).json({ error: 'Message content is required' });

    const safeContent = (content || '').trim();
    const displayContent = safeContent || ' ';

    // Prefer the workspace the user is actively viewing (sent by the client),
    // then the user's stored workspace, then their default.
    const defaultWorkspace = await storage.getDefaultWorkspace(userId);
    const workspaceId = req.body?.workspaceId || req.user.workspaceId || defaultWorkspace?.id;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace found' });

    const preferences = await getWorkspaceAIPreferences(workspaceId, userId);

    // Use a quick placeholder title from the first message so we can start
    // streaming the reply IMMEDIATELY (no blocking title-generation LLM call on
    // the critical path — that was adding seconds of latency before the first
    // token, even for short messages). A proper AI title is generated in the
    // background after the reply finishes and pushed via a `conversationTitle` event.
    const placeholderTitle = displayContent.slice(0, 50) || 'New chat';

    const convId = Date.now() % 1000000000 + Math.floor(Math.random() * 1000);
    const conversation = await ChatConversation.create({
      id: convId, userId, workspaceId, title: placeholderTitle, messageCount: 1, lastMessageAt: new Date(),
    });
    // Already-uploaded hosted media URLs (unified posting path) persisted on the
    // user message so its thumbnail renders from cache and survives refresh.
    const createMediaUrls: string[] = Array.isArray(req.body?.mediaUrls)
      ? req.body.mediaUrls.filter((u: any) => typeof u === 'string' && u)
      : [];
    const userMessage = await ChatMessage.create({
      id: await resolveClientMessageId(req.body?.userMessageId),
      conversationId: convId, role: 'user', content: displayContent,
      attachments: buildUserMessageAttachments(attachments, createMediaUrls),
      tokensUsed: 0,
    });

    activeGenerations.set(convId, true);
    vlog('create-conversation:done', { convId, workspaceId, attachments: attachments.length });

    // Stream: first send the conversation + user message, then the AI reply.
    initStreamResponse(res);
    writeEvent(res, { type: 'conversation', conversation });
    writeEvent(res, { type: 'userMessage', message: userMessage, conversationId: convId });

    req.on('close', () => { if (!res.writableEnded) { activeGenerations.set(convId, false); try { activeAbortControllers.get(convId)?.abort(); } catch { /* noop */ } } });

    const createMediaForHistory: string[] = Array.isArray(req.body?.mediaUrls)
      ? req.body.mediaUrls.filter((u: any) => typeof u === 'string' && u)
      : [];
    const firstMsgContent = createMediaForHistory.length && !safeContent
      ? 'The user attached the media for a post they want to publish. Use it to fulfill their posting request (call schedule_post when ready, or ask for the still-missing detail).'
      : safeContent + attachmentsPromptNote(attachments);
    const history = [{ role: 'user', content: firstMsgContent }];
    // Cross-chat memory: a returning user should be recognized even in a brand
    // new chat (when AI Memory = long-term). The per-conversation summary is
    // empty here since this is the first message.
    const memWorkspaceId = await resolveMemoryWorkspaceId(workspaceId, userId);

    // Read EXISTING memory before any explicit save (so a freshly saved fact
    // isn't shown as pre-existing).
    const userMemoryProfile = await getUserMemoryProfile(userId, memWorkspaceId);

    // Explicit "remember X" on the FIRST message of a new chat → save it
    // deterministically now (no LLM, can't fail on quota). Durable-fact
    // detection otherwise folds into the main chat call via the remember_fact
    // tool (no separate extraction call).
    let memoryNote = '';
    const explicitIntent = !DISABLE_REGEX_FOR_TESTING && preferences.aiMemory === 'long-term' && hasSaveIntent(safeContent);
    vlog('user-memory:intent-check', { convId, where: 'create-conversation', aiMemory: preferences.aiMemory, hasSaveIntent: hasSaveIntent(safeContent), disabledForTesting: DISABLE_REGEX_FOR_TESTING, content: safeContent.slice(0, 80) });
    if (explicitIntent) {
      const r = await saveMemoryFact(userId, memWorkspaceId, extractSaveIntentFact(safeContent) || '', preferences);
      if (r.status === 'saved') memoryNote = `IMPORTANT: You have JUST saved this NEW fact to long-term memory: "${r.fact}". It was NOT remembered before. Confirm you'll remember it now — do NOT say it was already saved.`;
      else if (r.status === 'updated') memoryNote = `You have JUST UPDATED an existing fact on this topic to: "${r.fact}" (it replaced the old value, no duplicate was created). Confirm you've updated it.`;
      else if (r.status === 'duplicate') memoryNote = `This was ALREADY in long-term memory before now: "${r.fact}". Tell the user it's already saved.`;
      else if (r.status === 'full') memoryNote = `You could NOT save "${r.fact}" because the user's long-term memory is FULL. Tell them their VeeGPT memory storage is full and they need to remove a few facts in Settings → AI Configuration before you can remember new things.`;
      vlog('user-memory:explicit', { convId, where: 'create-conversation', status: r.status, fact: r.fact, memWorkspaceId });
    }

    // Advanced VeeGPT selectors (composer dropdowns).
    const selectedAccountId = typeof req.body?.selectedAccountId === 'string' && req.body.selectedAccountId.trim()
      ? req.body.selectedAccountId.trim()
      : '';
    const agentDirectives = getAgentDirectives(req.body?.selectedAgentId);
    const forcedTool = typeof req.body?.forcedTool === 'string' ? req.body.forcedTool.trim() : '';
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
        const generated = await withAIFeature('veegpt.title', { userId, workspaceId: memWorkspaceId }, () => aiServiceManager.generateText(
          `Generate a short, 3-6 word title (no quotes, no trailing punctuation) for a chat that starts with this message:\n\n"${displayContent}"`,
          { ...preferences, responseLength: 'short' },
        ));
        const title = generated?.trim().replace(/^["']|["']$/g, '').slice(0, 60);
        if (title) {
          await ChatConversation.updateOne({ id: convId }, { title });
          if (!res.writableEnded) writeEvent(res, { type: 'conversationTitle', conversationId: convId, title });
        }
      } catch (err: any) {
        console.warn('[VEEGPT] Background title generation failed:', err?.message);
      }
    })();

    // Tool-calling on the first message of a new chat (same gating as /messages):
    // memory tool always (long-term), posting tool only with connected accounts.
    let chatTools: ChatTool[] | undefined;
    let toolContext: string | undefined;
    let toolAccountUsernames: string[] = [];
    const toolMediaUrls: string[] = Array.isArray(req.body?.mediaUrls) ? req.body.mediaUrls.filter((u: any) => typeof u === 'string' && u) : [];
    const memoryToolEnabled = preferences.aiMemory === 'long-term' && !!memWorkspaceId;
    if (req.body?.enableTools === true && attachments.length === 0) {
      const tools: ChatTool[] = [];
      if (memoryToolEnabled) tools.push(...VEEGPT_MEMORY_TOOLS_ALL);
      if (memWorkspaceId) {
        tools.push(...VEEGPT_DATA_TOOLS, ...VEEGPT_EDIT_TOOLS, ...VEEGPT_INSIGHT_TOOLS);
        const contentCtx = await buildContentContext(memWorkspaceId);
        if (contentCtx) toolContext = (toolContext ? toolContext + '\n\n' : '') + contentCtx;
        try {
          const accts = await storage.getSocialAccountsByWorkspace(memWorkspaceId).catch(() => []) || [];
          if (accts.length > 0) {
            tools.push(...VEEGPT_CHAT_TOOLS);
            toolContext = buildToolContext(accts, req.body?.localNow, req.body?.timezone, toolMediaUrls.length > 0) + (toolContext ? `\n\n${toolContext}` : '');
            toolAccountUsernames = accts.map((a: any) => a.username).filter(Boolean);
            const scopeHint = buildAccountScopeHint(accts, selectedAccountId);
            if (scopeHint) {
              tools.push(...VEEGPT_ACCOUNT_TOOLS);
              toolContext = `${scopeHint}\n\n${toolContext}`;
            }
          }
        } catch { /* no accounts → no posting tool */ }
      }
      const profileHint = await getFreshProfileHint(userId);
      if (profileHint) toolContext = profileHint + (toolContext ? `\n\n${toolContext}` : '');
      const forcedDirective = buildForcedToolDirective(forcedTool);
      if (forcedDirective) toolContext = forcedDirective + (toolContext ? `\n\n${toolContext}` : '');
      if (tools.length) chatTools = tools;
    }
    await streamGeneration(res, convId, history, preferences, '', userMemoryProfile, workspaceContext, memoryNote, attachments, chatTools, toolContext, toolMediaUrls, req.body?.localNow, toolAccountUsernames, memoryToolEnabled ? { userId, workspaceId: memWorkspaceId } : undefined, { userId, workspaceId: memWorkspaceId }, undefined, { agentDirectives, accountScope: { userId, workspaceId: memWorkspaceId, accountId: selectedAccountId || undefined } });

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
      writeEvent(res, { type: 'error', error: 'Failed to create conversation' });
      res.end();
    }
  }
});

// ── Persist a non-streamed exchange (e.g. the post-composer flow) ───────────────
// The VeeGPT post/schedule flow doesn't go through the streaming generator (the
// "reply" is the composer UI + a canned confirmation), so it was never saved and
// vanished on refresh. This endpoint persists such an exchange as a real
// conversation so it shows in the sidebar history.
router.post('/conversations/log', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const { messages, title } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages[] is required' });
    }

    const defaultWorkspace = await storage.getDefaultWorkspace(userId);
    const workspaceId = req.body?.workspaceId || req.user.workspaceId || defaultWorkspace?.id;
    if (!workspaceId) return res.status(400).json({ error: 'No workspace found' });

    let convId = Number(req.body?.conversationId);
    let conversation: any;
    let createdNew = false;
    if (convId && !Number.isNaN(convId)) {
      conversation = await ChatConversation.findOne({ id: convId, userId });
    }
    if (!conversation) {
      convId = Date.now() % 1000000000 + Math.floor(Math.random() * 1000);
      const firstUser = messages.find((m: any) => m.role === 'user');
      const placeholderTitle = (title || firstUser?.content || 'New chat').toString().slice(0, 60);
      conversation = await ChatConversation.create({
        id: convId, userId, workspaceId, title: placeholderTitle, messageCount: 0, lastMessageAt: new Date(),
      });
      createdNew = true;
    }

    const created: any[] = [];
    for (const m of messages) {
      const role = m?.role === 'assistant' ? 'assistant' : 'user';
      const content = (m?.content ?? '').toString();
      if (!content.trim() && !(Array.isArray(m?.attachments) && m.attachments.length)) continue;
      // Honor a client-supplied message id when present and valid. This is the
      // KEY to single-identity rendering: the client renders an optimistic
      // bubble with this exact id, so when the persisted record (same id) lands
      // in the messages cache, the UI's id-based dedup collapses them into ONE
      // bubble — no duplicate, no content-matching heuristics. We guard against
      // collisions (a different message already using that id) by falling back
      // to a generated id.
      let msgId = Number(m?.id);
      if (!msgId || Number.isNaN(msgId) || (await ChatMessage.exists({ id: msgId }))) {
        msgId = Date.now() % 1000000000 + Math.floor(Math.random() * 1000);
      }
      const msg = await ChatMessage.create({
        id: msgId,
        conversationId: convId,
        role,
        content: content || ' ',
        attachments: Array.isArray(m?.attachments) && m.attachments.length
          ? m.attachments.map((a: any) => ({ name: a?.name, mimeType: a?.mimeType, url: a?.url }))
          : undefined,
        postCard: m?.postCard && typeof m.postCard === 'object' ? m.postCard : undefined,
        tokensUsed: 0,
      });
      created.push(msg);
    }

    await ChatConversation.updateOne(
      { id: convId },
      { lastMessageAt: new Date(), updatedAt: new Date(), $inc: { messageCount: created.length } },
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
            const generated = await withAIFeature('veegpt.title', { userId, workspaceId }, () => aiServiceManager.generateText(
              `Generate a short, 3-6 word title (no quotes, no trailing punctuation) for a chat that starts with this message:\n\n"${seed}"`,
              { responseLength: 'short' } as any,
            ));
            const aiTitle = generated?.trim().replace(/^["']|["']$/g, '').slice(0, 60);
            if (aiTitle) await ChatConversation.updateOne({ id: convId }, { title: aiTitle });
          } catch (err: any) {
            vlog('conversation:title-gen-failed', { convId, error: err?.message });
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
});

// Update a persisted user message's attachments (e.g. swap the placeholder for
// hosted media URLs once the upload finishes) so thumbnails survive refresh.
router.post('/messages/:messageId/attachments', requireAuth, async (req: any, res: Response) => {
  try {
    const messageId = Number(req.params.messageId);
    if (Number.isNaN(messageId)) return res.status(400).json({ error: 'Invalid message id' });
    const { attachments } = req.body || {};
    if (!Array.isArray(attachments)) return res.status(400).json({ error: 'attachments[] required' });
    const clean = attachments.map((a: any) => ({ name: a?.name, mimeType: a?.mimeType, url: a?.url }));
    await ChatMessage.updateOne({ id: messageId }, { attachments: clean.length ? clean : undefined });
    res.json({ ok: true });
  } catch (error: any) {
    console.error('[VEEGPT] Update message attachments error:', error?.message);
    res.status(500).json({ error: 'Failed to update attachments' });
  }
});

// Switch which regenerated variant of an assistant message is active (ChatGPT
// 1/2, 2/2 navigation). Mirrors the chosen variant's content/cards to the
// top-level fields so reads AND conversation history use the selected variant.
router.post('/messages/:messageId/active-variant', requireAuth, async (req: any, res: Response) => {
  try {
    const messageId = Number(req.params.messageId);
    const index = Number(req.body?.index);
    if (Number.isNaN(messageId) || Number.isNaN(index)) return res.status(400).json({ error: 'messageId and index required' });
    const msg = await ChatMessage.findOne({ id: messageId });
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    const conv = await ChatConversation.findOne({ id: (msg as any).conversationId }).lean();
    if (!conv || String((conv as any).userId) !== String(req.user.id)) return res.status(403).json({ error: 'Forbidden' });
    const variants = Array.isArray((msg as any).variants) ? (msg as any).variants : [];
    if (index < 0 || index >= variants.length) return res.status(400).json({ error: 'Index out of range' });
    const v = variants[index];
    await ChatMessage.updateOne({ id: messageId }, {
      activeVariant: index,
      content: v.content,
      postCard: v.postCard || undefined,
      listCard: v.listCard || undefined,
      editCards: v.editCards || undefined,
      infoCards: v.infoCards || undefined,
    });
    res.json({ ok: true, activeVariant: index });
  } catch (error: any) {
    console.error('[VEEGPT] Switch variant error:', error?.message);
    res.status(500).json({ error: 'Failed to switch variant' });
  }
});

// Update a persisted inline post-confirm card's status (e.g. after the user
// confirms → 'done', or cancels). Keeps the rehydrated card in sync so it can't
// be confirmed twice after a refresh.
router.post('/messages/:messageId/post-card', requireAuth, async (req: any, res: Response) => {
  try {
    const messageId = Number(req.params.messageId);
    if (Number.isNaN(messageId)) return res.status(400).json({ error: 'Invalid message id' });
    const { status, resultText, plan } = req.body || {};
    const msg = await ChatMessage.findOne({ id: messageId });
    if (!msg || !(msg as any).postCard) return res.status(404).json({ error: 'Card not found' });
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
});

// Apply (or cancel) a confirmed EDIT card. On confirm we run the verified,
// workspace-scoped mutation; on cancel we just mark it dismissed. Supports BOTH
// the legacy single `editCard` and the multi-card `editCards` array (a cardId
// selects which one). The status is persisted so it can't be applied twice.
router.post('/messages/:messageId/apply-edit', requireAuth, async (req: any, res: Response) => {
  try {
    const messageId = Number(req.params.messageId);
    if (Number.isNaN(messageId)) return res.status(400).json({ error: 'Invalid message id' });
    const action = String(req.body?.action || 'confirm'); // 'confirm' | 'cancel'
    const cardId = req.body?.cardId ? String(req.body.cardId) : undefined;
    const localNow = req.body?.localNow as string | undefined;

    const msg = await ChatMessage.findOne({ id: messageId });
    if (!msg) return res.status(404).json({ error: 'Message not found' });
    const editCards: any[] = Array.isArray((msg as any).editCards) ? (msg as any).editCards : [];
    const legacy = (msg as any).editCard;

    // Locate the target card (multi-card by id, else the single legacy card).
    let target: any = null;
    if (editCards.length) {
      target = cardId ? editCards.find((c) => c.id === cardId) : editCards[0];
    } else if (legacy) {
      target = legacy;
    }
    if (!target) return res.status(404).json({ error: 'Edit card not found' });
    if (target.status === 'done') return res.json({ ok: true, status: 'done', resultText: target.resultText });

    const conv = await ChatConversation.findOne({ id: (msg as any).conversationId }).lean();
    const workspaceId = await resolveMemoryWorkspaceId(req.body?.workspaceId || (conv as any)?.workspaceId, req.user?.id);

    if (action === 'cancel') {
      target.status = 'done';
      target.resultText = 'Cancelled — no changes made.';
    } else {
      const editArgs: Record<string, unknown> = { contentId: target.contentId, ...(target.proposed || {}) };
      const r = await executeEditTool(workspaceId, target.action, editArgs, localNow);
      target.status = r.ok ? 'done' : 'error';
      target.resultText = r.message;
      vlog('apply-edit', { messageId, cardId, action: target.action, ok: r.ok });
    }

    // Persist back into the correct shape.
    if (editCards.length) {
      await ChatMessage.updateOne({ id: messageId }, { editCards });
    } else {
      await ChatMessage.updateOne({ id: messageId }, { editCard: target });
    }
    res.json({ ok: target.status !== 'error', status: target.status, resultText: target.resultText });
  } catch (error: any) {
    console.error('[VEEGPT] Apply edit error:', error?.message);
    res.status(500).json({ error: 'Failed to apply edit' });
  }
});

// ── Cross-chat memory: list / usage / delete (Settings UI) ──────────────────────

/** GET the full VeeGPT memory for the workspace: durable facts + the live
 * workspace/account context (both stored in the same document) + usage. */
router.get('/memory', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const wsParam = (req.query.workspaceId as string) || req.user.workspaceId;
    const workspaceId = await resolveMemoryWorkspaceId(wsParam, userId);
    if (!workspaceId) return res.status(400).json({ error: 'No workspace found' });

    let mem = await UserMemory.findOne({ userId, workspaceId }).lean();

    // If the live context hasn't been stored yet, build + persist it once so the
    // memory is populated on first view (and a background refresh keeps it fresh).
    if (!(mem as any)?.workspaceContext) {
      try {
        const { refreshWorkspaceContext } = await import('../services/WorkspaceContextAccessor');
        await refreshWorkspaceContext(workspaceId, userId, 'memory-view');
        mem = await UserMemory.findOne({ userId, workspaceId }).lean();
      } catch { /* non-critical */ }
    }

    const items = (((mem as any)?.items || []) as Array<{ id: string; text: string; createdAt: Date }>)
      .slice()
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      // Tag each fact with its topic so the UI can group them into categories
      // (single-value topics like brand-color/posting-schedule are detected; the
      // rest fall under "general").
      .map((it) => ({ ...it, topic: detectTopic(it.text) || 'general' }));
    const workspaceContext = (mem as any)?.workspaceContext || null;
    // Count the stored context toward usage so the bar reflects everything saved.
    const contextChars = workspaceContext ? JSON.stringify(workspaceContext).length : 0;
    const usage = computeUsage(items.map((it) => ({ id: it.id, text: it.text })), contextChars);
    res.json({
      items,
      workspaceContext,
      workspaceContextUpdatedAt: (mem as any)?.workspaceContextUpdatedAt || null,
      usage,
      updatedAt: (mem as any)?.updatedAt || null,
    });
  } catch (error: any) {
    console.error('[VEEGPT] Get memory error:', error?.message);
    res.status(500).json({ error: 'Failed to fetch memory' });
  }
});

/** DELETE a single memory item by id. */
router.delete('/memory/:itemId', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const workspaceId = await resolveMemoryWorkspaceId(
      (req.query.workspaceId as string) || req.user.workspaceId,
      userId,
    );
    if (!workspaceId) return res.status(400).json({ error: 'No workspace found' });

    await UserMemory.updateOne(
      { userId, workspaceId },
      { $pull: { items: { id: req.params.itemId } }, $set: { updatedAt: new Date() } },
    );
    const mem = await UserMemory.findOne({ userId, workspaceId }).lean();
    const items = (((mem as any)?.items || []) as Array<{ id: string; text: string; createdAt: Date }>);
    res.json({ success: true, usage: computeUsage(items.map((it) => ({ id: it.id, text: it.text }))) });
  } catch (error: any) {
    console.error('[VEEGPT] Delete memory item error:', error?.message);
    res.status(500).json({ error: 'Failed to delete memory item' });
  }
});

/** DELETE all memory for the current workspace (clear). */
router.delete('/memory', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const workspaceId = await resolveMemoryWorkspaceId(
      (req.query.workspaceId as string) || req.user.workspaceId,
      userId,
    );
    if (!workspaceId) return res.status(400).json({ error: 'No workspace found' });

    await UserMemory.updateOne(
      { userId, workspaceId },
      { $set: { items: [], processedConversationIds: [], updatedAt: new Date() } },
      { upsert: true },
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

/** Pricing per 1M tokens (USD) — edit to match your provider contracts. */
const AI_PRICING: Record<string, { in: number; out: number }> = {
  'openai/gpt-4o-mini': { in: 0.15, out: 0.60 },
  'gpt-4o-mini': { in: 0.15, out: 0.60 },
  'openai/gpt-4.1-mini': { in: 0.40, out: 1.60 },
  'gpt-4o': { in: 2.50, out: 10.0 },
  'gemini-2.5-flash-lite': { in: 0.10, out: 0.40 },
  'gemini-2.5-flash': { in: 0.30, out: 2.50 },
  'gemini-2.0-flash': { in: 0.10, out: 0.40 },
};
function priceFor(model: string, promptTokens: number, completionTokens: number, cachedTokens = 0): number {
  const p = AI_PRICING[model] || AI_PRICING[model?.replace(/^openai\//, '')] || null;
  if (!p) return 0;
  // Cached prompt tokens are billed at ~10% of the normal input rate (OpenAI/
  // Azure prompt caching). Split prompt tokens into cached vs fresh so the
  // dashboard reflects the REAL cost after caching.
  const cached = Math.max(0, Math.min(cachedTokens, promptTokens));
  const fresh = promptTokens - cached;
  return (
    (fresh / 1_000_000) * p.in +
    (cached / 1_000_000) * p.in * 0.1 +
    (completionTokens / 1_000_000) * p.out
  );
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

    type Agg = { feature: string; calls: number; promptTokens: number; completionTokens: number; totalTokens: number; cachedTokens: number; estimatedCalls: number; cost: number; byModel: Record<string, any> };
    const byFeature: Record<string, Agg> = {};
    const totals = { calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, estimatedCalls: 0, cost: 0 };

    for (const e of events as any[]) {
      const f = e.feature || 'other';
      if (!byFeature[f]) byFeature[f] = { feature: f, calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, estimatedCalls: 0, cost: 0, byModel: {} };
      const a = byFeature[f];
      const cached = e.cachedTokens || 0;
      const cost = priceFor(e.model, e.promptTokens || 0, e.completionTokens || 0, cached);
      a.calls += 1; a.promptTokens += e.promptTokens || 0; a.completionTokens += e.completionTokens || 0; a.totalTokens += e.totalTokens || 0; a.cachedTokens += cached; a.cost += cost;
      if (e.estimated) a.estimatedCalls += 1;
      const mk = `${e.provider}:${e.model}`;
      if (!a.byModel[mk]) a.byModel[mk] = { provider: e.provider, model: e.model, calls: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, cachedTokens: 0, cost: 0 };
      const m = a.byModel[mk];
      m.calls += 1; m.promptTokens += e.promptTokens || 0; m.completionTokens += e.completionTokens || 0; m.totalTokens += e.totalTokens || 0; m.cachedTokens += cached; m.cost += cost;
      totals.calls += 1; totals.promptTokens += e.promptTokens || 0; totals.completionTokens += e.completionTokens || 0; totals.totalTokens += e.totalTokens || 0; totals.cachedTokens += cached; totals.cost += cost;
      if (e.estimated) totals.estimatedCalls += 1;
    }

    const features = Object.values(byFeature)
      .map((a) => ({ ...a, byModel: Object.values(a.byModel) }))
      .sort((x, y) => y.totalTokens - x.totalTokens);

    // Augment with Social Listening batch stats and analysis cache stats
    let batchStats: any = null;
    let cacheStats: any = null;
    try {
      const { ListeningBatchJobModel } = await import('../models/SocialListening/ListeningBatchJob');
      const batchMatch: any = scope === 'me' ? {} : {};  // batch jobs are workspace-level, not user-level
      const [pendingCount, completedCount, failedCount] = await Promise.all([
        ListeningBatchJobModel.countDocuments({ status: 'pending' }),
        ListeningBatchJobModel.countDocuments({ status: 'completed' }),
        ListeningBatchJobModel.countDocuments({ status: { $in: ['failed', 'superseded'] } }),
      ]);
      const recentCompleted = await ListeningBatchJobModel.find({ status: 'completed' })
        .sort({ completedAt: -1 }).limit(5)
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
          turnaroundMinutes: j.completedAt && j.submittedAt
            ? Math.round((new Date(j.completedAt).getTime() - new Date(j.submittedAt).getTime()) / 60000)
            : null,
        })),
      };
    } catch { /* non-fatal */ }

    try {
      const { ListeningAnalysisCacheModel } = await import('../models/SocialListening/ListeningAnalysisCache');
      const [totalCached, recentHits] = await Promise.all([
        ListeningAnalysisCacheModel.countDocuments({}),
        ListeningAnalysisCacheModel.aggregate([{ $group: { _id: null, totalHits: { $sum: '$hits' }, avgHits: { $avg: '$hits' } } }]),
      ]);
      cacheStats = {
        cachedAnalyses: totalCached,
        totalCacheHits: recentHits[0]?.totalHits || 0,
        avgHitsPerEntry: recentHits[0] ? Math.round((recentHits[0].avgHits || 0) * 10) / 10 : 0,
        // Estimated tokens saved: each cache hit avoids ~500 tokens of analysis
        estimatedTokensSaved: (recentHits[0]?.totalHits || 0) * 500,
      };
    } catch { /* non-fatal */ }

    res.json({ scope, totals, features, eventCount: events.length, batchStats, cacheStats });
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
    const events = await AIUsageEvent.find(match).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({
      events: (events as any[]).map((e) => ({
        feature: e.feature, provider: e.provider, model: e.model,
        promptTokens: e.promptTokens, completionTokens: e.completionTokens, totalTokens: e.totalTokens,
        cachedTokens: e.cachedTokens || 0,
        estimated: e.estimated, callType: e.callType, createdAt: e.createdAt,
        cost: priceFor(e.model, e.promptTokens || 0, e.completionTokens || 0, e.cachedTokens || 0),
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
    vlog('usage:reset', { scope, deleted: result?.deletedCount ?? 0, by: userId });
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
      userId,
    );
    if (!workspaceId) return res.status(400).json({ error: 'No workspace found' });

    const { getStoredWorkspaceContext } = await import('../services/WorkspaceContextAccessor');
    let snapshot = await getStoredWorkspaceContext(userId, workspaceId);
    if (!snapshot) {
      // Nothing stored yet — build once and persist into the memory doc so the
      // UI isn't empty on first view.
      const { buildWorkspaceContext } = await import('../services/WorkspaceContextService');
      const { refreshWorkspaceContext } = await import('../services/WorkspaceContextAccessor');
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
router.post('/context/refresh', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const workspaceId = await resolveMemoryWorkspaceId(
      (req.body?.workspaceId as string) || req.user.workspaceId,
      userId,
    );
    if (!workspaceId) return res.status(400).json({ error: 'No workspace found' });

    const { refreshWorkspaceContext } = await import('../services/WorkspaceContextAccessor');
    await refreshWorkspaceContext(workspaceId, userId, 'manual');
    res.json({ success: true });
  } catch (error: any) {
    console.error('[VEEGPT] Refresh context error:', error?.message);
    res.status(500).json({ error: 'Failed to refresh workspace context' });
  }
});

// ── Post Agent: resolve AI fields (caption/hashtags) before the client posts ────
// The actual create+schedule/publish is done by the client via the proven
// /api/content endpoints (same path the manual composer used). This endpoint
// only does the AI work (generate caption/hashtags, analyze media) and returns
// the finalized plan, so we keep one reliable posting path.
router.post('/post-agent/execute', requireAuth, async (req: any, res: Response) => {
  try {
    const { plan, mediaUrls } = req.body || {};
    const userId = req.user.id;
    const workspaceId = (req.body?.workspaceId as string) || req.user.workspaceId;
    if (!plan) return res.status(400).json({ error: 'plan is required' });

    const prefs = await getWorkspaceAIPreferences(workspaceId, userId);

    let caption = (plan.caption || '').toString();
    let hashtags: string[] = Array.isArray(plan.hashtags) ? plan.hashtags : [];

    if ((plan.generateCaption || plan.generateHashtags) && Array.isArray(mediaUrls) && mediaUrls.length) {
      try {
        const isVideo = plan.type === 'reel';
        let mediaAnalysis: string | undefined;
        try {
          const desc = await withAIFeature('veegpt.media_analysis', { userId, workspaceId }, () => aiServiceManager.analyzeMedia(mediaUrls[0], isVideo ? 'video' : 'image', prefs));
          if (desc) mediaAnalysis = `Visual analysis: ${desc}`;
        } catch {}
        const variations = await withAIFeature('veegpt.post_caption', { userId, workspaceId }, () => aiServiceManager.generateInstagramCaptions({
          userId, workspaceId: workspaceId || userId,
          topic: caption || 'Social media post',
          mediaAnalysis,
          postType: (plan.type === 'story' || plan.type === 'reel') ? plan.type : 'post',
          platform: 'Instagram', preferences: prefs, singleVariation: true,
        }));
        const best = variations?.[0];
        if (best?.caption && plan.generateCaption) caption = best.caption;
        // The caption generator embeds hashtags at the END of the caption text
        // (there's no separate hashtags array). Extract them so the card can
        // show a dedicated hashtag list. Prefer an explicit array if present.
        if (plan.generateHashtags) {
          const bestHashtags = (best as any)?.hashtags;
          if (Array.isArray(bestHashtags) && bestHashtags.length) {
            hashtags = bestHashtags.map((h: string) => String(h).replace(/^#+/, ''));
          } else {
            const source: string = best?.caption || caption || '';
            const found = (source.match(/#[\p{L}\p{N}_]+/gu) || []).map((h: string) => h.replace(/^#+/, ''));
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
        const seed = (caption || plan.caption || 'social media post').slice(0, 400);
        const htPrompt =
          'Generate 8 to 12 relevant, high-quality Instagram hashtags for the post below. ' +
          'Mix popular and niche tags for discoverability. ' +
          'Return ONLY a JSON array of strings WITHOUT the # symbol, e.g. ["travel","sunset"].\n\n' +
          `Post: "${seed}"`;
        const htResult = await withAIFeature('veegpt.post_hashtags', { userId, workspaceId }, () => aiServiceManager.generateJSON(htPrompt, { ...prefs, responseLength: 'short', creativityLevel: 0.4 }));
        const arr = Array.isArray(htResult) ? htResult : (Array.isArray(htResult?.hashtags) ? htResult.hashtags : []);
        const cleaned = arr.map((h: any) => String(h).replace(/^#+/, '').trim()).filter(Boolean);
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

    vlog('post-agent:resolved', { hasCaption: !!caption, hashtags: hashtags.length });
    res.json({ caption, hashtags });
  } catch (error: any) {
    console.error('[VEEGPT] post-agent execute error:', error?.message);
    res.status(500).json({ error: error?.message || 'Failed to resolve post' });
  }
});

// ── Research history + background trend refresh ─────────────────────────────

/** GET recent research reports for the workspace (durable history). */
router.get('/research/history', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const workspaceId = await resolveMemoryWorkspaceId((req.query.workspaceId as string) || req.user.workspaceId, userId);
    if (!workspaceId) return res.status(400).json({ error: 'No workspace found' });
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 20, 50));
    const { ResearchReport } = await import('../models/Research/ResearchModels');
    const reports = await ResearchReport.find({ workspaceId }).sort({ createdAt: -1 }).limit(limit).lean();
    res.json({ success: true, reports });
  } catch (error: any) {
    console.error('[VEEGPT] research history error:', error?.message);
    res.status(500).json({ error: 'Failed to fetch research history' });
  }
});

/** GET the latest stored trend snapshot for a niche (workspace-scoped). */
router.get('/research/trends', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const workspaceId = await resolveMemoryWorkspaceId((req.query.workspaceId as string) || req.user.workspaceId, userId);
    if (!workspaceId) return res.status(400).json({ error: 'No workspace found' });
    const { TrendTopic } = await import('../models/Research/ResearchModels');
    const niche = (req.query.niche as string)?.toLowerCase().trim();
    const docs = niche
      ? await TrendTopic.find({ workspaceId, niche }).lean()
      : await TrendTopic.find({ workspaceId }).sort({ updatedAt: -1 }).limit(10).lean();
    res.json({ success: true, trends: docs });
  } catch (error: any) {
    console.error('[VEEGPT] research trends error:', error?.message);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

/** POST trigger a background refresh of trends for a niche/query. */
router.post('/research/refresh', requireAuth, async (req: any, res: Response) => {
  try {
    const userId = req.user.id;
    const workspaceId = await resolveMemoryWorkspaceId(req.body?.workspaceId || req.user.workspaceId, userId);
    if (!workspaceId) return res.status(400).json({ error: 'No workspace found' });
    const query = String(req.body?.query || '').trim();
    if (!query) return res.status(400).json({ error: 'query is required' });
    const kind = ['trends', 'competitors', 'niche-insights'].includes(req.body?.kind) ? req.body.kind : 'trends';

    const { isResearchQueueAvailable, ResearchQueueManager } = await import('../queues/researchQueue');
    if (isResearchQueueAvailable()) {
      const enqueued = await ResearchQueueManager.enqueue({ kind, workspaceId, userId, query });
      return res.json({ success: true, status: enqueued ? 'queued' : 'unavailable' });
    }
    // No queue → run inline (best-effort, fire-and-forget).
    const { research } = await import('../services/research/webResearch.service');
    void research(query, { mode: kind === 'competitors' ? 'competitors' : 'trends', userId, workspaceId }).catch(() => {});
    res.json({ success: true, status: 'inline' });
  } catch (error: any) {
    console.error('[VEEGPT] research refresh error:', error?.message);
    res.status(500).json({ error: 'Failed to refresh research' });
  }
});

export default router;
