import { Request, Response, NextFunction } from 'express';
import { AccessControl } from './access-control';
import { storage } from './storage';

export interface AuthenticatedRequest extends Request {
  user?: any;
}

export function requireFeature(feature: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userPlan = req.user.plan || 'free';
      const access = AccessControl.canAccessFeature(userPlan, feature);

      if (!access.allowed) {
        const upgradeMessage = AccessControl.generateUpgradeMessage(userPlan, feature);
        return res.status(403).json({ 
          error: access.reason,
          upgradeMessage,
          feature,
          currentPlan: userPlan,
          requiredForFeature: true
        });
      }

      next();
    } catch (error) {
      console.error('[PLAN ENFORCEMENT] Feature check error:', error);
      res.status(500).json({ error: 'Failed to verify feature access' });
    }
  };
}

export function requireCredits(amount: number) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userCredits = req.user.credits || 0;
      const userPlan = req.user.plan || 'free';
      const access = AccessControl.canUseCredits(userPlan, userCredits, amount);

      if (!access.allowed) {
        return res.status(403).json({ 
          error: access.reason,
          requiredCredits: amount,
          currentCredits: userCredits,
          currentPlan: userPlan
        });
      }

      // Add credit info to request for later deduction
      req.body._creditCost = amount;
      next();
    } catch (error) {
      console.error('[PLAN ENFORCEMENT] Credit check error:', error);
      res.status(500).json({ error: 'Failed to verify credit availability' });
    }
  };
}

export function validateWorkspaceLimit() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userId = req.user.id;
      const userPlan = req.user.plan || 'free';
      
      console.log(`[WORKSPACE LIMIT] Checking limit for user ${userId} on plan ${userPlan}`);
      
      // Get current workspace count
      const workspaces = await storage.getWorkspacesByUserId(userId);
      const currentCount = workspaces.length;
      
      console.log(`[WORKSPACE LIMIT] User has ${currentCount} workspaces`);
      
      const access = AccessControl.canCreateWorkspace(userPlan, currentCount);
      
      console.log(`[WORKSPACE LIMIT] Access check result:`, access);

      if (!access.allowed) {
        const upgradeMessage = AccessControl.generateUpgradeMessage(userPlan, 'workspaces');
        console.log(`[WORKSPACE LIMIT] BLOCKING workspace creation - returning 403`);
        return res.status(403).json({ 
          error: access.reason,
          upgradeMessage,
          currentWorkspaces: currentCount,
          maxWorkspaces: AccessControl.getPlanLimits(userPlan).workspaces,
          currentPlan: userPlan
        });
      }
      
      console.log(`[WORKSPACE LIMIT] Access allowed, proceeding to workspace creation`);

      next();
    } catch (error) {
      console.error('[PLAN ENFORCEMENT] Workspace limit check error:', error);
      res.status(500).json({ error: 'Failed to verify workspace limits' });
    }
  };
}

export function validateSocialAccountLimit(platform: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userId = req.user.id;
      const userPlan = req.user.plan || 'free';
      
      // Count connected accounts for this platform
      const connections = await storage.getSocialConnections(userId);
      const platformConnections = connections.filter((conn: any) => 
        conn.platform?.toLowerCase() === platform.toLowerCase()
      );
      
      const access = AccessControl.canConnectSocialAccount(userPlan, platform, platformConnections.length);

      if (!access.allowed) {
        const upgradeMessage = AccessControl.generateUpgradeMessage(userPlan, 'social_accounts');
        return res.status(403).json({ 
          error: access.reason,
          upgradeMessage,
          currentAccounts: platformConnections.length,
          maxAccounts: AccessControl.getPlanLimits(userPlan).socialAccountsPerPlatform,
          platform,
          currentPlan: userPlan
        });
      }

      next();
    } catch (error) {
      console.error('[PLAN ENFORCEMENT] Social account limit check error:', error);
      res.status(500).json({ error: 'Failed to verify social account limits' });
    }
  };
}

export function validateSchedulingLimit() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userPlan = req.user.plan || 'free';
      const scheduledDate = req.body.scheduledAt ? new Date(req.body.scheduledAt) : new Date();
      
      const access = AccessControl.canScheduleContent(userPlan, scheduledDate);

      if (!access.allowed) {
        const upgradeMessage = AccessControl.generateUpgradeMessage(userPlan, 'scheduling');
        const limits = AccessControl.getPlanLimits(userPlan);
        return res.status(403).json({ 
          error: access.reason,
          upgradeMessage,
          maxSchedulingDays: limits.schedulingDays,
          currentPlan: userPlan
        });
      }

      next();
    } catch (error) {
      console.error('[PLAN ENFORCEMENT] Scheduling limit check error:', error);
      res.status(500).json({ error: 'Failed to verify scheduling limits' });
    }
  };
}

export function addPlanContext() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user) {
        const userPlan = req.user.plan || 'free';
        const limits = AccessControl.getPlanLimits(userPlan);
        
        // Add plan context to request
        req.user.planLimits = limits;
        req.user.canRemoveWatermark = limits.watermarkFree;
        req.user.chromeExtensionLevel = limits.chromeExtension;
        req.user.calendarViewType = limits.calendarView;
      }
      
      next();
    } catch (error) {
      console.error('[PLAN ENFORCEMENT] Plan context error:', error);
      next(); // Continue without plan context
    }
  };
}

export function enforceWatermarkPolicy() {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const userPlan = req.user.plan || 'free';
      const access = AccessControl.canRemoveWatermark(userPlan);

      if (!access.allowed && req.body.removeWatermark) {
        const upgradeMessage = AccessControl.generateUpgradeMessage(userPlan, 'watermark_free');
        return res.status(403).json({ 
          error: access.reason,
          upgradeMessage,
          currentPlan: userPlan
        });
      }

      // Force watermark for free users
      if (!access.allowed) {
        req.body.forceWatermark = true;
        req.body.removeWatermark = false;
      }

      next();
    } catch (error) {
      console.error('[PLAN ENFORCEMENT] Watermark policy error:', error);
      res.status(500).json({ error: 'Failed to enforce watermark policy' });
    }
  };
}

export function enrichResponseWithPlanInfo() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const originalJson = res.json;

    res.json = function(body: any) {
      if (req.user) {
        const userPlan = req.user.plan || 'free';
        const limits = AccessControl.getPlanLimits(userPlan);
        
        // Add plan information to response
        if (typeof body === 'object' && body !== null) {
          body.planInfo = {
            currentPlan: userPlan,
            limits: {
              workspaces: limits.workspaces,
              socialAccountsPerPlatform: limits.socialAccountsPerPlatform,
              monthlyCredits: limits.monthlyCredits,
              schedulingDays: limits.schedulingDays,
              features: limits.features
            },
            capabilities: {
              analyticsAccess: limits.analyticsAccess,
              chromeExtension: limits.chromeExtension,
              watermarkFree: limits.watermarkFree,
              calendarView: limits.calendarView,
              brandVoiceTrainer: limits.brandVoiceTrainer,
              abTesting: limits.abTesting,
              priorityPublishing: limits.priorityPublishing,
              viralContentAdapter: limits.viralContentAdapter,
              trendExplorer: limits.trendExplorer,
              apiAccess: limits.apiAccess,
              whiteLabel: limits.whiteLabel,
              customIntegrations: limits.customIntegrations,
              prioritySupport: limits.prioritySupport,
              accountManager: limits.accountManager
            }
          };
        }
      }

      return originalJson.call(this, body);
    };

    next();
  };
}