/**
 * Social Listening Debug Logger
 *
 * Dedicated file-based logger for the Social Listening sync pipeline so you can
 * see — after the fact and without the console scrolling away — exactly:
 *   • WHEN a sync started and whether it was a background auto-refresh or a
 *     user-clicked "Sync Live Data" (interactive) run,
 *   • each phase transition (fetching → analyzing → computing → completed),
 *   • how much data was actually fetched (posts/comments per source),
 *   • whether AI analysis used the cache, the OpenAI Batch API, or the
 *     synchronous analyzer, and how many items each handled,
 *   • when a background batch was SUPERSEDED/cancelled by a user click, and
 *   • if a run FAILED, the reason + stack.
 *
 * Every line is tagged with the workspaceId, run mode, and runId so concurrent
 * workspaces don't get tangled together.
 *
 * Usage:
 *   import { slog } from '../utils/social-listening-debug-logger';
 *   slog('sync.start', { workspaceId, mode, runId, niche });
 *
 * Tail it live with:
 *   tail -f logs/social-listening-debug.log
 *
 * Turn it off with SOCIAL_LISTENING_DEBUG=false.
 */

import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'social-listening-debug.log');

const ENABLED = process.env.SOCIAL_LISTENING_DEBUG !== 'false';

let streamReady = false;
let writeStream: fs.WriteStream | null = null;

function ensureStream(): fs.WriteStream | null {
  if (!ENABLED) return null;
  if (streamReady) return writeStream;
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    writeStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });
    streamReady = true;
    writeStream.write(`\n===== Social Listening debug session started ${new Date().toISOString()} =====\n`);
  } catch {
    // If the file can't be opened, silently disable so we never crash a sync.
    streamReady = true;
    writeStream = null;
  }
  return writeStream;
}

/** Append a timestamped, structured debug line for the Social Listening flow. */
export function slog(event: string, data?: Record<string, unknown>): void {
  if (!ENABLED) return;
  const stream = ensureStream();
  const ts = new Date().toISOString();
  let line = `[${ts}] ${event}`;
  if (data && Object.keys(data).length > 0) {
    try {
      line += ' ' + JSON.stringify(data);
    } catch {
      line += ' [unserializable data]';
    }
  }
  line += '\n';

  // Mirror to console with a clear tag so it's also visible in live logs.
  // eslint-disable-next-line no-console
  console.log(`[SL-DEBUG] ${line.trim()}`);

  if (stream) {
    stream.write(line);
  }
}

/**
 * Log an error with its message + stack in a structured, greppable form.
 * Use for failed syncs so the "why" is always captured.
 */
export function slogError(event: string, error: unknown, data?: Record<string, unknown>): void {
  const err = error as any;
  slog(event, {
    ...(data || {}),
    error: err?.message || String(error),
    stack: typeof err?.stack === 'string' ? err.stack.split('\n').slice(0, 6).join(' | ') : undefined,
  });
}

export const SOCIAL_LISTENING_DEBUG_LOG_FILE = LOG_FILE;
