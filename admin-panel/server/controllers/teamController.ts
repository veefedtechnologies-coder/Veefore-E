import { Request, Response } from 'express';
import Team from '../models/Team';
import Admin from '../models/Admin';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';

export class TeamController {
  // Get all teams with filtering
  static async getTeams(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        q,
        status,
        level,
        parentTeam,
        teamLead
      } = req.query;

      const query: any = {};
      
      // Search functionality
      if (q) {
        query.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { teamCode: { $regex: q, $options: 'i' } }
        ];
      }

      // Status filter
      if (status) {
        query.status = status;
      }

      // Level filter
      if (level) {
        query.level = Number(level);
      }

      // Parent team filter
      if (parentTeam) {
        query.parentTeam = parentTeam;
      }

      // Team lead filter
      if (teamLead) {
        query['teamLead.adminId'] = teamLead;
      }

      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

      const teams = await Team.find(query)
        .populate('teamLead.adminId', 'firstName lastName email')
        .populate('deputyLeads.adminId', 'firstName lastName email')
        .populate('members.adminId', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName email')
        .populate('lastModifiedBy', 'firstName lastName email')
        .sort(sort)
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await Team.countDocuments(query);

      // Get team statistics
      const stats = await Team.aggregate([
        {
          $group: {
            _id: null,
            totalTeams: { $sum: 1 },
            activeTeams: {
              $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
            },
            totalMembers: { $sum: { $size: '$members' } },
            avgTeamSize: { $avg: { $size: '$members' } }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          teams,
          pagination: {
            current: Number(page),
            pages: Math.ceil(total / Number(limit)),
            total
          },
          stats: stats[0] || {
            totalTeams: 0,
            activeTeams: 0,
            totalMembers: 0,
            avgTeamSize: 0
          }
        }
      });
    } catch (error) {
      console.error('Get teams error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get team by ID
  static async getTeamById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const team = await Team.findById(id)
        .populate('teamLead.adminId', 'firstName lastName email')
        .populate('deputyLeads.adminId', 'firstName lastName email')
        .populate('members.adminId', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName email')
        .populate('lastModifiedBy', 'firstName lastName email');
      
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      res.json({
        success: true,
        data: { team }
      });
    } catch (error) {
      console.error('Get team by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Create new team
  static async createTeam(req: AuthRequest, res: Response) {
    try {
      const {
        name,
        description,
        parentTeam,
        teamLead,
        settings,
        permissions,
        communication,
        resources
      } = req.body;

      // Check if team lead exists
      const lead = await Admin.findById(teamLead);
      if (!lead) {
        return res.status(400).json({
          success: false,
          message: 'Team lead not found'
        });
      }

      // Calculate level
      let level = 1;
      if (parentTeam) {
        const parent = await Team.findById(parentTeam);
        if (parent) {
          level = parent.level + 1;
        }
      }

      // Create team
      const team = new Team({
        name,
        description,
        parentTeam,
        level,
        teamLead: {
          adminId: teamLead,
          name: `${lead.firstName} ${lead.lastName}`,
          email: lead.email,
          assignedAt: new Date()
        },
        settings: {
          maxMembers: 50,
          allowSelfJoin: false,
          requireApproval: true,
          defaultRole: 'member',
          workingHours: {
            timezone: 'UTC',
            startTime: '09:00',
            endTime: '17:00',
            workingDays: [1, 2, 3, 4, 5] // Monday to Friday
          },
          notifications: {
            email: true,
            inApp: true,
            slack: false,
            webhook: ''
          },
          ...settings
        },
        permissions: {
          canCreateSubTeams: false,
          canManageMembers: true,
          canAssignRoles: false,
          canViewAnalytics: true,
          canManageSettings: false,
          canAccessReports: true,
          moduleAccess: ['dashboard', 'users', 'tickets'],
          customPermissions: {},
          ...permissions
        },
        communication: {
          emailAlias: `${name.toLowerCase().replace(/\s+/g, '')}@veefore.com`,
          meetingSchedule: {
            frequency: 'weekly',
            day: 'Monday',
            time: '10:00',
            duration: 60
          },
          ...communication
        },
        resources: {
          budget: 0,
          currency: 'USD',
          tools: [],
          training: [],
          ...resources
        },
        createdBy: req.admin._id,
        lastModifiedBy: req.admin._id
      });

      await team.save();

      // Log team creation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'team_create',
        resource: 'team',
        resourceId: team._id.toString(),
        details: {
          teamName: team.name,
          teamCode: team.teamCode,
          teamLead: team.teamLead.name,
          level: team.level
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: false
      });

      res.status(201).json({
        success: true,
        message: 'Team created successfully',
        data: { team }
      });
    } catch (error) {
      console.error('Create team error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update team
  static async updateTeam(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const team = await Team.findById(id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Store old data for audit
      const oldData = {
        name: team.name,
        description: team.description,
        status: team.status,
        settings: team.settings
      };

      // Update team
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== '_id') {
          team[key] = updateData[key];
        }
      });

      team.lastModifiedBy = req.admin._id;
      await team.save();

      // Log update
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'team_update',
        resource: 'team',
        resourceId: team._id.toString(),
        details: {
          teamName: team.name,
          oldData,
          newData: updateData
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Team updated successfully',
        data: { team }
      });
    } catch (error) {
      console.error('Update team error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Add member to team
  static async addMember(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { adminId, role, level, permissions = [] } = req.body;

      const team = await Team.findById(id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Check if admin exists
      const admin = await Admin.findById(adminId);
      if (!admin) {
        return res.status(400).json({
          success: false,
          message: 'Admin not found'
        });
      }

      // Check if already a member
      const existingMember = team.members.find(m => m.adminId === adminId);
      if (existingMember) {
        return res.status(400).json({
          success: false,
          message: 'Admin is already a member of this team'
        });
      }

      // Add member
      await team.addMember({
        adminId,
        name: `${admin.firstName} ${admin.lastName}`,
        email: admin.email,
        role,
        level,
        permissions
      });

      // Log member addition
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'team_add_member',
        resource: 'team',
        resourceId: team._id.toString(),
        details: {
          teamName: team.name,
          memberName: `${admin.firstName} ${admin.lastName}`,
          memberEmail: admin.email,
          role,
          level
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Member added successfully',
        data: { team }
      });
    } catch (error) {
      console.error('Add member error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Remove member from team
  static async removeMember(req: AuthRequest, res: Response) {
    try {
      const { id, memberId } = req.params;

      const team = await Team.findById(id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Find member
      const member = team.members.find(m => m.adminId === memberId);
      if (!member) {
        return res.status(404).json({
          success: false,
          message: 'Member not found in team'
        });
      }

      // Remove member
      await team.removeMember(memberId);

      // Log member removal
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'team_remove_member',
        resource: 'team',
        resourceId: team._id.toString(),
        details: {
          teamName: team.name,
          memberName: member.name,
          memberEmail: member.email
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Member removed successfully',
        data: { team }
      });
    } catch (error) {
      console.error('Remove member error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update member status
  static async updateMemberStatus(req: AuthRequest, res: Response) {
    try {
      const { id, memberId } = req.params;
      const { status } = req.body;

      const team = await Team.findById(id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Update member status
      await team.updateMemberStatus(memberId, status);

      // Log status update
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'team_update_member_status',
        resource: 'team',
        resourceId: team._id.toString(),
        details: {
          teamName: team.name,
          memberId,
          status
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Member status updated successfully',
        data: { team }
      });
    } catch (error) {
      console.error('Update member status error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get team hierarchy tree
  static async getTeamTree(req: AuthRequest, res: Response) {
    try {
      const { rootTeamId } = req.query;

      const tree = await Team.getTeamTree(rootTeamId as string);

      res.json({
        success: true,
        data: { tree }
      });
    } catch (error) {
      console.error('Get team tree error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get team performance stats
  static async getTeamPerformance(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { period = '30d' } = req.query;

      const team = await Team.findById(id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      const stats = team.getPerformanceStats(period as string);

      res.json({
        success: true,
        data: { stats }
      });
    } catch (error) {
      console.error('Get team performance error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Archive team
  static async archiveTeam(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const team = await Team.findById(id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      team.status = 'archived';
      team.lastModifiedBy = req.admin._id;
      await team.save();

      // Log team archival
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'team_archive',
        resource: 'team',
        resourceId: team._id.toString(),
        details: {
          teamName: team.name,
          teamCode: team.teamCode
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Team archived successfully',
        data: { team }
      });
    } catch (error) {
      console.error('Archive team error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Bulk operations
  static async bulkUpdateTeams(req: AuthRequest, res: Response) {
    try {
      const { teamIds, operation, updates } = req.body;

      if (!teamIds || !Array.isArray(teamIds) || teamIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Team IDs are required'
        });
      }

      let result;
      switch (operation) {
        case 'archive':
          result = await Team.updateMany(
            { _id: { $in: teamIds } },
            { 
              $set: { 
                status: 'archived',
                lastModifiedBy: req.admin._id
              } 
            }
          );
          break;
        case 'activate':
          result = await Team.updateMany(
            { _id: { $in: teamIds } },
            { 
              $set: { 
                status: 'active',
                lastModifiedBy: req.admin._id
              } 
            }
          );
          break;
        case 'suspend':
          result = await Team.updateMany(
            { _id: { $in: teamIds } },
            { 
              $set: { 
                status: 'suspended',
                lastModifiedBy: req.admin._id
              } 
            }
          );
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Invalid operation'
          });
      }

      // Log bulk operation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: `team_bulk_${operation}`,
        resource: 'team',
        resourceId: 'bulk',
        details: {
          teamIds,
          operation,
          updates,
          affectedCount: result.modifiedCount
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: false
      });

      res.json({
        success: true,
        message: `Bulk ${operation} completed successfully`,
        data: {
          affectedCount: result.modifiedCount,
          totalRequested: teamIds.length
        }
      });
    } catch (error) {
      console.error('Bulk update teams error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
