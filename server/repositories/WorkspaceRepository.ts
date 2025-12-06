import { BaseRepository, PaginationOptions } from './BaseRepository';
import { WorkspaceModel, IWorkspace } from '../models/Workspace/Workspace';
import { logger } from '../config/logger';
import { DatabaseError } from '../errors';

export class WorkspaceRepository extends BaseRepository<IWorkspace> {
  constructor() {
    super(WorkspaceModel, 'Workspace');
  }

  async findByUserId(userId: string): Promise<IWorkspace[]> {
    return this.findAll({ userId });
  }

  async findDefaultByUserId(userId: string): Promise<IWorkspace | null> {
    return this.findOne({ userId, isDefault: true });
  }

  async findByInviteCode(inviteCode: string): Promise<IWorkspace | null> {
    return this.findOne({ inviteCode });
  }

  async createDefaultWorkspace(userId: string, name: string = 'My Workspace'): Promise<IWorkspace> {
    return this.create({
      userId,
      name,
      isDefault: true,
      credits: 0,
      theme: 'space',
      aiPersonality: 'professional',
      maxTeamMembers: 1
    });
  }

  async createWithDefaults(data: Partial<IWorkspace>): Promise<IWorkspace> {
    return this.create({
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  }

  async updateCredits(workspaceId: string, creditDelta: number): Promise<IWorkspace | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findByIdAndUpdate(
          workspaceId,
          { $inc: { credits: creditDelta }, $set: { updatedAt: new Date() } },
          { new: true, runValidators: true }
        )
        .exec();
      logger.db.query('updateCredits', this.entityName, Date.now() - startTime, { workspaceId, creditDelta });
      return result;
    } catch (error) {
      logger.db.error('updateCredits', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to update workspace credits', error as Error);
    }
  }

  async deductCredits(workspaceId: string, amount: number): Promise<IWorkspace | null> {
    const startTime = Date.now();
    try {
      const result = await this.model
        .findOneAndUpdate(
          { _id: workspaceId, credits: { $gte: amount } },
          { $inc: { credits: -amount }, $set: { updatedAt: new Date() } },
          { new: true, runValidators: true }
        )
        .exec();
      logger.db.query('deductCredits', this.entityName, Date.now() - startTime, { workspaceId, amount });
      return result;
    } catch (error) {
      logger.db.error('deductCredits', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to deduct workspace credits', error as Error);
    }
  }

  async generateInviteCode(workspaceId: string): Promise<IWorkspace | null> {
    const inviteCode = this.generateRandomCode();
    return this.updateById(workspaceId, { inviteCode, updatedAt: new Date() });
  }

  private generateRandomCode(length: number = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  async updateTheme(workspaceId: string, theme: string): Promise<IWorkspace | null> {
    return this.updateById(workspaceId, { theme, updatedAt: new Date() });
  }

  async updateAiPersonality(workspaceId: string, aiPersonality: string): Promise<IWorkspace | null> {
    return this.updateById(workspaceId, { aiPersonality, updatedAt: new Date() });
  }

  async countByUserId(userId: string): Promise<number> {
    return this.count({ userId });
  }

  async unsetDefaultForUser(userId: string): Promise<void> {
    const startTime = Date.now();
    try {
      await this.model
        .updateMany(
          { userId },
          { $set: { isDefault: false, updatedAt: new Date() } }
        )
        .exec();
      logger.db.query('unsetDefaultForUser', this.entityName, Date.now() - startTime, { userId });
    } catch (error) {
      logger.db.error('unsetDefaultForUser', error, { entityName: this.entityName, userId });
      throw new DatabaseError('Failed to unset default workspaces for user', error as Error);
    }
  }

  async getWorkspaceStats(workspaceId: string): Promise<{
    credits: number;
    memberCount: number;
    maxTeamMembers: number;
  } | null> {
    const startTime = Date.now();
    try {
      const workspace = await this.findById(workspaceId);
      if (!workspace) return null;

      logger.db.query('getWorkspaceStats', this.entityName, Date.now() - startTime, { workspaceId });
      return {
        credits: workspace.credits,
        memberCount: 1,
        maxTeamMembers: workspace.maxTeamMembers
      };
    } catch (error) {
      logger.db.error('getWorkspaceStats', error, { entityName: this.entityName, workspaceId });
      throw new DatabaseError('Failed to get workspace stats', error as Error);
    }
  }

  async countAll(): Promise<number> {
    const startTime = Date.now();
    try {
      const count = await this.model.countDocuments({}).exec();
      logger.db.query('countAll', this.entityName, Date.now() - startTime);
      return count;
    } catch (error) {
      logger.db.error('countAll', error, { entityName: this.entityName });
      throw new DatabaseError('Failed to count all workspaces', error as Error);
    }
  }
}

export const workspaceRepository = new WorkspaceRepository();
