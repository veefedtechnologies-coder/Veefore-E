import mongoose from 'mongoose';
import Admin from '../models/Admin';
import { ROLE_PERMISSION_CONSTRAINTS } from '../utils/permissions';
import bcrypt from 'bcryptjs';

async function createSuperAdmin() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Check if superadmin already exists
    const existingSuperAdmin = await Admin.findOne({ role: 'superadmin' });
    if (existingSuperAdmin) {
      console.log('Superadmin already exists:', existingSuperAdmin.email);
      process.exit(0);
    }

    // Get superadmin permissions
    const superAdminConstraints = ROLE_PERMISSION_CONSTRAINTS.find(
      constraint => constraint.role === 'superadmin'
    );

    if (!superAdminConstraints) {
      throw new Error('Superadmin role constraints not found');
    }

    // Create superadmin user
    const hashedPassword = await bcrypt.hash('admin123456', 12);
    
    const superAdmin = new Admin({
      email: 'admin@veefore.com',
      username: 'superadmin',
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: 'superadmin',
      level: 1,
      team: 'executive',
      permissions: superAdminConstraints.autoGranted,
      isActive: true,
      isEmailVerified: true,
      twoFactorEnabled: false,
      loginAttempts: 0,
      ipWhitelist: [],
      deviceFingerprints: [],
      ssoProviders: {},
      deviceHistory: [],
      magicLinkTokens: [],
      sessions: [],
      securitySettings: {
        require2FA: false,
        sessionTimeout: 480, // 8 hours
        maxSessions: 5,
        allowConcurrentSessions: true,
        enableLocationTracking: false,
        enableDeviceTracking: true
      }
    });

    await superAdmin.save();

    console.log('✅ Superadmin created successfully!');
    console.log('Email: admin@veefore.com');
    console.log('Username: superadmin');
    console.log('Password: admin123456');
    console.log(`Permissions: ${superAdmin.permissions.length} permissions granted`);

    process.exit(0);
  } catch (error) {
    console.error('Failed to create superadmin:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  createSuperAdmin();
}

export default createSuperAdmin;


