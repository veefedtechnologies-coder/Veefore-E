require('dotenv').config();
const { MongoClient } = require('mongodb');
const { tokenEncryption } = require('./server/security/token-encryption.js');
const https = require('https');

async function testCompleteTokenFlow() {
  console.log('🧪 Testing Complete Instagram Token Flow...\n');
  
  const client = new MongoClient('mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0');
  
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('veeforedb');
    const collection = db.collection('socialaccounts');
    
    // Find the arpit.10 Instagram account
    const account = await collection.findOne({
      username: 'arpit.10',
      platform: 'instagram'
    });
    
    if (!account) {
      console.log('❌ No arpit.10 Instagram account found');
      return;
    }
    
    console.log('📱 Found Instagram Account:');
    console.log('  Username:', account.username);
    console.log('  Account ID:', account.accountId);
    console.log('  Workspace ID:', account.workspaceId);
    console.log('  Is Active:', account.isActive);
    console.log('  Has encryptedAccessToken:', !!account.encryptedAccessToken);
    console.log('  Token expires at:', account.expiresAt);
    
    // Step 1: Test token decryption
    console.log('\n🔓 Step 1: Testing Token Decryption...');
    
    let decryptedToken = null;
    try {
      decryptedToken = tokenEncryption.decryptToken(account.encryptedAccessToken);
      console.log('✅ Token decrypted successfully!');
      console.log('  Token length:', decryptedToken.length);
      console.log('  Token preview:', decryptedToken.substring(0, 20) + '...');
    } catch (error) {
      console.log('❌ Token decryption failed:', error.message);
      return;
    }
    
    // Step 2: Test Instagram API with decrypted token
    console.log('\n📡 Step 2: Testing Instagram API...');
    
    try {
      const url = `https://graph.instagram.com/me?fields=id,username,account_type,media_count,followers_count&access_token=${decryptedToken}`;
      
      const response = await new Promise((resolve, reject) => {
        https.get(url, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              resolve({ ok: res.statusCode === 200, json: () => JSON.parse(data) });
            } catch (e) {
              resolve({ ok: false, json: () => ({ error: { message: 'Invalid JSON response' } }) });
            }
          });
        }).on('error', reject);
      });
      
      const data = response.json();
      
      if (response.ok) {
        console.log('✅ Instagram API test successful!');
        console.log('  Account Info:', JSON.stringify(data, null, 2));
      } else {
        console.log('❌ Instagram API error:', data);
        return;
      }
    } catch (apiError) {
      console.log('❌ Instagram API request failed:', apiError.message);
      return;
    }
    
    // Step 3: Test reach insights API
    console.log('\n📊 Step 3: Testing Reach Insights API...');
    
    try {
      const reachUrl = `https://graph.instagram.com/${account.accountId}/insights?metric=reach&period=day&access_token=${decryptedToken}`;
      
      const reachResponse = await new Promise((resolve, reject) => {
        https.get(reachUrl, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              resolve({ ok: res.statusCode === 200, json: () => JSON.parse(data) });
            } catch (e) {
              resolve({ ok: false, json: () => ({ error: { message: 'Invalid JSON response' } }) });
            }
          });
        }).on('error', reject);
      });
      
      const reachData = reachResponse.json();
      
      if (reachResponse.ok) {
        console.log('✅ Reach insights retrieved successfully!');
        console.log('  Reach Data:', JSON.stringify(reachData, null, 2));
      } else {
        console.log('❌ Reach insights error:', reachData);
        
        // Try alternative reach endpoint
        console.log('\n🔄 Trying alternative reach endpoint...');
        const altReachUrl = `https://graph.instagram.com/${account.accountId}/insights?metric=reach&period=days_28&access_token=${decryptedToken}`;
        
        const altReachResponse = await new Promise((resolve, reject) => {
          https.get(altReachUrl, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try {
                resolve({ ok: res.statusCode === 200, json: () => JSON.parse(data) });
              } catch (e) {
                resolve({ ok: false, json: () => ({ error: { message: 'Invalid JSON response' } }) });
              }
            });
          }).on('error', reject);
        });
        
        const altReachData = altReachResponse.json();
        
        if (altReachResponse.ok) {
          console.log('✅ Alternative reach endpoint successful!');
          console.log('  Alternative Reach Data:', JSON.stringify(altReachData, null, 2));
        } else {
          console.log('❌ Alternative reach endpoint also failed:', altReachData);
        }
      }
    } catch (reachError) {
      console.log('❌ Reach insights request failed:', reachError.message);
    }
    
    // Step 4: Test media insights for shares and saves
    console.log('\n💾 Step 4: Testing Media Insights for Shares and Saves...');
    
    try {
      // First get recent media
      const mediaUrl = `https://graph.instagram.com/${account.accountId}/media?fields=id,media_type,timestamp&limit=5&access_token=${decryptedToken}`;
      
      const mediaResponse = await new Promise((resolve, reject) => {
        https.get(mediaUrl, (res) => {
          let data = '';
          res.on('data', (chunk) => data += chunk);
          res.on('end', () => {
            try {
              resolve({ ok: res.statusCode === 200, json: () => JSON.parse(data) });
            } catch (e) {
              resolve({ ok: false, json: () => ({ error: { message: 'Invalid JSON response' } }) });
            }
          });
        }).on('error', reject);
      });
      
      const mediaData = mediaResponse.json();
      
      if (mediaResponse.ok && mediaData.data && mediaData.data.length > 0) {
        console.log('✅ Media retrieved successfully!');
        console.log(`  Found ${mediaData.data.length} media items`);
        
        // Test insights for the first media item
        const firstMedia = mediaData.data[0];
        console.log(`  Testing insights for media ID: ${firstMedia.id}`);
        
        const insightsUrl = `https://graph.instagram.com/${firstMedia.id}/insights?metric=shares,saves&access_token=${decryptedToken}`;
        
        const insightsResponse = await new Promise((resolve, reject) => {
          https.get(insightsUrl, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
              try {
                resolve({ ok: res.statusCode === 200, json: () => JSON.parse(data) });
              } catch (e) {
                resolve({ ok: false, json: () => ({ error: { message: 'Invalid JSON response' } }) });
              }
            });
          }).on('error', reject);
        });
        
        const insightsData = insightsResponse.json();
        
        if (insightsResponse.ok) {
          console.log('✅ Media insights retrieved successfully!');
          console.log('  Insights Data:', JSON.stringify(insightsData, null, 2));
        } else {
          console.log('❌ Media insights error:', insightsData);
          
          // Try with different metrics
          console.log('\n🔄 Trying with different metrics...');
          const altInsightsUrl = `https://graph.instagram.com/${firstMedia.id}/insights?metric=impressions,reach&access_token=${decryptedToken}`;
          
          const altInsightsResponse = await new Promise((resolve, reject) => {
            https.get(altInsightsUrl, (res) => {
              let data = '';
              res.on('data', (chunk) => data += chunk);
              res.on('end', () => {
                try {
                  resolve({ ok: res.statusCode === 200, json: () => JSON.parse(data) });
                } catch (e) {
                  resolve({ ok: false, json: () => ({ error: { message: 'Invalid JSON response' } }) });
                }
              });
            }).on('error', reject);
          });
          
          const altInsightsData = altInsightsResponse.json();
          
          if (altInsightsResponse.ok) {
            console.log('✅ Alternative media insights successful!');
            console.log('  Alternative Insights:', JSON.stringify(altInsightsData, null, 2));
          } else {
            console.log('❌ Alternative media insights also failed:', altInsightsData);
          }
        }
      } else {
        console.log('❌ No media found or media request failed:', mediaData);
      }
    } catch (mediaError) {
      console.log('❌ Media insights request failed:', mediaError.message);
    }
    
    console.log('\n🎯 SUMMARY:');
    console.log('===========');
    console.log('✅ Token decryption: SUCCESS');
    console.log('✅ Instagram API connection: SUCCESS');
    console.log('📊 Reach insights: Check logs above');
    console.log('💾 Media insights: Check logs above');
    console.log('\nThe token is properly decrypted and working with Instagram API!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

testCompleteTokenFlow().catch(console.error);