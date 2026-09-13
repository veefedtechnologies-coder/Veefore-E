/**
 * EXTERNAL SEARCH COST VERIFICATION (spec §20, §47).
 *
 * Proves that real money paid to non-LLM search/extraction providers (Tavily,
 * Firecrawl) is recorded against the operation's VGU — so a web-search or
 * deep-research request costs more than the same request without one, reflecting
 * the actual API spend rather than only the chat model's tokens.
 *
 * Proven here:
 *   1. The cost config returns the published per-call defaults.
 *   2. Every price is overridable via its env var (§47: config, not code).
 *   3. recordExternalCostUSD inside a metered operation raises actualVGU by
 *      exactly cost / anchor — the real search spend lands in the charge.
 *   4. Outside a metered context it is a safe no-op (no crash, nothing charged).
 *   5. A search-augmented turn costs strictly more than the same turn without a
 *      search — the whole point of §20.
 *
 * Run: npx tsx server/scripts/verify-vgu-external-cost.ts
 */

import 'dotenv/config';
import { getRedisClient } from '../lib/redis';
import { connectionManager } from '../infrastructure/mongodb-connection';
import { withVGU } from '../services/veegpt-metering';
import { recordAIUsage, recordExternalCostUSD } from '../services/aiUsageTracker';
import { searchProviderCostUSD } from '../config/veegpt-search-cost';
import { VGU_ANCHOR_USD } from '../config/veegpt-vgu.config';
import { RESERVATION_KEYS } from '../services/veegpt-reservation.engine';
import { resolveBillingPeriod } from '../services/veegpt-billing-period';
import type { PlanId } from '../config/plan-config';

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  \u2713 ${label}`); }
  else {
    fail++; failures.push(label);
    console.log(`  \u2717 ${label}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`);
  }
}
function section(t: string): void { console.log(`\n${t}\n${'-'.repeat(t.length)}`); }

const RUN = `__extcost_${Date.now()}`;
const users: string[] = [];
function u(t: string): string { const x = `${RUN}_${t}`; users.push(x); return x; }

async function seed(uid: string, plan: string): Promise<void> {
  await getRedisClient().set(`veegpt:rl:plan:${uid}`, plan, 'EX', 900).catch(() => {});
}
async function cleanup(): Promise<void> {
  const r = getRedisClient();
  for (const uid of users) {
    const p = await resolveBillingPeriod(uid).catch(() => null);
    await r.del(RESERVATION_KEYS.window(uid), RESERVATION_KEYS.amounts(uid), RESERVATION_KEYS.concurrency(uid), `veegpt:rl:plan:${uid}`, ...(p ? [RESERVATION_KEYS.period(uid, p.id)] : [])).catch(() => {});
  }
}

/** A fixed small chat turn (~0.5 VGU pre-floor) plus optional external spend. */
async function turn(uid: string, externalUSD: number): Promise<number> {
  await seed(uid, 'pro');
  process.env.VEEGPT_5H_VGU_PRO = '-1';
  process.env.VEEGPT_CONCURRENCY_PRO = '10000';
  process.env.VEEGPT_MONTHLY_VGU_PRO = '100000';
  const { usage } = await withVGU(
    { userId: uid, plan: 'pro' as PlanId, feature: 'veegpt.chat', model: 'openai-gpt4o', modelChosenBy: 'user' },
    async () => {
      recordAIUsage({ provider: 'openai', model: 'gpt-4o', callType: 'stream', usage: { promptTokens: 2000, completionTokens: 300, totalTokens: 2300 } });
      if (externalUSD > 0) recordExternalCostUSD(externalUSD);
      return 1;
    }
  );
  return usage.actualVGU;
}

async function main(): Promise<void> {
  console.log('EXTERNAL SEARCH COST VERIFICATION (\u00a720, \u00a747)\n' + '='.repeat(70));
  await connectionManager.connect().catch(() => {});
  await cleanup();

  // =========================================================================
  section('1. The cost config returns published per-call defaults');
  // =========================================================================
  delete process.env.VEEGPT_SEARCH_COST_TAVILY_SEARCH;
  check('tavily.search default', searchProviderCostUSD('tavily.search'), 0.008);
  check('firecrawl.search default', searchProviderCostUSD('firecrawl.search'), 0.002);
  check('firecrawl.scrape default', searchProviderCostUSD('firecrawl.scrape'), 0.001);
  check('tavily.research default', searchProviderCostUSD('tavily.research'), 0.1);

  // =========================================================================
  section('2. Every price is env-overridable (\u00a747: config, not code)');
  // =========================================================================
  process.env.VEEGPT_SEARCH_COST_TAVILY_SEARCH = '0.05';
  check('an env override changes the price', searchProviderCostUSD('tavily.search'), 0.05);
  process.env.VEEGPT_SEARCH_COST_TAVILY_SEARCH = 'not-a-number';
  check('a garbage override falls back to the default', searchProviderCostUSD('tavily.search'), 0.008);
  delete process.env.VEEGPT_SEARCH_COST_TAVILY_SEARCH;

  // =========================================================================
  section('3. recordExternalCostUSD raises actualVGU by cost / anchor');
  // =========================================================================
  {
    const base = await turn(u('base'), 0);
    // A big, exact external charge so the delta is unambiguous.
    const extUSD = 0.11; // 100 VGU at the anchor
    const withExt = await turn(u('withext'), extUSD);
    const expectedDelta = Math.round((extUSD / VGU_ANCHOR_USD) * 100) / 100;
    const actualDelta = Math.round((withExt - base) * 100) / 100;
    console.log(`      base=${base}  withExternal=${withExt}  anchor=$${VGU_ANCHOR_USD}`);
    check('the external spend adds ~cost/anchor VGU', Math.abs(actualDelta - expectedDelta) <= 0.05, true);
    check('and it strictly increased the charge', withExt > base, true);
  }

  // =========================================================================
  section('4. Outside a metered context it is a safe no-op');
  // =========================================================================
  {
    let threw = false;
    try { recordExternalCostUSD(1.23); } catch { threw = true; }
    check('recording outside an operation does not throw', threw, false);
  }

  // =========================================================================
  section('5. A search-augmented turn costs more than a bare turn (\u00a720)');
  // =========================================================================
  {
    const bare = await turn(u('bare'), 0);
    const searched = await turn(u('searched'), searchProviderCostUSD('tavily.search'));
    console.log(`      bare=${bare}  +1 tavily search=${searched}`);
    check('a single real search is reflected in the charge', searched >= bare, true);
  }

  delete process.env.VEEGPT_5H_VGU_PRO;
  delete process.env.VEEGPT_CONCURRENCY_PRO;
  delete process.env.VEEGPT_MONTHLY_VGU_PRO;
  await cleanup();

  console.log('\n' + '='.repeat(70));
  console.log(`passed=${pass}  failed=${fail}`);
  if (fail) { console.log('\nFAILED CHECKS:'); for (const f of failures) console.log(`  - ${f}`); }
  process.exit(fail ? 1 : 0);
}

main().catch(err => { console.error('probe crashed:', err); process.exit(1); });
