const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';

async function checkTokenStatus() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    console.log('🔍 Checking Instagram token status for arpit.10...');
    
    await client.connect();
    const db = client.db('veeforedb');
    
    console.log('✅ Connected to veeforedb database');
    
    // Find the Instagram account for arpit.10
    const instagramAccount = await db.collection('socialaccounts').findOne({
      username: 'arpit.10',
      platform: 'instagram'
    });
    
    if (instagramAccount) {
      console.log('\n🎯 INSTAGRAM ACCOUNT TOKEN STATUS:');
      console.log('==================================');
      console.log('Username:', instagramAccount.username);
      console.log('Platform:', instagramAccount.platform);
      console.log('Is Active:', instagramAccount.isActive);
      console.log('Account ID:', instagramAccount.accountId);
      console.log('Workspace ID:', instagramAccount.workspaceId);
      
      // Check token fields
      console.log('\n🔑 TOKEN INFORMATION:');
      console.log('====================');
      console.log('Has accessToken:', !!instagramAccount.accessToken);
      console.log('Has encryptedAccessToken:', !!instagramAccount.encryptedAccessToken);
      console.log('Has refreshToken:', !!instagramAccount.refreshToken);
      console.log('Has encryptedRefreshToken:', !!instagramAccount.encryptedRefreshToken);
      console.log('Token expires at:', instagramAccount.expiresAt);
      
      if (instagramAccount.accessToken) {
        console.log('Access token (first 20 chars):', instagramAccount.accessToken.substring(0, 20) + '...');
      }
      
      if (instagramAccount.encryptedAccessToken) {
        console.log('Encrypted access token type:', typeof instagramAccount.encryptedAccessToken);
        if (typeof instagramAccount.encryptedAccessToken === 'string') {
          console.log('Encrypted access token (first 20 chars):', instagramAccount.encryptedAccessToken.substring(0, 20) + '...');
        } else {
          console.log('Encrypted access token structure:', Object.keys(instagramAccount.encryptedAccessToken));
        }
      }
      
      // Check if token is expired
      if (instagramAccount.expiresAt) {
        const expiryDate = new Date(instagramAccount.expiresAt);
        const now = new Date();
        const isExpired = now >= expiryDate;
        
        console.log('\n⏰ TOKEN EXPIRY STATUS:');
        console.log('======================');
        console.log('Expires at:', expiryDate.toISOString());
        console.log('Current time:', now.toISOString());
        console.log('Is expired:', isExpired);
        
        if (isExpired) {
          console.log('❌ TOKEN IS EXPIRED - This explains why reach data is 0');
        } else {
          console.log('✅ Token is still valid');
        }
      } else {
        console.log('\n❌ NO EXPIRY DATE - Token status unknown');
      }
      
      // Check reach data fields
      console.log('\n📊 REACH DATA STATUS:');
      console.log('====================');
      console.log('Total Reach:', instagramAccount.totalReach || 0);
      console.log('Account Level Reach:', instagramAccount.accountLevelReach || 0);
      console.log('Reach By Period:', JSON.stringify(instagramAccount.reachByPeriod || {}, null, 2));
      
      // Check last sync information
      console.log('\n🔄 SYNC STATUS:');
      console.log('===============');
      console.log('Last synced at:', instagramAccount.lastSyncedAt);
      console.log('Created at:', instagramAccount.createdAt);
      console.log('Updated at:', instagramAccount.updatedAt);
      
    } else {
      console.log('\n❌ No Instagram account found for arpit.10');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
  }
}

checkTokenStatus();