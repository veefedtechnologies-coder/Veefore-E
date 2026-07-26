/*
 * Probe #4 — confirm follows_and_unfollows breakdown mapping vs follower_count.
 * USAGE: node scripts/meta-api-probe.mjs <instagramUserId>
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

const V = 'v22.0';
const IG_ID = process.argv[2] || '17841406961110225';
const DAY = 86400;
const now = Math.floor(Date.now() / 1000);
const daysAgo = (n) => now - n * DAY;

function decryptToken(enc) {
  const salt = Buffer.from(enc.salt, 'base64');
  const globalSalt = process.env.TOKEN_ENCRYPTION_GLOBAL_SALT ? Buffer.from(process.env.TOKEN_ENCRYPTION_GLOBAL_SALT, 'utf8') : Buffer.alloc(0);
  const iterations = typeof enc.kdf === 'number' ? enc.kdf : parseInt(process.env.TOKEN_KDF_ITERATIONS || '100000', 10);
  const s = globalSalt.length ? Buffer.concat([salt, globalSalt]) : salt;
  const key = crypto.pbkdf2Sync(process.env.TOKEN_ENCRYPTION_KEY, s, iterations, 32, 'sha256');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'base64'));
  d.setAuthTag(Buffer.from(enc.tag, 'base64'));
  return d.update(enc.encryptedData, 'base64', 'utf8') + d.final('utf8');
}
async function get(url) { const r = await fetch(url); const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = {}; } return { status: r.status, json: j }; }

async function fnu(token, sinceN, spanDays) {
  const since = daysAgo(sinceN), until = Math.min(since + spanDays * DAY, now);
  const url = `https://graph.facebook.com/${V}/${IG_ID}/insights?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type&since=${since}&until=${until}&access_token=${token}`;
  const { json } = await get(url);
  const results = json?.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
  const map = {}; results.forEach((r) => (map[r.dimension_values?.[0]] = r.value));
  return map;
}
async function fc(token, sinceN, spanDays) {
  const since = daysAgo(sinceN), until = Math.min(since + spanDays * DAY, now);
  const url = `https://graph.facebook.com/${V}/${IG_ID}/insights?metric=follower_count&period=day&since=${since}&until=${until}&access_token=${token}`;
  const { json } = await get(url);
  const vals = json?.data?.[0]?.values ?? [];
  return vals.reduce((s, v) => s + (v.value || 0), 0);
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL, { dbName: process.env.MONGO_DB_NAME || 'veeforedb' });
  const acc = await mongoose.connection.collection('socialaccounts').findOne({ accountId: IG_ID });
  const token = decryptToken(acc.encryptedAccessToken);
  console.log(`Account @${acc.username}\n`);
  console.log('Compare follows_and_unfollows[FOLLOWER] vs follower_count (should match if FOLLOWER = new follows):\n');
  for (const [label, n, span] of [['last 7d', 7, 7], ['last 30d', 30, 30]]) {
    const m = await fnu(token, n, span);
    const g = await fc(token, n, span);
    console.log(`  ${label}: follower_count=${g} | follows_and_unfollows FOLLOWER=${m.FOLLOWER} NON_FOLLOWER=${m.NON_FOLLOWER}`);
  }
  console.log(`\nCurrent followers: (from account) — net over range = FOLLOWER - NON_FOLLOWER`);
  await mongoose.disconnect();
}
run().catch((e) => { console.error('ERROR', e?.message || e); process.exit(1); });
