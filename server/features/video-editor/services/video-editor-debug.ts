/**
 * Video Editor debug recorder (verification aid — NOT part of the request path).
 *
 * PURPOSE
 * -------
 * A chat-driven video edit runs through many stages (intent → version → plan →
 * a chained sequence of deterministic / analysis / generative / caption steps),
 * and the server streams progress very fast, so the per-step detail scrolls past
 * in the console before it can be read. This module persists that detail to a
 * file you can open at leisure:
 *
 *   logs/video-editor-debug.jsonl   (one JSON object per line)
 *
 * Every line shares a `traceId` for the turn, so one edit run can be
 * reconstructed by filtering on that id. A run typically records:
 *
 *   • stage:"turn.start"     — projectId/workspaceId/userId, message preview, sourceId
 *   • stage:"source"         — the resolved source (id, duration, storageKey) or a miss
 *   • stage:"intent"         — classification status, reel-polish flag, resolved action
 *   • stage:"version"        — the new immutable version id + parent
 *   • stage:"plan"           — every planned operation (kind/type/status) + counts
 *   • stage:"exec.assembly"  — multi-clip stitch (source count, dims) or skip note
 *   • stage:"exec.pixel"     — each deterministic pixel/timeline op (kind → mapped op)
 *   • stage:"exec.highlight" — highlight analysis (envelope? speech spans?) + kept segments
 *   • stage:"exec.autocut"   — beat analysis + segment count, or honest skip
 *   • stage:"exec.localize"  — the localization decision (whole-clip vs N windows)
 *   • stage:"exec.generative"— each generative op: scope (segment/global), provider, outcome
 *   • stage:"exec.captions"  — transcription result (cue count) or honest skip
 *   • stage:"turn.end"       — final outcome, final artifact/version, applied labels, timing
 *
 * SAFETY
 * ------
 * • OFF by default. Only writes when `VIDEO_EDITOR_DEBUG` is truthy
 *   (1/true/yes/on). Zero overhead and zero output otherwise.
 * • NEVER throws. Every function swallows its own errors so debug recording can
 *   never break an edit turn.
 * • Privacy: the instruction text is stored TRUNCATED (first 400 chars) and only
 *   when `VIDEO_EDITOR_DEBUG_TEXT` is also truthy; by default only counts,
 *   decisions, and metadata are written — never full user content.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Absolute path of the debug log file (project-root/logs/…). */
const DEBUG_DIR = path.join(process.cwd(), 'logs');
const DEBUG_FILE = path.join(DEBUG_DIR, 'video-editor-debug.jsonl');

/** Truthy-env test matching the rest of the config convention. */
function envOn(name: string): boolean {
  const v = (process.env[name] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Is video-editor debug recording enabled? (`VIDEO_EDITOR_DEBUG`) */
export function videoEditorDebugEnabled(): boolean {
  return envOn('VIDEO_EDITOR_DEBUG');
}

/** May we store truncated instruction/message text? (`VIDEO_EDITOR_DEBUG_TEXT`) */
export function videoEditorDebugTextEnabled(): boolean {
  return envOn('VIDEO_EDITOR_DEBUG_TEXT');
}

/** Truncate any text to a privacy-safe preview length. */
export function previewText(text: unknown, max = 400): string {
  const s = typeof text === 'string' ? text : String(text ?? '');
  return s.length > max ? `${s.slice(0, max)}…(+${s.length - max} chars)` : s;
}

/**
 * Append one record to the debug file as a single JSON line. Adds a timestamp.
 * Never throws; creates the logs directory on first write.
 */
function appendLine(record: Record<string, unknown>): void {
  if (!videoEditorDebugEnabled()) return;
  try {
    fs.mkdirSync(DEBUG_DIR, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...record });
    fs.appendFileSync(DEBUG_FILE, line + '\n');
  } catch {
    /* debug recording must never break an edit turn */
  }
}

/** Identity/context captured once at the start of a turn trace. */
export interface TurnTraceMeta {
  projectId: string;
  workspaceId: string;
  userId: string;
  /** The user's edit instruction (stored truncated, only when TEXT debug is on). */
  message?: string;
  sourceId?: string | null;
}

/**
 * A per-turn debug trace. Construct one at the start of a chat edit turn and call
 * {@link VideoEditorTrace.event} at each stage; every call appends one JSONL line
 * tagged with the shared `traceId`, a monotonic `seq`, and elapsed `ms` since the
 * turn started. All methods are no-ops when `VIDEO_EDITOR_DEBUG` is off, and none
 * ever throw.
 */
export class VideoEditorTrace {
  /** Correlation id shared by every line of this turn. */
  readonly traceId: string;
  private readonly startedAt: number;
  private seq = 0;
  private readonly base: Record<string, unknown>;

  constructor(meta: TurnTraceMeta) {
    this.traceId = `vedit-${randomUUID()}`;
    this.startedAt = Date.now();
    this.base = {
      projectId: meta.projectId,
      workspaceId: meta.workspaceId,
      userId: meta.userId,
      sourceId: meta.sourceId ?? null,
    };
    const data: Record<string, unknown> = { source: meta.sourceId ?? null };
    if (videoEditorDebugTextEnabled() && typeof meta.message === 'string') {
      data.message = previewText(meta.message);
      data.messageLength = meta.message.length;
    } else if (typeof meta.message === 'string') {
      data.messageLength = meta.message.length;
    }
    this.event('turn.start', data);
  }

  /** Append one stage event. `data` is merged into the line. Never throws. */
  event(stage: string, data: Record<string, unknown> = {}): void {
    if (!videoEditorDebugEnabled()) return;
    this.seq += 1;
    appendLine({
      traceId: this.traceId,
      seq: this.seq,
      ms: Date.now() - this.startedAt,
      stage,
      ...this.base,
      ...data,
    });
  }

  /** Record the final turn outcome (also emits total elapsed time). */
  end(outcome: string, data: Record<string, unknown> = {}): void {
    this.event('turn.end', { outcome, totalMs: Date.now() - this.startedAt, ...data });
  }
}

/** The resolved debug file path (exported for tooling / messages). */
export const VIDEO_EDITOR_DEBUG_FILE = DEBUG_FILE;
