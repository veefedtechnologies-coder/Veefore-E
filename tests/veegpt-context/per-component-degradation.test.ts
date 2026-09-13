import { describe, it, expect } from 'vitest';

import {
  classifyIntent,
  ALL_CAPABILITIES,
  type ClassifyIntentInput,
} from '../../server/routes/veegpt-intent.logic';
import { selectModules, STATIC_MODULES, CONTEXT_MODULES, type ComposeInput } from '../../server/routes/veegpt-modules';
import { selectTools } from '../../server/routes/veegpt-tool-selection.logic';
import { retrieveUserMemory, type MemoryItem } from '../../server/routes/veegpt-memory-retrieval.logic';
import { planHistoryCompaction } from '../../server/routes/veegpt-history-compaction.logic';
import { reduceToolResult } from '../../server/routes/veegpt-tool-result.logic';
import { compose } from '../../server/routes/veegpt-context-composer';
import type { Msg } from '../../server/routes/veegpt-memory.logic';
import type { ChatTool } from '../../server/services/AIServiceManager';

// Feature: veegpt-context-optimization — task 12.1
// Per-component graceful degradation + regression indicators (Req 19.1–19.7, 3.6).
//
// This suite is the executable form of the design's Error Handling table: it
// asserts that EVERY listed failure point (a) degrades INDEPENDENTLY to the
// current behavior without failing the request, and (b) surfaces a
// regression/fallback indicator (a `usedFallback`/`failedOpen`/`retainedAboveMax`
// flag on the pure module). Pure and deterministic — no DB, network, or model
// calls.

/** A minimal valid ComposeInput for the composer no-op-safety checks. */
function makeInput(overrides: Partial<ComposeInput> = {}): ComposeInput {
  return {
    prefs: { contentSafety: 'strict', aiMemory: 'long-term', captionStyle: 'punchy' },
    history: [
      { role: 'user', content: 'hello there' },
      { role: 'assistant', content: 'hi, how can I help?' },
    ],
    currentMessage: 'What should I post this week?',
    memorySummary: 'Earlier we discussed the Reels strategy.',
    userMemoryProfile: 'brand color is blue',
    workspaceContext: 'Workspace: @acme, 12k followers',
    tier: 'advanced',
    ...overrides,
  };
}

describe('task 12.1 · per-component graceful degradation + regression indicators', () => {
  // ── Intent classification throws → intents=ALL, ambiguous, usedFallback ──
  it('intent classification throwing → fails open to ALL capabilities with usedFallback=true (Req 6.6/19.1)', () => {
    // Force the try-block to throw by making `message` access throw.
    const throwing = {
      get message(): string {
        throw new Error('boom');
      },
      priorMessages: [],
      hasMedia: false,
    } as unknown as ClassifyIntentInput;

    const intent = classifyIntent(throwing);

    // (a) degrades to current behavior: the full, capability-preserving set.
    expect(intent.intents).toEqual([...ALL_CAPABILITIES]);
    expect(intent.ambiguous).toBe(true);
    // (b) regression indicator surfaced.
    expect(intent.usedFallback).toBe(true);
  });

  it('intent classification empty/ambiguous → widens (ambiguous=true) rather than under-selecting (Req 6.6)', () => {
    const intent = classifyIntent({
      message: 'zzzzz qqqqq wwwww', // non-trivial, no task signal
      priorMessages: [],
      hasMedia: false,
    });
    expect(intent.ambiguous).toBe(true);
    expect(intent.intents).toContain('chat');
  });

  // ── Module selection cannot resolve → complete set incl. static (Req 5.6/19.1) ──
  it('module selection on the fallback intent → returns the complete set including every static module (Req 5.6/19.1)', () => {
    const fallbackIntent = {
      intents: [...ALL_CAPABILITIES],
      ambiguous: true,
      usedFallback: true,
    };
    const modules = selectModules(fallbackIntent, makeInput());
    const ids = new Set(modules.map((m) => m.id));
    for (const staticModule of STATIC_MODULES) {
      expect(ids.has(staticModule.id)).toBe(true);
    }
    // Complete set: every registered module is present when we fail open.
    expect(modules.length).toBe(CONTEXT_MODULES.length);
  });

  // ── Memory retrieval times out → include ALL, keep serving (Req 9.5/9.7/19.2) ──
  it('memory retrieval timeout → includes ALL memory (fail open) and flags failedOpen/timedOut (Req 9.7/19.2)', () => {
    const items: MemoryItem[] = [
      { id: 'm1', text: 'brand voice is playful' },
      { id: 'm2', text: 'posts three times a week' },
    ];
    // Clock jumps past the budget on the first in-loop check.
    let n = 0;
    const clock = () => (n++ === 0 ? 1000 : 5000);

    const res = retrieveUserMemory({
      items,
      currentMessage: 'help me plan the schedule cadence', // has usable tokens
      budgetMs: 1,
      now: clock,
    });

    // (a) keeps serving with all available memory (correctness > tokens).
    expect(res.items).toEqual(items);
    // (b) indicators surfaced.
    expect(res.includedAll).toBe(true);
    expect(res.failedOpen).toBe(true);
    expect(res.timedOut).toBe(true);
  });

  it('memory retrieval error → includes ALL memory (fail open) and flags errored (Req 9.5/19.2)', () => {
    // The stored items are well-formed; the failure is in the relevance
    // computation (a corrupt prior message whose content access throws). The
    // fail-open path must still return the (clean) memory rather than crash.
    const items: MemoryItem[] = [
      { id: 'm1', text: 'brand is acme' },
      { id: 'm2', text: 'audience is gen-z' },
    ];
    const corruptPrior = [
      {
        role: 'user',
        get content(): string {
          throw new Error('corrupt prior message');
        },
      },
    ] as unknown as Msg[];

    const res = retrieveUserMemory({
      items,
      currentMessage: 'what is my brand identity',
      priorMessages: corruptPrior,
    });

    // (a) keeps serving with all available memory (never crashes — Req 19.2).
    expect(res.items).toEqual(items);
    // (b) indicators surfaced.
    expect(res.includedAll).toBe(true);
    expect(res.failedOpen).toBe(true);
    expect(res.errored).toBe(true);
  });

  // ── Summarization fails → keep full recent window + current turn (Req 7.6/19.3) ──
  it('summarization unavailable → retains the full recent window, compacts nothing (Req 7.6/19.3)', () => {
    const window: Msg[] = Array.from({ length: 30 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `turn ${i} — a fairly long message repeated to exceed any small budget`,
    })) as Msg[];

    const plan = planHistoryCompaction({
      recentWindow: window,
      historyTokenBudget: 10, // tiny budget that WOULD force compaction
      summarizationAvailable: false, // …but the summarizer is down
    });

    // (a) full window retained; current turn (owned by composer) untouched.
    expect(plan.history).toEqual(window);
    expect(plan.toCompact).toEqual([]);
    expect(plan.compactionOccurred).toBe(false);
    // (b) indicator surfaced.
    expect(plan.failedOpen).toBe(true);
  });

  // ── Token estimation fails → do not block the request (Req 19.4) ──
  it('token estimation failure → tool-result reduction is a no-op, request is not blocked (Req 19.4)', () => {
    const payload = [{ id: 'p1', caption: 'a'.repeat(500) }];
    const res = reduceToolResult(payload, ['caption'], 1, {
      estimate: () => {
        throw new Error('estimator exploded');
      },
    });
    // Fail-safe: original payload returned unchanged, nothing dropped/blocked.
    expect(res.payload).toBe(payload);
    expect(res.reduced).toBe(false);
  });

  // ── Tool router fails / no selective exposure → full tier set (Req 11.7/19.6) ──
  it('tool selection with no selective exposure → falls open to the full tier-permitted set (Req 11.7/19.6)', () => {
    const res = selectTools({
      tier: 'advanced',
      intents: ['analytics'],
      selectiveToolsSupported: false, // provider lacks selective exposure
    });
    expect(res.usedFallback).toBe(true);
    expect(res.tools.length).toBeGreaterThan(0);
  });

  it('tool selection on ambiguous intent → falls open to the full tier-permitted set (Req 11.7/19.6)', () => {
    const res = selectTools({
      tier: 'advanced',
      intents: [],
      ambiguous: true,
    });
    expect(res.usedFallback).toBe(true);
    expect(res.tools.length).toBeGreaterThan(0);
  });

  // ── Provider caching unavailable → compose/send unchanged (Req 14.4/19.5) ──
  it('caching off vs auto → composed bytes are IDENTICAL (caching is no-op-safe) (Req 14.4/19.5)', () => {
    // Use the time-invariant static modules so the ONLY variable under test is
    // the caching mode (some dynamic modules render a per-call timestamp).
    const input = makeInput();
    const auto = compose(STATIC_MODULES, [], input, { caching: 'auto' });
    const off = compose(STATIC_MODULES, [], input, { caching: 'off' });

    // The mode changes only reported metadata — never the request bytes.
    expect(off.prompt).toBe(auto.prompt);
    expect(off.cacheable.mode).toBe('off');
    expect(off.cacheable.enabled).toBe(false);
    expect(auto.cacheable.mode).toBe('auto');
  });

  // ── Tool-result reduction risk → retain required info even above max (Req 12.4) ──
  it('tool-result over budget with only required info left → retained as-is, retainedAboveMax=true (Req 12.4)', () => {
    const bigText = 'reasoning-required analytics: ' + 'x'.repeat(4000);
    const res = reduceToolResult(bigText, [], 5);
    // Opaque string treated as reasoning-required: kept whole.
    expect(res.payload).toBe(bigText);
    expect(res.retainedAboveMax).toBe(true);
  });

  // ── Fallback is recorded in telemetry (usedFallback) — the shared indicator ──
  it('a fallback on the optimized path is recorded in Token_Telemetry (usedFallback) (Req 16/19.7)', () => {
    const withFallback = compose(CONTEXT_MODULES, [], makeInput(), {
      usedFallback: true,
    });
    expect(withFallback.telemetry.usedFallback).toBe(true);

    const noFallback = compose(CONTEXT_MODULES, [], makeInput(), {
      usedFallback: false,
    });
    expect(noFallback.telemetry.usedFallback).toBe(false);
  });

  // ── Independent degradation (Req 19.7): one failure never disables another ──
  it('multiple components can degrade simultaneously and independently, each still serving (Req 19.7)', () => {
    // Intent throws → fallback.
    const intent = classifyIntent(({
      get message(): string {
        throw new Error('x');
      },
      priorMessages: [],
      hasMedia: false,
    } as unknown) as ClassifyIntentInput);
    expect(intent.usedFallback).toBe(true);

    // Tool selection independently fails open (unrelated to the intent failure).
    const tools = selectTools({ tier: 'advanced', intents: intent.intents, ambiguous: true });
    expect(tools.usedFallback).toBe(true);

    // Memory independently fails open (unrelated to either above).
    const mem = retrieveUserMemory({
      items: [{ id: 'm1', text: 'brand is acme' }],
      currentMessage: 'what do you know about me', // broad recall → include all
    });
    expect(mem.includedAll).toBe(true);

    // The request is still fully composable — none of the failures disabled it.
    const composed = compose(CONTEXT_MODULES, tools.tools as ChatTool[], makeInput(), {
      usedFallback: intent.usedFallback || tools.usedFallback,
    });
    expect(composed.prompt.length).toBeGreaterThan(0);
    expect(composed.telemetry.usedFallback).toBe(true);
  });
});
