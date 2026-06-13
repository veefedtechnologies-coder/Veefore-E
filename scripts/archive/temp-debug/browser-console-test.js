// Browser Console Script to Test Profile Picture Refresh
// Copy and paste this into your browser's developer console (F12 -> Console tab)

async function testProfilePictureRefresh() {
  try {
    console.log('🔄 Testing profile picture refresh...');
    
    // Get the current workspace ID from the page
    const workspaceId = '684402c2fd2cd4eb6521b386'; // From the logs
    
    // Make the API call using the same method as the frontend
    const response = await fetch('/api/social-accounts/refresh-profile-picture', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // The browser will automatically include the auth token
      },
      credentials: 'include', // Include cookies for authentication
      body: JSON.stringify({
        workspaceId: workspaceId,
        platform: 'instagram'
      })
    });
    
    const result = await response.json();
    
    console.log('📊 Response Status:', response.status);
    console.log('📋 Response Body:', result);
    
    if (result.success && result.profilePictureUrl) {
      console.log('✅ Profile picture refresh successful!');
      console.log('🖼️ New profile picture URL:', result.profilePictureUrl);
      console.log('🔄 Please refresh the page to see the updated profile picture');
    } else {
      console.log('❌ Profile picture refresh failed:', result.error || 'Unknown error');
    }
    
  } catch (error) {
    console.error('💥 Error:', error.message);
  }
}

// Run the test
testProfilePictureRefresh();



