import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();
import crypto from 'crypto';

// Copying TokenEncryptionService logic manually since it's easier to run this way
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const SALT_LENGTH = 32;
const TAG_LENGTH = 16;
const masterKey = process.env.TOKEN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const globalSalt = process.env.TOKEN_ENCRYPTION_GLOBAL_SALT ? Buffer.from(process.env.TOKEN_ENCRYPTION_GLOBAL_SALT, 'utf8') : Buffer.alloc(0);
const iterations = process.env.TOKEN_KDF_ITERATIONS ? parseInt(process.env.TOKEN_KDF_ITERATIONS, 10) : 100000;

function deriveKey(salt, iters) {
  const saltWithGlobal = globalSalt.length > 0 ? Buffer.concat([salt, globalSalt]) : salt;
  return crypto.pbkdf2Sync(masterKey, saltWithGlobal, iters, KEY_LENGTH, 'sha256');
}

function decryptToken(encryptedToken) {
  try {
    const { encryptedData, iv, salt, tag, kdf } = encryptedToken;
    const ivBuffer = Buffer.from(iv, 'base64');
    const saltBuffer = Buffer.from(salt, 'base64');
    const tagBuffer = Buffer.from(tag, 'base64');
    const iters = kdf ? Number(kdf) : iterations;
    const key = deriveKey(saltBuffer, iters);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
    decipher.setAuthTag(tagBuffer);
    let decryptedData = decipher.update(encryptedData, 'base64', 'utf8');
    decryptedData += decipher.final('utf8');
    return decryptedData;
  } catch (error) {
    console.error('Decryption failed:', error.message);
    return null;
  }
}

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const db = client.db('test');
  const account = await db.collection('socialaccounts').findOne({ workspaceId: '684402c2fd2cd4eb6521b386', platform: 'instagram' });
  console.log("Account found:", account._id);
  console.log("accessToken plain field:", account.accessToken);
  if (account.encryptedAccessToken) {
    console.log("encryptedAccessToken field exists");
    if (typeof account.encryptedAccessToken === 'string') {
      try {
        const obj = JSON.parse(account.encryptedAccessToken);
        console.log("Decrypted (parsed JSON):", decryptToken(obj) ? "SUCCESS" : "FAILED");
      } catch (e) {
        console.log("Decrypted (fallback text):", account.encryptedAccessToken);
      }
    } else {
      const dec = decryptToken(account.encryptedAccessToken);
      console.log("Decrypted:", dec ? dec.substring(0, 10) + "..." : "FAILED");
    }
  } else {
    console.log("encryptedAccessToken is missing");
  }
  await client.close();
}
run();
