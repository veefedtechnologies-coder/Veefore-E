import { AutomationFunnelStateModel } from '../models/Automation/AutomationFunnelState';

interface FunnelRegistrationData {
  commentId: string;
  workspaceId: string;
  instagramAccountId: string;
  userId: string;
  username?: string;
  variables?: any;
  ruleId: string;
  buttons: any[];
}

export async function registerCustomFunnelStates(data: FunnelRegistrationData) {
  if (!data.buttons || data.buttons.length === 0) return;

  for (let i = 0; i < data.buttons.length; i++) {
    const btn = data.buttons[i];
    
    // Check for the new structured followUp object
    if (btn.followUp && btn.followUp.message) {
      // Generate or ensure payload
      if (!btn.payload) {
        btn.payload = `CUSTOM_REPLY_${data.commentId}_${Date.now()}_${i}`;
      }
      
      console.log(`[FUNNEL_HELPER] 🔄 Registering custom follow-up state for payload: ${btn.payload}`);
      
      // Upsert funnel state for this custom button
      await AutomationFunnelStateModel.findOneAndUpdate(
        { commentId: data.commentId, expectedPayload: btn.payload },
        {
          workspaceId: data.workspaceId,
          accountId: data.instagramAccountId,
          participantId: data.userId,
          ruleId: data.ruleId,
          state: 'pending_custom_reply',
          expectedPayload: btn.payload,
          buttonText: btn.text,
          username: data.username,
          variables: data.variables,
          finalMessage: btn.followUp.message,
          followUpButtons: btn.followUp.buttons || []
        },
        { upsert: true, new: true }
      );
    } 
    // Fallback for legacy followUpMessage string
    else if (btn.followUpMessage) {
      if (!btn.payload) {
        btn.payload = `CUSTOM_REPLY_${data.commentId}_${Date.now()}_${i}`;
      }
      
      console.log(`[FUNNEL_HELPER] 🔄 Registering custom follow-up state (legacy) for payload: ${btn.payload}`);
      
      await AutomationFunnelStateModel.findOneAndUpdate(
        { commentId: data.commentId, expectedPayload: btn.payload },
        {
          workspaceId: data.workspaceId,
          accountId: data.instagramAccountId,
          participantId: data.userId,
          ruleId: data.ruleId,
          state: 'pending_custom_reply',
          expectedPayload: btn.payload,
          buttonText: btn.text,
          username: data.username,
          variables: data.variables,
          finalMessage: btn.followUpMessage,
          followUpButtons: []
        },
        { upsert: true, new: true }
      );
    }
  }
}
