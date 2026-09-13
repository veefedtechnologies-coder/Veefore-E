/**
 * Admin emergency-control policy tests (Block 10, spec §48/§49).
 *
 * Pure decision logic — no Redis, no Mongo — so these run in CI on every commit.
 * They lock in the properties that keep the emergency levers SAFE:
 *
 *  • the neutral default disables nothing (a brake that jams "on" would take the
 *    product down, so the fail-safe state must be "everything allowed");
 *  • normalization cannot be tricked into weakening the brake, and cannot let a
 *    garbled document loosen concurrency beyond the plan;
 *  • the gate's precedence (model → tier → feature → provider) is deterministic
 *    and each lever refuses exactly what it should;
 *  • premium/ultra get a distinct user-facing message from other tiers.
 *
 * The end-to-end behaviour (the reservation engine actually refusing a disabled
 * request, the concurrency factor tightening slots, the multiplier lowering the
 * reservation) is proven against live Redis in server/scripts/verify-vgu-admin.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  defaultControls,
  normalizeControls,
  evaluateAdminGate,
  type AdminControls,
} from '../server/services/veegpt-admin-controls';

function controls(over: Partial<AdminControls> = {}): AdminControls {
  return { ...defaultControls(), ...over };
}

describe('the neutral default is fail-safe (nothing disabled)', () => {
  it('disables no models, tiers, features or providers', () => {
    const d = defaultControls();
    expect(d.disabledModels).toEqual([]);
    expect(d.disabledTiers).toEqual([]);
    expect(d.disabledFeatures).toEqual([]);
    expect(d.disabledProviders).toEqual([]);
  });

  it('leaves concurrency and estimates at full strength', () => {
    const d = defaultControls();
    expect(d.concurrencyFactor).toBe(1);
    expect(d.tierMultiplier).toEqual({});
    expect(d.featureMultiplier).toEqual({});
    expect(d.version).toBe(0);
  });

  it('gates nothing under the default state', () => {
    const r = evaluateAdminGate(defaultControls(), {
      feature: 'veegpt.chat',
      tier: 'ultra',
      model: 'openai-gpt4o',
      provider: 'openai',
    });
    expect(r.blocked).toBe(false);
  });
});

describe('normalization cannot be tricked into weakening the brake', () => {
  it('clamps the concurrency factor into [0,1]', () => {
    expect(normalizeControls({ concurrencyFactor: 5 }).concurrencyFactor).toBe(1);
    expect(normalizeControls({ concurrencyFactor: -2 }).concurrencyFactor).toBe(1);
    expect(normalizeControls({ concurrencyFactor: 0 }).concurrencyFactor).toBe(0);
    expect(normalizeControls({ concurrencyFactor: 0.25 }).concurrencyFactor).toBe(0.25);
  });

  it('drops non-string members from disabled lists', () => {
    const c = normalizeControls({
      disabledModels: ['ok', 123, null, { x: 1 }] as unknown as string[],
    });
    expect(c.disabledModels).toEqual(['ok']);
  });

  it('lower-cases provider names so the gate match is case-insensitive', () => {
    const c = normalizeControls({ disabledProviders: ['OpenAI', 'GEMINI'] });
    expect(c.disabledProviders).toEqual(['openai', 'gemini']);
  });

  it('coerces a garbage document to the neutral default', () => {
    expect(normalizeControls(null)).toEqual(defaultControls());
    expect(normalizeControls('not an object')).toEqual(defaultControls());
    expect(normalizeControls(42)).toEqual(defaultControls());
  });

  it('keeps only non-negative numeric multipliers', () => {
    const c = normalizeControls({
      tierMultiplier: { premium: -1, ultra: 0.5 } as Record<string, number>,
      featureMultiplier: { 'veegpt.chat': 'x' as unknown as number, ok: 2 },
    });
    expect(c.tierMultiplier).toEqual({ ultra: 0.5 });
    expect(c.featureMultiplier).toEqual({ ok: 2 });
  });
});

describe('the gate refuses exactly what each lever names', () => {
  it('refuses a disabled model, attributing it to the model lever', () => {
    const r = evaluateAdminGate(controls({ disabledModels: ['openai-gpt4o'] }), {
      feature: 'veegpt.chat',
      tier: 'premium',
      model: 'openai-gpt4o',
    });
    expect(r.blocked).toBe(true);
    expect(r.by).toBe('model');
  });

  it('lets a different model through', () => {
    const r = evaluateAdminGate(controls({ disabledModels: ['openai-gpt4o'] }), {
      feature: 'veegpt.chat',
      tier: 'cheap',
      model: 'openai-gpt-4o-mini',
    });
    expect(r.blocked).toBe(false);
  });

  it('refuses a disabled tier', () => {
    const r = evaluateAdminGate(controls({ disabledTiers: ['premium'] }), {
      feature: 'veegpt.chat',
      tier: 'premium',
    });
    expect(r.blocked).toBe(true);
    expect(r.by).toBe('tier');
  });

  it('refuses a disabled feature', () => {
    const r = evaluateAdminGate(controls({ disabledFeatures: ['veegpt.deep_research'] }), {
      feature: 'veegpt.deep_research',
      tier: 'cheap',
    });
    expect(r.blocked).toBe(true);
    expect(r.by).toBe('feature');
  });

  it('refuses a disabled provider case-insensitively', () => {
    const r = evaluateAdminGate(controls({ disabledProviders: ['openai'] }), {
      feature: 'veegpt.chat',
      tier: 'cheap',
      provider: 'OpenAI',
    });
    expect(r.blocked).toBe(true);
    expect(r.by).toBe('provider');
  });
});

describe('gate precedence is deterministic (model → tier → feature → provider)', () => {
  it('reports the model lever when several match', () => {
    const r = evaluateAdminGate(
      controls({
        disabledModels: ['m'],
        disabledTiers: ['premium'],
        disabledFeatures: ['veegpt.chat'],
        disabledProviders: ['openai'],
      }),
      { feature: 'veegpt.chat', tier: 'premium', model: 'm', provider: 'openai' }
    );
    expect(r.by).toBe('model');
  });

  it('falls through to tier when the model does not match', () => {
    const r = evaluateAdminGate(
      controls({ disabledTiers: ['premium'], disabledFeatures: ['veegpt.chat'] }),
      { feature: 'veegpt.chat', tier: 'premium', model: 'other' }
    );
    expect(r.by).toBe('tier');
  });
});

describe('premium/ultra get a distinct message from other tiers', () => {
  it('says "Premium AI" for premium and ultra', () => {
    for (const tier of ['premium', 'ultra'] as const) {
      const r = evaluateAdminGate(controls({ disabledTiers: [tier] }), {
        feature: 'veegpt.chat',
        tier,
      });
      expect(r.reason).toMatch(/Premium AI/);
    }
  });

  it('uses the generic message for cheap/medium', () => {
    const r = evaluateAdminGate(controls({ disabledTiers: ['medium'] }), {
      feature: 'veegpt.chat',
      tier: 'medium',
    });
    expect(r.reason).not.toMatch(/Premium AI/);
    expect(r.reason).toMatch(/temporarily unavailable/);
  });
});
