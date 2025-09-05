import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testActualAPI() {
  try {
    console.log('🔍 Testing actual API endpoint...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    // Test the actual API endpoint
    const userId = '6844027426cae0200f88b5db';
    const response = await fetch(`http://localhost:5001/api/user-detail/${userId}`, {
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
    console.log('\n📊 ACTUAL API RESPONSE:');
    console.log('========================');
    console.log('Success:', data.success);
    console.log('Data structure:', Object.keys(data.data || {}));
    
    if (data.data) {
      console.log('\n📱 SOCIAL MEDIA DATA:');
      console.log('=====================');
      console.log('Social Media Object:', JSON.stringify(data.data.socialMedia, null, 2));
      
      console.log('\n🏢 WORKSPACE DATA:');
      console.log('==================');
      console.log('Workspace Object:', JSON.stringify(data.data.workspace, null, 2));
    }

  } catch (error) {
    console.error('❌ Error testing actual API:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from database');
  }
}

testActualAPI();
