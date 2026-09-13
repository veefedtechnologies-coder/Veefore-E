/**
 * Provider-boundary guard tests (Block 5).
 *
 * These lock in the property that makes VGU coverage structural rather than
 * per-file: a provider call made outside a metered context is detected, and in
 * strict mode blocked before it can reach the network.
 *
 * The OpenAI transport is stubbed, so nothing here talks to a provider — the
 * subject under test is the guard, not the SDK.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  createOpenAI,
  enforcementMode,
  providerGuardStats,
  resetProviderGuardStats,
  UnmeteredAICallError,
} from '../server/services/ai-provider-guard';
import {
  collectAIUsageInto,
  currentAIContext,
  recordToolRun,
} from '../server/services/aiUsageTracker';

const ORIGINAL_MODE = process.env.VGU_ENFORCEMENT;

/** A guarded client whose HTTP layer is replaced with a canned response. */
function stubClient(usage?: Record<string, number>) {
  const client = createOpenAI({ apiKey: 'sk-test' });
  (client as unknown as { post: unknown }).post = async () => ({
    id: 'stub',
    model: 'gpt-4o-mini',
    choices: [{ message: { content: 'stub' } }],
    usage: usage ?? {
      prompt_tokens: 100,
      completion_tokens: 20,
      total_tokens: 120,
    },
  });
  return client;
}

/** Run `fn` inside a metered context, the way withVGU does. */
async function metered<T>(
  sink: { usage: any[]; externalCostUSD: { total: number }; toolsRun: string[] },
  fn: () => Promise<T>
): Promise<T> {
  return collectAIUsageInto('caption.generation', { userId: 'u1' }, sink, fn);
}

function newSink() {
  return {
    usage: [] as any[],
    externalCostUSD: { total: 0 },
    toolsRun: [] as string[],
  };
}

beforeEach(() => {
  resetProviderGuardStats();
});

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.VGU_ENFORCEMENT;
  else process.env.VGU_ENFORCEMENT = ORIGINAL_MODE;
});

describe('enforcement mode', () => {
  it('defaults to warn so it is safe to deploy before soaking', () => {
    delete process.env.VGU_ENFORCEMENT;
    expect(enforcementMode()).toBe('warn');
  });

  it('accepts strict and off, and treats anything else as warn', () => {
    process.env.VGU_ENFORCEMENT = 'strict';
    expect(enforcementMode()).toBe('strict');
    process.env.VGU_ENFORCEMENT = 'off';
    expect(enforcementMode()).toBe('off');
    process.env.VGU_ENFORCEMENT = 'nonsense';
    expect(enforcementMode()).toBe('warn');
  });
});

describe('unmetered provider calls', () => {
  it('detects a call made with no metered context', async () => {
    process.env.VGU_ENFORCEMENT = 'warn';
    await stubClient().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'x' }],
    });
    const s = providerGuardStats();
    expect(s.guardedCalls).toBe(1);
    expect(s.unmeteredCalls).toBe(1);
    // warn mode is observability only: nothing is blocked.
    expect(s.blockedCalls).toBe(0);
  });

  it('BLOCKS the call in strict mode', async () => {
    process.env.VGU_ENFORCEMENT = 'strict';
    await expect(
      stubClient().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'x' }],
      })
    ).rejects.toBeInstanceOf(UnmeteredAICallError);
    expect(providerGuardStats().blockedCalls).toBe(1);
  });

  it('allows the same call inside a metered context, and records its tokens', async () => {
    process.env.VGU_ENFORCEMENT = 'strict';
    const sink = newSink();
    await metered(sink, async () => {
      await stubClient({
        prompt_tokens: 4400,
        completion_tokens: 700,
        total_tokens: 5100,
      }).chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'x' }],
      });
    });
    expect(providerGuardStats().blockedCalls).toBe(0);
    expect(sink.usage).toHaveLength(1);
    expect(sink.usage[0].promptTokens).toBe(4400);
    expect(sink.usage[0].completionTokens).toBe(700);
  });

  it('treats a bare feature label as UNMETERED — a label reserves nothing', async () => {
    process.env.VGU_ENFORCEMENT = 'strict';
    const { withAIFeature } = await import('../server/services/aiUsageTracker');
    // withAIFeature tags usage for reporting but installs no collector, so it
    // must NOT satisfy the guard. Otherwise adding a label would silently switch
    // enforcement off.
    await expect(
      withAIFeature('caption.generation', { userId: 'u1' }, () =>
        stubClient().chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: 'x' }],
        })
      )
    ).rejects.toBeInstanceOf(UnmeteredAICallError);
  });

  it('never blocks in off mode', async () => {
    process.env.VGU_ENFORCEMENT = 'off';
    await expect(
      stubClient().chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'x' }],
      })
    ).resolves.toBeTruthy();
    expect(providerGuardStats().blockedCalls).toBe(0);
  });
});

describe('streaming calls', () => {
  it('is still gated, but does not consume the stream to read usage', async () => {
    process.env.VGU_ENFORCEMENT = 'strict';
    const sink = newSink();
    await metered(sink, async () => {
      // A streaming request reports usage only at the end of the stream; the
      // guard must not swallow it, so the call site keeps its own accounting.
      await stubClient().chat.completions.create({
        model: 'gpt-4o-mini',
        stream: true,
        messages: [{ role: 'user', content: 'x' }],
      } as any);
    });
    expect(providerGuardStats().guardedCalls).toBe(1);
    expect(providerGuardStats().blockedCalls).toBe(0);
    // Nothing recorded by the guard for a stream — the route records it.
    expect(sink.usage).toHaveLength(0);
  });
});

describe('runtime tool recording', () => {
  it('collects tools that actually ran, which is only knowable at runtime', async () => {
    const sink = newSink();
    await metered(sink, async () => {
      recordToolRun('deep_research');
      recordToolRun('search_web');
    });
    expect(sink.toolsRun).toEqual(['deep_research', 'search_web']);
  });

  it('is a no-op outside an AI context rather than throwing', () => {
    expect(currentAIContext()).toBeUndefined();
    expect(() => recordToolRun('deep_research')).not.toThrow();
  });
});
