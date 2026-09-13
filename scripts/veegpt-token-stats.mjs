#!/usr/bin/env node
/**
 * veegpt-token-stats.mjs — READ-ONLY exact token report for VeeGPT.
 *
 * Reads the real usage ledger (VeegptUsageEvent) and prints exact measured
 * input/output token statistics. It performs NO writes and NO schema changes.
 *
 * Usage:
 *   node scripts/veegpt-token-stats.mjs
 *   node scripts/veegpt-token-stats.mjs --days=30
 *   node scripts/veegpt-token-stats.mjs --feature=chat.tools
 *
 * Connection: uses process.env.MONGODB_URI (same var the server uses). If not
 * already set, it loads it from the nearest .env file.
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import mongoose from 'mongoose';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

// --- Minimal .env loader (only if MONGODB_URI is not already in the env) ----
function loadEnvIfNeeded() {
  if (process.env.MONGODB_URI) return;
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// --- CLI args ---------------------------------------------------------------
function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
}

const days = Number(arg('days', '90'));
const featureFilter = arg('feature', null); // optional exact feature match

// --- Stats helpers (computed in JS from a lean projection) ------------------
function percentile(sortedAsc, p) {
  if (sortedAsc.length === 0) return 0;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1)
  );
  return sortedAsc[idx];
}

function summarize(nums) {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = sorted.reduce((s, n) => s + n, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    mean: Math.round(sum / sorted.length),
    median: Math.round(percentile(sorted, 50)),
    p90: Math.round(percentile(sorted, 90)),
    p99: Math.round(percentile(sorted, 99)),
    max: sorted[sorted.length - 1],
    totalInputTokens: sum,
  };
}

function fmt(n) {
  return n.toLocaleString('en-US');
}

async function main() {
  loadEnvIfNeeded();
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error(
      'ERROR: MONGODB_URI is not set and no .env file with it was found.'
    );
    process.exit(1);
  }

  const masked = uri.replace(/:([^:@/]+)@/, ':****@');
  console.log(`Connecting (read-only) to: ${masked}`);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });

  // Bind directly to the existing collection; do NOT register/alter a model.
  const col = mongoose.connection.db.collection('veegptusageevents');

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const baseMatch = { createdAt: { $gte: since } };
  if (featureFilter) baseMatch.feature = featureFilter;

  // 1) Server-side per-feature summary (cheap $group).
  const perFeature = await col
    .aggregate([
      { $match: baseMatch },
      {
        $group: {
          _id: '$feature',
          calls: { $sum: 1 },
          avgInput: { $avg: '$inputTokens' },
          minInput: { $min: '$inputTokens' },
          maxInput: { $max: '$inputTokens' },
          sumInput: { $sum: '$inputTokens' },
          avgOutput: { $avg: '$outputTokens' },
          sumCached: { $sum: '$cachedTokens' },
        },
      },
      { $sort: { sumInput: -1 } },
    ])
    .toArray();

  console.log(
    `\n=== REAL VeeGPT token usage — last ${days} days (from ledger) ===`
  );
  console.log(`Since: ${since.toISOString()}\n`);

  if (perFeature.length === 0) {
    console.log('No ledger events found in this window.');
    await mongoose.disconnect();
    return;
  }

  console.log('Per-feature (input tokens):');
  console.log(
    'feature'.padEnd(22) +
      'calls'.padStart(8) +
      'avg'.padStart(10) +
      'min'.padStart(9) +
      'max'.padStart(10) +
      'total'.padStart(14)
  );
  for (const f of perFeature) {
    console.log(
      String(f._id ?? 'unknown').padEnd(22) +
        fmt(f.calls).padStart(8) +
        fmt(Math.round(f.avgInput || 0)).padStart(10) +
        fmt(f.minInput || 0).padStart(9) +
        fmt(f.maxInput || 0).padStart(10) +
        fmt(f.sumInput || 0).padStart(14)
    );
  }

  // 2) Exact percentiles for the chat features (pull lean projection).
  //    VeeGPT chat traffic is the "chat.*" features; adjust with --feature.
  const chatMatch = featureFilter
    ? baseMatch
    : { ...baseMatch, feature: { $regex: '^chat' } };

  const rows = await col
    .find(chatMatch, { projection: { inputTokens: 1, outputTokens: 1, _id: 0 } })
    .toArray();

  const inputStats = summarize(rows.map((r) => r.inputTokens || 0));
  const outputStats = summarize(rows.map((r) => r.outputTokens || 0));

  const label = featureFilter ? `feature="${featureFilter}"` : 'chat.* features';
  console.log(`\n=== Exact input-token distribution (${label}) ===`);
  if (!inputStats) {
    console.log('No matching chat events found.');
  } else {
    console.log(`samples:  ${fmt(inputStats.count)} requests`);
    console.log(`min:      ${fmt(inputStats.min)}`);
    console.log(`median:   ${fmt(inputStats.median)}`);
    console.log(`mean:     ${fmt(inputStats.mean)}`);
    console.log(`p90:      ${fmt(inputStats.p90)}`);
    console.log(`p99:      ${fmt(inputStats.p99)}`);
    console.log(`max:      ${fmt(inputStats.max)}`);
    console.log(`TOTAL input tokens: ${fmt(inputStats.totalInputTokens)}`);
    if (outputStats) {
      console.log(
        `\n(output tokens — median ${fmt(outputStats.median)}, mean ${fmt(
          outputStats.mean
        )})`
      );
    }
  }

  console.log(
    '\nNote: these are EXACT provider-reported token counts from the usage ledger.'
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Failed:', err instanceof Error ? err.message : err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
