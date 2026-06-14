import { Router, Request, Response, NextFunction } from 'express'
import { getFirebaseAdmin, admin } from './firebase-admin'
import { storage } from './mongodb-storage'
import { validateRequest, safeJsonParse } from './middleware/validation'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'

// Import shared auth middleware
import { authenticateUser, AuthenticatedRequest } from './shared/middleware/auth.middleware'

const router = Router()

// Rate limiter for verification endpoints to prevent brute-forcing
const verificationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per `window`
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification attempts, please try again after 15 minutes' }
})

// Use shared auth middleware instead of local implementation
const verifyFirebaseToken = authenticateUser

// Register or login user
// Send email verification code with validation
router.post('/send-verification', verifyFirebaseToken, verificationRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const firebaseUid = req.user.uid

    // Get user from database
    const user = await storage.getUserByFirebaseUid(firebaseUid)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Generate 6-digit verification code securely
    const { randomInt } = require('crypto');
    const verificationCode = randomInt(100000, 1000000).toString()
    const expiryTime = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    // Update user with verification code and expiry
    await storage.updateUser(user.id, {
      emailVerificationCode: verificationCode,
      emailVerificationExpiry: expiryTime
    })

    // Send email using emailService
    const { emailService } = await import('./email-service')
    await emailService.sendVerificationEmail(user.email, verificationCode)

    console.log(`[EMAIL VERIFICATION] Code sent to ${user.email} (code redacted for security)`)

    res.json({
      success: true,
      message: 'Verification code sent to your email'
    })
  } catch (error: any) {
    console.error('[EMAIL VERIFICATION] Error sending code:', error)
    res.status(500).json({ error: 'Failed to send verification code' })
  }
})

// Verify email with code and validation
const verifyEmailValidation = validateRequest({
  body: z.object({
    code: z.string().length(6, 'Verification code must be 6 digits').regex(/^\d{6}$/, 'Invalid code format')
  })
});

router.post('/verify-email', verifyFirebaseToken, verificationRateLimiter, verifyEmailValidation, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user?.uid) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const firebaseUid = req.user.uid
    const { code } = req.body

    if (!code) {
      return res.status(400).json({ error: 'Verification code is required' })
    }

    // Get user from database
    const user = await storage.getUserByFirebaseUid(firebaseUid)
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    // Check if code matches and is not expired
    let codeIsValid = false;
    if (user.emailVerificationCode && user.emailVerificationCode.length === code.length) {
      const { timingSafeEqual } = require('crypto');
      codeIsValid = timingSafeEqual(Buffer.from(user.emailVerificationCode), Buffer.from(code));
    }
    
    if (!codeIsValid) {
      return res.status(400).json({ error: 'Invalid verification code' })
    }

    if (!user.emailVerificationExpiry || new Date() > user.emailVerificationExpiry) {
      return res.status(400).json({ error: 'Verification code has expired' })
    }

    // Mark email as verified and clear verification code
    await storage.updateUser(user.id, {
      isEmailVerified: true,
      emailVerificationCode: null,
      emailVerificationExpiry: null
    })

    console.log(`[EMAIL VERIFICATION] Email verified for user ${user.email}`)

    res.json({
      success: true,
      message: 'Email verified successfully'
    })
  } catch (error: any) {
    console.error('[EMAIL VERIFICATION] Error verifying code:', error)
    res.status(500).json({ error: 'Failed to verify email' })
  }
})

// Complete user signup with early access details
router.post('/signup', verifyFirebaseToken, async (req, res) => {
  try {
    const {
      fullName,
      email,
      interestedFeatures = [],
      useCases = [],
      currentPlatforms = [],
      monthlyContent,
      teamSize,
      industry
    } = req.body

    console.log(`[EARLY ACCESS SIGNUP] Processing signup for ${email} with early access data`)

    // Get existing user or create new one (assuming they've been verified)
    let user = await storage.getUserByEmail(email)

    if (!user || user.firebaseUid !== (req as any).user?.uid) {
      return res.status(404).json({ error: 'User not found or unauthenticated. Please verify your email first.' })
    }

    // Update user with early access information
    const updateData = {
      displayName: fullName,
      earlyAccessData: {
        interestedFeatures,
        useCases,
        currentPlatforms,
        monthlyContent,
        teamSize,
        industry,
        signupDate: new Date()
      },
      isOnboarded: true,
      onboardingCompletedAt: new Date()
    }

    const updatedUser = await storage.updateUser(user.id, updateData)

    console.log(`[EARLY ACCESS SIGNUP] Successfully updated user ${email} with early access data`)

    res.json({
      success: true,
      message: 'Early access signup completed successfully',
      user: {
        id: updatedUser._id || updatedUser.id,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        isEmailVerified: updatedUser.isEmailVerified,
        isOnboarded: updatedUser.isOnboarded
      },
      requiresOnboarding: false
    })
  } catch (error: any) {
    console.error('[EARLY ACCESS SIGNUP] Error:', error)
    res.status(500).json({ error: 'Failed to complete signup' })
  }
})

router.post('/register', async (req, res) => {
  try {
    const { idToken, email, displayName } = req.body

    const firebaseAdmin = getFirebaseAdmin()
    if (!firebaseAdmin) {
      return res.status(500).json({ error: 'Firebase Admin not initialized' })
    }

    // Verify the Firebase ID token
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken)
    const uid = decodedToken.uid
    const userEmail = email || decodedToken.email

    // ============================================
    // EARLY ACCESS VALIDATION - Server-side gating with granular error messages
    // ============================================
    if (userEmail) {
      const { waitlistUserRepository } = await import('./repositories/WaitlistUserRepository')
      const normalizedEmail = userEmail.toLowerCase().trim()
      const waitlistUser = await waitlistUserRepository.findByEmail(normalizedEmail)

      // Scenario 1: User is not on waitlist at all
      if (!waitlistUser) {
        console.log(`[EARLY ACCESS] Access denied for ${normalizedEmail} - Not on waitlist`)
        return res.status(403).json({
          error: 'NOT_ON_WAITLIST',
          code: 'NOT_ON_WAITLIST',
          message: 'This email is not on our waitlist. Please join the waitlist first to get early access.',
          action: 'JOIN_WAITLIST',
          hasWaitlistEntry: false,
          waitlistStatus: null
        })
      }

      // Scenario 2: User is on waitlist but pending approval
      if (waitlistUser.status === 'pending' || waitlistUser.status === 'waitlisted') {
        console.log(`[EARLY ACCESS] Access denied for ${normalizedEmail} - Status: ${waitlistUser.status} (pending approval)`)
        return res.status(403).json({
          error: 'NOT_APPROVED_YET',
          code: 'PENDING_APPROVAL',
          message: 'Your waitlist application is pending approval. We will notify you via email when you are approved for early access.',
          action: 'WAIT_FOR_APPROVAL',
          hasWaitlistEntry: true,
          waitlistStatus: waitlistUser.status
        })
      }

      // Scenario 3: User application was rejected
      if (waitlistUser.status === 'rejected') {
        console.log(`[EARLY ACCESS] Access denied for ${normalizedEmail} - Status: rejected`)
        return res.status(403).json({
          error: 'APPLICATION_REJECTED',
          code: 'ACCESS_REJECTED',
          message: 'Your application was not approved at this time. Please contact support for more information.',
          action: 'CONTACT_SUPPORT',
          hasWaitlistEntry: true,
          waitlistStatus: waitlistUser.status
        })
      }

      // Scenario 4: User has invalid/unknown status
      if (waitlistUser.status !== 'early_access') {
        console.log(`[EARLY ACCESS] Access denied for ${normalizedEmail} - Invalid status: ${waitlistUser.status}`)
        return res.status(403).json({
          error: 'INVALID_STATUS',
          code: 'INVALID_STATUS',
          message: `Your account status (${waitlistUser.status}) does not allow signup. Please contact support.`,
          action: 'CONTACT_SUPPORT',
          hasWaitlistEntry: true,
          waitlistStatus: waitlistUser.status
        })
      }

      // Success: User is approved for early access
      console.log(`[EARLY ACCESS] Access granted for ${normalizedEmail} - Status: ${waitlistUser.status}`)
    }
    // ============================================

    // Check if user already exists in MongoDB by Firebase UID
    let user = await storage.getUserByFirebaseId(uid)

    if (!user) {
      // If not found by UID, check by email (handling early access pre-creation)
      if (userEmail) {
        user = await storage.getUserByEmail(userEmail)

        if (user) {
          // Update existing user with actual Firebase UID
          // We need to access the raw repository or add a specific method for this
          // For now using updateUser assuming it handles partial updates
          await storage.updateUser(user.id, { firebaseUid: uid })
          // Refresh user object
          user = await storage.getUser(user.id) as any
        }
      }

      // If still not found, create new user
      if (!user) {
        user = await storage.createUser({
          firebaseUid: uid,
          email: userEmail,
          displayName: displayName || decodedToken.name || 'User',
          avatar: decodedToken.picture || '',
          status: 'early_access',
          createdAt: new Date(),
          lastLoginAt: new Date()
        } as any)
      }
    } else {
      // Update last login
      await storage.updateUserLastLogin(uid)
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        profilePictureUrl: (user as any).avatar || (user as any).profilePictureUrl
      }
    })
  } catch (error) {
    console.error('Registration/login failed:', error)
    res.status(500).json({ error: 'Registration/login failed' })
  }
})

// Get current user
router.get('/user', verifyFirebaseToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid!
    let user = await storage.getUserByFirebaseId(uid)

    // Backward-compatible fallback: some older records may not have firebaseUid linked.
    if (!user && req.user?.email) {
      const fallbackUser = await storage.getUserByEmail(req.user.email);
      if (fallbackUser) {
        user = await storage.updateUser(fallbackUser.id.toString(), { firebaseUid: uid });
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({ user })
  } catch (error) {
    console.error('Failed to get user:', error)
    res.status(500).json({ error: 'Failed to get user' })
  }
})

// Update user profile
router.put('/user', verifyFirebaseToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uid = req.user!.uid!
    const { displayName, profilePictureUrl, niche } = req.body
    let existingUser = await storage.getUserByFirebaseId(uid)

    // Backward-compatible fallback: resolve by email and link firebaseUid.
    if (!existingUser && req.user?.email) {
      const fallbackUser = await storage.getUserByEmail(req.user.email);
      if (fallbackUser) {
        existingUser = await storage.updateUser(fallbackUser.id.toString(), { firebaseUid: uid });
      }
    }

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    const updates: Record<string, any> = {};
    if (typeof displayName === 'string') updates.displayName = displayName.trim();
    if (typeof profilePictureUrl === 'string') updates.profilePictureUrl = profilePictureUrl.trim();
    if (typeof niche === 'string') updates.niche = niche.trim();

    const updatedUser = await storage.updateUser(existingUser.id.toString(), updates)

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({
      success: true,
      user: updatedUser
    })
  } catch (error) {
    console.error('Failed to update user:', error)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Logout (invalidate token on server side if needed)
router.post('/logout', verifyFirebaseToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // For now, just return success
    // In a more complex setup, you might want to blacklist the token
    res.json({ success: true })
  } catch (error) {
    console.error('Logout failed:', error)
    res.status(500).json({ error: 'Logout failed' })
  }
})

export default router