/**
 * Property-Based Tests for Business Discovery (smart-polling-system).
 *
 * Property 14: Business Discovery respects the competitor cap
 *   For any list of competitor usernames, the number of scheduled
 *   Business_Discovery_Jobs never exceeds
 *   `config.smartPolling.businessDiscovery.maxCompetitorsPerAccount`, and is zero
 *   whenever the feature is disabled.
 *
 *   The cap-enforcement core is the pure, exported `enforceCompetitorCap`, which
 *   for any list of usernames and any cap returns at most `cap` entries (Req 9.3),
 *   all distinct (case-insensitively), all drawn from the (trimmed) input,
 *   preserving input order, and returns `[]` for any non-positive / non-finite
 *   cap. The feature-disabled half (Req 9.4) is asserted via
 *   `scheduleForAccount` returning `enabled: false, capped: 0` and scheduling
 *   nothing.
 *   **Validates: Requirements 9.1, 9.3, 9.4**
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Mocks — keep imports light so the pure helper and the disabled-flag path can
// be exercised without a live Redis / BullMQ / scheduler.
// ---------------------------------------------------------------------------

vi.mock('../../config/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../lib/redis', () => ({
  getSharedRedisConnection: vi.fn(() => null),
}));

// Imported AFTER mocks are declared.
import {
  enforceCompetitorCap,
  BusinessDiscoveryScheduler,
} from '../BusinessDiscoveryScheduler';
import { rateLimitConfig, type RateLimitConfig } from '../../config/rateLimitConfig';
import type { TieredJobScheduler } from '../TieredJobScheduler';

const ITERATIONS = 200;

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/**
 * Usernames drawn from a small alphabet (mixed case + blanks + whitespace) so
 * duplicates, case-collisions, and trimmable entries are all likely.
 */
const usernameArb = fc.oneof(
  fc.constantFrom('alpha', 'ALPHA', 'Alpha', 'beta', 'BETA', 'gamma', 'delta'),
  fc.constantFrom('', '   ', '  alpha  ', ' Beta'),
  fc.string({ minLength: 0, maxLength: 6 })
);

const usernamesArb = fc.array(usernameArb, { minLength: 0, maxLength: 30 });

/** Any cap value, including non-positive and non-finite ones. */
const capArb = fc.oneof(
  fc.integer({ min: -5, max: 25 }),
  fc.constantFrom(0, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY)
);

/** Normalize like the helper: trim, drop blanks, de-dupe case-insensitively. */
function normalize(usernames: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of usernames) {
    if (typeof raw !== 'string') continue;
    const u = raw.trim();
    if (u === '') continue;
    const key = u.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Property 14 — competitor cap (pure enforceCompetitorCap)
// ---------------------------------------------------------------------------

describe('Feature: smart-polling-system, Property 14: Business Discovery respects the competitor cap', () => {
  it('never returns more than the cap, all distinct, drawn from input, order-preserving (Req 9.3)', () => {
    fc.assert(
      fc.property(usernamesArb, capArb, (usernames, cap) => {
        const result = enforceCompetitorCap(usernames, cap);

        // Non-positive / non-finite cap => empty (Req 9.3 safe interpretation).
        if (!Number.isFinite(cap) || cap <= 0) {
          expect(result).toEqual([]);
          return;
        }

        const effectiveCap = Math.floor(cap);

        // (1) Never exceeds the cap.
        expect(result.length).toBeLessThanOrEqual(effectiveCap);

        // (2) All distinct, case-insensitively.
        const lowered = result.map((u) => u.toLowerCase());
        expect(new Set(lowered).size).toBe(result.length);

        // (3) Every entry is a trimmed, non-blank member of the input.
        const inputTrimmed = new Set(
          usernames.filter((u) => typeof u === 'string').map((u) => u.trim())
        );
        for (const u of result) {
          expect(u).toBe(u.trim());
          expect(u).not.toBe('');
          expect(inputTrimmed.has(u)).toBe(true);
        }

        // (4) Equals the normalized list sliced to the cap (order-preserving).
        const expected = normalize(usernames).slice(0, effectiveCap);
        expect(result).toEqual(expected);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('returns [] for any non-positive or non-finite cap regardless of input (Req 9.3)', () => {
    fc.assert(
      fc.property(
        usernamesArb,
        fc.constantFrom(0, -1, -100, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
        (usernames, cap) => {
          expect(enforceCompetitorCap(usernames, cap)).toEqual([]);
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('is idempotent — capping an already-capped list changes nothing (Req 9.3)', () => {
    fc.assert(
      fc.property(usernamesArb, fc.integer({ min: 1, max: 25 }), (usernames, cap) => {
        const once = enforceCompetitorCap(usernames, cap);
        const twice = enforceCompetitorCap(once, cap);
        expect(twice).toEqual(once);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('schedules nothing and reports capped:0 when the feature flag is disabled (Req 9.4)', async () => {
    // A scheduler stub that fails the test if dispatch is ever attempted — the
    // disabled path must short-circuit before touching the scheduler.
    const dispatchOrDefer = vi.fn(async () => {
      throw new Error('scheduler must not be touched when feature is disabled');
    });
    const schedulerStub = { dispatchOrDefer } as unknown as TieredJobScheduler;

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 8 }),
        usernamesArb,
        async (accountId, usernames) => {
          const disabledConfig: RateLimitConfig = {
            ...rateLimitConfig,
            smartPolling: {
              ...rateLimitConfig.smartPolling,
              businessDiscovery: {
                ...rateLimitConfig.smartPolling.businessDiscovery,
                enabled: false,
              },
            },
          };

          const scheduler = new BusinessDiscoveryScheduler(schedulerStub, disabledConfig);
          const result = await scheduler.scheduleForAccount(accountId, usernames);

          expect(result.enabled).toBe(false);
          expect(result.capped).toBe(0);
          expect(result.dispositions).toEqual({});
          expect(result.requested).toBe(usernames.length);
          expect(dispatchOrDefer).not.toHaveBeenCalled();
        }
      ),
      { numRuns: ITERATIONS }
    );
  });
});
