import mongoose from 'mongoose';

// Connect to main app database for user data
let mainAppConnection: mongoose.Connection | null = null;

export const connectToMainApp = async () => {
  if (mainAppConnection && mainAppConnection.readyState === 1) {
    return mainAppConnection;
  }

  try {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb+srv://brandboost09:Arpitc8433@cluster0.mekr2dh.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
    if (mongoUri.includes('mongodb+srv://')) {
      // For MongoDB Atlas, connect to veeforedb database explicitly
      mainAppConnection = await mongoose.createConnection(mongoUri, {
        dbName: 'veeforedb'
      });
    } else {
      // For local MongoDB, connect to main app database
      const mainAppUri = mongoUri.replace('/veefore', '/veeforedb');
      mainAppConnection = await mongoose.createConnection(mainAppUri);
    }
    
    console.log('✅ Connected to veeforedb database for user data');
    return mainAppConnection;
  } catch (error) {
    console.error('❌ Failed to connect to main app database:', error);
    throw error;
  }
};

// Main app user schema (simplified for admin panel)
const MainAppUserSchema = new mongoose.Schema({
  firebaseUid: { type: String, unique: true, sparse: true },
  email: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  displayName: String,
  avatar: String,
  credits: { type: Number, default: 0 },
  plan: { type: String, default: 'Free' },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  referralCode: { type: String, unique: true },
  totalReferrals: { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 },
  referredBy: String,
  preferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  isOnboarded: { type: Boolean, default: false },
  onboardingCompletedAt: Date,
  isEmailVerified: { type: Boolean, default: false },
  emailVerificationCode: String,
  emailVerificationExpiry: Date,
  onboardingStep: { type: Number, default: 1 },
  onboardingData: { type: mongoose.Schema.Types.Mixed, default: {} },
  goals: { type: mongoose.Schema.Types.Mixed, default: [] },
  niche: String,
  targetAudience: String,
  contentStyle: String,
  postingFrequency: String,
  socialPlatforms: { type: mongoose.Schema.Types.Mixed, default: [] },
  businessType: String,
  experienceLevel: String,
  primaryObjective: String,
  status: { type: String, default: 'waitlisted' },
  trialExpiresAt: Date,
  discountCode: String,
  discountExpiresAt: Date,
  hasUsedWaitlistBonus: { type: Boolean, default: false },
  dailyLoginStreak: { type: Number, default: 0 },
  lastLoginAt: Date,
  feedbackSubmittedAt: Date,
  workspaceId: { type: String, index: true },
  instagramToken: String,
  instagramRefreshToken: String,
  instagramTokenExpiry: Date,
  instagramAccountId: String,
  instagramUsername: String,
  tokenStatus: { type: String, enum: ['active', 'expired', 'rate_limited', 'invalid'], default: 'active' },
  lastApiCallTimestamp: Date,
  rateLimitResetAt: Date,
  apiCallCount: { type: Number, default: 0 }
}, {
  timestamps: true
});

export const getMainAppUsers = async (page: number = 1, pageSize: number = 10, filter: any = {}) => {
  const connection = await connectToMainApp();
  const User = connection.model('User', MainAppUserSchema, 'users');
  
  // Also connect to waitlist users collection
  const WaitlistUser = connection.model('WaitlistUser', new mongoose.Schema({
    name: String,
    email: String,
    referralCode: String,
    referredBy: String,
    referralCount: Number,
    credits: Number,
    status: String,
    discountCode: String,
    discountExpiresAt: Date,
    dailyLogins: Number,
    feedbackSubmitted: Boolean,
    joinedAt: Date,
    createdAt: Date,
    updatedAt: Date,
    metadata: mongoose.Schema.Types.Mixed
  }), 'waitlistusers');
  
  const pageNum = parseInt(page.toString());
  const limitNum = parseInt(pageSize.toString());
  const skip = (pageNum - 1) * limitNum;

  // Use the provided filter or empty filter to get all users
  const queryFilter = filter || {};

  console.log('🔍 User query filter:', JSON.stringify(queryFilter, null, 2));

  // Get users with pagination
  console.log('🔍 Querying users with filter:', queryFilter);
  console.log('🔍 Sort:', { createdAt: -1 });
  console.log('🔍 Skip:', skip, 'Limit:', limitNum);
  
  const [users, total] = await Promise.all([
    User.find(queryFilter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    User.countDocuments(queryFilter)
  ]);

  console.log('🔍 Query results - Users found:', users.length, 'Total:', total);

      // Transform users to match admin panel format with real data from veeforedb
    const transformedUsers = await Promise.all(users.map(async user => {
    // Extract real user data from veeforedb
    const plan = user.plan || 'Free';
    const status = (user as any).waitlistStatus || (user as any).earlyAccessStatus || user.status || 'waitlisted';
    const credits = user.credits || 0;
    const isEmailVerified = user.isEmailVerified || false;
    
    // Fetch waitlist questionnaire data
    let waitlistQuestionnaire = null;
    try {
      const waitlistUser = await WaitlistUser.findOne({ email: user.email }).lean();
      if (waitlistUser && waitlistUser.metadata && waitlistUser.metadata.questionnaire) {
        waitlistQuestionnaire = waitlistUser.metadata.questionnaire;
        console.log(`[WAITLIST] Found questionnaire data for ${user.email}:`, waitlistQuestionnaire);
      }
    } catch (error) {
      console.error(`[WAITLIST] Error fetching questionnaire data for ${user.email}:`, error);
    }
    const isOnboarded = user.isOnboarded || false;
    const createdAt = user.createdAt;
    const updatedAt = user.updatedAt;
    
    // Get last login/activity data for time-based status
    const lastActivityAt = user.lastLoginAt || (user as any).lastLogin || (user as any).lastActiveAt || updatedAt;
    const daysSinceLastActivity = Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24));
    const preferences = user.preferences || {};
    const referralCode = user.referralCode;
    const totalReferrals = user.totalReferrals || 0;
    const totalEarned = user.totalEarned || 0;
    const subscriptionPlan = (user as any).subscriptionPlan;
    const planUpgradedAt = (user as any).planUpgradedAt;
    const lastMonthlyAllocation = (user as any).lastMonthlyAllocation;
    const trialExpiresAt = user.trialExpiresAt;

    // Determine user status for admin panel based on real data and activity
    let userStatus = 'inactive';
    let statusReason = '';
    
    // First check if user is banned or suspended
    if ((user as any).isBanned || user.status === 'banned' || user.status === 'suspended') {
      userStatus = 'banned';
      statusReason = 'Account banned or suspended';
    }
    // Check if user is active based on database status
    else if (status === 'launched' || status === 'early_access' || status === 'active') {
      // Check activity-based status for active users
      if (daysSinceLastActivity <= 30) {
        userStatus = 'active';
        statusReason = 'Active user';
      } else if (daysSinceLastActivity <= 60) {
        userStatus = 'inactive';
        statusReason = `Inactive for ${daysSinceLastActivity} days (30+ days)`;
      } else if (daysSinceLastActivity <= 90) {
        userStatus = 'dormant';
        statusReason = `Dormant for ${daysSinceLastActivity} days (60+ days)`;
      } else {
        userStatus = 'inactive';
        statusReason = `Inactive for ${daysSinceLastActivity} days (90+ days)`;
      }
    }
    // Check waitlisted users
    else if (status === 'waitlisted') {
      if (user.isOnboarded && user.isEmailVerified) {
        // Onboarded waitlisted users - check activity
        if (daysSinceLastActivity <= 30) {
          userStatus = 'active';
          statusReason = 'Active waitlisted user';
        } else if (daysSinceLastActivity <= 60) {
          userStatus = 'inactive';
          statusReason = `Inactive waitlisted user for ${daysSinceLastActivity} days`;
        } else if (daysSinceLastActivity <= 90) {
          userStatus = 'dormant';
          statusReason = `Dormant waitlisted user for ${daysSinceLastActivity} days`;
        } else {
          userStatus = 'inactive';
          statusReason = `Inactive waitlisted user for ${daysSinceLastActivity} days`;
        }
      } else {
        userStatus = 'pending';
        statusReason = 'Pending onboarding';
      }
    }
    // Check early access users
    else if ((user as any).isEarlyAccessUser) {
      if (daysSinceLastActivity <= 30) {
        userStatus = 'trial';
        statusReason = 'Active early access user';
      } else if (daysSinceLastActivity <= 60) {
        userStatus = 'inactive';
        statusReason = `Inactive early access user for ${daysSinceLastActivity} days`;
      } else if (daysSinceLastActivity <= 90) {
        userStatus = 'dormant';
        statusReason = `Dormant early access user for ${daysSinceLastActivity} days`;
      } else {
        userStatus = 'inactive';
        statusReason = `Inactive early access user for ${daysSinceLastActivity} days`;
      }
    }
    // Check onboarded and verified users
    else if (user.isOnboarded && user.isEmailVerified) {
      if (daysSinceLastActivity <= 30) {
        userStatus = 'active';
        statusReason = 'Active onboarded user';
      } else if (daysSinceLastActivity <= 60) {
        userStatus = 'inactive';
        statusReason = `Inactive onboarded user for ${daysSinceLastActivity} days`;
      } else if (daysSinceLastActivity <= 90) {
        userStatus = 'dormant';
        statusReason = `Dormant onboarded user for ${daysSinceLastActivity} days`;
      } else {
        userStatus = 'inactive';
        statusReason = `Inactive onboarded user for ${daysSinceLastActivity} days`;
      }
    }
    // Default case
    else {
      userStatus = 'inactive';
      statusReason = 'Inactive user';
    }
    
    // Determine subscription status
    let subscriptionStatus = 'inactive';
    if (status === 'launched' || status === 'early_access') subscriptionStatus = 'active';
    else if (status === 'waitlisted') {
      // If user is onboarded and email verified, they should have active subscription
      if (user.isOnboarded && user.isEmailVerified) {
        subscriptionStatus = 'active';
      } else {
        subscriptionStatus = 'trial';
      }
    }
    else if ((user as any).isEarlyAccessUser) subscriptionStatus = 'trial';
    else if (plan !== 'Free') subscriptionStatus = 'active';
    else if (user.isOnboarded && user.isEmailVerified) subscriptionStatus = 'active';

    // Count real social connections from database
    let socialConnections = 0;
    if (user.socialPlatforms && Array.isArray(user.socialPlatforms)) {
      socialConnections = user.socialPlatforms.filter((platform: any) => platform.connected).length;
    }

    // Calculate engagement score based on real data
    const daysSinceCreated = Math.floor((Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24));
    const daysSinceUpdated = Math.floor((Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24));
    const engagementScore = Math.min(100, Math.max(0, 
      (socialConnections * 15) + 
      (credits / 50) + // More credits = more engagement
      (totalReferrals * 10) + // Referrals show engagement
      (isEmailVerified ? 20 : 0) + // Verified users are more engaged
      (plan !== 'Free' ? 25 : 0) + // Paid users are more engaged
      (daysSinceUpdated < 7 ? 15 : 0) + // Recent activity
      (daysSinceCreated < 30 ? 10 : 0) + // New users get engagement boost
      ((user as any).isEarlyAccessUser ? 15 : 0) // Early access users are engaged
    ));

    // Use real last login data from database
    const lastLoginFormatted = lastActivityAt ? 
      new Date(lastActivityAt).toLocaleDateString() : 
      (daysSinceUpdated < 1 ? 'Today' :
       daysSinceUpdated < 7 ? `${daysSinceUpdated} days ago` :
       daysSinceUpdated < 30 ? `${Math.floor(daysSinceUpdated / 7)} weeks ago` :
       'Over a month ago');

    // Get REAL social media data from socialaccounts collection
    const db = connection.db;
    if (!db) {
      console.error('Database connection not available');
      return {
        id: user._id.toString(),
        email: user.email,
        name: user.username,
        avatar: '',
        plan: user.plan || 'Free',
        status: 'active',
        credits: user.credits || 0,
        socialConnections: 0,
        lastLogin: user.createdAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      };
    }
    
    let socialAccounts: any[] = [];
    let userWorkspace: any = null;
    
    // Find ALL workspaces that this user has access to
    let userWorkspaces: any[] = [];
    
    // First, try to find workspaces by the user's workspaceId
    if (user.workspaceId) {
      try {
        // Try to find workspace by the user's workspaceId
        if (mongoose.Types.ObjectId.isValid(user.workspaceId)) {
          const workspace = await db.collection('workspaces').findOne({
            _id: new mongoose.Types.ObjectId(user.workspaceId)
          });
          if (workspace) userWorkspaces.push(workspace);
        } else {
          // If not a valid ObjectId, try to find by the string value
          const workspace = await db.collection('workspaces').findOne({
            _id: user.workspaceId as any
          });
          if (workspace) userWorkspaces.push(workspace);
        }
      } catch (error) {
        console.log('Error finding workspace by ID:', error);
      }
    }
    
    // Also find workspaces by user ID (in case user is a member of multiple workspaces)
    try {
      const workspacesByUserId = await db.collection('workspaces').find({
        $or: [
          { userId: user._id.toString() },
          { 'members.userId': user._id.toString() },
          { 'teamMembers.userId': user._id.toString() }
        ]
      }).toArray();
      
      // Add unique workspaces (avoid duplicates)
      workspacesByUserId.forEach(workspace => {
        if (!userWorkspaces.find(w => w._id.toString() === workspace._id.toString())) {
          userWorkspaces.push(workspace);
        }
      });
    } catch (error) {
      console.log('Error finding workspaces by user ID:', error);
    }
    
    // If still no workspaces found, create a default one
    if (userWorkspaces.length === 0) {
      userWorkspaces = [{
        _id: user.workspaceId || `ws_${user._id.toString().substring(0, 8)}`,
        name: 'Default Workspace',
        description: '',
        userId: user._id.toString(),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      }];
    }
    
    // Set the primary workspace (first one found)
    userWorkspace = userWorkspaces[0];
    
    // Now find ALL social accounts across ALL workspaces
    if (userWorkspaces.length > 0) {
      try {
        const workspaceIds = userWorkspaces.map(w => w._id);
        socialAccounts = await db.collection('socialaccounts').find({
          $or: [
            { workspaceId: { $in: workspaceIds } },
            { workspaceId: { $in: workspaceIds.map(id => id.toString()) } }
          ]
        }).toArray();
        
        // Add workspace information to each social account
        socialAccounts = socialAccounts.map(account => {
          const workspace = userWorkspaces.find(w => 
            w._id.toString() === account.workspaceId || 
            w._id.toString() === account.workspaceId?.toString()
          );
          return {
            ...account,
            workspace: workspace ? {
              id: workspace._id,
              name: workspace.name || 'Unknown Workspace',
              description: workspace.description || ''
            } : null
          };
        });
      } catch (error) {
        console.log('Error finding social accounts by workspace IDs:', error);
      }
    }
    
    // If still no accounts found, try to find by user's Instagram username
    if (socialAccounts.length === 0 && user.instagramUsername) {
      const cleanUsername = user.instagramUsername.replace('@', '').replace('_ig', '');
      socialAccounts = await db.collection('socialaccounts').find({
        username: cleanUsername
      }).toArray();
    }
    
    // Use the workspace we already found
    const workspace = userWorkspace;
    
    // Build social media object from real socialaccounts data with workspace mapping
    const activeAccounts = (socialAccounts || []).filter((account: any) => account && account.isActive);
    
    // Group accounts by platform for easy access
    const accountsByPlatform = activeAccounts.reduce((acc: any, account: any) => {
      if (!acc[account.platform]) {
        acc[account.platform] = [];
      }
      acc[account.platform].push(account);
      return acc;
    }, {});
    
    // Get all Instagram accounts with workspace info
    const instagramAccounts = accountsByPlatform.instagram || [];
    const twitterAccounts = accountsByPlatform.twitter || [];
    const linkedinAccounts = accountsByPlatform.linkedin || [];
    const tiktokAccounts = accountsByPlatform.tiktok || [];
    const youtubeAccounts = accountsByPlatform.youtube || [];
    
    const socialMedia = {
      // Show all workspaces
      workspaces: userWorkspaces.map(workspace => ({
        id: workspace._id,
        name: workspace.name || 'Unknown Workspace',
        description: workspace.description || '',
        socialAccountsCount: activeAccounts.filter(account => 
          account.workspace && account.workspace.id.toString() === workspace._id.toString()
        ).length,
        connectedPlatforms: activeAccounts
          .filter(account => account.workspace && account.workspace.id.toString() === workspace._id.toString())
          .map(account => account.platform)
      })),
      
      // Show all Instagram accounts with workspace mapping
      instagramAccounts: instagramAccounts.map((account: any) => ({
        username: account.username,
        handle: account.username,
        followers: account.followersCount || 0,
        following: account.followingCount || 0,
        posts: account.mediaCount || 0,
        connected: true,
        verified: account.isVerified || false,
        connectedAt: account.createdAt,
        workspace: account.workspace || null
      })),
      
      // Show all Twitter accounts with workspace mapping
      twitterAccounts: twitterAccounts.map((account: any) => ({
        username: account.username,
        handle: account.username,
        followers: account.followersCount || 0,
        following: account.followingCount || 0,
        posts: account.mediaCount || 0,
        connected: true,
        verified: account.isVerified || false,
        connectedAt: account.createdAt,
        workspace: account.workspace || null
      })),
      
      // Show all LinkedIn accounts with workspace mapping
      linkedinAccounts: linkedinAccounts.map((account: any) => ({
        username: account.username,
        handle: account.username,
        followers: account.followersCount || 0,
        following: account.followingCount || 0,
        posts: account.mediaCount || 0,
        connected: true,
        verified: account.isVerified || false,
        connectedAt: account.createdAt,
        workspace: account.workspace || null
      })),
      
      // Show all TikTok accounts with workspace mapping
      tiktokAccounts: tiktokAccounts.map((account: any) => ({
        username: account.username,
        handle: account.username,
        followers: account.followersCount || 0,
        following: account.followingCount || 0,
        posts: account.mediaCount || 0,
        connected: true,
        verified: account.isVerified || false,
        connectedAt: account.createdAt,
        workspace: account.workspace || null
      })),
      
      // Show all YouTube accounts with workspace mapping
      youtubeAccounts: youtubeAccounts.map((account: any) => ({
        username: account.username,
        handle: account.username,
        followers: account.followersCount || 0,
        following: account.followingCount || 0,
        posts: account.mediaCount || 0,
        connected: true,
        verified: account.isVerified || false,
        connectedAt: account.createdAt,
        workspace: account.workspace || null
      })),
      
      // Legacy format for backward compatibility (show first account of each platform)
      platforms: activeAccounts.reduce((acc: any, account: any) => {
        if (!acc[account.platform]) {
          acc[account.platform] = {
            handle: account.username || '',
            followers: account.followersCount || 0,
            following: account.followingCount || 0,
            posts: account.mediaCount || 0,
            verified: account.isVerified || false,
            connected: account.isActive || false,
            connectedAt: account.createdAt || createdAt,
            workspace: account.workspace || null
          };
        }
        return acc;
      }, {}),
      
      // Legacy single account format (first account of each platform)
      instagram: instagramAccounts[0] ? {
        username: instagramAccounts[0].username,
        handle: instagramAccounts[0].username,
        followers: instagramAccounts[0].followersCount || 0,
        following: instagramAccounts[0].followingCount || 0,
        posts: instagramAccounts[0].mediaCount || 0,
        connected: true,
        verified: instagramAccounts[0].isVerified || false,
        connectedAt: instagramAccounts[0].createdAt,
        workspace: instagramAccounts[0].workspace || null
      } : null,
      
      twitter: twitterAccounts[0] ? {
        username: twitterAccounts[0].username,
        handle: twitterAccounts[0].username,
        followers: twitterAccounts[0].followersCount || 0,
        following: twitterAccounts[0].followingCount || 0,
        posts: twitterAccounts[0].mediaCount || 0,
        connected: true,
        verified: twitterAccounts[0].isVerified || false,
        connectedAt: twitterAccounts[0].createdAt,
        workspace: twitterAccounts[0].workspace || null
      } : null,
      
      linkedin: linkedinAccounts[0] ? {
        username: linkedinAccounts[0].username,
        handle: linkedinAccounts[0].username,
        followers: linkedinAccounts[0].followersCount || 0,
        following: linkedinAccounts[0].followingCount || 0,
        posts: linkedinAccounts[0].mediaCount || 0,
        connected: true,
        verified: linkedinAccounts[0].isVerified || false,
        connectedAt: linkedinAccounts[0].createdAt,
        workspace: linkedinAccounts[0].workspace || null
      } : null,
      
      tiktok: tiktokAccounts[0] ? {
        username: tiktokAccounts[0].username,
        handle: tiktokAccounts[0].username,
        followers: tiktokAccounts[0].followersCount || 0,
        following: tiktokAccounts[0].followingCount || 0,
        posts: tiktokAccounts[0].mediaCount || 0,
        connected: true,
        verified: tiktokAccounts[0].isVerified || false,
        connectedAt: tiktokAccounts[0].createdAt,
        workspace: tiktokAccounts[0].workspace || null
      } : null,
      
      youtube: youtubeAccounts[0] ? {
        username: youtubeAccounts[0].username,
        handle: youtubeAccounts[0].username,
        followers: youtubeAccounts[0].followersCount || 0,
        following: youtubeAccounts[0].followingCount || 0,
        posts: youtubeAccounts[0].mediaCount || 0,
        connected: true,
        verified: youtubeAccounts[0].isVerified || false,
        connectedAt: youtubeAccounts[0].createdAt,
        workspace: youtubeAccounts[0].workspace || null
      } : null,
      
      totalConnections: activeAccounts.length,
      totalWorkspaces: userWorkspaces.length,
      summary: `${activeAccounts.length} connected account${activeAccounts.length !== 1 ? 's' : ''} across ${userWorkspaces.length} workspace${userWorkspaces.length !== 1 ? 's' : ''}`
    };

    // Use real login data from database
    const loginCount = (user as any).loginCount || 0;
    const dailyLoginStreak = (user as any).dailyLoginStreak || 0;

    // Use real content metrics from database
    const totalPosts = (user as any).totalPosts || 0;
    const totalLikes = (user as any).totalLikes || 0;
    const totalComments = (user as any).totalComments || 0;

    return {
      _id: user._id,
      firstName: user.displayName?.split(' ')[0] || user.username || 'User',
      lastName: user.displayName?.split(' ').slice(1).join(' ') || '',
      name: user.displayName || user.username || user.email,
      email: user.email,
      username: user.username,
      displayName: user.displayName,
      avatar: user.avatar,
      isActive: userStatus === 'active',
      isEmailVerified: isEmailVerified,
      isOnboarded: isOnboarded,
      isBanned: false,
      subscription: {
        plan: plan.toLowerCase(),
        status: subscriptionStatus,
        currentPeriodStart: user.createdAt,
        currentPeriodEnd: trialExpiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        subscriptionPlan: subscriptionPlan,
        planUpgradedAt: planUpgradedAt
      },
      subscriptionPlan: plan,
      subscriptionStatus: subscriptionStatus,
      status: userStatus,
      statusReason: statusReason,
      daysSinceLastActivity: daysSinceLastActivity,
      lastActivityAt: lastActivityAt,
      credits: {
        total: credits,
        used: 0,
        remaining: credits
      },
      creditsRemaining: credits,
      creditsUsed: 0,
      socialMedia: socialMedia,
      socialConnections: socialConnections,
      preferences: {
        language: preferences.language || 'en',
        timezone: preferences.timezone || 'UTC',
        businessName: preferences.businessName || '',
        description: preferences.description || '',
        niches: preferences.niches || [],
        brandTone: preferences.brandTone || 'professional',
        goals: preferences.goals || {},
        notifications: {
          email: preferences.notifications?.email !== false,
          push: preferences.notifications?.push || false,
          sms: preferences.notifications?.sms || false
        }
      },
      lastLogin: lastActivityAt || updatedAt, // Use real last login data
      lastLoginFormatted: lastLoginFormatted,
      loginCount: loginCount,
      dailyLoginStreak: dailyLoginStreak,
      
      // App Usage Insights
      dailyUsageTime: (user as any).dailyUsageTime || null,
      avgSessionDuration: (user as any).avgSessionDuration || null,
      totalSessions: (user as any).totalSessions || null,
      usageFrequency: (user as any).usageFrequency || (daysSinceLastActivity <= 7 ? 'Daily' : daysSinceLastActivity <= 30 ? 'Weekly' : 'Monthly'),
      
      // Referral Information
      referredBy: user.referredBy || null,
      
      // Onboarding Journey - Use real data from database
      waitlistJoinedAt: user.createdAt, // When they first signed up
      waitlistPosition: (user as any).waitlistPosition || null,
      waitlistStatus: user.status || 'waitlisted',
      hasUsedWaitlistBonus: user.hasUsedWaitlistBonus || false,
      
      // Extract onboarding data from preferences object
      businessType: preferences.businessType || (preferences.businessName ? 'business' : 'N/A'),
      experienceLevel: preferences.experienceLevel || 'N/A',
      primaryObjective: preferences.primaryObjective || (preferences.goals?.primary ? 
        preferences.goals.primary.replace('-', ' ').replace(/\b\w/g, (l: any) => l.toUpperCase()) : 'N/A'),
      contentStyle: preferences.contentStyle || preferences.brandTone || 'N/A',
      postingFrequency: preferences.postingFrequency || 'N/A',
      onboardingCompletedAt: user.onboardingCompletedAt || (isOnboarded ? user.updatedAt : null),
      onboardingStep: user.onboardingStep || (isOnboarded ? 5 : 1),
      onboardingData: user.onboardingData || {},
      niche: preferences.niche || (preferences.niches && preferences.niches.length > 0 ? preferences.niches[0] : 'N/A'),
      targetAudience: preferences.targetAudience || preferences.description || 'N/A',
      goals: preferences.goals ? Object.entries(preferences.goals).map(([key, value]) => `${key}: ${value}`) : [],
      socialPlatforms: preferences.socialPlatforms || [],
      
      // Waitlist questionnaire data - extract from real waitlist questionnaire data
      teamSize: waitlistQuestionnaire?.teamSize || null,
      currentTools: waitlistQuestionnaire?.currentTools || [],
      primaryGoal: waitlistQuestionnaire?.primaryGoal || null,
      contentTypes: waitlistQuestionnaire?.contentTypes || [],
      urgency: waitlistQuestionnaire?.urgency || null,
      
      // Post-signup onboarding data (from onboardingData field)
      fullName: (user.onboardingData as any)?.userProfile?.fullName || preferences.fullName || (user as any).fullName || null,
      role: (user.onboardingData as any)?.userProfile?.role || preferences.role || (user as any).role || null,
      companyName: (user.onboardingData as any)?.userProfile?.companyName || preferences.companyName || (user as any).companyName || null,
      companySize: (user.onboardingData as any)?.userProfile?.companySize || preferences.companySize || (user as any).companySize || null,
      primaryGoals: (user.onboardingData as any)?.userProfile?.primaryGoals || preferences.primaryGoals || (user as any).primaryGoals || [],
      currentChallenges: (user.onboardingData as any)?.currentChallenges || preferences.currentChallenges || (user as any).currentChallenges || null,
      monthlyBudget: (user.onboardingData as any)?.monthlyBudget || preferences.monthlyBudget || (user as any).monthlyBudget || null,
      platforms: (user.onboardingData as any)?.platforms || preferences.platforms || (user as any).platforms || [],
      onboardingContentTypes: (user.onboardingData as any)?.contentTypes || preferences.contentTypes || (user as any).contentTypes || [],
      onboardingPostingFrequency: (user.onboardingData as any)?.postingFrequency || preferences.postingFrequency || (user as any).postingFrequency || null,
      totalPosts: totalPosts,
      totalLikes: totalLikes,
      totalComments: totalComments,
      instagramUsername: (user as any).instagramUsername || `@${user.username}_ig`,
      referralCode: referralCode,
      totalReferrals: totalReferrals,
      totalEarned: totalEarned,
      lastMonthlyAllocation: lastMonthlyAllocation,
      isEarlyAccessUser: (user as any).isEarlyAccessUser || false,
      // Show all workspaces (legacy format for backward compatibility)
      workspace: workspace ? {
        id: workspace._id,
        name: workspace.name || 'Default Workspace',
        description: workspace.description || '',
        avatar: workspace.avatar || '',
        credits: workspace.credits || 0,
        theme: workspace.theme || 'light',
        aiPersonality: workspace.aiPersonality || 'professional',
        isDefault: workspace.isDefault || false,
        maxTeamMembers: workspace.maxTeamMembers || 1,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        socialAccountsCount: activeAccounts.filter(account => 
          account.workspace && account.workspace.id.toString() === workspace._id.toString()
        ).length,
        connectedPlatforms: activeAccounts
          .filter(account => account.workspace && account.workspace.id.toString() === workspace._id.toString())
          .map(account => account.platform)
      } : {
        id: user.workspaceId,
        name: 'Default Workspace',
        description: '',
        avatar: '',
        credits: 0,
        theme: 'light',
        aiPersonality: 'professional',
        isDefault: true,
        maxTeamMembers: 1,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        socialAccountsCount: 0,
        connectedPlatforms: []
      },
      
      // Show all workspaces with detailed information
      workspaces: userWorkspaces.map(workspace => ({
        id: workspace._id,
        name: workspace.name || 'Unknown Workspace',
        description: workspace.description || '',
        avatar: workspace.avatar || '',
        credits: workspace.credits || 0,
        theme: workspace.theme || 'light',
        aiPersonality: workspace.aiPersonality || 'professional',
        isDefault: workspace.isDefault || false,
        maxTeamMembers: workspace.maxTeamMembers || 1,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
        socialAccountsCount: activeAccounts.filter(account => 
          account.workspace && account.workspace.id.toString() === workspace._id.toString()
        ).length,
        connectedPlatforms: activeAccounts
          .filter(account => account.workspace && account.workspace.id.toString() === workspace._id.toString())
          .map(account => account.platform),
        socialAccounts: activeAccounts
          .filter(account => account.workspace && account.workspace.id.toString() === workspace._id.toString())
          .map(account => ({
            platform: account.platform,
            username: account.username,
            followers: account.followersCount || 0,
            following: account.followingCount || 0,
            posts: account.mediaCount || 0,
            verified: account.isVerified || false,
            connectedAt: account.createdAt
          }))
      })),
      earlyAccessStatus: (user as any).earlyAccessStatus,
      engagementScore: Math.round(engagementScore),
      createdAt: createdAt,
      createdAtFormatted: new Date(createdAt).toLocaleDateString(),
      updatedAt: updatedAt
    };
    }));

  return {
    users: transformedUsers,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum)
  };
};

export const getMainAppUserStats = async () => {
  const connection = await connectToMainApp();
  const User = connection.model('User', MainAppUserSchema, 'users');

  const [
    totalUsers,
    activeUsers,
    waitlistedUsers,
    earlyAccessUsers,
    launchedUsers,
    planStats,
    newUsers,
    bannedUsers,
    usersWithSocialConnections,
    creditsData
  ] = await Promise.all([
    User.countDocuments({}),
    User.countDocuments({ status: { $in: ['launched', 'early_access'] } }),
    User.countDocuments({ status: 'waitlisted' }),
    User.countDocuments({ status: 'early_access' }),
    User.countDocuments({ status: 'launched' }),
    User.aggregate([
      {
        $group: {
          _id: '$plan',
          count: { $sum: 1 }
        }
      }
    ]),
    User.countDocuments({
      createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }),
    User.countDocuments({ isBanned: true }),
    User.countDocuments({
      $or: [
        { socialPlatforms: { $exists: true, $not: { $size: 0 } } },
        { instagramUsername: { $exists: true, $ne: null } },
        { workspaceId: { $exists: true, $ne: null } }
      ]
    }),
    User.aggregate([
      { $group: { _id: null, totalCredits: { $sum: '$credits' } } }
    ])
  ]);

  const totalCreditsRemaining = creditsData[0]?.totalCredits || 0;
  const growthRate = totalUsers > 0 ? Math.round((newUsers / totalUsers) * 100) : 0;

  return {
    totalUsers,
    activeUsers,
    waitlistedUsers,
    earlyAccessUsers,
    launchedUsers,
    newUsers,
    bannedUsers,
    usersWithSocialConnections,
    totalCreditsUsed: 0, // Not tracked in main app
    totalCreditsRemaining,
    growthRate,
    conversionRate: totalUsers > 0 ? Math.round((launchedUsers / totalUsers) * 100) : 0,
    churnRate: 0, // Not tracked in main app
    avgOrderValue: 0, // Not tracked in main app
    totalRevenue: 0, // Not tracked in main app
    planStats: planStats.reduce((acc: any, stat: any) => {
      acc[stat._id?.toLowerCase() || 'free'] = stat.count;
      return acc;
    }, {})
  };
};
