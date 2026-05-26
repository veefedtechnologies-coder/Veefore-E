import mongoose from 'mongoose';
import 'dotenv/config';
import { getMainAppUsers } from '../services/userDataService';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testFixedFunction() {
  try {
    console.log('🔍 Testing fixed getMainAppUsers function...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    // Test the fixed function call (same as what userController.ts now does)
    const userId = '6844027426cae0200f88b5db';
    const result = await getMainAppUsers(1, 1, { _id: new mongoose.Types.ObjectId(userId) });
    
    if (!result.users || result.users.length === 0) {
      console.log('❌ No user found');
      return;
    }
    
    const user = result.users[0];
    
    console.log('\n📊 FIXED FUNCTION RESULT:');
    console.log('=========================');
    console.log('User ID:', user.id);
    console.log('Email:', user.email);
    console.log('Username:', user.name);
    console.log('Plan:', user.plan);
    console.log('Status:', user.status);
    
    console.log('\n📱 SOCIAL MEDIA DATA:');
    console.log('=====================');
    console.log('Social Media Object:', JSON.stringify(user.socialMedia, null, 2));
    
    console.log('\n🏢 WORKSPACE DATA:');
    console.log('==================');
    console.log('Workspace Object:', JSON.stringify(user.workspace, null, 2));
    
    // Check if the data is now correct
    console.log('\n🔍 VERIFICATION:');
    console.log('================');
    console.log('totalConnections:', user.socialMedia?.totalConnections);
    console.log('summary:', user.socialMedia?.summary);
    console.log('platforms:', user.socialMedia?.platforms);
    
    if (user.socialMedia?.totalConnections > 0) {
      console.log('✅ SUCCESS: Function now returns correct social media data!');
      console.log('✅ The frontend should now display the Instagram account correctly!');
    } else {
      console.log('❌ STILL ISSUE: Function still returns empty social media data');
    }

  } catch (error) {
    console.error('❌ Error testing fixed function:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testFixedFunction();
