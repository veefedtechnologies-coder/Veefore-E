import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { contentService } from '../services';

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

  getByWorkspace = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { page?: string; limit?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { page, limit } = PaginationQuery.parse(req.query);
    const result = await contentService.getContentByWorkspace(workspaceId, page, limit);
    this.sendPaginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
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
}

export const contentController = new ContentController();
