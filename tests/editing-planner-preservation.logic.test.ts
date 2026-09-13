/**
 * Regression tests for preservation-constraint handling in the pure
 * Editing_Planner core
 * (`server/features/video-editor/services/editing-planner.logic.ts`).
 *
 * The bug: preservation CONSTRAINTS emitted by the Intent_Router inside
 * `requestedChanges` (e.g. "Preserve the original audio track and any branding
 * (logos, colors) in place") were mapped to work items, found no engine, and
 * surfaced in the chat card as "Skipped — No available engine can perform the
 * requested change: …". Nothing needs to be executed to leave something
 * unchanged, so such strings must never become work items — while genuine edits
 * that merely start with "keep" ("keep only the first 10 seconds") must.
 *
 * Framework: vitest (per design test stack).
 */

import { describe, it, expect } from 'vitest';
import {
  buildEditingPlan,
  isPreservationConstraint,
  protectedElementsFromConstraint,
  type PlannerAnalysis,
} from '../server/features/video-editor/services/editing-planner.logic';
import {
  normalizeVideoIntent,
  type VideoIntentCandidate,
} from '../server/features/video-editor/services/intent-extraction.logic';

const analysis: PlannerAnalysis = { sourceDurationMs: 60_000 };

function planFor(
  requestedChanges: string[],
  action: VideoIntentCandidate['action'] = 'VIDEO_EDIT'
) {
  const intent = normalizeVideoIntent({
    action,
    confidence: 0.9,
    requestedChanges,
  } as VideoIntentCandidate);
  return buildEditingPlan({ intent, analysis });
}

// ---------------------------------------------------------------------------
// isPreservationConstraint — preservation phrasing
// ---------------------------------------------------------------------------

describe('isPreservationConstraint recognises preservation constraints', () => {
  const PRESERVATION: readonly string[] = [
    // Verbatim from the bug report.
    'Preserve the original audio track and any branding (logos, colors) in place',
    'Keep on-screen text legible',
    'maintain the aspect ratio',
    'leave the logo unchanged',
    "don't remove the watermark",
    'do not alter the voice',
    'without changing the background',
    'ensure the product stays visible',
    'keep the branding intact',
  ];

  PRESERVATION.forEach(change => {
    it(`treats ${JSON.stringify(change)} as a preservation constraint`, () => {
      expect(isPreservationConstraint(change)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// isPreservationConstraint — genuine edits must NOT be swallowed
// ---------------------------------------------------------------------------

describe('isPreservationConstraint never swallows a genuine edit', () => {
  const GENUINE_EDITS: readonly string[] = [
    // "keep"-prefixed edits: trims and highlight selections.
    'keep only the first 10 seconds',
    'keep the last 5 seconds',
    'keep it under 30 seconds',
    'keep only the highlights',
    'keep the best moments',
    'keep just the part where he talks',
    // Ordinary edits.
    'trim to 10s',
    'reframe to 9:16',
    'remove the person',
    'add captions',
  ];

  GENUINE_EDITS.forEach(change => {
    it(`treats ${JSON.stringify(change)} as an executable edit`, () => {
      expect(isPreservationConstraint(change)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Total / pure
// ---------------------------------------------------------------------------

describe('isPreservationConstraint is total and pure', () => {
  it('handles empty, whitespace and non-string input without throwing', () => {
    expect(isPreservationConstraint('')).toBe(false);
    expect(isPreservationConstraint('   \t\n ')).toBe(false);
    expect(isPreservationConstraint(undefined as unknown as string)).toBe(false);
    expect(isPreservationConstraint(null as unknown as string)).toBe(false);
    expect(isPreservationConstraint(42 as unknown as string)).toBe(false);
    expect(isPreservationConstraint({} as unknown as string)).toBe(false);
    expect(isPreservationConstraint([] as unknown as string)).toBe(false);
  });

  it('is case-insensitive and deterministic', () => {
    expect(isPreservationConstraint('PRESERVE THE LOGO IN PLACE')).toBe(true);
    expect(isPreservationConstraint('Preserve The Logo In Place')).toBe(true);
    expect(isPreservationConstraint('KEEP ONLY THE FIRST 10 SECONDS')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Plan-level: preservation strings never become unsupported operations
// ---------------------------------------------------------------------------

describe('buildEditingPlan filters preservation constraints out of the work list', () => {
  const changes = [
    'reframe to 9:16',
    'Preserve the original audio track and any branding (logos, colors) in place',
    'Keep on-screen text legible',
  ];

  it('yields no unsupported/unavailable operation and still yields the reframe', () => {
    const plan = planFor(changes);

    expect(plan.operations.some(op => op.kind === 'unsupported')).toBe(false);
    expect(plan.operations.some(op => op.status === 'unavailable')).toBe(false);
    expect(plan.operations.some(op => op.kind === 'aspect')).toBe(true);
  });

  it('folds the named Protected_Elements onto the operations (Req 5.5)', () => {
    const plan = planFor(changes);
    const editOp = plan.operations.find(op => op.kind === 'aspect');

    expect(editOp).toBeDefined();
    expect(editOp?.preservationConstraints).toEqual(
      expect.arrayContaining(['original_audio', 'logo', 'colors', 'text'])
    );
  });

  it('maps only Protected_Element members that the text clearly names', () => {
    expect(protectedElementsFromConstraint('Keep on-screen text legible')).toEqual(['text']);
    expect(protectedElementsFromConstraint('keep the pacing snappy')).toEqual([]);
    expect(protectedElementsFromConstraint(undefined as unknown as string)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Non-empty-plan guard
// ---------------------------------------------------------------------------

describe('a preservation-only message still yields a non-empty plan', () => {
  it('falls back to the action-derived work item (VIDEO_SHORTEN → trim)', () => {
    const plan = planFor(
      [
        'Preserve the original audio track and any branding (logos, colors) in place',
        'Keep on-screen text legible',
      ],
      'VIDEO_SHORTEN'
    );

    expect(plan.operations.length).toBeGreaterThan(0);
    expect(plan.operations.some(op => op.kind === 'unsupported')).toBe(false);
    const trim = plan.operations.find(op => op.kind === 'trim');
    expect(trim).toBeDefined();
    expect(trim?.type).toBe('deterministic');
    expect(trim?.status).toBe('executable');
  });

  it('does not regress the "no changes at all" behaviour', () => {
    // VIDEO_EDIT carries no concrete op without changes → still an empty plan.
    expect(planFor([]).operations).toEqual([]);
    expect(planFor(['maintain the aspect ratio']).operations).toEqual([]);
    // An action that does imply work still plans it.
    expect(planFor([], 'VIDEO_CAPTION').operations.some(op => op.kind === 'caption')).toBe(true);
  });
});
