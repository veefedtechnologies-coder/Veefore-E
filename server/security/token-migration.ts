/**
 * P2-2 SECURITY: Enhanced Token Encryption at Rest
 * 
 * Migrates legacy plain text tokens to encrypted storage
 * and implements automatic encryption for all new tokens
 */

import { TokenEncryptionService } from './token-encryption';

/**
 * P2-2.1: Token migration and encryption service
 */
export class TokenMigrationService {
  private static encryptionService = new TokenEncryptionService();

  /**
   * Migrate plain text social media tokens to encrypted storage
   */
  static async migrateSocialAccountTokens(): Promise<{
    migrated: number;
    errors: number;
    skipped: number;
  }> {
    let migrated = 0;
    let errors = 0;
    let skipped = 0;

    try {
      console.log('🔐 P2-2: Starting social media token migration...');
      
      // Import mongoose here to avoid circular dependencies
      const { default: mongoose } = await import('mongoose');
      
      // Get all social accounts with plain text tokens
      const SocialAccount = mongoose.model('SocialAccount');
      const accounts = await SocialAccount.find({
        $or: [
          { accessToken: { $exists: true, $ne: null, $type: 'string' } },
          { refreshToken: { $exists: true, $ne: null, $type: 'string' } }
        ],
        // Only migrate accounts that don't already have encrypted tokens
        encryptedAccessToken: { $exists: false }
      });

      console.log(`🔐 P2-2: Found ${accounts.length} accounts with plain text tokens`);

      for (const account of accounts) {
        try {
          const updates: any = {};
          
          // Encrypt access token if present
          if (account.accessToken && typeof account.accessToken === 'string') {
            const encryptedAccess = await TokenMigrationService.encryptionService.encryptToken(
              account.accessToken
            );
            updates.encryptedAccessToken = JSON.stringify(encryptedAccess);
            updates.$unset = { accessToken: 1 }; // Remove plain text token
          }

          // Encrypt refresh token if present
          if (account.refreshToken && typeof account.refreshToken === 'string') {
            const encryptedRefresh = await TokenMigrationService.encryptionService.encryptToken(
              account.refreshToken
            );
            updates.encryptedRefreshToken = JSON.stringify(encryptedRefresh);
            if (!updates.$unset) updates.$unset = {};
            updates.$unset.refreshToken = 1; // Remove plain text token
          }

          if (Object.keys(updates).length > 1) { // More than just $unset
            await SocialAccount.updateOne({ _id: account._id }, updates);
            migrated++;
            console.log(`✅ P2-2: Encrypted tokens for ${account.platform}/@${account.username}`);
          } else {
            skipped++;
          }

        } catch (error) {
          console.error(`❌ P2-2: Failed to encrypt tokens for ${account.platform}/@${account.username}:`, error);
          errors++;
        }
      }

      console.log(`🔐 P2-2: Token migration complete - ${migrated} migrated, ${errors} errors, ${skipped} skipped`);
      
      return { migrated, errors, skipped };

    } catch (error) {
      console.error('🚨 P2-2: Token migration failed:', error);
      return { migrated, errors: errors + 1, skipped };
    }
  }

  /**
   * Decrypt social media tokens for API usage
   */
  static async decryptSocialAccountTokens(encryptedData: {
    encryptedAccessToken?: string;
    encryptedRefreshToken?: string;
  }): Promise<{
    accessToken?: string;
    refreshToken?: string;
  }> {
    const result: any = {};

    try {
      if (encryptedData.encryptedAccessToken) {
        const parsedAccess = JSON.parse(encryptedData.encryptedAccessToken);
        result.accessToken = await TokenMigrationService.encryptionService.decryptToken(parsedAccess);
      }

      if (encryptedData.encryptedRefreshToken) {
        const parsedRefresh = JSON.parse(encryptedData.encryptedRefreshToken);
        result.refreshToken = await TokenMigrationService.encryptionService.decryptToken(parsedRefresh);
      }

      return result;
    } catch (error) {
      console.error('🚨 P2-2: Token decryption failed:', error);
      return {};
    }
  }

  /**
   * Encrypt new social media tokens before storage
   */
  static async encryptNewTokens(tokens: {
    accessToken?: string;
    refreshToken?: string;
  }): Promise<{
    encryptedAccessToken?: string;
    encryptedRefreshToken?: string;
  }> {
    const result: any = {};

    try {
      if (tokens.accessToken) {
        const encryptedAccess = await TokenMigrationService.encryptionService.encryptToken(
          tokens.accessToken
        );
        result.encryptedAccessToken = JSON.stringify(encryptedAccess);
      }

      if (tokens.refreshToken) {
        const encryptedRefresh = await TokenMigrationService.encryptionService.encryptToken(
          tokens.refreshToken
        );
        result.encryptedRefreshToken = JSON.stringify(encryptedRefresh);
      }

      return result;
    } catch (error) {
      console.error('🚨 P2-2: Token encryption failed:', error);
      return {};
    }
  }
}

/**
 * P2-2.2: Automatic token encryption middleware
 */
export function tokenEncryptionMiddleware() {
  return async function(req: any, res: any, next: any) {
    const originalSend = res.send;
    
    // Intercept response to ensure tokens are not leaked
    res.send = function(data: any) {
      if (typeof data === 'string') {
        try {
          const parsed = JSON.parse(data);
          
          // Remove any plain text tokens from responses
          if (Array.isArray(parsed)) {
            parsed.forEach(item => {
              if (item.accessToken) delete item.accessToken;
              if (item.refreshToken) delete item.refreshToken;
            });
          } else if (parsed && typeof parsed === 'object') {
            if (parsed.accessToken) delete parsed.accessToken;
            if (parsed.refreshToken) delete parsed.refreshToken;
          }
          
          data = JSON.stringify(parsed);
        } catch (e) {
          // Not JSON, proceed normally
        }
      }
      
      return originalSend.call(this, data);
    };
    
    next();
  };
}

/**
 * P2-2.3: Initialize token encryption system
 */
export async function initializeTokenEncryption(): Promise<void> {
  console.log('🔐 P2-2: Initializing enhanced token encryption system...');
  
  try {
    // Run migration for existing tokens
    const migrationResult = await TokenMigrationService.migrateSocialAccountTokens();
    
    console.log('🔐 P2-2: Enhanced Token Encryption Features:');
    console.log('  ✅ AES-256-GCM encryption for all social media tokens');
    console.log('  ✅ Automatic migration of legacy plain text tokens');
    console.log('  ✅ Response filtering to prevent token leakage');
    console.log('  ✅ Secure token storage with integrity verification');
    console.log(`🔐 P2-2: Migration Results: ${migrationResult.migrated} encrypted, ${migrationResult.errors} errors`);
    console.log('🔐 P2-2: Token encryption system ready for production');
    
  } catch (error) {
    console.error('🚨 P2-2: Failed to initialize token encryption:', error);
  }
}

/**
 * P2-2.4: Scheduled token re-encryption (security hygiene)
 */
export function scheduleTokenReEncryption(): void {
  // TEMPORARILY DISABLED: This function was causing an infinite loop
  // TODO: Fix the scheduling mechanism before re-enabling
  console.log('🔐 P2-2: Token re-encryption scheduling temporarily disabled due to infinite loop bug');
  
  // // Re-encrypt all tokens monthly for security hygiene
  // const REENCRYPTION_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days
  //
  // // Only schedule in production, skip in development to avoid console spam
  // if (process.env.NODE_ENV === 'production') {
  //   setInterval(async () => {
  //     console.log('🔐 P2-2: Starting scheduled token re-encryption...');
  //     try {
  //       await TokenMigrationService.migrateSocialAccountTokens();
  //       console.log('✅ P2-2: Scheduled token re-encryption completed');
  //     } catch (error) {
  //       console.error('🚨 P2-2: Scheduled token re-encryption failed:', error);
  //     }
  //   }, REENCRYPTION_INTERVAL);
  //
  //   console.log('🔐 P2-2: Scheduled token re-encryption initialized (monthly)');
  // } else {
  //   console.log('🔐 P2-2: Token re-encryption scheduling skipped in development mode');
  // }
}