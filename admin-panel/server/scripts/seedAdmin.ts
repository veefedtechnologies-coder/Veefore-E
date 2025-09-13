import mongoose from 'mongoose';
import Admin from '../models/Admin';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from admin panel's .env file
dotenv.config({ path: path.join(__dirname, '../../.env') });

async function seedAdmin() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    
    if (mongoUri.includes('mongodb+srv://')) {
      // For Atlas, use the same URI but specify database name
      await mongoose.connect(mongoUri, {
        dbName: 'veefore-admin'
      });
    } else {
      // For local MongoDB, use admin database
      await mongoose.connect(mongoUri.replace('/veefore', '/veefore-admin'));
    }
    console.log('✅ Connected to MongoDB');

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: 'admin@veefore.com' });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists');
      process.exit(0);
    }

    // Create default admin user
    const admin = new Admin({
      email: 'admin@veefore.com',
      password: 'admin123',
      firstName: 'Admin',
      lastName: 'User',
      role: 'superadmin',
      level: 5,
      team: 'executive',
      permissions: [
        'users.read',
        'users.write',
        'users.delete',
        'admins.read',
        'admins.write',
        'admins.delete',
        'refunds.read',
        'refunds.write',
        'refunds.approve',
        'subscriptions.read',
        'subscriptions.write',
        'subscriptions.cancel',
        'tickets.read',
        'tickets.write',
        'tickets.assign',
        'tickets.close',
        'coupons.read',
        'coupons.write',
        'coupons.delete',
        'analytics.read',
        'audit.read',
        'settings.read',
        'settings.write',
        'maintenance.read',
        'maintenance.write',
        'ai.read',
        'ai.write',
        'teams.read',
        'teams.write',
        'teams.delete',
        'webhooks.read',
        'webhooks.write',
        'webhooks.delete'
      ],
      isActive: true,
      isEmailVerified: true
    });

    await admin.save();
    console.log('✅ Default admin user created successfully');
    console.log('📧 Email: admin@veefore.com');
    console.log('🔑 Password: admin123');
    console.log('👤 Role: superadmin');
    console.log('🏢 Team: executive');

  } catch (error) {
    console.error('❌ Error seeding admin user:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

// Run the seed function
seedAdmin();
