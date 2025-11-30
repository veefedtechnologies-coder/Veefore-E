/**
 * Instagram Token Health Monitoring Service
 * Continuously monitors Instagram token health and automatically fixes issues
 */

import { instagramTokenValidator } from './instagramTokenValidator.js';
import { tokenHealthChecker } from '../middleware/tokenHealthCheck.js';

class InstagramTokenMonitor {
  constructor(storage) {
    this.storage = storage;
    this.isRunning = false;
    this.monitoringInterval = null;
    this.stats = {
      totalChecks: 0,
      tokensFixed: 0,
      tokensRefreshed: 0,
      errors: 0,
      lastCheck: null,
      lastError: null,
      accountsMonitored: 0,
      healthyAccounts: 0,
      unhealthyAccounts: 0
    };
    
    // Configuration
    this.config = {
      checkInterval: 30 * 60 * 1000, // 30 minutes
      maxRetries: 3,
      retryDelay: 5000, // 5 seconds
      batchSize: 10, // Process 10 accounts at a time
      enableAutoFix: true,
      enableAutoRefresh: true,
      logLevel: 'info'
    };
  }

  /**
   * Start the monitoring service
   */
  start() {
    if (this.isRunning) {
      console.log('[INSTAGRAM MONITOR] Service is already running');
      return;
    }

    console.log('[INSTAGRAM MONITOR] Starting Instagram token monitoring service...');
    console.log(`[INSTAGRAM MONITOR] Check interval: ${this.config.checkInterval / 1000 / 60} minutes`);
    
    this.isRunning = true;
    
    // Run initial check
    this.performHealthCheck().catch(error => {
      console.error('[INSTAGRAM MONITOR] Initial health check failed:', error);
    });
    
    // Set up recurring checks
    this.monitoringInterval = setInterval(() => {
      this.performHealthCheck().catch(error => {
        console.error('[INSTAGRAM MONITOR] Scheduled health check failed:', error);
        this.stats.errors++;
        this.stats.lastError = error.message;
      });
    }, this.config.checkInterval);

    console.log('[INSTAGRAM MONITOR] ✅ Monitoring service started successfully');
  }

  /**
   * Stop the monitoring service
   */
  stop() {
    if (!this.isRunning) {
      console.log('[INSTAGRAM MONITOR] Service is not running');
      return;
    }

    console.log('[INSTAGRAM MONITOR] Stopping monitoring service...');
    
    this.isRunning = false;
    
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    console.log('[INSTAGRAM MONITOR] ✅ Monitoring service stopped');
  }

  /**
   * Perform comprehensive health check on all Instagram accounts
   */
  async performHealthCheck() {
    try {
      console.log('[INSTAGRAM MONITOR] Starting comprehensive health check...');
      
      this.stats.totalChecks++;
      this.stats.lastCheck = new Date();
      
      // Get all workspaces with Instagram accounts
      const workspaces = await this.getAllWorkspacesWithInstagram();
      
      if (workspaces.length === 0) {
        console.log('[INSTAGRAM MONITOR] No workspaces with Instagram accounts found');
        return;
      }

      console.log(`[INSTAGRAM MONITOR] Found ${workspaces.length} workspaces with Instagram accounts`);
      
      let totalAccounts = 0;
      let healthyAccounts = 0;
      let unhealthyAccounts = 0;
      let tokensFixed = 0;
      let tokensRefreshed = 0;

      // Process workspaces in batches
      for (let i = 0; i < workspaces.length; i += this.config.batchSize) {
        const batch = workspaces.slice(i, i + this.config.batchSize);
        
        await Promise.all(batch.map(async (workspace) => {
          try {
            const result = await this.checkWorkspaceHealth(workspace.id);
            totalAccounts += result.totalAccounts;
            healthyAccounts += result.healthyAccounts;
            unhealthyAccounts += result.unhealthyAccounts;
            tokensFixed += result.tokensFixed;
            tokensRefreshed += result.tokensRefreshed;
          } catch (error) {
            console.error(`[INSTAGRAM MONITOR] Error checking workspace ${workspace.id}:`, error);
            this.stats.errors++;
          }
        }));

        // Small delay between batches to avoid overwhelming the system
        if (i + this.config.batchSize < workspaces.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Update stats
      this.stats.accountsMonitored = totalAccounts;
      this.stats.healthyAccounts = healthyAccounts;
      this.stats.unhealthyAccounts = unhealthyAccounts;
      this.stats.tokensFixed += tokensFixed;
      this.stats.tokensRefreshed += tokensRefreshed;

      console.log(`[INSTAGRAM MONITOR] Health check completed:`);
      console.log(`  - Total accounts: ${totalAccounts}`);
      console.log(`  - Healthy accounts: ${healthyAccounts}`);
      console.log(`  - Unhealthy accounts: ${unhealthyAccounts}`);
      console.log(`  - Tokens fixed: ${tokensFixed}`);
      console.log(`  - Tokens refreshed: ${tokensRefreshed}`);

    } catch (error) {
      console.error('[INSTAGRAM MONITOR] Health check failed:', error);
      this.stats.errors++;
      this.stats.lastError = error.message;
      throw error;
    }
  }

  /**
   * Check health of Instagram accounts in a specific workspace
   */
  async checkWorkspaceHealth(workspaceId) {
    try {
      console.log(`[INSTAGRAM MONITOR] Checking workspace: ${workspaceId}`);
      
      // Get Instagram accounts for this workspace
      const accounts = await this.storage.getSocialAccountsByWorkspace(workspaceId);
      const instagramAccounts = accounts.filter(acc => acc.platform === 'instagram');
      
      if (instagramAccounts.length === 0) {
        return {
          totalAccounts: 0,
          healthyAccounts: 0,
          unhealthyAccounts: 0,
          tokensFixed: 0,
          tokensRefreshed: 0
        };
      }

      let healthyAccounts = 0;
      let unhealthyAccounts = 0;
      let tokensFixed = 0;
      let tokensRefreshed = 0;

      // Check each Instagram account
      for (const account of instagramAccounts) {
        try {
          const result = await this.checkAccountHealth(account);
          
          if (result.isHealthy) {
            healthyAccounts++;
          } else {
            unhealthyAccounts++;
            
            if (this.config.enableAutoFix && result.canFix) {
              const fixResult = await this.fixAccountToken(account);
              if (fixResult.fixed) {
                tokensFixed++;
                healthyAccounts++;
                unhealthyAccounts--;
              }
            }
            
            if (this.config.enableAutoRefresh && result.needsRefresh) {
              const refreshResult = await this.refreshAccountToken(account);
              if (refreshResult.refreshed) {
                tokensRefreshed++;
              }
            }
          }
        } catch (error) {
          console.error(`[INSTAGRAM MONITOR] Error checking account ${account.id}:`, error);
          unhealthyAccounts++;
        }
      }

      return {
        totalAccounts: instagramAccounts.length,
        healthyAccounts,
        unhealthyAccounts,
        tokensFixed,
        tokensRefreshed
      };

    } catch (error) {
      console.error(`[INSTAGRAM MONITOR] Error checking workspace ${workspaceId}:`, error);
      throw error;
    }
  }

  /**
   * Check health of a specific Instagram account
   */
  async checkAccountHealth(account) {
    try {
      // Basic checks
      const hasToken = !!account.accessToken;
      const isEncrypted = account.accessToken?.includes('aes-256-gcm:');
      const isActive = account.isActive;
      const needsReconnection = account.needsReconnection;

      // If no token, account is unhealthy
      if (!hasToken) {
        return {
          isHealthy: false,
          canFix: false,
          needsRefresh: false,
          issues: ['No access token']
        };
      }

      // If token is encrypted, it needs decryption
      if (isEncrypted) {
        return {
          isHealthy: false,
          canFix: true,
          needsRefresh: false,
          issues: ['Token is encrypted and needs decryption']
        };
      }

      // If account needs reconnection, it's unhealthy
      if (needsReconnection) {
        return {
          isHealthy: false,
          canFix: false,
          needsRefresh: true,
          issues: ['Account needs reconnection']
        };
      }

      // If account is inactive, it might need refresh
      if (!isActive) {
        return {
          isHealthy: false,
          canFix: false,
          needsRefresh: true,
          issues: ['Account is inactive']
        };
      }

      // Test token with Instagram API (cached)
      const apiTest = await instagramTokenValidator.testInstagramApi(account.accessToken, account.id);
      
      if (!apiTest.isValid) {
        return {
          isHealthy: false,
          canFix: false,
          needsRefresh: true,
          issues: [`API test failed: ${apiTest.error}`]
        };
      }

      // Account is healthy
      return {
        isHealthy: true,
        canFix: false,
        needsRefresh: false,
        issues: []
      };

    } catch (error) {
      console.error(`[INSTAGRAM MONITOR] Error checking account health:`, error);
      return {
        isHealthy: false,
        canFix: false,
        needsRefresh: false,
        issues: [`Health check error: ${error.message}`]
      };
    }
  }

  /**
   * Fix token issues for a specific account
   */
  async fixAccountToken(account) {
    try {
      console.log(`[INSTAGRAM MONITOR] Fixing token for account: ${account.username} (${account.id})`);
      
      const result = await instagramTokenValidator.validateSingleAccount(this.storage, account, true);
      
      if (result.fixed) {
        console.log(`[INSTAGRAM MONITOR] ✅ Token fixed for account: ${account.username}`);
      }
      
      return result;
    } catch (error) {
      console.error(`[INSTAGRAM MONITOR] Error fixing token for account ${account.id}:`, error);
      return { fixed: false, error: error.message };
    }
  }

  /**
   * Refresh token for a specific account
   */
  async refreshAccountToken(account) {
    try {
      console.log(`[INSTAGRAM MONITOR] Refreshing token for account: ${account.username} (${account.id})`);
      
      // This would integrate with your existing token refresh logic
      // For now, we'll just log the attempt
      console.log(`[INSTAGRAM MONITOR] Token refresh attempted for account: ${account.username}`);
      
      return { refreshed: false, message: 'Token refresh not implemented yet' };
    } catch (error) {
      console.error(`[INSTAGRAM MONITOR] Error refreshing token for account ${account.id}:`, error);
      return { refreshed: false, error: error.message };
    }
  }

  /**
   * Get all workspaces that have Instagram accounts
   */
  async getAllWorkspacesWithInstagram() {
    try {
      // This is a simplified approach - you might need to adjust based on your data structure
      const allAccounts = await this.storage.getAllSocialAccounts();
      const instagramAccounts = allAccounts.filter(acc => acc.platform === 'instagram');
      
      // Get unique workspace IDs
      const workspaceIds = [...new Set(instagramAccounts.map(acc => acc.workspaceId))];
      
      return workspaceIds.map(id => ({ id }));
    } catch (error) {
      console.error('[INSTAGRAM MONITOR] Error getting workspaces:', error);
      return [];
    }
  }

  /**
   * Get monitoring statistics
   */
  getStats() {
    return {
      ...this.stats,
      isRunning: this.isRunning,
      config: this.config,
      uptime: this.stats.lastCheck ? Date.now() - this.stats.lastCheck.getTime() : 0
    };
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    console.log('[INSTAGRAM MONITOR] Configuration updated:', this.config);
    
    // Restart monitoring with new interval if changed
    if (newConfig.checkInterval && this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Force a health check now
   */
  async forceHealthCheck() {
    console.log('[INSTAGRAM MONITOR] Forcing immediate health check...');
    return await this.performHealthCheck();
  }
}

export default InstagramTokenMonitor;