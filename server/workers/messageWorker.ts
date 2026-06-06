import { Worker, Job } from 'bullmq';
import { redisConnection, redisAvailable } from '../queues/metricsQueue';
import { MessageJobData } from '../queues/messageQueue';

export class MessageWorker {
  private static worker: Worker | null = null;
  private static storage: any;

  static async start(storage: any) {
    if (this.worker) return; // Already started
    this.storage = storage;

    if (!process.env.REDIS_URL && !process.env.KV_URL) {
      console.log('⚠️ No REDIS_URL configured, MessageWorker will not start');
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
        'message-processing',
        async (job: Job<MessageJobData>) => {
          return this.processMessageJob(job);
        },
        {
          connection,
          concurrency: 5, // Safe concurrency limit for Facebook API
          removeOnComplete: { count: 500 },
          removeOnFail: { count: 100 },
          lockDuration: 30000,
        }
      );

      this.setupEventHandlers();
      console.log('[MESSAGE_WORKER] ✅ Message worker started successfully');
    } catch (error) {
      console.error('[MESSAGE_WORKER] 🚨 Failed to start message worker:', error);
    }
  }

  private static setupEventHandlers() {
    if (!this.worker) return;

    this.worker.on('completed', (job) => {
      // console.log(`[MESSAGE_WORKER] ✅ Completed job ${job.id}`);
    });

    this.worker.on('failed', (job, err) => {
      console.error(`[MESSAGE_WORKER] 🚨 Failed job ${job?.id}:`, err);
    });

    this.worker.on('error', (err) => {
      console.error('[MESSAGE_WORKER] Worker error:', err);
    });
  }

  private static async processMessageJob(job: Job<MessageJobData>) {
    const { workspaceId, instagramAccountId, messagingItems } = job.data;
    console.log(`[MESSAGE_WORKER] Processing message job for workspace ${workspaceId}, account ${instagramAccountId}`);

    const { AutomationFunnelStateModel } = await import('../models/Automation/AutomationFunnelState');
    const { AutomationSystem } = await import('../automation-system');

    for (const item of messagingItems) {
      const senderId = item.sender?.id;
      let payload = null;
      
      try {
        const fs = await import('fs');
        fs.appendFileSync('webhook_debug.json', JSON.stringify({ item, time: new Date() }) + '\\n');
      } catch(e) {}

      if (item.postback && item.postback.payload) {
        payload = item.postback.payload;
      } 
      else if (item.message && item.message.quick_reply && item.message.quick_reply.payload) {
        payload = item.message.quick_reply.payload;
      }
      else if (item.message && item.message.text) {
        payload = item.message.text;
      }

      if (payload) {
        console.log(`[FUNNEL] Detected interaction payload: ${payload} from user ${senderId}`);
        
        if (payload.startsWith('FOLLOW_CHECK_')) {
          const commentId = payload.replace('FOLLOW_CHECK_', '');
          const state = await AutomationFunnelStateModel.findOneAndUpdate(
            { commentId: commentId, state: 'pending_follow' },
            { $set: { state: 'processing' } },
            { new: true }
          );

          if (state) {
            console.log(`[FUNNEL] Found pending funnel state! Verifying follower status...`);
            const autoSystem = new AutomationSystem(this.storage);
            
            const accounts = await this.storage.getSocialAccountsWithTokensInternal(workspaceId);
            const account = accounts.find((acc: any) => acc.accountId === instagramAccountId || acc.id === instagramAccountId);
            
            if (account && account.accessToken) {
              let isFollower = true;
              
              try {
                const url = `https://graph.facebook.com/v19.0/${senderId}?fields=is_user_follow_business&access_token=${account.accessToken}`;
                const res = await fetch(url);
                if (res.ok) {
                  const data = await res.json();
                  console.log(`[FUNNEL] Follower status for IGSID ${senderId}:`, data);
                  if (data && typeof data.is_user_follow_business === 'boolean') {
                    isFollower = data.is_user_follow_business;
                  }
                } else {
                  console.warn(`[FUNNEL] Failed to check follower status, falling back to soft-gate`, await res.text());
                }
              } catch (err) {
                console.warn(`[FUNNEL] Error checking follower status`, err);
              }
              
              if (isFollower) {
                console.log(`[FUNNEL] User IS a follower! Unlocking content...`);
                
                if (state.finalMessage) {
                  if (state.finalButtons && state.finalButtons.length > 0) {
                    const { registerCustomFunnelStates } = await import('../utils/funnelHelper');
                    await registerCustomFunnelStates({
                      commentId: state.commentId,
                      workspaceId: state.workspaceId,
                      instagramAccountId: state.accountId,
                      userId: state.participantId,
                      ruleId: state.ruleId,
                      buttons: state.finalButtons,
                      username: state.username,
                      variables: state.variables
                    });
                  }

                  const { VariableProcessor } = await import('../services/VariableProcessor');
                  // Use the full variables context if available, otherwise fallback to just username
                  const context = state.variables || { username: state.username || 'there' };
                  const finalMessage = VariableProcessor.processTemplate(state.finalMessage, context);

                  let success = false;
                  try {
                    success = await autoSystem.sendPrivateReply(
                      senderId, 
                      finalMessage, 
                      account.accessToken, 
                      state.finalButtons,
                      'id'
                    );
                    if (!success) throw new Error("API returned false for sendPrivateReply");
                  } catch (e) {
                    console.warn(`[FUNNEL] Follower gate message failed to send, reverting state for retry...`, e);
                    state.state = 'pending_follow';
                    await state.save();
                    throw e; // Let BullMQ retry
                  }
                  
                  state.state = 'completed';
                  await state.save();
                } else {
                  // No final message, just complete it
                  state.state = 'completed';
                  await state.save();
                }
              } else {
                console.log(`[FUNNEL] User is NOT a follower! Sending failure message...`);
                // Revert state back so they can try again
                state.state = 'pending_follow';
                await state.save();
                
                await autoSystem.sendPrivateReply(
                  senderId, 
                  "You need to follow the page first to unlock this link! 🔒 Please follow and try again.", 
                  account.accessToken, 
                  [
                    {
                      type: "web_url",
                      url: `https://instagram.com/${account.username || ''}`,
                      text: "Visit Profile"
                    },
                    {
                      type: "postback",
                      text: "I'm Following ✅",
                      payload: `FOLLOW_CHECK_${commentId}`
                    }
                  ],
                  'id'
                );
              }
            } else {
              console.warn(`[FUNNEL] No account or access token found to process follow gate`);
            }
          }
        } else {
          const customState = await AutomationFunnelStateModel.findOneAndUpdate(
            {
              participantId: senderId,
              $or: [
                { expectedPayload: payload },
                { buttonText: payload }
              ],
              state: 'pending_custom_reply'
            },
            { $set: { state: 'processing' } },
            { sort: { createdAt: -1 }, new: true }
          );

          if (customState) {
            console.log(`[FUNNEL] Found pending custom follow-up state! Delivering...`);

            if (customState.finalMessage) {
              const autoSystem = new AutomationSystem(this.storage);
              const accounts = await this.storage.getSocialAccountsWithTokensInternal(workspaceId);
              const account = accounts.find((acc: any) => acc.accountId === instagramAccountId || acc.id === instagramAccountId);
              
              if (account && account.accessToken) {
                console.log(`[FUNNEL] Sending custom follow-up message to IGSID: ${senderId}`);
                
                const { VariableProcessor } = await import('../services/VariableProcessor');
                const context = customState.variables || { username: customState.username || 'there' };
                const finalMessage = VariableProcessor.processTemplate(customState.finalMessage, context);
                
                let success = false;
                try {
                  success = await autoSystem.sendPrivateReply(
                    senderId, 
                    finalMessage, 
                    account.accessToken, 
                    customState.followUpButtons || customState.finalButtons,
                    'id'
                  );
                  if (!success) throw new Error("API returned false for sendPrivateReply");
                } catch (e) {
                  console.warn(`[FUNNEL] Custom message failed to send, reverting state for retry...`, e);
                  customState.state = 'pending_custom_reply';
                  await customState.save();
                  throw e; // Let BullMQ retry
                }
                
                customState.state = 'completed';
                await customState.save();
                console.log(`[FUNNEL] State marked as completed for user ${senderId}`);
                
                const followUpBtns = customState.followUpButtons || customState.finalButtons;
                if (followUpBtns && followUpBtns.length > 0) {
                  const { registerCustomFunnelStates } = await import('../utils/funnelHelper');
                  await registerCustomFunnelStates({
                    commentId: customState.commentId,
                    workspaceId: workspaceId,
                    instagramAccountId: instagramAccountId,
                    userId: senderId,
                    ruleId: customState.ruleId,
                    buttons: followUpBtns,
                    username: customState.username,
                    variables: customState.variables
                  });
                }
              }
            }
          }
        }
      }
    }

    return true;
  }

  static isRunning(): boolean {
    return this.worker !== null;
  }
}
