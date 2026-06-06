
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('MONGODB_URI not found in .env');
    process.exit(1);
}

// Define schemas to avoid importing complex dependencies
const WorkspaceMemberSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.Mixed, required: true },
    workspaceId: { type: mongoose.Schema.Types.Mixed, required: true },
    role: { type: String, required: true },
}, { collection: 'workspacemembers' }); // Force lowercase collection name if needed, or 'WorkspaceMember'

const WorkspaceSchema = new mongoose.Schema({
    name: String,
    userId: mongoose.Schema.Types.Mixed
}, { collection: 'workspaces' });

const MemberModel = mongoose.model('DebugWorkspaceMember', WorkspaceMemberSchema, 'WorkspaceMember');
const WorkspaceModel = mongoose.model('DebugWorkspace', WorkspaceSchema, 'Workspace');

async function debugAccess() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI as string);
        console.log('Connected.');

        const targetUserId = '689877ea1096a8143f0a6af2';
        const targetWorkspaceId = '68b723f16bcd3c9930f28762';

        console.log(`\n--- Debugging User: ${targetUserId} ---`);
        console.log(`--- Target Workspace: ${targetWorkspaceId} ---`);

        // 1. Check Workspace existence
        const workspace = await WorkspaceModel.findById(targetWorkspaceId);
        if (!workspace) {
            console.error('❌ Workspace NOT FOUND in DB');
        } else {
            console.log('✅ Workspace FOUND:', workspace);
            console.log('   Workspace Owner ID:', workspace.get('userId'));
            console.log('   Owner ID Type:', typeof workspace.get('userId'));
        }

        // 2. Check Memberships (String query)
        console.log('\nCannot rely on type, checking both string and ObjectId...');

        // Find ALL members for this user to see what's going on
        const allMemberships = await MemberModel.find({});
        console.log(`Total members in DB: ${allMemberships.length}`);

        const directStringMatch = await MemberModel.find({ userId: targetUserId });
        console.log(`\nQuery { userId: "${targetUserId}" } => Found: ${directStringMatch.length}`);
        directStringMatch.forEach(m => {
            console.log(`   - Member Record: UserType=${typeof m.get('userId')}, WorkspaceType=${typeof m.get('workspaceId')}, WorkspaceId=${m.get('workspaceId')}`);
        });

        try {
            const objectIdMatch = await MemberModel.find({ userId: new mongoose.Types.ObjectId(targetUserId) });
            console.log(`Query { userId: ObjectId("${targetUserId}") } => Found: ${objectIdMatch.length}`);
        } catch (e) {
            console.log(`Query { userId: ObjectId("${targetUserId}") } => Error: Invalid ObjectId`);
        }

        // 3. Simulating the logic in getWorkspacesByUserId
        console.log('\n--- Simulating getWorkspacesByUserId Logic ---');
        const query = mongoose.Types.ObjectId.isValid(targetUserId)
            ? { $or: [{ userId: targetUserId }, { userId: new mongoose.Types.ObjectId(targetUserId) }] }
            : { userId: targetUserId };

        const memberships = await MemberModel.find(query);
        console.log(`Found ${memberships.length} memberships with combined query.`);

        const workspaceIds = memberships.map((m: any) => m.get('workspaceId').toString());
        console.log(`Workspace IDs from memberships: ${workspaceIds.join(', ')}`);

        const hasAccess = workspaceIds.some(id => id === targetWorkspaceId);
        console.log(`\nDoes user have access to target workspace? ${hasAccess ? 'YES' : 'NO'}`);

        if (!hasAccess) {
            console.log('❌ THIS IS THE ISSUE. The user is not linked to the workspace in WorkspaceMember collection.');

            // Check if user is owner of the workspace directly (fallback logic often used)
            if (workspace && workspace.get('userId').toString() === targetUserId) {
                console.log('Wait! The user IS the owner of the workspace directly on the Workspace record.');
                console.log('Does the system populate owner as a member?');
            }
        }

    } catch (err) {
        console.error('Error during debug:', err);
    } finally {
        await mongoose.disconnect();
    }
}

debugAccess();
