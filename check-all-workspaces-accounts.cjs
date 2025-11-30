// Check what workspace the user is actually viewing and what accounts are returned
const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/veeforedb';

async function checkAllWorkspaces() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    const SocialAccountSchema = new mongoose.Schema({}, { strict: false });
    const WorkspaceSchema = new mongoose.Schema({}, { strict: false });
    
    const SocialAccountModel = mongoose.model('SocialAccount', SocialAccountSchema);
    const WorkspaceModel = mongoose.model('Workspace', WorkspaceSchema);

    // Get all workspaces
    const workspaces = await WorkspaceModel.find({});
    console.log(`📁 Found ${workspaces.length} workspace(s):\n`);

    for (const ws of workspaces) {
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('Workspace ID:', ws._id.toString());
      console.log('Workspace Name:', ws.name);
      console.log('User ID:', ws.userId);
      
      // Find Instagram accounts in this workspace
      const accounts = await SocialAccountModel.find({
        platform: 'instagram',
        workspaceId: ws._id.toString()
      });

      console.log(`   Instagram accounts: ${accounts.length}`);
      for (const acc of accounts) {
        console.log(`   - ${acc.username}: Shares=${acc.totalShares ?? 0}, Saves=${acc.totalSaves ?? 0}`);
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkAllWorkspaces();

