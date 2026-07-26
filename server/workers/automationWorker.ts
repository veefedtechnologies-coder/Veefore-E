import { Worker, Job } from 'bullmq';
import { isRedisAvailable } from '../queues/metricsQueue';
import { AutomationJobData } from '../queues/automationQueue';
import type { IdempotencyGuard as IdempotencyGuardType } from '../services/IdempotencyGuard';
import type { AuditTrailService as AuditTrailServiceType } from '../services/AuditTrailService';

export class AutomationWorker {
  private static worker: Worker | null = null;
  private static storage: any = null;
  // Smart-polling hardening: idempotency + audit (constructed once, lazily).
  private static idempotencyGuard: IdempotencyGuardType | null = null;
  private static auditTrail: AuditTrailServiceType | null = null;

  /**
   * Lazily construct the shared IdempotencyGuard backed by the shared Redis
   * connection and a durable Mongo-backed CompletionStore (smart-polling Req
   * 10.x). Constructed once and reused across jobs.
   */
  private static async getIdempotencyGuard(): Promise<IdempotencyGuardType> {
    if (!this.idempotencyGuard) {
      const { getSharedRedisConnection } = await import('../lib/redis');
      const { IdempotencyGuard } = await import('../services/IdempotencyGuard');
      const { MongoCompletionStore } = await import('../models/Automation/IdempotencyCompletion');
      this.idempotencyGuard = new IdempotencyGuard(
        getSharedRedisConnection(),
        new MongoCompletionStore()
      );
    }
    return this.idempotencyGuard;
  }

  /**
   * Lazily construct the shared AuditTrailService (smart-polling Req 11.x).
   * Constructed once and reused across jobs.
   */
  private static async getAuditTrail(): Promise<AuditTrailServiceType> {
    if (!this.auditTrail) {
      const { AuditTrailService } = await import('../services/AuditTrailService');
      this.auditTrail = new AuditTrailService();
    }
    return this.auditTrail;
  }

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

  /**
   * Wrap a single reply side-effect (comment-reply or DM-reply) in the
   * idempotency guard and audit trail (smart-polling Req 10.5, 10.6, 11.4).
   *
   * Flow:
   *  - reserve(key):
   *      'already_completed' → skip the side-effect (do not re-send); report sent.
   *      'reserved'          → perform the side-effect; on success record completion.
   *      'unavailable'       → throw so BullMQ preserves/retries the job (the
   *                            side-effect is left un-performed — Req 10.5, 10.6).
   *  - After each performed attempt (success OR failure) persist exactly one
   *    audit record (Req 11.4). This is IN ADDITION to the existing logAction.
   *
   * @returns `{ sent }` — true when the side-effect succeeded or was already
   *          completed on a prior attempt, false when the attempt failed.
   */
  private static async runReplyWithGuards(opts: {
    accountId: string;
    ruleId: string;
    ruleName?: string;
    sourceSuffix: 'comment' | 'dm';
    actionType: 'comment_reply' | 'dm_reply';
    commentId: string;
    commentText: string;
    username: string;
    userId?: string;
    contentSent: string;
    perform: () => Promise<boolean>;
  }): Promise<{ sent: boolean }> {
    const { IdempotencyGuard } = await import('../services/IdempotencyGuard');
    const guard = await this.getIdempotencyGuard();
    const auditTrail = await this.getAuditTrail();

    const key = IdempotencyGuard.buildKey({
      accountId: opts.accountId,
      sourceId: `${opts.commentId}:${opts.sourceSuffix}`,
      ruleId: opts.ruleId,
    });

    const triggeringInput = {
      commentId: opts.commentId,
      commentText: opts.commentText,
      username: opts.username,
      userId: opts.userId,
    };

    const reservation = await guard.reserve(key);

    if (reservation.status === 'already_completed') {
      // Side-effect already performed on a previous attempt — do not re-send
      // and do not record a duplicate audit entry (Req 10.3, 10.6).
      console.log(`[AUTOMATION_WORKER] ↩️ ${opts.actionType} already completed for ${key}, skipping re-send`);
      return { sent: true };
    }

    if (reservation.status === 'unavailable') {
      // Idempotency store unreadable/unwritable — leave the side-effect
      // un-performed and surface an error so the job is preserved for retry
      // (Req 10.5, 10.6).
      throw new Error(
        `Idempotency store unavailable for ${opts.actionType} (${key}); preserving job for retry`
      );
    }

    // reservation.status === 'reserved' — we may perform the side-effect.
    let success = false;
    let failureReason: string | undefined;
    try {
      success = await opts.perform();
      if (!success) {
        failureReason = `${opts.actionType} send returned failure`;
      }
    } catch (error: any) {
      success = false;
      failureReason = error?.message || String(error);
    }

    if (success) {
      // The external Instagram send is the billable success boundary. Durable
      // completion bookkeeping is still important, but a failure here must not
      // refund a message that Instagram already accepted or retry the send.
      try {
        await guard.recordCompletion(key);
      } catch (error) {
        console.error(`[AUTOMATION_WORKER] ${opts.actionType} sent but completion bookkeeping failed for ${key}:`, error);
      }
    }

    // Audit is non-critical after the external side-effect. Record failures
    // best-effort so audit storage outages never change send/credit semantics.
    try {
      await auditTrail.record({
        targetAccountId: opts.accountId,
        ruleId: opts.ruleId,
        ruleName: opts.ruleName,
        actionType: opts.actionType,
        triggeringInput,
        contentSent: success ? opts.contentSent : undefined,
        outcome: success ? 'success' : 'failure',
        failureReason: success ? undefined : failureReason,
      });
    } catch (error) {
      console.error(`[AUTOMATION_WORKER] ${opts.actionType} audit write failed for ${key}:`, error);
    }

    return { sent: success };
  }

  private static async logActionBestEffort(autoSystem: any, ...args: any[]): Promise<void> {
    try {
      await autoSystem.logAction(...args);
    } catch (error) {
      // Logging happens after the external send outcome is known. It must not
      // trigger a retry or refund for a message that was already delivered.
      console.error('[AUTOMATION_WORKER] Action log write failed:', error);
    }
  }

  private static async processAutomationJob(job: Job<AutomationJobData>): Promise<any> {
    const data = job.data;
    // userId is optional on the job payload; normalize to a string for the
    // logAction calls below which require a defined targetUserId.
    const userId = data.userId ?? '';
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
        const workspace = await this.storage.getWorkspace(data.workspaceId);
        const creditUserId = workspace?.userId ? String(workspace.userId) : '';
        const { aiCreditMeteringService } = await import('../features/subscription/services/AICreditMeteringService');
        const reserveAICharge = async (
          feature: 'automationComment' | 'automationDm',
          actionId: string,
        ): Promise<string | undefined> => {
          if (!result.aiAssisted) return undefined;
          if (!creditUserId) throw new Error('Workspace owner unavailable for AI credit charge');
          const idempotencyKey = `automation:${data.commentId}:${actionId}`;
          // Reserve/deduct the fixed 0.3 before the irreversible Instagram
          // side-effect. A failed send is refunded exactly once below.
          await aiCreditMeteringService.settleCredits(feature, {
            userId: creditUserId,
            workspaceId: data.workspaceId,
            idempotencyKey,
          });
          return idempotencyKey;
        };
        const refundAICharge = async (idempotencyKey?: string) => {
          if (!idempotencyKey) return;
          await aiCreditMeteringService.refundSettlement(idempotencyKey);
        };

        // 1. Send public comment reply if present
        let commentReplySent = false;
        if (result.finalCommentReply) {
           const finalCommentReply = result.finalCommentReply;
           const commentCreditReservation = await reserveAICharge('automationComment', 'comment');
           let sent: boolean;
           try {
             ({ sent } = await this.runReplyWithGuards({
                accountId: data.instagramAccountId,
                ruleId: result.ruleId || 'unknown',
                ruleName: result.ruleName,
                sourceSuffix: 'comment',
                actionType: 'comment_reply',
                commentId: data.commentId,
                commentText: data.commentText,
                username: data.username,
                userId: data.userId,
                contentSent: finalCommentReply,
                perform: () => autoSystem.sendCommentReply(data.commentId, finalCommentReply, accessToken),
             }));
           } catch (error) {
             await refundAICharge(commentCreditReservation);
             throw error;
           }
           if (sent) {
              commentReplySent = true;
              await this.logActionBestEffort(autoSystem, result.ruleId || 'unknown', data.workspaceId, 'comment', data.commentText, finalCommentReply, userId, data.username, 'sent');
           } else {
              await refundAICharge(commentCreditReservation);
              await this.logActionBestEffort(autoSystem, result.ruleId || 'unknown', data.workspaceId, 'comment', data.commentText, finalCommentReply, userId, data.username, 'failed');
           }
        }

        // 2. Send private DM if present
        if (result.finalDM) {
           const finalDM = result.finalDM;
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
                    participantId: userId, // Commenter's user ID
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
              const gatedButtons: { text: string; url?: string; payload?: string }[] = [];
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
              const dmCreditReservation = await reserveAICharge('automationDm', 'dm');
              let sent: boolean;
              try {
                ({ sent } = await this.runReplyWithGuards({
                   accountId: data.instagramAccountId,
                   ruleId: result.ruleId || 'unknown',
                   ruleName: result.ruleName,
                   sourceSuffix: 'dm',
                   actionType: 'dm_reply',
                   commentId: data.commentId,
                   commentText: data.commentText,
                   username: data.username,
                   userId: data.userId,
                   contentSent: gatedMessage,
                   perform: () => autoSystem.sendPrivateReply(data.commentId, gatedMessage, accessToken, gatedButtons),
                }));
              } catch (error) {
                await refundAICharge(dmCreditReservation);
                throw error;
              }

              if (sent) {
                 await this.logActionBestEffort(autoSystem, result.ruleId || 'unknown', data.workspaceId, 'dm', data.commentText, gatedMessage, userId, data.username, 'sent');
              } else {
                 await refundAICharge(dmCreditReservation);
                 await this.logActionBestEffort(autoSystem, result.ruleId || 'unknown', data.workspaceId, 'dm', data.commentText, gatedMessage, userId, data.username, 'failed');
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
                    userId: userId,
                    ruleId: result.ruleId || 'unknown',
                    buttons: result.dmButtons,
                    username: data.username,
                    variables: context
                 });
              }
              
              const dmCreditReservation = await reserveAICharge('automationDm', 'dm');
              let sent: boolean;
              try {
                ({ sent } = await this.runReplyWithGuards({
                   accountId: data.instagramAccountId,
                   ruleId: result.ruleId || 'unknown',
                   ruleName: result.ruleName,
                   sourceSuffix: 'dm',
                   actionType: 'dm_reply',
                   commentId: data.commentId,
                   commentText: data.commentText,
                   username: data.username,
                   userId: data.userId,
                   contentSent: finalDM,
                   perform: () => autoSystem.sendPrivateReply(data.commentId, finalDM, accessToken, result.dmButtons),
                }));
              } catch (error) {
                await refundAICharge(dmCreditReservation);
                throw error;
              }
              if (sent) {
                 await this.logActionBestEffort(autoSystem, result.ruleId || 'unknown', data.workspaceId, 'dm', data.commentText, finalDM, userId, data.username, 'sent');
              } else {
                 await refundAICharge(dmCreditReservation);
                 await this.logActionBestEffort(autoSystem, result.ruleId || 'unknown', data.workspaceId, 'dm', data.commentText, finalDM, userId, data.username, 'failed');
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
