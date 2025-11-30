// Find which workspace has the Instagram account
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function findWorkspace() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(DATABASE_URL.replace('/?', '/veeforedb?'));
    
    const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));
    const Workspace = mongoose.model('Workspace', new mongoose.Schema({}, { strict: false }));
    
    const account = await SocialAccount.findOne({ username: 'arpit.10' }).lean();
    
    if (!account) {
      console.log('❌ Instagram account @arpit.10 not found!');
      process.exit(1);
    }
    
    console.log('\n📊 INSTAGRAM ACCOUNT DETAILS:');
    console.log('================================');
    console.log(`Username: @${account.username}`);
    console.log(`Workspace ID: ${account.workspaceId}`);
    console.log(`Total Shares: ${account.totalShares || 0}`);
    console.log(`Total Saves: ${account.totalSaves || 0}`);
    console.log(`Total Likes: ${account.totalLikes || 0}`);
    console.log(`Followers: ${account.followersCount || 0}`);
    
    // Find workspace details
    const workspace = await Workspace.findById(account.workspaceId).lean();
    
    if (workspace) {
      console.log('\n🏢 WORKSPACE DETAILS:');
      console.log('================================');
      console.log(`Workspace Name: ${workspace.name || 'Unnamed'}`);
      console.log(`Workspace ID: ${workspace._id}`);
      console.log(`User ID: ${workspace.userId}`);
    }
    
    console.log('\n🎯 ACTION REQUIRED:');
    console.log('================================');
    console.log('1. Look at the top of your dashboard for a workspace switcher/dropdown');
    console.log('2. Switch to the workspace shown above');
    console.log('3. Refresh the page');
    console.log('4. You should now see the real data!');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

findWorkspace();

