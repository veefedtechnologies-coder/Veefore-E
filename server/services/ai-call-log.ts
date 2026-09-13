/**
 * ai-call-log — an audit trail of WHICH model actually served each AI request.
 *
 * Built to verify the no-fallback refactor: for every call it records the model
 * the user selected, the model that actually ran, whether capability forced a
 * substitution, the transport, the latency and the outcome. If the two model
 * names ever differ for a reason other than a declared capability, that is a bug.
 *
 * Writes newline-delimited JSON to logs/ai-model-usage.log (gitignored) and keeps
 * the last N entries in memory for `summarize()`. Read it with:
 *
 *   node scripts/ai-model-report.mjs
 *
 * Failure to log must never break a request, so every path here is guarded.
 */

import fs from 'node:fs';
import path from 'node:path';

export interface ModelCallLogEntry {
  ts: string;
  /** Which surface made the call, e.g. 'chat.tools', 'vision', 'json'. */
  feature: string;
  /** The model id stored in the workspace's AI Configuration. */
  requested: string;
  /** The model id that actually ran. */
  used: string;
  provider: string;
  transport: 'litellm' | 'native';
  /** What the request needed: text | vision | video | document. */
  capability: string;
  /** Set when the requested model could not do `capability` at all. */
  substitutedFor?: string;
  /** Set when the requested id is a retired provider mapped to a live one. */
  retiredAlias?: boolean;
  ms: number;
  ok: boolean;
  error?: string;
}

const LOG_DIR = path.resolve(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'ai-model-usage.log');
const MAX_MEMORY = 500;

const recent: ModelCallLogEntry[] = [];
let writeFailed = false;

function append(entry: ModelCallLogEntry): void {
  if (writeFailed) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    // Log once and stop trying — never let auditing break a request.
    writeFailed = true;
    console.warn(
      '[ai-call-log] disabled, could not write log file:',
      (err as Error).message
    );
  }
}

export function recordModelCall(entry: Omit<ModelCallLogEntry, 'ts'>): void {
  const full: ModelCallLogEntry = { ts: new Date().toISOString(), ...entry };
  recent.push(full);
  if (recent.length > MAX_MEMORY) recent.shift();

  // One-line console form so it's visible while tailing the server output. The
  // "→" only appears when the model that ran differs from the one requested.
  const arrow = full.used !== full.requested ? ` → ${full.used}` : '';
  const why = full.substitutedFor
    ? ` [no ${full.substitutedFor}]`
    : full.retiredAlias
      ? ' [retired]'
      : '';
  console.log(
    `[ai-call] ${full.feature} ${full.requested}${arrow}${why} ` +
      `via ${full.transport}/${full.provider} ${full.capability} ` +
      `${full.ms}ms ${full.ok ? 'ok' : 'FAIL: ' + (full.error || '').slice(0, 90)}`
  );

  append(full);
}

export function getRecentModelCalls(): ModelCallLogEntry[] {
  return [...recent];
}

/** Aggregate the in-memory entries — used by the report script and diagnostics. */
export function summarize(entries: ModelCallLogEntry[] = recent) {
  const byModel = new Map<
    string,
    { calls: number; fails: number; totalMs: number }
  >();
  const substitutions = new Map<string, number>();
  let unexpected = 0;

  for (const e of entries) {
    const k = e.used;
    const agg = byModel.get(k) || { calls: 0, fails: 0, totalMs: 0 };
    agg.calls += 1;
    agg.totalMs += e.ms;
    if (!e.ok) agg.fails += 1;
    byModel.set(k, agg);

    if (e.used !== e.requested) {
      const reason = e.substitutedFor
        ? `capability:${e.substitutedFor}`
        : e.retiredAlias
          ? 'retired-alias'
          : 'UNEXPLAINED';
      substitutions.set(
        `${e.requested} → ${e.used} (${reason})`,
        (substitutions.get(`${e.requested} → ${e.used} (${reason})`) || 0) + 1
      );
      // A swap with no declared reason means a fallback survived the refactor.
      if (!e.substitutedFor && !e.retiredAlias) unexpected += 1;
    }
  }

  return { total: entries.length, byModel, substitutions, unexpected };
}

export const AI_LOG_FILE = LOG_FILE;
