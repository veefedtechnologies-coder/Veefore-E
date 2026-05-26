import mongoose from 'mongoose';
import 'dotenv/config';
import { getMainAppUsers } from '../services/userDataService';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testDirectFunction() {
  try {
    console.log('🔍 Testing getMainAppUsers function directly...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    // Test the function with the correct parameters (same as userController.ts)
    const userId = '6844027426cae0200f88b5db';
    const result = await getMainAppUsers(1, 1, { _id: new mongoose.Types.ObjectId(userId) });
    
    if (!result.users || result.users.length === 0) {
      console.log('❌ No user found');
      return;
    }
    
    const user = result.users[0];
    console.log('✅ User found:', user.name, user.email);
    
    // Check social media data
    if (user.socialMedia) {
      console.log('📱 Social Media Data:');
      console.log('  - Total Connections:', user.socialMedia.totalConnections);
      console.log('  - Summary:', user.socialMedia.summary);
      console.log('  - Platforms:', user.socialMedia.platforms);
    }
    
    // Check workspace data
    if (user.workspace) {
      console.log('🏢 Workspace Data:');
      console.log('  - Name:', user.workspace.name);
      console.log('  - ID:', user.workspace.id);
      console.log('  - Social Accounts Count:', user.workspace.socialAccountsCount);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testDirectFunction();