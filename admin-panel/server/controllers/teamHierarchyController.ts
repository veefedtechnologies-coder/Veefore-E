import { Request, Response } from 'express';
import TeamHierarchy from '../models/TeamHierarchy';
import Admin from '../models/Admin';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';
import { validatePagination, validateSearch } from '../middleware/validation';

export class TeamHierarchyController {
  // Get all teams with hierarchy
  static async getTeams(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'level',
        sortOrder = 'asc',
        q,
        level,
        department,
        includeInactive = false
      } = req.query;

      const query: any = {};
      
      // Search functionality
      if (q) {
        query.$or = [
          { name: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { 'metadata.department': { $regex: q, $options: 'i' } }
        ];
      }

      // Filter by level
      if (level) {
        query.level = level;
      }

      // Filter by department
      if (department) {
        query['metadata.department'] = department;
      }

      // Include inactive teams
      if (!includeInactive) {
        query['settings.isActive'] = true;
      }

      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

      const teams = await TeamHierarchy.find(query)
        .populate('teamLead', 'firstName lastName email role level')
        .populate('parentTeam', 'name level')
        .populate('members', 'firstName lastName email role level')
        .sort(sort)
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await TeamHierarchy.countDocuments(query);

      res.json({
        success: true,
        data: {
          teams,
          pagination: {
            current: Number(page),
            pages: Math.ceil(total / Number(limit)),
            total
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

  // Get team hierarchy tree
  static async getHierarchyTree(req: AuthRequest, res: Response) {
    try {
      const tree = await TeamHierarchy.getHierarchyTree();
      
      res.json({
        success: true,
        data: { tree }
      });
    } catch (error) {
      console.error('Get hierarchy tree error:', error);
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
      
      const team = await TeamHierarchy.findById(id)
        .populate('teamLead', 'firstName lastName email role level')
        .populate('parentTeam', 'name level')
        .populate('members', 'firstName lastName email role level')
        .populate('childTeams', 'name level teamLead members');

      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Get team path
      const teamPath = await team.getTeamPath();

      res.json({
        success: true,
        data: {
          team: {
            ...team.toObject(),
            teamPath
          }
        }
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
        level,
        parentTeam,
        teamLead,
        members = [],
        permissions = {},
        settings = {},
        metadata = {}
      } = req.body;

      // Check if team name already exists
      const existingTeam = await TeamHierarchy.findOne({ name });
      if (existingTeam) {
        return res.status(400).json({
          success: false,
          message: 'Team with this name already exists'
        });
      }

      // Validate team lead exists and is active
      const lead = await Admin.findById(teamLead);
      if (!lead || !lead.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Invalid team lead'
        });
      }

      // Validate parent team if provided
      if (parentTeam) {
        const parent = await TeamHierarchy.findById(parentTeam);
        if (!parent) {
          return res.status(400).json({
            success: false,
            message: 'Parent team not found'
          });
        }

        // Check if parent can have sub-teams
        if (!parent.permissions.canCreateSubTeams) {
          return res.status(400).json({
            success: false,
            message: 'Parent team cannot have sub-teams'
          });
        }

        // Check level constraints
        if (level <= parent.level) {
          return res.status(400).json({
            success: false,
            message: 'Sub-team level must be higher than parent team level'
          });
        }
      }

      // Validate members
      const memberIds = await Admin.find({ _id: { $in: members }, isActive: true });
      if (memberIds.length !== members.length) {
        return res.status(400).json({
          success: false,
          message: 'Some members are invalid or inactive'
        });
      }

      // Create team
      const team = new TeamHierarchy({
        name,
        description,
        level,
        parentTeam: parentTeam || null,
        teamLead,
        members,
        permissions: {
          canCreateSubTeams: false,
          canAssignMembers: true,
          canModifyPermissions: false,
          canViewAllSubTeams: true,
          canApproveActions: false,
          maxSubTeamLevel: 3,
          ...permissions
        },
        settings: {
          isActive: true,
          allowSelfAssignment: false,
          requireApprovalForJoining: true,
          maxMembers: 50,
          autoEscalateAfter: 24,
          ...settings
        },
        metadata: {
          color: '#3B82F6',
          icon: 'users',
          tags: [],
          department: 'General',
          ...metadata
        },
        createdBy: req.admin._id
      });

      await team.save();

      // Update parent team's child teams
      if (parentTeam) {
        await TeamHierarchy.findByIdAndUpdate(parentTeam, {
          $addToSet: { childTeams: team._id }
        });
      }

      // Log team creation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'team_create',
        resource: 'team_hierarchy',
        resourceId: team._id.toString(),
        details: {
          teamName: team.name,
          teamLevel: team.level,
          parentTeam: team.parentTeam,
          teamLead: team.teamLead,
          memberCount: team.members.length
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
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

      const team = await TeamHierarchy.findById(id);
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
        level: team.level,
        parentTeam: team.parentTeam,
        teamLead: team.teamLead,
        members: team.members,
        permissions: team.permissions,
        settings: team.settings
      };

      // Update team
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined) {
          team[key] = updateData[key];
        }
      });

      await team.save();

      // Log team update
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'team_update',
        resource: 'team_hierarchy',
        resourceId: team._id.toString(),
        details: {
          oldData,
          newData: {
            name: team.name,
            description: team.description,
            level: team.level,
            parentTeam: team.parentTeam,
            teamLead: team.teamLead,
            members: team.members,
            permissions: team.permissions,
            settings: team.settings
          }
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
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

  // Delete team
  static async deleteTeam(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const team = await TeamHierarchy.findById(id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Check if team has child teams
      if (team.childTeams.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete team with sub-teams. Please delete sub-teams first.'
        });
      }

      // Check if team has members
      if (team.members.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete team with members. Please remove all members first.'
        });
      }

      await TeamHierarchy.findByIdAndDelete(id);

      // Update parent team's child teams
      if (team.parentTeam) {
        await TeamHierarchy.findByIdAndUpdate(team.parentTeam, {
          $pull: { childTeams: team._id }
        });
      }

      // Log team deletion
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'team_delete',
        resource: 'team_hierarchy',
        resourceId: team._id.toString(),
        details: {
          teamName: team.name,
          teamLevel: team.level
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'critical',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Team deleted successfully'
      });
    } catch (error) {
      console.error('Delete team error:', error);
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
      const { memberId } = req.body;

      const team = await TeamHierarchy.findById(id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      const member = await Admin.findById(memberId);
      if (!member || !member.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Invalid member'
        });
      }

      // Check if member is already in team
      if (team.members.includes(memberId)) {
        return res.status(400).json({
          success: false,
          message: 'Member is already in this team'
        });
      }

      // Check team capacity
      if (team.members.length >= team.settings.maxMembers) {
        return res.status(400).json({
          success: false,
          message: 'Team has reached maximum member capacity'
        });
      }

      team.members.push(memberId);
      await team.save();

      // Log member addition
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'team_add_member',
        resource: 'team_hierarchy',
        resourceId: team._id.toString(),
        details: {
          teamName: team.name,
          memberId,
          memberEmail: member.email
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium'
      });

      res.json({
        success: true,
        message: 'Member added to team successfully'
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
      const { id } = req.params;
      const { memberId } = req.body;

      const team = await TeamHierarchy.findById(id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      // Check if member is in team
      if (!team.members.includes(memberId)) {
        return res.status(400).json({
          success: false,
          message: 'Member is not in this team'
        });
      }

      // Check if trying to remove team lead
      if (team.teamLead.toString() === memberId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot remove team lead. Assign a new team lead first.'
        });
      }

      team.members = team.members.filter(id => id.toString() !== memberId);
      await team.save();

      // Log member removal
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'team_remove_member',
        resource: 'team_hierarchy',
        resourceId: team._id.toString(),
        details: {
          teamName: team.name,
          memberId
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium'
      });

      res.json({
        success: true,
        message: 'Member removed from team successfully'
      });
    } catch (error) {
      console.error('Remove member error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Change team lead
  static async changeTeamLead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { newLeadId } = req.body;

      const team = await TeamHierarchy.findById(id);
      if (!team) {
        return res.status(404).json({
          success: false,
          message: 'Team not found'
        });
      }

      const newLead = await Admin.findById(newLeadId);
      if (!newLead || !newLead.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Invalid team lead'
        });
      }

      // Check if new lead is a member of the team
      if (!team.members.includes(newLeadId)) {
        return res.status(400).json({
          success: false,
          message: 'New team lead must be a member of the team'
        });
      }

      const oldLeadId = team.teamLead;
      team.teamLead = newLeadId;
      await team.save();

      // Log team lead change
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'team_change_lead',
        resource: 'team_hierarchy',
        resourceId: team._id.toString(),
        details: {
          teamName: team.name,
          oldLeadId,
          newLeadId,
          newLeadEmail: newLead.email
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: true
      });

      res.json({
        success: true,
        message: 'Team lead changed successfully'
      });
    } catch (error) {
      console.error('Change team lead error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get team statistics
  static async getTeamStats(req: AuthRequest, res: Response) {
    try {
      const stats = await TeamHierarchy.aggregate([
        {
          $group: {
            _id: null,
            totalTeams: { $sum: 1 },
            activeTeams: {
              $sum: { $cond: ['$settings.isActive', 1, 0] }
            },
            totalMembers: { $sum: { $size: '$members' } },
            avgMembersPerTeam: { $avg: { $size: '$members' } }
          }
        }
      ]);

      const levelStats = await TeamHierarchy.aggregate([
        {
          $group: {
            _id: '$level',
            count: { $sum: 1 },
            avgMembers: { $avg: { $size: '$members' } }
          }
        },
        { $sort: { _id: 1 } }
      ]);

      const departmentStats = await TeamHierarchy.aggregate([
        {
          $group: {
            _id: '$metadata.department',
            count: { $sum: 1 },
            totalMembers: { $sum: { $size: '$members' } }
          }
        },
        { $sort: { count: -1 } }
      ]);

      res.json({
        success: true,
        data: {
          overview: stats[0] || {
            totalTeams: 0,
            activeTeams: 0,
            totalMembers: 0,
            avgMembersPerTeam: 0
          },
          levelStats,
          departmentStats
        }
      });
    } catch (error) {
      console.error('Get team stats error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}
