/**
 * Ledger + repair — the parts testable without live infrastructure.
 *
 * Durability, drift repair and index enforcement are proven against real Mongo and
 * Redis by server/scripts/verify-vgu-ledger.ts and verify-vgu-indexes.ts (83 live
 * checks). These cover the contracts and invariants that must hold regardless of
 * infrastructure.
 */

import { describe, it, expect } from 'vitest';
import { DRIFT_TOLERANCE_VGU } from '../server/services/veegpt-repair.service';
import { roundVGU, VGU_DECIMALS } from '../server/config/veegpt-vgu.config';

describe('drift tolerance', () => {
  it('is large enough to absorb float accumulation', () => {
    // Redis HINCRBYFLOAT accumulates IEEE error across reserve/adjust cycles.
    // Simulate 500 reserve+adjust pairs and confirm the residue stays well inside
    // the tolerance, so a healthy system is never flagged.
    let acc = 0;
    for (let i = 0; i < 500; i++) {
      acc += 16.36;
      acc -= 4.36;
      acc -= 12.0;
    }
    expect(Math.abs(acc)).toBeLessThan(DRIFT_TOLERANCE_VGU);
  });

  it('is small enough that it cannot change a quota decision', () => {
    // Caps are whole numbers, so any tolerance below 1 VGU cannot flip an
    // allow/deny outcome.
    expect(DRIFT_TOLERANCE_VGU).toBeLessThan(1);
    expect(DRIFT_TOLERANCE_VGU).toBeGreaterThan(0);
  });

  it('exceeds one unit of the tracked VGU precision', () => {
    // Otherwise normal rounding would register as drift on every request.
    expect(DRIFT_TOLERANCE_VGU).toBeGreaterThanOrEqual(10 ** -VGU_DECIMALS);
  });
});

describe('VGU rounding', () => {
  it('rounds to the tracked precision', () => {
    expect(roundVGU(1.234567)).toBe(1.23);
    expect(roundVGU(16.355)).toBeCloseTo(16.36, 2);
  });

  it('is stable under repeated application', () => {
    const once = roundVGU(16.3649);
    expect(roundVGU(once)).toBe(once);
  });

  it('never turns a positive charge into zero', () => {
    // A tiny-but-real charge must survive rounding, or cheap calls become free.
    expect(roundVGU(0.006)).toBeGreaterThan(0);
  });
});

describe('ledger status semantics', () => {
  it('excludes only non-billable statuses from totals', async () => {
    // Guards the aggregation filter in ledgerPeriodTotal: RELEASED (refunded) and
    // UNMETERED (measured but deliberately not charged) must not be summed, while
    // FAILED and EXPIRED must be — usage really was consumed in those cases.
    const src = await import('node:fs').then(fs =>
      fs.readFileSync('server/services/veegpt-ledger.ts', 'utf8')
    );
    expect(src).toContain("$nin: ['RELEASED', 'UNMETERED']");
    expect(src).not.toContain("$nin: ['RELEASED', 'UNMETERED', 'FAILED']");
  });
});

describe('ledger schema integrity', () => {
  it('declares min:0 on every VGU and cost field', async () => {
    // Spec §51: actualVGU >= 0 must be impossible to violate at the data layer.
    const src = await import('node:fs').then(fs =>
      fs.readFileSync('server/services/veegpt-ledger.ts', 'utf8')
    );
    for (const field of [
      'estimatedVGU',
      'actualVGU',
      'estimatedProviderCostUSD',
      'actualProviderCostUSD',
      'inputTokens',
      'outputTokens',
      'reasoningTokens',
      'cachedTokens',
    ]) {
      const line = src
        .split('\n')
        .find(l => l.trim().startsWith(`${field}:`) && l.includes('type: Number'));
      expect(line, `${field} must be declared`).toBeTruthy();
      expect(line, `${field} must clamp at zero`).toContain('min: 0');
    }
  });

  it('declares reservationId unique — the idempotency guarantee', async () => {
    const src = await import('node:fs').then(fs =>
      fs.readFileSync('server/services/veegpt-ledger.ts', 'utf8')
    );
    expect(src).toMatch(/reservationId:\s*\{[^}]*unique:\s*true/);
  });
});
