const mongoose = require('mongoose');
const crypto = require('crypto');
const https = require('https');

const uri = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/veeforedb';
const ENCRYPTION_KEY = '4a05d6c96563af0ad43d37629787fb3f2cab02bc4ddb7da2f4341a777932aba7';
const GLOBAL_SALT = '8d148018566c696f0dfbda2d10b8abdd100354ce54e5dce4ad4f8954caaf2673';

// Decrypt token using same algorithm as TokenEncryptionService
function decryptToken(encrypted) {
  const { encryptedData, iv, salt, tag, kdf } = encrypted;
  const ivBuffer = Buffer.from(iv, 'base64');
  const saltBuffer = Buffer.from(salt, 'base64');
  const tagBuffer = Buffer.from(tag, 'base64');
  const iterations = kdf || 100000;
  // Combine per-token salt with global salt (same as server does)
  const globalSaltBuffer = Buffer.from(GLOBAL_SALT, 'utf8');
  const combinedSalt = Buffer.concat([saltBuffer, globalSaltBuffer]);
  const key = crypto.pbkdf2Sync(ENCRYPTION_KEY, combinedSalt, iterations, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
  decipher.setAuthTag(tagBuffer);
  let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function run() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  // Get rahulc1020's account
  const account = await db.collection('socialaccounts').findOne({ username: 'rahulc1020' });
  const accountId = account.accountId; // '17841474747481653'
  const workspaceId = account.workspaceId;

  console.log('Account:', account.username, '| accountId:', accountId, '| workspaceId:', workspaceId);

  // Decrypt token
  let token;
  try {
    token = decryptToken(account.encryptedAccessToken);
    console.log('Token decrypted, length:', token.length);
  } catch (e) {
    console.error('Failed to decrypt token:', e.message);
    process.exit(1);
  }

  // Fetch media IDs from Instagram Basic Display API
  // Try /me/media first (Basic Display)
  let allMediaIds = new Set();
  try {
    const mediaUrl = `https://graph.instagram.com/me/media?fields=id&limit=100&access_token=${token}`;
    const result = await fetchJson(mediaUrl);
    if (result.data) {
      result.data.forEach(m => allMediaIds.add(m.id));
      console.log('Fetched', allMediaIds.size, 'media IDs from Basic Display API');
    } else {
      console.log('Basic Display API response:', JSON.stringify(result).substring(0, 200));
    }
  } catch (e) {
    console.log('Basic Display API error:', e.message);
  }

  // Try Graph API /media endpoint
  if (allMediaIds.size === 0) {
    try {
      const mediaUrl = `https://graph.facebook.com/v22.0/${accountId}/media?fields=id&limit=100&access_token=${token}`;
      const result = await fetchJson(mediaUrl);
      if (result.data) {
        result.data.forEach(m => allMediaIds.add(m.id));
        console.log('Fetched', allMediaIds.size, 'media IDs from Graph API');
      } else {
        console.log('Graph API response:', JSON.stringify(result).substring(0, 200));
      }
    } catch (e) {
      console.log('Graph API error:', e.message);
    }
  }

  if (allMediaIds.size === 0) {
    console.log('Could not fetch media IDs from Instagram API - token may be expired or insufficient permissions');
    console.log('The polling system will sync posts automatically when the token is refreshed.');
    process.exit(0);
  }

  const mediaIdArray = [...allMediaIds];
  console.log('Valid media IDs from Instagram:', mediaIdArray.join(', '));

  // Only tag content documents whose externalId is in the real media list
  const result = await db.collection('contents').updateMany(
    {
      'contentData.externalId': { $in: mediaIdArray },
      workspaceId: workspaceId
    },
    { $set: { accountId: accountId } }
  );
  console.log('Tagged', result.modifiedCount, 'content documents with correct accountId');

  // Report what's left without accountId in this workspace
  const untagged = await db.collection('contents').countDocuments({ 
    workspaceId: workspaceId, 
    accountId: { $exists: false } 
  });
  console.log('Remaining untagged content in workspace:', untagged, '(these belong to other accounts - they will be ignored)');

  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
