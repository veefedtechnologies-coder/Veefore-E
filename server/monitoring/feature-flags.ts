/**
 * P4-5: Feature Flags for Risky Changes
 * 
 * Production-grade feature flag system for safe deployment of risky changes,
 * A/B testing, gradual rollouts, and emergency feature toggles
 */

import { Request, Response, NextFunction } from 'express';
import { logger, StructuredLogger } from './structured-logger';

/**
 * P4-5.1: Feature flag types and interfaces
 */
interface FeatureFlag {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  rolloutPercentage: number; // 0-100
  userSegments?: string[]; // specific user segments
  workspaceSegments?: string[]; // specific workspace segments
  environment?: string[]; // specific environments
  startDate?: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  metadata?: Record<string, any>;
}

interface FeatureFlagContext {
  userId?: string;
  workspaceId?: string;
  userSegment?: string;
  environment?: string;
  randomValue?: number; // For percentage rollouts
  correlationId?: string;
}

/**
 * P4-5.2: Feature flag storage and management
 */
export class FeatureFlagManager {
  private static flags = new Map<string, FeatureFlag>();
  private static evaluationCache = new Map<string, {
    result: boolean;
    timestamp: number;
    context: FeatureFlagContext;
  }>();

  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * P4-5.2a: Initialize default feature flags
   */
  static initializeDefaultFlags(): void {
    const defaultFlags: FeatureFlag[] = [
      {
        key: 'advanced_analytics',
        name: 'Advanced Analytics Dashboard',
        description: 'Enable advanced analytics features with real-time data processing',
        enabled: true,
        rolloutPercentage: 50,
        environment: ['development', 'staging'],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: 'new_instagram_api',
        name: 'New Instagram API Integration',
        description: 'Use new Instagram Graph API instead of legacy API',
        enabled: false,
        rolloutPercentage: 10,
        userSegments: ['beta_testers'],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: 'ai_content_generation',
        name: 'AI Content Generation',
        description: 'Enable AI-powered content generation features',
        enabled: true,
        rolloutPercentage: 75,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: 'enhanced_security',
        name: 'Enhanced Security Features',
        description: 'Enable additional security layers and monitoring',
        enabled: true,
        rolloutPercentage: 100,
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        key: 'experimental_ui',
        name: 'Experimental UI Components',
        description: 'Enable new experimental user interface components',
        enabled: false,
        rolloutPercentage: 5,
        userSegments: ['internal_team'],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    defaultFlags.forEach(flag => {
      this.flags.set(flag.key, flag);
    });

    logger.info({
      event: 'FEATURE_FLAGS_INITIALIZED',
      totalFlags: defaultFlags.length,
      enabledFlags: defaultFlags.filter(f => f.enabled).length
    }, '🎯 P4-5: Feature flags initialized');
  }

  /**
   * P4-5.2b: Create or update feature flag
   */
  static setFeatureFlag(flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>): void {
    const existing = this.flags.get(flag.key);
    const now = new Date();

    const featureFlag: FeatureFlag = {
      ...flag,
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    this.flags.set(flag.key, featureFlag);
    this.clearCache(flag.key);

    StructuredLogger.userAction(
      'feature_flag_updated',
      'system',
      'admin',
      undefined,
      { flagKey: flag.key, enabled: flag.enabled }
    );

    logger.info({
      event: 'FEATURE_FLAG_UPDATED',
      flagKey: flag.key,
      enabled: flag.enabled,
      rolloutPercentage: flag.rolloutPercentage
    }, `🎯 Feature flag updated: ${flag.key}`);
  }

  /**
   * P4-5.2c: Evaluate feature flag for context
   */
  static isEnabled(
    flagKey: string,
    context: FeatureFlagContext = {}
  ): boolean {
    try {
      const cacheKey = this.generateCacheKey(flagKey, context);
      const cached = this.evaluationCache.get(cacheKey);

      // Return cached result if still valid
      if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
        return cached.result;
      }

      const flag = this.flags.get(flagKey);
      if (!flag) {
        logger.warn({
          event: 'FEATURE_FLAG_NOT_FOUND',
          flagKey,
          context
        }, `⚠️ Feature flag not found: ${flagKey}`);
        return false;
      }

      const result = this.evaluateFlag(flag, context);

      // Cache the result
      this.evaluationCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
        context
      });

      // Log flag evaluation
      StructuredLogger.metric(
        'feature_flag_evaluation',
        result ? 1 : 0,
        'boolean',
        {
          flag_key: flagKey,
          result: result.toString(),
          user_id: context.userId || 'anonymous',
          workspace_id: context.workspaceId || 'none'
        },
        context.correlationId
      );

      return result;

    } catch (error) {
      logger.error({
        event: 'FEATURE_FLAG_EVALUATION_ERROR',
        flagKey,
        context,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, `❌ Feature flag evaluation failed: ${flagKey}`);
      return false;
    }
  }

  /**
   * P4-5.2d: Evaluate flag based on conditions
   */
  private static evaluateFlag(
    flag: FeatureFlag,
    context: FeatureFlagContext
  ): boolean {
    // Check if flag is globally disabled
    if (!flag.enabled) {
      return false;
    }

    // Check environment restrictions
    if (flag.environment && flag.environment.length > 0) {
      const currentEnv = context.environment || process.env.NODE_ENV || 'development';
      if (!flag.environment.includes(currentEnv)) {
        return false;
      }
    }

    // Check date restrictions
    const now = new Date();
    if (flag.startDate && now < flag.startDate) {
      return false;
    }
    if (flag.endDate && now > flag.endDate) {
      return false;
    }

    // Check user segment restrictions
    if (flag.userSegments && flag.userSegments.length > 0) {
      if (!context.userSegment || !flag.userSegments.includes(context.userSegment)) {
        return false;
      }
    }

    // Check workspace segment restrictions
    if (flag.workspaceSegments && flag.workspaceSegments.length > 0) {
      if (!context.workspaceId || !flag.workspaceSegments.includes(context.workspaceId)) {
        return false;
      }
    }

    // Check rollout percentage
    if (flag.rolloutPercentage < 100) {
      const randomValue = context.randomValue ?? this.generateConsistentRandom(
        flag.key,
        context.userId || context.workspaceId || 'anonymous'
      );
      
      if (randomValue > flag.rolloutPercentage) {
        return false;
      }
    }

    return true;
  }

  /**
   * P4-5.2e: Generate consistent random value for user/workspace
   */
  private static generateConsistentRandom(flagKey: string, identifier: string): number {
    // Simple hash function for consistent randomness
    let hash = 0;
    const input = `${flagKey}:${identifier}`;
    
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    
    // Convert to 0-100 range
    return Math.abs(hash) % 101;
  }

  /**
   * P4-5.3: Utility methods
   */
  
  static getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  static getFlag(key: string): FeatureFlag | undefined {
    return this.flags.get(key);
  }

  static deleteFlag(key: string): boolean {
    const deleted = this.flags.delete(key);
    if (deleted) {
      this.clearCache(key);
      logger.info({
        event: 'FEATURE_FLAG_DELETED',
        flagKey: key
      }, `🗑️ Feature flag deleted: ${key}`);
    }
    return deleted;
  }

  static getFlagStatus(): {
    totalFlags: number;
    enabledFlags: number;
    disabledFlags: number;
    scheduledFlags: number;
    expiredFlags: number;
  } {
    const flags = Array.from(this.flags.values());
    const now = new Date();
    
    return {
      totalFlags: flags.length,
      enabledFlags: flags.filter(f => f.enabled).length,
      disabledFlags: flags.filter(f => !f.enabled).length,
      scheduledFlags: flags.filter(f => f.startDate && f.startDate > now).length,
      expiredFlags: flags.filter(f => f.endDate && f.endDate < now).length
    };
  }

  private static generateCacheKey(flagKey: string, context: FeatureFlagContext): string {
    const keyParts = [
      flagKey,
      context.userId || 'anon',
      context.workspaceId || 'none',
      context.userSegment || 'none',
      context.environment || process.env.NODE_ENV || 'dev'
    ];
    return keyParts.join(':');
  }

  private static clearCache(flagKey?: string): void {
    if (flagKey) {
      // Clear specific flag from cache
      for (const [key] of this.evaluationCache.entries()) {
        if (key.startsWith(`${flagKey}:`)) {
          this.evaluationCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.evaluationCache.clear();
    }
  }

  /**
   * P4-5.4: Cleanup expired cache entries
   */
  static cleanupCache(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, cached] of this.evaluationCache.entries()) {
      if ((now - cached.timestamp) > this.CACHE_TTL) {
        this.evaluationCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug({
        event: 'FEATURE_FLAG_CACHE_CLEANUP',
        cleanedEntries: cleanedCount,
        remainingEntries: this.evaluationCache.size
      });
    }
  }
}

/**
 * P4-5.5: Feature flag middleware for Express
 */
export function featureFlagMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add feature flag helper to request
    req.isFeatureEnabled = (flagKey: string, customContext?: Partial<FeatureFlagContext>) => {
      const context: FeatureFlagContext = {
        userId: req.user?.id,
        workspaceId: req.workspace?.id,
        userSegment: req.user?.segment || (req.user?.plan === 'business' ? 'premium' : 'standard'),
        environment: process.env.NODE_ENV || 'development',
        correlationId: req.correlationId,
        ...customContext
      };

      return FeatureFlagManager.isEnabled(flagKey, context);
    };

    next();
  };
}

/**
 * P4-5.6: Feature flag decorators/helpers
 */
export class FeatureFlags {
  /**
   * Check if feature is enabled with user context
   */
  static withUser(flagKey: string, userId: string, userSegment?: string): boolean {
    return FeatureFlagManager.isEnabled(flagKey, {
      userId,
      userSegment,
      environment: process.env.NODE_ENV || 'development'
    });
  }

  /**
   * Check if feature is enabled with workspace context
   */
  static withWorkspace(flagKey: string, workspaceId: string): boolean {
    return FeatureFlagManager.isEnabled(flagKey, {
      workspaceId,
      environment: process.env.NODE_ENV || 'development'
    });
  }

  /**
   * Check if feature is enabled globally
   */
  static global(flagKey: string): boolean {
    return FeatureFlagManager.isEnabled(flagKey, {
      environment: process.env.NODE_ENV || 'development'
    });
  }

  /**
   * Execute code conditionally based on feature flag
   */
  static conditionalExecute<T>(
    flagKey: string,
    context: FeatureFlagContext,
    enabledCallback: () => T,
    disabledCallback?: () => T
  ): T | undefined {
    if (FeatureFlagManager.isEnabled(flagKey, context)) {
      return enabledCallback();
    } else if (disabledCallback) {
      return disabledCallback();
    }
    return undefined;
  }
}

/**
 * P4-5.7: Initialize feature flag system
 */
export function initializeFeatureFlagSystem(): void {
  FeatureFlagManager.initializeDefaultFlags();

  // Setup periodic cache cleanup
  setInterval(() => {
    FeatureFlagManager.cleanupCache();
  }, 60000); // Clean every minute

  logger.info({
    event: 'FEATURE_FLAG_SYSTEM_INITIALIZED',
    features: [
      'Percentage-based rollouts',
      'User and workspace segmentation',
      'Environment restrictions',
      'Scheduled feature releases',
      'Evaluation caching',
      'Consistent randomization',
      'Comprehensive logging'
    ],
    status: FeatureFlagManager.getFlagStatus()
  }, '🔐 P4-5: Feature flag system ready for production');
}