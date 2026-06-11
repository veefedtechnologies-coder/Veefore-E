import { getFirebaseAdmin } from '../../firebase-admin';
import { User, IUser } from '../../models/User/User';
import { logger } from '../../config/logger';

/**
 * FirebaseTokenService - Firebase custom token creation and user management
 * 
 * This service handles Firebase authentication token creation for OAuth users.
 * It manages user creation for new Google OAuth users and updates existing users
 * during authentication.
 * 
 * Key responsibilities:
 * - Create Firebase custom tokens using Firebase Admin SDK
 * - Create user documents for new Google OAuth users
 * - Update existing user documents with Google authentication data
 * - Generate unique usernames from email addresses
 * - Track authentication timestamps (lastLoginAt)
 * - Verify Firebase custom tokens
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 18.2, 18.4
 */

/**
 * Google user information from OAuth provider
 */
export interface GoogleUserInfo {
  sub: string;          // Google user ID
  email: string;        // User email address
  email_verified: boolean;
  name: string;         // Full display name
  picture: string;      // Profile picture URL
  given_name?: string;  // First name
  family_name?: string; // Last name
}

/**
 * Result of Firebase token creation
 */
export interface FirebaseTokenResult {
  customToken: string;  // Firebase custom token (JWT)
  user: IUser;          // User document from MongoDB
  isNewUser: boolean;   // True if user was just created
}

/**
 * Decoded Firebase token payload
 */
export interface DecodedToken {
  uid: string;          // Firebase user ID
  iat: number;          // Issued at timestamp
  exp: number;          // Expiration timestamp
  email?: string;       // User email
  emailVerified?: boolean;
}

export class FirebaseTokenService {
  /**
   * Create Firebase custom token for Google OAuth user
   * 
   * This method:
   * 1. Finds or creates user in MongoDB using email
   * 2. Updates user with Google ID and last login timestamp
   * 3. Creates Firebase custom token with user UID
   * 
   * For new users:
   * - Generates unique username from email
   * - Sets email verification status from Google
   * - Creates user with default credits and plan
   * 
   * For existing users:
   * - Updates lastLoginAt timestamp
   * - Updates googleId if not set or changed
   * - Preserves all existing user data
   * 
   * @param googleUserInfo - User information from Google OAuth
   * @returns Firebase custom token, user document, and isNewUser flag
   * @throws Error if Firebase token creation fails
   * 
   * @requirement 3.1 - Check if user exists by email
   * @requirement 3.2 - Create new user with Google data
   * @requirement 3.3 - Update existing user's lastLoginAt
   * @requirement 3.4 - Create Firebase custom token
   * @requirement 3.5 - Handle token creation failures
   */
  async createFirebaseToken(
    googleUserInfo: GoogleUserInfo
  ): Promise<FirebaseTokenResult> {
    const startTime = Date.now();
    
    try {
      // Requirement 3.1: Find existing user by email
      let user = await User.findOne({ email: googleUserInfo.email });
      let isNewUser = false;

      if (!user) {
        // Requirement 3.2: Create new user for Google OAuth
        isNewUser = true;

        // Generate unique username from email
        const username = await this.generateUsername(googleUserInfo.email);

        user = await User.create({
          email: googleUserInfo.email,
          googleId: googleUserInfo.sub,
          displayName: googleUserInfo.name,
          avatar: googleUserInfo.picture,
          username: username,
          isEmailVerified: googleUserInfo.email_verified,
          credits: 50, // Default credits for new users
          plan: 'Free', // Default plan
          createdAt: new Date(),
          lastLoginAt: new Date(),
        });

        // Requirement 18.2: Log user creation during OAuth flow
        logger.info('New user created via Google OAuth', {
          component: 'OAuth.FirebaseToken',
          userId: user._id.toString(),
          email: googleUserInfo.email,
          isNewUser: true,
        });
      } else {
        // Requirement 3.3: Update existing user
        user.lastLoginAt = new Date();
        
        // Update googleId if not set (existing email/password user signing in with Google)
        if (!user.googleId) {
          user.googleId = googleUserInfo.sub;
        }

        // Update avatar and display name from Google if not set
        if (!user.avatar && googleUserInfo.picture) {
          user.avatar = googleUserInfo.picture;
        }
        if (!user.displayName && googleUserInfo.name) {
          user.displayName = googleUserInfo.name;
        }

        await user.save();

        // Requirement 18.2: Log user update during OAuth flow
        logger.debug('Existing user updated via Google OAuth', {
          component: 'OAuth.FirebaseToken',
          userId: user._id.toString(),
          email: googleUserInfo.email,
          isNewUser: false,
        });
      }

      // Requirement 3.4: Create Firebase custom token
      const admin = getFirebaseAdmin();
      
      // Custom token expires after 60 minutes (Firebase default)
      // Include user claims for consistency with token refresh endpoint
      const customToken = await admin.auth().createCustomToken(
        String(user._id),
        {
          email: user.email,
          emailVerified: user.isEmailVerified,
          googleId: user.googleId,
          sessionVersion: user.sessionVersion || 1,
        }
      );

      const durationMs = Date.now() - startTime;

      // Requirement 18.2: Log Firebase token creation success with INFO level
      logger.info('Firebase custom token created', {
        component: 'OAuth.FirebaseToken',
        userId: user._id.toString(),
        email: googleUserInfo.email,
        isNewUser,
        durationMs,
      });

      return {
        customToken,
        user,
        isNewUser,
      };
    } catch (error) {
      // Requirement 3.5: Handle Firebase token creation failures
      // Requirement 18.4: Log Firebase token creation failure with ERROR level
      logger.error('Failed to create Firebase token', error, {
        component: 'OAuth.FirebaseToken',
        email: googleUserInfo.email,
        errorType: error instanceof Error ? error.name : 'Unknown',
      });

      // Throw with user-friendly message
      if (error instanceof Error && error.message.includes('auth')) {
        throw new Error('Failed to create authentication token');
      }

      throw new Error('Failed to create authentication token');
    }
  }

  /**
   * Verify Firebase custom token
   * 
   * Validates a Firebase custom token and returns decoded payload.
   * This can be used to verify tokens on protected routes.
   * 
   * @param token - Firebase custom token to verify
   * @returns Decoded token payload with user ID and claims
   * @throws Error if token is invalid or expired
   * 
   * @requirement 3.7 - Verify token method for token validation
   */
  async verifyToken(token: string): Promise<DecodedToken> {
    try {
      const admin = getFirebaseAdmin();
      
      // Verify the token with Firebase Admin SDK
      const decodedToken = await admin.auth().verifyIdToken(token);

      return {
        uid: decodedToken.uid,
        iat: decodedToken.iat,
        exp: decodedToken.exp,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified,
        // Include custom claims (sessionVersion, googleId, etc.)
        ...decodedToken,
      };
    } catch (error) {
      logger.error('Failed to verify Firebase token', error, {
        component: 'OAuth.FirebaseToken',
        errorType: error instanceof Error ? error.name : 'Unknown',
      });

      throw new Error('Invalid or expired authentication token');
    }
  }

  /**
   * Generate unique username from email address
   * 
   * Generates a username by:
   * 1. Extracting local part from email (before @)
   * 2. Converting to lowercase and removing special characters
   * 3. Checking for uniqueness in database
   * 4. Appending random number if username exists
   * 
   * @param email - Email address to generate username from
   * @returns Unique username
   * @private
   */
  private async generateUsername(email: string): Promise<string> {
    // Extract local part from email and sanitize
    const baseUsername = email
      .split('@')[0]
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    // Check if base username is available
    let username = baseUsername;
    let counter = 1;

    while (await User.findOne({ username })) {
      // Username exists, append random number
      const randomSuffix = Math.floor(Math.random() * 10000);
      username = `${baseUsername}${randomSuffix}`;
      
      counter++;
      
      // Safety check to prevent infinite loop
      if (counter > 100) {
        throw new Error('Failed to generate unique username');
      }
    }

    return username;
  }
}

// Export singleton instance
export const firebaseTokenService = new FirebaseTokenService();
