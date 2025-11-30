require('dotenv').config();
const axios = require('axios');

async function testInstagramDiagnostics() {
  console.log('🧪 Testing Instagram diagnostics endpoint...');
  
  const testData = {
    workspaceId: '684402c2fd2cd4eb6521b386',
    useStoredToken: true
  };
  
  try {
    console.log('📡 Making request to Instagram diagnostics endpoint...');
    console.log('🔗 URL: http://localhost:5000/api/diagnostics/instagram');
    console.log('📊 Request data:', testData);
    
    const response = await axios.post('http://localhost:5000/api/diagnostics/instagram', testData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000 // 30 second timeout
    });
    
    console.log('✅ Instagram diagnostics response status:', response.status);
    console.log('📊 Response data:', JSON.stringify(response.data, null, 2));
    
    // Check if the response contains expected fields
    if (response.data) {
      console.log('\n🔍 Response analysis:');
      console.log('  Has stories data:', !!response.data.stories);
      console.log('  Has profile data:', !!response.data.profile);
      console.log('  Has media data:', !!response.data.media);
      console.log('  Has insights data:', !!response.data.insights);
      
      if (response.data.stories) {
        console.log('  Stories count:', response.data.stories.data ? response.data.stories.data.length : 0);
      }
      
      if (response.data.profile) {
        console.log('  Profile username:', response.data.profile.username);
        console.log('  Profile followers:', response.data.profile.followers_count);
      }
    }
    
    console.log('\n🎉 Instagram diagnostics test completed successfully!');
    
  } catch (error) {
    console.error('❌ Instagram diagnostics test failed:');
    
    if (error.response) {
      console.error('  Status:', error.response.status);
      console.error('  Status text:', error.response.statusText);
      console.error('  Response data:', error.response.data);
    } else if (error.request) {
      console.error('  No response received. Server might not be running.');
      console.error('  Error code:', error.code);
      console.error('  Error message:', error.message);
    } else {
      console.error('  Error:', error.message);
    }
    
    // Check if it's a connection error
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Suggestion: Make sure the server is running on port 5000');
      console.log('   Try running: npm run dev (in the server directory)');
    }
  }
}

testInstagramDiagnostics();