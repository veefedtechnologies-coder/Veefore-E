/**
 * Transcription_Service — real speech-to-text for the Video_Editor captions
 * (No-Mock, Req 23).
 *
 * The Caption_Renderer burns `CaptionSegment[]` (word/segment ms timings) into a
 * video deterministically, but it needs those segments from somewhere. This
 * service is the ONLY producer of them for the chat-driven "add captions" flow:
 * it extracts the source's audio track with the BUNDLED ffmpeg and transcribes it
 * with OpenAI Whisper (`whisper-1`, `verbose_json`, segment + word granularity),
 * mapping the response into `CaptionSegment[]` with millisecond timings.
 *
 * It is honest by construction (Req 23):
 *   - If `OPENAI_API_KEY` is not configured, it throws a typed
 *     {@link TranscriptionError} BEFORE doing any work — the caller converts that
 *     into an honest chat message. It never fabricates captions.
 *   - If audio extraction or the Whisper call fails, it throws a typed
 *     {@link TranscriptionError} — again, never a fabricated/empty-but-"ok" result.
 *   - When the transcription genuinely contains no speech it returns an EMPTY
 *     array (a real, honest "no speech" outcome the caller surfaces as a
 *     clarification), never invented text.
 *
 * The pure Whisper→CaptionSegment mapping ({@link mapWhisperToCaptionSegments}) is
 * exported and total (never throws) so it can be unit-tested without touching the
 * network or ffmpeg.
 *
 * ESM static imports only. The OpenAI client is constructed lazily (only when a
 * key is present and a transcription actually runs) via an injectable factory, so
 * a missing key degrades to an honest error and the module never crashes on load.
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
import type { CaptionSegment, CaptionWord } from './caption-layout.logic';

// ---------------------------------------------------------------------------
// Errors (honest failure, Req 23)
// ---------------------------------------------------------------------------

/**
 * Thrown on any transcription failure. Carries a stable `code` the caller can
 * branch on to surface an honest chat message. A missing key, a download
 * failure, an audio-extraction failure, and a Whisper API failure all map to a
 * distinct code — none of them ever yield fabricated captions.
 */
export class TranscriptionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'TranscriptionError';
    Error.captureStackTrace?.(this, this.constructor);
  }
}

// ---------------------------------------------------------------------------
// Whisper `verbose_json` response shapes (subset we consume)
// ---------------------------------------------------------------------------

/** A single word with its timing (seconds) from Whisper word-level output. */
interface WhisperWord {
  word?: string;
  start?: number;
  end?: number;
}

/**
 * A single Whisper transcript segment (seconds); may carry per-word timing.
 *
 * Whisper's `verbose_json` also reports per-segment quality signals used to
 * detect hallucinated captions on non-speech audio (engine/road noise, music):
 *   - `no_speech_prob` — probability the segment is silence/noise (0..1).
 *   - `avg_logprob`    — mean token log-probability (higher = more confident).
 *   - `compression_ratio` — text gzip ratio (very high = degenerate/repetitive).
 * All are optional: older/other responses may omit them, in which case the
 * mapping falls back to prior behaviour and does not over-drop.
 */
interface WhisperSegment {
  text?: string;
  start?: number;
  end?: number;
  words?: WhisperWord[];
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
}

/** The subset of the Whisper `verbose_json` response we map from. */
export interface WhisperVerboseResponse {
  text?: string;
  segments?: WhisperSegment[];
  words?: WhisperWord[];
}

// ---------------------------------------------------------------------------
// Pure mapping: Whisper verbose_json → CaptionSegment[] (unit-tested)
// ---------------------------------------------------------------------------

/** Convert fractional seconds to whole non-negative milliseconds. */
function secondsToMs(seconds: number | undefined): number | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}

/** A small epsilon (ms) so word/segment boundary rounding still associates words. */
const WORD_ASSOCIATION_EPSILON_MS = 60;

/**
 * Standard Whisper hallucination thresholds. Whisper invents plausible-looking
 * words on non-speech audio; these per-segment signals catch the common cases.
 * A segment is dropped when ANY threshold is crossed:
 *   - `no_speech_prob >= 0.6`   → the segment is probably silence/noise.
 *   - `avg_logprob    <= -1.0`  → very low model confidence.
 *   - `compression_ratio >= 2.4`→ degenerate/repetitive (looped) text.
 */
const HALLUCINATION_NO_SPEECH_PROB_MAX = 0.6;
const HALLUCINATION_AVG_LOGPROB_MIN = -1.0;
const HALLUCINATION_COMPRESSION_RATIO_MAX = 2.4;

/**
 * True when the trimmed segment text is not a usable caption on its own: it is
 * only punctuation, or a single very short token (even if repeated, e.g. "." or
 * "you you you"). Genuine captions like "Hello" or a real phrase are kept.
 */
function isTrivialOrDegenerateText(trimmedText: string): boolean {
  const stripped = trimmedText.replace(/[^\p{L}\p{N}]/gu, '');
  if (stripped.length === 0) return true; // punctuation-only / whitespace-only
  const distinct = new Set(
    trimmedText
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ''))
      .filter((t) => t.length > 0),
  );
  // A single distinct very-short token (<= 2 chars), possibly repeated, is noise.
  if (distinct.size === 1) {
    const only = [...distinct][0] ?? '';
    if (only.length <= 2) return true;
  }
  return false;
}

/**
 * True when a Whisper segment is hallucination-likely and should be dropped.
 * PURE. The numeric thresholds ONLY apply when the corresponding field is a
 * finite number (present in the response) — when a field is absent (older
 * responses) it contributes nothing, so we fall back to prior behaviour and do
 * not over-drop. The trivial/punctuation text check is always safe to apply.
 */
function isHallucinationLikely(seg: WhisperSegment, trimmedText: string): boolean {
  if (
    typeof seg.no_speech_prob === 'number' &&
    Number.isFinite(seg.no_speech_prob) &&
    seg.no_speech_prob >= HALLUCINATION_NO_SPEECH_PROB_MAX
  ) {
    return true;
  }
  if (
    typeof seg.avg_logprob === 'number' &&
    Number.isFinite(seg.avg_logprob) &&
    seg.avg_logprob <= HALLUCINATION_AVG_LOGPROB_MIN
  ) {
    return true;
  }
  if (
    typeof seg.compression_ratio === 'number' &&
    Number.isFinite(seg.compression_ratio) &&
    seg.compression_ratio >= HALLUCINATION_COMPRESSION_RATIO_MAX
  ) {
    return true;
  }
  return isTrivialOrDegenerateText(trimmedText);
}

/** Map a raw Whisper word to a usable {@link CaptionWord}, or null if unusable. */
function toCaptionWord(word: WhisperWord): CaptionWord | null {
  const startMs = secondsToMs(word.start);
  const endMs = secondsToMs(word.end);
  const text = typeof word.word === 'string' ? word.word.trim() : '';
  if (startMs === null || endMs === null || endMs <= startMs || text.length === 0) return null;
  return { startMs, endMs, text };
}

/**
 * A min/max millisecond span (both `null` when nothing contributed to it).
 * Used purely for diagnostics — it never influences the mapping result.
 */
export interface SpanMs {
  minStartMs: number | null;
  maxEndMs: number | null;
}

/** One compact per-segment diagnostic row (capped array; no raw text/PII). */
export interface SegmentDiagnostic {
  startMs: number;
  endMs: number;
  textLen: number;
  no_speech_prob: number | null;
  avg_logprob: number | null;
  compression_ratio: number | null;
  hadWords: boolean;
  droppedByHallucination: boolean;
}

/**
 * Diagnostics captured DURING the pure mapping — a faithful, side-effect-free
 * report of what Whisper returned and what the mapping did with it, so a single
 * real run can be root-caused (coarse Whisper output vs hallucination drop vs
 * word-association window) without guessing. It carries NO caption text or audio
 * (only lengths/counts) and caps the per-segment preview so it is safe to log in
 * production.
 */
export interface WhisperMappingDiagnostics {
  /** `response.segments` length (raw, pre-validation). */
  rawSegmentCount: number;
  /** Segments with valid timing + non-empty text, BEFORE the hallucination filter. */
  structurallyUsableSegments: number;
  /** Structurally-usable segments dropped by {@link isHallucinationLikely}. */
  droppedByHallucination: number;
  /** Final mapped segment count (equals the mapped array length). */
  keptSegmentCount: number;
  /** `response.words` length (raw, pre-validation). */
  rawTopLevelWordCount: number;
  /** Top-level words with valid timing + non-empty text. */
  usableTopLevelWordCount: number;
  /** Span Whisper THINKS speech covers, across raw usable segments AND top-level words. */
  rawTranscriptSpanMs: SpanMs;
  /** Span the FINAL mapped segments actually cover. */
  mappedSpanMs: SpanMs;
  /** How many FINAL segments carried a `words` array. */
  segmentsWithWordTiming: number;
  /** Compact per-segment preview (capped; structurally-usable segments only). */
  segmentPreview: SegmentDiagnostic[];
}

/** Max per-segment preview rows kept in diagnostics (bounds the log size). */
const DIAGNOSTICS_PREVIEW_CAP = 40;

/** Finite-number-or-null coercion for compact diagnostic fields. */
function finiteOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Fold a single (start,end) pair into a running {@link SpanMs}. Pure. */
function extendSpan(span: SpanMs, startMs: number, endMs: number): void {
  span.minStartMs = span.minStartMs === null ? startMs : Math.min(span.minStartMs, startMs);
  span.maxEndMs = span.maxEndMs === null ? endMs : Math.max(span.maxEndMs, endMs);
}

/**
 * Map a Whisper `verbose_json` response to `CaptionSegment[]` with millisecond
 * timings (Req 11.1, 11.2), ALSO returning side-effect-free diagnostics about
 * what the mapping observed and did. PURE and total — never throws, never
 * performs IO.
 *
 * The `segments` result is byte-identical to what {@link mapWhisperToCaptionSegments}
 * returns for the same input: this function contains the single source of truth
 * for the mapping, and the public `mapWhisperToCaptionSegments` simply returns
 * `.segments` from here. The extra `diagnostics` object is computed alongside and
 * NEVER influences the mapping (no threshold, epsilon, or fallback changes).
 */
export function mapWhisperToCaptionSegmentsWithDiagnostics(
  response: WhisperVerboseResponse | null | undefined,
): { segments: CaptionSegment[]; diagnostics: WhisperMappingDiagnostics } {
  const diagnostics: WhisperMappingDiagnostics = {
    rawSegmentCount: 0,
    structurallyUsableSegments: 0,
    droppedByHallucination: 0,
    keptSegmentCount: 0,
    rawTopLevelWordCount: 0,
    usableTopLevelWordCount: 0,
    rawTranscriptSpanMs: { minStartMs: null, maxEndMs: null },
    mappedSpanMs: { minStartMs: null, maxEndMs: null },
    segmentsWithWordTiming: 0,
    segmentPreview: [],
  };

  if (!response || typeof response !== 'object') {
    return { segments: [], diagnostics };
  }

  const rawSegments = Array.isArray(response.segments) ? response.segments : [];
  diagnostics.rawSegmentCount = rawSegments.length;
  diagnostics.rawTopLevelWordCount = Array.isArray(response.words) ? response.words.length : 0;

  const topWords = Array.isArray(response.words)
    ? response.words.map(toCaptionWord).filter((w): w is CaptionWord => w !== null)
    : [];
  diagnostics.usableTopLevelWordCount = topWords.length;
  // Top-level usable words contribute to the "span Whisper thinks speech covers".
  for (const w of topWords) extendSpan(diagnostics.rawTranscriptSpanMs, w.startMs, w.endMs);

  const segments: CaptionSegment[] = [];
  // Count segments that are structurally usable (valid timing + non-empty text),
  // BEFORE the hallucination filter. If any exist, we do NOT fall back to the
  // per-word path below — otherwise dropping every noise segment would resurrect
  // the same hallucinated words via top-level `words` (defeating the filter).
  let structurallyUsableSegments = 0;

  for (const seg of rawSegments) {
    const startMs = secondsToMs(seg.start);
    const endMs = secondsToMs(seg.end);
    const text = typeof seg.text === 'string' ? seg.text.trim() : '';
    if (startMs === null || endMs === null || endMs <= startMs || text.length === 0) continue;
    structurallyUsableSegments += 1;
    // Raw usable segment span (what Whisper thinks speech covers).
    extendSpan(diagnostics.rawTranscriptSpanMs, startMs, endMs);

    // Drop hallucination-likely segments (Whisper invents words on non-speech
    // audio). Absent quality fields fall back to prior behaviour (see helper).
    const dropped = isHallucinationLikely(seg, text);

    // Prefer the segment's own word timings; else associate top-level words that
    // fall inside this segment's window (with a small rounding tolerance).
    let words: CaptionWord[] = Array.isArray(seg.words)
      ? seg.words.map(toCaptionWord).filter((w): w is CaptionWord => w !== null)
      : [];
    if (words.length === 0 && topWords.length > 0) {
      words = topWords.filter(
        (w) =>
          w.startMs >= startMs - WORD_ASSOCIATION_EPSILON_MS &&
          w.endMs <= endMs + WORD_ASSOCIATION_EPSILON_MS,
      );
    }

    if (diagnostics.segmentPreview.length < DIAGNOSTICS_PREVIEW_CAP) {
      diagnostics.segmentPreview.push({
        startMs,
        endMs,
        textLen: text.length,
        no_speech_prob: finiteOrNull(seg.no_speech_prob),
        avg_logprob: finiteOrNull(seg.avg_logprob),
        compression_ratio: finiteOrNull(seg.compression_ratio),
        hadWords: words.length > 0,
        droppedByHallucination: dropped,
      });
    }

    if (dropped) {
      diagnostics.droppedByHallucination += 1;
      continue;
    }

    const segment: CaptionSegment = { startMs, endMs, text };
    if (words.length > 0) segment.words = words;
    segments.push(segment);
  }

  // Fallback: no STRUCTURALLY usable segments at all but usable top-level words
  // (rare granularity combinations) → emit one segment per word so captions are
  // still produced. Guarded by `structurallyUsableSegments === 0` so segments
  // dropped purely for hallucination are NOT resurrected through this path.
  if (segments.length === 0 && structurallyUsableSegments === 0 && topWords.length > 0) {
    for (const w of topWords) {
      segments.push({ startMs: w.startMs, endMs: w.endMs, text: w.text, words: [w] });
    }
  }

  segments.sort((a, b) => (a.startMs !== b.startMs ? a.startMs - b.startMs : a.endMs - b.endMs));

  // Final-mapping diagnostics (computed AFTER sort; never influences the result).
  diagnostics.structurallyUsableSegments = structurallyUsableSegments;
  diagnostics.keptSegmentCount = segments.length;
  for (const s of segments) {
    extendSpan(diagnostics.mappedSpanMs, s.startMs, s.endMs);
    if (Array.isArray(s.words) && s.words.length > 0) diagnostics.segmentsWithWordTiming += 1;
  }

  return { segments, diagnostics };
}

/**
 * Map a Whisper `verbose_json` response to `CaptionSegment[]` with millisecond
 * timings (Req 11.1, 11.2). PURE and total — never throws, never performs IO.
 *
 * Rules:
 *   - Each usable segment (valid `end > start`, non-empty text) becomes one
 *     `CaptionSegment` with rounded ms timings and trimmed text.
 *   - Word-level timing (Req 11.1) is attached WHERE available: a segment's own
 *     `words` are used first; otherwise the response's top-level `words` that
 *     fall within the segment's time window are associated to it. The renderer's
 *     pure layout core then emits word-level captions when the timing is usable
 *     and falls back to segment-level otherwise (Req 11.2) — this mapping never
 *     drops a segment for lacking word timing.
 *   - Segments are returned sorted by start time, then end time, giving a stable
 *     caption ordering.
 *
 * This is a thin wrapper over {@link mapWhisperToCaptionSegmentsWithDiagnostics}
 * that returns ONLY the segments, so its signature and behaviour are unchanged
 * for existing callers.
 */
export function mapWhisperToCaptionSegments(
  response: WhisperVerboseResponse | null | undefined,
): CaptionSegment[] {
  return mapWhisperToCaptionSegmentsWithDiagnostics(response).segments;
}

// ---------------------------------------------------------------------------
// Service (IO shell)
// ---------------------------------------------------------------------------

/** Minimal shape of the OpenAI client method this service calls. */
export interface OpenAITranscriber {
  audio: {
    transcriptions: {
      create: (params: Record<string, unknown>) => Promise<unknown>;
    };
  };
}

/** Extracts a mono 16 kHz audio track from a video file. Injectable for tests. */
export type AudioExtractor = (inputPath: string, outputPath: string) => Promise<void>;

/** Injectable dependencies (defaulted for production, overridable for tests). */
export interface TranscriptionServiceDeps {
  logger?: Pick<typeof defaultLogger, 'info' | 'warn' | 'error' | 'debug'>;
  /** Storage backend used to resolve a `storageKey` to source bytes. */
  storage?: IStorageService;
  /** Base directory for temporary working files (defaults to the OS temp dir). */
  tempDir?: string;
  /** Path to the FFmpeg binary (defaults to `ffmpeg-static`). */
  ffmpegPath?: string | null;
  /** Audio extractor; defaults to a `fluent-ffmpeg` + `ffmpeg-static` extractor. */
  audioExtractor?: AudioExtractor;
  /**
   * Lazy OpenAI client factory. Called ONLY when a transcription runs and a key
   * is present, so a missing key never triggers client construction. Defaults to
   * constructing the `openai` SDK client with the provided key.
   */
  openAIClientFactory?: (apiKey: string) => Promise<OpenAITranscriber> | OpenAITranscriber;
  /** Reads the OpenAI API key (defaults to `process.env.OPENAI_API_KEY`). */
  getApiKey?: () => string | undefined;
}

/** Input to {@link TranscriptionService.transcribeSource}. */
export interface TranscribeSourceInput {
  /** Source video bytes (used directly when provided). */
  buffer?: Buffer;
  /** Storage key to download the source bytes from (used when no buffer). */
  storageKey?: string;
  /** Source id, for logging/provenance only. */
  sourceId?: string;
  /** Original filename, used to derive the temp input extension (default mp4). */
  fileName?: string;
}

/**
 * Real speech-to-text for captions. Extracts audio with the bundled ffmpeg and
 * transcribes it with OpenAI Whisper, returning `CaptionSegment[]` with ms
 * timings — or throwing a typed {@link TranscriptionError} on any failure (never
 * fabricating captions, Req 23).
 */
export class TranscriptionService {
  private readonly log: TranscriptionServiceDeps['logger'];
  private readonly storage: IStorageService;
  private readonly tempDir: string;
  private readonly ffmpegPath: string | null;
  private readonly audioExtractor: AudioExtractor;
  private readonly openAIClientFactory: (
    apiKey: string,
  ) => Promise<OpenAITranscriber> | OpenAITranscriber;
  private readonly getApiKey: () => string | undefined;

  constructor(deps: TranscriptionServiceDeps = {}) {
    this.log = deps.logger ?? defaultLogger;
    this.storage = deps.storage ?? getStorageService();
    this.tempDir = deps.tempDir ?? path.join(os.tmpdir(), 'veefore-video-editor-transcribe');
    this.ffmpegPath = deps.ffmpegPath ?? (ffmpegStatic as unknown as string | null) ?? null;
    this.audioExtractor = deps.audioExtractor ?? this.createDefaultAudioExtractor();
    this.openAIClientFactory = deps.openAIClientFactory ?? defaultOpenAIClientFactory;
    this.getApiKey = deps.getApiKey ?? (() => process.env.OPENAI_API_KEY);
  }

  /**
   * Transcribe a video source into `CaptionSegment[]` with ms timings.
   *
   * Honest failure (Req 23): throws {@link TranscriptionError} when the key is
   * missing, no source is resolvable, audio extraction fails, or the Whisper call
   * fails. Returns an empty array only when the transcription genuinely contains
   * no speech.
   */
  async transcribeSource(input: TranscribeSourceInput): Promise<CaptionSegment[]> {
    const apiKey = this.getApiKey();
    if (!apiKey || apiKey.trim().length === 0) {
      throw new TranscriptionError(
        'TRANSCRIPTION_NO_API_KEY',
        'Speech-to-text is not configured (no OpenAI API key), so I can\u2019t transcribe the audio to caption it.',
      );
    }

    const buffer = await this.resolveSourceBuffer(input);

    const workId = randomUUID();
    const workDir = path.join(this.tempDir, workId);
    const inExt = deriveExtension(input.fileName);
    const inputPath = path.join(workDir, `input${inExt}`);
    const audioPath = path.join(workDir, 'audio.wav');

    try {
      await fs.promises.mkdir(workDir, { recursive: true });
      await fs.promises.writeFile(inputPath, buffer);

      try {
        await this.audioExtractor(inputPath, audioPath);
      } catch (err) {
        throw new TranscriptionError(
          'TRANSCRIPTION_AUDIO_EXTRACTION_FAILED',
          `Could not extract an audio track to transcribe: ${(err as Error)?.message ?? 'ffmpeg failed'}`,
        );
      }

      const audioStat = await fs.promises.stat(audioPath).catch(() => null);
      if (!audioStat || !audioStat.isFile() || audioStat.size <= 0) {
        throw new TranscriptionError(
          'TRANSCRIPTION_NO_AUDIO',
          'The video has no usable audio track to transcribe for captions.',
        );
      }

      let response: WhisperVerboseResponse;
      // Whisper request params ACTUALLY sent — logged once (diagnostics only) so
      // we can confirm word-level granularity was requested for this run.
      const whisperRequestParams = {
        model: 'whisper-1' as const,
        response_format: 'verbose_json' as const,
        timestamp_granularities: ['segment', 'word'] as const,
      };
      this.log?.info?.('Transcription whisper request params', {
        component: 'TranscriptionService',
        sourceId: input.sourceId,
        ...whisperRequestParams,
      });
      try {
        const client = await this.openAIClientFactory(apiKey);
        response = (await client.audio.transcriptions.create({
          file: fs.createReadStream(audioPath),
          ...whisperRequestParams,
        })) as WhisperVerboseResponse;
      } catch (err) {
        throw new TranscriptionError(
          'TRANSCRIPTION_API_FAILED',
          `The speech-to-text service could not transcribe the audio: ${(err as Error)?.message ?? 'request failed'}`,
        );
      }

      // Behaviour-preserving: the diagnostics variant returns the SAME segments
      // as `mapWhisperToCaptionSegments`; we log the diagnostics alongside so a
      // real run reveals whether Whisper returned one coarse segment, the
      // hallucination filter dropped the rest, or word association excluded words.
      const { segments, diagnostics } = mapWhisperToCaptionSegmentsWithDiagnostics(response);
      this.log?.info?.('Transcription diagnostics', {
        component: 'TranscriptionService',
        sourceId: input.sourceId,
        ...diagnostics,
      });
      this.log?.info?.('Transcription completed', {
        component: 'TranscriptionService',
        sourceId: input.sourceId,
        segmentCount: segments.length,
      });
      return segments;
    } finally {
      await fs.promises.rm(workDir, { recursive: true, force: true }).catch(() => {
        this.log?.warn?.('Failed to clean up transcription temp dir', {
          component: 'TranscriptionService',
          workDir,
        });
      });
    }
  }

  /** Resolve the source bytes from an explicit buffer or a storage key. */
  private async resolveSourceBuffer(input: TranscribeSourceInput): Promise<Buffer> {
    if (input.buffer && input.buffer.length > 0) return input.buffer;
    if (input.storageKey) {
      try {
        const dl = await this.storage.downloadFile(input.storageKey);
        if (dl?.buffer && dl.buffer.length > 0) return dl.buffer;
      } catch (err) {
        throw new TranscriptionError(
          'TRANSCRIPTION_SOURCE_DOWNLOAD_FAILED',
          `Could not read the source video to transcribe it: ${(err as Error)?.message ?? 'download failed'}`,
        );
      }
    }
    throw new TranscriptionError(
      'TRANSCRIPTION_NO_SOURCE',
      'No source video was available to transcribe for captions.',
    );
  }

  /** Default extractor: mono 16 kHz WAV via fluent-ffmpeg + ffmpeg-static. */
  private createDefaultAudioExtractor(): AudioExtractor {
    const ffmpegPath = this.ffmpegPath;
    const log = this.log;
    return (inputPath: string, outputPath: string) =>
      new Promise<void>((resolve, reject) => {
        const cmd = ffmpeg(inputPath);
        if (ffmpegPath) cmd.setFfmpegPath(ffmpegPath);
        cmd
          .noVideo()
          .audioChannels(1)
          .audioFrequency(16_000)
          .audioCodec('pcm_s16le')
          .format('wav')
          .on('error', (err: Error) => {
            log?.error?.('Audio extraction FFmpeg failed', err, {
              component: 'TranscriptionService',
            });
            reject(err);
          })
          .on('end', () => resolve())
          .save(outputPath);
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

/**
 * Default OpenAI client factory (lazy). Uses a dynamic import so the `openai`
 * package is only loaded when a transcription actually runs with a key present —
 * a missing key never reaches here, so the module never crashes on load.
 */
async function defaultOpenAIClientFactory(apiKey: string): Promise<OpenAITranscriber> {
  const { default: OpenAI } = await import('openai');
  return new OpenAI({ apiKey }) as unknown as OpenAITranscriber;
}

/** Shared singleton for production use (mirrors other feature-service exports). */
export const transcriptionService = new TranscriptionService();
