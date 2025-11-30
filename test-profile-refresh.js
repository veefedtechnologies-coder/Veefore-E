// Test script to manually refresh profile picture
const fetch = require('node-fetch');

async function testProfileRefresh() {
  try {
    console.log('🔄 Testing profile picture refresh...');
    
    // You'll need to replace these with actual values
    const workspaceId = '684402c2fd2cd4eb6521b386'; // From the logs
    const bearerToken = 'YOUR_BEARER_TOKEN_HERE'; // You need to get this from browser dev tools
    
    if (bearerToken === 'YOUR_BEARER_TOKEN_HERE') {
      console.log('❌ Please update the bearerToken in this script');
      console.log('📝 To get your token:');
      console.log('   1. Open browser dev tools (F12)');
      console.log('   2. Go to Network tab');
      console.log('   3. Refresh the page');
      console.log('   4. Look for any API request');
      console.log('   5. Check the Authorization header');
      return;
    }
    
    const response = await fetch('http://localhost:5000/api/social-accounts/refresh-profile-picture', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${bearerToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workspaceId: workspaceId,
        platform: 'instagram'
      })
    });
    
    const result = await response.json();
    
    console.log('📊 Response Status:', response.status);
    console.log('📋 Response Body:', JSON.stringify(result, null, 2));
    
    if (result.success && result.profilePictureUrl) {
      console.log('✅ Profile picture refresh successful!');
      console.log('🖼️ New profile picture URL:', result.profilePictureUrl);
    } else {
      console.log('❌ Profile picture refresh failed');
    }
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

testProfileRefresh();



