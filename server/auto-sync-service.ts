/**
 * Automatic Instagram Data Synchronization Service
 * Runs in background to keep Instagram data fresh without user intervention
 */

import { IStorage } from './storage';
import { DashboardCache } from './dashboard-cache';

class AutoSyncService {
  private storage: IStorage;
  private dashboardCache: DashboardCache;
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 60 * 1000; // Sync every 1 minute

  constructor(storage: IStorage) {
    this.storage = storage;
    this.dashboardCache = new DashboardCache(storage);
  }

  start() {
    console.log('[AUTO SYNC] ✅ Starting automatic Instagram data synchronization service...');
    console.log('[AUTO SYNC] Will sync data every 1 minute to ensure fresh metrics');
    
    // Start interval-based syncing for immediate data updates
    this.performAutoSync(); // Run immediately on startup
    this.syncInterval = setInterval(() => {
      this.performAutoSync();
    }, this.SYNC_INTERVAL_MS);
    
    console.log('[AUTO SYNC] ✅ Auto-sync service started successfully');
  }

  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[AUTO SYNC] Stopped automatic synchronization service');
    }
  }

  private async performAutoSync() {
    try {
      console.log('[AUTO SYNC] Performing automatic Instagram data sync across all workspaces...');
      
      // Get ALL workspaces by discovering from social accounts (better approach)
      let allWorkspaces: any[] = [];
      
      try {
        // First try to get all social accounts to discover workspaces
        const allSocialAccounts = await this.storage.getAllSocialAccounts();
        console.log(`[AUTO SYNC] Found ${allSocialAccounts.length} total social accounts`);
        
        // Extract unique workspace IDs from social accounts
        const workspaceIds = [...new Set(allSocialAccounts.map(acc => acc.workspaceId))];
        console.log(`[AUTO SYNC] Found ${workspaceIds.length} unique workspace IDs from social accounts`);
        
        // Get workspace details for each workspace ID
        for (const workspaceId of workspaceIds) {
          try {
            const workspace = await this.storage.getWorkspace(workspaceId);
            if (workspace) {
              allWorkspaces.push(workspace);
              console.log(`[AUTO SYNC] Found workspace: ${workspace.name || workspaceId}`);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            console.log(`[AUTO SYNC] Could not get workspace ${workspaceId}:`, errorMessage);
          }
        }
      } catch (error) {
        console.log('[AUTO SYNC] Fallback: trying common user IDs...');
        // Fallback: Get ALL workspaces by trying multiple user IDs (workaround since getAllWorkspaces doesn't exist)
        const userIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // Try more user IDs
        
        for (const userId of userIds) {
          try {
            const userWorkspaces = await this.storage.getWorkspacesByUserId(userId);
            if (userWorkspaces.length > 0) {
              allWorkspaces = allWorkspaces.concat(userWorkspaces);
              console.log(`[AUTO SYNC] Found ${userWorkspaces.length} workspaces for user ${userId}`);
            }
          } catch (error) {
            // Continue with other user IDs
          }
        }
      }
      
      // Remove duplicates based on workspace ID
      const uniqueWorkspaces = allWorkspaces.filter((workspace, index, self) => 
        index === self.findIndex(w => w.id === workspace.id)
      );
      
      allWorkspaces = uniqueWorkspaces;
      console.log(`[AUTO SYNC] Found ${allWorkspaces.length} unique workspaces to scan`);
      
      let totalAccounts = 0;
      let syncedAccounts = 0;
      
      for (const workspace of allWorkspaces) {
        try {
          console.log(`[AUTO SYNC] Scanning workspace: ${workspace.id} (${workspace.name || 'Unnamed'})`);
          
          // Use internal method that returns decrypted tokens
          const socialAccounts = await (this.storage as any).getSocialAccountsWithTokensInternal(workspace.id.toString());
          const instagramAccounts = socialAccounts.filter(
            (acc: any) => acc.platform === 'instagram' && acc.isActive && acc.accessToken
          );
          
          if (instagramAccounts.length > 0) {
            console.log(`[AUTO SYNC] Found ${instagramAccounts.length} Instagram accounts in workspace ${workspace.id}`);
            totalAccounts += instagramAccounts.length;
            
            for (const account of instagramAccounts) {
              try {
                console.log(`[AUTO SYNC] Syncing @${account.username} from workspace ${workspace.id}`);
                await this.syncInstagramAccount(account);
                syncedAccounts++;
                
                // Add delay to respect API rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
              } catch (error) {
                console.error(`[AUTO SYNC] Failed to sync @${account.username} from workspace ${workspace.id}:`, error);
              }
            }
          }
        } catch (workspaceError) {
          console.error(`[AUTO SYNC] Error scanning workspace ${workspace.id}:`, workspaceError);
          // Continue with other workspaces
        }
      }
      
      console.log(`[AUTO SYNC] Completed automatic sync cycle: ${syncedAccounts}/${totalAccounts} accounts synced across ${allWorkspaces.length} workspaces`);
    } catch (error: any) {
      console.error('[AUTO SYNC] Error during automatic sync:', error.message);
    }
  }

  private async syncInstagramAccount(account: any) {
    try {
      console.log(`[AUTO SYNC] Syncing Instagram account: @${account.username}`);

      // Fetch fresh data from Instagram API including profile picture
      const apiUrl = `https://graph.instagram.com/me?fields=account_type,followers_count,media_count,profile_picture_url&access_token=${account.accessToken}`;
      
      const response = await fetch(apiUrl);
      const data = await response.json();

      if (response.ok && data.followers_count !== undefined) {
        console.log(`[AUTO SYNC] Live data for @${account.username}:`, {
          followers: data.followers_count,
          mediaCount: data.media_count,
          profilePictureUrl: data.profile_picture_url
        });

        // Update database with fresh data including profile picture
        await this.storage.updateSocialAccount(account.id, {
          followersCount: data.followers_count,
          mediaCount: data.media_count,
          profilePictureUrl: data.profile_picture_url,
          lastSyncAt: new Date(),
          updatedAt: new Date()
        });

        // Clear cache to force refresh on next request
        this.dashboardCache.clearCache();

        console.log(`[AUTO SYNC] Successfully updated @${account.username} with followers: ${data.followers_count}`);
      } else {
        console.error(`[AUTO SYNC] Instagram API error for @${account.username}:`, data.error?.message || 'Unknown error');
      }
    } catch (error: any) {
      console.error(`[AUTO SYNC] Failed to sync @${account.username}:`, error.message);
    }
  }

  // Manual trigger for immediate sync
  async triggerSync(workspaceId?: string) {
    try {
      console.log('[AUTO SYNC] Manual sync triggered');
      
      if (workspaceId) {
        // Sync specific workspace
        const accounts = await this.storage.getSocialAccountsByWorkspace(workspaceId);
        const instagramAccount = accounts.find((acc: any) => acc.platform === 'instagram' && acc.isActive);
        
        if (instagramAccount) {
          await this.syncInstagramAccount(instagramAccount);
        }
      } else {
        // Sync all accounts
        await this.performAutoSync();
      }
    } catch (error: any) {
      console.error('[AUTO SYNC] Manual sync failed:', error.message);
      throw error;
    }
  }
}

export { AutoSyncService };