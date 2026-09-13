/**
 * The video-editor chat card's overlay line and its checklist must be ONE
 * source of truth.
 *
 * THE DEFECT THESE PIN: the overlay read whatever `status` string arrived last
 * while the checklist independently picked "the first step still pending". A step
 * that was dropped from execution stayed pending forever, so the checklist marked
 * it current while the overlay narrated a completely different step.
 *
 * Both surfaces now resolve from `focusPlan(...)`: the checklist highlights row
 * `currentIndex` and the overlay's counter is `currentIndex + 1` over the same
 * visible array. These tests assert that they cannot disagree — including after
 * the checklist's filtering (unavailable steps lifted out, `render` hidden,
 * duplicate labels collapsed) has moved the rows around.
 *
 * Framework: vitest. Pure logic — nothing is mounted.
 */

import { describe, it, expect } from 'vitest';

import {
  buildOverlayLine,
  focusPlan,
  isSameLiveVideoEditorCard,
  MIN_VISIBLE_PLAN_STEPS,
  narrativePhraseFor,
  partitionPlan,
  stepState,
  type PlanStepLike,
} from '../client/src/features/chat/components/video-editor-card.logic';

/** A streamed plan step. */
function step(
  kind: string,
  label: string,
  status = 'executable',
  extra: Partial<PlanStepLike> = {},
): PlanStepLike {
  return { kind, type: 'deterministic', status, label, ...extra };
}

/**
 * What the CHECKLIST actually draws as current — reimplemented here exactly as
 * `PlanSteps` does it, so the assertion compares two independent readings of the
 * same resolved focus rather than restating one of them.
 */
function checklistCurrentLabel(
  plan: PlanStepLike[],
  activeStepIndex: number | undefined,
  working = true,
): string | null {
  const focus = focusPlan(plan, activeStepIndex, working);
  if (focus.steps.length < MIN_VISIBLE_PLAN_STEPS) return null;
  const row = focus.steps.find(({ step: s }, i) => {
    const done = stepState(s) === 'done';
    return working && !done && i === focus.currentIndex;
  });
  return row ? row.step.label : null;
}

/** The "Step N of M" fragment the overlay renders, or null when it shows none. */
function overlayCounter(
  plan: PlanStepLike[],
  activeStepIndex: number | undefined,
  opts: { status?: string; request?: string; working?: boolean } = {},
): string | null {
  const working = opts.working ?? true;
  const line = buildOverlayLine({
    status: opts.status,
    request: opts.request,
    focus: focusPlan(plan, activeStepIndex, working),
    fallback: 'Preparing your clip',
  });
  const m = line.match(/Step (\d+) of (\d+)/);
  return m ? m[0] : null;
}

// ---------------------------------------------------------------------------
// partitionPlan — filtering plus the index bookkeeping the pin relies on
// ---------------------------------------------------------------------------

describe('partitionPlan', () => {
  it('lifts unavailable steps out of the checklist and hides the internal render step', () => {
    const plan = [
      step('aspect', 'Reframe the aspect ratio'),
      step('crop', 'Crop the frame', 'unavailable', { limitation: 'no engine for "crop"' }),
      step('trim', 'Trim the clip'),
      step('render', 'Render the final video'),
    ];
    const { steps, unavailable } = partitionPlan(plan);

    expect(steps.map((s) => s.step.kind)).toEqual(['aspect', 'trim']);
    expect(unavailable.map((s) => s.kind)).toEqual(['crop']);
  });

  it('maps every raw plan index onto the visible row it survives as', () => {
    const plan = [
      step('aspect', 'Reframe the aspect ratio'),
      step('crop', 'Crop the frame', 'unavailable', { limitation: 'nope' }),
      step('trim', 'Trim the clip'),
      step('render', 'Render the final video'),
    ];
    const { visibleIndexByPlanIndex } = partitionPlan(plan);

    expect(visibleIndexByPlanIndex.get(0)).toBe(0); // aspect → row 0
    expect(visibleIndexByPlanIndex.get(2)).toBe(1); // trim   → row 1 (after crop left)
    expect(visibleIndexByPlanIndex.has(1)).toBe(false); // crop is not drawn
    expect(visibleIndexByPlanIndex.has(3)).toBe(false); // render is hidden
  });

  it('collapses a duplicate label onto the row that kept it', () => {
    const plan = [
      step('filter', 'Apply a colour grade'),
      step('filter', 'Apply a colour grade'),
      step('trim', 'Trim the clip'),
    ];
    const { steps, visibleIndexByPlanIndex } = partitionPlan(plan);

    expect(steps).toHaveLength(2);
    // Pinning the collapsed duplicate still resolves to the drawn row, so the
    // checklist can never be left with no current row while the overlay claims one.
    expect(visibleIndexByPlanIndex.get(1)).toBe(0);
    expect(visibleIndexByPlanIndex.get(2)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// focusPlan — the single resolved answer
// ---------------------------------------------------------------------------

describe('focusPlan', () => {
  it('honours the server pin, mapped through the checklist filtering', () => {
    const plan = [
      step('aspect', 'Reframe the aspect ratio', 'done'),
      step('crop', 'Crop the frame', 'unavailable', { limitation: 'nope' }),
      step('trim', 'Trim the clip'),
      step('render', 'Render the final video'),
    ];
    // The server is on the trim op, which is RAW index 2 but VISIBLE row 1.
    const focus = focusPlan(plan, 2, true);
    expect(focus.currentIndex).toBe(1);
    expect(focus.serverPinned).toBe(true);
    expect(focus.steps[focus.currentIndex].step.kind).toBe('trim');
  });

  it('falls back to the first pending row when the server sent no pin', () => {
    const plan = [
      step('aspect', 'Reframe the aspect ratio', 'done'),
      step('trim', 'Trim the clip'),
      step('caption', 'Add captions'),
    ];
    const focus = focusPlan(plan, undefined, true);
    expect(focus.currentIndex).toBe(1);
    expect(focus.serverPinned).toBe(false);
  });

  it('never marks a step current on a finished/idle card', () => {
    const plan = [step('aspect', 'Reframe the aspect ratio', 'done'), step('trim', 'Trim the clip', 'done')];
    const focus = focusPlan(plan, 0, false);
    expect(focus.currentIndex).toBe(-1);
    expect(focus.serverPinned).toBe(false);
  });

  it('drops a pin that resolves to a step nobody can see (reported unavailable)', () => {
    const plan = [
      step('aspect', 'Reframe the aspect ratio'),
      step('crop', 'Crop the frame', 'unavailable', { limitation: 'nope' }),
      step('trim', 'Trim the clip'),
    ];
    // A stale pin on the crop must not leave the card claiming an invisible step.
    const focus = focusPlan(plan, 1, true);
    expect(focus.serverPinned).toBe(false);
    expect(focus.steps[focus.currentIndex].step.kind).toBe('aspect');
  });
});

// ---------------------------------------------------------------------------
// THE INVARIANT: the counter and the highlighted row are the same step
// ---------------------------------------------------------------------------

describe('overlay counter vs. checklist current row', () => {
  /** The exact reported scenario: reframe → crop (unrunnable) → trim → render. */
  const reportedPlan = (activeKind: 'aspect' | 'trim') => [
    step('aspect', 'Reframe the aspect ratio', activeKind === 'trim' ? 'done' : 'executable'),
    step('crop', 'Crop the frame', 'unavailable', {
      limitation: 'no in-process deterministic engine for "crop"',
    }),
    step('trim', 'Trim the clip'),
    step('render', 'Render the final video'),
  ];

  it('agree while the reframe runs', () => {
    const plan = reportedPlan('aspect');
    expect(checklistCurrentLabel(plan, 0)).toBe('Reframe the aspect ratio');
    expect(overlayCounter(plan, 0, { request: 'reframe to 9:16' })).toBe('Step 1 of 2');
  });

  it('agree once execution moves to the trim (the case that used to contradict)', () => {
    const plan = reportedPlan('trim');
    // The checklist points at the trim...
    expect(checklistCurrentLabel(plan, 2)).toBe('Trim the clip');
    // ...and so does the counter: row 2 of the 2 VISIBLE rows.
    expect(overlayCounter(plan, 2, { request: 'trim to 10 seconds' })).toBe('Step 2 of 2');
  });

  it('agree for every pinnable step of every plan shape', () => {
    const plans: PlanStepLike[][] = [
      reportedPlan('aspect'),
      reportedPlan('trim'),
      [
        step('filter', 'Apply a colour grade'),
        step('filter', 'Apply a colour grade'),
        step('aspect', 'Reframe the aspect ratio'),
        step('caption', 'Add captions'),
        step('render', 'Render the final video'),
      ],
      [
        step('concat', 'Stitch the clips together', 'done'),
        step('highlight', 'Find the best moments'),
        step('caption', 'Add captions'),
      ],
    ];

    for (const plan of plans) {
      for (let raw = 0; raw < plan.length; raw += 1) {
        const focus = focusPlan(plan, raw, true);
        const counter = overlayCounter(plan, raw, { status: 'Working…', request: 'make it 9:16' });
        const current = checklistCurrentLabel(plan, raw);

        if (counter === null) {
          // No counter is shown, so there is nothing that could disagree.
          continue;
        }
        const n = Number(counter.match(/Step (\d+) of (\d+)/)![1]);
        const m = Number(counter.match(/Step (\d+) of (\d+)/)![2]);
        expect(m).toBe(focus.steps.length);
        expect(n).toBe(focus.currentIndex + 1);
        // The counter's Nth visible row IS the row the checklist highlighted.
        expect(focus.steps[n - 1].step.label).toBe(current);
      }
    }
  });

  it('shows no counter before any step is executing (server status / rotating copy wins)', () => {
    const plan = [step('aspect', 'Reframe the aspect ratio'), step('trim', 'Trim the clip')];
    expect(overlayCounter(plan, undefined, { status: 'Planned the edit.' })).toBeNull();
    expect(
      buildOverlayLine({
        status: 'Planned the edit.',
        focus: focusPlan(plan, undefined, true),
        fallback: 'Preparing your clip',
      }),
    ).toBe('Planned the edit.');
    expect(
      buildOverlayLine({
        focus: focusPlan(plan, undefined, true),
        fallback: 'Preparing your clip',
      }),
    ).toBe('Preparing your clip');
  });

  it('shows no counter when the checklist itself is not drawn (fewer than 2 rows)', () => {
    const plan = [step('aspect', 'Reframe the aspect ratio'), step('render', 'Render the final video')];
    expect(checklistCurrentLabel(plan, 0)).toBeNull();
    expect(overlayCounter(plan, 0, { request: 'make it vertical' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The narrative line itself
// ---------------------------------------------------------------------------

describe('buildOverlayLine narrative', () => {
  const plan = [
    step('aspect', 'Reframe the aspect ratio'),
    step('crop', 'Crop the frame'),
    step('trim', 'Trim the clip'),
  ];

  it('reads as prose, weaves in the user\u2019s own words, and is NOT the checklist label', () => {
    const line = buildOverlayLine({
      status: 'Reframe the aspect ratio\u2026',
      request: 'reframe this to 9:16 for reels',
      focus: focusPlan(plan, 0, true),
      fallback: 'Preparing your clip',
    });
    expect(line).toBe('Reframing your clip to 9:16 \u00b7 Step 1 of 3');
    expect(line).not.toContain('Reframe the aspect ratio');
  });

  it('falls back to the server status for a kind it has no honest phrasing for', () => {
    const odd = [step('some_new_kind', 'Do the new thing'), step('trim', 'Trim the clip')];
    const line = buildOverlayLine({
      status: 'Doing the new thing\u2026',
      focus: focusPlan(odd, 0, true),
      fallback: 'Preparing your clip',
    });
    expect(line).toBe('Doing the new thing\u2026 \u00b7 Step 1 of 2');
    expect(narrativePhraseFor('some_new_kind', 'whatever')).toBeNull();
  });

  it('derives concrete details only from the user\u2019s own words', () => {
    expect(narrativePhraseFor('aspect', 'make it vertical')).toBe('Reframing your clip to 9:16');
    expect(narrativePhraseFor('aspect', 'just reframe it')).toBe('Reframing your clip');
    expect(narrativePhraseFor('crop', 'crop it square')).toBe('Cropping the frame to 1:1');
    expect(narrativePhraseFor('trim', 'trim to 10 seconds')).toBe('Trimming your clip to 10s');
    expect(narrativePhraseFor('speed', 'speed it up 2x')).toBe('Retiming your clip to 2x');
    expect(narrativePhraseFor('filter', 'give it a cinematic look')).toBe(
      'Grading the colour for a cinematic look',
    );
    // A timestamp is never mistaken for an aspect ratio.
    expect(narrativePhraseFor('aspect', 'cut from 0:05 to 0:20')).toBe('Reframing your clip');
  });
});

// ---------------------------------------------------------------------------
// No-op stream updates
// ---------------------------------------------------------------------------

describe('isSameLiveVideoEditorCard', () => {
  const base = {
    status: 'Trim the clip\u2026',
    subject: 'trim it',
    phase: 'rendering',
    percent: 70,
    activeStepIndex: 2,
    plan: [step('aspect', 'Reframe the aspect ratio', 'done'), step('trim', 'Trim the clip')],
  };

  it('treats an identical re-emit as a no-op', () => {
    expect(isSameLiveVideoEditorCard(base, { ...base, plan: [...base.plan] })).toBe(true);
  });

  it('never swallows a real advance', () => {
    expect(isSameLiveVideoEditorCard(base, { ...base, percent: 74 })).toBe(false);
    expect(isSameLiveVideoEditorCard(base, { ...base, activeStepIndex: 3 })).toBe(false);
    expect(isSameLiveVideoEditorCard(base, { ...base, phase: 'complete' })).toBe(false);
    expect(
      isSameLiveVideoEditorCard(base, {
        ...base,
        plan: [base.plan[0], { ...base.plan[1], status: 'done' }],
      }),
    ).toBe(false);
    expect(
      isSameLiveVideoEditorCard(base, {
        ...base,
        plan: [base.plan[0], { ...base.plan[1], status: 'unavailable', limitation: 'nope' }],
      }),
    ).toBe(false);
  });
});
