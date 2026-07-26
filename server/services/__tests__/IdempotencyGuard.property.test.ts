import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  IdempotencyGuard,
  type CompletionStore,
  type IdempotencyKeyParts,
} from '../IdempotencyGuard';

/**
 * Property-Based Tests for the IdempotencyGuard (smart-polling-system).
 *
 * Property 15: Idempotency key determinism
 *   For any `(accountId, sourceId, ruleId)` triple, `IdempotencyGuard.buildKey`
 *   is a pure deterministic function: identical inputs always yield identical
 *   keys, and any difference in the intended side effect (different account,
 *   source, or rule) yields a different key — distinct tuples never collide.
 *   **Validates: Requirements 10.1**
 *
 * Property 16: Idempotent side-effect performed at most once
 *   For any sequence of repeated/concurrent reserve attempts carrying the same
 *   idempotency key (with at most one recorded completion), the guarded side
 *   effect is performed at most once: across all `reserve` calls, at most one
 *   resolves to `reserved` and proceeds to perform the side effect.
 *   **Validates: Requirements 10.3**
 */

const ITERATIONS = 200;

// -----------------------------------------------------------------------------
// In-memory fakes mirroring the production storage contracts.
// -----------------------------------------------------------------------------

/**
 * Minimal in-memory fake of the Redis surface used by IdempotencyGuard.
 * Mirrors `SET key value PX ttl NX` semantics: the first caller for a key wins
 * ('OK'); subsequent callers receive null while the key is live (within TTL).
 * TTL expiry is modelled with a virtual clock so concurrency is deterministic.
 */
class FakeRedis {
  private store = new Map<string, { value: string; expiresAt: number }>();
  private now = 0;

  /** Advance the virtual clock (ms) to model TTL expiry. */
  advance(ms: number): void {
    this.now += ms;
  }

  // Matches ioredis `set(key, value, 'PX', ttl, 'NX')` overload used by the guard.
  async set(
    key: string,
    value: string,
    _px: 'PX',
    ttlMs: number,
    _nx: 'NX'
  ): Promise<'OK' | null> {
    const existing = this.store.get(key);
    if (existing && existing.expiresAt > this.now) {
      return null; // key live -> NX fails
    }
    this.store.set(key, { value, expiresAt: this.now + ttlMs });
    return 'OK';
  }
}

/** In-memory durable completion store. */
class FakeCompletionStore implements CompletionStore {
  private completed = new Set<string>();

  async has(key: string): Promise<boolean> {
    return this.completed.has(key);
  }

  async record(key: string): Promise<void> {
    this.completed.add(key);
  }
}

// Build a guard backed by the in-memory fakes. The fakes structurally satisfy
// the constructor's typed parameters.
function makeGuard(): { guard: IdempotencyGuard; redis: FakeRedis; store: FakeCompletionStore } {
  const redis = new FakeRedis();
  const store = new FakeCompletionStore();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const guard = new IdempotencyGuard(redis as any, store);
  return { guard, redis, store };
}

// -----------------------------------------------------------------------------
// Arbitraries
// -----------------------------------------------------------------------------

// Non-empty strings spanning delimiter-sensitive characters (':', '|', '%') so
// the key construction's encoding/collision-avoidance is exercised.
const partArb = fc.string({ minLength: 1, maxLength: 24 });

const keyPartsArb: fc.Arbitrary<IdempotencyKeyParts> = fc.record({
  accountId: partArb,
  sourceId: partArb,
  ruleId: partArb,
});

// -----------------------------------------------------------------------------
// Property 15: Idempotency key determinism
// -----------------------------------------------------------------------------

describe('Feature: smart-polling-system, Property 15: Idempotency key determinism', () => {
  it('is deterministic: identical inputs always yield identical keys (Req 10.1)', () => {
    fc.assert(
      fc.property(keyPartsArb, (parts) => {
        const a = IdempotencyGuard.buildKey(parts);
        const b = IdempotencyGuard.buildKey({ ...parts });
        expect(a).toBe(b);
        expect(typeof a).toBe('string');
        expect(a.length).toBeGreaterThan(0);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('distinct tuples never collide onto the same key (Req 10.1)', () => {
    fc.assert(
      fc.property(fc.array(keyPartsArb, { minLength: 1, maxLength: 50 }), (tuples) => {
        // Group keys by their canonical (distinct-tuple) identity.
        const canonical = (p: IdempotencyKeyParts) =>
          JSON.stringify([p.accountId, p.sourceId, p.ruleId]);

        const keyByTuple = new Map<string, string>();
        const tupleByKey = new Map<string, string>();

        for (const t of tuples) {
          const tupleId = canonical(t);
          const key = IdempotencyGuard.buildKey(t);

          // Same tuple -> same key (determinism within the sample).
          if (keyByTuple.has(tupleId)) {
            expect(keyByTuple.get(tupleId)).toBe(key);
          } else {
            keyByTuple.set(tupleId, key);
          }

          // Different tuple -> different key (no collisions in the sample).
          const seenTuple = tupleByKey.get(key);
          if (seenTuple !== undefined) {
            expect(seenTuple).toBe(tupleId);
          } else {
            tupleByKey.set(key, tupleId);
          }
        }
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('changing any single field changes the key (Req 10.1)', () => {
    fc.assert(
      fc.property(keyPartsArb, partArb, (parts, otherPart) => {
        const baseKey = IdempotencyGuard.buildKey(parts);

        // Only assert when the substituted value actually differs.
        if (otherPart !== parts.accountId) {
          expect(IdempotencyGuard.buildKey({ ...parts, accountId: otherPart })).not.toBe(baseKey);
        }
        if (otherPart !== parts.sourceId) {
          expect(IdempotencyGuard.buildKey({ ...parts, sourceId: otherPart })).not.toBe(baseKey);
        }
        if (otherPart !== parts.ruleId) {
          expect(IdempotencyGuard.buildKey({ ...parts, ruleId: otherPart })).not.toBe(baseKey);
        }
      }),
      { numRuns: ITERATIONS }
    );
  });
});

// -----------------------------------------------------------------------------
// Property 16: Idempotent side-effect performed at most once
// -----------------------------------------------------------------------------

describe('Feature: smart-polling-system, Property 16: Idempotent side-effect performed at most once', () => {
  it('at most one reserve proceeds across repeated/concurrent attempts on the same key (Req 10.3)', async () => {
    await fc.assert(
      fc.asyncProperty(
        keyPartsArb,
        // A sequence of "events": true => a reserve attempt; false => a TTL
        // advance large enough to expire the in-flight reservation. At most one
        // completion is recorded (on the first reservation that proceeds).
        fc.array(fc.boolean(), { minLength: 1, maxLength: 40 }),
        async (parts, events) => {
          const { guard, redis } = makeGuard();
          const key = IdempotencyGuard.buildKey(parts);

          let sideEffectCount = 0;
          let completionRecorded = false;

          for (const isReserve of events) {
            if (!isReserve) {
              // Model the passage of time beyond the reservation TTL (5 min).
              redis.advance(6 * 60 * 1000);
              continue;
            }

            const result = await guard.reserve(key);
            if (result.status === 'reserved') {
              // The caller proceeds to perform the side effect exactly once,
              // then durably records completion before marking the job done.
              sideEffectCount += 1;
              await guard.recordCompletion(key);
              completionRecorded = true;
            }
          }

          // Core invariant: the side effect is performed at most once, and once
          // completion is durably recorded no further reserve proceeds.
          expect(sideEffectCount).toBeLessThanOrEqual(1);
          if (completionRecorded) {
            const after = await guard.reserve(key);
            expect(after.status).toBe('already_completed');
          }
        }
      ),
      { numRuns: ITERATIONS }
    );
  });

  it('concurrent reserves on the same key yield at most one reserved (Req 10.3)', async () => {
    await fc.assert(
      fc.asyncProperty(keyPartsArb, fc.integer({ min: 2, max: 25 }), async (parts, concurrency) => {
        const { guard } = makeGuard();
        const key = IdempotencyGuard.buildKey(parts);

        // Fire N reserve calls "simultaneously" against the shared fake store.
        const results = await Promise.all(
          Array.from({ length: concurrency }, () => guard.reserve(key))
        );

        const reservedCount = results.filter((r) => r.status === 'reserved').length;
        // Two simultaneous executions can never both perform the side effect.
        expect(reservedCount).toBeLessThanOrEqual(1);
      }),
      { numRuns: ITERATIONS }
    );
  });

  it('after completion, every subsequent reserve resolves to skip (Req 10.3)', async () => {
    await fc.assert(
      fc.asyncProperty(keyPartsArb, fc.integer({ min: 1, max: 20 }), async (parts, retries) => {
        const { guard } = makeGuard();
        const key = IdempotencyGuard.buildKey(parts);

        // First reservation proceeds and records completion.
        const first = await guard.reserve(key);
        expect(first.status).toBe('reserved');
        await guard.recordCompletion(key);

        // Every subsequent retry must skip the side effect.
        for (let i = 0; i < retries; i++) {
          const again = await guard.reserve(key);
          expect(again.status).toBe('already_completed');
        }
      }),
      { numRuns: ITERATIONS }
    );
  });
});
