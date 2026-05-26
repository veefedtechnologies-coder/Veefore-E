import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testFixedAPI() {
  try {
    console.log('🔍 Testing fixed API endpoint...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    // Test the fixed API endpoint
    const userId = '6844027426cae0200f88b5db';
    const response = await fetch(`http://localhost:5001/api/users/${userId}`, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer test-token',
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.log('❌ API request failed:', response.status, response.statusText);
      const errorText = await response.text();
      console.log('Error response:', errorText);
      return;
    }
    
    const data = await response.json();
    console.log('\n📊 FIXED API RESPONSE:');
    console.log('======================');
    console.log('Success:', data.success);
    console.log('Data structure:', Object.keys(data.user || {}));
    
    if (data.user) {
      console.log('\n📱 SOCIAL MEDIA DATA:');
      console.log('=====================');
      console.log('Social Media Object:', JSON.stringify(data.user.socialMedia, null, 2));
      
      console.log('\n🏢 WORKSPACE DATA:');
      console.log('==================');
      console.log('Workspace Object:', JSON.stringify(data.user.workspace, null, 2));
      
      // Check if the data is now correct
      console.log('\n🔍 VERIFICATION:');
      console.log('================');
      console.log('totalConnections:', data.user.socialMedia?.totalConnections);
      console.log('summary:', data.user.socialMedia?.summary);
      console.log('platforms:', data.user.socialMedia?.platforms);
      
      if (data.user.socialMedia?.totalConnections > 0) {
        console.log('✅ SUCCESS: API now returns correct social media data!');
      } else {
        console.log('❌ STILL ISSUE: API still returns empty social media data');
      }
    }

  } catch (error) {
    console.error('❌ Error testing fixed API:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testFixedAPI();
