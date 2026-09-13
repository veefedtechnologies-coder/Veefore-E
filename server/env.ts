import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.join(process.cwd(), '.env') });

/**
 * Normalize connection-string env vars that env editors (Railway raw editor, a
 * copied `.env` line, etc.) sometimes store WITH wrapping quotes. A value like
 * `"rediss://…"` fails ioredis/mongoose URL parsing and, for Redis, is treated
 * as a unix socket PATH → `connect ENOENT %22rediss://…%22`. Runs at the very
 * first import (server/index.ts imports './env' before anything else), so every
 * downstream reader sees the clean value regardless of import order.
 */
function stripWrappingQuotes(raw: string | undefined): string | undefined {
  if (raw == null) return raw;
  let s = String(raw).trim();
  while (
    s.length >= 2 &&
    ((s[0] === '"' && s[s.length - 1] === '"') ||
      (s[0] === "'" && s[s.length - 1] === "'") ||
      (s[0] === '`' && s[s.length - 1] === '`'))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s;
}

for (const key of [
  'REDIS_URL',
  'KV_URL',
  'STORAGE_REDIS_URL',
  'MONGODB_URI',
  'MONGO_URL',
]) {
  const cleaned = stripWrappingQuotes(process.env[key]);
  if (cleaned !== undefined && cleaned !== process.env[key]) {
    process.env[key] = cleaned;
  }
}
