import { Request, Response, NextFunction } from 'express';
import { SubscriptionService } from './subscription-service';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export interface FeatureRequest extends Request {
  requiredFeature?: keyof import('./subscription-service').PlanLimits['features'];
  requiredCredits?: number;
}

// Middleware to check if user has access to a specific feature
export const requireFeature = (feature: keyof import('./subscription-service').PlanLimits['features']) => {
  return async (req: FeatureRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasAccess = await SubscriptionService.checkFeatureAccess(req.user.id, feature);
      
      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Feature not available in your plan',
          feature: feature,
          upgradeRequired: true
        });
      }

      req.requiredFeature = feature;
      next();
    } catch (error) {
      console.error('[SUBSCRIPTION MIDDLEWARE] Feature check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// Middleware to check if user has sufficient credits
export const requireCredits = (credits: number) => {
  return async (req: FeatureRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const hasCredits = await SubscriptionService.checkCreditsAvailable(req.user.id, credits);
      
      if (!hasCredits) {
        return res.status(403).json({ 
          error: 'Insufficient credits',
          requiredCredits: credits,
          upgradeRequired: true
        });
      }

      req.requiredCredits = credits;
      next();
    } catch (error) {
      console.error('[SUBSCRIPTION MIDDLEWARE] Credits check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// Middleware to check workspace limit
export const checkWorkspaceLimit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const canCreate = await SubscriptionService.checkWorkspaceLimit(req.user.id);
    
    if (!canCreate) {
      return res.status(403).json({ 
        error: 'Workspace limit reached for your plan',
        upgradeRequired: true
      });
    }

    next();
  } catch (error) {
    console.error('[SUBSCRIPTION MIDDLEWARE] Workspace limit check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Middleware to check social account limit
export const checkSocialAccountLimit = (workspaceIdParam: string = 'workspaceId') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const workspaceId = req.params[workspaceIdParam] || req.body[workspaceIdParam];
      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace ID required' });
      }

      const canCreate = await SubscriptionService.checkSocialAccountLimit(req.user.id, workspaceId);
      
      if (!canCreate) {
        return res.status(403).json({ 
          error: 'Social account limit reached for your plan',
          upgradeRequired: true
        });
      }

      next();
    } catch (error) {
      console.error('[SUBSCRIPTION MIDDLEWARE] Social account limit check error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};

// Middleware to deduct credits after successful operation
export const deductCredits = (credits: number, source: string, description: string) => {
  return async (req: FeatureRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const success = await SubscriptionService.deductCreditsWithLog(
        req.user.id, 
        credits, 
        source, 
        description
      );
      
      if (!success) {
        return res.status(403).json({ 
          error: 'Insufficient credits for this operation',
          requiredCredits: credits,
          upgradeRequired: true
        });
      }

      next();
    } catch (error) {
      console.error('[SUBSCRIPTION MIDDLEWARE] Credit deduction error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
};