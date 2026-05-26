import { Request, Response, NextFunction } from 'express';
import { validateFeatureAccess, calculateCreditDeduction, hasEnoughCredits } from '../subscription-config';
import { storage } from '../storage';

// Feature access middleware
export function requireFeatureAccess(featureId: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      if (!user) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          featureId,
          redirectTo: '/auth/login'
        });
      }

      const userPlan = user.plan || 'free';
      const accessResult = validateFeatureAccess(userPlan, featureId);
      
      if (!accessResult.allowed) {
        return res.status(403).json({
          error: 'Feature access denied',
          featureId,
          currentPlan: userPlan,
          upgrade: accessResult.upgrade,
          message: `This feature requires ${accessResult.upgrade} plan or higher`,
          redirectTo: '/subscription'
        });
      }

      // Check feature limits if applicable
      if (accessResult.limit) {
        const usage = await storage.getFeatureUsage(user.id, featureId);
        if (usage && usage.usageCount >= accessResult.limit) {
          return res.status(403).json({
            error: 'Feature limit exceeded',
            featureId,
            currentUsage: usage.usageCount,
            limit: accessResult.limit,
            message: `You've reached your monthly limit of ${accessResult.limit} for this feature`,
            redirectTo: '/subscription'
          });
        }
      }

      // Check credit requirements
      const creditCost = calculateCreditDeduction(featureId);
      if (creditCost > 0) {
        const userCredits = user.credits || 0;
        if (!hasEnoughCredits(userCredits, featureId)) {
          return res.status(403).json({
            error: 'Insufficient credits',
            featureId,
            required: creditCost,
            available: userCredits,
            message: `This feature requires ${creditCost} credits. You have ${userCredits} credits available.`,
            redirectTo: '/subscription/credits'
          });
        }
      }

      // Add feature info to request for logging
      req.featureAccess = {
        featureId,
        creditCost,
        userPlan,
        accessLevel: accessResult.allowed ? 'full' : 'limited'
      };

      next();
    } catch (error) {
      console.error(`[FEATURE ACCESS] Error checking access for ${featureId}:`, error);
      res.status(500).json({ 
        error: 'Internal server error',
        featureId
      });
    }
  };
}

// Track feature usage after successful request
export function trackFeatureUsage(featureId: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;
    
    res.send = function(body) {
      // Track usage only on successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const user = req.user;
        const featureAccess = req.featureAccess;
        
        if (user && featureAccess) {
          // Track usage asynchronously
          setImmediate(async () => {
            try {
              await storage.trackFeatureUsage(user.id, featureId);
              
              // Deduct credits if required
              if (featureAccess.creditCost > 0) {
                const newCredits = (user.credits || 0) - featureAccess.creditCost;
                await storage.updateUserCredits(user.id, newCredits);
                
                // Log credit transaction
                await storage.createCreditTransaction({
                  userId: user.id,
                  type: 'used',
                  amount: -featureAccess.creditCost,
                  description: `Used ${featureAccess.creditCost} credits for ${featureId}`,
                  referenceId: featureId
                });
              }
            } catch (error) {
              console.error(`[FEATURE TRACKING] Error tracking usage for ${featureId}:`, error);
            }
          });
        }
      }
      
      return originalSend.call(this, body);
    };
    
    next();
  };
}

// Combined middleware for feature access + tracking
export function featureGuard(featureId: string) {
  return [
    requireFeatureAccess(featureId),
    trackFeatureUsage(featureId)
  ];
}

// Extend Request interface to include feature access info
declare global {
  namespace Express {
    interface Request {
      featureAccess?: {
        featureId: string;
        creditCost: number;
        userPlan: string;
        accessLevel: string;
      };
    }
  }
}