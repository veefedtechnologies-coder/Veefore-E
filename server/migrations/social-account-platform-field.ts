/**
 * Migration: social-account-platform-field
 *
 * Purpose:
 *   Backfills `platform: "instagram"` and `connectionStatus: "ACTIVE"` onto all
 *   existing SocialAccount documents that were created before multi-platform support
 *   was added (Requirements 3.1).
 *
 * Safety:
 *   - Idempotent — uses `{ $exists: false }` filters so re-running is harmless.
 *   - The compound unique index `{ workspaceId, platform, accountId }` is created
 *     AFTER the backfill so every document already has `platform` set, which prevents
 *     partial-null conflicts on the sparse unique index.
 *
 * Usage:
 *   tsx server/migrations/social-account-platform-field.ts
 *
 * Environment:
 *   Reads MONGODB_URI from the .env file in the project root.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Environment setup
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Load from project root .env  (two levels up: server/migrations → server → root)
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

// ---------------------------------------------------------------------------
// MongoDB connection
// ---------------------------------------------------------------------------

async function connectDB(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Ensure the .env file exists at the project root and contains a valid connection string.'
    );
  }

  console.log('🔌 Connecting to MongoDB…');
  await mongoose.connect(uri, {
    // Fail fast rather than buffering commands while disconnected
    bufferCommands: false,
  });
  console.log(`✅ Connected — database: ${mongoose.connection.db?.databaseName ?? 'unknown'}`);
}

// ---------------------------------------------------------------------------
// Migration steps
// ---------------------------------------------------------------------------

/**
 * Step 1 — Backfill `platform: "instagram"` on documents that lack the field.
 *
 * The filter `{ platform: { $exists: false } }` guarantees only pre-migration
 * documents are touched. All existing records were Instagram accounts.
 */
async function backfillPlatform(collection: mongoose.Collection): Promise<void> {
  console.log('\n📋 Step 1 — Backfilling platform field…');

  const result = await collection.updateMany(
    { platform: { $exists: false } },
    { $set: { platform: 'instagram' } }
  );

  if (result.matchedCount === 0) {
    console.log('   ✅ No documents needed platform backfill (already up to date).');
  } else {
    console.log(
      `   ✅ Backfilled platform="instagram" on ${result.modifiedCount} / ${result.matchedCount} document(s).`
    );
  }
}

/**
 * Step 2 — Backfill `connectionStatus: "ACTIVE"` on documents that lack the field.
 *
 * Existing connected accounts were implicitly active; marking them ACTIVE makes the
 * status explicit so all downstream code can rely on the field's presence.
 */
async function backfillConnectionStatus(collection: mongoose.Collection): Promise<void> {
  console.log('\n📋 Step 2 — Backfilling connectionStatus field…');

  const result = await collection.updateMany(
    { connectionStatus: { $exists: false } },
    { $set: { connectionStatus: 'ACTIVE' } }
  );

  if (result.matchedCount === 0) {
    console.log('   ✅ No documents needed connectionStatus backfill (already up to date).');
  } else {
    console.log(
      `   ✅ Backfilled connectionStatus="ACTIVE" on ${result.modifiedCount} / ${result.matchedCount} document(s).`
    );
  }
}

/**
 * Step 3 — Ensure the compound unique index exists AFTER the backfill.
 *
 * The index is `{ workspaceId: 1, platform: 1, accountId: 1 }` with:
 *   - `unique: true` — prevents duplicate connections per workspace/platform/account
 *   - `sparse: true` — skips documents where `accountId` is absent (safe for legacy
 *     records that may predate the `accountId` field)
 *   - `background: true` — non-blocking build on large collections
 *
 * Calling `createIndex` on an already-existing index with identical options is a
 * no-op in MongoDB, so this step is idempotent.
 */
async function ensureCompoundUniqueIndex(collection: mongoose.Collection): Promise<void> {
  console.log('\n📋 Step 3 — Ensuring compound unique index { workspaceId, platform, accountId }…');

  // List current indexes so we can report the before/after state.
  const existingIndexes = await collection.indexes();
  const indexNames = existingIndexes.map((idx) => idx.name as string);
  const INDEX_NAME = 'workspace_platform_account_unique';

  if (indexNames.includes(INDEX_NAME)) {
    console.log(`   ✅ Index "${INDEX_NAME}" already exists — no action required.`);
    return;
  }

  console.log(`   ⚙️  Creating index "${INDEX_NAME}"…`);
  await collection.createIndex(
    { workspaceId: 1, platform: 1, accountId: 1 },
    {
      unique: true,
      sparse: true,
      background: true,
      name: INDEX_NAME,
    }
  );
  console.log(`   ✅ Index "${INDEX_NAME}" created successfully.`);
}

// ---------------------------------------------------------------------------
// Verification helper
// ---------------------------------------------------------------------------

/**
 * Prints a brief summary of the collection state after the migration so the
 * operator can quickly confirm correctness without opening a DB shell.
 */
async function printSummary(collection: mongoose.Collection): Promise<void> {
  console.log('\n📊 Post-migration summary:');

  const total             = await collection.countDocuments();
  const withoutPlatform   = await collection.countDocuments({ platform: { $exists: false } });
  const withoutStatus     = await collection.countDocuments({ connectionStatus: { $exists: false } });
  const byPlatform        = await collection
    .aggregate<{ _id: string; count: number }>([{ $group: { _id: '$platform', count: { $sum: 1 } } }])
    .toArray();

  console.log(`   Total SocialAccount documents : ${total}`);
  console.log(`   Still missing platform        : ${withoutPlatform}`);
  console.log(`   Still missing connectionStatus: ${withoutStatus}`);
  console.log('   Platform breakdown:');
  byPlatform.forEach(({ _id, count }) => {
    console.log(`     ${_id ?? '(null)'}: ${count}`);
  });
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function runMigration(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Migration: social-account-platform-field');
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    await connectDB();

    // Use the raw MongoDB collection so the migration remains independent of
    // the Mongoose model definition — this makes it safe to run at any point
    // in the deployment lifecycle even before the app boots with the new schema.
    const collection = mongoose.connection.collection('socialaccounts');

    await backfillPlatform(collection);
    await backfillConnectionStatus(collection);
    await ensureCompoundUniqueIndex(collection);
    await printSummary(collection);

    console.log('\n🎉 Migration completed successfully.\n');
    process.exit(0);
  } catch (err) {
    console.error('\n🚨 Migration failed:', err);
    process.exit(1);
  } finally {
    // Always close the connection so the process exits cleanly.
    try {
      await mongoose.connection.close();
      console.log('🔌 MongoDB connection closed.');
    } catch {
      // Ignore close errors — we're already exiting.
    }
  }
}

runMigration();
