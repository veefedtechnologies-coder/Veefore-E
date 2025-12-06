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

  async markAsUsed(suggestionId: string): Promise<ISuggestion | null> {
    return this.updateById(suggestionId, { isUsed: true });
  }

  async deleteExpiredSuggestions(): Promise<number> {
    return this.deleteMany({ validUntil: { $lte: new Date() } });
  }
}

export const suggestionRepository = new SuggestionRepository();
