const crypto = require('crypto');

// Token decryption function (copied from server)
function decryptToken(encryptedTokenString) {
  try {
    console.log('🔍 Starting token decryption...');
    console.log('🔍 Input type:', typeof encryptedTokenString);
    console.log('🔍 Input value:', encryptedTokenString);
    
    if (!encryptedTokenString) {
      console.log('❌ No encrypted token provided');
      return null;
    }

    // Parse the encrypted token JSON
    let encryptedData;
    try {
      encryptedData = JSON.parse(encryptedTokenString);
      console.log('✅ JSON parsing successful');
      console.log('🔍 Parsed keys:', Object.keys(encryptedData));
    } catch (parseError) {
      console.log('❌ JSON parsing failed:', parseError.message);
      return null;
    }

    // Check if it's the old format (base64 only)
    if (encryptedData.encryptedData && !encryptedData.iv && !encryptedData.salt && !encryptedData.tag) {
      console.log('🔄 Detected OLD FORMAT (base64 only)');
      try {
        const decoded = Buffer.from(encryptedData.encryptedData, 'base64').toString('utf8');
        console.log('✅ Base64 decoding successful');
        console.log('🔐 Token length:', decoded.length);
        console.log('🔐 Token preview:', decoded.substring(0, 50) + '...');
        return decoded;
      } catch (decodeError) {
        console.log('❌ Base64 decoding failed:', decodeError.message);
        return null;
      }
    }

    // Check if it's the new format (AES-256-GCM)
    if (encryptedData.iv && encryptedData.salt && encryptedData.tag && encryptedData.encryptedData) {
      console.log('🔄 Detected NEW FORMAT (AES-256-GCM)');
      
      const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '1907535313&9!2^3*5d8b0c+-=563bf_3467:6e74cfe2c@06$3bce5600bd4aba';
      console.log('🔑 Using encryption key length:', ENCRYPTION_KEY.length);
      
      try {
        // Convert base64 strings back to buffers
        const iv = Buffer.from(encryptedData.iv, 'base64');
        const salt = Buffer.from(encryptedData.salt, 'base64');
        const tag = Buffer.from(encryptedData.tag, 'base64');
        const encrypted = Buffer.from(encryptedData.encryptedData, 'base64');
        
        console.log('🔍 Buffer lengths:', { iv: iv.length, salt: salt.length, tag: tag.length, encrypted: encrypted.length });
        
        // Derive key from password and salt
        const key = crypto.pbkdf2Sync(ENCRYPTION_KEY, salt, 100000, 32, 'sha256');
        console.log('🔑 Derived key length:', key.length);
        
        // Create decipher
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        
        // Decrypt
        let decrypted = decipher.update(encrypted, null, 'utf8');
        decrypted += decipher.final('utf8');
        
        console.log('✅ AES-256-GCM decryption successful');
        console.log('🔐 Token length:', decrypted.length);
        console.log('🔐 Token preview:', decrypted.substring(0, 50) + '...');
        return decrypted;
        
      } catch (decryptError) {
        console.log('❌ AES-256-GCM decryption failed:', decryptError.message);
        return null;
      }
    }

    console.log('❓ Unknown token format');
    return null;
    
  } catch (error) {
    console.log('❌ General decryption error:', error.message);
    return null;
  }
}

// Test with the actual encrypted token from database
const encryptedToken = '{"encryptedData":"TgbIiCFUu8FDLxHYyjgED6tJbxQFXAKoMnosqiyEcimzGtVjSCSHVoSG7oUNj9GNDNKpYqQFyBOFqHGsQx/a9SILdnqeCzfdfDUHXod/+zHixKm1O2OYZejg6wz1ROKVnH1M0CbYwFGBQzeEQtKooy3zgV97Rt+wOstGCADxKzt1h5UI1ovjGHcXxUZL47HRjsLzfr9Y/PoPW8BLEo+3","iv":"lHOVdKDVHANW1HL8","salt":"d+vtDl7chrptdqGpSxvtfgPmVH/jpcABhrOVB3gFjsQ=","tag":"PrX+Ywoxhg7mgs+lFcXA5A=="}';

console.log('🧪 Testing token decryption with actual database token...\n');
const result = decryptToken(encryptedToken);

if (result) {
  console.log('\n✅ DECRYPTION SUCCESS!');
  console.log('🔐 Decrypted token:', result);
} else {
  console.log('\n❌ DECRYPTION FAILED!');
}