require('dotenv').config();
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment variables');
  process.exit(1);
}

const SocialAccountSchema = new mongoose.Schema({
  workspaceId: String,
  platform: String,
  username: String,
  totalShares: Number,
  totalSaves: Number,
  totalLikes: Number,
  totalComments: Number
}, { strict: false });

const SocialAccount = mongoose.model('SocialAccount', SocialAccountSchema, 'socialaccounts');

async function moveInstagramAccount() {
  try {
    console.log('🔄 Connecting to database...');
    await mongoose.connect(DATABASE_URL);
    console.log('✅ Connected to database\n');

    const instagramUsername = 'arpit.10';
    const currentWorkspaceId = '686d98ce4888852d5d7beb64'; // The workspace you're viewing
    const oldWorkspaceId = '684402c2fd2cd4eb6521b386'; // Where Instagram currently is

    // Find the Instagram account
    const instagramAccount = await SocialAccount.findOne({
      username: instagramUsername,
      platform: 'instagram',
      workspaceId: oldWorkspaceId
    });

    if (!instagramAccount) {
      console.log(`❌ Instagram account @${instagramUsername} not found in workspace ${oldWorkspaceId}`);
      process.exit(1);
    }

    console.log(`📊 Current Instagram Account Data:`);
    console.log(`   Username: @${instagramAccount.username}`);
    console.log(`   Current Workspace: ${instagramAccount.workspaceId}`);
    console.log(`   Shares: ${instagramAccount.totalShares || 0}`);
    console.log(`   Saves: ${instagramAccount.totalSaves || 0}`);
    console.log(`   Likes: ${instagramAccount.totalLikes || 0}`);
    console.log(`   Comments: ${instagramAccount.totalComments || 0}\n`);

    // Update the workspaceId
    console.log(`🔄 Moving Instagram account to workspace: ${currentWorkspaceId}...`);
    
    const result = await SocialAccount.findByIdAndUpdate(
      instagramAccount._id,
      {
        $set: {
          workspaceId: currentWorkspaceId
        }
      },
      { new: true }
    );

    if (result) {
      console.log(`✅ SUCCESS! Instagram account moved to workspace: ${currentWorkspaceId}`);
      console.log(`\n📊 Updated Account Data:`);
      console.log(`   Username: @${result.username}`);
      console.log(`   New Workspace: ${result.workspaceId}`);
      console.log(`   Shares: ${result.totalShares || 0}`);
      console.log(`   Saves: ${result.totalSaves || 0}`);
      console.log(`   Likes: ${result.totalLikes || 0}`);
      console.log(`   Comments: ${result.totalComments || 0}\n`);
      
      console.log('🎉 Now refresh your dashboard (Ctrl+Shift+R) to see the data!');
    } else {
      console.log('❌ Update failed');
    }

    await mongoose.connection.close();
    console.log('\n✅ Database connection closed');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

moveInstagramAccount();

