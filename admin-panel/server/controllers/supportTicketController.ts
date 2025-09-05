import { Request, Response } from 'express';
import SupportTicket from '../models/SupportTicket';
import User from '../models/User';
import Admin from '../models/Admin';
import AuditLog from '../models/AuditLog';
import { AuthRequest } from '../middleware/auth';

export class SupportTicketController {
  // Get all tickets with filtering
  static async getTickets(req: AuthRequest, res: Response) {
    try {
      const {
        page = 1,
        limit = 10,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        q,
        status,
        priority,
        category,
        assignedTo,
        team,
        slaBreached
      } = req.query;

      const query: any = {};
      
      // Search functionality
      if (q) {
        query.$or = [
          { ticketId: { $regex: q, $options: 'i' } },
          { subject: { $regex: q, $options: 'i' } },
          { description: { $regex: q, $options: 'i' } },
          { userEmail: { $regex: q, $options: 'i' } },
          { tags: { $in: [new RegExp(q, 'i')] } }
        ];
      }

      // Status filter
      if (status) {
        query.status = status;
      }

      // Priority filter
      if (priority) {
        query.priority = priority;
      }

      // Category filter
      if (category) {
        query.category = category;
      }

      // Assigned to filter
      if (assignedTo) {
        query.assignedTo = assignedTo;
      }

      // Team filter
      if (team) {
        query.assignedTeam = team;
      }

      // SLA breached filter
      if (slaBreached === 'true') {
        query['sla.breached'] = true;
      }

      const sort: any = {};
      sort[sortBy as string] = sortOrder === 'asc' ? 1 : -1;

      const tickets = await SupportTicket.find(query)
        .populate('assignedTo', 'firstName lastName email')
        .populate('escalatedTo', 'firstName lastName email')
        .populate('userId', 'firstName lastName email')
        .sort(sort)
        .limit(Number(limit) * 1)
        .skip((Number(page) - 1) * Number(limit));

      const total = await SupportTicket.countDocuments(query);

      // Get ticket statistics
      const stats = await SupportTicket.aggregate([
        {
          $group: {
            _id: null,
            totalTickets: { $sum: 1 },
            openTickets: {
              $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] }
            },
            inProgressTickets: {
              $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
            },
            resolvedTickets: {
              $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
            },
            closedTickets: {
              $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] }
            },
            slaBreachedTickets: {
              $sum: { $cond: [{ $eq: ['$sla.breached', true] }, 1, 0] }
            },
            avgResponseTime: { $avg: '$analytics.timeToFirstResponse' },
            avgResolutionTime: { $avg: '$analytics.timeToResolution' },
            avgSatisfaction: { $avg: '$analytics.customerSatisfaction' }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          tickets,
          pagination: {
            current: Number(page),
            pages: Math.ceil(total / Number(limit)),
            total
          },
          stats: stats[0] || {
            totalTickets: 0,
            openTickets: 0,
            inProgressTickets: 0,
            resolvedTickets: 0,
            closedTickets: 0,
            slaBreachedTickets: 0,
            avgResponseTime: 0,
            avgResolutionTime: 0,
            avgSatisfaction: 0
          }
        }
      });
    } catch (error) {
      console.error('Get tickets error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get ticket by ID
  static async getTicketById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const ticket = await SupportTicket.findById(id)
        .populate('assignedTo', 'firstName lastName email')
        .populate('escalatedTo', 'firstName lastName email')
        .populate('userId', 'firstName lastName email subscription')
        .populate('relatedRefund', 'amount status reason')
        .populate('relatedSubscription', 'planName status pricing');
      
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      res.json({
        success: true,
        data: { ticket }
      });
    } catch (error) {
      console.error('Get ticket by ID error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Create ticket from email
  static async createTicketFromEmail(req: Request, res: Response) {
    try {
      const {
        messageId,
        from,
        to,
        subject,
        body,
        attachments = [],
        receivedAt
      } = req.body;

      // Check if ticket already exists for this email
      const existingTicket = await SupportTicket.findOne({
        'emailThread.originalEmail.messageId': messageId
      });

      if (existingTicket) {
        return res.status(400).json({
          success: false,
          message: 'Ticket already exists for this email'
        });
      }

      // Find user by email
      const user = await User.findOne({ email: from });
      
      // AI Analysis (mock implementation)
      const aiAnalysis = await this.performAIAnalysis(subject, body);
      
      // Auto-assignment based on category and priority
      const assignment = await this.autoAssignTicket(aiAnalysis.categoryPrediction, aiAnalysis.priorityPrediction);

      // Create ticket
      const ticket = new SupportTicket({
        subject,
        description: body,
        priority: aiAnalysis.priorityPrediction || 'medium',
        category: aiAnalysis.categoryPrediction || 'general',
        userEmail: from,
        userId: user?._id,
        userName: user ? `${user.firstName} ${user.lastName}` : undefined,
        assignedTo: assignment.assignedTo,
        assignedTeam: assignment.team,
        emailThread: {
          originalEmail: {
            messageId,
            from,
            to,
            subject,
            body,
            attachments,
            receivedAt: new Date(receivedAt)
          },
          replies: []
        },
        aiAnalysis,
        routing: {
          autoAssigned: assignment.autoAssigned,
          assignmentRule: assignment.rule,
          suggestedAssignee: assignment.suggestedAssignee,
          suggestedTeam: assignment.suggestedTeam
        },
        sla: {
          targetResponseTime: this.getTargetResponseTime(aiAnalysis.priorityPrediction),
          targetResolutionTime: this.getTargetResolutionTime(aiAnalysis.priorityPrediction)
        }
      });

      await ticket.save();

      // Send auto-reply if configured
      if (aiAnalysis.autoReplySent && aiAnalysis.autoReplyContent) {
        await this.sendAutoReply(ticket, aiAnalysis.autoReplyContent);
      }

      // Log ticket creation
      await AuditLog.create({
        adminId: 'system',
        adminEmail: 'system@veefore.com',
        action: 'ticket_create_from_email',
        resource: 'support_ticket',
        resourceId: ticket._id.toString(),
        details: {
          ticketId: ticket.ticketId,
          userEmail: from,
          category: ticket.category,
          priority: ticket.priority,
          aiAnalysis: {
            categoryPrediction: aiAnalysis.categoryPrediction,
            priorityPrediction: aiAnalysis.priorityPrediction,
            sentimentScore: aiAnalysis.sentimentScore
          }
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.status(201).json({
        success: true,
        message: 'Ticket created successfully',
        data: { ticket }
      });
    } catch (error) {
      console.error('Create ticket from email error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Update ticket
  static async updateTicket(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const ticket = await SupportTicket.findById(id);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      // Store old status for history
      const oldStatus = ticket.status;

      // Update ticket
      Object.keys(updateData).forEach(key => {
        if (updateData[key] !== undefined && key !== '_id') {
          ticket[key] = updateData[key];
        }
      });

      // Add to status history if status changed
      if (updateData.status && updateData.status !== oldStatus) {
        ticket.statusHistory.push({
          status: updateData.status,
          changedBy: req.admin._id,
          changedAt: new Date(),
          reason: updateData.reason || 'Status updated'
        });
      }

      await ticket.save();

      // Log update
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'ticket_update',
        resource: 'support_ticket',
        resourceId: ticket._id.toString(),
        details: {
          ticketId: ticket.ticketId,
          updatedFields: Object.keys(updateData),
          statusChange: updateData.status !== oldStatus ? {
            from: oldStatus,
            to: updateData.status
          } : undefined
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Ticket updated successfully',
        data: { ticket }
      });
    } catch (error) {
      console.error('Update ticket error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Reply to ticket
  static async replyToTicket(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { 
        message, 
        isInternal = false, 
        sendEmail = true,
        replyAs = 'admin' // 'admin', 'team', or specific email
      } = req.body;

      const ticket = await SupportTicket.findById(id);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      // Determine sender email
      let senderEmail = req.admin.email;
      if (replyAs === 'team') {
        senderEmail = ticket.assignedTeam ? `${ticket.assignedTeam}@veefore.com` : 'support@veefore.com';
      }

      // Add reply to email thread
      const reply = {
        messageId: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        from: senderEmail,
        to: ticket.userEmail,
        subject: `Re: ${ticket.subject}`,
        body: message,
        attachments: [],
        sentAt: new Date(),
        sentBy: req.admin._id,
        isInternal
      };

      ticket.emailThread.replies.push(reply);
      
      // Update analytics
      ticket.analytics.responseCount += 1;
      
      // Update SLA response time if first response
      if (ticket.analytics.responseCount === 1) {
        const responseTime = Math.floor((Date.now() - ticket.createdAt.getTime()) / (1000 * 60));
        ticket.analytics.timeToFirstResponse = responseTime;
        ticket.sla.responseTime = responseTime;
        
        // Check if SLA breached
        if (responseTime > ticket.sla.targetResponseTime) {
          ticket.sla.breached = true;
          ticket.sla.breachReason = 'Response time exceeded target';
        }
      }

      await ticket.save();

      // Send email if requested
      if (sendEmail && !isInternal) {
        await this.sendTicketReply(ticket, reply);
      }

      // Log reply
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'ticket_reply',
        resource: 'support_ticket',
        resourceId: ticket._id.toString(),
        details: {
          ticketId: ticket.ticketId,
          isInternal,
          sendEmail,
          replyAs: senderEmail
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'low',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Reply sent successfully',
        data: { ticket }
      });
    } catch (error) {
      console.error('Reply to ticket error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Escalate ticket
  static async escalateTicket(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason, escalateTo, escalationLevel = 1 } = req.body;

      const ticket = await SupportTicket.findById(id);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      // Update escalation info
      ticket.escalation = {
        isEscalated: true,
        escalatedAt: new Date(),
        escalatedBy: req.admin._id,
        escalatedTo,
        escalationReason: reason,
        escalationLevel
      };

      // Add escalation trigger
      ticket.sla.escalationTriggers.push({
        type: 'manual',
        triggeredAt: new Date(),
        escalatedTo,
        reason
      });

      // Update status if needed
      if (ticket.status !== 'escalated') {
        ticket.statusHistory.push({
          status: 'escalated',
          changedBy: req.admin._id,
          changedAt: new Date(),
          reason: `Escalated: ${reason}`
        });
        ticket.status = 'escalated';
      }

      await ticket.save();

      // Log escalation
      await AuditLog.create({
        adminId: req.admin._id,
        adminEmail: req.admin.email,
        action: 'ticket_escalate',
        resource: 'support_ticket',
        resourceId: ticket._id.toString(),
        details: {
          ticketId: ticket.ticketId,
          reason,
          escalateTo,
          escalationLevel
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'high',
        isSensitive: false
      });

      res.json({
        success: true,
        message: 'Ticket escalated successfully',
        data: { ticket }
      });
    } catch (error) {
      console.error('Escalate ticket error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get AI suggestions
  static async getAISuggestions(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;

      const ticket = await SupportTicket.findById(id);
      if (!ticket) {
        return res.status(404).json({
          success: false,
          message: 'Ticket not found'
        });
      }

      // Generate AI suggestions (mock implementation)
      const suggestions = await this.generateAISuggestions(ticket);

      res.json({
        success: true,
        data: { suggestions }
      });
    } catch (error) {
      console.error('Get AI suggestions error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Get ticket analytics
  static async getTicketAnalytics(req: AuthRequest, res: Response) {
    try {
      const { period = '30d' } = req.query;

      let dateFilter = {};
      const now = new Date();
      
      switch (period) {
        case '7d':
          dateFilter = { $gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) };
          break;
        case '30d':
          dateFilter = { $gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) };
          break;
        case '90d':
          dateFilter = { $gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) };
          break;
        case '1y':
          dateFilter = { $gte: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000) };
          break;
      }

      const stats = await SupportTicket.aggregate([
        {
          $match: {
            createdAt: dateFilter
          }
        },
        {
          $group: {
            _id: null,
            totalTickets: { $sum: 1 },
            openTickets: {
              $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] }
            },
            inProgressTickets: {
              $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
            },
            resolvedTickets: {
              $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
            },
            closedTickets: {
              $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] }
            },
            slaBreachedTickets: {
              $sum: { $cond: [{ $eq: ['$sla.breached', true] }, 1, 0] }
            },
            avgResponseTime: { $avg: '$analytics.timeToFirstResponse' },
            avgResolutionTime: { $avg: '$analytics.timeToResolution' },
            avgSatisfaction: { $avg: '$analytics.customerSatisfaction' }
          }
        }
      ]);

      const categoryBreakdown = await SupportTicket.aggregate([
        {
          $match: {
            createdAt: dateFilter
          }
        },
        {
          $group: {
            _id: '$category',
            count: { $sum: 1 },
            avgResolutionTime: { $avg: '$analytics.timeToResolution' },
            avgSatisfaction: { $avg: '$analytics.customerSatisfaction' }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]);

      const priorityBreakdown = await SupportTicket.aggregate([
        {
          $match: {
            createdAt: dateFilter
          }
        },
        {
          $group: {
            _id: '$priority',
            count: { $sum: 1 },
            avgResolutionTime: { $avg: '$analytics.timeToResolution' },
            slaBreachRate: {
              $avg: { $cond: [{ $eq: ['$sla.breached', true] }, 1, 0] }
            }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          overview: stats[0] || {
            totalTickets: 0,
            openTickets: 0,
            inProgressTickets: 0,
            resolvedTickets: 0,
            closedTickets: 0,
            slaBreachedTickets: 0,
            avgResponseTime: 0,
            avgResolutionTime: 0,
            avgSatisfaction: 0
          },
          categoryBreakdown,
          priorityBreakdown,
          period
        }
      });
    } catch (error) {
      console.error('Get ticket analytics error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Bulk operations
  static async bulkUpdateTickets(req: AuthRequest, res: Response) {
    try {
      const { ticketIds, operation, updates } = req.body;

      if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Ticket IDs are required'
        });
      }

      let result;
      switch (operation) {
        case 'assign':
          result = await SupportTicket.updateMany(
            { _id: { $in: ticketIds } },
            { 
              $set: { 
                assignedTo: updates.assignedTo,
                assignedTeam: updates.assignedTeam,
                status: 'in_progress'
              } 
            }
          );
          break;
        case 'close':
          result = await SupportTicket.updateMany(
            { _id: { $in: ticketIds } },
            { 
              $set: { 
                status: 'closed',
                'analytics.resolutionCount': 1
              } 
            }
          );
          break;
        case 'escalate':
          result = await SupportTicket.updateMany(
            { _id: { $in: ticketIds } },
            { 
              $set: { 
                status: 'escalated',
                'escalation.isEscalated': true,
                'escalation.escalatedAt': new Date(),
                'escalation.escalatedBy': req.admin._id,
                'escalation.escalatedTo': updates.escalatedTo,
                'escalation.escalationReason': updates.reason
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
        action: `ticket_bulk_${operation}`,
        resource: 'support_ticket',
        resourceId: 'bulk',
        details: {
          ticketIds,
          operation,
          updates,
          affectedCount: result.modifiedCount
        },
        ipAddress: req.ip || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        riskLevel: 'medium',
        isSensitive: false
      });

      res.json({
        success: true,
        message: `Bulk ${operation} completed successfully`,
        data: {
          affectedCount: result.modifiedCount,
          totalRequested: ticketIds.length
        }
      });
    } catch (error) {
      console.error('Bulk update tickets error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  // Helper methods
  private static async performAIAnalysis(subject: string, body: string) {
    // Mock AI analysis - in production, this would call actual AI services
    const categories = ['billing', 'technical', 'general', 'refund', 'feature_request'];
    const priorities = ['low', 'medium', 'high', 'urgent'];
    
    // Simple keyword-based analysis
    const text = `${subject} ${body}`.toLowerCase();
    
    let categoryPrediction = 'general';
    if (text.includes('billing') || text.includes('payment') || text.includes('refund')) {
      categoryPrediction = 'billing';
    } else if (text.includes('bug') || text.includes('error') || text.includes('technical')) {
      categoryPrediction = 'technical';
    } else if (text.includes('refund') || text.includes('cancel')) {
      categoryPrediction = 'refund';
    } else if (text.includes('feature') || text.includes('request') || text.includes('suggestion')) {
      categoryPrediction = 'feature_request';
    }

    let priorityPrediction = 'medium';
    if (text.includes('urgent') || text.includes('critical') || text.includes('asap')) {
      priorityPrediction = 'urgent';
    } else if (text.includes('high') || text.includes('important')) {
      priorityPrediction = 'high';
    } else if (text.includes('low') || text.includes('minor')) {
      priorityPrediction = 'low';
    }

    // Sentiment analysis (mock)
    const sentimentScore = text.includes('thank') || text.includes('great') ? 0.5 : 
                          text.includes('angry') || text.includes('frustrated') ? -0.5 : 0;

    // Language detection (mock)
    const language = text.includes('है') || text.includes('कर') ? 'hindi' : 'english';

    // Generate suggested replies
    const suggestedReplies = [
      {
        content: `Thank you for contacting us regarding ${categoryPrediction}. We'll look into this matter and get back to you soon.`,
        confidence: 0.8,
        type: 'greeting' as const
      },
      {
        content: `I understand your concern about ${subject}. Let me help you resolve this issue.`,
        confidence: 0.7,
        type: 'solution' as const
      }
    ];

    return {
      categoryPrediction,
      priorityPrediction,
      sentimentScore,
      language,
      suggestedReplies,
      autoReplySent: priorityPrediction === 'urgent',
      autoReplyContent: suggestedReplies[0].content
    };
  }

  private static async autoAssignTicket(category: string, priority: string) {
    // Mock auto-assignment logic
    const assignmentRules = {
      'billing': { team: 'billing', suggestedAssignee: null },
      'technical': { team: 'technical', suggestedAssignee: null },
      'refund': { team: 'billing', suggestedAssignee: null },
      'general': { team: 'support', suggestedAssignee: null }
    };

    const rule = assignmentRules[category as keyof typeof assignmentRules] || assignmentRules.general;
    
    return {
      autoAssigned: true,
      rule: `category_${category}`,
      team: rule.team,
      suggestedTeam: rule.team,
      suggestedAssignee: rule.suggestedAssignee
    };
  }

  private static getTargetResponseTime(priority: string) {
    const targets = {
      'urgent': 60, // 1 hour
      'high': 240, // 4 hours
      'medium': 1440, // 24 hours
      'low': 2880 // 48 hours
    };
    return targets[priority as keyof typeof targets] || 1440;
  }

  private static getTargetResolutionTime(priority: string) {
    const targets = {
      'urgent': 480, // 8 hours
      'high': 1440, // 24 hours
      'medium': 4320, // 3 days
      'low': 10080 // 7 days
    };
    return targets[priority as keyof typeof targets] || 4320;
  }

  private static async sendAutoReply(ticket: any, content: string) {
    // Mock email sending - in production, this would integrate with email service
    console.log(`Sending auto-reply to ${ticket.userEmail}: ${content}`);
  }

  private static async sendTicketReply(ticket: any, reply: any) {
    // Mock email sending - in production, this would integrate with email service
    console.log(`Sending reply to ${ticket.userEmail}: ${reply.body}`);
  }

  private static async generateAISuggestions(ticket: any) {
    // Mock AI suggestions - in production, this would call AI services
    return {
      suggestedReplies: ticket.aiAnalysis?.suggestedReplies || [],
      suggestedActions: [
        'Assign to billing team',
        'Escalate to senior support',
        'Request more information',
        'Close as resolved'
      ],
      suggestedTags: ['urgent', 'billing', 'escalated'],
      riskAssessment: {
        level: 'medium',
        factors: ['High priority', 'Billing related', 'Customer satisfaction risk']
      }
    };
  }
}
