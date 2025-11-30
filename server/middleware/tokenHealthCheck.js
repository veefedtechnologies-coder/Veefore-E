/**
 * Token Health Check Middleware
 * Automatically validates and fixes Instagram token issues before API calls
 */

import { tokenEncryption } from '../security/token-encryption.js';

class TokenHealthChecker {
  constructor() {
    this.lastHealthCheck = new Map();
    this.healthCheckInterval = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Middleware to check token health before Instagram API calls
   */
  async checkTokenHealth(req, res, next) {
    try {
      const workspaceId = req.params.workspaceId || req.query.workspaceId || req.body.workspaceId;
      
      if (!workspaceId) {
        return next();
      }

      // Skip if recently checked
      const lastCheck = this.lastHealthCheck.get(workspaceId);
      if (lastCheck && (Date.now() - lastCheck) < this.healthCheckInterval) {
        return next();
      }

      console.log(`[TOKEN HEALTH] Checking token health for workspace: ${workspaceId}`);

      // Get MongoDB storage instance
      const storage = req.app.locals.storage;
      if (!storage) {
        console.warn('[TOKEN HEALTH] Storage not available, skipping check');
        return next();
      }

      // Get Instagram accounts for this workspace
      const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
      const instagramAccounts = accounts.filter(acc => acc.platform === 'instagram');

      for (const account of instagramAccounts) {
        await this.validateAndFixAccount(storage, account);
      }

      // Update last check time
      this.lastHealthCheck.set(workspaceId, Date.now());
      
      next();
    } catch (error) {
      console.error('[TOKEN HEALTH] Error during token health check:', error);
      // Don't block the request, just log the error
      next();
    }
  }

  /**
   * Validate and fix a single Instagram account
   */
  async validateAndFixAccount(storage, account) {
    try {
      console.log(`[TOKEN HEALTH] Validating account: ${account.username}`);

      // Check if account has valid token
      if (!account.accessToken) {
        console.warn(`[TOKEN HEALTH] Account ${account.username} missing access token`);
        await this.logTokenIssue(account, 'missing_access_token');
        return;
      }

      // Check token format (should not be encrypted)
      if (account.accessToken.includes('aes-256-gcm:')) {
        console.warn(`[TOKEN HEALTH] Account ${account.username} has encrypted token in accessToken field`);
        await this.fixEncryptedToken(storage, account);
        return;
      }

      // Test token with Instagram API (lightweight call)
      const isValid = await this.testInstagramToken(account.accessToken);
      if (!isValid) {
        console.warn(`[TOKEN HEALTH] Account ${account.username} has invalid token`);
        await this.logTokenIssue(account, 'invalid_token');
        return;
      }

      console.log(`[TOKEN HEALTH] Account ${account.username} token is healthy`);
    } catch (error) {
      console.error(`[TOKEN HEALTH] Error validating account ${account.username}:`, error);
      await this.logTokenIssue(account, 'validation_error', error.message);
    }
  }

  /**
   * Fix encrypted token in accessToken field
   */
  async fixEncryptedToken(storage, account) {
    try {
      console.log(`[TOKEN HEALTH] Fixing encrypted token for ${account.username}`);
      
      // Get the raw account from database
      const SocialAccountModel = storage.SocialAccountModel;
      const rawAccount = await SocialAccountModel.findById(account.id);
      
      if (!rawAccount) {
        console.error(`[TOKEN HEALTH] Could not find raw account for ${account.username}`);
        return;
      }

      let fixedToken = null;

      // Try to decrypt the accessToken field
      if (rawAccount.accessToken && rawAccount.accessToken.includes('aes-256-gcm:')) {
        try {
          fixedToken = tokenEncryption.decryptToken(rawAccount.accessToken);
          console.log(`[TOKEN HEALTH] Successfully decrypted accessToken for ${account.username}`);
        } catch (decryptError) {
          console.error(`[TOKEN HEALTH] Failed to decrypt accessToken for ${account.username}:`, decryptError);
        }
      }

      // Try to decrypt the encryptedAccessToken field
      if (!fixedToken && rawAccount.encryptedAccessToken) {
        try {
          fixedToken = tokenEncryption.decryptToken(rawAccount.encryptedAccessToken);
          console.log(`[TOKEN HEALTH] Successfully decrypted encryptedAccessToken for ${account.username}`);
        } catch (decryptError) {
          console.error(`[TOKEN HEALTH] Failed to decrypt encryptedAccessToken for ${account.username}:`, decryptError);
        }
      }

      if (fixedToken) {
        // Update the account with the decrypted token
        await SocialAccountModel.findByIdAndUpdate(account.id, {
          accessToken: fixedToken,
          // Clear the encrypted field to prevent confusion
          encryptedAccessToken: null,
          lastTokenFix: new Date()
        });
        
        console.log(`[TOKEN HEALTH] Fixed token for ${account.username}`);
        await this.logTokenIssue(account, 'token_fixed');
      } else {
        console.error(`[TOKEN HEALTH] Could not fix token for ${account.username}`);
        await this.logTokenIssue(account, 'token_fix_failed');
      }
    } catch (error) {
      console.error(`[TOKEN HEALTH] Error fixing token for ${account.username}:`, error);
      await this.logTokenIssue(account, 'token_fix_error', error.message);
    }
  }

  /**
   * Test Instagram token with a lightweight API call
   */
  async testInstagramToken(accessToken) {
    try {
      const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`);
      return response.ok;
    } catch (error) {
      console.error('[TOKEN HEALTH] Error testing Instagram token:', error);
      return false;
    }
  }

  /**
   * Log token issues for monitoring
   */
  async logTokenIssue(account, issueType, details = null) {
    const logEntry = {
      timestamp: new Date(),
      accountId: account.id,
      username: account.username,
      workspaceId: account.workspaceId,
      issueType,
      details,
      platform: 'instagram'
    };

    console.log(`[TOKEN HEALTH LOG] ${JSON.stringify(logEntry)}`);
    
    // You could also store this in a database table for monitoring
    // await storage.createTokenHealthLog(logEntry);
  }

  /**
   * Get health check statistics
   */
  getHealthStats() {
    return {
      totalWorkspacesChecked: this.lastHealthCheck.size,
      lastCheckTimes: Object.fromEntries(this.lastHealthCheck)
    };
  }
}

// Create and export singleton instance
const tokenHealthChecker = new TokenHealthChecker();

// Export the middleware function
const checkTokenHealth = (req, res, next) => tokenHealthChecker.checkTokenHealth(req, res, next);

export { checkTokenHealth, tokenHealthChecker };
export default TokenHealthChecker;