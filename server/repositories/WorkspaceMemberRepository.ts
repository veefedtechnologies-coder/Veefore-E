import { BaseRepository, PaginationOptions } from './BaseRepository';
import { WorkspaceMemberModel, IWorkspaceMember } from '../models/Workspace/WorkspaceMember';
import { WorkspaceModel } from '../models/Workspace/Workspace';
import { User as UserModel } from '../models/User/User';
import { InsertWorkspaceMember, WorkspaceMember } from '@shared/schema';

export interface MemberWithUser {
  member: IWorkspaceMember;
  user: {
    id: string;
    email: string;
    username: string;
    displayName?: string | null;
    avatar?: string | null;
    firebaseUid?: string;
    credits: number;
    plan: string;
    referralCode?: string | null;
    createdAt: Date;
    updatedAt: Date;
  } | null;
}

export interface OwnerFallbackMember {
  id: number;
  userId: string | number;
  workspaceId: string | number;
  role: string;
  status: string;
  permissions: Record<string, any> | null;
  invitedBy: number | null;
  joinedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    email: string;
    username: string;
    displayName?: string | null;
    avatar?: string | null;
    firebaseUid?: string;
    credits: number;
    plan: string;
    referralCode?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
}

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

  async getMembersWithOwnerFallback(workspaceId: string): Promise<MemberWithUser[]> {
    const members = await this.findByWorkspaceId(workspaceId);
    
    const result: MemberWithUser[] = [];
    for (const member of members.data) {
      const user = await UserModel.findById(member.userId);
      if (user) {
        result.push({
          member,
          user: {
            id: user._id.toString(),
            email: user.email,
            username: user.username,
            displayName: user.displayName || null,
            avatar: user.avatar || null,
            firebaseUid: user.firebaseUid,
            credits: user.credits,
            plan: user.plan,
            referralCode: user.referralCode || null,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
          }
        });
      }
    }
    
    return result;
  }

  async getOwnerAsFallbackMember(workspaceId: string): Promise<OwnerFallbackMember | null> {
    const workspace = await WorkspaceModel.findById(workspaceId);
    if (!workspace) {
      return null;
    }
    
    const owner = await UserModel.findById(workspace.userId);
    if (!owner) {
      return null;
    }
    
    return {
      id: 1,
      userId: workspace.userId as string | number,
      workspaceId: workspaceId,
      role: 'Owner',
      status: 'active',
      permissions: null,
      invitedBy: null,
      joinedAt: workspace.createdAt,
      createdAt: workspace.createdAt,
      updatedAt: workspace.updatedAt,
      user: {
        id: owner._id.toString(),
        email: owner.email,
        username: owner.username,
        displayName: owner.displayName || null,
        avatar: owner.avatar || null,
        firebaseUid: owner.firebaseUid,
        credits: owner.credits,
        plan: owner.plan,
        referralCode: owner.referralCode || null,
        createdAt: owner.createdAt,
        updatedAt: owner.updatedAt
      }
    };
  }

  async createWithDefaults(memberData: InsertWorkspaceMember): Promise<IWorkspaceMember> {
    const data = {
      ...memberData,
      id: Date.now(),
      status: 'active',
      joinedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    return this.create(data);
  }

  async updateByWorkspaceAndUser(
    workspaceId: string, 
    userId: string, 
    updates: Partial<WorkspaceMember>
  ): Promise<IWorkspaceMember | null> {
    const member = await this.findByWorkspaceAndUser(workspaceId, userId);
    
    if (!member) {
      return null;
    }
    
    return this.updateById(member._id.toString(), { ...updates, updatedAt: new Date() });
  }
}

export const workspaceMemberRepository = new WorkspaceMemberRepository();
