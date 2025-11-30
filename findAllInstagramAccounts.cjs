const { MongoClient } = require('mongodb');

async function findAllInstagramAccounts() {
  const mongoUri = 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
  const client = new MongoClient(mongoUri);

  try {
    console.log('🔍 Searching for all Instagram accounts...\n');
    
    await client.connect();
    const db = client.db('veeforedb');
    
    // Check all collections for Instagram data
    const collections = await db.listCollections().toArray();
    console.log('📋 Available collections:', collections.map(c => c.name).join(', '));
    
    // Check socialAccounts collection
    console.log('\n🔍 Checking socialAccounts collection...');
    const socialAccountsCollection = db.collection('socialAccounts');
    const socialAccounts = await socialAccountsCollection.find({}).toArray();
    console.log(`Found ${socialAccounts.length} social accounts total`);
    
    const instagramAccounts = await socialAccountsCollection.find({
      $or: [
        { platform: 'instagram' },
        { platform: 'Instagram' },
        { instagramUsername: { $exists: true } },
        { username: /arpit/i }
      ]
    }).toArray();
    
    console.log(`Found ${instagramAccounts.length} Instagram accounts:`);
    instagramAccounts.forEach((account, index) => {
      console.log(`\n${index + 1}. Account Details:`);
      console.log(`   - ID: ${account._id}`);
      console.log(`   - Platform: ${account.platform}`);
      console.log(`   - Username: ${account.username || account.instagramUsername || 'N/A'}`);
      console.log(`   - Workspace ID: ${account.workspaceId}`);
      console.log(`   - Has Access Token: ${!!account.accessToken}`);
      console.log(`   - Has Encrypted Token: ${!!account.encryptedAccessToken}`);
      console.log(`   - Created: ${account.createdAt || 'N/A'}`);
      console.log(`   - Updated: ${account.updatedAt || 'N/A'}`);
      console.log(`   - Active: ${account.isActive !== false}`);
    });
    
    // Check users collection for Instagram data
    console.log('\n🔍 Checking users collection...');
    const usersCollection = db.collection('users');
    const usersWithInstagram = await usersCollection.find({
      $or: [
        { instagramUsername: { $exists: true } },
        { 'socialAccounts.platform': 'instagram' },
        { username: /arpit/i }
      ]
    }).toArray();
    
    console.log(`Found ${usersWithInstagram.length} users with Instagram data:`);
    usersWithInstagram.forEach((user, index) => {
      console.log(`\n${index + 1}. User Details:`);
      console.log(`   - ID: ${user._id}`);
      console.log(`   - Username: ${user.username || 'N/A'}`);
      console.log(`   - Instagram Username: ${user.instagramUsername || 'N/A'}`);
      console.log(`   - Workspace ID: ${user.workspaceId}`);
      console.log(`   - Social Accounts: ${user.socialAccounts?.length || 0}`);
      if (user.socialAccounts) {
        user.socialAccounts.forEach((sa, i) => {
          console.log(`     ${i + 1}. ${sa.platform}: ${sa.username} (${sa.isActive ? 'Active' : 'Inactive'})`);
        });
      }
    });
    
    // Check workspaces collection
    console.log('\n🔍 Checking workspaces collection...');
    const workspacesCollection = db.collection('workspaces');
    const workspaces = await workspacesCollection.find({}).toArray();
    console.log(`Found ${workspaces.length} workspaces total`);
    
    // Look for the specific workspace ID we found earlier
    const targetWorkspace = await workspacesCollection.findOne({
      _id: { $in: [
        '684402c2fd2cd4eb6521b386',
        require('mongodb').ObjectId('684402c2fd2cd4eb6521b386')
      ]}
    });
    
    if (targetWorkspace) {
      console.log('\n✅ Found target workspace:');
      console.log(`   - ID: ${targetWorkspace._id}`);
      console.log(`   - Name: ${targetWorkspace.name || 'N/A'}`);
      console.log(`   - Owner: ${targetWorkspace.ownerId || 'N/A'}`);
    }
    
    // Search for any document containing "arpit"
    console.log('\n🔍 Searching all collections for "arpit"...');
    for (const collection of collections) {
      const coll = db.collection(collection.name);
      try {
        const arpitDocs = await coll.find({
          $or: [
            { username: /arpit/i },
            { instagramUsername: /arpit/i },
            { name: /arpit/i }
          ]
        }).toArray();
        
        if (arpitDocs.length > 0) {
          console.log(`\n📋 Found ${arpitDocs.length} documents in ${collection.name}:`);
          arpitDocs.forEach((doc, i) => {
            console.log(`   ${i + 1}. ${JSON.stringify(doc, null, 2).substring(0, 200)}...`);
          });
        }
      } catch (e) {
        // Skip collections that can't be searched
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

findAllInstagramAccounts().catch(console.error);