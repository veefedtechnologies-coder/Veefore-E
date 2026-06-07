require('dotenv').config();
const mongoose = require('mongoose');

async function verify() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { 
      dbName: 'veeforedb' 
    });
    console.log('✅ Connected to:', mongoose.connection.db.databaseName);
    
    // Get existing workspace
    const Workspace = mongoose.connection.collection('workspaces');
    const existingWorkspace = await Workspace.findOne({});
    
    if (existingWorkspace) {
      console.log('\n📝 Existing workspace found:');
      console.log('  - ID:', existingWorkspace._id);
      console.log('  - Name:', existingWorkspace.name);
      console.log('  - Has aiConfiguration:', !!existingWorkspace.aiConfiguration);
      
      if (existingWorkspace.aiConfiguration) {
        console.log('\n✅ AI Configuration exists:');
        console.log(JSON.stringify(existingWorkspace.aiConfiguration, null, 2));
      } else {
        console.log('\n⚠️  No AI Configuration found - trying to add it...');
        
        // Add test AI configuration
        await Workspace.updateOne(
          { _id: existingWorkspace._id },
          { 
            $set: {
              aiConfiguration: {
                aiModel: 'google-ai-studio',
                creativityLevel: 0.7,
                optimizationGoals: 'Engagement',
                autoHashtags: true
              }
            }
          }
        );
        console.log('✅ AI Configuration added to workspace');
        
        // Verify it was saved
        const updated = await Workspace.findOne({ _id: existingWorkspace._id });
        console.log('\n✅ Verified - AI Configuration in database:');
        console.log(JSON.stringify(updated.aiConfiguration, null, 2));
      }
    } else {
      console.log('ℹ️  No workspaces found in database');
    }
    
    await mongoose.connection.close();
    console.log('\n✅ Verification complete');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

verify();
