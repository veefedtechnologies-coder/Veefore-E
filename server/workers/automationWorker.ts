import { Worker, Job } from 'bullmq';
import { isRedisAvailable } from '../queues/metricsQueue';
import { AutomationJobData } from '../queues/automationQueue';

export class AutomationWorker {
  private static worker: Worker | null = null;
  private static storage: any = null;

  static async start(storage: any): Promise<void> {
    this.storage = storage;

    console.log('[AUTOMATION_WORKER] Starting comment automation worker...');

    if (!process.env.REDIS_URL && !process.env.KV_URL) {
      console.log('[AUTOMATION_WORKER] No REDIS_URL configured. Worker permanently disabled.');
      return;
    }

    try {
      const { getRedisOptions } = await import('../lib/redis');
      const redisUrl = process.env.REDIS_URL || process.env.KV_URL || process.env.STORAGE_REDIS_URL;

      if (!redisUrl) {
        throw new Error('Redis URL not configured');
      }

      const connectionConfig: any = {
        ...getRedisOptions(redisUrl),
        maxRetriesPerRequest: null,
      };

      const IORedis = (await import('ioredis')).default;
      const connection = new IORedis(redisUrl, connectionConfig);

      this.worker = new Worker(
        'automation-processing',
        async (job: Job<AutomationJobData>) => {
          return this.processAutomationJob(job);
        },
        {
          connection,
          concurrency: 5, // Process 5 comments concurrently
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 100 },
          lockDuration: 30000, // 30 seconds
        }
      );

      this.setupEventHandlers();
      console.log('[AUTOMATION_WORKER] ✅ Automation worker started successfully');
    } catch (error) {
      console.error('[AUTOMATION_WORKER] Failed to start worker:', error);
    }
  }

  static async stop(): Promise<void> {
    console.log('[AUTOMATION_WORKER] Stopping automation worker...');
    try {
      if (this.worker) {
        await this.worker.close();
        this.worker = null;
      }
      console.log('[AUTOMATION_WORKER] ✅ Automation worker stopped');
    } catch (error) {
      console.error('[AUTOMATION_WORKER] Error stopping worker:', error);
    }
  }

  private static async processAutomationJob(job: Job<AutomationJobData>): Promise<any> {
    const data = job.data;
    console.log(`[AUTOMATION_WORKER] Processing comment ${data.commentId} for account ${data.instagramAccountId}`);

    try {
      if (!this.storage) {
        throw new Error('Storage not initialized');
      }

      // Hand off to TriggerEngine
      const { TriggerEngine } = await import('../services/TriggerEngine');
      
      console.log(`[AUTOMATION_WORKER] Initiating TriggerEngine evaluation for comment: "${data.commentText}" by user: ${data.username}`);
      const result = await TriggerEngine.evaluateAndTrigger(data);
      
      if (result.matched) {
        console.log(`[AUTOMATION_WORKER] ✅ Comment matched rule: "${result.ruleName}" with intent: "${result.intent || result.matchedKeyword || 'any'}"`);
        
        // Fetch accessToken for this account
        const { SocialAccountModel } = await import('../models/Social');
        let account = await SocialAccountModel.findOne({ accountId: data.instagramAccountId });
        
        let accessToken = account?.accessToken;

        // Decrypt if needed
        if (!accessToken && account?.encryptedAccessToken) {
          try {
            const { tokenEncryption } = await import('../security/token-encryption');
            accessToken = tokenEncryption.decryptToken(account.encryptedAccessToken);
          } catch (e) {
            console.error('[AUTOMATION_WORKER] Failed to decrypt token', e);
          }
        }

        if (!accessToken) {
           console.error(`[AUTOMATION_WORKER] ❌ No access token found for account ${data.instagramAccountId}`);
           throw new Error('No access token available to send automation messages');
        }

        const { AutomationSystem } = await import('../automation-system');
        const autoSystem = new AutomationSystem(this.storage);

        // 1. Send public comment reply if present
        let commentReplySent = false;
        if (result.finalCommentReply) {
           const success = await autoSystem.sendCommentReply(data.commentId, result.finalCommentReply, accessToken);
           if (success) {
              commentReplySent = true;
              await autoSystem.logAction(result.ruleId || 'unknown', data.workspaceId, 'comment', data.commentText, result.finalCommentReply, data.userId, data.username, 'sent');
           } else {
              await autoSystem.logAction(result.ruleId || 'unknown', data.workspaceId, 'comment', data.commentText, result.finalCommentReply, data.userId, data.username, 'failed');
           }
        }

        // 2. Send private DM if present
        if (result.finalDM) {
           if (commentReplySent) {
              // Instagram sometimes needs a moment between commenting and DMing to register the interaction
              await new Promise(resolve => setTimeout(resolve, 2000));
           }
           
           let requireFollowerGate = false;

           if (result.followerGate && result.followerGate.enabled) {
              console.log(`[AUTOMATION_WORKER] 🔒 Follower Gate is ENABLED. Checking if user ${data.userId} already follows...`);
              
              let isFollower = false;
              try {
                const url = `https://graph.facebook.com/v19.0/${data.userId}?fields=is_user_follow_business&access_token=${accessToken}`;
                const res = await fetch(url);
                if (res.ok) {
                  const apiData = await res.json();
                  if (apiData && typeof apiData.is_user_follow_business === 'boolean') {
                    isFollower = apiData.is_user_follow_business;
                  }
                }
              } catch (err) {
                console.error(`[AUTOMATION_WORKER] Error checking follower status:`, err);
              }

              if (isFollower) {
                 console.log(`[AUTOMATION_WORKER] ✅ User is already a follower! Bypassing Follower Gate.`);
                 requireFollowerGate = false;
              } else {
                 requireFollowerGate = true;
              }
           }

           const context = {
              username: data.username,
              first_name: data.username,
              full_name: data.username,
              comment: data.commentText,
              platform: 'Instagram'
           };
           
           if (requireFollowerGate) {
              console.log(`[AUTOMATION_WORKER] Sending gated message.`);
              const { AutomationFunnelStateModel } = await import('../models/Automation/AutomationFunnelState');
              
              // Upsert the funnel state
              await AutomationFunnelStateModel.findOneAndUpdate(
                 { commentId: data.commentId },
                 {
                    workspaceId: data.workspaceId,
                    accountId: data.instagramAccountId,
                    participantId: data.userId, // Commenter's user ID
                    ruleId: result.ruleId,
                    state: 'pending_follow',
                    retryCount: 0,
                    finalMessage: result.finalDM,
                    finalButtons: result.dmButtons,
                    username: data.username,
                    variables: context
                 },
                 { upsert: true, new: true }
              );

              // Construct Gated Message Buttons
              const gatedButtons = [];
              if (result.followerGate!.visitProfileLabel) {
                 gatedButtons.push({
                    text: result.followerGate!.visitProfileLabel,
                    url: `https://instagram.com/${account?.username || 'instagram'}`
                 });
              }
              
              gatedButtons.push({
                 text: result.followerGate!.confirmLabel || "I'm Following ✅",
                 payload: `FOLLOW_CHECK_${data.commentId}` // Special payload to resume funnel
              });

              const rawGatedMessage = result.followerGate!.lockedMessage || "Please follow the page first to unlock the link 🔓";
              const { VariableProcessor } = await import('../services/VariableProcessor');
              const gatedMessage = VariableProcessor.processTemplate(rawGatedMessage, context);
              const success = await autoSystem.sendPrivateReply(data.commentId, gatedMessage, accessToken, gatedButtons);
              
              if (success) {
                 await autoSystem.logAction(result.ruleId || 'unknown', data.workspaceId, 'dm', data.commentText, gatedMessage, data.userId, data.username, 'sent');
              } else {
                 await autoSystem.logAction(result.ruleId || 'unknown', data.workspaceId, 'dm', data.commentText, gatedMessage, data.userId, data.username, 'failed');
                 throw new Error("Failed to send private reply for follower gate");
              }
           } else {
              // Normal Flow
              
              // Custom Funnel Follow-up Check
              if (result.dmButtons && result.dmButtons.length > 0) {
                 const { registerCustomFunnelStates } = await import('../utils/funnelHelper');
                 
                 await registerCustomFunnelStates({
                    commentId: data.commentId,
                    workspaceId: data.workspaceId,
                    instagramAccountId: data.instagramAccountId,
                    userId: data.userId,
                    ruleId: result.ruleId || 'unknown',
                    buttons: result.dmButtons,
                    username: data.username,
                    variables: context
                 });
              }
              
              const success = await autoSystem.sendPrivateReply(data.commentId, result.finalDM, accessToken, result.dmButtons);
              if (success) {
                 await autoSystem.logAction(result.ruleId || 'unknown', data.workspaceId, 'dm', data.commentText, result.finalDM, data.userId, data.username, 'sent');
              } else {
                 await autoSystem.logAction(result.ruleId || 'unknown', data.workspaceId, 'dm', data.commentText, result.finalDM, data.userId, data.username, 'failed');
                 throw new Error("Failed to send private reply for normal flow");
              }
           }
        }

      } else {
        console.log(`[AUTOMATION_WORKER] ⏭️ Comment did not match any active automation rules.`);
      }
      
      console.log(`[AUTOMATION_WORKER] Successfully processed comment ${data.commentId}`);
      return { status: 'success', processed: true };

    } catch (error: any) {
      console.error(`[AUTOMATION_WORKER] Error processing comment ${data.commentId}:`, error);
      throw error;
    }
  }

  private static setupEventHandlers(): void {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      // console.log(`[AUTOMATION_WORKER] Job ${job.id} completed`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[AUTOMATION_WORKER] ❌ Job ${job?.id} failed:`, err.message);
    });

    this.worker.on('error', (err) => {
      console.error('[AUTOMATION_WORKER] Worker error:', err);
    });
  }

  static isRunning(): boolean {
    return this.worker !== null;
  }
}

export default AutomationWorker;
