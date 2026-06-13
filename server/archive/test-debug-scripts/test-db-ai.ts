import mongoose from 'mongoose';
import { config } from 'dotenv';
config({ path: '/Users/arpitchoudhary/Downloads/Veefore_v3/Veefore-E/.env' });
import { User } from './models/User';
import { Workspace } from './models/Workspace';
import { aiServiceManager } from './services/AIServiceManager';

async function testDatabaseAI() {
  await mongoose.connect(process.env.MONGODB_URI || '');
  
  let preferences: any = null;

  const user = await User.findOne({ "preferences.googleAiStudioKey": { $exists: true, $ne: "" } });
  if (user) {
    preferences = user.preferences;
    console.log("Found User preferences");
  } else {
    const workspace = await Workspace.findOne({ "aiConfiguration.googleAiStudioKey": { $exists: true, $ne: "" } });
    if (workspace) {
      preferences = workspace.aiConfiguration;
      console.log("Found Workspace preferences");
    }
  }
  
  if (!preferences) {
    console.log("No saved API keys found in DB. You need to hit 'Save AI Configuration' in the frontend first.");
    process.exit(0);
  }
  
  try {
    const prompt = "Write a one-sentence motivation quote.";
    console.log("Prompt: " + prompt);
    const result = await aiServiceManager.generateText(prompt, preferences);
    console.log("\n====== RESULT ======\n" + result);
    console.log("\nTest passed successfully! The API is working and responding with the requested configurations.");
  } catch (error: any) {
    console.error("\nAPI Test Failed:");
    if (error.status === 403) {
      console.error("403 Forbidden: The API key is invalid or unregistered.");
    } else {
      console.error(error);
    }
  }
  process.exit(0);
}

testDatabaseAI().catch(console.error);
