import mongoose from 'mongoose';
import { storage } from '../mongodb-storage';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  await mongoose.connect(process.env.MONGODB_URI as string);
  
  // Get an arbitrary workspace
  const workspaces = await storage.getWorkspacesByUserId('67936a79853ebfba63f03f39'); // Use known test user ID
  if (!workspaces.length) {
    console.log("No workspaces found for test user");
    process.exit(1);
  }
  
  const workspace = workspaces[0];
  console.log(`Original lastActivity: ${workspace.lastActivity}`);
  
  // Set lastActivity to 8 days ago
  const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
  await storage.updateWorkspace(workspace.id.toString(), { lastActivity: eightDaysAgo });
  console.log(`Set lastActivity to: ${eightDaysAgo}`);
  
  process.exit(0);
}
run();
