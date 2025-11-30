const mongoose = require('mongoose');
require('dotenv').config();

// MongoDB connection
const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL;

if (!mongoUri) {
    console.error('❌ No MongoDB URI found in environment variables');
    process.exit(1);
}

// Define schemas
const socialAccountSchema = new mongoose.Schema({}, { strict: false, collection: 'socialaccounts' });
const SocialAccount = mongoose.model('SocialAccount', socialAccountSchema);

const shareSchema = new mongoose.Schema({}, { strict: false, collection: 'shares' });
const Share = mongoose.model('Share', shareSchema);

const saveSchema = new mongoose.Schema({}, { strict: false, collection: 'saves' });
const Save = mongoose.model('Save', saveSchema);

async function diagnoseInstagramIssue() {
    try {
        console.log('🔍 Connecting to MongoDB...');
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB successfully');

        // 1. Check Instagram accounts
        console.log('\n📱 Checking Instagram accounts...');
        const instagramAccounts = await SocialAccount.find({ platform: 'instagram' });
        
        if (instagramAccounts.length === 0) {
            console.log('❌ No Instagram accounts found');
            return;
        }

        console.log(`✅ Found ${instagramAccounts.length} Instagram accounts`);
        
        for (const account of instagramAccounts) {
            console.log(`\n👤 Account: @${account.username || account.name}`);
            console.log(`   ID: ${account._id}`);
            console.log(`   Platform ID: ${account.platformId}`);
            console.log(`   Has Access Token: ${account.accessToken ? 'YES' : 'NO'}`);
            console.log(`   Token Length: ${account.accessToken ? account.accessToken.length : 0}`);
            console.log(`   Last Sync: ${account.lastSync || 'Never'}`);
            console.log(`   Status: ${account.status || 'Unknown'}`);
            console.log(`   Created: ${account.createdAt}`);
            console.log(`   Updated: ${account.updatedAt}`);
            
            // Check if token is encrypted (encrypted tokens usually start with specific patterns)
            if (account.accessToken) {
                const token = account.accessToken;
                console.log(`   Token Preview: ${token.substring(0, 20)}...`);
                console.log(`   Token Type: ${token.startsWith('IGQV') ? 'Instagram Long-lived' : 
                                           token.startsWith('EAA') ? 'Facebook/Instagram Short-lived' : 
                                           token.includes(':') ? 'Possibly Encrypted' : 'Unknown'}`);
            }
            
            // Check shares for this account
            const shares = await Share.find({ socialAccountId: account._id });
            console.log(`   Shares in DB: ${shares.length}`);
            
            // Check saves for this account
            const saves = await Save.find({ socialAccountId: account._id });
            console.log(`   Saves in DB: ${saves.length}`);
            
            // Check recent shares/saves
            if (shares.length > 0) {
                const recentShare = shares.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
                console.log(`   Latest Share: ${recentShare.createdAt} (${recentShare.postType || 'unknown type'})`);
            }
            
            if (saves.length > 0) {
                const recentSave = saves.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
                console.log(`   Latest Save: ${recentSave.createdAt} (${recentSave.postType || 'unknown type'})`);
            }
        }

        // 2. Check overall shares and saves data
        console.log('\n📊 Overall Data Summary:');
        const totalShares = await Share.countDocuments();
        const totalSaves = await Save.countDocuments();
        const instagramShares = await Share.countDocuments({ platform: 'instagram' });
        const instagramSaves = await Save.countDocuments({ platform: 'instagram' });
        
        console.log(`   Total Shares: ${totalShares}`);
        console.log(`   Total Saves: ${totalSaves}`);
        console.log(`   Instagram Shares: ${instagramShares}`);
        console.log(`   Instagram Saves: ${instagramSaves}`);

        // 3. Check for recent sync activity
        console.log('\n🔄 Recent Sync Activity:');
        const recentShares = await Share.find().sort({ createdAt: -1 }).limit(5);
        const recentSaves = await Save.find().sort({ createdAt: -1 }).limit(5);
        
        console.log('   Recent Shares:');
        recentShares.forEach((share, index) => {
            console.log(`     ${index + 1}. ${share.platform} - ${share.createdAt} (${share.postType || 'unknown'})`);
        });
        
        console.log('   Recent Saves:');
        recentSaves.forEach((save, index) => {
            console.log(`     ${index + 1}. ${save.platform} - ${save.createdAt} (${save.postType || 'unknown'})`);
        });

        // 4. Check for any error logs or sync issues
        console.log('\n🔍 Checking for potential issues...');
        
        // Check for accounts with tokens but no recent activity
        const accountsWithTokensNoActivity = instagramAccounts.filter(account => 
            account.accessToken && (!account.lastSync || new Date(account.lastSync) < new Date(Date.now() - 24 * 60 * 60 * 1000))
        );
        
        if (accountsWithTokensNoActivity.length > 0) {
            console.log(`⚠️  Found ${accountsWithTokensNoActivity.length} accounts with tokens but no recent sync:`);
            accountsWithTokensNoActivity.forEach(account => {
                console.log(`     - @${account.username || account.name} (last sync: ${account.lastSync || 'never'})`);
            });
        }

        console.log('\n✅ Diagnosis complete!');

    } catch (error) {
        console.error('❌ Error during diagnosis:', error);
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Disconnected from MongoDB');
    }
}

diagnoseInstagramIssue();