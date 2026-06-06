
import mongoose from 'mongoose';
import { SocialAccountModel } from '../models/Social';
import { AnalyticsModel } from '../models/Analytics';
import dotenv from 'dotenv';
import path from 'path';

// Fix for strictQuery warning
mongoose.set('strictQuery', false);

async function runDiagnosis() {
    console.log('--- Diagnosis: Active Accounts & Analytics Visibility ---');

    // Load env from project root (server/../.env)
    // Assumes script is run from server/ directory
    const envPath = path.resolve(process.cwd(), '../.env');
    console.log(`Loading .env from: ${envPath}`);
    dotenv.config({ path: envPath });

    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error('MONGODB_URI not found in environment');
        }
        console.log('Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('Connected.');

        // 1. List all workspaces with SocialAccounts
        const accounts = await SocialAccountModel.find({});
        console.log(`\nFound ${accounts.length} total social accounts.`);

        const accountsByWorkspace: Record<string, any[]> = {};
        accounts.forEach(acc => {
            const wid = acc.workspaceId.toString();
            if (!accountsByWorkspace[wid]) accountsByWorkspace[wid] = [];
            accountsByWorkspace[wid].push(acc);
        });

        // 2. Analyze per workspace
        for (const wid of Object.keys(accountsByWorkspace)) {
            console.log(`\nWorkspace: ${wid}`);
            const wsAccounts = accountsByWorkspace[wid];
            console.log(`  Total Accounts: ${wsAccounts.length}`);

            const activeAccounts = wsAccounts.filter(a => a.isActive);
            console.log(`  Active Accounts: ${activeAccounts.length}`);
            activeAccounts.forEach(a => {
                console.log(`    - [${a.platform}] @${a.username} (ID: ${a._id})`);
            });

            const inactiveAccounts = wsAccounts.filter(a => !a.isActive);
            if (inactiveAccounts.length > 0) {
                console.log(`  Inactive Accounts: ${inactiveAccounts.length}`);
                inactiveAccounts.forEach(a => {
                    console.log(`    - [${a.platform}] @${a.username} (ID: ${a._id})`);
                });
            }

            // Check Analytics
            const analyticsCount = await AnalyticsModel.countDocuments({ workspaceId: wid });
            console.log(`  Analytics Records: ${analyticsCount}`);

            // Check if getPerformanceSummary would return data
            if (activeAccounts.length === 0) {
                console.log(`  -> EXPECTATION: Dashboard should show ZERO (No active accounts)`);
            } else {
                const activePlatforms = activeAccounts.map(a => a.platform);
                console.log(`  -> EXPECTATION: Dashboard shows data for [${activePlatforms.join(', ')}]`);
            }
        }

        // 3. Check for Orphaned Analytics (Workspaces with NO accounts but HAS analytics)
        console.log('\nChecking for Orphaned Analytics (Workspaces with data but no accounts)...');
        const allAnalytics = await AnalyticsModel.find({}).select('workspaceId platform').lean();
        const analyticsWorkspaces = new Set(allAnalytics.map(a => a.workspaceId.toString()));

        let orphanedCount = 0;
        for (const wid of analyticsWorkspaces) {
            if (!accountsByWorkspace[wid] || accountsByWorkspace[wid].length === 0) {
                // This is a workspace with data but NO accounts (deleted?)
                console.log(`  ! ORPHANED DATA: Workspace ${wid} has analytics records but NO SocialAccounts.`);
                orphanedCount++;
            }
        }

        if (orphanedCount === 0) {
            console.log('  No orphaned workspaces found (where logic might fail if we filter by active accounts correctly).');
        }

    } catch (error) {
        console.error('Diagnosis failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('\nDone.');
    }
}

runDiagnosis();
