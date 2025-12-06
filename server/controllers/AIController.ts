import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { aiCreditService } from '../services';
import {
  creativeBriefRepository,
  contentRepurposeRepository,
  competitorAnalysisRepository,
} from '../repositories';
import { ValidationError } from '../errors';

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1),
});

const ContentIdParams = z.object({
  contentId: z.string().min(1),
});

const PaginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const GenerateContentSchema = z.object({
  type: z.enum(['caption', 'post', 'article', 'script', 'hashtags', 'bio']),
  platform: z.string().min(1).max(50),
  topic: z.string().min(1).max(500),
  tone: z.string().max(50).optional(),
  language: z.string().max(10).default('en'),
  keywords: z.array(z.string()).optional(),
  maxLength: z.number().int().positive().optional(),
  additionalContext: z.string().max(2000).optional(),
});

const GenerateThumbnailsSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  style: z.enum(['minimalist', 'bold', 'professional', 'playful', 'dark', 'light']).default('professional'),
  platform: z.string().min(1).max(50),
  count: z.number().int().min(1).max(10).default(3),
  aspectRatio: z.enum(['16:9', '1:1', '4:5', '9:16']).default('16:9'),
  includeText: z.boolean().default(true),
  brandColors: z.array(z.string()).optional(),
});

const GenerateScriptSchema = z.object({
  topic: z.string().min(1).max(500),
  platform: z.enum(['youtube', 'tiktok', 'instagram', 'podcast', 'other']),
  duration: z.enum(['short', 'medium', 'long']).default('medium'),
  tone: z.string().max(50).optional(),
  format: z.enum(['tutorial', 'story', 'educational', 'entertainment', 'review', 'vlog']).optional(),
  targetAudience: z.string().max(200).optional(),
  callToAction: z.string().max(200).optional(),
  hooks: z.boolean().default(true),
});

const AnalyzeCompetitorSchema = z.object({
  competitorUsername: z.string().min(1).max(100),
  platform: z.enum(['instagram', 'youtube', 'tiktok', 'twitter', 'linkedin']),
  analysisType: z.enum(['content', 'engagement', 'growth', 'full']).default('full'),
  timeframe: z.enum(['week', 'month', 'quarter', 'year']).default('month'),
});

const RepurposeContentSchema = z.object({
  originalContentId: z.string().min(1),
  sourcePlatform: z.string().min(1).max(50),
  targetPlatform: z.string().min(1).max(50),
  contentType: z.enum(['post', 'video', 'article', 'story', 'reel']),
  adaptStyle: z.boolean().default(true),
  preserveTone: z.boolean().default(true),
  translateTo: z.string().max(10).optional(),
});

export class AIController extends BaseController {
  generateContent = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof GenerateContentSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = GenerateContentSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const creditCheck = await aiCreditService.constructor.prototype.constructor.checkCredits(userId, 5);
    if (!creditCheck.hasCredits) {
      throw new ValidationError(`Insufficient credits. Required: 5, Available: ${creditCheck.currentCredits}`);
    }

    const brief = await creativeBriefRepository.create({
      workspaceId,
      userId,
      type: input.type,
      platform: input.platform,
      topic: input.topic,
      tone: input.tone,
      language: input.language,
      keywords: input.keywords,
      maxLength: input.maxLength,
      additionalContext: input.additionalContext,
      status: 'pending',
    });

    this.sendCreated(res, {
      briefId: brief.id || brief._id,
      message: 'Content generation initiated',
      estimatedCredits: 5,
    }, 'Content generation started');
  });

  generateThumbnails = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof GenerateThumbnailsSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = GenerateThumbnailsSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const estimatedCredits = 10 * input.count;
    const creditCheck = await aiCreditService.constructor.prototype.constructor.checkCredits(userId, estimatedCredits);
    if (!creditCheck.hasCredits) {
      throw new ValidationError(`Insufficient credits. Required: ${estimatedCredits}, Available: ${creditCheck.currentCredits}`);
    }

    this.sendCreated(res, {
      message: 'Thumbnail generation initiated',
      count: input.count,
      estimatedCredits,
      style: input.style,
      aspectRatio: input.aspectRatio,
    }, 'Thumbnail generation started');
  });

  generateScript = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof GenerateScriptSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = GenerateScriptSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const durationCredits = { short: 5, medium: 10, long: 20 };
    const estimatedCredits = durationCredits[input.duration];

    const creditCheck = await aiCreditService.constructor.prototype.constructor.checkCredits(userId, estimatedCredits);
    if (!creditCheck.hasCredits) {
      throw new ValidationError(`Insufficient credits. Required: ${estimatedCredits}, Available: ${creditCheck.currentCredits}`);
    }

    const brief = await creativeBriefRepository.create({
      workspaceId,
      userId,
      type: 'script',
      platform: input.platform,
      topic: input.topic,
      tone: input.tone,
      format: input.format,
      targetAudience: input.targetAudience,
      duration: input.duration,
      status: 'pending',
    });

    this.sendCreated(res, {
      briefId: brief.id || brief._id,
      message: 'Script generation initiated',
      estimatedCredits,
      duration: input.duration,
    }, 'Script generation started');
  });

  analyzeCompetitor = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof AnalyzeCompetitorSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = AnalyzeCompetitorSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const creditCheck = await aiCreditService.constructor.prototype.constructor.checkCredits(userId, 8);
    if (!creditCheck.hasCredits) {
      throw new ValidationError(`Insufficient credits. Required: 8, Available: ${creditCheck.currentCredits}`);
    }

    const existingAnalysis = await competitorAnalysisRepository.findByWorkspaceAndCompetitor(
      workspaceId,
      input.competitorUsername,
      input.platform
    );

    if (existingAnalysis) {
      const lastScraped = existingAnalysis.lastScraped || existingAnalysis.createdAt;
      const hoursSinceLastScrape = (Date.now() - new Date(lastScraped).getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceLastScrape < 24) {
        this.sendSuccess(res, {
          analysisId: existingAnalysis.id || existingAnalysis._id,
          cached: true,
          message: 'Recent analysis found',
          lastScraped: existingAnalysis.lastScraped,
        });
        return;
      }
    }

    const analysis = await competitorAnalysisRepository.create({
      workspaceId,
      userId,
      competitorUsername: input.competitorUsername,
      platform: input.platform,
      analysisType: input.analysisType,
      timeframe: input.timeframe,
      status: 'pending',
    });

    this.sendCreated(res, {
      analysisId: analysis.id || analysis._id,
      message: 'Competitor analysis initiated',
      estimatedCredits: 8,
    }, 'Competitor analysis started');
  });

  repurposeContent = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof RepurposeContentSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = RepurposeContentSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      throw new ValidationError('User not authenticated');
    }

    const estimatedCredits = input.translateTo ? 6 : 4;
    const creditCheck = await aiCreditService.constructor.prototype.constructor.checkCredits(userId, estimatedCredits);
    if (!creditCheck.hasCredits) {
      throw new ValidationError(`Insufficient credits. Required: ${estimatedCredits}, Available: ${creditCheck.currentCredits}`);
    }

    const repurpose = await contentRepurposeRepository.create({
      workspaceId,
      userId,
      originalContentId: input.originalContentId,
      sourcePlatform: input.sourcePlatform,
      targetPlatform: input.targetPlatform,
      contentType: input.contentType,
      adaptStyle: input.adaptStyle,
      preserveTone: input.preserveTone,
      targetLanguage: input.translateTo,
      status: 'pending',
      isApproved: false,
    });

    this.sendCreated(res, {
      repurposeId: repurpose.id || repurpose._id,
      message: 'Content repurposing initiated',
      estimatedCredits,
      sourcePlatform: input.sourcePlatform,
      targetPlatform: input.targetPlatform,
    }, 'Content repurposing started');
  });

  getCreativeBriefs = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { page?: string; limit?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { page, limit } = PaginationQuery.parse(req.query);
    const result = await creativeBriefRepository.findByWorkspaceId(workspaceId, { page, limit });
    this.sendPaginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  getCompetitorAnalyses = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { page?: string; limit?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { page, limit } = PaginationQuery.parse(req.query);
    const result = await competitorAnalysisRepository.findByWorkspaceId(workspaceId, { page, limit });
    this.sendPaginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  getRepurposedContent = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { page?: string; limit?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { page, limit } = PaginationQuery.parse(req.query);
    const result = await contentRepurposeRepository.findByWorkspaceId(workspaceId, { page, limit });
    this.sendPaginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });
}

export const aiController = new AIController();
