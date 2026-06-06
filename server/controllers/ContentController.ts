import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { contentService, workspaceService } from '../services';

const ContentIdParams = z.object({
  contentId: z.string().min(1),
});

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1),
});

const PaginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const CreateContentSchema = z.object({
  type: z.string().min(1).max(50),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  contentData: z.record(z.any()).optional(),
  platform: z.string().max(50).optional(),
  prompt: z.string().max(2000).optional(),
  creditsUsed: z.number().int().min(0).optional(),
});

const UpdateContentSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  contentData: z.record(z.any()).optional(),
  platform: z.string().max(50).optional(),
});

const ScheduleContentSchema = z.object({
  scheduledAt: z.coerce.date(),
  platform: z.string().max(50).optional(),
});

type ScheduleContentBody = z.infer<typeof ScheduleContentSchema>;

const RescheduleContentSchema = z.object({
  scheduledAt: z.coerce.date(),
});

export class ContentController extends BaseController {
  getContent = this.wrapAsync(async (
    req: TypedRequest<{ contentId: string }>,
    res: Response
  ) => {
    const { contentId } = ContentIdParams.parse(req.params);
    const content = await contentService.getContentById(contentId);
    this.sendSuccess(res, content);
  });

  getAnalytics = this.wrapAsync(async (
    req: TypedRequest<{ contentId: string }>,
    res: Response
  ) => {
    const { contentId } = ContentIdParams.parse(req.params);
    const analytics = await contentService.getContentAnalytics(contentId);
    this.sendSuccess(res, analytics);
  });

  debugCounts = this.wrapAsync(async (req: TypedRequest, res: Response) => {
    const total = await contentRepository.countAll();
    const veefore = await contentRepository.model.countDocuments({ isImported: { $ne: true }, 'contentData.media_type': { $exists: false } });
    const importedNew = await contentRepository.model.countDocuments({ isImported: true });
    const importedOld = await contentRepository.model.countDocuments({ 'contentData.media_type': { $exists: true } });
    
    // Check without the legacy check
    const veeforeNoLegacy = await contentRepository.model.countDocuments({ isImported: { $ne: true } });
    
    this.sendSuccess(res, { total, veefore, importedNew, importedOld, veeforeNoLegacy });
  });

  getByWorkspace = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { page?: string; limit?: string; accountId?: string; excludeImported?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { page, limit } = PaginationQuery.parse(req.query);
    const accountId = req.query.accountId as string | undefined;
    const excludeImported = req.query.excludeImported === 'true';
    const result = await contentService.getContentByWorkspace(workspaceId, page, limit, accountId, excludeImported);
    this.sendPaginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  getTopPerforming = this.wrapAsync(async (
    req: TypedRequest<{}, {}, { limit?: string; workspaceId?: string }>,
    res: Response
  ) => {
    console.log('[ContentController] getTopPerforming START');

    try {
      let workspaceId = req.query.workspaceId;

      // 1. Fallback to user's default workspace if not provided
      if (!workspaceId && req.user && req.user.workspaceId) {
        workspaceId = req.user.workspaceId;
        console.log(`[ContentController] Using fallback workspaceId from req.user: ${workspaceId}`);
      }

      // 2. Deep fallback: Fetch workspaces from DB if still missing
      if (!workspaceId && req.user) {
        console.log(`[ContentController] No workspace in query or user object. Fetching from DB for user ${req.user.id}...`);

        const workspaces = await workspaceService.getWorkspacesByUserId(req.user.id);

        if (workspaces && workspaces.length > 0) {
          workspaceId = (workspaces[0] as any)._id.toString();
          console.log(`[ContentController] Found workspace from DB: ${workspaceId}`);
        } else {
          console.warn(`[ContentController] No workspaces found for user ${req.user.id}`);
        }
      }

      if (!workspaceId) {
        console.error('[ContentController] CRITICAL: Could not resolve any workspaceId for user.');
        throw new Error('Workspace ID is required and no default workspace found.');
      }

      // Validate format
      WorkspaceIdParams.parse({ workspaceId });

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      console.log(`[ContentController] Calling service with workspaceId=${workspaceId}, limit=${limit}`);

      const content = await contentService.getTopPerforming(workspaceId, limit);

      this.sendSuccess(res, content);
    } catch (error) {
      console.error('[ContentController] CAUGHT Error in getTopPerforming:', error);
      throw error;
    }
  });

  getDrafts = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { page?: string; limit?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { page, limit } = PaginationQuery.parse(req.query);
    const result = await contentService.getDrafts(workspaceId, page, limit);
    this.sendPaginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  getScheduled = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const content = await contentService.getScheduledContent(workspaceId);
    this.sendSuccess(res, content);
  });

  createContent = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, z.infer<typeof CreateContentSchema>>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const input = CreateContentSchema.parse(req.body);
    const content = await contentService.createContent({
      workspaceId,
      type: input.type,
      title: input.title,
      description: input.description,
      contentData: input.contentData,
      platform: input.platform,
      prompt: input.prompt,
      creditsUsed: input.creditsUsed,
    });
    this.sendCreated(res, content, 'Content created successfully');
  });

  updateContent = this.wrapAsync(async (
    req: TypedRequest<{ contentId: string }, z.infer<typeof UpdateContentSchema>>,
    res: Response
  ) => {
    const { contentId } = ContentIdParams.parse(req.params);
    const input = UpdateContentSchema.parse(req.body);
    const content = await contentService.updateContent(contentId, input);
    this.sendSuccess(res, content, 200, 'Content updated successfully');
  });

  scheduleContent = this.wrapAsync(async (
    req: TypedRequest<{ contentId: string }, z.infer<typeof ScheduleContentSchema>>,
    res: Response
  ) => {
    const { contentId } = ContentIdParams.parse(req.params);
    const input = ScheduleContentSchema.parse(req.body);
    const content = await contentService.scheduleContent(contentId, {
      scheduledAt: input.scheduledAt,
      platform: input.platform,
    });
    this.sendSuccess(res, content, 200, 'Content scheduled successfully');
  });

  publishNow = this.wrapAsync(async (
    req: TypedRequest<{ contentId: string }>,
    res: Response
  ) => {
    const { contentId } = ContentIdParams.parse(req.params);
    const baseUrl = req.protocol + '://' + req.get('host');
    const content = await contentService.publishContentNow(contentId, baseUrl);
    this.sendSuccess(res, content, 200, 'Content published successfully');
  });

  rescheduleContent = this.wrapAsync(async (
    req: TypedRequest<{ contentId: string }, z.infer<typeof RescheduleContentSchema>>,
    res: Response
  ) => {
    const { contentId } = ContentIdParams.parse(req.params);
    const { scheduledAt } = RescheduleContentSchema.parse(req.body);
    const content = await contentService.rescheduleContent(contentId, scheduledAt);
    this.sendSuccess(res, content, 200, 'Content rescheduled successfully');
  });

  cancelSchedule = this.wrapAsync(async (
    req: TypedRequest<{ contentId: string }>,
    res: Response
  ) => {
    const { contentId } = ContentIdParams.parse(req.params);
    const content = await contentService.cancelSchedule(contentId);
    this.sendSuccess(res, content, 200, 'Schedule cancelled successfully');
  });

  archiveContent = this.wrapAsync(async (
    req: TypedRequest<{ contentId: string }>,
    res: Response
  ) => {
    const { contentId } = ContentIdParams.parse(req.params);
    const content = await contentService.archiveContent(contentId);
    this.sendSuccess(res, content, 200, 'Content archived successfully');
  });

  deleteContent = this.wrapAsync(async (
    req: TypedRequest<{ contentId: string }>,
    res: Response
  ) => {
    const { contentId } = ContentIdParams.parse(req.params);
    await contentService.deleteContent(contentId);
    this.sendNoContent(res);
  });

  syncInstagramId = this.wrapAsync(async (
    req: TypedRequest<{ contentId: string }>,
    res: Response
  ) => {
    const { contentId } = ContentIdParams.parse(req.params);
    // User is required via requireAuth middleware
    const content = await contentService.syncMissingInstagramId(contentId, req.user!.id);
    this.sendSuccess(res, content, 200, 'Instagram ID synced successfully');
  });
}

export const contentController = new ContentController();
