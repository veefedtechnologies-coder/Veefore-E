/**
 * Abuse-protection policy tests (Block 6).
 *
 * Pure decision logic — no Redis, no Mongo — so these run in CI on every commit.
 * They lock in the properties that make the feature safe to ship:
 *
 *  • no single signal can trigger an action (spec §32);
 *  • escalation is proportionate, and `restrict` never takes cheap models away;
 *  • enforcement is off by default, so a mis-tuned threshold cannot refuse a
 *    paying customer before the thresholds have seen real traffic;
 *  • concurrency limits are bounded per workspace as well as per user (§39).
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  ABUSE_THRESHOLD,
  MIN_DISTINCT_SIGNALS,
  SIGNAL_WEIGHT,
  abuseDetectionEnabled,
  abuseEnforcementEnabled,
  actionFor,
  adjustmentFor,
  type AbuseAction,
  type SignalName,
} from '../server/services/veegpt-abuse';
import {
  PLAN_VGU_POLICY,
  policyForPlan,
  UNLIMITED,
} from '../server/config/veegpt-vgu.config';
import { tierWithin, type ModelTier } from '../shared/veegpt-model-tiers';

const ENV = ['VGU_ABUSE_DETECTION', 'VGU_ABUSE_ENFORCE', 'VEEGPT_WS_CONCURRENCY_BUSINESS'];
afterEach(() => {
  for (const k of ENV) delete process.env[k];
});

describe('no single signal can trigger an action (spec §32)', () => {
  it('keeps every individual weight below the first action threshold', () => {
    // This is the structural guarantee: the rule holds by arithmetic, not by
    // remembering to check a signal count at every call site.
    for (const [name, weight] of Object.entries(SIGNAL_WEIGHT)) {
      expect(weight, `${name} alone must not reach throttle`).toBeLessThan(
        ABUSE_THRESHOLD.throttle
      );
    }
  });

  it('refuses to escalate on one signal even at an absurd score', () => {
    expect(actionFor(10_000, 1)).toBe('observe');
    expect(actionFor(ABUSE_THRESHOLD.block * 10, 1)).toBe('observe');
  });

  it('requires at least two distinct signals', () => {
    expect(MIN_DISTINCT_SIGNALS).toBeGreaterThanOrEqual(2);
    const score = ABUSE_THRESHOLD.block;
    for (let n = 0; n < MIN_DISTINCT_SIGNALS; n++) {
      expect(actionFor(score, n) === 'block').toBe(false);
    }
    expect(actionFor(score, MIN_DISTINCT_SIGNALS)).toBe('block');
  });

  it('says nothing at all about a quiet account', () => {
    expect(actionFor(0, 0)).toBe('allow');
    expect(actionFor(ABUSE_THRESHOLD.observe - 1, 3)).toBe('allow');
  });

  it('escalates monotonically with the score', () => {
    const order: AbuseAction[] = ['allow', 'observe', 'throttle', 'restrict', 'block'];
    const rank = (a: AbuseAction) => order.indexOf(a);
    let previous = -1;
    for (let score = 0; score <= ABUSE_THRESHOLD.block + 20; score += 5) {
      const r = rank(actionFor(score, 5));
      expect(r, `score ${score} must not de-escalate`).toBeGreaterThanOrEqual(previous);
      previous = r;
    }
  });

  it('orders the thresholds sensibly', () => {
    expect(ABUSE_THRESHOLD.observe).toBeLessThan(ABUSE_THRESHOLD.throttle);
    expect(ABUSE_THRESHOLD.throttle).toBeLessThan(ABUSE_THRESHOLD.restrict);
    expect(ABUSE_THRESHOLD.restrict).toBeLessThan(ABUSE_THRESHOLD.block);
  });

  it('needs a genuine combination to reach the top', () => {
    // No pair of signals should be able to reach `block` on its own; blocking a
    // customer's AI access should take more evidence than that.
    const weights = Object.values(SIGNAL_WEIGHT).sort((a, b) => b - a);
    expect(weights[0] + weights[1]).toBeLessThan(ABUSE_THRESHOLD.block);
  });
});

describe('escalation is proportionate', () => {
  it('changes nothing for allow and observe', () => {
    for (const action of ['allow', 'observe'] as const) {
      const adj = adjustmentFor(action);
      expect(adj).toEqual({
        concurrencyFactor: 1,
        rpmFactor: 1,
        maxTier: null,
        deny: false,
      });
    }
  });

  it('throttles capacity without touching model access', () => {
    const adj = adjustmentFor('throttle');
    expect(adj.concurrencyFactor).toBeLessThan(1);
    expect(adj.concurrencyFactor).toBeGreaterThan(0);
    expect(adj.rpmFactor).toBeLessThan(1);
    expect(adj.maxTier).toBeNull();
    expect(adj.deny).toBe(false);
  });

  it('restricts expensive tiers but keeps cheap models working', () => {
    const adj = adjustmentFor('restrict');
    expect(adj.deny).toBe(false);
    expect(adj.maxTier).not.toBeNull();
    // The point of `restrict`: a heuristic removes the expensive capability an
    // abuser wants, and leaves a real customer able to keep working.
    expect(tierWithin('cheap', adj.maxTier as ModelTier)).toBe(true);
    expect(tierWithin('premium', adj.maxTier as ModelTier)).toBe(false);
    expect(tierWithin('ultra', adj.maxTier as ModelTier)).toBe(false);
  });

  it('only denies at the block level', () => {
    const denying = (['allow', 'observe', 'throttle', 'restrict', 'block'] as const).filter(
      a => adjustmentFor(a).deny
    );
    expect(denying).toEqual(['block']);
  });

  it('never loosens a limit', () => {
    for (const action of ['allow', 'observe', 'throttle', 'restrict', 'block'] as const) {
      const adj = adjustmentFor(action);
      expect(adj.concurrencyFactor).toBeLessThanOrEqual(1);
      expect(adj.rpmFactor).toBeLessThanOrEqual(1);
    }
  });
});

describe('operational switches', () => {
  it('has detection on by default', () => {
    expect(abuseDetectionEnabled()).toBe(true);
  });

  it('can be switched off without a deploy', () => {
    process.env.VGU_ABUSE_DETECTION = 'off';
    expect(abuseDetectionEnabled()).toBe(false);
  });

  it('has ENFORCEMENT off by default', () => {
    // Deliberate: heuristics need real traffic before they may refuse anyone.
    expect(abuseEnforcementEnabled()).toBe(false);
  });

  it('turns enforcement on explicitly', () => {
    process.env.VGU_ABUSE_ENFORCE = 'on';
    expect(abuseEnforcementEnabled()).toBe(true);
  });
});

describe('concurrency is bounded per user AND per workspace (spec §39)', () => {
  it('gives every plan a positive per-user concurrency limit', () => {
    for (const plan of Object.keys(PLAN_VGU_POLICY) as Array<
      keyof typeof PLAN_VGU_POLICY
    >) {
      const policy = policyForPlan(plan);
      expect(policy.maxConcurrentAI, plan).toBeGreaterThan(0);
      expect(policy.maxConcurrentAI, plan).not.toBe(UNLIMITED);
    }
  });

  it('bounds the workspace for pooled plans', () => {
    // A per-seat limit is not a workspace bound: N seats × the seat limit is what
    // the provider actually sees.
    const business = policyForPlan('business');
    expect(business.pooled).toBe(true);
    expect(business.maxConcurrentWorkspace).toBeGreaterThan(0);
    expect(business.maxConcurrentWorkspace).toBe(10); // spec §39
  });

  it('does not double-bound a single-seat plan', () => {
    for (const plan of ['free', 'creator', 'pro'] as const) {
      const policy = policyForPlan(plan);
      expect(policy.pooled, plan).toBe(false);
      // Resolved as UNLIMITED, i.e. "no workspace bound" — the per-user limit
      // already IS the bound for a single-seat plan, and applying the same number
      // twice would just make the limit look like it moved.
      expect(policy.maxConcurrentWorkspace, plan).toBe(UNLIMITED);
    }
  });

  it('makes the workspace limit configurable', () => {
    process.env.VEEGPT_WS_CONCURRENCY_BUSINESS = '3';
    expect(policyForPlan('business').maxConcurrentWorkspace).toBe(3);
  });

  it('keeps concurrency independent of the VGU budget', () => {
    // Spec §31: "Do not let high VGU allowances create unlimited simultaneous
    // provider calls." Enterprise is unlimited on VGU and still bounded here.
    const ent = policyForPlan('enterprise');
    expect(ent.monthlyVGU).toBe(UNLIMITED);
    expect(ent.maxConcurrentAI).toBeLessThan(UNLIMITED);
    expect(ent.maxConcurrentWorkspace).toBeGreaterThan(0);
  });
});

describe('rate limits are per plan and rise with it', () => {
  it('increases requests-per-minute with the plan', () => {
    const rpm = (['free', 'creator', 'pro', 'business'] as const).map(
      p => policyForPlan(p).requestsPerMinute
    );
    for (let i = 1; i < rpm.length; i++) {
      expect(rpm[i]).toBeGreaterThan(rpm[i - 1]);
    }
  });

  it('increases concurrency with the plan', () => {
    const conc = (['free', 'creator', 'pro', 'business'] as const).map(
      p => policyForPlan(p).maxConcurrentAI
    );
    for (let i = 1; i < conc.length; i++) {
      expect(conc[i]).toBeGreaterThan(conc[i - 1]);
    }
  });

  it("matches the spec's initial numbers", () => {
    expect(policyForPlan('free').requestsPerMinute).toBe(10);
    expect(policyForPlan('creator').requestsPerMinute).toBe(20);
    expect(policyForPlan('pro').requestsPerMinute).toBe(40);
    expect(policyForPlan('business').requestsPerMinute).toBe(80);
    expect(policyForPlan('free').maxConcurrentAI).toBe(1);
    expect(policyForPlan('creator').maxConcurrentAI).toBe(2);
    expect(policyForPlan('pro').maxConcurrentAI).toBe(4);
    expect(policyForPlan('business').maxConcurrentAI).toBe(10);
  });
});

describe('signal coverage', () => {
  it('implements all eight signals the spec lists', () => {
    const required: SignalName[] = [
      'frequency', // abnormal request frequency
      'duplicate', // repeated identical requests
      'failures', // excessive failures
      'context', // abnormal context sizes
      'premium', // abnormal premium usage
      'concurrency', // abnormal concurrent requests
      'automation', // automated traffic
      'account', // suspicious account behavior
    ];
    expect(Object.keys(SIGNAL_WEIGHT).sort()).toEqual([...required].sort());
  });
});
