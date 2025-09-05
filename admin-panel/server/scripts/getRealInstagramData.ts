import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function getRealInstagramData() {
  try {
    console.log('🔍 Getting REAL Instagram data from collections...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    const db = mongoose.connection.db;
    const userId = '6844027426cae0200f88b5db';
    
    // Check instagramaccounts collection
    console.log('\n📱 INSTAGRAM ACCOUNTS COLLECTION:');
    console.log('==================================');
    const instagramAccounts = await db.collection('instagramaccounts').find({ userId: new mongoose.Types.ObjectId(userId) }).toArray();
    console.log('Instagram accounts found:', instagramAccounts.length);
    
    if (instagramAccounts.length > 0) {
      instagramAccounts.forEach((account, index) => {
        console.log(`${index + 1}. Instagram Account:`, {
          username: account.username,
          followers: account.followers,
          following: account.following,
          posts: account.posts,
          likes: account.likes,
          comments: account.comments,
          bio: account.bio,
          verified: account.verified,
          businessAccount: account.businessAccount,
          category: account.category,
          website: account.website,
          profilePicture: account.profilePicture,
          externalUrl: account.externalUrl
        });
      });
    }
    
    // Check socialaccounts collection
    console.log('\n📱 SOCIAL ACCOUNTS COLLECTION:');
    console.log('===============================');
    const socialAccounts = await db.collection('socialaccounts').find({ userId: new mongoose.Types.ObjectId(userId) }).toArray();
    console.log('Social accounts found:', socialAccounts.length);
    
    if (socialAccounts.length > 0) {
      socialAccounts.forEach((account, index) => {
        console.log(`${index + 1}. Social Account:`, {
          platform: account.platform,
          username: account.username,
          followers: account.followers,
          following: account.following,
          posts: account.posts,
          likes: account.likes,
          comments: account.comments,
          bio: account.bio,
          verified: account.verified,
          businessAccount: account.businessAccount
        });
      });
    }
    
    // Check workspace for Instagram data
    console.log('\n🔍 WORKSPACE INSTAGRAM DATA:');
    console.log('=============================');
    const workspace = await db.collection('workspaces').findOne({ _id: 'ws_68440274' });
    if (workspace) {
      console.log('Workspace found:', workspace.name);
      
      if (workspace.instagramAccounts && workspace.instagramAccounts.length > 0) {
        console.log('\n📱 WORKSPACE INSTAGRAM ACCOUNTS:');
        workspace.instagramAccounts.forEach((account: any, index: number) => {
          console.log(`${index + 1}. Account:`, {
            username: account.username,
            followers: account.followers,
            following: account.following,
            posts: account.posts,
            likes: account.likes,
            comments: account.comments,
            bio: account.bio,
            verified: account.verified,
            businessAccount: account.businessAccount
          });
        });
      }
      
      if (workspace.socialAccounts && workspace.socialAccounts.length > 0) {
        console.log('\n📱 WORKSPACE SOCIAL ACCOUNTS:');
        workspace.socialAccounts.forEach((account: any, index: number) => {
          console.log(`${index + 1}. Account:`, {
            platform: account.platform,
            username: account.username,
            followers: account.followers,
            following: account.following,
            posts: account.posts,
            likes: account.likes,
            comments: account.comments
          });
        });
      }
    }
    
    // Check if there are any posts/content for this user
    console.log('\n📱 USER CONTENT/POSTS:');
    console.log('======================');
    const contents = await db.collection('contents').find({ userId: new mongoose.Types.ObjectId(userId) }).limit(5).toArray();
    console.log('Content posts found:', contents.length);
    
    if (contents.length > 0) {
      contents.forEach((content, index) => {
        console.log(`${index + 1}. Content:`, {
          type: content.type,
          platform: content.platform,
          status: content.status,
          likes: content.likes,
          comments: content.comments,
          shares: content.shares,
          createdAt: content.createdAt
        });
      });
    }

  } catch (error) {
    console.error('❌ Error getting Instagram data:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

getRealInstagramData();
