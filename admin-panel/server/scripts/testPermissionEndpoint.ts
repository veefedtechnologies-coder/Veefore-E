import mongoose from 'mongoose';
import Admin from '../models/Admin';
import jwt from 'jsonwebtoken';

async function testPermissionEndpoint() {
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
    console.log('  - ID:', superAdmin._id);
    console.log('  - Email:', superAdmin.email);
    console.log('  - Role:', superAdmin.role);
    console.log('  - Permissions:', superAdmin.permissions);

    // Generate a test JWT token
    const token = jwt.sign(
      { 
        adminId: superAdmin._id, 
        email: superAdmin.email, 
        role: superAdmin.role,
        level: superAdmin.level,
        permissions: superAdmin.permissions
      },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '1h' }
    );

    console.log('\n🔑 Generated Test Token:');
    console.log('  - Token length:', token.length);
    console.log('  - Token preview:', token.substring(0, 50) + '...');

    // Test the permission check logic
    const requiredPermission = 'admins.read';
    const hasPermission = superAdmin.permissions.includes(requiredPermission);
    
    console.log('\n🔍 Permission Test:');
    console.log('  - Required permission:', requiredPermission);
    console.log('  - Has permission:', hasPermission);
    console.log('  - All permissions:', superAdmin.permissions);

    if (hasPermission) {
      console.log('✅ Superadmin has the required permission');
    } else {
      console.log('❌ Superadmin is missing the required permission');
    }

    // Test the API endpoint directly
    console.log('\n🌐 Testing API endpoint...');
    const response = await fetch('http://localhost:5001/api/admin', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('  - Response status:', response.status);
    console.log('  - Response headers:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('  - Response body:', responseText);

    if (response.status === 200) {
      console.log('✅ API endpoint is working correctly');
    } else {
      console.log('❌ API endpoint returned error:', response.status);
    }

    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  testPermissionEndpoint();
}

export default testPermissionEndpoint;


