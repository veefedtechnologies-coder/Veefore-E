import 'dotenv/config';
import mongoose from 'mongoose';

// Connect to main app database
const connectToMainApp = async () => {
  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    let connection;
    
    if (mongoUri.includes('mongodb+srv://')) {
      // For MongoDB Atlas, connect to main app database
      connection = await mongoose.createConnection(mongoUri, {
        dbName: 'veeforedb'
      });
    } else {
      // For local MongoDB, connect to main app database
      const mainAppUri = mongoUri.replace('/veefore', '/veeforedb');
      connection = await mongoose.createConnection(mainAppUri);
    }
    
    console.log('✅ Connected to main app database (veeforedb)');
    return connection;
  } catch (error) {
    console.error('❌ Failed to connect to main app database:', error);
    throw error;
  }
};

// Main app user schema (simplified)
const MainAppUserSchema = new mongoose.Schema({
  firebaseUid: { type: String, unique: true, sparse: true },
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  displayName: String,
  avatar: String,
  credits: { type: Number, default: 0 },
  plan: { type: String, default: 'Free' },
  status: { type: String, default: 'waitlisted' },
  isEmailVerified: { type: Boolean, default: false },
  lastLoginAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

async function inspectMainAppDatabase() {
  try {
    const connection = await connectToMainApp();
    const User = connection.model('User', MainAppUserSchema);
    
    // Get total count
    const totalUsers = await User.countDocuments({});
    console.log(`\n📊 Total users in main app database: ${totalUsers}`);
    
    // Get users by status
    const statusCounts = await User.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    console.log('\n📈 Users by status:');
    statusCounts.forEach(stat => {
      console.log(`  ${stat._id}: ${stat.count}`);
    });
    
    // Get users by plan
    const planCounts = await User.aggregate([
      {
        $group: {
          _id: '$plan',
          count: { $sum: 1 }
        }
      }
    ]);
    console.log('\n💳 Users by plan:');
    planCounts.forEach(plan => {
      console.log(`  ${plan._id}: ${plan.count}`);
    });
    
    // Get recent users
    const recentUsers = await User.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .select('email username displayName plan status createdAt lastLoginAt')
      .lean();
    
    console.log('\n👥 Recent users (last 10):');
    recentUsers.forEach((user, index) => {
      console.log(`  ${index + 1}. ${user.email} (${user.username}) - ${user.plan} - ${user.status} - ${user.createdAt}`);
    });
    
    // Check for real users (not test data)
    const realUsers = await User.find({
      email: { 
        $not: { 
          $regex: /^(test|demo|dcfe|rgrg|sdxsds|cdvd|efref|ng|test6)@/i 
        } 
      }
    }).limit(5).select('email username displayName plan status').lean();
    
    console.log('\n🎯 Real users (non-test data):');
    if (realUsers.length > 0) {
      realUsers.forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.email} (${user.username}) - ${user.plan} - ${user.status}`);
      });
    } else {
      console.log('  No real users found (all appear to be test data)');
    }
    
    // Check waitlist users
    const WaitlistUserSchema = new mongoose.Schema({
      name: String,
      email: String,
      status: String,
      joinedAt: Date
    }, { timestamps: true });
    
    const WaitlistUser = connection.model('WaitlistUser', WaitlistUserSchema);
    const waitlistCount = await WaitlistUser.countDocuments({});
    console.log(`\n⏳ Waitlist users: ${waitlistCount}`);
    
    if (waitlistCount > 0) {
      const waitlistUsers = await WaitlistUser.find({})
        .sort({ joinedAt: -1 })
        .limit(5)
        .select('name email status joinedAt')
        .lean();
      
      console.log('Recent waitlist users:');
      waitlistUsers.forEach((user, index) => {
        console.log(`  ${index + 1}. ${user.email} (${user.name}) - ${user.status} - ${user.joinedAt}`);
      });
    }
    
    await connection.close();
    console.log('\n✅ Database inspection complete');
    
  } catch (error) {
    console.error('❌ Error inspecting database:', error);
  }
}

inspectMainAppDatabase();
