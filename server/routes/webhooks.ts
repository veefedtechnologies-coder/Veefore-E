import express from 'express';
import crypto from 'crypto';
import { MetricsQueueManager } from '../queues/metricsQueue';

const router = express.Router();

// Middleware to verify Instagram webhook signature
const verifyWebhookSignature = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    const payload = JSON.stringify(req.body);
    
    // Get webhook secret from environment or database
    const webhookSecret = process.env.INSTAGRAM_WEBHOOK_SECRET || 'default-webhook-secret';
    
    if (!signature) {
      console.warn('⚠️ Webhook received without signature');
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Verify signature with proper buffer length handling
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');
    
    const receivedSignature = signature.replace('sha256=', '');

    // Ensure both signatures are the same length before comparison
    if (expectedSignature.length !== receivedSignature.length) {
      console.error('🚨 Webhook signature length mismatch');
      return res.status(401).json({ error: 'Invalid signature length' });
    }

    if (!crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(receivedSignature))) {
      console.error('🚨 Webhook signature verification failed');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    console.log('✅ Webhook signature verified');
    next();
  } catch (error) {
    console.error('🚨 Webhook signature verification error:', error);
    res.status(500).json({ error: 'Signature verification failed' });
  }
};

/**
 * GET /api/webhooks/instagram
 * Webhook verification endpoint for Instagram
 */
router.get('/instagram', (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || 'veefore-webhook-token';

    console.log('🔔 Instagram webhook verification request received');
    console.log('Mode:', mode);
    console.log('Token received:', token);
    console.log('Expected token:', verifyToken);
    console.log('Challenge:', challenge);

    // Verify the webhook - be more flexible with token comparison
    if (mode === 'subscribe' && token && token.toString() === verifyToken) {
      console.log('✅ Instagram webhook verified successfully');
      res.status(200).send(challenge?.toString() || 'OK');
    } else {
      console.error('❌ Instagram webhook verification failed');
      console.error(`Expected: mode='subscribe' && token='${verifyToken}'`);
      console.error(`Received: mode='${mode}' && token='${token}'`);
      res.status(403).json({ error: 'Webhook verification failed' });
    }
  } catch (error) {
    console.error('🚨 Webhook verification error:', error);
    res.status(500).json({ error: 'Verification error' });
  }
});

/**
 * POST /api/webhooks/instagram
 * Handle Instagram webhook events
 */
router.post('/instagram', verifyWebhookSignature, async (req, res) => {
  try {
    const { object, entry } = req.body;

    console.log('🔔 Instagram webhook event received');
    console.log('Object:', object);
    console.log('Entry count:', entry?.length || 0);

    // Acknowledge receipt immediately
    res.status(200).json({ status: 'received' });

    // Process webhook events asynchronously
    if (object === 'instagram' && entry && Array.isArray(entry)) {
      for (const entryItem of entry) {
        await processWebhookEntry(entryItem);
      }
    } else {
      console.warn('⚠️ Unknown webhook object type:', object);
    }

  } catch (error) {
    console.error('🚨 Error processing webhook:', error);
    // Still return 200 to avoid Instagram retrying
    res.status(200).json({ status: 'error', message: 'Processing failed' });
  }
});

/**
 * Process individual webhook entry
 */
async function processWebhookEntry(entry: any): Promise<void> {
  try {
    const { id: instagramAccountId, changes } = entry;

    if (!instagramAccountId || !changes || !Array.isArray(changes)) {
      console.warn('⚠️ Invalid webhook entry format');
      return;
    }

    console.log(`📱 Processing webhook for Instagram account: ${instagramAccountId}`);

    // Query SocialAccount directly by accountId (uses index for O(1) lookup)
    const { SocialAccountModel } = await import('../models/Social/SocialAccount');
    const socialAccount = await SocialAccountModel.findOne({ 
      accountId: instagramAccountId,
      platform: 'instagram',
      isActive: true 
    }).lean();

    if (!socialAccount) {
      console.warn(`⚠️ No social account found for Instagram account: ${instagramAccountId}`);
      return;
    }

    const workspaceId = socialAccount.workspaceId?.toString();
    if (!workspaceId) {
      console.warn(`⚠️ No workspace found for social account: ${instagramAccountId}`);
      return;
    }

    // Process each change in the entry
    for (const change of changes) {
      await processWebhookChange(workspaceId, instagramAccountId, change);
    }

  } catch (error) {
    console.error('🚨 Error processing webhook entry:', error);
  }
}

/**
 * Process individual webhook change
 */
export async function processWebhookChange(
  workspaceId: string, 
  instagramAccountId: string, 
  change: any
): Promise<void> {
  try {
    const { field, value } = change;

    console.log(`🔄 Processing webhook change - Field: ${field}, Account: ${instagramAccountId}`);
    console.log(`🔄 Webhook change details:`, { workspaceId, instagramAccountId, field, value });

    switch (field) {
      case 'comments':
        console.log(`💬 Calling handleCommentWebhook for workspace ${workspaceId}`);
        await handleCommentWebhook(workspaceId, instagramAccountId, value);
        console.log(`✅ handleCommentWebhook completed for workspace ${workspaceId}`);
        break;

      case 'mentions':
        await handleMentionWebhook(workspaceId, instagramAccountId, value);
        break;

      case 'story_insights':
        await handleStoryInsightsWebhook(workspaceId, instagramAccountId, value);
        break;

      case 'messages':
        await handleMessageWebhook(workspaceId, instagramAccountId, value);
        break;

      case 'media':
        await handleMediaUpdateWebhook(workspaceId, instagramAccountId, value);
        break;

      case 'account_review_status':
        await handleAccountReviewWebhook(workspaceId, instagramAccountId, value);
        break;

      case 'live_comments':
        await handleLiveCommentWebhook(workspaceId, instagramAccountId, value);
        break;

      default:
        console.log(`ℹ️ Unhandled webhook field: ${field}`);
        // Still queue a general metrics update
        await MetricsQueueManager.processWebhookEvent(
          workspaceId,
          instagramAccountId,
          { field, value },
          'generic'
        );
    }

  } catch (error) {
    console.error('🚨 Error processing webhook change:', error);
  }
}

/**
 * Handle comment webhook events
 */
async function handleCommentWebhook(
  workspaceId: string,
  instagramAccountId: string,
  value: any
): Promise<void> {
  console.log(`💬 Processing comment webhook for account: ${instagramAccountId}`);

  // IMMEDIATE DATABASE UPDATE: Increment total comments count
  try {
    const { storage } = await import('../mongodb-storage');
    const accounts = await storage.getSocialAccountsByWorkspace(workspaceId);
    const account = accounts.find((acc: any) => acc.accountId === instagramAccountId || acc.id === instagramAccountId);
    
    if (account) {
      const currentTotalComments = account.totalComments || 0;
      const newTotalComments = currentTotalComments + 1;
      
      // Update total comments immediately
      await storage.updateSocialAccount(account.id, {
        totalComments: newTotalComments,
        avgComments: account.mediaCount > 0 ? Math.round(newTotalComments / account.mediaCount) : 0,
        lastSyncAt: new Date()
      });
      
      console.log(`📊 IMMEDIATE UPDATE: Total comments ${currentTotalComments} → ${newTotalComments} for @${account.username}`);
    }
  } catch (error) {
    console.error('Failed to update total comments immediately:', error);
  }

  // Queue webhook processing job for comprehensive metrics update
  await MetricsQueueManager.processWebhookEvent(
    workspaceId,
    instagramAccountId,
    {
      type: 'comment',
      media_id: value.media_id,
      comment_id: value.id,
      text: value.text,
      created_time: value.created_time,
      from: value.from
    },
    'comments'
  );

  // Broadcast to frontend via WebSocket for immediate updates
  try {
    const { RealtimeService } = await import('../services/realtime');
    const broadcastData = {
      type: 'instagram_comment',
      accountId: instagramAccountId,
      mediaId: value.media_id,
      commentId: value.id,
      text: value.text,
      from: value.from,
      timestamp: new Date()
    };
    
    console.log(`🚀 WEBHOOK DEBUG: About to broadcast comment webhook`);
    console.log(`🚀 WEBHOOK DEBUG: Broadcast data:`, JSON.stringify(broadcastData, null, 2));
    
    // Broadcast to both workspaces to ensure frontend receives events
    const workspacesToBroadcast = [
      workspaceId, // Original workspace from webhook
      '684402c2fd2cd4eb6521b386' // Frontend workspace
    ];
    
    for (const wsId of workspacesToBroadcast) {
      console.log(`📢 WEBHOOK DEBUG: Broadcasting comment webhook to workspace ${wsId}`);
      console.log(`📢 WEBHOOK DEBUG: Workspace ${wsId} connection stats:`, RealtimeService.getWorkspaceStats(wsId));
      RealtimeService.broadcastToWorkspace(wsId, 'instagram_comment', broadcastData);
      console.log(`✅ WEBHOOK DEBUG: Broadcast sent to workspace ${wsId}`);
    }
    console.log(`✅ WEBHOOK DEBUG: Comment webhook broadcasted successfully to ${workspacesToBroadcast.length} workspaces`);
  } catch (error) {
    console.error('❌ WEBHOOK DEBUG: Failed to broadcast comment webhook:', error);
  }

  console.log(`✅ Comment webhook processed with immediate database update`);
}

/**
 * Handle mention webhook events
 */
async function handleMentionWebhook(
  workspaceId: string,
  instagramAccountId: string,
  value: any
): Promise<void> {
  console.log(`@️ Processing mention webhook for account: ${instagramAccountId}`);

  await MetricsQueueManager.processWebhookEvent(
    workspaceId,
    instagramAccountId,
    {
      type: 'mention',
      media_id: value.media_id,
      comment_id: value.comment_id,
      mention_id: value.id
    },
    'mentions'
  );

  // Broadcast to frontend via WebSocket for immediate updates
  try {
    const { RealtimeService } = await import('../services/realtime');
    RealtimeService.broadcastToWorkspace(workspaceId, 'instagram_mention', {
      type: 'instagram_mention',
      accountId: instagramAccountId,
      mediaId: value.media_id,
      mentionId: value.id,
      timestamp: new Date()
    });
    console.log(`📢 Mention webhook broadcasted to workspace ${workspaceId}`);
  } catch (error) {
    console.error('Failed to broadcast mention webhook:', error);
  }

  console.log(`✅ Mention webhook queued for processing`);
}

/**
 * Handle story insights webhook events
 */
async function handleStoryInsightsWebhook(
  workspaceId: string,
  instagramAccountId: string,
  value: any
): Promise<void> {
  console.log(`📱 Processing story insights webhook for account: ${instagramAccountId}`);

  await MetricsQueueManager.processWebhookEvent(
    workspaceId,
    instagramAccountId,
    {
      type: 'story_insights',
      media_id: value.media_id,
      insights: value.insights
    },
    'story_insights'
  );

  // Broadcast to frontend via WebSocket for immediate updates
  try {
    const { RealtimeService } = await import('../services/realtime');
    RealtimeService.broadcastToWorkspace(workspaceId, 'instagram_story_insight', {
      type: 'instagram_story_insight',
      accountId: instagramAccountId,
      mediaId: value.media_id,
      insights: value.insights,
      timestamp: new Date()
    });
    console.log(`📢 Story insights webhook broadcasted to workspace ${workspaceId}`);
  } catch (error) {
    console.error('Failed to broadcast story insights webhook:', error);
  }

  console.log(`✅ Story insights webhook queued for processing`);
}

/**
 * Handle message webhook events (Instagram Direct)
 */
async function handleMessageWebhook(
  workspaceId: string,
  instagramAccountId: string,
  value: any
): Promise<void> {
  console.log(`💌 Processing message webhook for account: ${instagramAccountId}`);

  await MetricsQueueManager.processWebhookEvent(
    workspaceId,
    instagramAccountId,
    {
      type: 'message',
      messaging: value.messaging,
      recipient: value.recipient,
      sender: value.sender,
      timestamp: value.timestamp
    },
    'messages'
  );

  // Broadcast to frontend via WebSocket for immediate updates
  try {
    const { RealtimeService } = await import('../services/realtime');
    RealtimeService.broadcastToWorkspace(workspaceId, 'instagram_message', {
      type: 'instagram_message',
      accountId: instagramAccountId,
      messaging: value.messaging,
      recipient: value.recipient,
      sender: value.sender,
      timestamp: new Date()
    });
    console.log(`📢 Message webhook broadcasted to workspace ${workspaceId}`);
  } catch (error) {
    console.error('Failed to broadcast message webhook:', error);
  }

  console.log(`✅ Message webhook queued for processing`);
}

/**
 * Handle media update webhook events
 */
async function handleMediaUpdateWebhook(
  workspaceId: string,
  instagramAccountId: string,
  value: any
): Promise<void> {
  console.log(`📸 Processing media update webhook for account: ${instagramAccountId}`);

  await MetricsQueueManager.processWebhookEvent(
    workspaceId,
    instagramAccountId,
    {
      type: 'media_update',
      media_id: value.media_id,
      media_type: value.media_type,
      created_time: value.created_time
    },
    'media_updates'
  );

  // Broadcast to frontend via WebSocket for immediate updates
  try {
    const { RealtimeService } = await import('../services/realtime');
    RealtimeService.broadcastToWorkspace(workspaceId, 'instagram_media_update', {
      type: 'instagram_media_update',
      accountId: instagramAccountId,
      mediaId: value.media_id,
      mediaType: value.media_type,
      createdTime: value.created_time,
      timestamp: new Date()
    });
    console.log(`📢 Media update webhook broadcasted to workspace ${workspaceId}`);
  } catch (error) {
    console.error('Failed to broadcast media update webhook:', error);
  }

  console.log(`✅ Media update webhook queued for processing`);
}

/**
 * Handle account review webhook events
 */
async function handleAccountReviewWebhook(
  workspaceId: string,
  instagramAccountId: string,
  value: any
): Promise<void> {
  console.log(`🔍 Processing account review webhook for account: ${instagramAccountId}`);

  await MetricsQueueManager.processWebhookEvent(
    workspaceId,
    instagramAccountId,
    {
      type: 'account_review',
      review_status: value.review_status,
      reviewer_name: value.reviewer_name
    },
    'account_review_update'
  );

  // Broadcast to frontend via WebSocket for immediate updates
  try {
    const { RealtimeService } = await import('../services/realtime');
    RealtimeService.broadcastToWorkspace(workspaceId, 'instagram_account_review', {
      type: 'instagram_account_review',
      accountId: instagramAccountId,
      reviewStatus: value.review_status,
      reviewerName: value.reviewer_name,
      timestamp: new Date()
    });
    console.log(`📢 Account review webhook broadcasted to workspace ${workspaceId}`);
  } catch (error) {
    console.error('Failed to broadcast account review webhook:', error);
  }

  console.log(`✅ Account review webhook queued for processing`);
}

/**
 * Handle live comment webhook events
 */
async function handleLiveCommentWebhook(
  workspaceId: string,
  instagramAccountId: string,
  value: any
): Promise<void> {
  console.log(`🔴 Processing live comment webhook for account: ${instagramAccountId}`);

  await MetricsQueueManager.processWebhookEvent(
    workspaceId,
    instagramAccountId,
    {
      type: 'live_comment',
      live_video_id: value.live_video_id,
      comment_id: value.id,
      text: value.text,
      user: value.user
    },
    'live_comments'
  );

  console.log(`✅ Live comment webhook queued for processing`);
}

/**
 * GET /api/webhooks/status
 * Get webhook status and configuration
 */
router.get('/status', async (req, res) => {
  try {
    const webhookUrl = process.env.WEBHOOK_URL || `${req.protocol}://${req.get('host')}/api/webhooks/instagram`;
    
    res.json({
      status: 'active',
      webhook_url: webhookUrl,
      supported_events: [
        'comments',
        'mentions', 
        'story_insights',
        'messages',
        'media',
        'account_review_status',
        'live_comments'
      ],
      configuration: {
        signature_verification: 'enabled',
        async_processing: 'enabled',
        retry_policy: 'exponential_backoff'
      },
      last_check: new Date()
    });
  } catch (error) {
    console.error('🚨 Error fetching webhook status:', error);
    res.status(500).json({ error: 'Failed to fetch webhook status' });
  }
});

/**
 * Test endpoint to verify webhook configuration
 */
router.get('/instagram/test', (req, res) => {
  res.json({
    status: 'webhook-endpoint-active',
    url: '/api/webhooks/instagram',
    timestamp: new Date().toISOString(),
    message: 'Webhook endpoint is working. Check Instagram Developer Console for comment webhook subscriptions.'
  });
});

// Test endpoint to simulate a comment webhook
router.post('/instagram/test-comment', async (req, res) => {
  try {
    console.log('🧪 TEST: Simulating comment webhook...');
    
    // Simulate a comment webhook payload
    const testPayload = {
      object: 'instagram',
      entry: [{
        id: '17841474747481653',
        time: Math.floor(Date.now() / 1000),
        changes: [{
          field: 'comments',
          value: {
            id: 'test_comment_' + Date.now(),
            text: 'Test comment from webhook simulation',
            from: {
              id: 'test_user',
              username: 'test_user'
            },
            media_id: '18374233234126113',
            created_time: Math.floor(Date.now() / 1000)
          }
        }]
      }]
    };
    
    // Process the test webhook directly with the correct workspace and account
    console.log('🧪 TEST WEBHOOK: About to call processWebhookChange...');
    await processWebhookChange('684402c2fd2cd4eb6521b386', '25418395794416915', {
      field: 'comments',
      value: {
        id: 'test_comment_' + Date.now(),
        text: 'Test comment from webhook simulation',
        from: {
          id: 'test_user',
          username: 'test_user'
        },
        media_id: '18374233234126113',
        created_time: Math.floor(Date.now() / 1000)
      }
    });
    console.log('🧪 TEST WEBHOOK: processWebhookChange completed');
    
    res.json({
      status: 'test-webhook-processed',
      message: 'Test comment webhook processed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('🧪 TEST: Error processing test webhook:', error);
    res.status(500).json({
      status: 'test-webhook-error',
      error: error.message
    });
  }
});

export default router;