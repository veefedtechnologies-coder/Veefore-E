/*
 * fb-metric-probe.mjs — Determine which Facebook Page Insights metrics are
 * actually valid for the connected page in the current Graph API version.
 *
 * Tests each candidate metric individually (so one bad metric doesn't mask the
 * rest) across multiple API versions and period values, and reports OK / error.
 *
 * USAGE: node scripts/fb-metric-probe.mjs
 */
import mongoose from 'mongoose';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.join(process.cwd(), '.env') });

const WORKSPACE_ID = process.env.PROBE_WORKSPACE_ID || '686d98d74888852d5d7beb75';
const DAY = 86400;
const now = Math.floor(Date.now() / 1000);
const since = now - 30 * DAY;
const until = now;

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

// ---------------------------------------------------------------------------
// Candidate metrics: validated + ALL known reach replacements from Meta docs
// ---------------------------------------------------------------------------
const VALIDATED_WORKING = [
  // Already confirmed working from previous probe
  'page_posts_impressions_organic',
  'page_post_engagements',
  'page_views_total',
  'page_actions_post_reactions_like_total',
  'page_video_views',
  'page_follows',
  'page_daily_follows',
  'page_daily_unfollows_unique',
  'page_actions_post_reactions_total',
];

// Reach replacement candidates — Meta replaced page_impressions_unique with
// "non-paid unique impressions" metrics in the new views-based model.
// See: https://www.facebook.com/business/help/metrics-labeling
// AgencyAnalytics doc: "Reach Organic → Non-Paid Unique Page Impressions"
const REACH_CANDIDATES = [
  // Non-paid (organic) reach replacements — the primary candidates
  'page_impressions_nonpaid_unique',
  'page_impressions_nonpaid',
  'page_posts_impressions_nonpaid_unique',
  'page_posts_impressions_nonpaid',
  // Organic variants
  'page_impressions_organic_unique_v2',
  'page_impressions_organic_v2',
  'page_impressions_organic_unique',
  'page_impressions_organic',
  // Total unique (may work with metric_type=total_value)
  'page_impressions_unique',
  // Viral variants
  'page_impressions_viral_unique',
  'page_impressions_viral',
  // Post-level reach aggregated to page
  'page_posts_impressions_unique',
  // New views model (Nov 2025)
  'page_views_unique',
  'page_content_activity',
  'page_content_activity_by_action_type',
  'page_daily_video_ad_break_ad_impressions_by_crosspost_status',
  // CTA/clicks (website_clicks replacement candidates)
  'page_cta_clicks_logged_in_unique',
  'page_cta_clicks_logged_in_total',
  'page_cta_clicks_by_site_logged_in_unique',
  // Comments/shares (for engagement completeness)
  'page_positive_feedback_by_type',
  'page_negative_feedback',
  'page_negative_feedback_unique',
];

const ALL_CANDIDATES = [...VALIDATED_WORKING, ...REACH_CANDIDATES];

// metric_type variants to try for metrics that may need them
const METRIC_TYPE_VARIANTS = ['', 'total_value'];

async function probeMetric(version, pageId, token, metric, period, metricType = '') {
  let url = `https://graph.facebook.com/${version}/${pageId}/insights?metric=${metric}&period=${period}&since=${since}&until=${until}&access_token=${token}`;
  if (metricType) url += `&metric_type=${metricType}`;
  const { json } = await get(url);
  if (json.error) {
    return { ok: false, msg: json.error.message, code: json.error.code };
  }
  const data = json.data ?? [];
  const points = data[0]?.values?.length ?? 0;
  const sample = data[0]?.values?.[data[0].values.length - 1]?.value;
  return { ok: true, points, sample };
}

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
  console.log(`Token: ${token ? token.slice(0, 12) + '…' : 'MISSING'}`);
  console.log(`Range: last 30 days\n`);

  // First: confirm token works with a basic profile call
  const prof = await get(`https://graph.facebook.com/v19.0/${pageId}?fields=id,name,fan_count&access_token=${token}`);
  if (prof.json.error) {
    console.log('❌ Profile call failed:', prof.json.error.message);
    await mongoose.disconnect();
    return;
  }
  console.log(`✅ Profile OK: ${prof.json.name}, fan_count=${prof.json.fan_count}\n`);

  // -------------------------------------------------------------------------
  // SECTION 1: Re-confirm previously validated metrics still work
  // -------------------------------------------------------------------------
  console.log('=== SECTION 1: Re-confirming previously validated metrics (v19.0, period=day) ===');
  for (const m of VALIDATED_WORKING) {
    const res = await probeMetric('v19.0', pageId, token, m, 'day');
    const icon = res.ok ? '✅' : '❌';
    const detail = res.ok ? `${res.points} pts, sample=${JSON.stringify(res.sample)}` : `[${res.code}] ${res.msg}`;
    console.log(`  ${icon} ${m}: ${detail}`);
  }

  // -------------------------------------------------------------------------
  // SECTION 2: Probe ALL reach replacement candidates
  // -------------------------------------------------------------------------
  console.log('\n=== SECTION 2: Reach replacement candidates (v19.0, period=day) ===');
  const reachWorking = [];
  for (const m of REACH_CANDIDATES) {
    const res = await probeMetric('v19.0', pageId, token, m, 'day');
    if (res.ok) {
      reachWorking.push({ metric: m, period: 'day', metricType: '', ...res });
      console.log(`  ✅ ${m} (day): ${res.points} pts, sample=${JSON.stringify(res.sample)}`);
    } else {
      console.log(`  ❌ ${m} (day): [${res.code}] ${res.msg}`);
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 3: For failed reach metrics, try with metric_type=total_value
  // -------------------------------------------------------------------------
  const failedReach = REACH_CANDIDATES.filter(m => !reachWorking.find(r => r.metric === m));
  if (failedReach.length) {
    console.log('\n=== SECTION 3: Failed reach metrics retried with metric_type=total_value ===');
    for (const m of failedReach) {
      const res = await probeMetric('v19.0', pageId, token, m, 'day', 'total_value');
      if (res.ok) {
        reachWorking.push({ metric: m, period: 'day', metricType: 'total_value', ...res });
        console.log(`  ✅ ${m} (day, total_value): ${res.points} pts, sample=${JSON.stringify(res.sample)}`);
      } else {
        console.log(`  ❌ ${m} (day, total_value): [${res.code}] ${res.msg}`);
      }
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 4: For still-failed reach metrics, try other periods
  // -------------------------------------------------------------------------
  const stillFailed = REACH_CANDIDATES.filter(m => !reachWorking.find(r => r.metric === m));
  if (stillFailed.length) {
    console.log('\n=== SECTION 4: Still-failed reach metrics retried with period=week/days_28 ===');
    for (const m of stillFailed) {
      for (const p of ['week', 'days_28', 'month', 'lifetime']) {
        const res = await probeMetric('v19.0', pageId, token, m, p);
        if (res.ok) {
          reachWorking.push({ metric: m, period: p, metricType: '', ...res });
          console.log(`  ✅ ${m} (${p}): ${res.points} pts, sample=${JSON.stringify(res.sample)}`);
          break;
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 5: Try newer API versions for failed metrics
  // -------------------------------------------------------------------------
  const stillFailedV2 = REACH_CANDIDATES.filter(m => !reachWorking.find(r => r.metric === m));
  if (stillFailedV2.length) {
    console.log('\n=== SECTION 5: Failed reach metrics on newer API versions (v21.0, v22.0) ===');
    for (const m of stillFailedV2.slice(0, 10)) { // limit to avoid rate limits
      for (const v of ['v21.0', 'v22.0']) {
        const res = await probeMetric(v, pageId, token, m, 'day');
        if (res.ok) {
          reachWorking.push({ metric: m, period: 'day', version: v, metricType: '', ...res });
          console.log(`  ✅ ${m} (${v}/day): ${res.points} pts, sample=${JSON.stringify(res.sample)}`);
          break;
        } else {
          console.log(`  ❌ ${m} (${v}/day): [${res.code}] ${res.msg}`);
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n' + '='.repeat(60));
  console.log('REACH METRICS THAT WORK:');
  if (reachWorking.length === 0) {
    console.log('  (none found — Meta has fully removed page-level reach)');
  } else {
    for (const r of reachWorking) {
      console.log(`  ✅ ${r.metric} (period=${r.period}${r.metricType ? ', type=' + r.metricType : ''}${r.version ? ', ver=' + r.version : ''}): ${r.points} pts, sample=${JSON.stringify(r.sample)}`);
    }
  }
  console.log('='.repeat(60));

  await mongoose.disconnect();
}

run().catch((e) => { console.error('ERROR', e?.message || e); process.exit(1); });
