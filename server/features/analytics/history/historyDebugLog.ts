/**
 * Dedicated debug logger for the analytics follows-history backfill pipeline.
 *
 * Writes timestamped, structured lines to `logs/analytics-history-debug.log`
 * (and mirrors to the console) so you can trace, end-to-end:
 *   • OAuth connect → prewarm enqueued in the background
 *   • worker fetching from Meta and storing per-day rows
 *   • disconnect + reconnect → days already in the DB are SKIPPED (not re-fetched)
 *
 * Best-effort and safe: never throws, never logs tokens or secrets (only the
 * Instagram accountId, which is a public identifier, and counts/flags).
 */

import fs from 'fs'
import path from 'path'

const LOG_DIR = path.join(process.cwd(), 'logs')
const LOG_PATH = path.join(LOG_DIR, 'analytics-history-debug.log')

let ensured = false
function ensureDir(): void {
  if (ensured) return
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true })
  } catch {
    // ignore
  }
  ensured = true
}

/**
 * Append a structured debug line. `event` is a short stable tag (e.g.
 * `CONNECT_PREWARM`, `WORKER_START`), `data` is any JSON-serialisable context.
 * Tokens/secrets must never be passed in `data`.
 */
export function histLog(event: string, data?: Record<string, unknown>): void {
  const ts = new Date().toISOString()
  const suffix = data && Object.keys(data).length > 0 ? ' ' + safeJson(data) : ''
  const line = `[${ts}] [analytics-history] ${event}${suffix}\n`
  try {
    ensureDir()
    fs.appendFileSync(LOG_PATH, line)
  } catch {
    // best-effort file logging
  }
  // Mirror to stdout so it also shows in normal server logs.
  // eslint-disable-next-line no-console
  console.log(`[ANALYTICS-HISTORY] ${event}${suffix}`)
}

function safeJson(data: Record<string, unknown>): string {
  try {
    return JSON.stringify(data)
  } catch {
    return '[unserializable]'
  }
}

export const HISTORY_DEBUG_LOG_PATH = LOG_PATH
