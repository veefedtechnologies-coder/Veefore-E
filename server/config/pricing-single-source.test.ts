/**
 * Guards the "one source of truth for money" invariant.
 *
 * History: this repo carried FOUR parallel pricing tables — `pricing-config.ts`,
 * `subscription-config.ts`, a `PLAN_PRICING` map in `subscription-service.ts`,
 * and the canonical `config/plan-config.ts`. They had drifted badly:
 *
 *   - plans: a 'starter' tier that no longer existed, no 'creator' tier, and
 *     Pro/Business priced BELOW canonical (undercharging on checkout)
 *   - credit packs: roughly 3x ABOVE canonical (overcharging), plus pack sizes
 *     the entitlement system could not grant
 *
 * All the drifted tables and their dead consumers have been deleted, and every
 * endpoint now prices from `plan-config.ts`. This test enforces that state by
 * scanning the server tree for any OTHER module that re-introduces plan or
 * credit-pack pricing, so the drift cannot silently come back.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { PLAN_CONFIG, ADDON_CONFIG } from './plan-config';

const SERVER_ROOT = path.resolve(__dirname, '..');
const CANONICAL_FILE = path.join(SERVER_ROOT, 'config', 'plan-config.ts');

/** Files that legitimately reference prices (canonical config + its own tests). */
const ALLOWED = new Set<string>([
  CANONICAL_FILE,
  path.join(SERVER_ROOT, 'config', 'plan-config.test.ts'),
  path.join(SERVER_ROOT, 'config', 'pricing-single-source.test.ts'),
]);

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'uploads', 'logs']);

/**
 * Test files are exempt from the hardcoded-price scan: pinning exact amounts is
 * precisely what a pricing test should do (see plan-config.test.ts and
 * CreditPackPurchase.test.ts). The scan targets production source, where a
 * literal price means a second source of truth.
 */
const isTestFile = (f: string) => /\.(test|spec)\.tsx?$/.test(f);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = path.join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, acc);
    else if (entry.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

describe('plan-config.ts is the only pricing authority', () => {
  const files = walk(SERVER_ROOT).filter(f => !ALLOWED.has(f));

  it('the deleted legacy pricing modules stay deleted', () => {
    // Each of these held a drifted price table with no live consumer. If one
    // reappears, money can be priced from it again.
    const removed = [
      'pricing-config.ts',
      'subscription-config.ts',
      'subscription-service.ts',
      'subscription-middleware.ts',
      'access-control.ts',
      'plan-enforcement-middleware.ts',
      'razorpay-service.ts',
      'credit-service.ts',
      path.join('middleware', 'feature-access.ts'),
    ];
    for (const rel of removed) {
      const full = path.join(SERVER_ROOT, rel);
      let exists = true;
      try {
        statSync(full);
      } catch {
        exists = false;
      }
      expect(exists, `${rel} was deleted and must not return`).toBe(false);
    }
  });

  it('no other server module declares a plan pricing table', () => {
    // Catches a revived `SUBSCRIPTION_PLANS = {` / `PLAN_PRICING = {` style table.
    const offenders: string[] = [];
    const pattern =
      /(?:export\s+)?const\s+(SUBSCRIPTION_PLANS|PLAN_PRICING|PRICING_PLANS|CREDIT_PACKAGES)\s*[:=]/;
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      if (pattern.test(src)) offenders.push(path.relative(SERVER_ROOT, file));
    }
    expect(offenders, 'declare prices in config/plan-config.ts only').toEqual(
      []
    );
  });

  it('no production module hardcodes a canonical plan price', () => {
    // The exact paise amounts from PLAN_CONFIG must appear in one source file only.
    const prices = Object.values(PLAN_CONFIG)
      .flatMap(p => [p.pricing.monthly, p.pricing.yearly])
      .filter(v => v > 0);

    const offenders: string[] = [];
    for (const file of files.filter(f => !isTestFile(f))) {
      const src = readFileSync(file, 'utf8');
      for (const price of prices) {
        // Word-boundary match so 79900 does not match inside 799000.
        if (new RegExp(`\\b${price}\\b`).test(src)) {
          offenders.push(
            `${path.relative(SERVER_ROOT, file)} contains ${price}`
          );
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('canonical credit packs are internally consistent', () => {
  const packs = Object.values(ADDON_CONFIG).filter(
    a => a.priceOneTime !== null
  );

  it('exposes exactly the three supported pack sizes', () => {
    expect(packs.map(p => p.quantityIncrement).sort((a, b) => a - b)).toEqual([
      500, 2000, 5000,
    ]);
  });

  it('larger packs cost more in absolute terms', () => {
    const sorted = [...packs].sort(
      (a, b) => a.quantityIncrement - b.quantityIncrement
    );
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].priceOneTime!).toBeGreaterThan(
        sorted[i - 1].priceOneTime!
      );
    }
  });

  it('larger packs are cheaper per credit (volume discount holds)', () => {
    // If this inverts, the "Best value" badge on the credits page becomes a lie.
    const sorted = [...packs].sort(
      (a, b) => a.quantityIncrement - b.quantityIncrement
    );
    for (let i = 1; i < sorted.length; i++) {
      const prev =
        sorted[i - 1].priceOneTime! / sorted[i - 1].quantityIncrement;
      const curr = sorted[i].priceOneTime! / sorted[i].quantityIncrement;
      expect(curr).toBeLessThan(prev);
    }
  });

  it('a 2,000-credit top-up costs less than the Pro plan that includes them', () => {
    expect(ADDON_CONFIG.ai_credits_2000.priceOneTime!).toBeLessThan(
      PLAN_CONFIG.pro.pricing.monthly
    );
  });
});
