import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth"
import { createUserWithEmailAndPassword, signInWithCustomToken } from "firebase/auth"
import { auth } from "@/lib/firebase"
import { useLocation } from "wouter"
import { motion } from "framer-motion"
import {
  checkOAuthSuccess,
  clearOAuthSuccess,
} from "@/utils/oauthErrorHandler"
import { SignUpForm } from "@/features/auth/components/SignUpForm"
import { EmailVerification } from "@/features/auth/components/EmailVerification"
import { OnboardingFlow } from "@/features/auth/components/OnboardingFlow"
import type { OnboardingData } from "@/features/auth/components/OnboardingFlow"

/**
 * SignUpIntegrated - Main signup page orchestrator
 * 
 * Requirements:
 * - 2.6: Update signup route to use refactored components
 * - 8.4: Verify OAuth integration still works with refactored structure
 * 
 * This page has been refactored to use modular components:
 * - SignUpForm: Handles form input, validation, and OAuth
 * - EmailVerification: Handles OTP verification
 * - OnboardingFlow: Handles user onboarding after signup
 */

type SignupStep = 'form' | 'verification' | 'creating' | 'onboarding'

interface SignUpFormData {
  fullName: string
  email: string
  password: string
}

function SignUpIntegrated() {
  const [currentStep, setCurrentStep] = useState<SignupStep>('form')
  const [formData, setFormData] = useState<SignUpFormData>({
    fullName: '',
    email: '',
    password: ''
  })
  const [createdFirebaseUser, setCreatedFirebaseUser] = useState<any>(null)
  const [showOAuthSuccess, setShowOAuthSuccess] = useState(false)

  const { toast } = useToast()
  const { user } = useFirebaseAuth()
  const [, setLocation] = useLocation()

  /**
   * Handle OAuth success - Exchange session token for Firebase custom token
   */
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const hasOAuthSuccess = checkOAuthSuccess(urlParams)

    if (hasOAuthSuccess) {
      setShowOAuthSuccess(true)
      
      const exchangeSession = async () => {
        try {
          console.log('[OAuth SignUp] Exchanging session token...')
          const response = await fetch('/api/auth/session', {
            method: 'GET',
            credentials: 'include',
          })
          
          if (!response.ok) {
            throw new Error('Failed to get custom token')
          }
          
          const data = await response.json()
          console.log('[OAuth SignUp] Received custom token of length:', data.customToken?.length)
          
          if (!data.customToken) {
            throw new Error('MISSING_CUSTOM_TOKEN')
          }
          
          console.log('[OAuth SignUp] Signing in with custom token...')
          await signInWithCustomToken(auth, data.customToken)
          
          console.log('[OAuth SignUp] Firebase sign-in successful')
          toast({
            title: 'Success!',
            description: 'Signed up with Google successfully',
          })
          
          clearOAuthSuccess()
          console.log('[OAuth SignUp] Sign-up complete, auth state will propagate automatically')
          
        } catch (error: any) {
          console.error('[OAuth SignUp] Session exchange failed:', error)
          toast({
            title: 'Authentication Error',
            description: error.message || 'Failed to complete sign-up',
            variant: 'destructive',
          })
          setShowOAuthSuccess(false)
        }
      }
      
      exchangeSession()
    }
  }, [toast])

  /**
   * Handle resuming onboarding for authenticated users
   */
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const isResuming = urlParams.get('resume') === 'true'

    if (user && currentStep !== 'onboarding') {
      if (isResuming) {
        console.log('[ONBOARDING] Resuming onboarding for authenticated user')
        setCreatedFirebaseUser(user)
        setCurrentStep('onboarding')
      } else {
        // User is fully authenticated - redirect to dashboard
        window.location.href = '/'
      }
    }
  }, [user, currentStep])

  /**
   * Show loading when authenticated user is being redirected
   */
  const urlParams = new URLSearchParams(window.location.search)
  const isResuming = urlParams.get('resume') === 'true'
  if (user && currentStep !== 'onboarding' && !isResuming) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div
            className="w-20 h-20 border-4 border-teal-200 border-t-teal-600 rounded-full mx-auto mb-8"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <motion.h1 className="text-3xl font-bold text-white mb-4">
            Redirecting...
          </motion.h1>
          <p className="text-white/60 text-lg">Taking you to your dashboard</p>
        </motion.div>
      </div>
    )
  }

  /**
   * Handle successful form submission - send verification email
   */
  const handleFormSuccess = async (data: SignUpFormData) => {
    setFormData(data)
    
    try {
      const response = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email.trim().toLowerCase(),
          firstName: data.fullName.trim().split(' ')[0]
        })
      })

      const result = await response.json()

      if (!response.ok) {
        // Handle early access errors
        if (response.status === 403) {
          const errorCode = result.error?.code || result.code
          
          let errorMessage = 'Early Access Required'
          switch (errorCode) {
            case 'NOT_ON_WAITLIST':
              errorMessage = 'This email isn\'t on our waitlist. Join at veefore.com/waitlist!'
              break
            case 'PENDING_APPROVAL':
              errorMessage = 'Your application is under review. Check your email for updates!'
              break
            case 'ACCESS_REJECTED':
              errorMessage = 'Your application wasn\'t approved. Contact support@veefore.com'
              break
          }
          
          toast({
            title: "Access Denied",
            description: errorMessage,
            variant: "destructive",
          })
          return
        }

        throw new Error(result.message || 'Failed to send verification email')
      }

      setCurrentStep('verification')

      toast({
        title: "Verification email sent!",
        description: `Please check your email at ${data.email} for the verification code.`,
      })

      if (result.developmentOtp) {
        console.log('Development OTP:', result.developmentOtp)
      }

    } catch (error: any) {
      console.error('❌ Send OTP error:', error)
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      })
    }
  }

  /**
   * Handle successful email verification - create Firebase user
   */
  const handleVerificationSuccess = async () => {
    setCurrentStep('creating')

    try {
      // Create Firebase user
      console.log('[FIREBASE] Creating user with email:', formData.email)
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email.trim().toLowerCase(),
        formData.password
      )

      console.log('[FIREBASE] User created successfully:', userCredential.user.uid)
      setCreatedFirebaseUser(userCredential.user)

      // Move to onboarding
      setCurrentStep('onboarding')

    } catch (error: any) {
      console.error('[FIREBASE] User creation failed:', error)
      
      let errorMessage = 'Failed to create account'
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please sign in instead.'
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Password is too weak. Please choose a stronger password.'
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.'
      }

      toast({
        title: "Account Creation Failed",
        description: errorMessage,
        variant: "destructive",
      })

      // Go back to form
      setCurrentStep('form')
    }
  }

  /**
   * Handle onboarding completion - save to backend
   */
  const handleOnboardingComplete = async (data: OnboardingData) => {
    try {
      if (!createdFirebaseUser) {
        throw new Error('No user found')
      }

      const idToken = await createdFirebaseUser.getIdToken()

      const response = await fetch('/api/users/complete-onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(data)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Failed to complete onboarding')
      }

      toast({
        title: "Welcome to Veefore!",
        description: "Your account is ready. Let's get started!",
      })

      // Redirect to dashboard (auth state will propagate automatically)
      window.location.href = '/'

    } catch (error: any) {
      console.error('Onboarding completion error:', error)
      toast({
        title: "Error",
        description: error.message || 'Failed to complete onboarding',
        variant: "destructive",
      })
    }
  }

  /**
   * Handle onboarding skip - mark as incomplete and redirect
   */
  const handleOnboardingSkip = async () => {
    toast({
      title: "Onboarding Skipped",
      description: "You can complete this later in settings",
    })
    
    // Redirect to dashboard
    window.location.href = '/'
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gradient-to-b from-white/[0.08] to-white/[0.02] backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl p-8">
          {/* Logo */}
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-teal-400 to-emerald-400 bg-clip-text text-transparent">
              VeeFore
            </h1>
          </div>

          {/* Step Content */}
          {currentStep === 'form' && (
            <SignUpForm
              onSuccess={handleFormSuccess}
              initialEmail={new URLSearchParams(window.location.search).get('email') || ''}
            />
          )}

          {currentStep === 'verification' && (
            <EmailVerification
              email={formData.email}
              onVerificationSuccess={handleVerificationSuccess}
              onBack={() => setCurrentStep('form')}
            />
          )}

          {currentStep === 'creating' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-8"
            >
              <Loader2 className="w-16 h-16 animate-spin text-teal-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-white mb-2">Creating your account...</h3>
              <p className="text-white/50 text-sm">This will only take a moment</p>
            </motion.div>
          )}

          {currentStep === 'onboarding' && createdFirebaseUser && (
            <OnboardingFlow
              fullName={formData.fullName}
              onComplete={handleOnboardingComplete}
              onSkip={handleOnboardingSkip}
            />
          )}
        </div>

        {/* Terms & Privacy */}
        {(currentStep === 'form' || currentStep === 'verification') && (
          <p className="text-center text-white/30 text-xs mt-6">
            By continuing, you agree to our{' '}
            <span 
              className="text-white/50 hover:underline cursor-pointer" 
              onClick={() => setLocation('/terms-of-service')}
            >
              Terms of Service
            </span>{' '}
            and{' '}
            <span 
              className="text-white/50 hover:underline cursor-pointer" 
              onClick={() => setLocation('/privacy-policy')}
            >
              Privacy Policy
            </span>
          </p>
        )}
      </div>

      {/* OAuth Success Indicator */}
      {showOAuthSuccess && (
        <div className="fixed top-4 right-4 bg-emerald-500/20 border border-emerald-500/50 rounded-lg p-4 backdrop-blur-lg">
          <div className="flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
            <span className="text-sm text-emerald-200">Completing Google sign-up...</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default SignUpIntegrated
