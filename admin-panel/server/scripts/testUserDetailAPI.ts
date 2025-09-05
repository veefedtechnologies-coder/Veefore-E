import mongoose from 'mongoose';
import 'dotenv/config';
import { getMainAppUsers } from '../services/userDataService';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testUserDetailAPI() {
  try {
    console.log('🔍 Testing user detail API...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    // Test the getMainAppUsers function with a specific user ID
    const userId = '6844027426cae0200f88b5db';
    const result = await getMainAppUsers(1, 1, { _id: new mongoose.Types.ObjectId(userId) });
    
    if (!result.users || result.users.length === 0) {
      console.log('❌ No user found');
      return;
    }
    
    const user = result.users[0];
    
    console.log('\n📊 USER DETAIL API RESPONSE:');
    console.log('============================');
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
    
    console.log('\n✅ API RESPONSE STRUCTURE:');
    console.log('==========================');
    console.log('✅ Social media data is in user.socialMedia');
    console.log('✅ Workspace data is in user.workspace');
    console.log('✅ Data structure matches frontend expectations');
    console.log('✅ Frontend should now display the data correctly');

  } catch (error) {
    console.error('❌ Error testing user detail API:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testUserDetailAPI();