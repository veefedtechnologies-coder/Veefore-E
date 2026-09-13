/**
 * Unit tests for the PURE multi-clip assembly command builder
 * (`buildAssembleCommand`).
 *
 * `buildAssembleCommand` turns N input paths + a target box/fps into a single
 * deterministic FFmpeg argument vector that stitches the clips into ONE video.
 * These tests exercise ONLY the pure builder (no IO, no ffmpeg): N inputs → N
 * `-i` flags, a `concat=n=N:v=1:a=1` node in the filtergraph, the encoder options
 * resolved from `ffmpeg-encoder-policy.ts`, and byte-for-byte determinism.
 *
 * The encoder assertions are POLICY assertions, not literal-string assertions: the
 * builder no longer hardcodes libx264, so the tests check that forced-software mode
 * yields libx264 + crf while a hardware-capable capability set yields the hardware
 * codec.
 */

import { describe, it, expect } from 'vitest';

import {
  buildAssembleCommand,
  DeterministicEditError,
} from '../server/features/video-editor/services/deterministic-editor.service';
import {
  selectVideoEncoderArgs,
  resolveEncoderPolicyOverrides,
  resolveVideoEncoderArgs,
} from '../server/features/video-editor/services/ffmpeg-encoder-policy';

/** Count how many times a value appears in an argument vector. */
function count<T>(arr: T[], value: T): number {
  return arr.reduce((n, v) => (v === value ? n + 1 : n), 0);
}

describe('buildAssembleCommand (pure multi-clip assembly builder)', () => {
  const OUT = '/tmp/out.mp4';
  const OPTS = { width: 720, height: 1280, fps: 30 };

  it('emits one -i per input for N inputs', () => {
    const two = buildAssembleCommand(['/tmp/a.mp4', '/tmp/b.mp4'], OUT, OPTS);
    expect(count(two.args, '-i')).toBe(2);

    const three = buildAssembleCommand(['/tmp/a.mp4', '/tmp/b.mp4', '/tmp/c.mov'], OUT, OPTS);
    expect(count(three.args, '-i')).toBe(3);

    // Each input path is present in the args in order.
    expect(three.args).toContain('/tmp/a.mp4');
    expect(three.args).toContain('/tmp/b.mp4');
    expect(three.args).toContain('/tmp/c.mov');
    expect(three.inputPaths).toEqual(['/tmp/a.mp4', '/tmp/b.mp4', '/tmp/c.mov']);
  });

  it('includes a concat=n=N:v=1:a=1 node in the filtergraph matching input count', () => {
    const two = buildAssembleCommand(['/tmp/a.mp4', '/tmp/b.mp4'], OUT, OPTS);
    expect(two.filterComplex).toContain('concat=n=2:v=1:a=1');

    const three = buildAssembleCommand(['/tmp/a.mp4', '/tmp/b.mp4', '/tmp/c.mp4'], OUT, OPTS);
    expect(three.filterComplex).toContain('concat=n=3:v=1:a=1');

    // The graph must also appear inside -filter_complex in the args.
    const idx = three.args.indexOf('-filter_complex');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(three.args[idx + 1]).toContain('concat=n=3:v=1:a=1');
  });

  it('normalises each input: letterbox pad to target dims, setsar, fps, yuv420p, 48k stereo audio', () => {
    const cmd = buildAssembleCommand(['/tmp/a.mp4', '/tmp/b.mp4'], OUT, OPTS);
    // Per-input video normalisation to the EXACT target box.
    expect(cmd.filterComplex).toContain('scale=720:1280:force_original_aspect_ratio=decrease');
    expect(cmd.filterComplex).toContain('pad=720:1280:(ow-iw)/2:(oh-ih)/2');
    expect(cmd.filterComplex).toContain('setsar=1');
    expect(cmd.filterComplex).toContain('fps=30');
    expect(cmd.filterComplex).toContain('format=yuv420p');
    // Per-input audio normalisation to 48k stereo.
    expect(cmd.filterComplex).toContain('aresample=48000');
    expect(cmd.filterComplex).toContain('channel_layouts=stereo');
    // Output pads mapped.
    expect(cmd.args).toContain('-map');
    expect(cmd.args).toContain('[outv]');
    expect(cmd.args).toContain('[outa]');
  });

  it('routes encoder options through the encoder policy: forced software → libx264 + crf', () => {
    // Forced-software mode is the BYTE-REPRODUCIBLE contract, so it must always
    // yield libx264 + crf even on a box where VideoToolbox is available.
    const forcedSoftware = selectVideoEncoderArgs(
      { target: { mode: 'quality' } },
      { h264Videotoolbox: true },
      resolveEncoderPolicyOverrides({ VIDEO_EDITOR_FORCE_SOFTWARE_ENCODE: 'true' }),
    );
    const cmd = buildAssembleCommand(['/tmp/a.mp4', '/tmp/b.mp4'], OUT, {
      ...OPTS,
      videoEncoderArgs: forcedSoftware.args,
    });

    expect(forcedSoftware.encoder).toBe('libx264');
    expect(cmd.args).toContain('libx264');
    expect(cmd.args).toContain('-crf');
    expect(cmd.args).toContain('18');
    expect(cmd.args).toContain('-pix_fmt');
    expect(cmd.args).toContain('yuv420p');
    expect(cmd.args).toContain('aac');
    // The output path is always the final arg.
    expect(cmd.args[cmd.args.length - 1]).toBe(OUT);
  });

  it('routes encoder options through the encoder policy: hardware available → hardware codec', () => {
    const hardware = selectVideoEncoderArgs(
      { target: { mode: 'quality' } },
      { h264Videotoolbox: true },
      resolveEncoderPolicyOverrides({}),
    );
    const cmd = buildAssembleCommand(['/tmp/a.mp4', '/tmp/b.mp4'], OUT, {
      ...OPTS,
      videoEncoderArgs: hardware.args,
    });

    expect(hardware.encoder).toBe('h264_videotoolbox');
    expect(cmd.args).toContain('h264_videotoolbox');
    expect(cmd.args).not.toContain('libx264');
    expect(cmd.args).toContain('-q:v');
    expect(cmd.args).toContain('-pix_fmt');
    expect(cmd.args).toContain('yuv420p');
    expect(cmd.args).toContain('aac');
    expect(cmd.args[cmd.args.length - 1]).toBe(OUT);
  });

  it('uses the process-wide policy decision when no encoder args are injected', () => {
    const cmd = buildAssembleCommand(['/tmp/a.mp4', '/tmp/b.mp4'], OUT, OPTS);
    // Whatever this machine supports, the assembled command must carry the policy
    // vector verbatim (contiguously) plus faststart for the mp4 output.
    const expected = resolveVideoEncoderArgs({ target: { mode: 'quality' } });
    expect(cmd.args.join(' ')).toContain(expected.join(' '));
    expect(cmd.args).toContain('-movflags');
    expect(cmd.args).toContain('+faststart');
  });

  it('is deterministic — identical inputs yield an identical argument vector', () => {
    const a = buildAssembleCommand(['/tmp/a.mp4', '/tmp/b.mp4', '/tmp/c.mp4'], OUT, OPTS);
    const b = buildAssembleCommand(['/tmp/a.mp4', '/tmp/b.mp4', '/tmp/c.mp4'], OUT, OPTS);
    expect(a.args).toEqual(b.args);
    expect(a.filterComplex).toBe(b.filterComplex);
    expect(a.description).toBe(b.description);
  });

  it('rejects fewer than 2 inputs (No-Mock: never invent clips)', () => {
    expect(() => buildAssembleCommand(['/tmp/a.mp4'], OUT, OPTS)).toThrow(DeterministicEditError);
    expect(() => buildAssembleCommand([], OUT, OPTS)).toThrow(/at least 2/i);
  });

  it('rejects invalid target dimensions / fps', () => {
    expect(() =>
      buildAssembleCommand(['/tmp/a.mp4', '/tmp/b.mp4'], OUT, { width: 0, height: 1280, fps: 30 }),
    ).toThrow(DeterministicEditError);
    expect(() =>
      buildAssembleCommand(['/tmp/a.mp4', '/tmp/b.mp4'], OUT, { width: 720, height: -1, fps: 30 }),
    ).toThrow(DeterministicEditError);
    expect(() =>
      buildAssembleCommand(['/tmp/a.mp4', '/tmp/b.mp4'], OUT, { width: 720, height: 1280, fps: 0 }),
    ).toThrow(DeterministicEditError);
  });
});
