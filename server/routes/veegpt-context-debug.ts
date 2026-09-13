/**
 * VeeGPT context debug recorder (verification aid — NOT part of the request path).
 *
 * PURPOSE
 * -------
 * The server streams responses very fast, so per-request detail scrolls past in
 * the console before it can be read. This module persists that detail to a file
 * you can open at leisure:
 *
 *   logs/veegpt-context-debug.jsonl   (one JSON object per line)
 *
 * It records TWO kinds of line per VeeGPT chat turn so you can verify the new
 * composer path end-to-end:
 *
 *   • kind:"compose" — what the composer BUILT for the request: the detected
 *     capability intent, which Context_Modules were selected, which tools were
 *     exposed (and how many), the per-category token breakdown, and the exact
 *     composed-prompt size (characters + estimated input tokens).
 *
 *   • kind:"usage"   — what the PROVIDER actually billed for the request: the
 *     REAL prompt (input) tokens, completion (output) tokens, the reasoning
 *     subset of the output, cached tokens, and the total — read straight from
 *     the provider `usage`/`usageMetadata` at the single recording chokepoint
 *     (`recordAIUsage`). `estimated:true` means the provider returned no usage
 *     and the counts are the ~4-chars/token fallback.
 *
 * SAFETY
 * ------
 * • OFF by default. Only writes when `VEEGPT_CTX_DEBUG` is truthy
 *   (1/true/yes/on). Zero overhead and zero output otherwise.
 * • NEVER throws. Every function swallows its own errors so debug recording can
 *   never break a request.
 * • Privacy: message text is stored TRUNCATED (first 400 chars) and only when
 *   `VEEGPT_CTX_DEBUG_TEXT` is also truthy; by default only counts + metadata
 *   are written, never full prompts or user content.
 */

import fs from 'node:fs';
import path from 'node:path';

/** Absolute path of the debug log file (project-root/logs/…). */
const DEBUG_DIR = path.join(process.cwd(), 'logs');
const DEBUG_FILE = path.join(DEBUG_DIR, 'veegpt-context-debug.jsonl');

/** Truthy-env test matching the rest of the VEEGPT_* config convention. */
function envOn(name: string): boolean {
  const v = (process.env[name] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Is context debug recording enabled? (`VEEGPT_CTX_DEBUG`) */
export function ctxDebugEnabled(): boolean {
  return envOn('VEEGPT_CTX_DEBUG');
}

/** May we store truncated message/prompt text? (`VEEGPT_CTX_DEBUG_TEXT`) */
export function ctxDebugTextEnabled(): boolean {
  return envOn('VEEGPT_CTX_DEBUG_TEXT');
}

/** Truncate any text to a privacy-safe preview length. */
export function preview(text: unknown, max = 400): string {
  const s = typeof text === 'string' ? text : String(text ?? '');
  return s.length > max ? `${s.slice(0, max)}…(+${s.length - max} chars)` : s;
}

/**
 * Append one record to the debug file as a single JSON line. Adds a timestamp.
 * Never throws; creates the logs directory on first write.
 */
export function appendCtxDebug(record: Record<string, unknown>): void {
  if (!ctxDebugEnabled()) return;
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record });
    fs.appendFileSync(DEBUG_FILE, line + '\n');
  } catch {
    /* debug recording must never break a request */
  }
}

/** The resolved debug file path (exported for tooling / messages). */
export const CTX_DEBUG_FILE = DEBUG_FILE;
