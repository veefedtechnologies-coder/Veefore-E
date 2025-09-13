import mongoose from 'mongoose';
import Admin from '../models/Admin';
import { ROLE_PERMISSION_CONSTRAINTS } from '../utils/permissions';

async function updateAdminPermissions() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Find all admins
    const admins = await Admin.find({});
    console.log(`Found ${admins.length} admins to update`);

    for (const admin of admins) {
      try {
        // Find role constraints for this admin's role
        const roleConstraints = ROLE_PERMISSION_CONSTRAINTS.find(
          constraint => constraint.role === admin.role
        );

        if (!roleConstraints) {
          console.log(`⚠️  No role constraints found for role: ${admin.role}`);
          continue;
        }

        // Get auto-granted permissions for this role
        const autoGrantedPermissions = roleConstraints.autoGranted || [];
        
        // Merge with existing permissions (avoid duplicates)
        const existingPermissions = admin.permissions || [];
        const newPermissions = [...new Set([...existingPermissions, ...autoGrantedPermissions])];

        // Update admin with new permissions
        await Admin.findByIdAndUpdate(admin._id, { 
          permissions: newPermissions 
        });

        console.log(`✅ Updated admin ${admin.email} (${admin.role}) with ${newPermissions.length} permissions`);
        console.log(`   Added permissions: ${autoGrantedPermissions.filter(p => !existingPermissions.includes(p)).join(', ')}`);
      } catch (error) {
        console.error(`❌ Failed to update admin ${admin.email}:`, error);
      }
    }

    console.log('Permission update completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Permission update failed:', error);
    process.exit(1);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  updateAdminPermissions();
}

export default updateAdminPermissions;
