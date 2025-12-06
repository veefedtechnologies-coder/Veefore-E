import { BaseRepository, PaginationOptions } from './BaseRepository';
import { ContentRecommendationModel, IContentRecommendation } from '../models/Content/ContentRecommendation';

export class ContentRecommendationRepository extends BaseRepository<IContentRecommendation> {
  constructor() {
    super(ContentRecommendationModel, 'ContentRecommendation');
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findActiveByWorkspace(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId, isActive: true }, options);
  }

  async findByCategory(category: string, options?: PaginationOptions) {
    return this.findMany({ category }, options);
  }

  async findByCountry(country: string, options?: PaginationOptions) {
    return this.findMany({ country }, options);
  }

  async toggleActive(recommendationId: string, isActive: boolean): Promise<IContentRecommendation | null> {
    return this.updateById(recommendationId, { isActive, updatedAt: new Date() });
  }

  async createWithDefaults(data: {
    workspaceId: number | string;
    type: string;
    title: string;
    description?: string;
    thumbnailUrl?: string;
    mediaUrl?: string;
    duration?: number;
    category: string;
    country: string;
    tags?: string[];
    engagement?: {
      expectedViews?: number;
      expectedLikes?: number;
      expectedShares?: number;
    };
    sourceUrl?: string;
    isActive?: boolean;
  }): Promise<IContentRecommendation> {
    return this.create({
      ...data,
      workspaceId: data.workspaceId.toString(),
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }
}

export const contentRecommendationRepository = new ContentRecommendationRepository();
