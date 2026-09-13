/**
 * Unit + property tests for the Quality_Controller service + bounded repair loop
 * (task 14.5).
 *
 * Framework: vitest + fast-check.
 *
 * Covers (design.md "Quality_Controller", Req 14.4, 14.5, 14.6, 14.7):
 *  - The initial attempt passing QC returns `passed` with zero repair attempts.
 *  - A quality failure that a later repair attempt fixes returns `passed`.
 *  - A persistent quality failure exhausts the bounded repair attempts (≤ the
 *    configured max, default 3) and then reverts to the prior valid version,
 *    returning a `QUALITY_CONTROL_FAILED` error and NEVER marking the corrupted
 *    output as successful (Req 14.6, 14.7).
 *  - The reverter is invoked exactly once, targeting the failed version.
 *  - An `unavailable` strategy advances to the next strategy without passing.
 *  - An aborted signal cancels the loop (never a success).
 *  - Soundness: `passed` is returned only when the final inspection is `ok`, and
 *    the repair-attempt count never exceeds the configured maximum.
 *  - The pure FFmpeg-stderr parsers used by the default analyzer.
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

import {
  QualityControllerService,
  parseLongestBlackRunMs,
  parseLongestFrozenRunMs,
  parseAudioSilence,
  parseFfmpegDurationMs,
  type RepairAttemptExecutor,
  type RepairAttemptOutcome,
  type PriorVersionReverter,
  type RunRepairLoopRequest,
} from '../server/features/video-editor/services/quality-controller.service';
import type {
  OutputProbe,
  QualityMetrics,
  RequestedOutputSpec,
} from '../server/features/video-editor/services/quality-controller.logic';
import { QUALITY_CONTROL_THRESHOLDS } from '../server/features/video-editor/config/video-editor.config';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

const requestedSpec: RequestedOutputSpec = {
  container: 'mp4',
  videoCodec: 'h264',
  audioCodec: null,
  width: 1080,
  height: 1920,
  fps: 30,
  expectedAudioStreamCount: 0,
  requestedDurationMs: 15_000,
};

/** A probe that matches the requested spec (a clean render). */
function goodProbe(overrides: Partial<OutputProbe> = {}): OutputProbe {
  return {
    exists: true,
    sizeBytes: 200_000,
    hasVideoStream: true,
    container: 'mp4',
    videoCodec: 'h264',
    audioCodec: null,
    audioStreamCount: 0,
    width: 1080,
    height: 1920,
    fps: 30,
    durationMs: 15_000,
    ...overrides,
  };
}

/** Metrics with no quality failure. */
function goodMetrics(overrides: Partial<QualityMetrics> = {}): QualityMetrics {
  return {
    longestBlackRunMs: 0,
    longestFrozenRunMs: 0,
    audioExpected: false,
    audioPresent: true,
    audioSilentFraction: 0,
    maxArtifactAreaFraction: 0,
    measuredDurationMs: 15_000,
    ...overrides,
  };
}

/** Metrics with a black-frame quality failure. */
function blackFailureMetrics(): QualityMetrics {
  return goodMetrics({ longestBlackRunMs: QUALITY_CONTROL_THRESHOLDS.blackFrameMinMs + 100 });
}

const producedGood: RepairAttemptOutcome = {
  kind: 'produced',
  probe: goodProbe(),
  metrics: goodMetrics(),
};
const producedBad: RepairAttemptOutcome = {
  kind: 'produced',
  probe: goodProbe(),
  metrics: blackFailureMetrics(),
};

function makeService(reverter: PriorVersionReverter) {
  return new QualityControllerService({ logger: silentLogger, reverter });
}

function baseRequest(execute: RepairAttemptExecutor): RunRepairLoopRequest {
  return {
    jobId: 've-qc-p1-v2-op1',
    projectId: 'p-1',
    workspaceId: 'w-1',
    userId: 'u-1',
    versionId: 'v-2',
    requestedSpec,
    execute,
  };
}

// ---------------------------------------------------------------------------
// Repair loop
// ---------------------------------------------------------------------------

describe('QualityControllerService.runRepairLoop', () => {
  it('returns passed with zero repair attempts when the initial output passes QC', async () => {
    const reverter = vi.fn<PriorVersionReverter>(async () => ({ ok: true }));
    const svc = makeService(reverter);
    const execute = vi.fn<RepairAttemptExecutor>(async () => producedGood);

    const result = await svc.runRepairLoop(baseRequest(execute));

    expect(result.status).toBe('passed');
    if (result.status !== 'passed') return;
    expect(result.repairAttemptsUsed).toBe(0);
    expect(result.inspection.ok).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(reverter).not.toHaveBeenCalled();
  });

  it('repairs a failing output and returns passed when a later attempt succeeds', async () => {
    const reverter = vi.fn<PriorVersionReverter>(async () => ({ ok: true }));
    const svc = makeService(reverter);
    // Initial fails, first repair passes.
    const outcomes = [producedBad, producedGood];
    let i = 0;
    const execute = vi.fn<RepairAttemptExecutor>(async () => outcomes[i++]);

    const result = await svc.runRepairLoop(baseRequest(execute));

    expect(result.status).toBe('passed');
    if (result.status !== 'passed') return;
    expect(result.repairAttemptsUsed).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
    // The first repair used the highest-priority strategy ('retry').
    expect(execute.mock.calls[1][0].strategy).toBe('retry');
    expect(reverter).not.toHaveBeenCalled();
  });

  it('exhausts bounded repairs then reverts, never marking the corrupted output successful', async () => {
    const reverter = vi.fn<PriorVersionReverter>(async () => ({
      ok: true,
      revertedToVersionId: 'v-1',
    }));
    const svc = makeService(reverter);
    const execute = vi.fn<RepairAttemptExecutor>(async () => producedBad);

    const result = await svc.runRepairLoop(baseRequest(execute));

    expect(result.status).toBe('reverted');
    if (result.status !== 'reverted') return;
    expect(result.errorCode).toBe('QUALITY_CONTROL_FAILED');
    // initial + maxRepairAttempts executions.
    expect(execute).toHaveBeenCalledTimes(QUALITY_CONTROL_THRESHOLDS.maxRepairAttempts + 1);
    expect(result.repairAttemptsUsed).toBe(QUALITY_CONTROL_THRESHOLDS.maxRepairAttempts);
    // Reverted exactly once, targeting the failed version.
    expect(reverter).toHaveBeenCalledTimes(1);
    expect(reverter.mock.calls[0][0].failedVersionId).toBe('v-2');
    expect(result.revert.revertedToVersionId).toBe('v-1');
  });

  it('treats an existence failure (missing output) as a quality failure and reverts', async () => {
    const reverter = vi.fn<PriorVersionReverter>(async () => ({ ok: false, error: 'no prior version' }));
    const svc = makeService(reverter);
    const missing: RepairAttemptOutcome = {
      kind: 'produced',
      probe: goodProbe({ exists: false, sizeBytes: 0 }),
      metrics: goodMetrics(),
    };
    const execute = vi.fn<RepairAttemptExecutor>(async () => missing);

    const result = await svc.runRepairLoop(baseRequest(execute));

    expect(result.status).toBe('reverted');
    if (result.status !== 'reverted') return;
    expect(result.errorCode).toBe('QUALITY_CONTROL_FAILED');
  });

  it('advances past an unavailable strategy without ever passing on it', async () => {
    const reverter = vi.fn<PriorVersionReverter>(async () => ({ ok: true }));
    const svc = makeService(reverter);
    // Initial fails; first repair is unavailable; second repair passes.
    const outcomes: RepairAttemptOutcome[] = [
      producedBad,
      { kind: 'unavailable', reason: 'no alternative provider' },
      producedGood,
    ];
    let i = 0;
    const execute = vi.fn<RepairAttemptExecutor>(async () => outcomes[i++]);

    const result = await svc.runRepairLoop(baseRequest(execute));

    expect(result.status).toBe('passed');
    if (result.status !== 'passed') return;
    expect(result.repairAttemptsUsed).toBe(2);
    expect(execute).toHaveBeenCalledTimes(3);
    // The unavailable attempt was recorded.
    expect(result.attempts.some((a) => a.unavailableReason === 'no alternative provider')).toBe(true);
  });

  it('stops for user clarification without marking success', async () => {
    const reverter = vi.fn<PriorVersionReverter>(async () => ({ ok: true }));
    const svc = makeService(reverter);
    const outcomes: RepairAttemptOutcome[] = [
      producedBad,
      { kind: 'needs_user_clarification', message: 'Which subject should be preserved?' },
    ];
    let i = 0;
    const execute = vi.fn<RepairAttemptExecutor>(async () => outcomes[i++]);

    const result = await svc.runRepairLoop(baseRequest(execute));

    expect(result.status).toBe('user_clarification_required');
    expect(reverter).not.toHaveBeenCalled();
  });

  it('cancels when the abort signal is already aborted, never a success', async () => {
    const reverter = vi.fn<PriorVersionReverter>(async () => ({ ok: true }));
    const svc = makeService(reverter);
    const execute = vi.fn<RepairAttemptExecutor>(async () => producedGood);
    const controller = new AbortController();
    controller.abort();

    const result = await svc.runRepairLoop({ ...baseRequest(execute), signal: controller.signal });

    expect(result.status).toBe('cancelled');
    expect(execute).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Soundness (Req 14.7): passed ⇒ final inspection ok; repairs are bounded
// ---------------------------------------------------------------------------

describe('QualityControllerService.runRepairLoop — soundness', () => {
  it('property: passes only on an ok inspection and never exceeds the max repair attempts', async () => {
    const maxAttempts = QUALITY_CONTROL_THRESHOLDS.maxRepairAttempts;
    // A stream of pass/fail decisions the executor replays per attempt.
    const decisionArb = fc.array(fc.boolean(), { minLength: 1, maxLength: maxAttempts + 2 });

    await fc.assert(
      fc.asyncProperty(decisionArb, async (decisions) => {
        const reverter: PriorVersionReverter = async () => ({ ok: true, revertedToVersionId: 'v-1' });
        const svc = new QualityControllerService({ logger: silentLogger, reverter });
        let i = 0;
        const execute: RepairAttemptExecutor = async () => {
          const pass = decisions[Math.min(i, decisions.length - 1)];
          i += 1;
          return pass ? producedGood : producedBad;
        };

        const result = await svc.runRepairLoop(baseRequest(execute));

        // Bounded: repairs never exceed the configured maximum.
        expect(result.repairAttemptsUsed).toBeLessThanOrEqual(maxAttempts);

        if (result.status === 'passed') {
          // Success implies the final inspection was ok (no corrupted output passed).
          expect(result.inspection.ok).toBe(true);
        } else if (result.status === 'reverted') {
          // A revert never exposes a successful output.
          expect(result.errorCode).toBe('QUALITY_CONTROL_FAILED');
        }
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Pure FFmpeg-stderr parsers
// ---------------------------------------------------------------------------

describe('Quality_Controller default-analyzer parsers', () => {
  it('parseLongestBlackRunMs returns the longest blackdetect interval in ms', () => {
    const stderr = [
      '[blackdetect @ 0x1] black_start:0.0 black_end:0.6 black_duration:0.6',
      '[blackdetect @ 0x1] black_start:5.0 black_end:6.5 black_duration:1.5',
    ].join('\n');
    expect(parseLongestBlackRunMs(stderr)).toBe(1500);
    expect(parseLongestBlackRunMs('no black here')).toBe(0);
  });

  it('parseLongestFrozenRunMs reads freeze_duration and falls back to start/end pairs', () => {
    expect(
      parseLongestFrozenRunMs('[freezedetect] lavfi.freezedetect.freeze_duration: 2.5'),
    ).toBe(2500);
    const paired = [
      'lavfi.freezedetect.freeze_start: 1.0',
      'lavfi.freezedetect.freeze_end: 4.0',
    ].join('\n');
    expect(parseLongestFrozenRunMs(paired)).toBe(3000);
    expect(parseLongestFrozenRunMs('nothing')).toBe(0);
  });

  it('parseFfmpegDurationMs parses the Duration line', () => {
    expect(parseFfmpegDurationMs('  Duration: 00:00:15.00, start: 0.0')).toBe(15_000);
    expect(parseFfmpegDurationMs('  Duration: 00:01:02.50, start: 0.0')).toBe(62_500);
    expect(parseFfmpegDurationMs('no duration')).toBe(0);
  });

  it('parseAudioSilence reports no audio when no audio stream is present', () => {
    const stderr = 'Duration: 00:00:10.00\n  Stream #0:0: Video: h264';
    const r = parseAudioSilence(stderr);
    expect(r.audioPresent).toBe(false);
    expect(r.audioSilentFraction).toBe(1);
    expect(r.measuredDurationMs).toBe(10_000);
  });

  it('parseAudioSilence computes the silent fraction against total duration', () => {
    const stderr = [
      'Duration: 00:00:10.00',
      '  Stream #0:1: Audio: aac, 48000 Hz',
      '[silencedetect @ 0x1] silence_start: 0',
      '[silencedetect @ 0x1] silence_end: 5 | silence_duration: 5',
    ].join('\n');
    const r = parseAudioSilence(stderr);
    expect(r.audioPresent).toBe(true);
    expect(r.audioSilentFraction).toBeCloseTo(0.5, 5);
  });

  it('parseAudioSilence caps the silent fraction at 1', () => {
    const stderr = [
      'Duration: 00:00:04.00',
      '  Stream #0:1: Audio: aac',
      '[silencedetect] silence_duration: 3',
      '[silencedetect] silence_duration: 3',
    ].join('\n');
    const r = parseAudioSilence(stderr);
    expect(r.audioSilentFraction).toBe(1);
  });
});
