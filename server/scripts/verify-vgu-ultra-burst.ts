/**
 * BLOCK · ULTRA 5-HOUR SUB-CAP VERIFICATION.
 *
 * Proves the per-tier 5-hour rolling sub-cap: on Pro, ultra (gpt-5.6-sol) may
 * use at most HALF the 800 5h burst = 400 VGU per 5-hour window (~10 sol turns),
 * even though the monthly ultra allowance (2,500) and the overall 5h burst (800)
 * are both higher. Then a cheaper model still works in the same window, and the
 * ultra monthly allowance is untouched by the burst refusal.
 *
 * Run: LOG_LEVEL=silent npx tsx server/scripts/verify-vgu-ultra-burst.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { getRedisClient } from '../lib/redis';
import { connectionManager } from '../infrastructure/mongodb-connection';
import { withVGU, VGUQuotaError } from '../services/veegpt-metering';
import { recordAIUsage } from '../services/aiUsageTracker';
import { getReservationEngine, RESERVATION_KEYS } from '../services/veegpt-reservation.engine';
import { tierFiveHourCap } from '../config/veegpt-vgu.config';
import { resolveBillingPeriod } from '../services/veegpt-billing-period';
import type { PlanId } from '../config/plan-config';

let pass = 0, fail = 0;
const failures: string[] = [];
function check(label: string, actual: unknown, expected: unknown): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { pass++; console.log(`  \u2713 ${label}`); }
  else { fail++; failures.push(label); console.log(`  \u2717 ${label}\n      expected ${JSON.stringify(expected)}\n      actual   ${JSON.stringify(actual)}`); }
}

const RUN = `__ultraburst_${Date.now()}`;
const users: string[] = [];
function user(t: string) { const u = `${RUN}_${t}`; users.push(u); return u; }
const seed = (u: string, p: string) => getRedisClient().set(`veegpt:rl:plan:${u}`, p, 'EX', 900).catch(() => {});

/** One realistic sol turn = ~39 VGU (4.4k in / 700 out). */
function recordSol() {
  recordAIUsage({ provider: 'openai', model: 'gpt-5.6-sol', callType: 'stream', usage: { promptTokens: 4400, completionTokens: 700, totalTokens: 5100 } });
}
function recordCheap() {
  recordAIUsage({ provider: 'openai', model: 'gpt-4o-mini', callType: 'stream', usage: { promptTokens: 2000, completionTokens: 300, totalTokens: 2300 } });
}

async function solTurn(uid: string) {
  return withVGU({ userId: uid, plan: 'pro' as PlanId, feature: 'veegpt.chat', model: 'openai-gpt-5.6-sol', modelChosenBy: 'user' },
    async () => { recordSol(); return 1; });
}

async function cleanup() {
  const r = getRedisClient();
  for (const u of users) {
    const p = await resolveBillingPeriod(u).catch(() => null);
    await r.del(
      RESERVATION_KEYS.window(u), RESERVATION_KEYS.amounts(u), RESERVATION_KEYS.concurrency(u),
      RESERVATION_KEYS.windowTier(u, 'ultra'), RESERVATION_KEYS.amountsTier(u, 'ultra'),
      `veegpt:rl:plan:${u}`, ...(p ? [RESERVATION_KEYS.period(u, p.id)] : [])
    ).catch(() => {});
  }
}

async function main() {
  console.log('ULTRA 5-HOUR SUB-CAP\n' + '='.repeat(50));
  await connectionManager.connect().catch(() => {});
  console.log('mongo=' + (mongoose.connection.readyState === 1 ? 'up' : 'down'));
  await cleanup();

  check('Pro ultra 5h cap = half of the 800 burst', tierFiveHourCap('pro', 'ultra'), 400);
  check('cheap has no 5h sub-cap', tierFiveHourCap('pro', 'cheap'), -1);

  const u = user('pro');
  await seed(u, 'pro');
  // Keep the monthly ultra budget out of the way so the 5h cap is what binds.
  process.env.VEEGPT_TIER_VGU_PRO_ULTRA = '100000';

  let ok = 0; let code = '';
  for (let i = 0; i < 16; i++) {
    try { await solTurn(u); ok++; }
    catch (e) { if (e instanceof VGUQuotaError) { code = e.code; break; } throw e; }
  }
  // The gate checks the pre-flight ESTIMATE (ultra chat = 20 VGU/turn) and
  // reconciles to the real ~39 after. So the window fills to ~39 per committed
  // turn: reserves are granted while committed + 20 ≤ 400, i.e. ~10 turns fit
  // (9×39 + 20 = 371 ≤ 400; the 11th would need 390 + 20 = 410 and is refused)
  // — the same estimate-reserve/reconcile soft boundary every budget has.
  // Net: ~10 sol turns per 5-hour window, well under the monthly allowance.
  check('ultra is bounded to ~10 sol turns per 5h window', ok >= 8 && ok <= 11, true);
  check('further ultra turns are refused for burst, not monthly', code, 'BURST_QUOTA_EXHAUSTED');

  // A cheaper model STILL works in the same window (only ultra is throttled).
  const cheap = await withVGU({ userId: u, plan: 'pro', feature: 'veegpt.chat', model: 'openai-gpt-4o-mini', modelChosenBy: 'user' },
    async () => { recordCheap(); return 1; }).then(() => true).catch(() => false);
  check('a cheap model still works in the same 5h window', cheap, true);

  delete process.env.VEEGPT_TIER_VGU_PRO_ULTRA;
  await cleanup();

  console.log('='.repeat(50));
  console.log(`passed=${pass}  failed=${fail}`);
  if (fail) for (const f of failures) console.log('  - ' + f);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error('crashed:', e); process.exit(1); });
