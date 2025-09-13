import mongoose from 'mongoose';
import Admin from '../models/Admin';
import { ROLE_PERMISSION_CONSTRAINTS } from '../utils/permissions';

async function checkAdminPermissions() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find the superadmin
    const superAdmin = await Admin.findOne({ role: 'superadmin' });
    if (!superAdmin) {
      console.log('❌ No superadmin found');
      process.exit(1);
    }

    console.log('🔍 Superadmin Details:');
    console.log('  - Email:', superAdmin.email);
    console.log('  - Username:', superAdmin.username);
    console.log('  - Role:', superAdmin.role);
    console.log('  - Level:', superAdmin.level);
    console.log('  - Current permissions count:', superAdmin.permissions.length);
    console.log('  - Current permissions:', superAdmin.permissions);

    // Get expected permissions for superadmin
    const superAdminConstraints = ROLE_PERMISSION_CONSTRAINTS.find(
      constraint => constraint.role === 'superadmin'
    );

    if (!superAdminConstraints) {
      console.log('❌ No superadmin constraints found');
      process.exit(1);
    }

    console.log('\n🔍 Expected Permissions:');
    console.log('  - Auto-granted count:', superAdminConstraints.autoGranted.length);
    console.log('  - Auto-granted permissions:', superAdminConstraints.autoGranted);

    // Check if admins.read is in current permissions
    const hasAdminsRead = superAdmin.permissions.includes('admins.read');
    console.log('\n🔍 Permission Check:');
    console.log('  - Has admins.read:', hasAdminsRead);
    console.log('  - Has admins.read.detailed:', superAdmin.permissions.includes('admins.read.detailed'));

    if (!hasAdminsRead) {
      console.log('\n🔧 Fixing permissions...');
      
      // Add missing permissions
      const newPermissions = [...new Set([...superAdmin.permissions, ...superAdminConstraints.autoGranted])];
      
      await Admin.findByIdAndUpdate(superAdmin._id, { 
        permissions: newPermissions 
      });

      console.log('✅ Updated superadmin permissions');
      console.log('  - New permissions count:', newPermissions.length);
      console.log('  - Added permissions:', superAdminConstraints.autoGranted.filter(p => !superAdmin.permissions.includes(p)));
    } else {
      console.log('✅ Superadmin already has correct permissions');
    }

    process.exit(0);
  } catch (error) {
    console.error('Failed to check admin permissions:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  checkAdminPermissions();
}

export default checkAdminPermissions;


