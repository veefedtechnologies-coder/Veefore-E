/**
 * Pure (DB-free, LLM-free) capability intent classifier for VeeGPT.
 *
 * This is the `IntentClassifier` half of the `Intent_Router` (Req 6). It derives
 * one or more capability intents for a request from the CURRENT message together
 * with PRIOR messages, without ever issuing an additional model call (Req 6.5).
 *
 * Design contract (see design.md §"Intent_Router / IntentClassifier"):
 *   1. `detectTrivialMessage` runs FIRST (unchanged). A socially trivial message
 *      (greeting/thanks/farewell) is pure chat — no capability tools needed.
 *   2. For non-trivial messages a deterministic, LLM-free classifier produces one
 *      or more `Capability` intents covering ambiguous, multi-intent, follow-up,
 *      previous-message-referencing, indirect-tool, and compound requests (Req 6.2).
 *   3. Selection is PRIMARILY intent-driven and MAY be hybrid — it combines
 *      structural signals (forced tool, attached media, selected account,
 *      follow-up inheritance from prior turns) with lexical signals, so keyword
 *      matching is NEVER the sole mechanism (Req 6.3).
 *   4. It is a pure function, so it is naturally computed at most once per call;
 *      the caller reuses this single result for both module and tool selection and
 *      recomputes at most once per request (Req 6.4).
 *   5. On any throw or an empty classification it fails OPEN to the full
 *      capability set, marked ambiguous + fallback (Req 6.6 / correctness > tokens).
 *
 * The function is deterministic so it can be unit-tested in isolation.
 */

import { detectTrivialMessage } from './veegpt-triage.logic';
import type { Msg } from './veegpt-memory.logic';

/**
 * The capability space VeeGPT can act in. Each capability maps 1:1 to a group of
 * `Context_Module`s and tools (posting/analytics/research/edit/memory/etc.) in the
 * module + tool selection layers.
 */
export type Capability =
  | 'chat'
  | 'content_generation'
  | 'posting'
  | 'edit_content'
  | 'analytics'
  | 'account_data'
  | 'research'
  | 'memory_write'
  | 'workspace_data'
  | 'video_edit';

/** The complete capability set — used for the fail-open / ambiguous fallback. */
export const ALL_CAPABILITIES: readonly Capability[] = [
  'chat',
  'content_generation',
  'posting',
  'edit_content',
  'analytics',
  'account_data',
  'research',
  'memory_write',
  'workspace_data',
  'video_edit',
] as const;

export interface IntentResult {
  /** One or more capability intents; always contains at least `'chat'`. */
  intents: Capability[];
  /** When true, selection should widen (fail open) toward the full module/tool set. */
  ambiguous: boolean;
  /** True when the safe capability-preserving fallback was applied (Req 6.6). */
  usedFallback: boolean;
}

export interface ClassifyIntentInput {
  /** The current user message text. */
  message: string;
  /** Prior conversation messages, oldest→newest (excluding the current message). */
  priorMessages: Msg[];
  /** Whether the current message has an attachment (image/video/pdf). */
  hasMedia: boolean;
  /**
   * Whether the current message has an attached VIDEO specifically. This is the
   * structural "attached-video signal" that pairs with video keyword signals to
   * gate the `video_edit` capability — video keywords are NEVER used alone
   * (Video_Editor Req 2.1 hybrid contract, design §"Intent_Router").
   */
  hasVideo?: boolean;
  /**
   * A tool the user explicitly forced from the composer, if any. This is a strong
   * structural signal that maps directly to a capability (Req 6.3 hybrid input).
   */
  forcedTool?: string;
  /** The social account the user selected in the composer, if any. */
  selectedAccountId?: string | null;
}

// ─── Lexical signal tables (one of SEVERAL signals — never used alone) ───────
//
// Keyword matching is deliberately ONLY one contributor. It is always combined
// with the structural signals below (forced tool, media, selected account,
// follow-up inheritance) so that keyword matching is never the sole mechanism
// that decides an intent (Req 6.3).

const KEYWORD_SIGNALS: ReadonlyArray<{ capability: Capability; pattern: RegExp }> = [
  // Posting / scheduling / publishing.
  {
    capability: 'posting',
    pattern:
      /\b(post|posting|publish|publishing|schedule|scheduling|scheduled|go\s+live|upload)\b/i,
  },
  // Editing existing content.
  {
    capability: 'edit_content',
    pattern:
      /\b(reschedule|re-schedule|cancel|unschedule|edit|update|change|rewrite|delete|remove|duplicate|copy|repost|move)\b/i,
  },
  // On-demand content generation (captions / hashtags / ideas).
  {
    capability: 'content_generation',
    pattern:
      /\b(caption|captions|hashtag|hashtags|write|draft|generate|idea|ideas|brainstorm|hook|copy)\b/i,
  },
  // Analytics / performance / growth / best time.
  {
    capability: 'analytics',
    pattern:
      /\b(analytic|analytics|performance|perform|insight|insights|engagement|reach|impression|impressions|growth|grow|improve|recommend|recommendation|best\s+time|metric|metrics|stats|statistics)\b/i,
  },
  // Selected-account factual data.
  {
    capability: 'account_data',
    pattern:
      /\b(follower|followers|following|audience|demographic|demographics|my\s+account|this\s+account|profile\s+visits)\b/i,
  },
  // Live research / web / trends / competitors.
  {
    capability: 'research',
    pattern:
      /\b(trend|trending|trends|research|report|latest|news|competitor|competitors|search|current|up[\s-]?to[\s-]?date|what.?s\s+happening)\b/i,
  },
  // Durable memory writes.
  {
    capability: 'memory_write',
    pattern:
      /\b(remember|memoris|memoriz|save\s+this|note\s+that|forget|don'?t\s+forget|keep\s+in\s+mind|my\s+name\s+is|my\s+brand|my\s+niche)\b/i,
  },
  // Live workspace data (drafts / scheduled counts / content state).
  {
    capability: 'workspace_data',
    pattern:
      /\b(draft|drafts|scheduled\s+post|scheduled\s+posts|my\s+posts|how\s+many\s+posts|what.?s\s+scheduled|content\s+count|connected\s+account|connected\s+accounts)\b/i,
  },
];

/**
 * Structural signal: map an explicitly forced tool to its capability. This is a
 * non-lexical signal (the user picked a tool, not a phrase), so it satisfies the
 * "not keyword-only" constraint on its own.
 */
export const FORCED_TOOL_CAPABILITY: Readonly<Record<string, Capability>> = {
  schedule_post: 'posting',
  generate_caption: 'content_generation',
  generate_hashtags: 'content_generation',
  get_analytics_insight: 'analytics',
  get_best_posting_time: 'analytics',
  get_account_details: 'account_data',
  research_trends: 'research',
  search_web: 'research',
  deep_research: 'research',
  remember_fact: 'memory_write',
  update_memory: 'memory_write',
  forget_memory: 'memory_write',
  get_workspace_data: 'workspace_data',
  reschedule_post: 'edit_content',
  cancel_scheduled_post: 'edit_content',
  update_post_caption: 'edit_content',
  delete_post: 'edit_content',
  duplicate_post: 'edit_content',
  // The AI Video Editor is now a real chat tool (VeeGPT `video_editor`), so it
  // maps to the `video_edit` capability here. Selecting/forcing it, or the
  // attached-video hybrid gate below, surfaces the tool via `selectTools`.
  video_editor: 'video_edit',
};

/**
 * The forced-tool identifier the composer sets when the user explicitly opens /
 * selects the Video Editor surface. `video_editor` is now BOTH a surface/mode
 * selector AND a registered VeeGPT chat tool, so it appears in
 * `FORCED_TOOL_CAPABILITY` above (→ `video_edit`). Forcing it maps straight to
 * the `video_edit` capability in step 2 of the classifier; the hybrid gate below
 * additionally activates `video_edit` from an attached video + a video keyword.
 */
export const VIDEO_EDITOR_FORCED_TOOL = 'video_editor';

/**
 * Video-editing lexical signal. This is ONE contributor to the `video_edit`
 * capability and is NEVER used alone: it only activates `video_edit` when paired
 * with the structural attached-video signal (`hasVideo`) or an explicitly forced
 * `video_editor` tool (Video_Editor Req 2.1 hybrid contract). Matching the
 * existing "keyword matching is never the sole mechanism" constraint (Req 6.3).
 */
const VIDEO_EDIT_KEYWORD_SIGNAL: RegExp =
  /\b(video|reel|reels|short|shorts|clip|clips|footage|trim|crop|resize|caption|subtitle|subtitles|b-?roll|voiceover|voice-?over|render|export|aspect\s+ratio|remove\s+(the\s+)?(background|object|person)|replace\s+(the\s+)?background|silence|montage|edit\s+(this|my|the)\s+(video|clip|reel|footage))\b/i;

/** Whether the current message carries a video-editing lexical signal. */
function hasVideoEditKeyword(text: string): boolean {
  return VIDEO_EDIT_KEYWORD_SIGNAL.test(text || '');
}

/**
 * Detect a short continuation / follow-up that references a previous turn without
 * restating its subject (e.g. "yes, do it", "the second one", "make it shorter",
 * "what about that"). Such messages carry little lexical signal of their own and
 * must inherit intent from prior turns (Req 6.2 follow-up / references).
 */
function isFollowUpReference(message: string): boolean {
  const norm = message.toLowerCase().trim();
  if (!norm) return false;
  // Referential pronouns / demonstratives pointing at earlier content.
  const referential =
    /\b(it|that|this|those|these|them|the\s+(first|second|third|last|other|previous)|again|instead|the\s+one)\b/i;
  // Bare continuations whose meaning depends entirely on the prior turn.
  const continuation =
    /^(ok|okay|yes|yeah|yep|yup|sure|go\s+ahead|do\s+it|proceed|continue|sounds\s+good|please\s+do|and|also|what\s+about|how\s+about)\b/i;
  const short = norm.split(/\s+/).length <= 6;
  return continuation.test(norm) || (short && referential.test(norm));
}

/** Collect the capabilities implied by lexical signals in a single text. */
function lexicalCapabilities(text: string): Set<Capability> {
  const found = new Set<Capability>();
  for (const { capability, pattern } of KEYWORD_SIGNALS) {
    if (pattern.test(text)) found.add(capability);
  }
  return found;
}

/** Order a capability set into the canonical `ALL_CAPABILITIES` ordering. */
function orderCapabilities(set: Set<Capability>): Capability[] {
  return ALL_CAPABILITIES.filter((c) => set.has(c));
}

/**
 * Classify a request into one or more capability intents.
 *
 * Never throws: any internal error is caught and converted into the safe,
 * capability-preserving fallback (Req 6.6).
 */
export function classifyIntent(input: ClassifyIntentInput): IntentResult {
  try {
    const message = input?.message ?? '';
    const priorMessages = Array.isArray(input?.priorMessages) ? input.priorMessages : [];
    const hasMedia = Boolean(input?.hasMedia);
    const hasVideo = Boolean(input?.hasVideo);

    // 1) Trivial-message short-circuit (reuse existing deterministic detector).
    //    A bare greeting/thanks/farewell is pure chat — no capability tools.
    if (detectTrivialMessage(message, hasMedia)) {
      return { intents: ['chat'], ambiguous: false, usedFallback: false };
    }

    const intents = new Set<Capability>();

    // 2) Structural signal — explicitly forced tool maps straight to a capability.
    if (input?.forcedTool) {
      const forced = FORCED_TOOL_CAPABILITY[input.forcedTool];
      if (forced) intents.add(forced);
    }

    // 3) Structural signal — attached media strongly implies a posting/creation
    //    turn (the user is trying to DO something with the media), never trivial.
    if (hasMedia) {
      intents.add('posting');
    }

    // 4) Lexical signals from the current message (one of several inputs).
    for (const cap of lexicalCapabilities(message)) intents.add(cap);

    // 4b) Video-editing hybrid gate (Video_Editor Req 2.1). `video_edit` is
    //     activated by a STRUCTURAL signal — either the user explicitly forced the
    //     Video Editor surface (`forcedTool === 'video_editor'`) or an attached
    //     video paired with a video keyword. Video keywords are NEVER sufficient
    //     on their own: a keyword requires the attached-video signal to activate.
    const forcedVideoEditor = input?.forcedTool === VIDEO_EDITOR_FORCED_TOOL;
    if (forcedVideoEditor || (hasVideo && hasVideoEditKeyword(message))) {
      intents.add('video_edit');
    }

    // 5) Follow-up inheritance — a short continuation / reference message carries
    //    little of its own signal, so inherit the capabilities of the most recent
    //    user turns. This covers follow-ups and messages referencing prior turns
    //    (Req 6.2) and is a structural (position-based) signal, not a keyword one.
    let ambiguousFollowUp = false;
    if (isFollowUpReference(message)) {
      const recentUser = priorMessages
        .filter((m) => m && m.role !== 'assistant')
        .slice(-3);
      let inherited = 0;
      for (const m of recentUser) {
        for (const cap of lexicalCapabilities(m.content || '')) {
          if (cap !== 'chat') {
            intents.add(cap);
            inherited++;
          }
        }
      }
      // A follow-up we could not resolve to any prior capability is ambiguous:
      // widen selection rather than guess (fail open).
      if (inherited === 0) ambiguousFollowUp = true;
    }

    // 6) Structural signal — a selected account makes account_data plausible when
    //    the turn already looks data/analytics oriented, but never on its own.
    if (input?.selectedAccountId && (intents.has('analytics') || intents.has('workspace_data'))) {
      intents.add('account_data');
    }

    // Base chat capability is always available (general conversation).
    intents.add('chat');

    // 7) Ambiguity: if the ONLY capability we resolved is plain chat (no concrete
    //    task signal) yet the message is non-trivial, or an unresolved follow-up,
    //    widen selection toward completeness rather than under-selecting.
    const taskIntents = orderCapabilities(intents).filter((c) => c !== 'chat');
    const ambiguous = ambiguousFollowUp || taskIntents.length === 0;

    return {
      intents: orderCapabilities(intents),
      ambiguous,
      usedFallback: false,
    };
  } catch {
    // Fail open to the full capability set (Req 6.6 / correctness > tokens).
    return {
      intents: [...ALL_CAPABILITIES],
      ambiguous: true,
      usedFallback: true,
    };
  }
}
