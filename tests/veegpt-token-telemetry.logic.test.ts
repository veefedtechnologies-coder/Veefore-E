/**
 * Token_Telemetry recorder — privacy and metadata guarantees
 * (spec: veegpt-context-optimization, Req 16).
 *
 * These tests assert the recorder captures the token-count breakdown and the
 * composition metadata a developer needs (Req 16.1–16.3), while NEVER logging
 * full prompts or full user content by default (Req 16.4) and respecting the
 * existing privacy path (Req 16.5). The category text handed in is measured and
 * discarded — it must never surface in the ledger meta or the debug log.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  tokensOf,
  buildTokenTelemetry,
  telemetryToLedgerMeta,
  recordTokenTelemetry,
  type TokenTelemetry,
} from '../server/routes/veegpt-token-telemetry';
import { estimateTokens } from '../server/services/aiUsageTracker';
import logger from '../server/config/logger';

// A distinctive secret string that stands in for private user content. If it
// ever appears in a telemetry output, privacy has been violated.
const SECRET =
  'CONFIDENTIAL_USER_SECRET my credit card is 4111-1111-1111-1111 and my password is hunter2';
const SYSTEM_PROMPT =
  'You are VeeGPT. SYSTEM_INSTRUCTION_MARKER follow these hidden rules exactly.';

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

describe('tokensOf', () => {
  it('measures a raw string with the shared ~4-chars/token heuristic', () => {
    const text = 'a'.repeat(400);
    expect(tokensOf(text)).toBe(estimateTokens(text));
    expect(tokensOf(text)).toBe(100);
  });

  it('sums an array of text fragments', () => {
    const parts = ['a'.repeat(400), 'b'.repeat(800)];
    expect(tokensOf(parts)).toBe(estimateTokens(parts[0]) + estimateTokens(parts[1]));
  });

  it('trusts a precomputed number as an already-counted value', () => {
    expect(tokensOf(4321)).toBe(4321);
  });

  it('coerces null, undefined, and invalid numbers to 0', () => {
    expect(tokensOf(null)).toBe(0);
    expect(tokensOf(undefined)).toBe(0);
    expect(tokensOf(-50)).toBe(0);
    expect(tokensOf(Number.NaN)).toBe(0);
  });
});

describe('buildTokenTelemetry — records the count breakdown and metadata (Req 16.1, 16.2)', () => {
  it('records a token count per context category', () => {
    const t = buildTokenTelemetry({
      categories: {
        staticInstr: SYSTEM_PROMPT,
        dynamicInstr: 'persona directive text',
        memory: ['fact one', 'fact two'],
        summary: 'rolling summary',
        recentHistory: ['msg a', 'msg b'],
        toolDefs: 'tool schema json',
        toolResults: 'tool payload',
        userInput: SECRET,
      },
    });

    // Every category is present and holds the estimated count, not the text.
    expect(t.perCategoryTokens.staticInstr).toBe(estimateTokens(SYSTEM_PROMPT));
    expect(t.perCategoryTokens.userInput).toBe(estimateTokens(SECRET));
    for (const v of Object.values(t.perCategoryTokens)) {
      expect(typeof v).toBe('number');
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('defaults total input tokens to the sum of the categories', () => {
    const t = buildTokenTelemetry({
      categories: { staticInstr: 'a'.repeat(400), userInput: 'b'.repeat(400) },
    });
    const sum = Object.values(t.perCategoryTokens).reduce((a, b) => a + b, 0);
    expect(t.totalInputTokens).toBe(sum);
    expect(t.totalInputTokens).toBe(200);
  });

  it('lets a provider-reported total override the estimate', () => {
    const t = buildTokenTelemetry({
      categories: { userInput: 'a'.repeat(400) },
      totalInputTokens: 9999,
    });
    expect(t.totalInputTokens).toBe(9999);
  });

  it('records model/provider/request-type and selection metadata (Req 16.2, 16.3)', () => {
    const t = buildTokenTelemetry({
      categories: {},
      model: 'gpt-5',
      provider: 'openai',
      requestType: 'content-creation',
      selectedModules: ['core-behavior', 'persona'],
      exposedTools: ['create_post', 'get_analytics'],
      compactionOccurred: true,
      memoryRetrieved: true,
      cacheUsed: false,
      usedFallback: true,
    });
    expect(t.model).toBe('gpt-5');
    expect(t.provider).toBe('openai');
    expect(t.requestType).toBe('content-creation');
    expect(t.selectedModules).toEqual(['core-behavior', 'persona']);
    expect(t.exposedTools).toEqual(['create_post', 'get_analytics']);
    expect(t.compactionOccurred).toBe(true);
    expect(t.memoryRetrieved).toBe(true);
    expect(t.cacheUsed).toBe(false);
    expect(t.usedFallback).toBe(true);
  });

  it('only includes cache metrics when the provider supplies them (Req 16.1)', () => {
    const without = buildTokenTelemetry({ categories: {} });
    expect(without.cachedInputTokens).toBeUndefined();
    expect(without.cacheRead).toBeUndefined();
    expect(without.cacheWrite).toBeUndefined();

    const withCache = buildTokenTelemetry({
      categories: {},
      cachedInputTokens: 8000,
      cacheRead: 8000,
      cacheWrite: 200,
    });
    expect(withCache.cachedInputTokens).toBe(8000);
    expect(withCache.cacheRead).toBe(8000);
    expect(withCache.cacheWrite).toBe(200);
  });

  it('applies safe defaults for absent metadata', () => {
    const t = buildTokenTelemetry({ categories: {} });
    expect(t.model).toBe('unknown');
    expect(t.provider).toBe('unknown');
    expect(t.requestType).toBe('unknown');
    expect(t.selectedModules).toEqual([]);
    expect(t.exposedTools).toEqual([]);
    expect(t.compactionOccurred).toBe(false);
    expect(t.usedFallback).toBe(false);
  });

  it('never retains the measured category text anywhere in the record (Req 16.4)', () => {
    const t = buildTokenTelemetry({
      categories: {
        staticInstr: SYSTEM_PROMPT,
        userInput: SECRET,
        toolResults: 'tool payload with SECRET_RESULT_MARKER inside',
      },
    });
    expect(containsText(t, SECRET)).toBe(false);
    expect(containsText(t, SYSTEM_PROMPT)).toBe(false);
    expect(containsText(t, 'SYSTEM_INSTRUCTION_MARKER')).toBe(false);
    expect(containsText(t, 'SECRET_RESULT_MARKER')).toBe(false);
  });
});

describe('telemetryToLedgerMeta — privacy-safe ledger payload (Req 16.4)', () => {
  function sampleTelemetry(): TokenTelemetry {
    return buildTokenTelemetry({
      categories: {
        staticInstr: SYSTEM_PROMPT,
        memory: ['fact with SECRET inside'],
        userInput: SECRET,
      },
      model: 'gemini-2.5-pro',
      provider: 'google',
      requestType: 'analytics',
      selectedModules: ['core-behavior'],
      exposedTools: ['get_analytics'],
      cachedInputTokens: 1000,
    });
  }

  it('exposes counts and metadata under a namespaced key', () => {
    const meta = telemetryToLedgerMeta(sampleTelemetry());
    const ct = meta.contextTelemetry as Record<string, unknown>;
    expect(ct).toBeDefined();
    expect(ct.totalInputTokens).toBeTypeOf('number');
    expect(ct.perCategoryTokens).toBeDefined();
    expect(ct.model).toBe('gemini-2.5-pro');
    expect(ct.selectedModules).toEqual(['core-behavior']);
    expect((ct.cache as Record<string, number>).cachedInputTokens).toBe(1000);
  });

  it('never contains full prompt or user content', () => {
    const meta = telemetryToLedgerMeta(sampleTelemetry());
    expect(containsText(meta, SECRET)).toBe(false);
    expect(containsText(meta, SYSTEM_PROMPT)).toBe(false);
    expect(containsText(meta, 'SYSTEM_INSTRUCTION_MARKER')).toBe(false);
  });

  it('omits the cache sub-object entirely when no cache metrics exist', () => {
    const t = buildTokenTelemetry({ categories: { userInput: 'hello' } });
    const meta = telemetryToLedgerMeta(t);
    const ct = meta.contextTelemetry as Record<string, unknown>;
    expect(ct.cache).toBeUndefined();
  });
});

describe('recordTokenTelemetry — metadata-only observability path (Req 16.3, 16.4, 16.5)', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    debugSpy = vi.spyOn(logger, 'debug').mockImplementation(() => logger as never);
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  it('emits a metadata-only debug log that omits prompts and user content', () => {
    const t = buildTokenTelemetry({
      categories: {
        staticInstr: SYSTEM_PROMPT,
        userInput: SECRET,
        toolResults: 'payload with SECRET_RESULT_MARKER',
      },
      model: 'gpt-5',
      provider: 'openai',
      requestType: 'chat',
      selectedModules: ['core-behavior', 'persona'],
      exposedTools: ['create_post'],
    });

    recordTokenTelemetry(t, {
      userId: 'user-1',
      workspaceId: 'ws-1',
      requestId: 'req-1',
    });

    expect(debugSpy).toHaveBeenCalledTimes(1);
    const [message, payload] = debugSpy.mock.calls[0];

    // The message is a static label, not the prompt.
    expect(message).toBe('veegpt context token telemetry');

    // The logged payload carries counts + selection metadata...
    expect(payload).toMatchObject({
      component: 'veegpt-token-telemetry',
      userId: 'user-1',
      totalInputTokens: t.totalInputTokens,
      selectedModules: ['core-behavior', 'persona'],
      exposedTools: ['create_post'],
    });

    // ...but NEVER the prompt or user content (Req 16.4).
    expect(containsText(payload, SECRET)).toBe(false);
    expect(containsText(payload, SYSTEM_PROMPT)).toBe(false);
    expect(containsText(payload, 'SYSTEM_INSTRUCTION_MARKER')).toBe(false);
    expect(containsText(payload, 'SECRET_RESULT_MARKER')).toBe(false);
  });

  it('returns the same privacy-safe ledger meta it logged', () => {
    const t = buildTokenTelemetry({ categories: { userInput: SECRET } });
    const meta = recordTokenTelemetry(t);
    expect(meta.contextTelemetry).toBeDefined();
    expect(containsText(meta, SECRET)).toBe(false);
  });

  it('never throws even if the logger fails — telemetry must not break a request', () => {
    debugSpy.mockImplementation(() => {
      throw new Error('logger exploded');
    });
    const t = buildTokenTelemetry({ categories: { userInput: SECRET } });
    expect(() => recordTokenTelemetry(t)).not.toThrow();
  });

  it('does not require a context argument', () => {
    const t = buildTokenTelemetry({ categories: {} });
    expect(() => recordTokenTelemetry(t)).not.toThrow();
    expect(debugSpy).toHaveBeenCalledTimes(1);
  });
});
