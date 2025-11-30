/**
 * Instagram Token Validator Service
 * Provides comprehensive token validation and automatic fixing for Instagram accounts
 */

import { tokenEncryption } from '../security/token-encryption.js';

class InstagramTokenValidator {
  constructor() {
    this.validationCache = new Map();
    this.cacheTimeout = 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Validate Instagram token and fix issues automatically
   */
  async validateAndFixToken(storage, workspaceId, forceRefresh = false) {
    try {
      console.log(`[INSTAGRAM VALIDATOR] Validating tokens for workspace: ${workspaceId}`);

      // Get Instagram accounts for this workspace
      const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
      const instagramAccounts = accounts.filter(acc => acc.platform === 'instagram');

      if (instagramAccounts.length === 0) {
        console.log(`[INSTAGRAM VALIDATOR] No Instagram accounts found for workspace: ${workspaceId}`);
        return { success: true, accounts: [], issues: [] };
      }

      const results = [];
      const issues = [];

      for (const account of instagramAccounts) {
        const result = await this.validateSingleAccount(storage, account, forceRefresh);
        results.push(result);
        
        if (!result.isValid) {
          issues.push({
            accountId: account.id,
            username: account.username,
            issue: result.issue,
            fixed: result.fixed
          });
        }
      }

      return {
        success: true,
        accounts: results,
        issues,
        totalAccounts: instagramAccounts.length,
        validAccounts: results.filter(r => r.isValid).length,
        fixedAccounts: results.filter(r => r.fixed).length
      };
    } catch (error) {
      console.error('[INSTAGRAM VALIDATOR] Error during validation:', error);
      return {
        success: false,
        error: error.message,
        accounts: [],
        issues: []
      };
    }
  }

  /**
   * Validate a single Instagram account
   */
  async validateSingleAccount(storage, account, forceRefresh = false) {
    const cacheKey = `${account.id}_${account.workspaceId}`;
    
    // Check cache unless force refresh
    if (!forceRefresh && this.validationCache.has(cacheKey)) {
      const cached = this.validationCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        console.log(`[INSTAGRAM VALIDATOR] Using cached result for ${account.username}`);
        return cached.result;
      }
    }

    console.log(`[INSTAGRAM VALIDATOR] Validating account: ${account.username}`);

    const result = {
      accountId: account.id,
      username: account.username,
      workspaceId: account.workspaceId,
      isValid: false,
      hasToken: false,
      tokenFormat: 'unknown',
      apiResponse: null,
      issue: null,
      fixed: false,
      timestamp: new Date()
    };

    try {
      // Step 1: Check if account has any token
      if (!account.accessToken) {
        result.issue = 'missing_access_token';
        console.warn(`[INSTAGRAM VALIDATOR] Account ${account.username} missing access token`);
        
        // Try to fix by getting token from database
        const fixed = await this.tryFixMissingToken(storage, account);
        if (fixed) {
          result.fixed = true;
          result.hasToken = true;
          result.tokenFormat = 'decrypted';
          // Re-validate with fixed token
          const revalidation = await this.validateSingleAccount(storage, { ...account, accessToken: fixed }, true);
          return revalidation;
        }
        
        this.cacheResult(cacheKey, result);
        return result;
      }

      result.hasToken = true;

      // Step 2: Check token format
      if (account.accessToken.includes('aes-256-gcm:')) {
        result.tokenFormat = 'encrypted';
        result.issue = 'encrypted_token_in_access_field';
        console.warn(`[INSTAGRAM VALIDATOR] Account ${account.username} has encrypted token in accessToken field`);
        
        // Try to fix encrypted token
        const fixed = await this.tryFixEncryptedToken(storage, account);
        if (fixed) {
          result.fixed = true;
          result.tokenFormat = 'decrypted';
          // Re-validate with fixed token
          const revalidation = await this.validateSingleAccount(storage, { ...account, accessToken: fixed }, true);
          return revalidation;
        }
        
        this.cacheResult(cacheKey, result);
        return result;
      }

      result.tokenFormat = 'decrypted';

      // Step 3: Test token with Instagram API
      const apiTest = await this.testInstagramAPI(account.accessToken);
      result.apiResponse = apiTest;

      if (apiTest.success) {
        result.isValid = true;
        console.log(`[INSTAGRAM VALIDATOR] Account ${account.username} token is valid`);
      } else {
        result.issue = 'invalid_token_api_failed';
        result.apiResponse = apiTest;
        console.warn(`[INSTAGRAM VALIDATOR] Account ${account.username} token failed API test:`, apiTest.error);
        
        // Try to refresh token if possible
        const refreshed = await this.tryRefreshToken(storage, account);
        if (refreshed) {
          result.fixed = true;
          result.isValid = true;
          console.log(`[INSTAGRAM VALIDATOR] Successfully refreshed token for ${account.username}`);
        }
      }

      this.cacheResult(cacheKey, result);
      return result;

    } catch (error) {
      console.error(`[INSTAGRAM VALIDATOR] Error validating account ${account.username}:`, error);
      result.issue = 'validation_error';
      result.apiResponse = { error: error.message };
      this.cacheResult(cacheKey, result);
      return result;
    }
  }

  /**
   * Try to fix missing token by checking database
   */
  async tryFixMissingToken(storage, account) {
    try {
      console.log(`[INSTAGRAM VALIDATOR] Trying to fix missing token for ${account.username}`);
      
      // Get raw account from database
      const SocialAccountModel = storage.SocialAccountModel;
      const rawAccount = await SocialAccountModel.findById(account.id);
      
      if (!rawAccount) {
        console.error(`[INSTAGRAM VALIDATOR] Could not find raw account for ${account.username}`);
        return null;
      }

      // Try to get token from encrypted fields
      let decryptedToken = null;

      if (rawAccount.encryptedAccessToken) {
        try {
          decryptedToken = tokenEncryption.decryptToken(rawAccount.encryptedAccessToken);
          console.log(`[INSTAGRAM VALIDATOR] Successfully decrypted encryptedAccessToken for ${account.username}`);
        } catch (error) {
          console.error(`[INSTAGRAM VALIDATOR] Failed to decrypt encryptedAccessToken:`, error);
        }
      }

      if (!decryptedToken && rawAccount.accessToken && rawAccount.accessToken.includes('aes-256-gcm:')) {
        try {
          decryptedToken = tokenEncryption.decryptToken(rawAccount.accessToken);
          console.log(`[INSTAGRAM VALIDATOR] Successfully decrypted accessToken for ${account.username}`);
        } catch (error) {
          console.error(`[INSTAGRAM VALIDATOR] Failed to decrypt accessToken:`, error);
        }
      }

      if (decryptedToken) {
        // Update account with decrypted token
        await SocialAccountModel.findByIdAndUpdate(account.id, {
          accessToken: decryptedToken,
          encryptedAccessToken: null, // Clear to prevent confusion
          lastTokenFix: new Date()
        });
        
        console.log(`[INSTAGRAM VALIDATOR] Fixed missing token for ${account.username}`);
        return decryptedToken;
      }

      return null;
    } catch (error) {
      console.error(`[INSTAGRAM VALIDATOR] Error fixing missing token for ${account.username}:`, error);
      return null;
    }
  }

  /**
   * Try to fix encrypted token in accessToken field
   */
  async tryFixEncryptedToken(storage, account) {
    try {
      console.log(`[INSTAGRAM VALIDATOR] Trying to fix encrypted token for ${account.username}`);
      
      // Try to decrypt the current accessToken
      let decryptedToken = null;
      
      try {
        decryptedToken = tokenEncryption.decryptToken(account.accessToken);
        console.log(`[INSTAGRAM VALIDATOR] Successfully decrypted token for ${account.username}`);
      } catch (error) {
        console.error(`[INSTAGRAM VALIDATOR] Failed to decrypt token:`, error);
        return null;
      }

      if (decryptedToken) {
        // Update account with decrypted token
        const SocialAccountModel = storage.SocialAccountModel;
        await SocialAccountModel.findByIdAndUpdate(account.id, {
          accessToken: decryptedToken,
          lastTokenFix: new Date()
        });
        
        console.log(`[INSTAGRAM VALIDATOR] Fixed encrypted token for ${account.username}`);
        return decryptedToken;
      }

      return null;
    } catch (error) {
      console.error(`[INSTAGRAM VALIDATOR] Error fixing encrypted token for ${account.username}:`, error);
      return null;
    }
  }

  /**
   * Try to refresh Instagram token
   */
  async tryRefreshToken(storage, account) {
    try {
      console.log(`[INSTAGRAM VALIDATOR] Trying to refresh token for ${account.username}`);
      
      // This would integrate with your existing token refresh logic
      // For now, we'll just log that refresh is needed
      console.log(`[INSTAGRAM VALIDATOR] Token refresh needed for ${account.username} - user should reconnect`);
      
      // Mark account as needing reconnection
      const SocialAccountModel = storage.SocialAccountModel;
      await SocialAccountModel.findByIdAndUpdate(account.id, {
        needsReconnection: true,
        lastTokenValidation: new Date()
      });
      
      return false; // Refresh not implemented yet
    } catch (error) {
      console.error(`[INSTAGRAM VALIDATOR] Error refreshing token for ${account.username}:`, error);
      return false;
    }
  }

  /**
   * Test Instagram API with token
   */
  async testInstagramAPI(accessToken) {
    try {
      console.log('[INSTAGRAM VALIDATOR] Testing Instagram API...');
      
      // Test with basic user info endpoint
      const response = await fetch(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`);
      
      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          data,
          status: response.status
        };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          error: errorData.error || 'API call failed',
          status: response.status,
          data: errorData
        };
      }
    } catch (error) {
      console.error('[INSTAGRAM VALIDATOR] Error testing Instagram API:', error);
      return {
        success: false,
        error: error.message,
        status: null
      };
    }
  }

  /**
   * Cache validation result
   */
  cacheResult(cacheKey, result) {
    this.validationCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Clear validation cache
   */
  clearCache(accountId = null) {
    if (accountId) {
      // Clear cache for specific account
      for (const [key] of this.validationCache) {
        if (key.startsWith(accountId)) {
          this.validationCache.delete(key);
        }
      }
    } else {
      // Clear all cache
      this.validationCache.clear();
    }
  }

  /**
   * Get validation statistics
   */
  getValidationStats() {
    return {
      cacheSize: this.validationCache.size,
      cacheTimeout: this.cacheTimeout,
      lastValidations: Array.from(this.validationCache.entries()).map(([key, value]) => ({
        key,
        timestamp: value.timestamp,
        isValid: value.result.isValid,
        username: value.result.username
      }))
    };
  }
}

// Create and export singleton instance
const instagramTokenValidator = new InstagramTokenValidator();

export { instagramTokenValidator };
export default InstagramTokenValidator;