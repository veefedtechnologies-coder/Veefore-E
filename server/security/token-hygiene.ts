/**
 * P2-7 SECURITY: Token Hygiene Automation & Refresh Workflows
 * 
 * Implements automated token management, refresh workflows, and security hygiene
 * to ensure social media tokens remain valid and secure over time
 */

import { TokenMigrationService } from './token-migration';

/**
 * P2-7.1: Token health monitoring and validation
 */
export class TokenHealthMonitor {
  private static readonly TOKEN_EXPIRY_WARNING = 7 * 24 * 60 * 60 * 1000; // 7 days
  private static readonly TOKEN_EXPIRY_CRITICAL = 1 * 24 * 60 * 60 * 1000; // 1 day

  /**
   * Check token health across all social accounts
   */
  static async performTokenHealthCheck(): Promise<{
    total: number;
    healthy: number;
    expiring: number;
    expired: number;
    corrupted: number;
    errors: string[];
  }> {
    const results = {
      total: 0,
      healthy: 0,
      expiring: 0,
      expired: 0,
      corrupted: 0,
      errors: [] as string[]
    };

    try {
      console.log('🔐 P2-7: Starting comprehensive token health check...');
      
      const { default: mongoose } = await import('mongoose');
      const SocialAccount = mongoose.model('SocialAccount');
      
      // Get all social accounts with tokens
      const accounts = await SocialAccount.find({
        $or: [
          { encryptedAccessToken: { $exists: true, $ne: null } },
          { accessToken: { $exists: true, $ne: null } }
        ]
      });

      results.total = accounts.length;
      console.log(`🔐 P2-7: Checking ${results.total} social media accounts...`);

      for (const account of accounts) {
        try {
          const healthStatus = await TokenHealthMonitor.checkSingleTokenHealth(account);
          
          switch (healthStatus.status) {
            case 'healthy':
              results.healthy++;
              break;
            case 'expiring':
              results.expiring++;
              console.warn(`⚠️ P2-7: Token expiring soon for ${account.platform}/@${account.username}`);
              break;
            case 'expired':
              results.expired++;
              console.error(`❌ P2-7: Token expired for ${account.platform}/@${account.username}`);
              break;
            case 'corrupted':
              results.corrupted++;
              console.error(`🚨 P2-7: Token corrupted for ${account.platform}/@${account.username}`);
              break;
          }

          if (healthStatus.error) {
            results.errors.push(`${account.platform}/@${account.username}: ${healthStatus.error}`);
          }

        } catch (error) {
          results.errors.push(`${account.platform}/@${account.username}: ${error.message}`);
        }
      }

      console.log(`🔐 P2-7: Token Health Summary - Healthy: ${results.healthy}, Expiring: ${results.expiring}, Expired: ${results.expired}, Corrupted: ${results.corrupted}`);
      
      return results;

    } catch (error) {
      console.error('🚨 P2-7: Token health check failed:', error);
      results.errors.push(`System error: ${error.message}`);
      return results;
    }
  }

  /**
   * Check health of a single token
   */
  static async checkSingleTokenHealth(account: any): Promise<{
    status: 'healthy' | 'expiring' | 'expired' | 'corrupted';
    error?: string;
  }> {
    try {
      // Check if token can be decrypted/accessed
      let hasValidToken = false;
      
      if (account.encryptedAccessToken) {
        try {
          const decryptedTokens = await TokenMigrationService.decryptSocialAccountTokens({
            encryptedAccessToken: account.encryptedAccessToken
          });
          hasValidToken = !!decryptedTokens.accessToken;
        } catch (error) {
          return { status: 'corrupted', error: 'Token decryption failed' };
        }
      } else if (account.accessToken) {
        hasValidToken = true;
      }

      if (!hasValidToken) {
        return { status: 'corrupted', error: 'No valid token found' };
      }

      // Check expiry if available
      if (account.expiresAt) {
        const now = Date.now();
        const expiresAt = new Date(account.expiresAt).getTime();
        
        if (expiresAt <= now) {
          return { status: 'expired', error: 'Token has expired' };
        } else if (expiresAt - now <= TokenHealthMonitor.TOKEN_EXPIRY_CRITICAL) {
          return { status: 'expiring', error: 'Token expires within 24 hours' };
        } else if (expiresAt - now <= TokenHealthMonitor.TOKEN_EXPIRY_WARNING) {
          return { status: 'expiring', error: 'Token expires within 7 days' };
        }
      }

      return { status: 'healthy' };

    } catch (error) {
      return { status: 'corrupted', error: error.message };
    }
  }
}

/**
 * P2-7.2: Automated token refresh workflows
 */
export class TokenRefreshService {
  /**
   * Refresh Instagram access tokens using refresh tokens
   */
  static async refreshInstagramToken(account: any): Promise<{
    success: boolean;
    newToken?: string;
    expiresAt?: Date;
    error?: string;
  }> {
    try {
      // Get current tokens
      const tokens = await TokenMigrationService.decryptSocialAccountTokens({
        encryptedAccessToken: account.encryptedAccessToken,
        encryptedRefreshToken: account.encryptedRefreshToken
      });

      if (!tokens.refreshToken) {
        return { success: false, error: 'No refresh token available' };
      }

      // Instagram token refresh API call
      const refreshResponse = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokens.refreshToken,
          client_id: process.env.INSTAGRAM_CLIENT_ID || '',
          client_secret: process.env.INSTAGRAM_CLIENT_SECRET || ''
        }).toString()
      });

      const refreshData = await refreshResponse.json();

      if (!refreshResponse.ok) {
        return { 
          success: false, 
          error: refreshData.error_description || 'Token refresh failed' 
        };
      }

      // Calculate expiry (Instagram tokens typically last 60 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 60);

      return {
        success: true,
        newToken: refreshData.access_token,
        expiresAt
      };

    } catch (error) {
      console.error('🚨 P2-7: Instagram token refresh failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Automatically refresh expiring tokens
   */
  static async refreshExpiringTokens(): Promise<{
    attempted: number;
    successful: number;
    failed: number;
    errors: string[];
  }> {
    const results = {
      attempted: 0,
      successful: 0,
      failed: 0,
      errors: [] as string[]
    };

    try {
      console.log('🔐 P2-7: Starting automatic token refresh for expiring tokens...');
      
      const { default: mongoose } = await import('mongoose');
      const SocialAccount = mongoose.model('SocialAccount');
      
      // Find accounts with tokens expiring within 7 days
      const expiryThreshold = new Date();
      expiryThreshold.setDate(expiryThreshold.getDate() + 7);

      const expiringAccounts = await SocialAccount.find({
        expiresAt: { $lte: expiryThreshold, $gt: new Date() },
        platform: 'instagram' // Start with Instagram
      });

      results.attempted = expiringAccounts.length;
      console.log(`🔐 P2-7: Found ${results.attempted} accounts with expiring tokens`);

      for (const account of expiringAccounts) {
        try {
          const refreshResult = await TokenRefreshService.refreshInstagramToken(account);
          
          if (refreshResult.success && refreshResult.newToken) {
            // Encrypt and store new token
            const encryptedTokens = await TokenMigrationService.encryptNewTokens({
              accessToken: refreshResult.newToken
            });

            // Update account with new token
            await SocialAccount.updateOne(
              { _id: account._id },
              {
                ...encryptedTokens,
                expiresAt: refreshResult.expiresAt,
                lastTokenRefresh: new Date(),
                $unset: { accessToken: 1 } // Remove plain text token
              }
            );

            results.successful++;
            console.log(`✅ P2-7: Refreshed token for ${account.platform}/@${account.username}`);
          } else {
            results.failed++;
            results.errors.push(`${account.platform}/@${account.username}: ${refreshResult.error}`);
          }

        } catch (error) {
          results.failed++;
          results.errors.push(`${account.platform}/@${account.username}: ${error.message}`);
        }
      }

      console.log(`🔐 P2-7: Token refresh complete - ${results.successful} successful, ${results.failed} failed`);
      return results;

    } catch (error) {
      console.error('🚨 P2-7: Automatic token refresh failed:', error);
      results.errors.push(`System error: ${error.message}`);
      return results;
    }
  }
}

/**
 * P2-7.3: Token lifecycle management
 */
export class TokenLifecycleManager {
  /**
   * Revoke and cleanup expired or compromised tokens
   */
  static async revokeCompromisedTokens(): Promise<{
    revoked: number;
    errors: string[];
  }> {
    const results = {
      revoked: 0,
      errors: [] as string[]
    };

    try {
      console.log('🔐 P2-7: Starting compromised token cleanup...');
      
      const { default: mongoose } = await import('mongoose');
      const SocialAccount = mongoose.model('SocialAccount');
      
      // Find accounts with expired tokens or multiple failed refresh attempts
      const compromisedAccounts = await SocialAccount.find({
        $or: [
          { expiresAt: { $lt: new Date() } }, // Expired tokens
          { tokenRefreshFailures: { $gte: 3 } } // Multiple refresh failures
        ]
      });

      console.log(`🔐 P2-7: Found ${compromisedAccounts.length} accounts with compromised tokens`);

      for (const account of compromisedAccounts) {
        try {
          // Clear all tokens and reset account
          await SocialAccount.updateOne(
            { _id: account._id },
            {
              $unset: {
                accessToken: 1,
                refreshToken: 1,
                encryptedAccessToken: 1,
                encryptedRefreshToken: 1
              },
              isActive: false,
              tokenStatus: 'revoked',
              lastTokenRevocation: new Date()
            }
          );

          results.revoked++;
          console.log(`🗑️ P2-7: Revoked compromised tokens for ${account.platform}/@${account.username}`);

        } catch (error) {
          results.errors.push(`${account.platform}/@${account.username}: ${error.message}`);
        }
      }

      console.log(`🔐 P2-7: Token revocation complete - ${results.revoked} accounts cleaned up`);
      return results;

    } catch (error) {
      console.error('🚨 P2-7: Token revocation failed:', error);
      results.errors.push(`System error: ${error.message}`);
      return results;
    }
  }

  /**
   * Generate token security report
   */
  static async generateSecurityReport(): Promise<{
    timestamp: Date;
    totalAccounts: number;
    tokenHealth: any;
    refreshResults: any;
    revocationResults: any;
    recommendations: string[];
  }> {
    console.log('🔐 P2-7: Generating comprehensive token security report...');

    const tokenHealth = await TokenHealthMonitor.performTokenHealthCheck();
    const refreshResults = await TokenRefreshService.refreshExpiringTokens();
    const revocationResults = await TokenLifecycleManager.revokeCompromisedTokens();

    const recommendations = [];
    
    if (tokenHealth.expired > 0) {
      recommendations.push(`${tokenHealth.expired} accounts have expired tokens - manual re-authorization required`);
    }
    
    if (tokenHealth.corrupted > 0) {
      recommendations.push(`${tokenHealth.corrupted} accounts have corrupted tokens - investigate encryption key issues`);
    }
    
    if (refreshResults.failed > 0) {
      recommendations.push(`${refreshResults.failed} token refresh attempts failed - check API credentials`);
    }

    const report = {
      timestamp: new Date(),
      totalAccounts: tokenHealth.total,
      tokenHealth,
      refreshResults,
      revocationResults,
      recommendations
    };

    console.log('🔐 P2-7: Token Security Report Generated:', {
      totalAccounts: report.totalAccounts,
      healthyTokens: tokenHealth.healthy,
      recommendations: recommendations.length
    });

    return report;
  }
}

/**
 * P2-7.4: Scheduled token hygiene service
 */
export class TokenHygieneScheduler {
  private static readonly HEALTH_CHECK_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
  private static readonly REFRESH_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000; // 7 days

  /**
   * Start automated token hygiene services
   */
  static initialize(): void {
    console.log('🔐 P2-7: Initializing token hygiene automation...');

    // Health checks every 6 hours
    setInterval(async () => {
      try {
        await TokenHealthMonitor.performTokenHealthCheck();
      } catch (error) {
        console.error('🚨 P2-7: Scheduled health check failed:', error);
      }
    }, TokenHygieneScheduler.HEALTH_CHECK_INTERVAL);

    // Token refresh every 24 hours
    setInterval(async () => {
      try {
        await TokenRefreshService.refreshExpiringTokens();
      } catch (error) {
        console.error('🚨 P2-7: Scheduled token refresh failed:', error);
      }
    }, TokenHygieneScheduler.REFRESH_INTERVAL);

    // Cleanup every 7 days
    setInterval(async () => {
      try {
        await TokenLifecycleManager.revokeCompromisedTokens();
      } catch (error) {
        console.error('🚨 P2-7: Scheduled cleanup failed:', error);
      }
    }, TokenHygieneScheduler.CLEANUP_INTERVAL);

    console.log('🔐 P2-7: Token hygiene automation scheduled');
  }

  /**
   * Run comprehensive token maintenance now
   */
  static async runMaintenanceNow(): Promise<any> {
    console.log('🔐 P2-7: Running immediate token maintenance...');
    
    try {
      const report = await TokenLifecycleManager.generateSecurityReport();
      console.log('✅ P2-7: Token maintenance completed successfully');
      return report;
    } catch (error) {
      console.error('🚨 P2-7: Token maintenance failed:', error);
      throw error;
    }
  }
}

/**
 * P2-7.5: Initialize token hygiene system
 */
export function initializeTokenHygiene(): void {
  console.log('🔐 P2-7: Initializing token hygiene automation system...');
  
  // Only run scheduled hygiene in production
  if (process.env.NODE_ENV === 'production') {
    TokenHygieneScheduler.initialize();
  } else {
    console.log('🔐 P2-7: Token hygiene scheduling skipped in development mode');
  }
  
  console.log('🔐 P2-7: Token Hygiene Features:');
  console.log('  ✅ Automated token health monitoring');
  console.log('  ✅ Automatic token refresh workflows');
  console.log('  ✅ Compromised token detection and revocation');
  console.log('  ✅ Token lifecycle management');
  console.log('  ✅ Comprehensive security reporting');
  console.log('  ✅ Scheduled maintenance automation');
  console.log('🔐 P2-7: Token hygiene system ready for production');
}