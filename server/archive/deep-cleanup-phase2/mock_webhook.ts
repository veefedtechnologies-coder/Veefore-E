import dotenv from 'dotenv';
dotenv.config({path: '../.env'});
import mongoose from 'mongoose';
import { processWebhookChange } from './routes/webhooks';

async function test() {
  await mongoose.connect(process.env.MONGODB_URI, { dbName: 'veeforedb' });
  
  const workspaceId = "684402c2fd2cd4eb6521b386";
  const instagramAccountId = "17841474747481653";
  const payload = {
    field: "messages",
    value: {
      messaging: [
        {
          sender: { id: "1479580653003682" },
          recipient: { id: "17841474747481653" },
          timestamp: 1779915538562,
          postback: {
            title: "See products",
            payload: "PAYLOAD_1779912136015_35",
            mid: "mock_mid"
          }
        }
      ]
    }
  };

  console.log("Triggering webhook...");
  try {
    await processWebhookChange(workspaceId, instagramAccountId, payload);
    console.log("Done!");
  } catch(e) {
    console.error("Error:", e);
  }

  process.exit(0);
}
test();
