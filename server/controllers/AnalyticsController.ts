import { Response } from 'express';
import { z } from 'zod';
import { BaseController, TypedRequest } from './BaseController';
import { analyticsService } from '../services';

const AnalyticsIdParams = z.object({
  analyticsId: z.string().min(1),
});

const WorkspaceIdParams = z.object({
  workspaceId: z.string().min(1),
});

const PaginationQuery = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const PlatformQuery = z.object({
  platform: z.string().min(1),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

const DateRangeQuery = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  platform: z.string().optional(),
});

const PerformanceSummaryQuery = z.object({
  days: z.coerce.number().int().positive().max(365).default(30),
});

const DailyMetricsQuery = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  platform: z.string().optional(),
});

export class AnalyticsController extends BaseController {
  getAnalytics = this.wrapAsync(async (
    req: TypedRequest<{ analyticsId: string }>,
    res: Response
  ) => {
    const { analyticsId } = AnalyticsIdParams.parse(req.params);
    const analytics = await analyticsService.getAnalyticsById(analyticsId);
    this.sendSuccess(res, analytics);
  });

  getByWorkspace = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { page?: string; limit?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { page, limit } = PaginationQuery.parse(req.query);
    const result = await analyticsService.getAnalyticsByWorkspace(workspaceId, page, limit);
    this.sendPaginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  getByPlatform = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { platform: string; page?: string; limit?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { platform, page, limit } = PlatformQuery.parse(req.query);
    const result = await analyticsService.getAnalyticsByPlatform(workspaceId, platform, page, limit);
    this.sendPaginated(res, result.data, {
      page: result.page,
      limit: result.limit,
      total: result.total,
      totalPages: result.totalPages,
    });
  });

  getDateRange = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { startDate: string; endDate: string; platform?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { startDate, endDate, platform } = DateRangeQuery.parse(req.query);
    const analytics = await analyticsService.getAnalyticsByDateRange({
      workspaceId,
      startDate,
      endDate,
      platform,
    });
    this.sendSuccess(res, analytics);
  });

  getPerformanceSummary = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { days?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { days } = PerformanceSummaryQuery.parse(req.query);
    const summary = await analyticsService.getPerformanceSummary(workspaceId, days);
    this.sendSuccess(res, summary);
  });

  getDailyMetrics = this.wrapAsync(async (
    req: TypedRequest<{ workspaceId: string }, {}, { startDate: string; endDate: string; platform?: string }>,
    res: Response
  ) => {
    const { workspaceId } = WorkspaceIdParams.parse(req.params);
    const { startDate, endDate, platform } = DailyMetricsQuery.parse(req.query);
    const metrics = await analyticsService.getDailyMetrics({
      workspaceId,
      startDate,
      endDate,
      platform,
    });
    this.sendSuccess(res, metrics);
  });
}

export const analyticsController = new AnalyticsController();
