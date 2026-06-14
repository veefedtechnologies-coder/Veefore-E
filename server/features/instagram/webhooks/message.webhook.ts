/**
 * MESSAGE WEBHOOK HANDLER
 * 
 * Handles Instagram DM (Direct Message) webhook events
 * - Incoming messages
 * - Message delivery confirmation
 * - Read receipts
 */

import { IStorage } from '../../../storage';

export interface MessageWebhookEvent {
  sender: {
    id: string;
    username?: string;
  };
  recipient: {
    id: string;
  };
  message: {
    mid: string;
    text: string;
    timestamp: number;
  };
  is_echo?: boolean;
}

export class MessageWebhookHandler {
  constructor(private storage: IStorage) {}

  /**
   * Handle incoming DM/message event
   */
  async handle(event: MessageWebhookEvent, socialAccount: any): Promise<void> {
    try {
      console.log('[MESSAGE WEBHOOK] 💌 Processing DM event');

      // Skip echo messages (messages sent by the business)
      if (event.is_echo) {
        console.log('[MESSAGE WEBHOOK] ⏭️ Skipping echo message');
        return;
      }

      const { sender, message: msg } = event;

      // Validate required fields
      if (!sender?.id || !msg?.text) {
        console.log('[MESSAGE WEBHOOK] ⚠️ Invalid DM data, skipping');
        return;
      }

      console.log(`[MESSAGE WEBHOOK] 💬 New DM from ${sender.id}: "${msg.text}"`);

      // Store DM for analytics and compliance
      await this.storeDMData(event, socialAccount);

      // Process through automation system if needed
      // (DM automation would be handled separately if configured)

      console.log('[MESSAGE WEBHOOK] ✅ DM event processed successfully');
    } catch (error) {
      console.error('[MESSAGE WEBHOOK] ❌ Error processing message:', error);
      throw error;
    }
  }

  /**
   * Store DM data for analytics and compliance
   */
  private async storeDMData(event: MessageWebhookEvent, socialAccount: any): Promise<void> {
    try {
      const dmData = {
        workspaceId: socialAccount.workspaceId,
        accountId: socialAccount.id,
        senderId: event.sender.id,
        senderUsername: event.sender.username,
        messageId: event.message.mid,
        text: event.message.text,
        timestamp: new Date(event.message.timestamp),
        processed: true
      };

      console.log('[MESSAGE WEBHOOK] 💾 Storing DM data');
      // Add implementation as needed for compliance/analytics
      // await this.storage.saveDMEvent(dmData);
    } catch (error) {
      console.error('[MESSAGE WEBHOOK] ❌ Error storing DM data:', error);
    }
  }

  /**
   * Validate message event structure
   */
  isValidEvent(event: any): event is MessageWebhookEvent {
    return (
      event &&
      typeof event === 'object' &&
      event.sender &&
      typeof event.sender.id === 'string' &&
      event.message &&
      typeof event.message.text === 'string' &&
      typeof event.message.mid === 'string'
    );
  }
}
