import { BaseService } from './BaseService';
import { workspaceRepository, userRepository, socialAccountRepository, contentRepository } from '../repositories';
import { IWorkspace } from '../models/Workspace/Workspace';
import { NotFoundError, ValidationError, ForbiddenError } from '../errors';

interface CreateWorkspaceInput {
  userId: string;
  name: string;
  description?: string;
  theme?: string;
  aiPersonality?: string;
}

interface UpdateWorkspaceInput {
  name?: string;
  description?: string;
  avatar?: string;
  theme?: string;
  aiPersonality?: string;
}

export class WorkspaceService extends BaseService {
  constructor() {
    super('WorkspaceService');
  }

  async getWorkspaceById(workspaceId: string): Promise<IWorkspace> {
    return this.withErrorHandling('getWorkspaceById', async () => {
      const workspace = await workspaceRepository.findById(workspaceId);
      if (!workspace) {
        throw new NotFoundError('Workspace', workspaceId);
      }
      return workspace;
    });
  }

  async getWorkspacesByUserId(userId: string): Promise<IWorkspace[]> {
    return this.withErrorHandling('getWorkspacesByUserId', async () => {
      return workspaceRepository.findByUserId(userId);
    });
  }

  async getDefaultWorkspace(userId: string): Promise<IWorkspace | null> {
    return this.withErrorHandling('getDefaultWorkspace', async () => {
      return workspaceRepository.findDefaultByUserId(userId);
    });
  }

  async createWorkspace(input: CreateWorkspaceInput): Promise<IWorkspace> {
    return this.withErrorHandling('createWorkspace', async () => {
      const existingWorkspaces = await workspaceRepository.findByUserId(input.userId);
      const isDefault = existingWorkspaces.length === 0;

      const workspace = await workspaceRepository.create({
        userId: input.userId,
        name: input.name,
        description: input.description,
        theme: input.theme || 'space',
        aiPersonality: input.aiPersonality || 'professional',
        isDefault,
        credits: 0,
        maxTeamMembers: 1
      });

      this.log('createWorkspace', 'Workspace created', { 
        workspaceId: workspace._id, 
        userId: input.userId 
      });
      return workspace;
    });
  }

  async updateWorkspace(
    workspaceId: string,
    userId: string,
    input: UpdateWorkspaceInput
  ): Promise<IWorkspace> {
    return this.withErrorHandling('updateWorkspace', async () => {
      const workspace = await this.getWorkspaceById(workspaceId);
      
      if (workspace.userId.toString() !== userId) {
        throw new ForbiddenError('You do not have permission to update this workspace');
      }

      const updated = await workspaceRepository.updateByIdOrFail(workspaceId, {
        ...input,
        updatedAt: new Date()
      });

      this.log('updateWorkspace', 'Workspace updated', { workspaceId });
      return updated;
    });
  }

  async deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
    return this.withErrorHandling('deleteWorkspace', async () => {
      const workspace = await this.getWorkspaceById(workspaceId);
      
      if (workspace.userId.toString() !== userId) {
        throw new ForbiddenError('You do not have permission to delete this workspace');
      }

      if (workspace.isDefault) {
        throw new ValidationError('Cannot delete default workspace');
      }

      await workspaceRepository.deleteById(workspaceId);
      this.log('deleteWorkspace', 'Workspace deleted', { workspaceId, userId });
    });
  }

  async setDefaultWorkspace(userId: string, workspaceId: string): Promise<IWorkspace> {
    return this.withErrorHandling('setDefaultWorkspace', async () => {
      const workspace = await this.getWorkspaceById(workspaceId);
      
      if (workspace.userId.toString() !== userId) {
        throw new ForbiddenError('You do not have permission to modify this workspace');
      }

      await workspaceRepository.updateMany(
        { userId },
        { isDefault: false }
      );

      const updated = await workspaceRepository.updateByIdOrFail(workspaceId, {
        isDefault: true,
        updatedAt: new Date()
      });

      await userRepository.updateById(userId, { workspaceId });

      this.log('setDefaultWorkspace', 'Default workspace changed', { userId, workspaceId });
      return updated;
    });
  }

  async addCredits(workspaceId: string, amount: number): Promise<IWorkspace> {
    return this.withErrorHandling('addCredits', async () => {
      if (amount <= 0) {
        throw new ValidationError('Credit amount must be positive');
      }
      const workspace = await workspaceRepository.updateCredits(workspaceId, amount);
      if (!workspace) {
        throw new NotFoundError('Workspace', workspaceId);
      }
      this.log('addCredits', 'Credits added to workspace', { workspaceId, amount });
      return workspace;
    });
  }

  async deductCredits(workspaceId: string, amount: number): Promise<IWorkspace> {
    return this.withErrorHandling('deductCredits', async () => {
      if (amount <= 0) {
        throw new ValidationError('Credit amount must be positive');
      }
      const workspace = await workspaceRepository.deductCredits(workspaceId, amount);
      if (!workspace) {
        const existing = await workspaceRepository.findById(workspaceId);
        if (!existing) {
          throw new NotFoundError('Workspace', workspaceId);
        }
        throw new ValidationError('Insufficient workspace credits');
      }
      this.log('deductCredits', 'Credits deducted from workspace', { workspaceId, amount });
      return workspace;
    });
  }

  async generateInviteCode(workspaceId: string, userId: string): Promise<string> {
    return this.withErrorHandling('generateInviteCode', async () => {
      const workspace = await this.getWorkspaceById(workspaceId);
      
      if (workspace.userId.toString() !== userId) {
        throw new ForbiddenError('You do not have permission to generate invite codes');
      }

      const updated = await workspaceRepository.generateInviteCode(workspaceId);
      if (!updated || !updated.inviteCode) {
        throw new Error('Failed to generate invite code');
      }

      this.log('generateInviteCode', 'Invite code generated', { workspaceId });
      return updated.inviteCode;
    });
  }

  async getWorkspaceByInviteCode(inviteCode: string): Promise<IWorkspace | null> {
    return this.withErrorHandling('getWorkspaceByInviteCode', async () => {
      return workspaceRepository.findByInviteCode(inviteCode);
    });
  }

  async getWorkspaceStats(workspaceId: string): Promise<{
    credits: number;
    socialAccountsCount: number;
    contentCount: number;
    scheduledCount: number;
  }> {
    return this.withErrorHandling('getWorkspaceStats', async () => {
      const [workspace, socialAccounts, contentStats] = await Promise.all([
        this.getWorkspaceById(workspaceId),
        socialAccountRepository.findByWorkspaceId(workspaceId),
        contentRepository.countByStatus(workspaceId)
      ]);

      return {
        credits: workspace.credits,
        socialAccountsCount: socialAccounts.length,
        contentCount: Object.values(contentStats).reduce((a, b) => a + b, 0),
        scheduledCount: contentStats['scheduled'] || 0
      };
    });
  }
}

export const workspaceService = new WorkspaceService();
