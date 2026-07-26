import * as fs from 'fs';
import * as path from 'path';

/**
 * Dedicated debug logger for Instagram / Meta Graph API errors.
 *
 * Writes ONLY Meta API errors (with full response bodies, headers, and
 * context) to logs/instagram-api-errors.log — kept separate from the main
 * server log so you can read it clearly without 10k lines of noise.
 *
 * Usage:
 *   import { logMetaApiError, logMetaApiSuccess } from '../utils/instagram-api-debug-logger';
 *
 *   logMetaApiError('getUserProfile', { url, statusCode, metaBody, token: token.slice(0,12) });
 *   logMetaApiSuccess('getUserProfile', { username, followersCount });
 */

const LOG_FILE = path.join(process.cwd(), 'logs', 'instagram-api-errors.log');
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB — rotate when exceeded

function timestamp(): string {
  return new Date().toISOString();
}

function rotatIfNeeded(): void {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size > MAX_FILE_SIZE_BYTES) {
      const rotated = LOG_FILE.replace('.log', `.${Date.now()}.old.log`);
      fs.renameSync(LOG_FILE, rotated);
    }
  } catch { /* file doesn't exist yet — that's fine */ }
}

function write(line: string): void {
  try {
    const logsDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    rotatIfNeeded();
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8');
  } catch { /* non-fatal — never break the app */ }
}

export interface MetaApiErrorContext {
  /** The full URL that was called (token redacted automatically). */
  url?: string;
  /** HTTP status code (400, 403, etc.) */
  statusCode?: number;
  /** The full Meta error response body. */
  metaBody?: any;
  /** Only first 12 chars of the token for identification (safe to log). */
  tokenPrefix?: string;
  /** Instagram account id being queried. */
  accountId?: string;
  /** Any additional context string. */
  note?: string;
}

export interface MetaApiSuccessContext {
  username?: string;
  accountId?: string;
  followersCount?: number;
  [key: string]: any;
}

/**
 * Log a Meta API error with full response body.
 * Call this wherever a 4xx/5xx is received from graph.facebook.com or graph.instagram.com.
 */
export function logMetaApiError(operation: string, ctx: MetaApiErrorContext): void {
  // Redact the full token from the URL before logging
  const safeUrl = ctx.url
    ? ctx.url.replace(/access_token=[^&]+/g, 'access_token=REDACTED')
    : undefined;

  const entry = {
    ts: timestamp(),
    level: 'ERROR',
    op: operation,
    statusCode: ctx.statusCode,
    tokenPrefix: ctx.tokenPrefix,
    accountId: ctx.accountId,
    url: safeUrl,
    metaError: ctx.metaBody?.error || ctx.metaBody,
    // Surface the key fields at the top level for quick scanning
    metaCode: ctx.metaBody?.error?.code,
    metaSubcode: ctx.metaBody?.error?.error_subcode,
    metaType: ctx.metaBody?.error?.type,
    metaMessage: ctx.metaBody?.error?.message || ctx.metaBody?.message,
    fbTraceId: ctx.metaBody?.error?.fbtrace_id,
    note: ctx.note,
  };

  const line = `[${entry.ts}] ❌ META API ERROR | op=${entry.op} | HTTP=${entry.statusCode} | code=${entry.metaCode} subcode=${entry.metaSubcode} type=${entry.metaType}
  message : ${entry.metaMessage}
  account : ${entry.accountId || 'n/a'}
  token   : ${entry.tokenPrefix || 'n/a'}...
  url     : ${entry.url || 'n/a'}
  traceId : ${entry.fbTraceId || 'n/a'}
  note    : ${entry.note || ''}
  raw body: ${JSON.stringify(ctx.metaBody, null, 2).split('\n').join('\n  ')}
${'─'.repeat(100)}`;

  write(line);

  // Also print a compact version to stdout so it's still visible in the
  // terminal, just not buried — the full detail is in the file.
  console.error(`[META API ERROR] op=${operation} HTTP=${ctx.statusCode} code=${entry.metaCode} msg="${entry.metaMessage}" → see logs/instagram-api-errors.log`);
}

/**
 * Log a successful Meta API call for comparison / confirmation.
 * Kept brief — just enough to confirm the call worked.
 */
export function logMetaApiSuccess(operation: string, ctx: MetaApiSuccessContext): void {
  const line = `[${timestamp()}] ✅ META API OK   | op=${operation} | username=@${ctx.username || 'n/a'} accountId=${ctx.accountId || 'n/a'} followers=${ctx.followersCount ?? 'n/a'}`;
  write(line);
}

/**
 * Log a general note (e.g. "using Facebook node path", "token type: Page").
 */
export function logMetaApiNote(operation: string, note: string, extra?: Record<string, any>): void {
  const extras = extra ? `  ${JSON.stringify(extra)}` : '';
  const line = `[${timestamp()}] ℹ️  META API NOTE  | op=${operation} | ${note}${extras}`;
  write(line);
}
