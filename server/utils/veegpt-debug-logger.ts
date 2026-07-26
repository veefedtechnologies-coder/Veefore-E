/**
 * VeeGPT Debug Logger
 *
 * Lightweight file-based logger dedicated to the VeeGPT chat streaming flow.
 * The normal console scrolls too fast to follow the chat lifecycle (subscribe →
 * status heartbeat → token chunks → complete), so every step is appended with a
 * millisecond timestamp to logs/veegpt-debug.log for after-the-fact inspection.
 *
 * Usage:
 *   import { vlog } from '../utils/veegpt-debug-logger';
 *   vlog('event-name', { convId, anything });
 *
 * Tail it live with:
 *   tail -f logs/veegpt-debug.log
 */

import fs from 'fs';
import path from 'path';

const LOG_DIR = path.join(process.cwd(), 'logs');
const LOG_FILE = path.join(LOG_DIR, 'veegpt-debug.log');

// Allow turning the debug logging off via env without touching code.
const ENABLED = process.env.VEEGPT_DEBUG !== 'false';

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
    // Marker so it's obvious when the server (re)started.
    writeStream.write(`\n===== VeeGPT debug session started ${new Date().toISOString()} =====\n`);
  } catch (err) {
    // If the file can't be opened, silently disable to avoid crashing the server.
    streamReady = true;
    writeStream = null;
  }
  return writeStream;
}

/** Append a timestamped, structured debug line for the VeeGPT chat flow. */
export function vlog(event: string, data?: Record<string, unknown>): void {
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

  // Always mirror to console too (handy when the console isn't scrolling).
  // eslint-disable-next-line no-console
  console.log(`[VEEGPT-DEBUG] ${line.trim()}`);

  if (stream) {
    stream.write(line);
  }
}

export const VEEGPT_DEBUG_LOG_FILE = LOG_FILE;
