import { BaseService } from './BaseService';
import { contentRepository, ContentStatus } from '../repositories';
import { IContent } from '../models/Content';
import { NotFoundError, ValidationError } from '../errors';

interface CreateContentInput {
  workspaceId: string;
  type: string;
  title: string;
  description?: string;
  contentData?: Record<string, any>;
  platform?: string;
  prompt?: string;
  creditsUsed?: number;
}

interface UpdateContentInput {
  title?: string;
  description?: string;
  contentData?: Record<string, any>;
  platform?: string;
}

interface ScheduleContentInput {
  scheduledAt: Date;
  platform?: string;
}

export class ContentService extends BaseService {
  constructor() {
    super('ContentService');
  }

  async getContentById(contentId: string): Promise<IContent> {
    return this.withErrorHandling('getContentById', async () => {
      const content = await contentRepository.findById(contentId);
      if (!content) {
        throw new NotFoundError('Content', contentId);
      }
      return content;
    });
  }

  async getContentByWorkspace(
    workspaceId: string,
    page: number = 1,
    limit: number = 20
  ) {
    return this.withErrorHandling('getContentByWorkspace', async () => {
      return contentRepository.findByWorkspaceId(workspaceId, { page, limit });
    });
  }

  async getContentByStatus(
    workspaceId: string,
    status: ContentStatus,
    page: number = 1,
    limit: number = 20
  ) {
    return this.withErrorHandling('getContentByStatus', async () => {
      return contentRepository.findByWorkspaceAndStatus(workspaceId, status, { page, limit });
    });
  }

  async getDrafts(workspaceId: string, page: number = 1, limit: number = 20) {
    return this.getContentByStatus(workspaceId, 'draft', page, limit);
  }

  async getScheduledContent(workspaceId: string): Promise<IContent[]> {
    return this.withErrorHandling('getScheduledContent', async () => {
      return contentRepository.findScheduledContent(workspaceId);
    });
  }

  async getUpcomingScheduled(workspaceId: string, limit: number = 10): Promise<IContent[]> {
    return this.withErrorHandling('getUpcomingScheduled', async () => {
      return contentRepository.findUpcomingScheduled(workspaceId, limit);
    });
  }

  async getRecentlyPublished(workspaceId: string, limit: number = 10): Promise<IContent[]> {
    return this.withErrorHandling('getRecentlyPublished', async () => {
      return contentRepository.findRecentlyPublished(workspaceId, limit);
    });
  }

  async createContent(input: CreateContentInput): Promise<IContent> {
    return this.withErrorHandling('createContent', async () => {
      if (!input.title || input.title.trim().length === 0) {
        throw new ValidationError('Title is required');
      }

      const content = await contentRepository.create({
        workspaceId: input.workspaceId,
        type: input.type,
        title: input.title.trim(),
        description: input.description,
        contentData: input.contentData || {},
        platform: input.platform,
        prompt: input.prompt,
        status: 'draft',
        creditsUsed: input.creditsUsed || 0
      });

      this.log('createContent', 'Content created', {
        contentId: content._id,
        workspaceId: input.workspaceId,
        type: input.type
      });
      return content;
    });
  }

  async updateContent(contentId: string, input: UpdateContentInput): Promise<IContent> {
    return this.withErrorHandling('updateContent', async () => {
      const content = await this.getContentById(contentId);

      if (content.status === 'published') {
        throw new ValidationError('Cannot update published content');
      }

      const updated = await contentRepository.updateByIdOrFail(contentId, {
        ...input,
        updatedAt: new Date()
      });

      this.log('updateContent', 'Content updated', { contentId });
      return updated;
    });
  }

  async scheduleContent(contentId: string, input: ScheduleContentInput): Promise<IContent> {
    return this.withErrorHandling('scheduleContent', async () => {
      const content = await this.getContentById(contentId);

      if (content.status === 'published') {
        throw new ValidationError('Cannot schedule published content');
      }

      if (input.scheduledAt <= new Date()) {
        throw new ValidationError('Scheduled time must be in the future');
      }

      const updated = await contentRepository.scheduleContent(
        contentId,
        input.scheduledAt,
        input.platform
      );

      if (!updated) {
        throw new NotFoundError('Content', contentId);
      }

      this.log('scheduleContent', 'Content scheduled', {
        contentId,
        scheduledAt: input.scheduledAt
      });
      return updated;
    });
  }

  async rescheduleContent(contentId: string, newScheduledAt: Date): Promise<IContent> {
    return this.withErrorHandling('rescheduleContent', async () => {
      const content = await this.getContentById(contentId);

      if (content.status !== 'scheduled') {
        throw new ValidationError('Only scheduled content can be rescheduled');
      }

      if (newScheduledAt <= new Date()) {
        throw new ValidationError('Scheduled time must be in the future');
      }

      const updated = await contentRepository.rescheduleContent(contentId, newScheduledAt);
      if (!updated) {
        throw new NotFoundError('Content', contentId);
      }

      this.log('rescheduleContent', 'Content rescheduled', {
        contentId,
        newScheduledAt
      });
      return updated;
    });
  }

  async cancelSchedule(contentId: string): Promise<IContent> {
    return this.withErrorHandling('cancelSchedule', async () => {
      const content = await this.getContentById(contentId);

      if (content.status !== 'scheduled') {
        throw new ValidationError('Only scheduled content can be unscheduled');
      }

      const updated = await contentRepository.updateByIdOrFail(contentId, {
        status: 'draft',
        scheduledAt: undefined,
        updatedAt: new Date()
      });

      this.log('cancelSchedule', 'Schedule cancelled', { contentId });
      return updated;
    });
  }

  async markPublished(contentId: string): Promise<IContent> {
    return this.withErrorHandling('markPublished', async () => {
      const updated = await contentRepository.markPublished(contentId);
      if (!updated) {
        throw new NotFoundError('Content', contentId);
      }
      this.log('markPublished', 'Content marked as published', { contentId });
      return updated;
    });
  }

  async markFailed(contentId: string): Promise<IContent> {
    return this.withErrorHandling('markFailed', async () => {
      const updated = await contentRepository.markFailed(contentId);
      if (!updated) {
        throw new NotFoundError('Content', contentId);
      }
      this.log('markFailed', 'Content marked as failed', { contentId });
      return updated;
    });
  }

  async archiveContent(contentId: string): Promise<IContent> {
    return this.withErrorHandling('archiveContent', async () => {
      const content = await this.getContentById(contentId);

      if (content.status === 'scheduled') {
        throw new ValidationError('Cannot archive scheduled content. Cancel the schedule first.');
      }

      const updated = await contentRepository.archiveContent(contentId);
      if (!updated) {
        throw new NotFoundError('Content', contentId);
      }

      this.log('archiveContent', 'Content archived', { contentId });
      return updated;
    });
  }

  async deleteContent(contentId: string): Promise<void> {
    return this.withErrorHandling('deleteContent', async () => {
      const content = await this.getContentById(contentId);

      if (content.status === 'scheduled') {
        throw new ValidationError('Cannot delete scheduled content. Cancel the schedule first.');
      }

      await contentRepository.deleteById(contentId);
      this.log('deleteContent', 'Content deleted', { contentId });
    });
  }

  async getContentDueForPublishing(): Promise<IContent[]> {
    return this.withErrorHandling('getContentDueForPublishing', async () => {
      return contentRepository.findDueForPublishing();
    });
  }

  async addCreditsUsed(contentId: string, credits: number): Promise<IContent> {
    return this.withErrorHandling('addCreditsUsed', async () => {
      const updated = await contentRepository.addCreditsUsed(contentId, credits);
      if (!updated) {
        throw new NotFoundError('Content', contentId);
      }
      return updated;
    });
  }

  async searchContent(workspaceId: string, query: string, page: number = 1, limit: number = 20) {
    return this.withErrorHandling('searchContent', async () => {
      return contentRepository.searchContent(workspaceId, query, { page, limit });
    });
  }

  async getContentStats(workspaceId: string): Promise<{
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    totalCreditsUsed: number;
  }> {
    return this.withErrorHandling('getContentStats', async () => {
      const [byStatus, byType, totalCreditsUsed] = await Promise.all([
        contentRepository.countByStatus(workspaceId),
        contentRepository.countByType(workspaceId),
        contentRepository.getTotalCreditsUsed(workspaceId)
      ]);

      return { byStatus, byType, totalCreditsUsed };
    });
  }
}

export const contentService = new ContentService();
