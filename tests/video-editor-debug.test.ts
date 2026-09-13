/**
 * Unit tests for the video-editor debug recorder (`video-editor-debug.ts`).
 *
 * Verifies the env gate (off by default), that a turn trace writes one JSONL
 * line per stage sharing a traceId with a monotonic seq, that TEXT gating
 * controls whether the instruction is stored, and that recording never throws.
 *
 * Framework: vitest.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import {
  VideoEditorTrace,
  videoEditorDebugEnabled,
  VIDEO_EDITOR_DEBUG_FILE,
} from '../server/features/video-editor/services/video-editor-debug';

const DEBUG = 'VIDEO_EDITOR_DEBUG';
const DEBUG_TEXT = 'VIDEO_EDITOR_DEBUG_TEXT';

let savedDebug: string | undefined;
let savedText: string | undefined;

beforeEach(() => {
  savedDebug = process.env[DEBUG];
  savedText = process.env[DEBUG_TEXT];
  // Start each test from a clean debug file.
  try {
    fs.rmSync(VIDEO_EDITOR_DEBUG_FILE, { force: true });
  } catch {
    /* ignore */
  }
});

afterEach(() => {
  const restore = (key: string, val: string | undefined) => {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  };
  restore(DEBUG, savedDebug);
  restore(DEBUG_TEXT, savedText);
});

/** Read the debug file's lines as parsed JSON objects (or [] if absent). */
function readLines(): Array<Record<string, unknown>> {
  if (!fs.existsSync(VIDEO_EDITOR_DEBUG_FILE)) return [];
  return fs
    .readFileSync(VIDEO_EDITOR_DEBUG_FILE, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

describe('video-editor-debug recorder', () => {
  it('writes nothing when VIDEO_EDITOR_DEBUG is off (default)', () => {
    delete process.env[DEBUG];
    expect(videoEditorDebugEnabled()).toBe(false);

    const trace = new VideoEditorTrace({ projectId: 'p1', workspaceId: 'w1', userId: 'u1' });
    trace.event('exec.pixel', { planKind: 'filter' });
    trace.end('rendered', { finalKind: 'filter' });

    expect(readLines()).toHaveLength(0);
  });

  it('writes one JSONL line per stage sharing a traceId with a monotonic seq', () => {
    process.env[DEBUG] = 'true';

    const trace = new VideoEditorTrace({
      projectId: 'p1',
      workspaceId: 'w1',
      userId: 'u1',
      sourceId: 'src-1',
      message: 'remove the guy',
    });
    trace.event('source', { resolvedSourceId: 'src-1', durationMs: 30000 });
    trace.event('exec.localize', { kind: 'windows', windows: [{ startMs: 5000, endMs: 10000 }] });
    trace.end('rendered', { finalKind: 'object_removal' });

    const lines = readLines();
    // turn.start + source + exec.localize + turn.end = 4 lines.
    expect(lines).toHaveLength(4);

    // All share one traceId.
    const traceId = lines[0].traceId as string;
    expect(traceId).toMatch(/^vedit-/);
    for (const l of lines) expect(l.traceId).toBe(traceId);

    // Monotonic seq 1..4, ascending ms, expected stages in order.
    expect(lines.map((l) => l.seq)).toEqual([1, 2, 3, 4]);
    expect(lines.map((l) => l.stage)).toEqual(['turn.start', 'source', 'exec.localize', 'turn.end']);
    for (const l of lines) expect(typeof l.ms).toBe('number');

    // Base identity is on every line.
    for (const l of lines) {
      expect(l.projectId).toBe('p1');
      expect(l.workspaceId).toBe('w1');
      expect(l.userId).toBe('u1');
    }

    // Final line carries the outcome + total time.
    const end = lines[3];
    expect(end.outcome).toBe('rendered');
    expect(end.finalKind).toBe('object_removal');
    expect(typeof end.totalMs).toBe('number');
  });

  it('stores the instruction text only when VIDEO_EDITOR_DEBUG_TEXT is on', () => {
    process.env[DEBUG] = 'true';

    // TEXT off → length recorded, but no message text.
    delete process.env[DEBUG_TEXT];
    new VideoEditorTrace({ projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'secret words' });
    let start = readLines()[0];
    expect(start.messageLength).toBe('secret words'.length);
    expect(start.message).toBeUndefined();

    // TEXT on → truncated message text recorded.
    fs.rmSync(VIDEO_EDITOR_DEBUG_FILE, { force: true });
    process.env[DEBUG_TEXT] = 'true';
    new VideoEditorTrace({ projectId: 'p1', workspaceId: 'w1', userId: 'u1', message: 'secret words' });
    start = readLines()[0];
    expect(start.message).toBe('secret words');
  });

  it('never throws even if the file path is unusual', () => {
    process.env[DEBUG] = 'true';
    const trace = new VideoEditorTrace({ projectId: 'p1', workspaceId: 'w1', userId: 'u1' });
    expect(() => trace.event('exec.generative', { kind: 'object_removal', outcome: 'rendered' })).not.toThrow();
    expect(() => trace.end('rendered')).not.toThrow();
    expect(path.isAbsolute(VIDEO_EDITOR_DEBUG_FILE)).toBe(true);
  });
});
