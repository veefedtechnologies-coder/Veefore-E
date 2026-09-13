/**
 * backfill-reasoning-effort.ts
 * ---------------------------------------------------------------------------
 * One-off migration: set `aiConfiguration.reasoningEffort = 'low'` on every
 * workspace that doesn't already have the field. The runtime already defaults
 * missing values to 'low', so this is purely to materialize the field on
 * existing documents (so the AI Configuration form shows an explicit value and
 * the data is consistent).
 *
 * SAFE: only fills the field where it's missing; never overwrites a value a
 * user already chose.
 *
 * USAGE:
 *   npx tsx server/scripts/backfill-reasoning-effort.ts            # dry run
 *   npx tsx server/scripts/backfill-reasoning-effort.ts --apply    # write
 * ---------------------------------------------------------------------------
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../../.env') });

import { connectionManager } from '../infrastructure/mongodb-connection';

const DEFAULT_EFFORT = 'low';

async function run() {
  const apply = process.argv.includes('--apply');
  console.log('─'.repeat(78));
  console.log(`Backfill aiConfiguration.reasoningEffort='${DEFAULT_EFFORT}' ${apply ? '(APPLY)' : '(DRY RUN)'}`);
  console.log('─'.repeat(78));

  await connectionManager.connect();
  if (mongoose.connection.readyState !== 1) {
    console.error('❌ Could not establish a MongoDB connection. Aborting.');
    process.exit(1);
  }
  const db = mongoose.connection.db!;
  console.log(`Connected to database: ${db.databaseName}\n`);

  // Operate directly on the collection so we don't depend on which Mongoose
  // model variant is registered. Match docs where reasoningEffort is missing.
  const col = db.collection('workspaces');
  const filter = { 'aiConfiguration.reasoningEffort': { $exists: false } };

  const total = await col.countDocuments({});
  const missing = await col.countDocuments(filter);
  console.log(`Workspaces total: ${total}`);
  console.log(`Missing reasoningEffort: ${missing}`);

  if (missing === 0) {
    console.log('\n✅ Nothing to backfill — all workspaces already have the field.');
    await mongoose.disconnect();
    process.exit(0);
  }

  if (!apply) {
    console.log(`\n🔍 DRY RUN — would set reasoningEffort='${DEFAULT_EFFORT}' on ${missing} workspace(s).`);
    console.log('   Re-run with --apply to write.');
    await mongoose.disconnect();
    process.exit(0);
  }

  const res = await col.updateMany(filter, {
    $set: { 'aiConfiguration.reasoningEffort': DEFAULT_EFFORT },
  });
  console.log(`\n✅ Done. Updated ${res.modifiedCount}/${missing} workspace(s).`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(async err => {
  console.error('❌ Backfill failed:', err);
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
