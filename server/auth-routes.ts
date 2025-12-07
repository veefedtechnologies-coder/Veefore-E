import { Router, Request, Response, NextFunction } from 'express'
import { firebaseAdmin, admin } from './firebase-admin'
import { storage } from './mongodb-storage'
import { validateRequest, safeJsonParse } from './middleware/validation'
import { z } from 'zod'

const router = Router()

// Middleware to verify Firebase ID token
const verifyFirebaseToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' })
    }

    const token = authHeader.split(' ')[1]
    
    if (!firebaseAdmin) {
      return res.status(500).json({ error: 'Firebase Admin not initialized' })
    }

    const decodedToken = await firebaseAdmin.auth().verifyIdToken(token);
    req.user = decodedToken as Express.Request['user'];
    next()
  } catch (error) {
    console.error('Token verification failed:', error)
    res.status(401).json({ error: 'Invalid token' })
  }
}

// Register or login user
// Send email verification code with validation
router.post('/send-verification', verifyFirebaseToken, async (req: Request, res: Response) => {
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

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString()
    const expiryTime = new Date(Date.now() + 15 * 60 * 1000) // 15 minutes

    // Update user with verification code and expiry
    await storage.updateUser(user.id, {
      emailVerificationCode: verificationCode,
      emailVerificationExpiry: expiryTime
    })

    // Send email using emailService
    const { emailService } = await import('./email-service')
    await emailService.sendVerificationEmail(user.email, verificationCode)

    console.log(`[EMAIL VERIFICATION] Code sent to ${user.email} (${verificationCode})`)
    
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

router.post('/verify-email', verifyFirebaseToken, verifyEmailValidation, async (req: Request, res: Response) => {
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
    if (user.emailVerificationCode !== code) {
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
router.post('/signup', async (req, res) => {
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
    
    if (!user) {
      return res.status(404).json({ error: 'User not found. Please verify your email first.' })
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
    
    if (!firebaseAdmin) {
      return res.status(500).json({ error: 'Firebase Admin not initialized' })
    }

    // Verify the Firebase ID token
    const decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken)
    const uid = decodedToken.uid

    // Check if user already exists in MongoDB
    let user = await storage.getUserByFirebaseId(uid)
    
    if (!user) {
      // Create new user in MongoDB
      user = await storage.createUser({
        firebaseId: uid,
        email: email || decodedToken.email,
        displayName: displayName || decodedToken.name || 'User',
        profilePictureUrl: decodedToken.picture || '',
        createdAt: new Date(),
        lastLoginAt: new Date()
      })
    } else {
      // Update last login
      await storage.updateUserLastLogin(uid)
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        profilePictureUrl: user.profilePictureUrl
      }
    })
  } catch (error) {
    console.error('Registration/login failed:', error)
    res.status(500).json({ error: 'Registration/login failed' })
  }
})

// Get current user
router.get('/user', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid!
    const user = await storage.getUserByFirebaseId(uid)
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({
      user: {
        id: user._id,
        email: user.email,
        displayName: user.displayName,
        profilePictureUrl: user.profilePictureUrl,
        username: user.username,
        avatar: user.avatar,
        credits: user.credits,
        plan: user.plan,
        isOnboarded: user.isOnboarded,
        preferences: user.preferences,
        isEmailVerified: user.isEmailVerified,
        onboardingStep: user.onboardingStep,
        status: user.status,
        trialExpiresAt: user.trialExpiresAt,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt
      }
    })
  } catch (error) {
    console.error('Failed to get user:', error)
    res.status(500).json({ error: 'Failed to get user' })
  }
})

// Update user profile
router.put('/user', verifyFirebaseToken, async (req: Request, res: Response) => {
  try {
    const uid = req.user!.uid!
    const { displayName, profilePictureUrl } = req.body
    
    const updatedUser = await storage.updateUser(uid, {
      displayName,
      profilePictureUrl
    })

    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({
      success: true,
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        displayName: updatedUser.displayName,
        profilePictureUrl: updatedUser.profilePictureUrl
      }
    })
  } catch (error) {
    console.error('Failed to update user:', error)
    res.status(500).json({ error: 'Failed to update user' })
  }
})

// Logout (invalidate token on server side if needed)
router.post('/logout', verifyFirebaseToken, async (req: Request, res: Response) => {
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