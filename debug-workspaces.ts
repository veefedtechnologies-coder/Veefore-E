import { storage } from './server/mongodb-storage';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

async function debug() {
  await mongoose.connect(process.env.MONGODB_URI!);
  console.log('Connected to MongoDB');

  // Find the user arpit.10 (or whatever user is logged in)
  // I'll search for the social account first to find the workspace
  const { SocialAccountModel } = await import('./server/models/Social/SocialAccount');
  const accounts = await SocialAccountModel.find({ username: 'arpit.10' });
  
  console.log('--- Social Accounts for arpit.10 ---');
  for (const acc of accounts) {
    console.log(`Account ID: ${acc._id}`);
    console.log(`Workspace ID: ${acc.workspaceId}`);
    console.log(`Platform: ${acc.platform}`);
    console.log(`Token Status: ${acc.tokenStatus}`);
    console.log('-------------------------');
  }

  if (accounts.length > 0) {
    const workspaceId = accounts[0].workspaceId;
    const { WorkspaceModel } = await import('./server/models/Workspace/Workspace');
    const workspace = await WorkspaceModel.findById(workspaceId);
    console.log('--- Workspace for arpit.10 ---');
    if (workspace) {
      console.log(`Workspace ID: ${workspace._id}`);
      console.log(`Name: ${workspace.name}`);
      console.log(`Owner: ${workspace.ownerId}`);
      
      const { UserModel } = await import('./server/models/User/User');
      const owner = await UserModel.findById(workspace.ownerId);
      console.log('--- Owner Details ---');
      if (owner) {
        console.log(`Owner ID: ${owner._id}`);
        console.log(`Email: ${owner.email}`);
        console.log(`Firebase UID: ${owner.firebaseUid}`);
        
        // Find all workspaces for this owner
        const userWorkspaces = await WorkspaceModel.find({ ownerId: owner._id });
        console.log(`User has ${userWorkspaces.length} workspaces:`);
        for (const w of userWorkspaces) {
            console.log(` - ${w.name} (${w._id})`);
        }
      }
    }
  }

  process.exit(0);
}

debug().catch(console.error);
