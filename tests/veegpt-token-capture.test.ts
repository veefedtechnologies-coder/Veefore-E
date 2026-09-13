/**
 * Provider usage normalization — reasoning and cached tokens.
 *
 * These fields were being discarded, so GPT-5 reasoning was invisible in the
 * ledger. They must be captured, and reasoning must never be added on top of the
 * completion count (providers report it inside).
 */

import { describe, it, expect } from 'vitest';
import {
  fromOpenAIUsage,
  fromGeminiUsage,
  estimateTokens,
} from '../server/services/aiUsageTracker';
import { providerCostUSD } from '../server/config/veegpt-pricing.registry';

describe('OpenAI usage normalization', () => {
  it('captures reasoning tokens from completion_tokens_details', () => {
    const u = fromOpenAIUsage({
      prompt_tokens: 5000,
      completion_tokens: 4500,
      total_tokens: 9500,
      completion_tokens_details: { reasoning_tokens: 4000 },
    });
    expect(u?.promptTokens).toBe(5000);
    expect(u?.completionTokens).toBe(4500);
    expect(u?.reasoningTokens).toBe(4000);
  });

  it('captures cached prompt tokens', () => {
    const u = fromOpenAIUsage({
      prompt_tokens: 10_000,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 8_000 },
    });
    expect(u?.cachedTokens).toBe(8_000);
  });

  it('defaults the new fields to zero when absent', () => {
    const u = fromOpenAIUsage({ prompt_tokens: 10, completion_tokens: 5 });
    expect(u?.reasoningTokens).toBe(0);
    expect(u?.cachedTokens).toBe(0);
  });

  it('returns null for a missing usage object', () => {
    expect(fromOpenAIUsage(undefined)).toBeNull();
    expect(fromOpenAIUsage(null)).toBeNull();
  });
});

describe('Gemini usage normalization', () => {
  it('captures thoughtsTokenCount as reasoning tokens', () => {
    const u = fromGeminiUsage({
      promptTokenCount: 3000,
      candidatesTokenCount: 2000,
      totalTokenCount: 5000,
      thoughtsTokenCount: 1500,
    });
    expect(u?.reasoningTokens).toBe(1500);
    expect(u?.completionTokens).toBe(2000);
  });

  it('captures context-cache hits', () => {
    const u = fromGeminiUsage({
      promptTokenCount: 9000,
      candidatesTokenCount: 300,
      cachedContentTokenCount: 7000,
    });
    expect(u?.cachedTokens).toBe(7000);
  });

  it('defaults to zero when the provider omits the fields', () => {
    const u = fromGeminiUsage({ promptTokenCount: 1, candidatesTokenCount: 1 });
    expect(u?.reasoningTokens).toBe(0);
    expect(u?.cachedTokens).toBe(0);
  });
});

describe('reasoning tokens are a breakdown, not an addition', () => {
  it('a request with reasoning costs the same as one without, at equal output', () => {
    const openai = fromOpenAIUsage({
      prompt_tokens: 5000,
      completion_tokens: 4500,
      completion_tokens_details: { reasoning_tokens: 4000 },
    })!;
    const costWithBreakdown = providerCostUSD('gpt-5', {
      inputTokens: openai.promptTokens,
      outputTokens: openai.completionTokens,
      reasoningTokens: openai.reasoningTokens,
    });
    const costWithout = providerCostUSD('gpt-5', {
      inputTokens: 5000,
      outputTokens: 4500,
    });
    expect(costWithBreakdown.usd).toBeCloseTo(costWithout.usd, 12);
  });

  it('but a heavier reasoning pass IS more expensive, via a larger completion count', () => {
    const light = providerCostUSD('gpt-5', { inputTokens: 5000, outputTokens: 500 });
    const heavy = providerCostUSD('gpt-5', {
      inputTokens: 5000,
      outputTokens: 40_000,
      reasoningTokens: 39_500,
    });
    expect(heavy.usd).toBeGreaterThan(light.usd * 5);
  });
});

describe('token estimation fallback', () => {
  it('estimates roughly 4 characters per token', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('handles empty and missing input', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens(undefined)).toBe(0);
    expect(estimateTokens(null)).toBe(0);
  });
});
