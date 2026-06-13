import dotenv from 'dotenv';
dotenv.config({path: '../.env'});
import mongoose from 'mongoose';
import { AutomationFunnelStateModel } from './models/Automation/AutomationFunnelState';
import { AutomationSystem } from './automation-system';
import { storage } from './mongodb-storage';

async function test() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'veeforedb' });
  
  const payload = "PAYLOAD_1779912136015_35";
  const customState = await AutomationFunnelStateModel.findOne({
    expectedPayload: payload,
    state: 'pending_custom_reply'
  });

  if (customState) {
    console.log("Found State!", customState.commentId);
    // Try to trigger it
    customState.state = 'completed';
    await customState.save();
    console.log("Completed state saved!");
    
    // Now verify the follow up registration
    if (customState.finalMessage) {
      if (customState.followUpButtons && customState.followUpButtons.length > 0) {
        const { registerCustomFunnelStates } = await import('./utils/funnelHelper');
        
        await registerCustomFunnelStates({
          commentId: customState.commentId,
          workspaceId: customState.workspaceId,
          instagramAccountId: customState.accountId,
          userId: customState.participantId,
          ruleId: customState.ruleId,
          buttons: customState.followUpButtons
        });
        console.log("Registered follow up buttons!");
      }
      
      console.log(`[SIMULATION] Would send Private Reply: "${customState.finalMessage}"`);
    }
  } else {
    console.log("State not found!");
  }
  process.exit(0);
}
test();
