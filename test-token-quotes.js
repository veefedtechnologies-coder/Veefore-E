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
    const key = deriveKey(Buffer.from(salt, 'base64'), kdf ? Number(kdf) : iterations);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    let dec = decipher.update(encryptedData, 'base64', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (error) {
    return null;
  }
}

async function run() {
  const client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  const account = await client.db('veeforedb').collection('socialaccounts').findOne({ workspaceId: '684402c2fd2cd4eb6521b386', platform: 'instagram' });
  const dec = decryptToken(account.encryptedAccessToken);
  console.log("JSON.stringify(dec):", JSON.stringify(dec));
  console.log("StartsWith EAA?", dec.startsWith("EAA"));
  await client.close();
}
run();
