import { BaseRepository, PaginationOptions } from './BaseRepository';
import { SuggestionModel, ISuggestion } from '../models/Analytics/Suggestion';

export class SuggestionRepository extends BaseRepository<ISuggestion> {
  constructor() {
    super(SuggestionModel, 'Suggestion');
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findByType(type: string, options?: PaginationOptions) {
    return this.findMany({ type }, options);
  }

  async findUnusedByWorkspace(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId, isUsed: false }, options);
  }

  async findValidByWorkspace(workspaceId: string, options?: PaginationOptions): Promise<ISuggestion[]> {
    const now = new Date();
    return this.findAll({
      workspaceId,
      isUsed: false,
      $or: [
        { validUntil: { $exists: false } },
        { validUntil: null },
        { validUntil: { $gt: now } }
      ]
    });
  }

  async markAsUsed(suggestionId: string): Promise<ISuggestion | null> {
    return this.updateById(suggestionId, { isUsed: true });
  }

  async deleteExpiredSuggestions(): Promise<number> {
    return this.deleteMany({ validUntil: { $lte: new Date() } });
  }

  async createWithDefaults(data: {
    workspaceId: number | string;
    type: string;
    data: Record<string, any>;
    confidence?: number;
    validUntil?: Date;
  }): Promise<ISuggestion> {
    return this.create({
      workspaceId: data.workspaceId.toString(),
      type: data.type,
      data: data.data,
      confidence: data.confidence,
      isUsed: false,
      validUntil: data.validUntil,
      createdAt: new Date()
    });
  }
}

export const suggestionRepository = new SuggestionRepository();
