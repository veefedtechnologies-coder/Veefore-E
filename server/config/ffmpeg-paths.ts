/**
 * Central FFmpeg / FFprobe binary path configuration (side-effect module).
 *
 * `fluent-ffmpeg` resolves the `ffmpeg` and `ffprobe` binaries from the system
 * PATH by default. In our deployments there is NO system ffmpeg/ffprobe — we ship
 * them as npm packages:
 *   - `ffmpeg-static`  → the ffmpeg binary
 *   - `ffprobe-static` → the ffprobe binary (ffmpeg-static does NOT include it)
 *
 * Without ffprobe, every `ffmpeg.ffprobe(...)` call (source metadata extraction,
 * render validation, etc.) throws — which is exactly why a Video Editor source
 * ingest failed with "Metadata extraction failed: … could not be probed by
 * FFprobe". `fluent-ffmpeg` stores the binary paths on its shared singleton, so
 * importing this module ONCE (for its side effect) before any ffmpeg/ffprobe call
 * configures the whole process.
 *
 * IMPORTANT: this package is ESM (`"type": "module"`), so `require()` is NOT
 * available at runtime — the binaries MUST be pulled in via static `import`
 * (a `require` here throws `ReferenceError` and silently leaves ffprobe unset).
 *
 * Import it (side-effect only) at the top of every module that uses
 * `fluent-ffmpeg`. It is idempotent and safe to import many times.
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';
// ffprobe-static ships no bundled type declarations; the default export is
// `{ path: string; version: string }`.
// @ts-ignore -- no types for ffprobe-static
import ffprobeStatic from 'ffprobe-static';

let configured = false;

/**
 * Point fluent-ffmpeg at the bundled static binaries. Defensive: a missing path
 * never throws (that would crash the whole server on load) — it just leaves
 * fluent-ffmpeg to fall back to PATH.
 */
export function configureFfmpegBinaries(): void {
  if (configured) return;
  configured = true;

  try {
    if (typeof ffmpegStatic === 'string' && ffmpegStatic.length > 0) {
      ffmpeg.setFfmpegPath(ffmpegStatic);
    }
  } catch {
    /* fall back to PATH */
  }

  try {
    const probePath = (ffprobeStatic as { path?: string } | undefined)?.path;
    if (probePath && probePath.length > 0) {
      ffmpeg.setFfprobePath(probePath);
    }
  } catch {
    /* fall back to PATH */
  }
}

// Configure on first import.
configureFfmpegBinaries();
