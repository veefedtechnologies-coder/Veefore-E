import { BaseRepository, PaginationOptions } from './BaseRepository';
import { TeamInvitationModel, ITeamInvitation } from '../models/Workspace/TeamInvitation';
import { InsertTeamInvitation } from '@shared/schema';

export class TeamInvitationRepository extends BaseRepository<ITeamInvitation> {
  constructor() {
    super(TeamInvitationModel, 'TeamInvitation');
  }

  async createWithDefaults(invitation: InsertTeamInvitation): Promise<ITeamInvitation> {
    const invitationData = {
      ...invitation,
      id: Date.now(),
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    return this.create(invitationData);
  }

  async findByWorkspaceId(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId }, options);
  }

  async findByEmail(email: string, options?: PaginationOptions) {
    return this.findMany({ email: email.toLowerCase() }, options);
  }

  async findByToken(token: string): Promise<ITeamInvitation | null> {
    return this.findOne({ token });
  }

  async findPendingByWorkspace(workspaceId: string, options?: PaginationOptions) {
    return this.findMany({ workspaceId, status: 'pending' }, options);
  }

  async findExpiredInvitations(): Promise<ITeamInvitation[]> {
    return this.findAll({ expiresAt: { $lte: new Date() }, status: 'pending' });
  }

  async markAsAccepted(invitationId: string): Promise<ITeamInvitation | null> {
    return this.updateById(invitationId, { status: 'accepted', acceptedAt: new Date() });
  }

  async deleteExpiredInvitations(): Promise<number> {
    return this.deleteMany({ expiresAt: { $lte: new Date() }, status: 'pending' });
  }
}

export const teamInvitationRepository = new TeamInvitationRepository();
