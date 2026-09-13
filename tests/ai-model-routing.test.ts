/**
 * Routing policy tests.
 *
 * These lock in the two rules that matter after removing the fallback chains:
 *   1. The model the user selected is the model that runs.
 *   2. The ONLY substitution is capability — a model that physically cannot read
 *      the media is not asked to. Never substitution on error/quota.
 */
import { describe, it, expect } from 'vitest';
import {
  resolveRoute,
  supportsCapability,
  mustBypassGateway,
  getModelSpec,
  DEFAULT_MODEL,
} from '../server/services/ai-model-routing';

describe('retired providers are aliased, not left broken', () => {
  // GitHub Models answers every request with HTTP 410
  // `github_models_retirement_brownout` (verified against the live endpoint).
  // A workspace still pinned to it must keep working WITHOUT reintroducing a
  // failure-driven fallback — so the id maps to the same model on OpenAI.
  it.each([
    ['github-gpt-4o-mini', 'openai-gpt-4o-mini'],
    ['github-gpt-4.1-mini', 'openai-gpt-4.1-mini'],
  ])('%s → %s', (retired, live) => {
    const r = resolveRoute(retired, 'text');
    expect(r.appModel).toBe(live);
    expect(r.provider).toBe('openai');
  });

  it('never routes to the dead github provider', () => {
    for (const need of ['text', 'vision', 'video', 'document'] as const) {
      expect(resolveRoute('github-gpt-4o-mini', need).provider).not.toBe('github');
      expect(resolveRoute('github-gpt-4.1-mini', need).provider).not.toBe('github');
    }
  });
});

describe('selected model is honoured for text', () => {
  const cases: Array<[string, string]> = [
    ['veegpt-hybrid', 'gemini'],
    ['google-ai-studio', 'gemini'],
    ['gemini-3.5-flash', 'gemini'],
    ['openai-gpt4o', 'openai'],
    ['openai-gpt-4o-mini', 'openai'],
    ['openai-gpt-5', 'openai'],
    ['claude-3-5-sonnet', 'openai'],
  ];

  it.each(cases)('%s routes to itself on %s', (model, provider) => {
    const r = resolveRoute(model, 'text');
    expect(r.appModel).toBe(model);
    expect(r.provider).toBe(provider);
    expect(r.overriddenFor).toBeUndefined();
  });

  it('defaults to veegpt-hybrid when nothing is configured', () => {
    expect(resolveRoute(undefined, 'text').appModel).toBe(DEFAULT_MODEL);
  });

  it('passes an unknown model id through untouched (gateway resolves it)', () => {
    const r = resolveRoute('some-future-model', 'text');
    expect(r.appModel).toBe('some-future-model');
    expect(r.native).toBe('some-future-model');
    expect(r.overriddenFor).toBeUndefined();
  });
});

describe('video: only Gemini can read it', () => {
  it('keeps a Gemini selection for video', () => {
    const r = resolveRoute('gemini-2.5-flash', 'video');
    expect(r.provider).toBe('gemini');
    expect(r.overriddenFor).toBeUndefined();
  });

  it.each(['openai-gpt4o', 'openai-gpt-4o-mini', 'openai-gpt-5'])(
    'substitutes Gemini for %s on video, and says so',
    model => {
      const r = resolveRoute(model, 'video');
      expect(r.provider).toBe('gemini');
      expect(r.overriddenFor).toBe('video');
      expect(r.requested).toBe(model);
    }
  );

  it('substitutes for an unknown model rather than assuming it can read video', () => {
    const r = resolveRoute('some-future-model', 'video');
    expect(r.provider).toBe('gemini');
    expect(r.overriddenFor).toBe('video');
  });
});

describe('vision: images', () => {
  it('keeps an OpenAI selection for images (GPT-4o does see images)', () => {
    const r = resolveRoute('openai-gpt4o', 'vision');
    expect(r.provider).toBe('openai');
    expect(r.overriddenFor).toBeUndefined();
  });

  it('substitutes for a text-only model', () => {
    expect(resolveRoute('perplexity-sonar', 'vision').overriddenFor).toBe('vision');
  });
});

describe('documents (PDF): Gemini only', () => {
  // Regression guard. OpenAI chat models see images but CANNOT read a PDF, so
  // 'vision' must not be treated as covering documents — otherwise a PDF goes to
  // a model that silently ignores it.
  it.each(['openai-gpt4o', 'openai-gpt-4o-mini', 'openai-gpt-5', 'claude-3-5-sonnet'])(
    'substitutes Gemini for %s on a PDF',
    model => {
      const r = resolveRoute(model, 'document');
      expect(r.provider).toBe('gemini');
      expect(r.overriddenFor).toBe('document');
    }
  );

  it('keeps a Gemini selection for a PDF', () => {
    const r = resolveRoute('gemini-3.5-flash', 'document');
    expect(r.provider).toBe('gemini');
    expect(r.overriddenFor).toBeUndefined();
  });

  it('vision capability does NOT imply document capability', () => {
    expect(supportsCapability('openai-gpt4o', 'vision')).toBe(true);
    expect(supportsCapability('openai-gpt4o', 'document')).toBe(false);
  });
});

describe('gateway bypass', () => {
  it('bypasses for documents', () => {
    expect(mustBypassGateway('document')).toBe(true);
  });

  it('bypasses for video (the gateway inlines images only)', () => {
    expect(mustBypassGateway('video')).toBe(true);
  });
  it('bypasses for PDFs', () => {
    expect(mustBypassGateway('vision', true)).toBe(true);
  });
  it('does not bypass for plain text or images', () => {
    expect(mustBypassGateway('text')).toBe(false);
    expect(mustBypassGateway('vision', false)).toBe(false);
  });
});

describe('no retired Gemini ids leak into a native call', () => {
  // These pinned ids now 404 for current API keys, so no spec may point at one.
  const retired = [
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.0-flash',
    'gemini-2.0-flash-exp',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-2.5-pro',
  ];

  it.each([
    'veegpt-hybrid',
    'google-ai-studio',
    'gemini-1.5-flash',
    'gemini-2.0-flash-exp',
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-2.5-pro',
  ])('%s maps to a live native model', model => {
    expect(retired).not.toContain(getModelSpec(model).native);
  });
});

describe('every model the Settings screen offers is in the registry', () => {
  // Guard against the UI offering a model the router does not know: an unknown id
  // falls to UNKNOWN_SPEC, which reports no vision — so images would be silently
  // rerouted away from a model that can actually see them.
  const OFFERED = [
    'veegpt-hybrid',
    'openai-gpt4o',
    'openai-gpt-4.1',
    'openai-gpt-4.1-mini',
    'openai-gpt-4.1-nano',
    'openai-gpt-4o-mini',
    'openai-gpt-5-nano',
    'openai-gpt-5-mini',
    'openai-gpt-5',
    'openai-gpt-5.5',
    'openai-gpt-5.6-sol',
    'openai-gpt-5.6-luna',
    'openai-gpt-5.6-terra',
    'google-ai-studio',
    'gemini-2.5-flash',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.1-pro',
    'gemini-pro-latest',
    'claude-3-5-sonnet',
    'claude-3-5-haiku',
  ];

  it.each(OFFERED)('%s has a real native mapping', id => {
    const spec = getModelSpec(id);
    expect(spec.native, `${id} is missing from REGISTRY`).not.toBe('');
    expect(resolveRoute(id, 'text').appModel).toBe(id);
  });

  it.each(OFFERED.filter(id => id.startsWith('openai') || id.startsWith('claude')))(
    '%s keeps image support (not downgraded to no-vision)',
    id => {
      expect(supportsCapability(id, 'vision')).toBe(true);
    }
  );
});

describe('capability helper', () => {
  it('reports text support for everything', () => {
    expect(supportsCapability('perplexity-sonar', 'text')).toBe(true);
  });
  it('reports no video for OpenAI', () => {
    expect(supportsCapability('openai-gpt4o', 'video')).toBe(false);
  });
  it('reports video for Gemini', () => {
    expect(supportsCapability('veegpt-hybrid', 'video')).toBe(true);
  });
});
