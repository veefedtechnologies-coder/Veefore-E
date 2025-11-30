// Simple test to refresh profile picture
const fetch = require('node-fetch');

async function testProfileRefresh() {
  try {
    console.log('🔄 Testing profile picture refresh...');
    
    // Test with the workspace ID from your logs
    const workspaceId = '684402c2fd2cd4eb6521b386';
    
    const response = await fetch('http://localhost:5000/api/social-accounts/refresh-profile-picture', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Note: You'll need to add authentication headers here
        // 'Authorization': 'Bearer YOUR_TOKEN_HERE'
      },
      body: JSON.stringify({
        workspaceId: workspaceId,
        platform: 'instagram'
      })
    });
    
    const result = await response.json();
    
    console.log('📊 Response Status:', response.status);
    console.log('📊 Response Body:', JSON.stringify(result, null, 2));
    
    if (result.success && result.profilePictureUrl) {
      console.log('🎉 SUCCESS! Profile picture URL:', result.profilePictureUrl);
    } else {
      console.log('❌ FAILED:', result.error || 'Unknown error');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testProfileRefresh();



