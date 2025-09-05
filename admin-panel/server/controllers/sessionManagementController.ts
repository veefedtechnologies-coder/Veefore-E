import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { SessionManagementService } from '../services/sessionManagementService';

export class SessionManagementController {
  private sessionService: SessionManagementService;

  constructor() {
    this.sessionService = SessionManagementService.getInstance();
  }

  // Get admin sessions
  static async getAdminSessions(req: AuthRequest, res: Response) {
    try {
      const { adminId } = req.params;
      const { limit = 10, activeOnly = false } = req.query;

      let sessions;
      if (activeOnly === 'true') {
        sessions = await SessionManagementService.getInstance().getActiveSessions(adminId);
      } else {
        sessions = await SessionManagementService.getInstance().getAdminSessions(
          adminId,
          parseInt(limit as string)
        );
      }

      res.json({
        success: true,
        data: sessions
      });
    } catch (error) {
      console.error('Error fetching admin sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sessions'
      });
    }
  }

  // Get current user sessions
  static async getMySessions(req: AuthRequest, res: Response) {
    try {
      const { limit = 10, activeOnly = false } = req.query;
      const adminId = req.admin!._id;

      let sessions;
      if (activeOnly === 'true') {
        sessions = await SessionManagementService.getInstance().getActiveSessions(adminId);
      } else {
        sessions = await SessionManagementService.getInstance().getAdminSessions(
          adminId,
          parseInt(limit as string)
        );
      }

      res.json({
        success: true,
        data: sessions
      });
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sessions'
      });
    }
  }

  // Terminate session
  static async terminateSession(req: AuthRequest, res: Response) {
    try {
      const { sessionToken } = req.params;

      const success = await SessionManagementService.getInstance().terminateSession(sessionToken);

      if (success) {
        res.json({
          success: true,
          message: 'Session terminated successfully'
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }
    } catch (error) {
      console.error('Error terminating session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to terminate session'
      });
    }
  }

  // Terminate all sessions for admin
  static async terminateAllSessions(req: AuthRequest, res: Response) {
    try {
      const { adminId } = req.params;
      const { excludeCurrent = false } = req.body;

      const excludeSessionToken = excludeCurrent ? req.headers.authorization?.replace('Bearer ', '') : undefined;
      const terminatedCount = await SessionManagementService.getInstance().terminateAllSessions(
        adminId,
        excludeSessionToken
      );

      res.json({
        success: true,
        message: `${terminatedCount} sessions terminated successfully`,
        data: { terminatedCount }
      });
    } catch (error) {
      console.error('Error terminating all sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to terminate sessions'
      });
    }
  }

  // Terminate my sessions
  static async terminateMySessions(req: AuthRequest, res: Response) {
    try {
      const { excludeCurrent = false } = req.body;
      const adminId = req.admin!._id;

      const excludeSessionToken = excludeCurrent ? req.headers.authorization?.replace('Bearer ', '') : undefined;
      const terminatedCount = await SessionManagementService.getInstance().terminateAllSessions(
        adminId,
        excludeSessionToken
      );

      res.json({
        success: true,
        message: `${terminatedCount} sessions terminated successfully`,
        data: { terminatedCount }
      });
    } catch (error) {
      console.error('Error terminating user sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to terminate sessions'
      });
    }
  }

  // Terminate sessions by criteria
  static async terminateSessionsByCriteria(req: AuthRequest, res: Response) {
    try {
      const { criteria } = req.body;

      const terminatedCount = await SessionManagementService.getInstance().terminateSessionsByCriteria(criteria);

      res.json({
        success: true,
        message: `${terminatedCount} sessions terminated successfully`,
        data: { terminatedCount }
      });
    } catch (error) {
      console.error('Error terminating sessions by criteria:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to terminate sessions'
      });
    }
  }

  // Get session statistics
  static async getSessionStats(req: AuthRequest, res: Response) {
    try {
      const { adminId } = req.query;

      const stats = await SessionManagementService.getInstance().getSessionStats(
        adminId as string
      );

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Error getting session statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get session statistics'
      });
    }
  }

  // Update session activity
  static async updateSessionActivity(req: AuthRequest, res: Response) {
    try {
      const { action, page } = req.body;
      const sessionToken = req.headers.authorization?.replace('Bearer ', '');

      if (sessionToken) {
        await SessionManagementService.getInstance().updateSessionActivity(
          sessionToken,
          action,
          page
        );
      }

      res.json({
        success: true,
        message: 'Session activity updated'
      });
    } catch (error) {
      console.error('Error updating session activity:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update session activity'
      });
    }
  }

  // Cleanup expired sessions
  static async cleanupExpiredSessions(req: AuthRequest, res: Response) {
    try {
      const cleanedCount = await SessionManagementService.getInstance().cleanupExpiredSessions();

      res.json({
        success: true,
        message: `${cleanedCount} expired sessions cleaned up`,
        data: { cleanedCount }
      });
    } catch (error) {
      console.error('Error cleaning up expired sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cleanup expired sessions'
      });
    }
  }

  // Get session details
  static async getSessionDetails(req: AuthRequest, res: Response) {
    try {
      const { sessionToken } = req.params;

      const session = await SessionManagementService.getInstance().validateSession(sessionToken);

      if (session) {
        res.json({
          success: true,
          data: session
        });
      } else {
        res.status(404).json({
          success: false,
          message: 'Session not found or expired'
        });
      }
    } catch (error) {
      console.error('Error getting session details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get session details'
      });
    }
  }
}
