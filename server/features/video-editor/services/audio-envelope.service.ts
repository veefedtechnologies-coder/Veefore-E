/**
 * Audio_Envelope_Service — audio energy-envelope extraction (IO) for the
 * chat-driven `auto_cut` (energy/beat-synced montage) operation, Increment 2.
 *
 * The pure `auto-cut.logic.ts` computes beat-synced keep-segments from an
 * {@link EnergySample} envelope, but that envelope has to come from the real
 * audio. This tiny service is the ONLY producer of it for the auto-cut flow: it
 * decodes the source's audio track to raw mono PCM with the BUNDLED `ffmpeg`
 * (`ffmpeg-static`) and computes a deterministic windowed-RMS envelope in JS via
 * the pure {@link computeRmsEnvelope}. The PCM+JS-RMS route is chosen over parsing
 * `astats` stderr because it is fully deterministic and has no fragile text
 * parsing.
 *
 * It is honest by construction (No-Mock, Req 23):
 *   - If the source has NO audio stream (probed with the bundled `ffprobe`), it
 *     returns `null` — the driver surfaces an honest "this clip has no audio to
 *     sync cuts to" clarification and never fabricates cut points.
 *   - If audio extraction yields no samples, it also returns `null`.
 *
 * ESM static imports only (Req 1: no `require()` anywhere). The side-effect
 * `ffmpeg-paths` module points `fluent-ffmpeg` at the bundled ffmpeg/ffprobe.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomUUID } from 'crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegStatic from 'ffmpeg-static';

// Side-effect: point fluent-ffmpeg at the bundled ffmpeg/ffprobe binaries.
import '../../../config/ffmpeg-paths';
import { logger as defaultLogger } from '../../../config/logger';
import { getStorageService, type IStorageService } from '../../storage/services/storage.service';
import { computeRmsEnvelope, type EnergySample } from './auto-cut.logic';

/** PCM sample rate used for the envelope (deterministic engine constant). */
export const ENVELOPE_SAMPLE_RATE_HZ = 8000;
/** Envelope RMS window length in ms (deterministic engine constant). */
export const ENVELOPE_WINDOW_MS = 50;

/** Extracts a mono `s16le` PCM track from a video file. Injectable for tests. */
export type PcmExtractor = (inputPath: string, outputPath: string) => Promise<void>;

/** Probes whether a media file has at least one audio stream. Injectable. */
export type AudioStreamProbe = (inputPath: string) => Promise<boolean>;

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface AudioEnvelopeServiceDeps {
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** Storage backend used to resolve a `storageKey` to source bytes. */
  storage?: IStorageService;
  /** Base directory for temporary working files (defaults to the OS temp dir). */
  tempDir?: string;
  /** Path to the FFmpeg binary (defaults to `ffmpeg-static`). */
  ffmpegPath?: string | null;
  /** Raw-PCM extractor; defaults to a `fluent-ffmpeg` + `ffmpeg-static` extractor. */
  pcmExtractor?: PcmExtractor;
  /** Audio-stream probe; defaults to `ffprobe` via `fluent-ffmpeg`. */
  probeHasAudio?: AudioStreamProbe;
}

/** Input to {@link AudioEnvelopeService.extractEnvelope}. */
export interface ExtractEnvelopeInput {
  /** Source video bytes (used directly when provided). */
  buffer?: Buffer;
  /** Storage key to download the source bytes from (used when no buffer). */
  storageKey?: string;
  /** Source id, for logging only. */
  sourceId?: string;
  /** Original filename, used to derive the temp input extension (default mp4). */
  fileName?: string;
  /** RMS window length in ms (defaults to {@link ENVELOPE_WINDOW_MS}). */
  windowMs?: number;
}

/**
 * Extracts audio energy envelopes so the pure auto-cut logic can be fed real
 * signal. Returns `null` (honest, No-Mock) when there is no usable audio.
 */
export class AudioEnvelopeService {
  private readonly log: AudioEnvelopeServiceDeps['logger'];
  private readonly storage: IStorageService;
  private readonly tempDir: string;
  private readonly ffmpegPath: string | null;
  private readonly pcmExtractor: PcmExtractor;
  private readonly probeHasAudio: AudioStreamProbe;

  constructor(deps: AudioEnvelopeServiceDeps = {}) {
    this.log = deps.logger ?? defaultLogger;
    this.storage = deps.storage ?? getStorageService();
    this.tempDir = deps.tempDir ?? path.join(os.tmpdir(), 'veefore-video-editor-envelope');
    this.ffmpegPath = deps.ffmpegPath ?? (ffmpegStatic as unknown as string | null) ?? null;
    this.pcmExtractor = deps.pcmExtractor ?? this.createDefaultPcmExtractor();
    this.probeHasAudio = deps.probeHasAudio ?? this.createDefaultProbe();
  }

  /**
   * Extract a deterministic windowed-RMS energy envelope from the source audio.
   *
   * Returns `null` when the source has no audio stream, no source is resolvable,
   * extraction fails, or the extracted audio yields no samples — the caller must
   * treat `null` as "no audio to sync cuts to" and never fabricate segments.
   */
  async extractEnvelope(input: ExtractEnvelopeInput): Promise<EnergySample[] | null> {
    const buffer = await this.resolveSourceBuffer(input);
    if (!buffer) return null;

    const workId = randomUUID();
    const workDir = path.join(this.tempDir, workId);
    const inExt = deriveExtension(input.fileName);
    const inputPath = path.join(workDir, `input${inExt}`);
    const pcmPath = path.join(workDir, 'audio.pcm');

    try {
      await fs.promises.mkdir(workDir, { recursive: true });
      await fs.promises.writeFile(inputPath, buffer);

      // No-Mock (Req 23): a clip with no audio track has no beats to sync to.
      let hasAudio = false;
      try {
        hasAudio = await this.probeHasAudio(inputPath);
      } catch (err) {
        this.log?.warn?.('Audio-stream probe failed; treating source as no-audio', {
          component: 'AudioEnvelopeService',
          sourceId: input.sourceId,
          error: (err as Error)?.message,
        });
        return null;
      }
      if (!hasAudio) {
        this.log?.info?.('No audio stream to build an energy envelope from', {
          component: 'AudioEnvelopeService',
          sourceId: input.sourceId,
        });
        return null;
      }

      try {
        await this.pcmExtractor(inputPath, pcmPath);
      } catch (err) {
        this.log?.warn?.('PCM extraction failed for energy envelope', {
          component: 'AudioEnvelopeService',
          sourceId: input.sourceId,
          error: (err as Error)?.message,
        });
        return null;
      }

      const pcmStat = await fs.promises.stat(pcmPath).catch(() => null);
      if (!pcmStat || !pcmStat.isFile() || pcmStat.size < 2) return null;

      const pcm = await fs.promises.readFile(pcmPath);
      // Interpret the raw bytes as little-endian signed 16-bit mono samples.
      const usableBytes = pcm.length - (pcm.length % 2);
      const samples = new Int16Array(pcm.buffer, pcm.byteOffset, usableBytes / 2);
      if (samples.length === 0) return null;

      const windowMs =
        typeof input.windowMs === 'number' && Number.isFinite(input.windowMs) && input.windowMs > 0
          ? input.windowMs
          : ENVELOPE_WINDOW_MS;

      const envelope = computeRmsEnvelope(samples, ENVELOPE_SAMPLE_RATE_HZ, windowMs);
      if (envelope.length === 0) return null;

      this.log?.info?.('Extracted audio energy envelope', {
        component: 'AudioEnvelopeService',
        sourceId: input.sourceId,
        samples: envelope.length,
        windowMs,
      });
      return envelope;
    } finally {
      await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {
        this.log?.warn?.('Failed to clean up audio-envelope temp dir', {
          component: 'AudioEnvelopeService',
          workDir,
        });
      });
    }
  }

  /** Resolve the source bytes from an explicit buffer or a storage key. */
  private async resolveSourceBuffer(input: ExtractEnvelopeInput): Promise<Buffer | null> {
    if (input.buffer && input.buffer.length > 0) return input.buffer;
    if (input.storageKey) {
      try {
        const dl = await this.storage.downloadFile(input.storageKey);
        if (dl?.buffer && dl.buffer.length > 0) return dl.buffer;
      } catch (err) {
        this.log?.warn?.('Could not read source for energy-envelope extraction', {
          component: 'AudioEnvelopeService',
          storageKey: input.storageKey,
          error: (err as Error)?.message,
        });
        return null;
      }
    }
    return null;
  }

  /** Default extractor: mono `s16le` PCM via fluent-ffmpeg + ffmpeg-static. */
  private createDefaultPcmExtractor(): PcmExtractor {
    const ffmpegPath = this.ffmpegPath;
    const log = this.log;
    return (inputPath: string, outputPath: string) =>
      new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg(inputPath);
        if (ffmpegPath) cmd.setFfmpegPath(ffmpegPath);
        cmd
          .noVideo()
          .audioChannels(1)
          .audioFrequency(ENVELOPE_SAMPLE_RATE_HZ)
          .audioCodec('pcm_s16le')
          .format('s16le')
          .on('error', (err: Error) => {
            log?.error?.('Audio-envelope PCM extraction FFmpeg failed', err, {
              component: 'AudioEnvelopeService',
            });
            reject(err);
          })
          .on('end', () => resolve())
          .save(outputPath);
      });
  }

  /** Default probe: `ffprobe` via fluent-ffmpeg, checks for an audio stream. */
  private createDefaultProbe(): AudioStreamProbe {
    const ffmpegPath = this.ffmpegPath;
    return (inputPath: string) =>
      new Promise<boolean>((resolve) => {
        try {
          const cmd = ffmpeg(inputPath);
          if (ffmpegPath) cmd.setFfmpegPath(ffmpegPath);
          cmd.ffprobe((err: Error | null, data: { streams?: Array<{ codec_type?: string }> }) => {
            if (err || !data || !Array.isArray(data.streams)) {
              resolve(false);
              return;
            }
            resolve(data.streams.some((s) => s?.codec_type === 'audio'));
          });
        } catch {
          resolve(false);
        }
      });
  }
}

/** Derive a safe temp input extension from a filename (defaults to `.mp4`). */
function deriveExtension(fileName: string | undefined): string {
  if (typeof fileName === 'string') {
    const ext = path.extname(fileName);
    if (ext && /^\.[a-z0-9]+$/i.test(ext)) return ext;
  }
  return '.mp4';
}

/** Shared singleton for production use (mirrors other feature-service exports). */
export const audioEnvelopeService = new AudioEnvelopeService();
