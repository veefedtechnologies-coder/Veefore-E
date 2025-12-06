import { BaseRepository, PaginationOptions } from './BaseRepository';
import { WorkspaceMemberModel, IWorkspaceMember } from '../models/Workspace/WorkspaceMember';

export class WorkspaceMemberRepository extends BaseRepository<IWorkspaceMember> {
  constructor() {
    super(WorkspaceMemberModel, 'WorkspaceMember');
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findByUserId(userId: string, options?: PaginationOptions) {
    return this.findMany({ userId }, options);
  }

  async findByWorkspaceAndUser(workspaceId: string, userId: string): Promise<IWorkspaceMember | null> {
    return this.findOne({ workspaceId, userId });
  }

  async findByRole(role: 'owner' | 'admin' | 'editor' | 'viewer', options?: PaginationOptions) {
    return this.findMany({ role }, options);
  }

  async updateRole(memberId: string, role: 'owner' | 'admin' | 'editor' | 'viewer'): Promise<IWorkspaceMember | null> {
    return this.updateById(memberId, { role, updatedAt: new Date() });
  }

  async deactivate(memberId: string): Promise<IWorkspaceMember | null> {
    return this.updateById(memberId, { status: 'inactive', updatedAt: new Date() });
  }
}

export const workspaceMemberRepository = new WorkspaceMemberRepository();
