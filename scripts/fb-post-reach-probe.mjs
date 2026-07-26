/*
 * fb-post-reach-probe.mjs — Probe post-level reach metrics on Facebook.
 *
 * Many SaaS tools (AgencyAnalytics, Sprout Social, etc.) get "reach" by
 * aggregating post_impressions_unique across individual posts, rather than
 * using the deprecated page_impressions_unique page-level metric.
 *
 * This script:
 *  1. Fetches the last 10 posts from the page
 *  2. For each post, probes post-level insights (post_impressions_unique, etc.)
 *  3. Reports which post-level metrics work and their values
 *
 * USAGE: node scripts/fb-post-reach-probe.mjs
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

const WORKSPACE_ID = process.env.PROBE_WORKSPACE_ID || '686d98d74888852d5d7beb75';

function decryptToken(enc) {
  const salt = Buffer.from(enc.salt, 'base64');
  const globalSalt = process.env.TOKEN_ENCRYPTION_GLOBAL_SALT
    ? Buffer.from(process.env.TOKEN_ENCRYPTION_GLOBAL_SALT, 'utf8')
    : Buffer.alloc(0);
  const iterations = typeof enc.kdf === 'number' ? enc.kdf : parseInt(process.env.TOKEN_KDF_ITERATIONS || '100000', 10);
  const s = globalSalt.length ? Buffer.concat([salt, globalSalt]) : salt;
  const key = crypto.pbkdf2Sync(process.env.TOKEN_ENCRYPTION_KEY, s, iterations, 32, 'sha256');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(enc.iv, 'base64'));
  d.setAuthTag(Buffer.from(enc.tag, 'base64'));
  return d.update(enc.encryptedData, 'base64', 'utf8') + d.final('utf8');
}

async function get(url) {
  const r = await fetch(url);
  const t = await r.text();
  let j;
  try { j = JSON.parse(t); } catch { j = {}; }
  return { status: r.status, json: j };
}

// Post-level insight candidates for reach
const POST_REACH_CANDIDATES = [
  'post_impressions_unique',           // The primary reach replacement at post level
  'post_impressions_organic_unique',   // Organic reach per post
  'post_impressions_paid_unique',      // Paid reach per post
  'post_impressions',                  // Total impressions per post
  'post_impressions_organic',          // Organic impressions per post
  'post_reach',                        // Direct reach (may work on some page types)
  'post_engaged_users',                // Engaged users per post
  'post_clicks',                       // Post clicks
  'post_reactions_by_type_total',      // Reactions breakdown
];

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URL, { dbName: process.env.MONGODB_DB_NAME || 'veeforedb' });
  const acc = await mongoose.connection.collection('socialaccounts').findOne({ platform: 'facebook', workspaceId: WORKSPACE_ID });
  if (!acc) {
    console.log('NO FB ACCOUNT for workspace', WORKSPACE_ID);
    await mongoose.disconnect();
    return;
  }

  const token = acc.encryptedAccessToken ? decryptToken(acc.encryptedAccessToken) : acc.accessToken;
  const pageId = acc.accountId;
  console.log(`FB Page: ${acc.username} (id=${pageId})`);

  // Fetch last 10 posts
  const postsRes = await get(`https://graph.facebook.com/v19.0/${pageId}/posts?fields=id,message,created_time&limit=10&access_token=${token}`);
  if (postsRes.json.error) {
    console.log('❌ Posts fetch failed:', postsRes.json.error.message);
    await mongoose.disconnect();
    return;
  }

  const posts = postsRes.json.data ?? [];
  console.log(`\nFound ${posts.length} posts\n`);

  if (posts.length === 0) {
    console.log('No posts found — cannot probe post-level insights');
    console.log('\nCONCLUSION: Page has no posts, so post-level reach aggregation is not possible');
    await mongoose.disconnect();
    return;
  }

  // Use the first post to probe metrics
  const testPost = posts[0];
  console.log(`Testing post: ${testPost.id} (${testPost.created_time})`);
  console.log(`Message: ${(testPost.message || '').slice(0, 80)}\n`);

  // Probe each post-level metric
  console.log('=== Post-Level Insights Probe ===');
  const workingPostMetrics = [];

  for (const metric of POST_REACH_CANDIDATES) {
    const url = `https://graph.facebook.com/v19.0/${testPost.id}/insights?metric=${metric}&access_token=${token}`;
    const res = await get(url);
    if (res.json.error) {
      console.log(`  ❌ ${metric}: [${res.json.error.code}] ${res.json.error.message}`);
    } else {
      const data = res.json.data ?? [];
      const value = data[0]?.values?.[0]?.value ?? data[0]?.value;
      workingPostMetrics.push(metric);
      console.log(`  ✅ ${metric}: value=${JSON.stringify(value)}`);
    }
  }

  // Also try fetching multiple post metrics in one call (comma-separated)
  console.log('\n=== Batch post metrics call ===');
  const batchUrl = `https://graph.facebook.com/v19.0/${testPost.id}/insights?metric=${POST_REACH_CANDIDATES.join(',')}&access_token=${token}`;
  const batchRes = await get(batchUrl);
  if (batchRes.json.error) {
    console.log(`❌ Batch call failed: [${batchRes.json.error.code}] ${batchRes.json.error.message}`);
  } else {
    console.log(`✅ Batch call succeeded:`);
    for (const item of (batchRes.json.data ?? [])) {
      const value = item.values?.[0]?.value ?? item.value;
      console.log(`   ${item.name}: ${JSON.stringify(value)}`);
    }
  }

  // Try the ?fields= approach on the post object itself
  console.log('\n=== Post fields approach (likes/comments/shares summary) ===');
  const fieldsUrl = `https://graph.facebook.com/v19.0/${testPost.id}?fields=likes.summary(true),comments.summary(true),shares,reactions.summary(true)&access_token=${token}`;
  const fieldsRes = await get(fieldsUrl);
  if (fieldsRes.json.error) {
    console.log(`❌ Fields call failed: [${fieldsRes.json.error.code}] ${fieldsRes.json.error.message}`);
  } else {
    console.log(`✅ Post fields:`);
    console.log(`   likes: ${fieldsRes.json.likes?.summary?.total_count}`);
    console.log(`   comments: ${fieldsRes.json.comments?.summary?.total_count}`);
    console.log(`   shares: ${fieldsRes.json.shares?.count}`);
    console.log(`   reactions: ${fieldsRes.json.reactions?.summary?.total_count}`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('WORKING POST-LEVEL REACH METRICS:');
  if (workingPostMetrics.length === 0) {
    console.log('  (none) — even post-level reach is unavailable for this page');
  } else {
    for (const m of workingPostMetrics) {
      console.log(`  ✅ ${m}`);
    }
    console.log('\nSTRATEGY: Sum post_impressions_unique across all posts in date range → reach_total');
  }
  console.log('='.repeat(60));

  await mongoose.disconnect();
}

run().catch((e) => { console.error('ERROR', e?.message || e); process.exit(1); });
