/*
 * Read-only diagnostic: shows the GENUINE daily follower captures the analytics
 * bridge reads from (the `analytics` collection's `followers` field, captured by
 * the sync straight from Instagram). Use this to confirm whether follower data
 * actually varies over time — which is what lets the Followers KPI/delta change
 * per time range.
 *
 * USAGE (from Veefore-E/):
 *   node scripts/check-follower-history.mjs                 # all workspaces (summary)
 *   node scripts/check-follower-history.mjs <workspaceId>   # one workspace (daily rows)
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const DB_NAME = process.env.MONGO_DB_NAME || 'veeforedb';
const workspaceArg = process.argv[2];

async function run() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URL || '';
  if (!uri) {
    console.error('❌ MONGODB_URI (or MONGO_URL) is not set in .env');
    process.exit(1);
  }

  await mongoose.connect(uri, { dbName: DB_NAME });
  const db = mongoose.connection.db;
  console.log(`✅ Connected to MongoDB (db: ${mongoose.connection.name})\n`);

  const coll = db.collection('analytics');

  if (!workspaceArg) {
    // Summary: for each workspace, how many distinct daily follower values exist.
    const rows = await coll
      .aggregate([
        { $match: { followers: { $gt: 0 } } },
        {
          $group: {
            _id: '$workspaceId',
            days: { $sum: 1 },
            distinctFollowers: { $addToSet: '$followers' },
            minDate: { $min: '$date' },
            maxDate: { $max: '$date' },
          },
        },
        { $sort: { days: -1 } },
        { $limit: 30 },
      ])
      .toArray();

    if (rows.length === 0) {
      console.log('No analytics docs with followers > 0 found. Followers cannot vary per range.');
    } else {
      console.log('workspaceId | daysWithFollowers | distinctValues | dateRange');
      console.log('-'.repeat(90));
      for (const r of rows) {
        const distinct = (r.distinctFollowers || []).length;
        const span = `${fmt(r.minDate)} → ${fmt(r.maxDate)}`;
        console.log(
          `${String(r._id).padEnd(26)} | ${String(r.days).padStart(4)} | ${String(distinct).padStart(4)} distinct | ${span}`
        );
      }
      console.log(
        '\nIf "distinct" is 1, the follower count never changed in the captured data →\n' +
          'the Followers total/delta will look identical across every time range (a data fact, not a bug).'
      );
    }
    await mongoose.disconnect();
    return;
  }

  // Detail: daily follower rows for one workspace.
  const rows = await coll
    .aggregate([
      { $match: { workspaceId: String(workspaceArg), followers: { $gt: 0 } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          followers: { $last: '$followers' },
          reachDays28: { $last: '$reachDays28' },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  console.log(`Workspace ${workspaceArg}: ${rows.length} day(s) with follower data\n`);
  console.log('date       | followers | reach(28d)');
  console.log('-'.repeat(40));
  for (const r of rows) {
    console.log(`${r._id} | ${String(r.followers).padStart(9)} | ${r.reachDays28 ?? '-'}`);
  }
  const distinct = new Set(rows.map((r) => r.followers)).size;
  console.log(
    `\nDistinct follower values: ${distinct}. ` +
      (distinct <= 1
        ? 'Follower count is constant → nothing changes per range (data fact).'
        : 'Follower count varies → the delta should change per range.')
  );

  await mongoose.disconnect();
}

function fmt(d) {
  try {
    return new Date(d).toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
