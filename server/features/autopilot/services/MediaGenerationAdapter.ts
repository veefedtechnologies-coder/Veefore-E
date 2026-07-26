/**
 * Auto Pilot — MediaGenerationAdapter (Task 11.1).
 *
 * Auto Pilot's primary content source is the user Media_Pool; AI generation is
 * the **fallback / backup** source (requirements Scope · R8.3). This adapter is
 * the single seam every AI-media request flows through, so the rest of Auto
 * Pilot never talks to a generation provider directly. Like every other stage it
 * is an **orchestrator, not a re-implementation**: it wraps the existing
 * content-generation services rather than re-doing them —
 *
 *   • **images** (`photo` / `carousel` / `story`) → `replicateService.generateImage`,
 *   • **video** (`reel`) → the AI video services (`runwayService` /
 *     `WorkingVideoGenerator`),
 *
 * behind one `generateMedia(format, prompt)` entry point (design "AI image" /
 * "AI video" table rows · R8.3). Every provider call is wrapped in
 * `withAIFeature('autopilot.media', { userId, workspaceId }, …)` so the produced
 * media's credit/usage spend is attributed to the Mission's workspace (design
 * credit-attribution note · R14.2).
 *
 * ── Add generated media to the pool (R6.3) ───────────────────────────────────
 * `generateMedia` produces the media for a Content_Slot AND adds the produced
 * item to the Media_Pool via `MediaPoolService.addGeneratedMedia`, marked
 * `available` so it can be assigned to future Content_Slots exactly like an
 * upload (R6.3). It returns the persisted pool item so the caller (ACT /
 * ContentSourceResolver) can point the slot's source at it.
 *
 * ── Doubles as the Content-Brief BackupMediaGenerator (Task 10.3) ────────────
 * The just-in-time Content_Brief flow reschedules an undelivered slot unless an
 * AI backup can be produced (R7.6/R7.7). This adapter implements the
 * {@link BackupMediaGenerator} port so it can be injected into
 * `BriefResolutionService` as the real backup generator. In that role `generate`
 * only *produces* the media (returning it for the resolution flow to add to the
 * pool + assign to the slot itself) — it does **not** add to the pool, so a
 * backup is never double-added.
 *
 * Every provider (image, video) is injected as a port with the real singletons
 * as defaults, and the Media_Pool service is injected too, so the routing and
 * add-to-pool behaviour is fully unit-testable without a network, a provider
 * token, or a database.
 *
 * Satisfies Requirements: 6.3, 8.3
 */

import { logger } from '../../../config/logger'
import { withAIFeature } from '../../../services/aiUsageTracker'
import { replicateService } from '../../../services/replicate-service'
import { runwayService } from '../../../services/runway-service'
import type { ContentFormat, IMediaPoolItem, MediaType } from '../db/models'
import { MediaPoolService, mediaPoolService } from './MediaPoolService'
import {
  BACKUP_MEDIA_TYPE_BY_FORMAT,
  type BackupMediaGenerator,
  type GeneratedBackupMedia,
} from './BriefResolutionService'

const COMPONENT = 'autopilot.MediaGenerationAdapter'

/** The AI-feature label used to attribute media-generation credit spend (R14.2). */
export const MEDIA_AI_FEATURE = 'autopilot.media'

/** Default visual style requested from the image provider. */
export const DEFAULT_IMAGE_STYLE = 'cinematic'

/**
 * The media type each slot format resolves to — reused from the Content-Brief
 * flow so a produced backup always matches the type that flow expects (R7.6):
 * `reel → video`, everything else `→ image`.
 */
export const MEDIA_TYPE_BY_FORMAT: Record<ContentFormat, MediaType> = BACKUP_MEDIA_TYPE_BY_FORMAT

/**
 * Image-generation port. Defaults to `replicateService.generateImage`, which
 * returns a hosted image URL for a text prompt (+ optional style).
 */
export interface ImageGenerator {
  generateImage(prompt: string, style?: string): Promise<string>
}

/**
 * Video-generation port. Defaults to `runwayService.generateVideoFromText`,
 * which returns a hosted video URL for a text prompt. Injectable so
 * `WorkingVideoGenerator` (or any future video service) can be substituted
 * without touching the routing logic (design "AI video" row).
 */
export interface VideoGenerator {
  generateVideo(prompt: string): Promise<string>
}

const defaultImageGenerator: ImageGenerator = {
  generateImage: (prompt, style) =>
    replicateService.generateImage(prompt, style ?? DEFAULT_IMAGE_STYLE),
}

const defaultVideoGenerator: VideoGenerator = {
  generateVideo: (prompt) => runwayService.generateVideoFromText(prompt),
}

/** The media an adapter run produced (before/independent of the pool add). */
export interface GeneratedMedia {
  /** Hosted URL of the produced media. */
  mediaUrl: string
  /** Whether it is an image or a video (derived from the slot format). */
  mediaType: MediaType
  /**
   * Byte size of the produced media. Providers return a hosted URL rather than
   * bytes, so this is `0` (unknown) unless a caller supplies it. `addGeneratedMedia`
   * does not size-validate generated media, so an unknown size is safe (R6.3).
   */
  sizeBytes: number
  /** Optional human/format label (e.g. `png`, `mp4`). */
  format?: string
}

/** Input for {@link MediaGenerationAdapter.generateMedia}. */
export interface GenerateMediaInput {
  /** Workspace the produced pool item is scoped to + credited to (R6.3/R14.2). */
  workspaceId: unknown
  /** Mission the media is produced for (stamped on the pool item). */
  missionId?: string
  /** User to attribute the AI spend to via `withAIFeature` (R14.2). */
  userId?: string
  /** The Content_Slot's format — drives image-vs-video routing (R8.3). */
  format: ContentFormat
  /** The generation prompt (concept/theme text). */
  prompt: string
  /** Optional visual style for image generation. Defaults to {@link DEFAULT_IMAGE_STYLE}. */
  style?: string
}

/** The result of a {@link MediaGenerationAdapter.generateMedia} run. */
export type GenerateMediaResult =
  /** Media produced AND added to the pool marked available (R6.3). */
  | { status: 'generated'; item: IMediaPoolItem; media: GeneratedMedia }
  /** Generation failed; nothing was added to the pool. */
  | { status: 'failed'; error: string }

/** Tunable dependencies for the media-generation adapter. */
export interface MediaGenerationAdapterOptions {
  /** Image transport (defaults to `replicateService.generateImage`). */
  imageGenerator?: ImageGenerator
  /** Video transport (defaults to `runwayService.generateVideoFromText`). */
  videoGenerator?: VideoGenerator
  /** Media-pool service used to add generated media (defaults to the shared singleton). */
  mediaPoolService?: Pick<MediaPoolService, 'addGeneratedMedia'>
  /**
   * Builds the generation prompt for a Content-Brief AI backup, which arrives
   * without prompt text (R7.6). Defaults to a generic, on-format prompt.
   */
  backupPromptBuilder?: (input: BackupGenerateInput) => string
}

/** The input the {@link BackupMediaGenerator} port receives (Task 10.3 shape). */
export interface BackupGenerateInput {
  missionId: unknown
  workspaceId: unknown
  slotId: string
  format: ContentFormat
}

const defaultBackupPromptBuilder = (input: BackupGenerateInput): string =>
  `High-quality ${input.format} content for an Instagram post, visually engaging and on-brand.`

/**
 * Wraps the existing AI image/video generation services behind a single
 * `generateMedia(format, prompt)`, routing on format, attributing spend via
 * `withAIFeature`, and adding the produced item to the Media_Pool (R6.3, R8.3).
 * Also implements {@link BackupMediaGenerator} so it can back the Content-Brief
 * fallback flow (Task 10.3).
 */
export class MediaGenerationAdapter implements BackupMediaGenerator {
  private readonly imageGenerator: ImageGenerator
  private readonly videoGenerator: VideoGenerator
  private readonly mediaPool: Pick<MediaPoolService, 'addGeneratedMedia'>
  private readonly backupPromptBuilder: (input: BackupGenerateInput) => string

  constructor(options: MediaGenerationAdapterOptions = {}) {
    this.imageGenerator = options.imageGenerator ?? defaultImageGenerator
    this.videoGenerator = options.videoGenerator ?? defaultVideoGenerator
    this.mediaPool = options.mediaPoolService ?? mediaPoolService
    this.backupPromptBuilder = options.backupPromptBuilder ?? defaultBackupPromptBuilder
  }

  /**
   * R8.3 + R6.3: produce AI media for a Content_Slot and add it to the pool.
   *
   * Routes on the slot's format — `reel` → the AI video service, every other
   * format → the AI image service — running the provider call under
   * `withAIFeature('autopilot.media', …)` for credit attribution (R14.2). On
   * success adds the produced item to the Media_Pool marked `available` (R6.3)
   * and returns the persisted pool item. On any provider failure it returns
   * `{ status: 'failed' }` without adding anything to the pool, so a generation
   * error never leaves a half-added item behind.
   */
  async generateMedia(input: GenerateMediaInput): Promise<GenerateMediaResult> {
    try {
      const media = await this.produce(
        {
          format: input.format,
          prompt: input.prompt,
          style: input.style,
        },
        { userId: input.userId, workspaceId: input.workspaceId },
      )

      // R6.3: add the generated item to the pool, available for future slots.
      const item = await this.mediaPool.addGeneratedMedia({
        workspaceId: input.workspaceId,
        missionId: input.missionId,
        mediaUrl: media.mediaUrl,
        mediaType: media.mediaType,
        format: media.format,
        sizeBytes: media.sizeBytes,
        origin: 'ai-generated',
      })

      logger.info('generated AI media and added it to the pool', {
        component: COMPONENT,
        workspaceId: String(input.workspaceId),
        missionId: input.missionId,
        format: input.format,
        mediaType: media.mediaType,
      })

      return { status: 'generated', item, media }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.warn('AI media generation failed', {
        component: COMPONENT,
        workspaceId: String(input.workspaceId),
        missionId: input.missionId,
        format: input.format,
        error: message,
      })
      return { status: 'failed', error: message }
    }
  }

  /**
   * {@link BackupMediaGenerator} — whether an AI backup can be produced for a
   * format at all (R7.6/R7.7). Every known format is producible (image or video),
   * so this returns `true` for all four formats; an actual provider outage is
   * surfaced by `generate` returning `null`, which routes the brief flow to a
   * reschedule (R7.7).
   */
  canGenerate(format: ContentFormat): boolean {
    return format in MEDIA_TYPE_BY_FORMAT
  }

  /**
   * {@link BackupMediaGenerator} — produce AI backup media for a Content-Brief
   * slot (R7.6). Builds a generic on-format prompt (the brief flow supplies no
   * prompt), routes + attributes exactly like {@link generateMedia}, and returns
   * the produced media for the resolution flow to add to the pool + assign to the
   * slot. Does **not** add to the pool here, so a backup is never double-added.
   * Returns `null` on any provider failure so the caller reschedules instead
   * (R7.7).
   */
  async generate(input: BackupGenerateInput): Promise<GeneratedBackupMedia | null> {
    try {
      const media = await this.produce(
        { format: input.format, prompt: this.backupPromptBuilder(input) },
        { userId: undefined, workspaceId: input.workspaceId },
      )
      return {
        mediaUrl: media.mediaUrl,
        mediaType: media.mediaType,
        sizeBytes: media.sizeBytes,
        format: media.format,
      }
    } catch (error) {
      logger.warn('AI backup media generation failed — caller will reschedule', {
        component: COMPONENT,
        workspaceId: String(input.workspaceId),
        slotId: input.slotId,
        format: input.format,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Route on format and produce the media under the credit-attribution context.
   * `reel` → the AI video service; `photo`/`carousel`/`story` → the AI image
   * service (R8.3). Throws when the provider fails so both public methods can
   * apply their own failure handling.
   */
  private async produce(
    request: { format: ContentFormat; prompt: string; style?: string },
    ctx: { userId?: string; workspaceId: unknown },
  ): Promise<GeneratedMedia> {
    const mediaType = MEDIA_TYPE_BY_FORMAT[request.format]

    return withAIFeature(
      MEDIA_AI_FEATURE,
      { userId: ctx.userId, workspaceId: String(ctx.workspaceId) },
      async () => {
        if (mediaType === 'video') {
          const mediaUrl = await this.videoGenerator.generateVideo(request.prompt)
          return { mediaUrl, mediaType, sizeBytes: 0, format: 'mp4' }
        }
        const mediaUrl = await this.imageGenerator.generateImage(request.prompt, request.style)
        return { mediaUrl, mediaType, sizeBytes: 0, format: 'png' }
      },
    )
  }
}

/** Shared default instance wired to the real image/video services + Media_Pool. */
export const mediaGenerationAdapter = new MediaGenerationAdapter()
