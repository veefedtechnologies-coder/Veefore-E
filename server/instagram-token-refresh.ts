import axios from 'axios';
import { storage } from './storage';

interface TokenRefreshResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
}

interface LongLivedTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export class InstagramTokenRefresh {
  private static readonly SHORT_LIVED_EXCHANGE_URL = 'https://api.instagram.com/oauth/access_token';
  private static readonly LONG_LIVED_REFRESH_URL = 'https://graph.instagram.com/refresh_access_token';
  private static readonly LONG_LIVED_EXCHANGE_URL = 'https://graph.instagram.com/access_token';

  /**
   * Exchange short-lived token for long-lived token (60 days)
   */
  static async exchangeForLongLivedToken(shortLivedToken: string): Promise<LongLivedTokenResponse> {
    try {
      console.log('[INSTAGRAM TOKEN] Exchanging short-lived token for long-lived token');
      
      const response = await axios.get(this.LONG_LIVED_EXCHANGE_URL, {
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: process.env.INSTAGRAM_APP_SECRET,
          access_token: shortLivedToken
        }
      });

      const data = response.data as LongLivedTokenResponse;
      console.log('[INSTAGRAM TOKEN] Successfully exchanged for long-lived token, expires in:', data.expires_in, 'seconds');
      
      return data;
    } catch (error: any) {
      console.error('[INSTAGRAM TOKEN] Failed to exchange for long-lived token:', error.response?.data || error.message);
      throw new Error('Failed to exchange for long-lived token');
    }
  }

  /**
   * Refresh long-lived token (extends for another 60 days)
   */
  static async refreshLongLivedToken(longLivedToken: string): Promise<LongLivedTokenResponse> {
    try {
      console.log('[INSTAGRAM TOKEN] Refreshing long-lived token');
      
      const response = await axios.get(this.LONG_LIVED_REFRESH_URL, {
        params: {
          grant_type: 'ig_refresh_token',
          access_token: longLivedToken
        }
      });

      const data = response.data as LongLivedTokenResponse;
      console.log('[INSTAGRAM TOKEN] Successfully refreshed long-lived token, expires in:', data.expires_in, 'seconds');
      
      return data;
    } catch (error: any) {
      console.error('[INSTAGRAM TOKEN] Failed to refresh long-lived token:', error.response?.data || error.message);
      throw new Error('Failed to refresh long-lived token');
    }
  }

  /**
   * Check if token needs refresh (refresh when less than 7 days remaining)
   */
  static shouldRefreshToken(expiresAt: Date | null): boolean {
    if (!expiresAt) return true;
    
    const now = new Date();
    const timeUntilExpiry = expiresAt.getTime() - now.getTime();
    const daysUntilExpiry = timeUntilExpiry / (1000 * 60 * 60 * 24);
    
    console.log('[INSTAGRAM TOKEN] Days until expiry:', Math.round(daysUntilExpiry));
    
    // Refresh when less than 7 days remaining
    return daysUntilExpiry < 7;
  }

  /**
   * Auto-refresh tokens for all Instagram accounts
   */
  static async refreshAllAccountTokens(): Promise<void> {
    try {
      console.log('[INSTAGRAM TOKEN] Starting auto-refresh for all Instagram accounts');
      
      // Get all Instagram accounts that need token refresh
      const accounts = await storage.getAllSocialAccounts();
      const instagramAccounts = accounts.filter(account => 
        account.platform === 'instagram' && 
        account.isActive &&
        this.shouldRefreshToken(account.expiresAt)
      );

      console.log('[INSTAGRAM TOKEN] Found', instagramAccounts.length, 'Instagram accounts needing token refresh');

      for (const account of instagramAccounts) {
        try {
          console.log('[INSTAGRAM TOKEN] Refreshing token for account:', account.username);
          
          // Refresh the long-lived token
          const refreshedData = await this.refreshLongLivedToken(account.accessToken);
          
          // Calculate new expiry date
          const newExpiresAt = new Date();
          newExpiresAt.setSeconds(newExpiresAt.getSeconds() + refreshedData.expires_in);
          
          // Update account with new token and expiry - handle both string and number IDs
          const accountId = typeof account.id === 'string' ? account.id : account.id.toString();
          await storage.updateSocialAccount(accountId, {
            accessToken: refreshedData.access_token,
            expiresAt: newExpiresAt,
            lastSyncAt: new Date(),
            updatedAt: new Date()
          });
          
          console.log('[INSTAGRAM TOKEN] Successfully refreshed token for account:', account.username);
          
        } catch (accountError: any) {
          console.error('[INSTAGRAM TOKEN] Failed to refresh token for account:', account.username, accountError.message);
          
          // Mark account as inactive if token refresh fails
          const accountId = typeof account.id === 'string' ? account.id : account.id.toString();
          await storage.updateSocialAccount(accountId, {
            isActive: false,
            updatedAt: new Date()
          });
        }
      }
      
      console.log('[INSTAGRAM TOKEN] Completed auto-refresh for all accounts');
      
    } catch (error: any) {
      console.error('[INSTAGRAM TOKEN] Error during auto-refresh:', error.message);
    }
  }

  /**
   * Refresh token for specific account
   */
  static async refreshAccountToken(accountId: string | number): Promise<boolean> {
    try {
      console.log('[INSTAGRAM TOKEN] Refreshing token for account ID:', accountId);
      
      const account = await storage.getSocialAccount(accountId);
      if (!account || account.platform !== 'instagram') {
        throw new Error('Instagram account not found');
      }
      
      // Refresh the long-lived token
      const refreshedData = await this.refreshLongLivedToken(account.accessToken);
      
      // Calculate new expiry date
      const newExpiresAt = new Date();
      newExpiresAt.setSeconds(newExpiresAt.getSeconds() + refreshedData.expires_in);
      
      // Update account with new token and expiry
      await storage.updateSocialAccount(accountId, {
        accessToken: refreshedData.access_token,
        expiresAt: newExpiresAt,
        isActive: true,
        lastSyncAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log('[INSTAGRAM TOKEN] Successfully refreshed token for account:', account.username);
      return true;
      
    } catch (error: any) {
      console.error('[INSTAGRAM TOKEN] Failed to refresh token for account:', accountId, error.message);
      return false;
    }
  }

  /**
   * Process initial short-lived token and convert to long-lived
   */
  static async processInitialToken(shortLivedToken: string, accountId: string): Promise<boolean> {
    try {
      console.log('[INSTAGRAM TOKEN] Processing initial short-lived token for account:', accountId);
      
      // Exchange short-lived for long-lived token
      const longLivedData = await this.exchangeForLongLivedToken(shortLivedToken);
      
      // Calculate expiry date
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + longLivedData.expires_in);
      
      // Update account with long-lived token
      await storage.updateSocialAccount(accountId, {
        accessToken: longLivedData.access_token,
        expiresAt: expiresAt,
        isActive: true,
        lastSyncAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log('[INSTAGRAM TOKEN] Successfully processed initial token for account:', accountId);
      return true;
      
    } catch (error: any) {
      console.error('[INSTAGRAM TOKEN] Failed to process initial token:', error.message);
      return false;
    }
  }
}