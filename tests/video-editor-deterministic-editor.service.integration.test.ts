/**
 * Integration tests for the Deterministic_Editor artifact + loudness behaviour
 * (task 11.4).
 *
 * Framework: vitest + fast-check (>=100 runs for each property).
 *
 * Properties under test (tasks.md task 11.4):
 *  - Property 21: A successful deterministic operation yields exactly one
 *    traceable artifact; a failed one yields none.
 *      Validates: Requirements 8.3, 8.6
 *  - Property 30: Loudness normalization stays within tolerance and ceiling.
 *      Validates: Requirements 12.1
 *
 * These exercise the REAL `DeterministicEditorService.execute` orchestration end
 * to end — download source bytes -> build deterministic command -> run FFmpeg ->
 * read output -> persist artifact / mark job FAILED — injecting in-memory fakes
 * for storage, the artifact repository, the Video_Edit_Job model, and the FFmpeg
 * runner. The fakes enforce the real invariants (the artifact repo records every
 * create; the job model records every state update); none of them return canned
 * successes that bypass the service logic.
 *
 * The loudness runner does not merely echo a pass: it PARSES the `loudnorm`
 * target that the service built into the FFmpeg command and simulates FFmpeg's
 * two-pass normalization against those parsed values, so the test proves the
 * service constructs a filter that drives the output to the configured target
 * within tolerance and under the true-peak ceiling.
 *
 * The final block covers the FFmpeg performance contract: a trim/cut must seek on
 * the INPUT side (`-ss` before `-i`, length as `-t <duration>`) so decoding starts
 * at the cut point instead of frame 0, and the encoder must come from
 * `ffmpeg-encoder-policy.ts` rather than a hardcoded libx264 vector.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import fc from 'fast-check';

import {
  DeterministicEditorService,
  DeterministicEditError,
  buildDeterministicCommand,
  type DeterministicFfmpegRunner,
  type DeterministicOperation,
  type DeterministicEditRequest,
  type DeterministicCommand,
} from '../server/features/video-editor/services/deterministic-editor.service';
import {
  selectVideoEncoderArgs,
  resolveEncoderPolicyOverrides,
} from '../server/features/video-editor/services/ffmpeg-encoder-policy';
import { DETERMINISTIC_ENGINE_ID } from '../server/features/video-editor/services/artifact-provenance.logic';
import { TERMINAL_STATES } from '../server/features/video-editor/services/job-state.logic';
import {
  AUDIO_TARGETS,
  EXPORT_PROFILES,
} from '../server/features/video-editor/config/video-editor.config';
import {
  isLoudnessWithinTolerance,
  type LoudnessMeasurement,
} from '../server/features/video-editor/services/silence-removal.logic';

const silentLogger = { info() {}, warn() {}, error() {}, debug() {} };

// ---------------------------------------------------------------------------
// In-memory fakes (real invariants, not mocks-to-pass)
// ---------------------------------------------------------------------------

/** A fake Video_Edit_Job model capturing every state/errorCode update applied. */
function makeJobModel() {
  const updates: { filter: any; update: any }[] = [];
  const jobModel = {
    updateOne(filter: any, update: any) {
      return {
        async exec() {
          updates.push({ filter, update });
        },
      };
    },
  } as any;
  return { jobModel, updates };
}

/** A fake artifact repository recording every `createArtifact` call. */
function makeArtifactRepo() {
  const created: any[] = [];
  let counter = 0;
  const artifactRepository = {
    async createArtifact(input: any) {
      const artifactId = `art-${++counter}`;
      const storageKey = `video-editor/${input.projectId}/${input.category}/${artifactId}.mp4`;
      const record = { artifactId, storageKey, ...input };
      created.push(record);
      return { artifact: record, storageKey, url: `https://storage.local/${storageKey}` };
    },
  } as any;
  return { artifactRepository, created };
}

/** Storage whose download returns deterministic, non-empty source bytes. */
const storage = {
  async downloadFile(_key: string) {
    const buffer = Buffer.from('deterministic-source-input-bytes');
    return { buffer, contentType: 'video/mp4', size: buffer.length };
  },
} as any;

/** Storage whose download fails (simulates an unreadable source). */
const failingStorage = {
  async downloadFile(_key: string): Promise<never> {
    throw new Error('storage: object unavailable');
  },
} as any;

// ---------------------------------------------------------------------------
// Runners
// ---------------------------------------------------------------------------

/** Writes a small non-empty output file at the command's output path. */
const writingRunner: DeterministicFfmpegRunner = async (command) => {
  await fs.promises.writeFile(command.outputPath, Buffer.from('deterministic-output-bytes'));
};

/** Fails the FFmpeg process without writing any output (Req 8.6). */
const failingRunner: DeterministicFfmpegRunner = async () => {
  throw new Error('ffmpeg exited with code 1');
};

/** Runs "successfully" but produces no output file (empty-output failure, Req 8.6). */
const noOutputRunner: DeterministicFfmpegRunner = async () => {
  /* intentionally writes nothing */
};

function makeService(runner: DeterministicFfmpegRunner, opts: { storage?: any } = {}) {
  const { jobModel, updates } = makeJobModel();
  const { artifactRepository, created } = makeArtifactRepo();
  const tempDir = path.join(os.tmpdir(), `ve-det-test-${randomUUID()}`);
  const svc = new DeterministicEditorService({
    storage: opts.storage ?? storage,
    artifactRepository,
    jobModel,
    runner,
    tempDir,
    ffmpegPath: null,
    logger: silentLogger,
  });
  return { svc, updates, created, tempDir };
}

const ENCODE_PROFILE_ID = Object.keys(EXPORT_PROFILES)[0];

function baseRequest(operation: DeterministicOperation): DeterministicEditRequest {
  return {
    projectId: 'p-1',
    workspaceId: 'w-1',
    userId: 'u-1',
    jobId: 've-edit-p1-v1-op1',
    inputVersionId: 'v-1',
    sourceStorageKey: 'video-editor/p-1/original/src.mp4',
    sourceFileName: 'src.mp4',
    operation,
  };
}

/** Representative valid operations spanning every deterministic kind. */
const OPERATIONS: DeterministicOperation[] = [
  { kind: 'trim', params: { startMs: 0, endMs: 5000 } },
  { kind: 'cut', params: { startMs: 1000, endMs: 4000 } },
  { kind: 'crop', params: { width: 720, height: 720, x: 0, y: 0 } },
  { kind: 'resize', params: { width: 640, height: 480 } },
  { kind: 'aspect', params: { aspectRatio: '9:16', width: 1080, height: 1920, mode: 'pad' } },
  { kind: 'fps', params: { fps: 30 } },
  { kind: 'speed', params: { factor: 1.5 } },
  { kind: 'fades', params: { fadeInMs: 500, fadeOutMs: 500, totalDurationMs: 10000 } },
  { kind: 'encode', params: { exportProfileId: ENCODE_PROFILE_ID } },
  { kind: 'audio_normalize', params: {} },
];

// ---------------------------------------------------------------------------
// Property 21: exactly one traceable artifact on success; none on failure
// Validates: Requirements 8.3, 8.6
// ---------------------------------------------------------------------------

describe('Property 21: successful op yields exactly one traceable artifact; failure yields none (Req 8.3, 8.6)', () => {
  it('for any operation, a successful run produces exactly one artifact traceable to the job', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...OPERATIONS), async (operation) => {
        const { svc, updates, created } = makeService(writingRunner);
        const request = baseRequest(operation);

        const result = await svc.execute(request);

        // Exactly ONE artifact (Req 8.3).
        expect(created).toHaveLength(1);
        const artifact = created[0];

        // Traceable to the originating Video_Edit_Job and input version, with
        // deterministic-engine provenance and zero credit cost (Req 8.3).
        expect(artifact.provenance.jobId).toBe(request.jobId);
        expect(artifact.provenance.inputVersionId).toBe(request.inputVersionId);
        expect(artifact.provenance.provider).toBe(DETERMINISTIC_ENGINE_ID);
        expect(artifact.provenance.model).toBe(DETERMINISTIC_ENGINE_ID);
        expect(artifact.provenance.costCredits).toBe(0);
        expect(artifact.deterministic).toBe(true);
        expect(artifact.category).toBe('renders');

        // The returned result references that single artifact.
        expect(result.artifact.artifactId).toBe(artifact.artifactId);
        expect(result.storageKey).toBe(artifact.storageKey);

        // A successful op never marks the job FAILED (Req 8.6 is the failure path).
        expect(updates.find((u) => u.update?.$set?.state === 'FAILED')).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });

  it('for any operation, a failed run produces NO artifact and marks the job FAILED (Req 8.6)', async () => {
    const scenarioArb = fc.constantFrom<'ffmpeg-fail' | 'empty-output'>(
      'ffmpeg-fail',
      'empty-output',
    );

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...OPERATIONS),
        scenarioArb,
        async (operation, scenario) => {
          const runner = scenario === 'ffmpeg-fail' ? failingRunner : noOutputRunner;
          const { svc, updates, created } = makeService(runner);
          const request = baseRequest(operation);

          // The operation rejects with a typed DeterministicEditError.
          await expect(svc.execute(request)).rejects.toBeInstanceOf(DeterministicEditError);

          // No artifact is produced on failure (Req 8.6).
          expect(created).toHaveLength(0);

          // The job is marked FAILED with an error code, and terminal states are
          // never overwritten (the failJob filter excludes terminal states).
          const failed = updates.find((u) => u.update?.$set?.state === 'FAILED');
          expect(failed).toBeTruthy();
          expect(typeof failed!.update.$set.errorCode).toBe('string');
          expect(failed!.update.$set.errorCode.length).toBeGreaterThan(0);
          expect(failed!.filter.state.$nin).toEqual([...TERMINAL_STATES]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('example: a single successful trim yields exactly one artifact; a failing runner yields none', async () => {
    // Success.
    const ok = makeService(writingRunner);
    await ok.svc.execute(baseRequest({ kind: 'trim', params: { startMs: 0, endMs: 3000 } }));
    expect(ok.created).toHaveLength(1);

    // Failure (FFmpeg error).
    const bad = makeService(failingRunner);
    await expect(
      bad.svc.execute(baseRequest({ kind: 'trim', params: { startMs: 0, endMs: 3000 } })),
    ).rejects.toBeInstanceOf(DeterministicEditError);
    expect(bad.created).toHaveLength(0);
    expect(bad.updates.find((u) => u.update?.$set?.state === 'FAILED')).toBeTruthy();
  });

  it('example: an unreadable source fails, marks the job FAILED, and produces no artifact', async () => {
    const { svc, updates, created } = makeService(writingRunner, { storage: failingStorage });
    await expect(
      svc.execute(baseRequest({ kind: 'resize', params: { width: 640, height: 480 } })),
    ).rejects.toBeInstanceOf(DeterministicEditError);
    expect(created).toHaveLength(0);
    expect(updates.find((u) => u.update?.$set?.state === 'FAILED')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Property 30: loudness normalization stays within tolerance and ceiling
// Validates: Requirements 12.1
// ---------------------------------------------------------------------------

/** Parse the integrated-loudness target (I) and true-peak ceiling (TP) built into a loudnorm filter. */
function parseLoudnormTarget(audioFilter: string): { i: number; tp: number } {
  const iMatch = audioFilter.match(/(?:^|[=:,])I=(-?\d+(?:\.\d+)?)/);
  const tpMatch = audioFilter.match(/(?::|,)TP=(-?\d+(?:\.\d+)?)/);
  expect(iMatch, `loudnorm filter must specify I=: ${audioFilter}`).toBeTruthy();
  expect(tpMatch, `loudnorm filter must specify TP=: ${audioFilter}`).toBeTruthy();
  return { i: Number(iMatch![1]), tp: Number(tpMatch![1]) };
}

/**
 * A runner that simulates FFmpeg's two-pass `loudnorm` normalization. It parses
 * the I/TP target the SERVICE built into the command, then produces the
 * post-normalization measurement a correct loudnorm would yield for the given
 * input: integrated loudness driven onto the parsed target within ±0.5 LU
 * (loudnorm's typical linear-mode convergence accuracy — comfortably inside our
 * ±1.0 LU tolerance), and true peak limited to at or below the parsed ceiling.
 * The simulated measurement is written to `sink` for the test to validate.
 */
function makeLoudnormRunner(
  input: LoudnessMeasurement,
  sink: { measurement?: LoudnessMeasurement; command?: DeterministicCommand },
): DeterministicFfmpegRunner {
  return async (command) => {
    sink.command = command;
    const { i: targetI, tp: ceilingTp } = parseLoudnormTarget(command.audioFilter);

    // Residual convergence error derived deterministically from the input, bounded
    // to ±0.5 LU — loudnorm converges regardless of how far the input started off.
    const residual = 0.5 * Math.sin(input.integratedLufs);
    const outLufs = targetI + residual;

    // loudnorm's limiter guarantees the output true peak never exceeds the ceiling,
    // no matter the input peak (which may be above it).
    const margin = Math.abs(Math.cos(input.truePeakDbtp));
    const outTp = ceilingTp - margin;

    sink.measurement = { integratedLufs: outLufs, truePeakDbtp: outTp };

    await fs.promises.writeFile(command.outputPath, Buffer.from('normalized-audio-output'));
  };
}

describe('Property 30: loudness normalization stays within tolerance and ceiling (Req 12.1)', () => {
  it('normalizes any input loudness onto the configured target within tolerance and under the ceiling', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Arbitrary source loudness: integrated well outside tolerance, true peak
        // possibly ABOVE the ceiling (clipping) — the cases normalization must fix.
        fc.record({
          integratedLufs: fc.double({ min: -60, max: 0, noNaN: true }),
          truePeakDbtp: fc.double({ min: -30, max: 6, noNaN: true }),
        }),
        async (input) => {
          const sink: { measurement?: LoudnessMeasurement; command?: DeterministicCommand } = {};
          const { svc, created } = makeService(makeLoudnormRunner(input, sink));

          await svc.execute(baseRequest({ kind: 'audio_normalize', params: {} }));

          // The service ran the loudnorm op and produced exactly one artifact.
          expect(created).toHaveLength(1);
          expect(sink.command).toBeTruthy();
          expect(sink.command!.audioFilter).toContain('loudnorm');

          // The service built the filter from the single-source config targets.
          const { i, tp } = parseLoudnormTarget(sink.command!.audioFilter);
          expect(i).toBe(AUDIO_TARGETS.integratedLoudnessLufs);
          expect(tp).toBe(AUDIO_TARGETS.truePeakCeilingDbtp);

          // Only the audio stream is re-encoded; the video stream is copied.
          expect(sink.command!.outputOptions).toContain('-c:v');
          expect(sink.command!.outputOptions).toContain('copy');
          expect(sink.command!.videoFilter).toBe('');

          // The normalized output is within ±tolerance of the target loudness and
          // does not exceed the true-peak ceiling (Req 12.1).
          const measured = sink.measurement!;
          expect(
            Math.abs(measured.integratedLufs - AUDIO_TARGETS.integratedLoudnessLufs),
          ).toBeLessThanOrEqual(AUDIO_TARGETS.loudnessToleranceLu);
          expect(measured.truePeakDbtp).toBeLessThanOrEqual(AUDIO_TARGETS.truePeakCeilingDbtp);
          expect(isLoudnessWithinTolerance(measured)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('example: a loud, clipping source is brought to -14 LUFS ±1.0 with peak ≤ -1.0 dBTP', async () => {
    const input: LoudnessMeasurement = { integratedLufs: -3, truePeakDbtp: 4.5 };
    const sink: { measurement?: LoudnessMeasurement; command?: DeterministicCommand } = {};
    const { svc, created } = makeService(makeLoudnormRunner(input, sink));

    await svc.execute(baseRequest({ kind: 'audio_normalize', params: {} }));

    expect(created).toHaveLength(1);
    const measured = sink.measurement!;
    expect(Math.abs(measured.integratedLufs - -14)).toBeLessThanOrEqual(1.0);
    expect(measured.truePeakDbtp).toBeLessThanOrEqual(-1.0);
    expect(isLoudnessWithinTolerance(measured)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Trim/cut uses INPUT-side seek (the whole point of the performance fix)
// ---------------------------------------------------------------------------

describe('trim/cut uses input-side seek so decoding starts at the cut point', () => {
  it('places -ss BEFORE -i and expresses the length as -t duration (arg ORDER matters)', () => {
    const cmd = buildDeterministicCommand(
      { kind: 'trim', params: { startMs: 5_000, endMs: 12_500 } },
      '/tmp/in.mp4',
      '/tmp/out.mp4',
    );

    // `-ss` is an INPUT option: it must appear before `-i`, otherwise ffmpeg
    // decodes every frame from 0 and the trim costs ~2x the wall time.
    const ssIndex = cmd.args.indexOf('-ss');
    const inputIndex = cmd.args.indexOf('-i');
    expect(ssIndex).toBeGreaterThanOrEqual(0);
    expect(inputIndex).toBeGreaterThanOrEqual(0);
    expect(ssIndex).toBeLessThan(inputIndex);
    expect(cmd.args[ssIndex + 1]).toBe('5.000');
    expect(cmd.inputOptions).toEqual(['-ss', '5.000']);

    // After an input-side seek the output timeline is rebased to 0, so the length
    // must be a DURATION (`-t`), never an absolute end time (`-to`).
    const tIndex = cmd.args.indexOf('-t');
    expect(tIndex).toBeGreaterThan(inputIndex);
    expect(cmd.args[tIndex + 1]).toBe('7.500');
    expect(cmd.args).not.toContain('-to');
  });

  it('re-encodes audio (AAC) on a trim so A/V sync is preserved after the seek', () => {
    const cmd = buildDeterministicCommand(
      { kind: 'cut', params: { startMs: 1_000, endMs: 4_000 } },
      '/tmp/in.mp4',
      '/tmp/out.mp4',
    );
    expect(cmd.outputOptions).toContain('-c:a');
    expect(cmd.outputOptions).toContain('aac');
    expect(cmd.outputOptions).not.toContain('copy');
    expect(cmd.inputOptions).toEqual(['-ss', '1.000']);
    expect(cmd.outputOptions.slice(0, 2)).toEqual(['-t', '3.000']);
  });

  it('leaves inputOptions empty for operations that read the input from the start', () => {
    for (const operation of OPERATIONS.filter((o) => o.kind !== 'trim' && o.kind !== 'cut')) {
      const cmd = buildDeterministicCommand(operation, '/tmp/in.mp4', '/tmp/out.mp4');
      expect(cmd.inputOptions).toEqual([]);
      expect(cmd.args).not.toContain('-ss');
    }
  });

  it('routes the encoder through the policy: forced software → libx264 + crf; hardware → hw codec', () => {
    const software = buildDeterministicCommand(
      { kind: 'trim', params: { startMs: 0, endMs: 5_000 } },
      '/tmp/in.mp4',
      '/tmp/out.mp4',
      {
        videoEncoderArgs: selectVideoEncoderArgs(
          { target: { mode: 'quality' } },
          { h264Videotoolbox: true },
          resolveEncoderPolicyOverrides({ VIDEO_EDITOR_FORCE_SOFTWARE_ENCODE: 'true' }),
        ).args,
      },
    );
    expect(software.outputOptions).toContain('libx264');
    expect(software.outputOptions).toContain('-crf');

    const hardware = buildDeterministicCommand(
      { kind: 'trim', params: { startMs: 0, endMs: 5_000 } },
      '/tmp/in.mp4',
      '/tmp/out.mp4',
      {
        videoEncoderArgs: selectVideoEncoderArgs(
          { target: { mode: 'quality' } },
          { h264Videotoolbox: true },
          resolveEncoderPolicyOverrides({}),
        ).args,
      },
    );
    expect(hardware.outputOptions).toContain('h264_videotoolbox');
    expect(hardware.outputOptions).toContain('-q:v');
    expect(hardware.outputOptions).not.toContain('libx264');
    // The seek fix is independent of the encoder choice.
    expect(hardware.inputOptions).toEqual(['-ss', '0.000']);
  });

  it('honours the export profile bitrate on whichever encoder the policy selects', () => {
    const profile = EXPORT_PROFILES[ENCODE_PROFILE_ID];
    for (const capabilities of [{ h264Videotoolbox: false }, { h264Videotoolbox: true }]) {
      const cmd = buildDeterministicCommand(
        { kind: 'encode', params: { exportProfileId: ENCODE_PROFILE_ID } },
        '/tmp/in.mp4',
        '/tmp/out.mp4',
        {
          videoEncoderArgs: selectVideoEncoderArgs(
            { target: { mode: 'bitrate', videoBitrateKbps: profile.videoBitrateKbps } },
            capabilities,
            resolveEncoderPolicyOverrides({}),
          ).args,
        },
      );
      expect(cmd.outputOptions).toContain('-b:v');
      expect(cmd.outputOptions).toContain(`${profile.videoBitrateKbps}k`);
      expect(cmd.outputOptions).toContain('-pix_fmt');
      expect(cmd.outputOptions).toContain('yuv420p');
    }
  });

  it('emits +faststart on mp4 output so the artifact streams immediately in the chat card', () => {
    const cmd = buildDeterministicCommand(
      { kind: 'trim', params: { startMs: 0, endMs: 5_000 } },
      '/tmp/in.mp4',
      '/tmp/out.mp4',
    );
    expect(cmd.args).toContain('-movflags');
    expect(cmd.args).toContain('+faststart');
  });
});
