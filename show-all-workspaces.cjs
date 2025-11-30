// Show all workspaces and which has Instagram account
const mongoose = require('mongoose');

const DATABASE_URL = process.env.DATABASE_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function showWorkspaces() {
  try {
    console.log('🔍 Connecting to database...');
    await mongoose.connect(DATABASE_URL.replace('/?', '/veeforedb?'));
    
    const Workspace = mongoose.model('Workspace', new mongoose.Schema({}, { strict: false }));
    const SocialAccount = mongoose.model('SocialAccount', new mongoose.Schema({}, { strict: false }));
    
    const userId = '6844027426cae0200f88b5db'; // From your logs
    
    const workspaces = await Workspace.find({ userId: userId }).lean();
    
    console.log(`\n📊 YOU HAVE ${workspaces.length} WORKSPACES:\n`);
    console.log('='.repeat(80));
    
    for (const workspace of workspaces) {
      const accounts = await SocialAccount.find({ workspaceId: workspace._id.toString() }).lean();
      
      const instagramAccount = accounts.find(acc => acc.platform === 'instagram' && acc.username === 'arpit.10');
      
      console.log(`\n🏢 Workspace: ${workspace.name || 'Unnamed'}`);
      console.log(`   ID: ${workspace._id}`);
      console.log(`   Social Accounts: ${accounts.length}`);
      
      if (instagramAccount) {
        console.log(`   ✅ ✅ ✅ HAS @arpit.10 INSTAGRAM ACCOUNT! ✅ ✅ ✅`);
        console.log(`   📊 Shares: ${instagramAccount.totalShares || 0}`);
        console.log(`   📊 Saves: ${instagramAccount.totalSaves || 0}`);
        console.log(`   👥 Followers: ${instagramAccount.followersCount || 0}`);
      } else {
        if (accounts.length > 0) {
          console.log(`   ℹ️  Other accounts: ${accounts.map(a => `${a.username} (${a.platform})`).join(', ')}`);
        } else {
          console.log(`   ⚠️  No social accounts`);
        }
      }
      
      console.log('-'.repeat(80));
    }
    
    console.log('\n🎯 ACTION: Switch to the workspace marked with ✅✅✅');
    console.log('📍 Look for workspace switcher dropdown at top of dashboard');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

showWorkspaces();

