import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  reduceConverseEvent,
  initialConverseTurnState,
  isTerminalPhase,
  type ConverseEvent,
  type ConverseTurnState,
} from '../converseEvents';

/** Reduce a sequence of events from the initial state. */
function runEvents(events: ConverseEvent[]): ConverseTurnState {
  return events.reduce(reduceConverseEvent, initialConverseTurnState());
}

describe('reduceConverseEvent', () => {
  it('starts idle with indeterminate progress', () => {
    const state = initialConverseTurnState();
    expect(state.phase).toBe('idle');
    expect(state.progress).toBeNull();
  });

  it('tracks status text, stage, and stage-derived progress', () => {
    const state = runEvents([
      { type: 'status', status: 'Understanding your request…', stage: 'classifying', progress: 0 },
      { type: 'progress', stage: 'classifying', progress: 20 },
    ]);
    expect(state.phase).toBe('streaming');
    expect(state.statusText).toBe('Understanding your request…');
    expect(state.stage).toBe('classifying');
    expect(state.progress).toBe(20);
  });

  it('records the created version and its parent lineage', () => {
    const state = runEvents([
      { type: 'version', versionId: 'v2', parentVersionId: 'v1' },
    ]);
    expect(state.versionId).toBe('v2');
    expect(state.parentVersionId).toBe('v1');
  });

  it('captures the plan with operations and warnings', () => {
    const state = runEvents([
      {
        type: 'plan',
        versionId: 'v2',
        projectGoal: 'Trim to 15s',
        operationCount: 1,
        operations: [{ sequenceIndex: 0, kind: 'trim', status: 'executable' }],
        warnings: ['heads up'],
      },
    ]);
    expect(state.plan?.projectGoal).toBe('Trim to 15s');
    expect(state.plan?.operations).toHaveLength(1);
    expect(state.plan?.warnings).toEqual(['heads up']);
  });

  it('collects job ids from generative routing entries', () => {
    const state = runEvents([
      { type: 'routing', sequenceIndex: 0, kind: 'object_removal', engine: 'generative', jobId: 'job-1', status: 'queued' },
      { type: 'routing', sequenceIndex: 1, kind: 'trim', engine: 'deterministic', status: 'routed' },
    ]);
    expect(state.routedOperations).toHaveLength(2);
    expect(state.jobIds).toEqual(['job-1']);
  });

  it('later routing events for the same op replace earlier ones and stay ordered', () => {
    const state = runEvents([
      { type: 'routing', sequenceIndex: 1, kind: 'trim', status: 'routed' },
      { type: 'routing', sequenceIndex: 0, kind: 'crop', status: 'routed' },
      { type: 'routing', sequenceIndex: 0, kind: 'crop', engine: 'deterministic', status: 'done' },
    ]);
    expect(state.routedOperations.map((o) => o.sequenceIndex)).toEqual([0, 1]);
    expect(state.routedOperations[0].status).toBe('done');
  });

  it('a clarification changes nothing and enters the clarification phase (Req 2.6)', () => {
    const state = runEvents([
      { type: 'status', stage: 'classifying', progress: 10 },
      { type: 'clarification', reason: 'Which platform?', maxConfidence: 0.4, stateChanged: false },
    ]);
    expect(state.phase).toBe('clarification');
    expect(state.clarification?.reason).toBe('Which platform?');
    expect(state.stateChanged).toBe(false);
    expect(state.versionId).toBeNull();
  });

  it('a planned completion reaches 100% and marks stateChanged', () => {
    const state = runEvents([
      { type: 'version', versionId: 'v2', parentVersionId: 'v1' },
      { type: 'complete', outcome: 'planned', stateChanged: true, versionId: 'v2', progress: 100 },
    ]);
    expect(state.phase).toBe('complete');
    expect(state.outcome).toBe('planned');
    expect(state.progress).toBe(100);
    expect(state.stateChanged).toBe(true);
    expect(isTerminalPhase(state.phase)).toBe(true);
  });

  it('a not_video_edit completion changes nothing', () => {
    const state = runEvents([
      { type: 'complete', outcome: 'not_video_edit', stateChanged: false },
    ]);
    expect(state.phase).toBe('complete');
    expect(state.outcome).toBe('not_video_edit');
    expect(state.stateChanged).toBe(false);
  });

  it('an error event enters the error phase and preserves prior state (Req 23.5)', () => {
    const state = runEvents([
      { type: 'version', versionId: 'v2', parentVersionId: 'v1' },
      { type: 'error', code: 'CONVERSATION_TURN_ERROR', error: 'The edit could not be completed' },
    ]);
    expect(state.phase).toBe('error');
    expect(state.error?.code).toBe('CONVERSATION_TURN_ERROR');
    // Prior state (created version) is preserved — never fabricated away.
    expect(state.versionId).toBe('v2');
    expect(isTerminalPhase(state.phase)).toBe(true);
  });

  it('a stopped event enters the stopped terminal phase', () => {
    const state = runEvents([{ type: 'stopped' }]);
    expect(state.phase).toBe('stopped');
    expect(isTerminalPhase(state.phase)).toBe(true);
  });

  it('an estimate event pauses the turn awaiting confirmation (Req 17.7)', () => {
    const state = runEvents([
      { type: 'status', stage: 'routing', progress: 60 },
      {
        type: 'estimate',
        estimatedCredits: 12,
        reservationCredits: 15,
        outputSeconds: 5,
        balanceCredits: 100,
        affordable: true,
        presentedAtMs: 1000,
      },
    ]);
    expect(state.phase).toBe('awaiting_confirmation');
    expect(state.creditEstimate?.status).toBe('pending');
    expect(state.creditEstimate?.estimate.estimatedCredits).toBe(12);
    expect(state.creditEstimate?.presentedAtMs).toBe(1000);
    // Not terminal — the turn is waiting on the user.
    expect(isTerminalPhase(state.phase)).toBe(false);
  });

  it('an unaffordable estimate is blocked and presents no confirm path (Req 17.9)', () => {
    const state = runEvents([
      {
        type: 'estimate',
        estimatedCredits: 40,
        reservationCredits: 50,
        balanceCredits: 3,
        affordable: false,
        reason: 'Insufficient credits',
      },
    ]);
    expect(state.phase).toBe('awaiting_confirmation');
    expect(state.creditEstimate?.status).toBe('blocked');
    expect(state.creditEstimate?.affordability.reason).toBe('Insufficient credits');
  });

  it('ignores a malformed estimate carrying no cost figure (No-Mock)', () => {
    const state = runEvents([
      { type: 'status', stage: 'routing', progress: 60 },
      { type: 'estimate', outputSeconds: 5 } as unknown as ConverseEvent,
    ]);
    // No usable estimate → the turn keeps streaming, no confirmation seam shown.
    expect(state.creditEstimate).toBeNull();
    expect(state.phase).toBe('streaming');
  });

  it('confirming an estimate resumes streaming toward execution (Req 17.7)', () => {
    const state = runEvents([
      { type: 'estimate', estimatedCredits: 12, reservationCredits: 15, presentedAtMs: 1000 },
      { type: 'estimate_confirmed' },
    ]);
    expect(state.phase).toBe('streaming');
    expect(state.creditEstimate?.status).toBe('confirmed');
  });

  it('declining an estimate cancels the turn with no charge (Req 17.8)', () => {
    const state = runEvents([
      { type: 'estimate', estimatedCredits: 12, reservationCredits: 15, presentedAtMs: 1000 },
      { type: 'estimate_declined' },
    ]);
    expect(state.phase).toBe('stopped');
    expect(state.creditEstimate?.status).toBe('declined');
    expect(isTerminalPhase(state.phase)).toBe(true);
  });

  it('an expired estimate cancels the turn with no charge (Req 17.8)', () => {
    const state = runEvents([
      { type: 'estimate', estimatedCredits: 12, reservationCredits: 15, presentedAtMs: 1000 },
      { type: 'estimate_expired' },
    ]);
    expect(state.phase).toBe('stopped');
    expect(state.creditEstimate?.status).toBe('expired');
    expect(isTerminalPhase(state.phase)).toBe(true);
  });

  it('estimate decision events without a prior estimate are no-ops', () => {
    const state = runEvents([{ type: 'estimate_confirmed' }]);
    expect(state.creditEstimate).toBeNull();
    expect(state.phase).toBe('idle');
  });

  it('ignores unknown event types', () => {
    const before = runEvents([{ type: 'status', progress: 40 }]);
    const after = reduceConverseEvent(before, { type: 'mystery' } as unknown as ConverseEvent);
    expect(after).toEqual(before);
  });
});

describe('reduceConverseEvent properties', () => {
  // Feature: veefore-ai-video-editor — progress is stage-derived: it is always
  // null (indeterminate) or an integer percent in [0,100], never a fabricated or
  // out-of-range value (Req 23.2, 23.6).
  it('progress is always null or an integer in [0,100]', () => {
    const eventArb: fc.Arbitrary<ConverseEvent> = fc.oneof(
      fc.record({
        type: fc.constant<'status'>('status'),
        progress: fc.oneof(fc.integer({ min: -50, max: 150 }), fc.double(), fc.constant(undefined)),
      }),
      fc.record({
        type: fc.constant<'progress'>('progress'),
        progress: fc.oneof(fc.integer({ min: -50, max: 150 }), fc.constant(undefined)),
      }),
      fc.record({
        type: fc.constant<'complete'>('complete'),
        outcome: fc.constantFrom('planned', 'clarification', 'not_video_edit'),
        progress: fc.oneof(fc.integer({ min: -50, max: 150 }), fc.constant(undefined)),
      }),
    );

    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 30 }), (events) => {
        const state = runEvents(events);
        if (state.progress === null) return true;
        return (
          Number.isInteger(state.progress) && state.progress >= 0 && state.progress <= 100
        );
      }),
      { numRuns: 300 },
    );
  });

  // Feature: veefore-ai-video-editor — a clarification outcome never reports a
  // state change (nothing was mutated).
  it('a clarification never reports stateChanged=true', () => {
    fc.assert(
      fc.property(
        fc.option(fc.string(), { nil: undefined }),
        fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
        (reason, maxConfidence) => {
          const state = reduceConverseEvent(initialConverseTurnState(), {
            type: 'clarification',
            reason: reason ?? undefined,
            maxConfidence: maxConfidence ?? undefined,
            stateChanged: false,
          });
          return state.stateChanged === false && state.phase === 'clarification';
        },
      ),
      { numRuns: 200 },
    );
  });
});
