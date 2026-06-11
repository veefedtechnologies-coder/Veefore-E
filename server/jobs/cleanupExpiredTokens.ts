import { User } from '../models/User/User';
import { logger } from '../config/logger';

/**
 * Background Cleanup Job for Expired Refresh Tokens
 * 
 * This job removes expired refresh tokens from the database to prevent bloat.
 * While MongoDB TTL indexes handle automatic document expiration, this job
 * provides additional cleanup for tokens that may have been orphaned or for
 * cases where TTL indexes are not enabled.
 * 
 * **Requirement 2.9**: Background cleanup job removes expired tokens to prevent database bloat
 * 
 * Usage:
 * - Run periodically (e.g., daily via cron job or scheduler)
 * - Can be triggered manually for maintenance
 * - Safe to run multiple times (idempotent)
 * 
 * Example:
 * ```typescript
 * import { cleanupExpiredTokens } from './jobs/cleanupExpiredTokens';
 * 
 * // Run daily at 3 AM
 * cron.schedule('0 3 * * *', async () => {
 *   await cleanupExpiredTokens();
 * });
 * ```
 */

// Maximum refresh token lifetime (90 days)
const REFRESH_TOKEN_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

/**
 * Remove expired refresh tokens from the database
 * 
 * This function finds all users with refresh tokens older than 90 days
 * and removes those tokens from their user documents.
 * 
 * @returns Promise<{ deletedCount: number }> - Number of tokens cleaned up
 */
export async function cleanupExpiredTokens(): Promise<{ deletedCount: number }> {
  const startTime = Date.now();
  
  try {
    logger.info('Starting expired refresh token cleanup job', {
      component: 'Jobs.CleanupExpiredTokens',
      maxAgeInDays: 90,
    });

    // Calculate cutoff date (90 days ago)
    const cutoffDate = new Date(Date.now() - REFRESH_TOKEN_MAX_AGE_MS);

    // Find all users with expired refresh tokens
    const expiredTokens = await User.find({
      refreshTokenCreatedAt: { $lt: cutoffDate, $exists: true },
    }).select('_id refreshTokenCreatedAt');

    logger.info('Found expired refresh tokens', {
      component: 'Jobs.CleanupExpiredTokens',
      count: expiredTokens.length,
      cutoffDate: cutoffDate.toISOString(),
    });

    // Remove expired tokens
    const result = await User.updateMany(
      { refreshTokenCreatedAt: { $lt: cutoffDate } },
      {
        $unset: {
          refreshToken: '',
          refreshTokenIV: '',
          refreshTokenTag: '',
          refreshTokenKeyVersion: '',
          refreshTokenCreatedAt: '',
        },
      }
    );

    const duration = Date.now() - startTime;
    const deletedCount = result.modifiedCount || 0;

    logger.info('Expired refresh token cleanup completed', {
      component: 'Jobs.CleanupExpiredTokens',
      deletedCount,
      durationMs: duration,
      cutoffDate: cutoffDate.toISOString(),
    });

    return { deletedCount };
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error('Expired refresh token cleanup failed', error, {
      component: 'Jobs.CleanupExpiredTokens',
      durationMs: duration,
      errorType: error instanceof Error ? error.name : 'Unknown',
    });

    throw new Error('Failed to cleanup expired refresh tokens');
  }
}

/**
 * Get statistics about refresh token age distribution
 * 
 * Useful for monitoring and determining optimal cleanup frequency.
 * 
 * @returns Promise<{ total: number, expired: number, olderThan30Days: number, olderThan60Days: number }>
 */
export async function getTokenAgeStats(): Promise<{
  total: number;
  expired: number;
  olderThan30Days: number;
  olderThan60Days: number;
}> {
  try {
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now - 60 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now - REFRESH_TOKEN_MAX_AGE_MS);

    const [total, expired, olderThan30Days, olderThan60Days] = await Promise.all([
      User.countDocuments({ refreshTokenCreatedAt: { $exists: true } }),
      User.countDocuments({ refreshTokenCreatedAt: { $lt: ninetyDaysAgo } }),
      User.countDocuments({ refreshTokenCreatedAt: { $lt: thirtyDaysAgo } }),
      User.countDocuments({ refreshTokenCreatedAt: { $lt: sixtyDaysAgo } }),
    ]);

    logger.info('Refresh token age statistics', {
      component: 'Jobs.CleanupExpiredTokens',
      total,
      expired,
      olderThan30Days,
      olderThan60Days,
    });

    return {
      total,
      expired,
      olderThan30Days,
      olderThan60Days,
    };
  } catch (error) {
    logger.error('Failed to get token age statistics', error, {
      component: 'Jobs.CleanupExpiredTokens',
      errorType: error instanceof Error ? error.name : 'Unknown',
    });

    throw new Error('Failed to get token age statistics');
  }
}

