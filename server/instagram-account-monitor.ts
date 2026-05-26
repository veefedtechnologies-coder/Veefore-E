import { IStorage } from './storage';
import { InstagramSmartPolling } from './instagram-smart-polling';

/**
 * Monitor for new Instagram account connections and automatically start polling
 */
export class InstagramAccountMonitor {
  private storage: IStorage;
  private smartPolling: InstagramSmartPolling;
  private knownAccounts: Set<string> = new Set();
  private monitorInterval: NodeJS.Timeout | null = null;

  constructor(storage: IStorage, smartPolling: InstagramSmartPolling) {
    this.storage = storage;
    this.smartPolling = smartPolling;
    this.startMonitoring();
  }

  /**
   * Start monitoring for new Instagram account connections
   */
  private startMonitoring(): void {
    console.log('[ACCOUNT MONITOR] 👀 Starting Instagram account monitoring...');

    // Check for new accounts every 30 seconds
    this.monitorInterval = setInterval(async () => {
      await this.checkForNewAccounts();
    }, 30 * 1000);

    // Initial check
    this.checkForNewAccounts();
  }

  /**
   * Check for newly connected Instagram accounts
   */
  private async checkForNewAccounts(): Promise<void> {
    try {
      // Get all active Instagram accounts
      const storage = this.storage as any;
      if (!storage.SocialAccount) return;

      const instagramAccounts = await storage.SocialAccount.find({
        platform: 'instagram',
        isActive: true,
        accessToken: { $exists: true, $ne: null }
      }).lean();

      for (const account of instagramAccounts) {
        const accountKey = account.accountId || account._id.toString();

        if (!this.knownAccounts.has(accountKey)) {
          console.log(`[ACCOUNT MONITOR] 🆕 New Instagram account detected: @${account.username}`);
          this.knownAccounts.add(accountKey);
        }

        // P4-FIX: Always call setupAccountPolling. 
        // SmartPolling will check if the token actually changed to prevent duplicate loops.
        await this.smartPolling.setupAccountPolling({
          id: account._id.toString(),
          accountId: account.accountId,
          workspaceId: account.workspaceId,
          username: account.username,
          platform: account.platform,
          accessToken: account.accessToken,
          isActive: account.isActive,
          followersCount: account.followersCount || 0
        });
      }

      // CHECK FOR REMOVED/DISCONNECTED ACCOUNTS
      // Create a set of currently active account keys from the DB results
      const currentActiveKeys = new Set(instagramAccounts.map((acc: any) => acc.accountId || acc._id.toString()));

      // Check for accounts that are in our known list but no longer in the active list from DB
      // We must copy the KnownAccounts to an array to iterate safely while modifying
      for (const knownKey of Array.from(this.knownAccounts)) {
        if (!currentActiveKeys.has(knownKey)) {
          console.log(`[ACCOUNT MONITOR] 🔌 Account ${knownKey} no longer active/connected in DB. Stopping polling...`);

          // Stop polling for this disconnected account
          this.smartPolling.stopPolling(knownKey);

          // Remove from local tracking
          this.knownAccounts.delete(knownKey);

          console.log(`[ACCOUNT MONITOR] ✅ Cleanup complete for ${knownKey}`);
        }
      }
    } catch (error) {
      console.error('[ACCOUNT MONITOR] Error checking for new accounts:', error);
    }
  }

  /**
   * Notify monitor of account disconnection
   */
  notifyAccountDisconnected(accountId: string): void {
    this.knownAccounts.delete(accountId);
    console.log(`[ACCOUNT MONITOR] 🔌 Account ${accountId} disconnected, removed from monitoring`);
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    console.log('[ACCOUNT MONITOR] ⏹️ Stopped Instagram account monitoring');
  }
}