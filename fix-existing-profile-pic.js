// Script to manually fix profile picture for existing Instagram account
const fetch = require('node-fetch');

async function fixExistingProfilePicture() {
  try {
    console.log('🔧 Fixing profile picture for existing Instagram account...');
    
    // You'll need to replace these with actual values from your database
    const workspaceId = '684402c2fd2cd4eb6521b386'; // From your logs
    const accessToken = 'YOUR_ACCESS_TOKEN_HERE'; // You need to get this from your database
    
    if (accessToken === 'YOUR_ACCESS_TOKEN_HERE') {
      console.log('❌ Please update the accessToken in this script');
      console.log('📝 To get your access token:');
      console.log('   1. Check your MongoDB database');
      console.log('   2. Look in the socialAccounts collection');
      console.log('   3. Find the document with platform: "instagram"');
      console.log('   4. Copy the accessToken field');
      return;
    }
    
    console.log('🔄 Fetching fresh profile data from Instagram API...');
    
    // Fetch fresh profile data from Instagram API
    const profileResponse = await fetch(
      `https://graph.instagram.com/me?fields=id,username,account_type,media_count,profile_picture_url,followers_count,name,biography&access_token=${accessToken}`
    );
    
    if (!profileResponse.ok) {
      const errorData = await profileResponse.json();
      console.error('❌ Failed to fetch profile data:', errorData);
      return;
    }
    
    const profileData = await profileResponse.json();
    console.log('📊 Profile data received:', {
      username: profileData.username,
      id: profileData.id,
      account_type: profileData.account_type,
      profile_picture_url: profileData.profile_picture_url || 'MISSING',
      profile_picture_url_length: profileData.profile_picture_url ? profileData.profile_picture_url.length : 0
    });
    
    let finalProfilePictureUrl = profileData.profile_picture_url;
    
    // If profile picture is missing, try alternative approach
    if (!finalProfilePictureUrl) {
      console.log('🔄 Profile picture missing, trying alternative API call...');
      try {
        const altResponse = await fetch(
          `https://graph.instagram.com/${profileData.id}?fields=profile_picture_url&access_token=${accessToken}`
        );
        if (altResponse.ok) {
          const altData = await altResponse.json();
          finalProfilePictureUrl = altData.profile_picture_url;
          console.log('✅ Alternative API result:', {
            profile_picture_url: finalProfilePictureUrl || 'STILL MISSING'
          });
        }
      } catch (altError) {
        console.log('❌ Alternative API failed:', altError);
      }
    }
    
    if (finalProfilePictureUrl && !finalProfilePictureUrl.includes('dicebear.com')) {
      console.log('🎉 Profile picture URL found:', finalProfilePictureUrl);
      console.log('📝 You can now update your database with this URL:');
      console.log(`   profilePictureUrl: "${finalProfilePictureUrl}"`);
    } else {
      console.log('⚠️ No real profile picture found. The Instagram API might not be returning it.');
      console.log('💡 This could be due to:');
      console.log('   - Account privacy settings');
      console.log('   - Instagram API limitations');
      console.log('   - Token permissions');
    }
    
  } catch (error) {
    console.error('❌ Error during profile picture fix:', error);
  }
}

fixExistingProfilePicture();



