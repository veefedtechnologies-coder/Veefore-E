import mongoose from 'mongoose';
import Admin from '../models/Admin';
import CredentialGenerator from '../utils/credentialGenerator';

async function migrateUsernames() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/veefore-admin');
    console.log('Connected to MongoDB');

    // Find all admins without usernames
    const adminsWithoutUsernames = await Admin.find({ 
      $or: [
        { username: { $exists: false } },
        { username: null },
        { username: '' }
      ]
    });

    console.log(`Found ${adminsWithoutUsernames.length} admins without usernames`);

    for (const admin of adminsWithoutUsernames) {
      try {
        // Generate a username based on email
        const emailPrefix = admin.email.split('@')[0];
        const baseUsername = emailPrefix.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        
        // Ensure username is unique
        let username = baseUsername;
        let counter = 1;
        
        while (await Admin.findOne({ username })) {
          username = `${baseUsername}${counter}`;
          counter++;
        }

        // Update the admin with the new username
        await Admin.findByIdAndUpdate(admin._id, { username });
        console.log(`✅ Updated admin ${admin.email} with username: ${username}`);
      } catch (error) {
        console.error(`❌ Failed to update admin ${admin.email}:`, error);
      }
    }

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateUsernames();
}

export default migrateUsernames;


