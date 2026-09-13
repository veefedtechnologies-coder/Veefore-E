/**
 * Developer-retrievable telemetry surface
 * (spec: veegpt-context-optimization, task 12.2, Req 16.3/16.4).
 *
 * Task 12.2 wires the optimized composed request's `Token_Telemetry` into the
 * existing observability path (`recordTokenTelemetry`) so a developer can
 * retrieve the composition decision — which `Context_Module`s were selected,
 * which tools were exposed, whether compaction/memory/caching occurred, whether
 * a fallback was taken, and which model/provider answered — WITHOUT ever
 * logging full prompts or full user content (Req 16.4).
 *
 * These tests mirror EXACTLY what the route's `composeWithComposer` does behind
 * the Optimization_Flag: it runs `compose(...)` over the real module registry
 * with a user message that carries a distinctive secret, then emits the
 * telemetry via `recordTokenTelemetry`. We assert the surface (the metadata-only
 * debug log AND the returned ledger `meta`) exposes the required metadata and
 * never the composed prompt bytes or the user's private content.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compose } from '../../server/routes/veegpt-context-composer';
import { recordTokenTelemetry } from '../../server/routes/veegpt-token-telemetry';
import {
  CONTEXT_MODULES,
  type ComposeInput,
} from '../../server/routes/veegpt-modules';
import type { ChatTool } from '../../server/services/AIServiceManager';
import logger from '../../server/config/logger';

// A distinctive private string standing in for real user content. If it ever
// surfaces in the developer telemetry, privacy has been violated (Req 16.4).
const SECRET =
  'CONFIDENTIAL my card is 4111-1111-1111-1111 and my password is hunter2';

/** Realistic ComposeInput whose current message carries the secret. */
function makeInput(): ComposeInput {
  return {
    prefs: { contentSafety: 'strict', aiMemory: 'long-term', captionStyle: 'punchy' },
    history: [
      { role: 'user', content: `earlier I said: ${SECRET}` },
      { role: 'assistant', content: 'noted.' },
    ],
    currentMessage: `Please remember ${SECRET} and schedule my post`,
    memorySummary: `The user shared ${SECRET} in a prior turn.`,
    userMemoryProfile: `private fact: ${SECRET}`,
    workspaceContext: 'Workspace: @acme, 12k followers',
    tier: 'advanced',
  };
}

const TOOLS: ChatTool[] = [
  {
    type: 'function',
    function: {
      name: 'schedule_post',
      description: 'Schedule a post.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_workspace_data',
      description: 'Read the workspace posts/drafts.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

/** Deep-walk any value and collect every string it contains. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const v of value) collectStrings(v, out);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectStrings(v, out);
  }
  return out;
}

/** True if `needle` appears verbatim anywhere inside `value`. */
function containsText(value: unknown, needle: string): boolean {
  return collectStrings(value).some((s) => s.includes(needle));
}

describe('developer-retrievable telemetry surface (task 12.2, Req 16.3/16.4)', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => logger as never);
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  /** Reproduce the route's optimized emission: compose then record telemetry. */
  function composeAndRecord() {
    const composed = compose(CONTEXT_MODULES, TOOLS, makeInput(), {
      model: 'gpt-5',
      provider: 'openai',
      requestType: 'posting',
      memoryRetrieved: true,
    });
    const meta = recordTokenTelemetry(composed.telemetry, {
      userId: 'user-1',
      workspaceId: 'ws-1',
      requestId: '42',
    });
    return { composed, meta };
  }

  it('exposes the selected modules, exposed tools, flags, and model (Req 16.3)', () => {
    const { composed, meta } = composeAndRecord();

    // The emitted debug log is the developer-retrievable observability surface.
    expect(debugSpy).toHaveBeenCalledTimes(1);
    const [message, payload] = debugSpy.mock.calls[0] as [string, any];
    expect(message).toBe('veegpt context token telemetry');

    // Every Req 16.3 field is present and retrievable.
    expect(payload.selectedModules).toEqual(composed.telemetry.selectedModules);
    expect(payload.selectedModules.length).toBeGreaterThan(0);
    expect(payload.exposedTools).toEqual(['schedule_post', 'get_workspace_data']);
    expect(payload.compactionOccurred).toBe(false);
    expect(payload.memoryRetrieved).toBe(true);
    expect(typeof payload.cacheUsed).toBe('boolean');
    expect(typeof payload.usedFallback).toBe('boolean');
    expect(payload.model).toBe('gpt-5');
    expect(payload.provider).toBe('openai');

    // The same privacy-safe payload also rides the ledger meta (retrievable via
    // the metering path, not a new datastore).
    const ct = (meta.contextTelemetry as Record<string, unknown>);
    expect(ct.selectedModules).toEqual(composed.telemetry.selectedModules);
    expect(ct.exposedTools).toEqual(['schedule_post', 'get_workspace_data']);
    expect(ct.model).toBe('gpt-5');
    expect(ct.memoryRetrieved).toBe(true);
  });

  it('never logs the composed prompt or full user content (Req 16.4)', () => {
    const { composed, meta } = composeAndRecord();
    const [, payload] = debugSpy.mock.calls[0] as [string, any];

    // The secret user content must not appear in EITHER the debug log or meta.
    expect(containsText(payload, SECRET)).toBe(false);
    expect(containsText(meta, SECRET)).toBe(false);

    // The composed prompt itself is never emitted verbatim, either.
    expect(containsText(payload, composed.prompt)).toBe(false);
    expect(containsText(meta, composed.prompt)).toBe(false);
  });

  it('records only counts and metadata — token counts are numbers, not text', () => {
    composeAndRecord();
    const [, payload] = debugSpy.mock.calls[0] as [string, any];
    for (const v of Object.values(payload.perCategoryTokens as Record<string, unknown>)) {
      expect(typeof v).toBe('number');
    }
    expect(typeof payload.totalInputTokens).toBe('number');
  });

  it('surfaces the fallback flag when the composed request used a fallback', () => {
    // A compose with usedFallback set (mirrors intent-fallback on the route).
    const composed = compose(CONTEXT_MODULES, TOOLS, makeInput(), {
      model: 'gpt-5',
      usedFallback: true,
    });
    const meta = recordTokenTelemetry(composed.telemetry);
    const [, payload] = debugSpy.mock.calls[0] as [string, any];
    expect(payload.usedFallback).toBe(true);
    expect((meta.contextTelemetry as Record<string, unknown>).usedFallback).toBe(true);
    expect(containsText(meta, SECRET)).toBe(false);
  });
});
