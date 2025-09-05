import mongoose from 'mongoose';
import 'dotenv/config';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function testAdminPanelAPI() {
  try {
    console.log('🔍 Testing admin panel API...');
    
    // Connect to veeforedb
    await mongoose.connect(MONGODB_URI, {
      dbName: 'veeforedb'
    });
    
    console.log('✅ Connected to veeforedb database');
    
    // Test the admin panel API endpoint
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
      return;
    }
    
    const data = await response.json();
    console.log('✅ API Response:', JSON.stringify(data, null, 2));
    
    // Check social media data
    if (data.user && data.user.socialMedia) {
      console.log('📱 Social Media Data:');
      console.log('  - Total Connections:', data.user.socialMedia.totalConnections);
      console.log('  - Summary:', data.user.socialMedia.summary);
      console.log('  - Platforms:', data.user.socialMedia.platforms);
    }
    
    // Check workspace data
    if (data.user && data.user.workspace) {
      console.log('🏢 Workspace Data:');
      console.log('  - Name:', data.user.workspace.name);
      console.log('  - ID:', data.user.workspace.id);
      console.log('  - Social Accounts Count:', data.user.workspace.socialAccountsCount);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testAdminPanelAPI();