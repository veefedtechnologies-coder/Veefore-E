import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config();
import crypto from 'crypto';

const masterKey = process.env.TOKEN_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const globalSalt = process.env.TOKEN_ENCRYPTION_GLOBAL_SALT ? Buffer.from(process.env.TOKEN_ENCRYPTION_GLOBAL_SALT, 'utf8') : Buffer.alloc(0);
const iterations = process.env.TOKEN_KDF_ITERATIONS ? parseInt(process.env.TOKEN_KDF_ITERATIONS, 10) : 100000;

function deriveKey(salt, iters) {
  const saltWithGlobal = globalSalt.length > 0 ? Buffer.concat([salt, globalSalt]) : salt;
  return crypto.pbkdf2Sync(masterKey, saltWithGlobal, iters, 32, 'sha256');
}

function decryptToken(encryptedToken) {
  try {
    const { encryptedData, iv, salt, tag, kdf } = encryptedToken;
    const ivBuffer = Buffer.from(iv, 'base64');
    const saltBuffer = Buffer.from(salt, 'base64');
    const tagBuffer = Buffer.from(tag, 'base64');
    const iters = kdf ? Number(kdf) : iterations;
    const key = deriveKey(saltBuffer, iters);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuffer);
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
  const db = client.db('veeforedb');
  const account = await db.collection('socialaccounts').findOne({ workspaceId: '684402c2fd2cd4eb6521b386', platform: 'instagram' });
  
  if (account.encryptedAccessToken) {
    const dec = decryptToken(account.encryptedAccessToken);
    console.log("Decrypted length:", dec ? dec.length : "null");
    if (dec) {
      console.log("Decrypted start:", dec.substring(0, 20));
      console.log("Is truthy:", !!dec);
    }
  }
  await client.close();
}
run();
