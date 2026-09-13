#!/usr/bin/env node
/**
 * Read logs/ai-model-usage.log and report which models actually served requests.
 *
 * The headline check: every case where the model that RAN differs from the model
 * the user SELECTED must have a declared reason (a capability the selection can't
 * do, or a retired provider alias). Anything else means a fallback survived the
 * refactor, and it's reported as UNEXPLAINED.
 *
 *   node scripts/ai-model-report.mjs              # whole log
 *   node scripts/ai-model-report.mjs --since 30m  # last 30 minutes
 *   node scripts/ai-model-report.mjs --tail 20    # last 20 calls, in detail
 */
import fs from 'node:fs';
import path from 'node:path';

const FILE = path.resolve('logs/ai-model-usage.log');
if (!fs.existsSync(FILE)) {
  console.log(`No log yet at ${FILE}`);
  console.log('Start the server and use VeeGPT — entries are appended per AI call.');
  process.exit(0);
}

const argv = process.argv.slice(2);
const arg = name => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const sinceArg = arg('--since');
let cutoff = 0;
if (sinceArg) {
  const m = /^(\d+)([mhd])$/.exec(sinceArg);
  if (!m) throw new Error('--since expects e.g. 30m, 2h, 1d');
  const mult = { m: 60e3, h: 3600e3, d: 86400e3 }[m[2]];
  cutoff = Date.now() - Number(m[1]) * mult;
}

let entries = fs
  .readFileSync(FILE, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map(l => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean)
  .filter(e => !cutoff || Date.parse(e.ts) >= cutoff);

if (!entries.length) {
  console.log('No entries in range.');
  process.exit(0);
}

const tail = arg('--tail');
if (tail) {
  console.log(`\nLast ${tail} calls\n`);
  for (const e of entries.slice(-Number(tail))) {
    const swap = e.used !== e.requested ? ` → ${e.used}` : '';
    const why = e.substitutedFor
      ? ` [needs ${e.substitutedFor}]`
      : e.retiredAlias
        ? ' [retired alias]'
        : '';
    console.log(
      `  ${e.ts.slice(11, 19)}  ${e.feature.padEnd(11)} ${(e.requested + swap + why).padEnd(52)} ` +
        `${e.transport}/${e.provider}  ${String(e.ms).padStart(6)}ms  ${e.ok ? 'ok' : 'FAIL'}`
    );
    if (!e.ok && e.error) console.log(`${' '.repeat(13)}↳ ${e.error.slice(0, 110)}`);
  }
}

// ── Which models actually ran ────────────────────────────────────────────────
const byModel = new Map();
for (const e of entries) {
  const a = byModel.get(e.used) || { calls: 0, fails: 0, ms: 0 };
  a.calls++;
  a.ms += e.ms;
  if (!e.ok) a.fails++;
  byModel.set(e.used, a);
}

console.log(`\nModels that actually served requests  (${entries.length} calls)\n`);
console.log(`  ${'model'.padEnd(28)} ${'calls'.padStart(5)} ${'fails'.padStart(5)} ${'avg'.padStart(8)}`);
console.log(`  ${'-'.repeat(28)} ${'-'.repeat(5)} ${'-'.repeat(5)} ${'-'.repeat(8)}`);
for (const [model, a] of [...byModel].sort((x, y) => y[1].calls - x[1].calls)) {
  console.log(
    `  ${model.padEnd(28)} ${String(a.calls).padStart(5)} ${String(a.fails).padStart(5)} ` +
      `${(Math.round(a.ms / a.calls) + 'ms').padStart(8)}`
  );
}

// ── By feature ───────────────────────────────────────────────────────────────
const byFeature = new Map();
for (const e of entries) {
  const k = `${e.feature} (${e.capability})`;
  const a = byFeature.get(k) || new Set();
  a.add(e.used);
  byFeature.set(k, a);
}
console.log('\nBy surface\n');
for (const [k, models] of byFeature) {
  console.log(`  ${k.padEnd(26)} ${[...models].join(', ')}`);
}

// ── The actual verdict ───────────────────────────────────────────────────────
const swaps = entries.filter(e => e.used !== e.requested);
const explained = swaps.filter(e => e.substitutedFor || e.retiredAlias);
const unexplained = swaps.filter(e => !e.substitutedFor && !e.retiredAlias);

console.log('\nModel substitutions\n');
if (!swaps.length) {
  console.log('  none — every call ran on the selected model');
} else {
  const counts = new Map();
  for (const e of explained) {
    const reason = e.substitutedFor ? `cannot do ${e.substitutedFor}` : 'provider retired';
    const k = `${e.requested} → ${e.used}  (${reason})`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  for (const [k, n] of counts) console.log(`  OK        ${k}  ×${n}`);
  for (const e of unexplained) {
    console.log(`  UNEXPLAINED  ${e.requested} → ${e.used}  ${e.feature}  (${e.ts})`);
  }
}

const failures = entries.filter(e => !e.ok);
console.log(
  `\nVerdict: ${unexplained.length === 0 ? 'PASS — no unexplained model swaps' : `FAIL — ${unexplained.length} unexplained swap(s)`}` +
    `  |  ${failures.length} failed call(s)\n`
);
