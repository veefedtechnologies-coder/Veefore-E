
import mongoose, { Schema } from 'mongoose';
import dotenv from 'dotenv';

dotenv.config({ path: 'server/.env' });

const WORKSPACE_ID = '6843035f111709a736159e39';
const ALT_WORKSPACE_ID = '68b723f16bcd3c9930f28762';

// Inline Schemas to avoid import issues
const SocialAccountSchema = new Schema({
    workspaceId: { type: Schema.Types.Mixed, required: true },
    platform: { type: String, required: true },
    username: String,
    isActive: Boolean,
    lastSyncAt: Date,
    followersCount: Number,
}, { strict: false });

const AnalyticsSchema = new Schema({
    workspaceId: { type: Schema.Types.Mixed, required: true },
    platform: { type: String },
    date: { type: Date },
    metrics: { type: Schema.Types.Mixed },
    views: Number,
    followers: Number,
}, { strict: false });

const SocialAccountModel = mongoose.model('SocialAccount', SocialAccountSchema);
const AnalyticsModel = mongoose.model('Analytics', AnalyticsSchema);

async function verifyData() {
    try {
        if (!process.env.MONGODB_URI) {
            // Fallback or error
            console.log('Checking for local env file...');
        }
        const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore'; // Guessing local default if env fails

        console.log('Connecting to MongoDB...');
        await mongoose.connect(uri);
        console.log('Connected.');

        // 1. Check Social Accounts
        console.log('\n--- Checking Social Accounts ---');
        const accounts = await SocialAccountModel.find({
            $or: [
                { workspaceId: WORKSPACE_ID },
                { workspaceId: new mongoose.Types.ObjectId(WORKSPACE_ID) },
                { workspaceId: ALT_WORKSPACE_ID },
                { workspaceId: new mongoose.Types.ObjectId(ALT_WORKSPACE_ID) }
            ]
        });
        console.log(`Found ${accounts.length} accounts for workspaces ${WORKSPACE_ID} and ${ALT_WORKSPACE_ID}`);
        accounts.forEach(acc => {
            console.log(`- ID: ${acc._id}`);
            console.log(`  Platform: ${acc.get('platform')}`);
            console.log(`  Username: ${acc.get('username')}`);
            console.log(`  WS ID Type: ${typeof acc.get('workspaceId')}`);
            console.log(`  WS ID Value: ${acc.get('workspaceId')}`);
            console.log(`  Is Active: ${acc.get('isActive')}`);
            console.log(`  Last Sync: ${acc.get('lastSyncAt')}`);
            console.log(`  Followers: ${acc.get('followersCount')}`);
        });

        // 2. Check Analytics
        console.log('\n--- Checking Analytics ---');
        const analytics = await AnalyticsModel.find({
            $or: [
                { workspaceId: WORKSPACE_ID },
                { workspaceId: new mongoose.Types.ObjectId(WORKSPACE_ID) },
                { workspaceId: ALT_WORKSPACE_ID },
                { workspaceId: new mongoose.Types.ObjectId(ALT_WORKSPACE_ID) }
            ]
        }).sort({ date: -1 });

        console.log(`Found ${analytics.length} analytics records for workspace ${WORKSPACE_ID}`);
        analytics.forEach(rec => {
            console.log(`- ID: ${rec._id}`);
            console.log(`  Date: ${rec.get('date')}`);
            console.log(`  Platform: ${rec.get('platform')}`);
            console.log(`  WS ID Type: ${typeof rec.get('workspaceId')}`);
            console.log(`  WS ID Value: ${rec.get('workspaceId')}`);
            console.log(`  Views: ${rec.get('views')}`);
            console.log(`  Followers: ${rec.get('followers')}`);
        });

        // Always list all accounts for full visibility
        console.log('\n--- DEBUG: Listing ALL Social Accounts ---');
        const allAccounts = await SocialAccountModel.find({});
        // 3. Check Users
        console.log('\n--- Checking Users ---');
        const UserSchema = new Schema({}, { strict: false });
        const UserModel = mongoose.model('User', UserSchema);
        const users = await UserModel.find({});
        console.log(`Found ${users.length} users`);
        users.forEach(u => {
            console.log(`- User: ${u.get('email')} / ${u.get('username')}`);
            console.log(`  _id: ${u._id}`);
            console.log(`  Workspace ID: ${u.get('workspaceId')} (${typeof u.get('workspaceId')})`);
        });

        // 4. Check Workspaces
        console.log('\n--- Checking Workspaces ---');
        const WorkspaceSchema = new Schema({}, { strict: false });
        const WorkspaceModel = mongoose.model('Workspace', WorkspaceSchema);
        const workspaces = await WorkspaceModel.find({});
        console.log(`Found ${workspaces.length} workspaces`);
        workspaces.forEach(ws => {
            console.log(`- Workspace: ${ws.get('name')}`);
            console.log(`  _id: ${ws._id}`);
            console.log(`  External ID (if any): ${ws.get('workspaceId')}`);
        });

        // 5. Deep Search for Suspect ID
        const SUSPECT_ID = '68b723f16bcd3c9930f28762';
        console.log(`\n--- Deep Search for Suspect ID: ${SUSPECT_ID} ---`);
        const userWithSuspect = await UserModel.findOne({ $or: [{ _id: SUSPECT_ID }, { workspaceId: SUSPECT_ID }] });
        if (userWithSuspect) {
            console.log(`Found User linked to Suspect ID: ${userWithSuspect.get('email')}`);
        } else {
            console.log('No User found with Suspect ID as _id or workspaceId');
        }

        const wsWithSuspect = await WorkspaceModel.findOne({ $or: [{ _id: SUSPECT_ID }, { workspaceId: SUSPECT_ID }] });
        if (wsWithSuspect) {
            console.log(`Found Workspace linked to Suspect ID: ${wsWithSuspect.get('name')}`);
        } else {
            console.log('No Workspace found with Suspect ID as _id or workspaceId');
        }

        // 6. Check for recently updated Social Accounts or Analytics
        console.log('\n--- Checking for Recent Updates (Last 15 mins) ---');
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
        const recentAccounts = await SocialAccountModel.find({ updatedAt: { $gte: fifteenMinsAgo } });
        console.log(`Found ${recentAccounts.length} recently updated accounts`);
        recentAccounts.forEach(acc => {
            console.log(`- Account: @${acc.get('username')} (${acc.get('platform')})`);
            console.log(`  Updated: ${acc.get('updatedAt')}`);
            console.log(`  WS ID: ${acc.get('workspaceId')}`);
            console.log(`  Is Active: ${acc.get('isActive')}`);
        });

        const RecentAnalyticsModel = mongoose.model('RecentAnalytics', new Schema({}, { strict: false }), 'analytics');
        const recentAnalytics = await RecentAnalyticsModel.find({ updatedAt: { $gte: fifteenMinsAgo } });
        console.log(`Found ${recentAnalytics.length} recently updated/created analytics docs`);

        const MetricsModel = mongoose.model('RecentMetrics', new Schema({}, { strict: false }), 'metrics');
        const recentMetrics = await MetricsModel.find({ updatedAt: { $gte: fifteenMinsAgo } });
        console.log(`Found ${recentMetrics.length} recently updated/created metrics docs`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

verifyData();
