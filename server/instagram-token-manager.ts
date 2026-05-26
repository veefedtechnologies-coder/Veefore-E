import { MongoStorage } from './mongodb-storage';
import axios from 'axios';

export class InstagramTokenManager {
  private storage: MongoStorage;

  constructor(storage: MongoStorage) {
    this.storage = storage;
  }

  // Get valid access token for Instagram account
  async getValidAccessToken(workspaceId: string): Promise<string | null> {
    console.log('[TOKEN MANAGER] Getting valid access token for workspace:', workspaceId);
    
    try {
      // Get Instagram accounts for workspace
      const accounts = await this.storage.getSocialAccountsByWorkspace(workspaceId);
      const instagramAccount = accounts.find(acc => acc.platform === 'instagram');
      
      if (!instagramAccount || !instagramAccount.accessToken) {
        console.log('[TOKEN MANAGER] No Instagram account or access token found');
        return null;
      }

      // Check if token is valid
      const isValid = await this.validateToken(instagramAccount.accessToken);
      
      if (isValid) {
        console.log('[TOKEN MANAGER] Token is valid, returning existing token');
        return instagramAccount.accessToken;
      }

      // Attempt to refresh token
      console.log('[TOKEN MANAGER] Token invalid, attempting refresh');
      const refreshedToken = await this.refreshAccessToken(instagramAccount.accessToken);
      
      if (refreshedToken) {
        // Update stored token
        await this.storage.updateSocialAccount(instagramAccount.id, {
          accessToken: refreshedToken,
          updatedAt: new Date()
        });
        
        console.log('[TOKEN MANAGER] Token refreshed and updated');
        return refreshedToken;
      }

      console.log('[TOKEN MANAGER] Token refresh failed');
      return null;
    } catch (error) {
      console.error('[TOKEN MANAGER ERROR] Failed to get valid token:', error);
      return null;
    }
  }

  // Validate Instagram access token and check expiration
  private async validateToken(accessToken: string): Promise<boolean> {
    console.log('[TOKEN MANAGER] Validating Instagram access token');
    
    try {
      // Check token info and expiration
      const response = await axios.get(`https://graph.instagram.com/me?fields=id,username&access_token=${accessToken}`);
      
      if (response.status === 200 && response.data.id) {
        console.log('[TOKEN MANAGER] Token is valid and active');
        return true;
      }
      
      return false;
    } catch (error: any) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      console.log('[TOKEN MANAGER] Token validation failed:', errorMessage);
      
      // Check for specific expiration errors
      if (errorMessage.includes('expired') || errorMessage.includes('Cannot parse access token')) {
        console.log('[TOKEN MANAGER] Token has expired');
      }
      
      return false;
    }
  }

  // Refresh Instagram long-lived access token
  private async refreshAccessToken(currentToken: string): Promise<string | null> {
    console.log('[TOKEN MANAGER] Refreshing Instagram access token');
    
    try {
      const response = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: process.env.INSTAGRAM_APP_ID,
          client_secret: process.env.INSTAGRAM_APP_SECRET,
          fb_exchange_token: currentToken
        }
      });

      if (response.data.access_token) {
        console.log('[TOKEN MANAGER] Token refreshed successfully');
        return response.data.access_token;
      }

      console.log('[TOKEN MANAGER] No new token in refresh response');
      return null;
    } catch (error: any) {
      console.error('[TOKEN MANAGER] Token refresh failed:', error.response?.data || error.message);
      return null;
    }
  }

  // Get Instagram page access token for messaging
  async getPageAccessToken(workspaceId: string): Promise<{ pageId: string; accessToken: string } | null> {
    console.log('[TOKEN MANAGER] Getting Instagram page access token');
    
    try {
      const userToken = await this.getValidAccessToken(workspaceId);
      if (!userToken) {
        return null;
      }

      // Get user's pages
      const pagesResponse = await axios.get(`https://graph.facebook.com/v18.0/me/accounts?access_token=${userToken}`);
      
      if (pagesResponse.data.data && pagesResponse.data.data.length > 0) {
        const page = pagesResponse.data.data[0]; // Use first page
        
        // Get Instagram business account connected to this page
        const igResponse = await axios.get(`https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`);
        
        if (igResponse.data.instagram_business_account) {
          return {
            pageId: igResponse.data.instagram_business_account.id,
            accessToken: page.access_token
          };
        }
      }

      console.log('[TOKEN MANAGER] No Instagram business account found');
      return null;
    } catch (error: any) {
      console.error('[TOKEN MANAGER ERROR] Failed to get page token:', error.response?.data || error.message);
      return null;
    }
  }

  // Check token expiry and refresh if needed
  async ensureValidToken(workspaceId: string): Promise<boolean> {
    console.log('[TOKEN MANAGER] Ensuring valid token for workspace:', workspaceId);
    
    try {
      const token = await this.getValidAccessToken(workspaceId);
      return token !== null;
    } catch (error) {
      console.error('[TOKEN MANAGER ERROR] Failed to ensure valid token:', error);
      return false;
    }
  }
}