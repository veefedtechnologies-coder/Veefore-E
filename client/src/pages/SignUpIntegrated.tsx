import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Mail, Eye, EyeOff, User, Lock, ArrowRight, ArrowLeft, Loader2, Timer, Target, Settings, CheckCircle, RefreshCw } from "lucide-react"
import { OnboardingConnectMeta } from "@/features/auth/steps/OnboardingConnectMeta"
import { OnboardingBrandSelection } from "@/features/auth/steps/OnboardingBrandSelection"
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth"
import { createUserWithEmailAndPassword } from "firebase/auth"
import { auth } from "@/lib/firebase"
import { clearClientSessionState } from "@/lib/session-cleanup"
import { useLocation } from "wouter"
import { motion, AnimatePresence } from "framer-motion"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import {
  parseOAuthError,
  clearOAuthError,
  preserveFormData,
  restoreFormData,
  getErrorColorClasses,
  checkOAuthSuccess,
  clearOAuthSuccess,
} from "@/utils/oauthErrorHandler"
import {
  isValidEmail,
  validateName,
  validatePassword,
  validateEmailComplete,
} from "./signup-integrated/validation"
import type { SignupStep, UserExistsModal } from "./signup-integrated/types"
import { RequirementItem } from "./signup-integrated/RequirementItem"
import { SignUpGraphicsPanel } from "./signup-integrated/SignUpGraphicsPanel"

function SignUpIntegrated() {
  const ONBOARDING_STEP_KEY = 'veefore_onboarding_step'

  // Restore onboarding step from sessionStorage on mount (survives refresh, not tab close)
  const getInitialStep = (): SignupStep => {
    try {
      const saved = sessionStorage.getItem(ONBOARDING_STEP_KEY) as SignupStep | null
      if (saved && saved.startsWith('onboarding-')) return saved
    } catch { /* ignore */ }
    return 'form'
  }

  const [currentStep, setCurrentStepRaw] = useState<SignupStep>(getInitialStep)

  // Wrap setCurrentStep to persist onboarding steps to sessionStorage
  const setCurrentStep = (step: SignupStep) => {
    setCurrentStepRaw(step)
    try {
      if (step.startsWith('onboarding-')) {
        sessionStorage.setItem(ONBOARDING_STEP_KEY, step)
      } else {
        // Clear when leaving onboarding (form, verification, etc.)
        sessionStorage.removeItem(ONBOARDING_STEP_KEY)
      }
    } catch { /* ignore */ }
  }
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: ''
  })
  const [otpData, setOtpData] = useState({
    code: '',
    expiryTime: 0, // 15 mins
    resendCooldown: 0, // 60s
    developmentOtp: ''
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const isLoading = isVerifying || isResending
  const [showPassword, setShowPassword] = useState(false)
  const [passwordStrength, setPasswordStrength] = useState(0)
  const [passwordRequirements, setPasswordRequirements] = useState({
    length: false,
    uppercase: false,
    lowercase: false,
    number: false,
    special: false,
    typesCount: 0
  })
  const [userExistsModal, setUserExistsModal] = useState<UserExistsModal>({ show: false, email: '' })
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const [isCompletingOnboarding, setIsCompletingOnboarding] = useState(false)
  const [createdFirebaseUser, setCreatedFirebaseUser] = useState<any>(null)

  // OAuth error handling state
  const [oauthError, setOauthError] = useState<ReturnType<typeof parseOAuthError>>(null)
  const [showOAuthSuccess, setShowOAuthSuccess] = useState(false)

  // Onboarding form data (same questions as existing OnboardingFlow)
  const [onboardingData, setOnboardingData] = useState({
    // Step 1: Profile (fullName already in formData)
    role: '',
    companyName: '',
    companySize: '',
    // Step 2: Goals
    primaryGoals: [] as string[],
    currentChallenges: '',
    monthlyBudget: '',
    // Step 3: Platforms
    platforms: [] as string[],
    contentTypes: [] as string[],
    postingFrequency: '',
    contentNiche: '',
    // Step 4: Plan
    selectedPlan: 'free'
  })

  const { toast } = useToast()
  const { user, loading: authLoading } = useFirebaseAuth()
  const [, setLocation] = useLocation()

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const email = urlParams.get('email')
    if (email && isValidEmail(email)) {
      setFormData(prev => ({ ...prev, email }))
    }

    // Check for OAuth errors on mount
    const error = parseOAuthError(urlParams)
    const hasOAuthSuccess = checkOAuthSuccess(urlParams)
    
    if (error) {
      setOauthError(error)
      // Reset Google loading state when returning from failed OAuth
      setIsGoogleLoading(false)
      toast({
        title: 'Authentication Failed',
        description: error.userMessage,
        variant: 'destructive',
      })
    }

    // If no OAuth success or error params, reset Google loading state
    // This handles the case where user cancels/closes Google sign-in window
    if (!hasOAuthSuccess && !error) {
      setIsGoogleLoading(false)
    }

    // Check for OAuth success - now with session token exchange
    if (hasOAuthSuccess) {
      setShowOAuthSuccess(true)
      setIsGoogleLoading(true)
      
      // Exchange the HTTP-only cookie for a Firebase custom token
      const exchangeSession = async () => {
        try {
          console.log('[OAuth SignUp] Exchanging session token...')
          const response = await fetch('/api/auth/session', {
            method: 'GET',
            credentials: 'include', // Include cookies
          })
          
          if (!response.ok) {
            throw new Error('Failed to get custom token')
          }
          
          const data = await response.json()
          console.log('[OAuth SignUp] Received custom token of length:', data.customToken?.length)
          
          if (!data.customToken) {
            throw new Error('MISSING_CUSTOM_TOKEN')
          }
          
          // Import signInWithCustomToken
          const { signInWithCustomToken } = await import('firebase/auth')
          
          // Sign in with the custom token
          console.log('[OAuth SignUp] Signing in with custom token...')
          await signInWithCustomToken(auth, data.customToken)
          
          console.log('[OAuth SignUp] Firebase sign-in successful')
          toast({
            title: 'Success!',
            description: 'Signed up with Google successfully',
          })
          
          // Clear OAuth success state
          clearOAuthSuccess()
          
          // Don't manually redirect - App.tsx will automatically show AuthenticatedApp
          // when the useFirebaseAuth hook detects the user change
          console.log('[OAuth SignUp] Sign-up complete, auth state will propagate automatically')
          
        } catch (error: any) {
          console.error('[OAuth SignUp] Session exchange failed:', error)
          toast({
            title: 'Authentication Error',
            description: error.message || 'Failed to complete sign-up',
            variant: 'destructive',
          })
          setShowOAuthSuccess(false)
          setIsGoogleLoading(false)
          
          // Show the error to the user
          const errorMessage = error.message === 'MISSING_CUSTOM_TOKEN' 
            ? 'Session token not found. Please try signing up again.'
            : 'Failed to complete authentication. Please try again.'
            
          setOauthError({
            code: 'session_exchange_failed',
            message: errorMessage,
            userMessage: errorMessage,
            severity: 'error',
            canRetry: true,
          })
        }
      }
      
      exchangeSession()
    }

    // Restore form data if user is returning from OAuth (Requirement 19.6)
    const restored = restoreFormData()
    if (restored) {
      setFormData(prev => ({ ...prev, ...restored }))
    }
  }, [])

  // Add visibility change listener to reset loading state if user returns without OAuth params
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const urlParams = new URLSearchParams(window.location.search)
        const hasOAuthParams = checkOAuthSuccess(urlParams) || parseOAuthError(urlParams)
        
        // If page becomes visible without OAuth params, reset Google loading
        if (!hasOAuthParams) {
          setIsGoogleLoading(false)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  // Persistence Keys
  const STORAGE_KEY_FORM = 'signup_form_data_v1'
  const STORAGE_KEY_STATE = 'signup_state_v1'

  // Load persisted state on mount
  useEffect(() => {
    try {
      // 1. Restore Form Data (Draft)
      const savedForm = localStorage.getItem(STORAGE_KEY_FORM)
      if (savedForm) {
        const parsed = JSON.parse(savedForm)
        setFormData(prev => ({ ...prev, ...parsed }))
      }

      // 2. Restore Flow State (OTP Step)
      const savedState = localStorage.getItem(STORAGE_KEY_STATE)
      if (savedState) {
        const { step, email, timestamp, developmentOtp } = JSON.parse(savedState)
        const now = Date.now()
        const EXPIRY_MS = 15 * 60 * 1000 // 15 Minutes

        if (step === 'verification' && (now - timestamp < EXPIRY_MS)) {
          setFormData(prev => ({ ...prev, email: email }))
          setCurrentStep('verification')
          const elapsedSeconds = Math.floor((now - timestamp) / 1000)

          setOtpData(prev => ({
            ...prev,
            expiryTime: Math.max(0, 900 - elapsedSeconds),
            resendCooldown: Math.max(0, 60 - elapsedSeconds),
            developmentOtp: developmentOtp || ''
          }))
        } else {
          localStorage.removeItem(STORAGE_KEY_STATE)
        }
      }
    } catch (e) {
      console.warn('Failed to load signup state', e)
    }
  }, [])

  // Save Form Data on Change
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Security: Exclude password fields from persistence
      const { password, ...dataToSave } = formData
      localStorage.setItem(STORAGE_KEY_FORM, JSON.stringify(dataToSave))
    }, 500) // Debounce save
    return () => clearTimeout(timeoutId)
  }, [formData])

  // Clear Storage Helper
  const clearSignupStorage = () => {
    localStorage.removeItem(STORAGE_KEY_FORM)
    localStorage.removeItem(STORAGE_KEY_STATE)
  }

  // Switch account: a user who started but didn't finish onboarding may want to
  // sign up with a DIFFERENT account. Because the app forces any logged-in
  // not-onboarded user back into the resume flow, the only way to start fresh is
  // to FULLY sign out the current incomplete account first — this means clearing
  // BOTH the Firebase client session AND the server-side HTTP-only auth cookie.
  // If we only sign out of Firebase, the server cookie survives, /api/user keeps
  // returning the not-onboarded user, and the gate bounces us back to
  // /signup?resume=true.
  const [isSwitchingAccount, setIsSwitchingAccount] = useState(false)
  const handleUseDifferentAccount = async () => {
    if (isSwitchingAccount) return
    setIsSwitchingAccount(true)

    clearSignupStorage()
    try {
      localStorage.removeItem('isOnboarded')
    } catch {
      // ignore storage errors (private mode, etc.)
    }

    // 1. Clear the server-side session cookie so /api/user no longer authenticates
    //    this user. Must complete (or fail) before we redirect.
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
    } catch (serverErr) {
      console.error('[AUTH] Server-side logout failed during account switch:', serverErr)
    }

    // 2. Sign out of Firebase (clears the persisted client auth session).
    try {
      await auth.signOut()
    } catch (err) {
      console.error('[AUTH] Firebase sign-out failed during account switch:', err)
    }

    // 3. Wipe ALL per-user client state (centralized) and broadcast logout to
    //    other tabs, then hard-reload a clean /signup so all in-memory auth/query
    //    state resets and no stale resume param or previous-account data remains.
    try {
      clearClientSessionState()
      localStorage.setItem('veefore_logout', String(Date.now()))
    } catch {
      // ignore
    }
    window.location.href = '/signup'
  }

  useEffect(() => {
    let interval: NodeJS.Timeout
    if (currentStep === 'verification') {
      const updateTimer = () => {
        const savedState = localStorage.getItem(STORAGE_KEY_STATE)
        if (savedState) {
          const { timestamp } = JSON.parse(savedState)
          const now = Date.now()
          const elapsedSeconds = Math.floor((now - timestamp) / 1000)

          setOtpData(prev => ({
            ...prev,
            expiryTime: Math.max(0, 900 - elapsedSeconds),
            resendCooldown: Math.max(0, 60 - elapsedSeconds)
          }))
        }
      }

      // Initial update
      updateTimer()

      // Update every second
      interval = setInterval(updateTimer, 1000)
    }
    return () => clearInterval(interval)
  }, [currentStep])

  // Update password strength on change
  useEffect(() => {
    if (formData.password) {
      const { strength, requirements } = validatePassword(formData.password)
      setPasswordStrength(strength)
      setPasswordRequirements(requirements)
    } else {
      setPasswordStrength(0)
      setPasswordRequirements({
        length: false,
        uppercase: false,
        lowercase: false,
        number: false,
        special: false,
        typesCount: 0
      })
    }
  }, [formData.password])

  // Redirect to signin with prefilled email
  const handleRedirectToSignIn = () => {
    setUserExistsModal({ show: false, email: '' })
    setLocation(`/signin?email=${encodeURIComponent(userExistsModal.email)}`)
  }

  // Handle OAuth retry
  const handleOAuthRetry = () => {
    clearOAuthError()
    setOauthError(null)
    // Preserve form data before initiating OAuth (Requirement 19.6)
    preserveFormData(formData)
    setIsGoogleLoading(true)
    window.location.href = import.meta.env.VITE_OAUTH_START_URL || `${import.meta.env.VITE_API_BASE_URL}/api/auth/google/start`
  }

  // Handle dismissing OAuth error
  const handleDismissOAuthError = () => {
    clearOAuthError()
    setOauthError(null)
  }

  // If user is already authenticated, check if they need to complete onboarding
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const isResuming = urlParams.get('resume') === 'true'
    const authorizedBrandCount = urlParams.get('authorizedBrandCount')
    const metaError = urlParams.get('meta_error')
    // Returned from Meta OAuth callback — go to (or stay on) onboarding-connect-meta
    const isMetaCallback = authorizedBrandCount !== null || metaError !== null

    if (user && !currentStep.startsWith('onboarding-')) {
      if (isMetaCallback) {
        // Returned from Meta OAuth — the OnboardingConnectMeta component will
        // read authorizedBrandCount from the URL and handle the import flow.
        console.log('[ONBOARDING] Meta OAuth callback return, setting connect-meta step')
        setCreatedFirebaseUser(user)
        setCurrentStep('onboarding-connect-meta')
      } else if (isResuming) {
        // Check if user is already onboarded before showing the onboarding form.
        // This handles the case where the server redirected to /signup?resume=true
        // based on stale data, but the DB actually has isOnboarded: true.
        ;(async () => {
          try {
            const token = await user.getIdToken()
            const res = await fetch('/api/user', {
              headers: { Authorization: `Bearer ${token}` },
              credentials: 'include',
            })
            if (res.ok) {
              const data = await res.json()
              // Handle both response shapes
              const userRecord = data?.data?.user ?? data?.data ?? data?.user ?? data
              if (userRecord?.isOnboarded === true) {
                console.log('[ONBOARDING] User is already onboarded, redirecting to dashboard')
                // Use client-side navigation to avoid a hard reload which would
                // reset all state and potentially cause a brief isOnboarded=false flash
                setLocation('/')
                return
              }
              // Autofill the name for the onboarding form
              const serverName = data?.displayName || data?.data?.displayName || userRecord?.displayName
              if (serverName?.trim()) {
                setFormData(prev => (prev.fullName ? prev : { ...prev, fullName: serverName.trim() }))
              } else if (user.email) {
                setFormData(prev => (prev.fullName ? prev : { ...prev, fullName: user.email!.split('@')[0] }))
              }
            } else if (user.email) {
              setFormData(prev => (prev.fullName ? prev : { ...prev, fullName: user.email!.split('@')[0] }))
            }
          } catch {
            if (user.email) {
              setFormData(prev => (prev.fullName ? prev : { ...prev, fullName: user.email!.split('@')[0] }))
            }
          }
          // User needs to complete onboarding
          console.log('[ONBOARDING] Resuming onboarding for authenticated user')
          setCreatedFirebaseUser(user)
          setCurrentStep('onboarding-profile')
        })()
      } else {
        // User is fully authenticated and doesn't need onboarding - redirect to dashboard
        window.location.href = '/'
      }
    }
  }, [user, currentStep])

  // Show loading when authenticated user is being redirected (only if not resuming)
  const urlParams = new URLSearchParams(window.location.search)
  const isResuming = urlParams.get('resume') === 'true'
  const _authorizedBrandCount = urlParams.get('authorizedBrandCount')
  const _metaError = urlParams.get('meta_error')
  const isMetaOAuthReturn = _authorizedBrandCount !== null || _metaError !== null
  if (user && !currentStep.startsWith('onboarding-') && !isResuming && !isMetaOAuthReturn) {
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
          <motion.h1
            className="text-3xl font-bold text-white mb-4"
          >
            Redirecting...
          </motion.h1>
          <p className="text-white/60 text-lg">Taking you to your dashboard</p>
        </motion.div>
      </div>
    )
  }

  // RESUME GUARD: When we arrive at /signup?resume=true (e.g. straight after the
  // Google OAuth callback), the Firebase session is still being restored from the
  // auth cookie — `user` is briefly null even though a valid session exists. Show
  // a loader during this window instead of flashing the public signup FORM, and
  // keep showing it until the resume effect switches currentStep to onboarding.
  //
  // Conditions (only while still on the 'form' step):
  //  - authLoading: session restore in progress -> loader.
  //  - user truthy: session restored, the resume effect is about to switch to the
  //    onboarding step -> loader (avoids a 1-frame form flash).
  //  - authLoading false AND no user: genuinely logged out (e.g. user typed the
  //    URL) -> fall through and show the normal signup form.
  if ((isResuming || isMetaOAuthReturn) && currentStep === 'form' && (authLoading || !!user)) {
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
            Setting things up…
          </motion.h1>
          <p className="text-white/60 text-lg">Preparing your onboarding</p>
        </motion.div>
      </div>
    )
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  // Enterprise-level form validation
  const validateForm = async (): Promise<boolean> => {
    const newErrors: Record<string, string> = {}

    // Validate name
    const nameValidation = validateName(formData.fullName)
    if (!nameValidation.valid) {
      newErrors.fullName = nameValidation.error!
    }

    // Validate email format
    const emailValidation = validateEmailComplete(formData.email)
    if (!emailValidation.valid) {
      newErrors.email = emailValidation.error!
    }

    // Validate password
    const passwordValidation = validatePassword(formData.password)
    if (!passwordValidation.valid) {
      newErrors.password = passwordValidation.error!
    }

    // If there are format errors, return early
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return false
    }

    // Check if user already exists (before sending verification)
    setIsCheckingEmail(true)
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)

      const response = await fetch(
        `/api/auth/check-email-exists?email=${encodeURIComponent(formData.email.trim().toLowerCase())}`,
        { signal: controller.signal }
      )

      clearTimeout(timeoutId)

      if (response.ok) {
        const data = await response.json()
        // API returns wrapped response: { success: true, data: { exists: true, ... } }
        if (data.data?.exists) {
          // Show user-friendly popup
          setUserExistsModal({ show: true, email: formData.email.trim().toLowerCase() })
          setIsCheckingEmail(false)
          return false
        }
      } else if (response.status === 429) {
        newErrors.email = 'Too many requests. Please wait a moment and try again.'
        setErrors(newErrors)
        setIsCheckingEmail(false)
        return false
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Timeout - allow to proceed but warn
        console.warn('Email check timed out, proceeding anyway')
      } else {
        console.error('Email check failed:', error)
        // Don't block signup on network error, backend will validate again
      }
    }
    setIsCheckingEmail(false)

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()

    try {
      setIsResending(true) // Show loading immediately to prevent freeze feeling

      // Validation is async (checks backend), so we need loading state active
      const isValid = await validateForm()

      if (!isValid) {
        setIsResending(false) // Reset if validation fails
        return
      }

      const response = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase(),
          firstName: formData.fullName.trim().split(' ')[0]
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Log the error for debugging
        console.log('[EARLY ACCESS] Error response:', { status: response.status, data })

        // Handle early access errors (403 Forbidden)
        if (response.status === 403) {
          const errorCode = data.error?.code || data.code
          const errorMessage = data.error?.message || data.message

          console.log('[EARLY ACCESS] Parsed error:', { errorCode, errorMessage })

          switch (errorCode) {
            case 'NOT_ON_WAITLIST':
              setErrors({ 
                email: '🚫 Access Denied - This email isn\'t on our waitlist yet. Join us at veefore.com/waitlist!' 
              })
              toast({
                title: "Join Our Waitlist First",
                description: "Sign up for early access at veefore.com/waitlist to get started.",
                variant: "destructive",
              })
              setIsResending(false)
              return
              
            case 'PENDING_APPROVAL':
              setErrors({ 
                email: '⏳ Almost There! Your application is under review. We\'ll email you once approved (usually 24-48 hours).' 
              })
              toast({
                title: "Hang Tight!",
                description: "We're reviewing your application. Check your email for updates!",
                variant: "default",
              })
              setIsResending(false)
              return
              
            case 'ACCESS_REJECTED':
              setErrors({ 
                email: '😔 Unfortunately, your application wasn\'t approved this time. Contact support@veefore.com for details.' 
              })
              toast({
                title: "Application Not Approved",
                description: "Reach out to support@veefore.com for more information.",
                variant: "destructive",
              })
              setIsResending(false)
              return
              
            case 'INVALID_STATUS':
              setErrors({ 
                email: '⚠️ There\'s an issue with your account status. Contact support@veefore.com for help.' 
              })
              toast({
                title: "Account Status Issue",
                description: "Our support team can help resolve this. Email support@veefore.com",
                variant: "destructive",
              })
              setIsResending(false)
              return
              
            default:
              setErrors({ 
                email: '🔒 Early Access Required - This product is invite-only. Join our waitlist to get access!' 
              })
              toast({
                title: "Early Access Required",
                description: "Visit veefore.com/waitlist to request access.",
                variant: "destructive",
              })
              setIsResending(false)
              return
          }
        }

        // Handle other errors
        if (data.userExists && data.shouldSignIn) {
          setUserExistsModal({ show: true, email: formData.email.trim().toLowerCase() })
          setIsResending(false)
          return
        }
        throw new Error(data.message || 'Failed to send verification email')
      }

      setOtpData({
        code: '',
        expiryTime: 900,
        resendCooldown: 60,
        developmentOtp: data.developmentOtp || ''
      })

      setCurrentStep('verification')

      toast({
        title: "Verification email sent!",
        description: `Please check your email at ${formData.email} for the verification code.`,
      })

      if (data.developmentOtp) {
        console.log('Development OTP:', data.developmentOtp)
        toast({
          title: "Development Mode",
          description: `OTP: ${data.developmentOtp}`,
          variant: "default",
        })
      }

      // Save State for Persistence
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify({
        step: 'verification',
        email: formData.email.trim().toLowerCase(),
        timestamp: Date.now(),
        developmentOtp: data.developmentOtp
      }))

    } catch (error: any) {
      console.error('❌ Send OTP error:', error)
      setErrors({ email: error.message })
    } finally {
      setIsResending(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!otpData.code || otpData.code.length !== 6) {
      setErrors({ otp: 'Please enter the 6-digit verification code' })
      return
    }

    setIsVerifying(true)
    setErrors(prev => ({ ...prev, otp: '' })) // Clear previous errors

    try {
      const verifyResponse = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase(), // Normalize to match signup
          code: otpData.code
        })
      })

      const verifyData = await verifyResponse.json()

      if (!verifyResponse.ok) {
        // Parse nested error object from BaseController
        const message = verifyData.error?.message || verifyData.message || 'Verification failed'
        throw new Error(message)
      }

      // CRITICAL: Validate early access BEFORE creating Firebase user
      // This prevents creating users that will be immediately rejected
      console.log('[EARLY ACCESS] Pre-validation check before Firebase user creation')
      
      const preValidationResponse = await fetch('/api/auth/check-early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase()
        })
      })

      if (!preValidationResponse.ok) {
        const preValidationData = await preValidationResponse.json()
        
        if (preValidationResponse.status === 403) {
          const errorCode = preValidationData.error?.code || preValidationData.code
          const errorMessage = preValidationData.error?.message || preValidationData.message
          
          console.log('[EARLY ACCESS] Pre-validation failed:', { errorCode, errorMessage })
          
          switch (errorCode) {
            case 'NOT_ON_WAITLIST':
              setErrors({ 
                otp: '🚫 Access Denied - This email isn\'t on our waitlist. Join at veefore.com/waitlist to get started!' 
              })
              toast({
                title: "Join Our Waitlist First",
                description: "Sign up for early access at veefore.com/waitlist.",
                variant: "destructive",
              })
              throw new Error('NOT_ON_WAITLIST')
              
            case 'PENDING_APPROVAL':
              setErrors({ 
                otp: '⏳ Almost There! Your application is under review. We\'ll email you once approved (usually 24-48 hours).' 
              })
              toast({
                title: "Hang Tight!",
                description: "We're reviewing your application. Check your email for updates!",
                variant: "default",
              })
              throw new Error('PENDING_APPROVAL')
              
            case 'ACCESS_REJECTED':
              setErrors({ 
                otp: '😔 Unfortunately, your application wasn\'t approved this time. Contact support@veefore.com for details.' 
              })
              toast({
                title: "Application Not Approved",
                description: "Reach out to support@veefore.com for more information.",
                variant: "destructive",
              })
              throw new Error('ACCESS_REJECTED')
              
            case 'INVALID_STATUS':
              setErrors({ 
                otp: '⚠️ There\'s an issue with your account status. Contact support@veefore.com for help.' 
              })
              toast({
                title: "Account Status Issue",
                description: "Our support team can help resolve this. Email support@veefore.com",
                variant: "destructive",
              })
              throw new Error('INVALID_STATUS')
              
            default:
              setErrors({ 
                otp: '🔒 Early Access Required - This product is invite-only. Join our waitlist to get access!' 
              })
              toast({
                title: "Early Access Required",
                description: "Visit veefore.com/waitlist to request access.",
                variant: "destructive",
              })
              throw new Error(errorMessage || 'Early access validation failed')
          }
        }
        
        throw new Error('Validation check failed')
      }

      console.log('[EARLY ACCESS] Pre-validation passed - proceeding with Firebase user creation')

      // Only create Firebase user after early access validation passes
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password)
      console.log('✅ Firebase user created successfully:', userCredential.user.uid)

      // CRITICAL: Create backend session after Firebase user creation
      // This ensures the user has both Firebase auth AND backend session
      console.log('[SignUp] Creating backend session after Firebase user creation')
      try {
        const signinResponse = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email.trim().toLowerCase() })
        })

        if (!signinResponse.ok) {
          console.warn('[SignUp] Backend session creation failed, but continuing with signup')
        } else {
          console.log('[SignUp] Backend session created successfully')
        }
      } catch (sessionError) {
        console.warn('[SignUp] Backend session creation error:', sessionError)
        // Don't fail signup if session creation fails - user can still complete onboarding
      }

      const abortController = new AbortController()
      const timeoutId = setTimeout(() => abortController.abort(), 15000)

      try {
        const linkResponse = await fetch('/api/auth/link-firebase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email.trim().toLowerCase(), // Normalize
            firebaseUid: userCredential.user.uid,
            displayName: formData.fullName
          }),
          signal: abortController.signal
        })

        clearTimeout(timeoutId)

        // Enhanced early access error handling
        if (!linkResponse.ok) {
          const errorData = await linkResponse.json()
          
          // Handle early access specific errors with user-friendly messages
          if (linkResponse.status === 403) {
            const errorCode = errorData.error?.code || errorData.code
            const errorMessage = errorData.error?.message || errorData.message
            
            // CRITICAL: Delete the Firebase user we just created since backend validation failed
            // This prevents the user from being stuck in a partial auth state
            try {
              await userCredential.user.delete()
              console.log('[AUTH] Deleted Firebase user due to early access validation failure')
            } catch (deleteError) {
              console.error('[AUTH] Failed to delete Firebase user:', deleteError)
              // If delete fails, at least sign them out
              try {
                await auth.signOut()
                console.log('[AUTH] Signed out Firebase user instead')
              } catch (signOutError) {
                console.error('[AUTH] Failed to sign out:', signOutError)
              }
            }
            
            switch (errorCode) {
              case 'NOT_ON_WAITLIST':
                setErrors({ 
                  otp: '🚫 Access Denied - This email isn\'t on our waitlist. Join at veefore.com/waitlist to get started!' 
                })
                toast({
                  title: "Join Our Waitlist First",
                  description: "Sign up for early access at veefore.com/waitlist.",
                  variant: "destructive",
                })
                throw new Error('NOT_ON_WAITLIST')
                
              case 'PENDING_APPROVAL':
                setErrors({ 
                  otp: '⏳ Almost There! Your application is under review. We\'ll email you once approved (usually 24-48 hours).' 
                })
                toast({
                  title: "Hang Tight!",
                  description: "We're reviewing your application. Check your email for updates!",
                  variant: "default",
                })
                throw new Error('PENDING_APPROVAL')
                
              case 'ACCESS_REJECTED':
                setErrors({ 
                  otp: '😔 Unfortunately, your application wasn\'t approved this time. Contact support@veefore.com for details.' 
                })
                toast({
                  title: "Application Not Approved",
                  description: "Reach out to support@veefore.com for more information.",
                  variant: "destructive",
                })
                throw new Error('ACCESS_REJECTED')
                
              case 'INVALID_STATUS':
                setErrors({ 
                  otp: '⚠️ There\'s an issue with your account status. Contact support@veefore.com for help.' 
                })
                toast({
                  title: "Account Status Issue",
                  description: "Our support team can help resolve this. Email support@veefore.com",
                  variant: "destructive",
                })
                throw new Error('INVALID_STATUS')
                
              default:
                setErrors({ 
                  otp: '🔒 Early Access Required - This product is invite-only. Join our waitlist to get access!' 
                })
                toast({
                  title: "Early Access Required",
                  description: "Visit veefore.com/waitlist to request access.",
                  variant: "destructive",
                })
                throw new Error(errorMessage || 'Early access validation failed')
            }
          }
          
          throw new Error('Failed to complete account setup')
        }

        toast({
          title: "Email verified!",
          description: "Just a few more steps to set up your account.",
        })

        // Store the Firebase user for later onboarding API calls
        setCreatedFirebaseUser(userCredential.user)
        clearSignupStorage()

        // Transition to onboarding instead of redirecting
        setCurrentStep('onboarding-profile')

      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        if (fetchError.name === 'AbortError') throw new Error('timeout')
        throw fetchError
      }

    } catch (error: any) {
      console.error('❌ Verification error:', error)
      setCurrentStep('verification') // Ensure we look like we are on verification step

      // CRITICAL: Don't override friendly error messages already set for early access errors
      // These errors already have user-friendly messages set via setErrors() above
      const earlyAccessErrors = ['NOT_ON_WAITLIST', 'PENDING_APPROVAL', 'ACCESS_REJECTED', 'INVALID_STATUS']
      
      if (earlyAccessErrors.includes(error.message)) {
        // Error message already set with setErrors() - just return without overriding
        console.log('[EARLY ACCESS] Preserving friendly error message for:', error.message)
        return
      }

      let errorMessage = 'Verification failed. Please try again.'
      let toastTitle = "Verification Failed"

      // Specific error mapping
      if (error.message.includes('expired')) {
        errorMessage = 'This code has expired. Please request a new one.'
      } else if (error.message.includes('Invalid verification code') || error.message.includes('invalid')) {
        errorMessage = 'Incorrect code. Please check and try again.'
      } else if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists.'
      } else if (error.message === 'timeout') {
        errorMessage = 'Request timed out. Please check your connection.'
        toastTitle = "Timeout"
      }

      setErrors({ otp: errorMessage })
      toast({
        title: toastTitle,
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsVerifying(false)
    }
  }

  const handleResendOtp = async () => {
    if (otpData.resendCooldown > 0) return

    setIsResending(true)
    setErrors(prev => ({ ...prev, otp: '' })) // Clear errors on resend

    try {
      const response = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          firstName: formData.fullName.split(' ')[0]
        })
      })

      const data = await response.json()

      if (response.ok) {
        setOtpData({
          code: '',
          expiryTime: 900,
          resendCooldown: 60,
          developmentOtp: data.developmentOtp || ''
        })

        toast({
          title: "New code sent!",
          description: "Please check your email inbox.",
        })

        // Update Persistence Timestamp
        localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify({
          step: 'verification',
          email: formData.email,
          timestamp: Date.now(),
          developmentOtp: data.developmentOtp
        }))
      } else {
        throw new Error(data.message || 'Failed to resend code')
      }
    } catch (error: any) {
      toast({
        title: "Resend Failed",
        description: error.message || "Could not resend verification code.",
        variant: "destructive",
      })
    } finally {
      setIsResending(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // ============================================
  // ONBOARDING STEP HELPERS
  // ============================================

  const handleOnboardingInputChange = (field: string, value: any) => {
    setOnboardingData(prev => ({ ...prev, [field]: value }))
  }

  const handleArrayToggle = (field: string, value: string) => {
    setOnboardingData(prev => ({
      ...prev,
      [field]: (prev[field as keyof typeof prev] as string[]).includes(value)
        ? (prev[field as keyof typeof prev] as string[]).filter(item => item !== value)
        : [...(prev[field as keyof typeof prev] as string[]), value]
    }))
  }

  const isOnboardingStepValid = () => {
    switch (currentStep) {
      case 'onboarding-profile':
        return onboardingData.role !== ''
      case 'onboarding-goals':
        return onboardingData.primaryGoals.length > 0
      case 'onboarding-platforms':
        return onboardingData.platforms.length > 0 && onboardingData.contentNiche !== ''
      case 'onboarding-plan':
        return onboardingData.selectedPlan !== ''
      default:
        return true
    }
  }

  const handleOnboardingNext = () => {
    switch (currentStep) {
      case 'onboarding-profile':
        setCurrentStep('onboarding-goals')
        break
      case 'onboarding-goals':
        setCurrentStep('onboarding-platforms')
        break
      case 'onboarding-platforms':
        setCurrentStep('onboarding-plan')
        break
      case 'onboarding-plan':
        // After plan selection, proceed to Meta connection step
        setCurrentStep('onboarding-connect-meta')
        break
    }
  }

  const handleOnboardingPrev = () => {
    switch (currentStep) {
      case 'onboarding-goals':
        setCurrentStep('onboarding-profile')
        break
      case 'onboarding-platforms':
        setCurrentStep('onboarding-goals')
        break
      case 'onboarding-plan':
        setCurrentStep('onboarding-platforms')
        break
    }
  }

  const handleCompleteOnboarding = async () => {
    if (isCompletingOnboarding) return
    setIsCompletingOnboarding(true)

    try {
      // Get auth token from the created Firebase user
      const authToken = await createdFirebaseUser?.getIdToken()

      if (!authToken) {
        throw new Error('No authentication token available')
      }

      const response = await fetch('/api/user/complete-onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          preferences: {
            fullName: formData.fullName,
            ...onboardingData
          }
        })
      })

      if (!response.ok) {
        throw new Error('Failed to complete onboarding')
      }

      toast({
        title: "Welcome to VeeFore! 🎉",
        description: "Your account is ready. Let's grow your social presence!",
      })

      // Full page reload to ensure Firebase auth state is synced
      await new Promise(resolve => setTimeout(resolve, 500))
      window.location.href = '/'

    } catch (error: any) {
      console.error('Failed to complete onboarding:', error)
      toast({
        title: "Onboarding Failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsCompletingOnboarding(false)
    }
  }

  // Get onboarding step number for progress indicator
  // onboarding-connect-meta and onboarding-brand-selection are both part of
  // "Step 5: Connect Meta" — brand-selection is a sub-step, not a new step.
  const getOnboardingStepNumber = () => {
    switch (currentStep) {
      case 'onboarding-profile': return 1
      case 'onboarding-goals': return 2
      case 'onboarding-platforms': return 3
      case 'onboarding-plan': return 4
      case 'onboarding-connect-meta': return 5
      case 'onboarding-brand-selection': return 5  // same step as connect-meta
      default: return 0
    }
  }

  const TOTAL_ONBOARDING_STEPS = 5

  return (
    <div className="fixed inset-0 flex w-full bg-black overflow-hidden lg:relative lg:min-h-screen">
      {/* Full-screen overlay while switching accounts. Keeps the transition clean
          (no inline "Signing out…" text swap) until the page reloads to a fresh
          signup. */}
      {isSwitchingAccount && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-teal-400 animate-spin" />
            <p className="text-sm text-white/70">Switching account…</p>
          </div>
        </div>
      )}
      {/* Mobile-only atmospheric background */}
      <div className="lg:hidden absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-br from-teal-950/40 via-black to-emerald-950/30" />
        <motion.div
          className="absolute top-20 right-10 w-32 h-32 bg-teal-500/20 rounded-full blur-3xl"
          animate={{ y: [0, -20, 0], opacity: [0.2, 0.4, 0.2] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/3 left-0 w-40 h-40 bg-emerald-500/15 rounded-full blur-3xl"
          animate={{ x: [0, 20, 0], opacity: [0.15, 0.3, 0.15] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        />
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black via-black/50 to-transparent" />
      </div>

      {/* Left Side - Graphics Panel (OPPOSITE of SignIn) */}
      <SignUpGraphicsPanel />

      {/* Right Side - Form (OPPOSITE of SignIn) */}
      <div className="w-full lg:w-[45%] flex flex-col px-5 sm:px-6 md:px-12 lg:pr-24 lg:pl-16 xl:pr-28 xl:pl-20 relative z-10 min-h-screen">

        {/* Header - Fixed/Sticky or Top */}
        <div className="pt-6 sm:pt-8 lg:pt-12 pb-6 flex items-center justify-between lg:justify-end gap-3 sm:gap-4">
          <div className="lg:hidden flex items-center gap-3">
            <button
              onClick={() => setLocation('/')}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 border border-white/10"
            >
              <ArrowLeft className="w-4 h-4 text-white/70" />
            </button>
            <div className="flex items-center" onClick={() => setLocation('/')}>
              <img src="/veefore.svg" alt="V" className="w-8 h-8" />
              <span className="text-xl font-bold text-white -ml-1">eefore</span>
            </div>
          </div>

          {/* Desktop Logo/Home Button */}
          <div className="hidden lg:flex items-center gap-4">
            <button
              onClick={() => setLocation('/')}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-white/70" />
            </button>
            <div className="flex items-center cursor-pointer" onClick={() => setLocation('/')}>
              <img src="/veefore.svg" alt="V" className="w-9 h-9" />
              <span className="text-2xl font-bold text-white -ml-1">eefore</span>
            </div>
          </div>
        </div>

        {/* Main Content - Centered Vertically */}
        <div className="flex-1 flex flex-col justify-center w-full max-w-sm mx-auto lg:mx-0 lg:ml-auto">
          <AnimatePresence mode="wait">
            {currentStep === 'form' && (
              <motion.div
                key="form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4 py-4"
              >
                <div className="mb-2">
                  <div className="inline-flex items-center gap-2 bg-teal-500/10 border border-teal-500/20 rounded-full px-3 py-1.5 mb-4">
                    <span className="text-teal-400 text-xs font-medium">✨ Free Trial • No Credit Card</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Get Started Free</h2>
                  <p className="text-white/50 text-sm">Create your account in 30 seconds</p>
                </div>

                {/* OAuth Success Message - Requirement 19.4 */}
                {showOAuthSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3"
                  >
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-emerald-200">Success!</p>
                      <p className="text-xs text-emerald-300 mt-1">Signed up with Google successfully. Redirecting...</p>
                    </div>
                  </motion.div>
                )}

                {/* OAuth Error Display - Requirements 19.3 and 19.5 */}
                {oauthError && !showOAuthSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mb-4 p-4 rounded-lg flex items-start gap-3 ${getErrorColorClasses(oauthError.severity).bg} border ${getErrorColorClasses(oauthError.severity).border}`}
                  >
                    <div className={`mt-0.5 flex-shrink-0 ${getErrorColorClasses(oauthError.severity).icon}`}>
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${getErrorColorClasses(oauthError.severity).text}`}>
                        {oauthError.severity === 'error' ? 'Authentication Failed' : 
                         oauthError.severity === 'warning' ? 'Session Expired' : 'Information'}
                      </p>
                      <p className={`text-xs mt-1 ${getErrorColorClasses(oauthError.severity).text} opacity-90`}>
                        {oauthError.userMessage}
                      </p>
                      {/* Retry Button - Requirement 19.5 */}
                      {oauthError.canRetry && (
                        <button
                          onClick={handleOAuthRetry}
                          disabled={isGoogleLoading}
                          className={`mt-3 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                            oauthError.severity === 'error' 
                              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-200' 
                              : oauthError.severity === 'warning'
                              ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200'
                              : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-200'
                          } disabled:opacity-50`}
                        >
                          <RefreshCw className="w-3 h-3" />
                          {isGoogleLoading ? 'Retrying...' : 'Try Again'}
                        </button>
                      )}
                    </div>
                    <button
                      onClick={handleDismissOAuthError}
                      className={`transition-colors ${getErrorColorClasses(oauthError.severity).icon} hover:opacity-70`}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </motion.div>
                )}

                <form onSubmit={handleSendOtp} className="space-y-3">
                  {/* Full Name */}
                  <div className="space-y-1">
                    <label htmlFor="fullName" className="text-xs font-medium text-white/70 block">
                      Full Name <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2">
                        <User className={`w-4 h-4 ${errors.fullName ? 'text-red-400' : 'text-white/40'}`} />
                      </div>
                      <input
                        id="fullName"
                        type="text"
                        name="name"
                        autoComplete="name"
                        value={formData.fullName}
                        onChange={(e) => handleInputChange('fullName', e.target.value)}
                        placeholder="Your full name"
                        className="w-full h-11 pl-10 pr-3 rounded-md text-white text-base transition-all placeholder:text-white/30 bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/[0.08] outline-none"
                        disabled={isLoading || isCheckingEmail}
                        aria-invalid={!!errors.fullName}
                      />
                    </div>
                    {errors.fullName && <p className="text-red-400 text-xs mt-1 pl-1">{errors.fullName}</p>}
                  </div>

                  {/* Email */}
                  <div className="space-y-1">
                    <label htmlFor="email" className="text-xs font-medium text-white/70 block">
                      Email Address <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2">
                        <Mail className={`w-4 h-4 ${errors.email ? 'text-red-400' : 'text-white/40'}`} />
                      </div>
                      <input
                        id="email"
                        type="email"
                        name="email"
                        autoComplete="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="name@company.com"
                        className="w-full h-11 pl-10 pr-3 rounded-md text-white text-base transition-all placeholder:text-white/30 bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/[0.08] outline-none"
                        disabled={isLoading || isCheckingEmail}
                        aria-invalid={!!errors.email}
                      />
                    </div>
                    {errors.email && <p className="text-red-400 text-xs mt-1 pl-1">{errors.email}</p>}
                  </div>

                  {/* Password */}
                  <div className="space-y-1">
                    <label htmlFor="password" className="text-xs font-medium text-white/70 block">
                      Password <span className="text-red-400">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2">
                        <Lock className={`w-4 h-4 ${errors.password ? 'text-red-400' : 'text-white/40'}`} />
                      </div>
                      <input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        name="new-password"
                        autoComplete="new-password"
                        value={formData.password}
                        onChange={(e) => handleInputChange('password', e.target.value)}
                        placeholder="Create a strong password"
                        className="w-full h-11 pl-10 pr-10 rounded-md text-white text-base transition-all placeholder:text-white/30 bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/[0.08] outline-none"
                        disabled={isLoading || isCheckingEmail}
                        aria-invalid={!!errors.password}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Password Strength Indicator - Compact & Inline */}
                    <AnimatePresence>
                      {formData.password && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <div className="pt-2 space-y-2">
                            {/* Bars */}
                            <div className="flex gap-1 h-0.5">
                              {[1, 2, 3, 4, 5].map((level) => (
                                <div key={level} className={`flex-1 rounded-full ${passwordStrength >= level ? (passwordStrength <= 2 ? 'bg-red-500' : passwordStrength <= 4 ? 'bg-yellow-500' : 'bg-emerald-500') : 'bg-white/10'}`} />
                              ))}
                            </div>

                            {/* Mini Checklist */}
                            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                              <RequirementItem met={passwordRequirements.length} label="8+ Chars" />
                              <RequirementItem met={passwordRequirements.uppercase} label="Upper" />
                              <RequirementItem met={passwordRequirements.lowercase} label="Lower" />
                              <RequirementItem met={passwordRequirements.number} label="Number" />
                              <RequirementItem met={passwordRequirements.special} label="Special" />
                              <div className="text-[9px] text-white/30 col-span-2 pt-0.5">* Require 3 of 4 types</div>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {errors.password && <p className="text-red-400 text-xs mt-1 pl-1">{errors.password}</p>}
                  </div>

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={isLoading || isCheckingEmail}
                    className="w-full h-11 rounded-md bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:from-teal-600 hover:to-emerald-700 transition-all disabled:opacity-70 mt-2"
                  >
                    {isLoading || isCheckingEmail ? (
                      <><Loader2 className="w-5 h-5 animate-spin" /> {isCheckingEmail ? 'Checking...' : 'Sending code...'}</>
                    ) : (
                      <>
                        <Mail className="w-4 h-4" />
                        Send Verification Code
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                {/* Divider */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-white/10"></div>
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-black px-2 text-white/40">Or continue with</span>
                  </div>
                </div>

                {/* Google OAuth Button - Server-side OAuth Implementation
                    Requirements 19.1 (loading indicator) and 19.6 (preserve form data) */}
                <button
                  type="button"
                  onClick={() => {
                    // Preserve form data before OAuth initiation (Requirement 19.6)
                    preserveFormData(formData)
                    // Show loading state during redirect (Requirement 19.1)
                    setIsGoogleLoading(true)
                    // Redirect to server-side OAuth start endpoint
                    window.location.href = import.meta.env.VITE_OAUTH_START_URL || `${import.meta.env.VITE_API_BASE_URL}/api/auth/google/start`
                  }}
                  disabled={isGoogleLoading || isCheckingEmail || showOAuthSuccess}
                  className="w-full h-11 rounded-md bg-white text-gray-700 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors border border-gray-300 disabled:opacity-70"
                >
                  {isGoogleLoading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Redirecting to Google...</>
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Sign up with Google
                    </>
                  )}
                </button>

                <div className="pt-2">
                  <p className="text-center text-white/40 text-sm">
                    Already have an account? <span className="text-white hover:underline cursor-pointer" onClick={() => setLocation('/signin')}>Sign in</span>
                  </p>
                  <p className="text-center text-white/30 text-[10px] mt-2">
                    By signing up, you agree to our <span className="text-white/50 hover:underline cursor-pointer" onClick={() => setLocation('/terms-of-service')}>Terms</span> and <span className="text-white/50 hover:underline cursor-pointer" onClick={() => setLocation('/privacy-policy')}>Privacy Policy</span>
                  </p>
                </div>

                {/* User Exists Modal - Keep same */}
                <AnimatePresence>
                  {userExistsModal.show && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
                      onClick={() => setUserExistsModal({ show: false, email: '' })}
                    >
                      <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="bg-gray-900 rounded-2xl p-6 max-w-sm mx-4 border border-white/10 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="text-center">
                          <div className="w-16 h-16 bg-teal-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-teal-500/30">
                            <User className="w-8 h-8 text-teal-400" />
                          </div>
                          <h3 className="text-xl font-bold text-white mb-2">Welcome Back!</h3>
                          <p className="text-white/60 text-sm mb-4">
                            An account with <span className="text-white font-medium">{userExistsModal.email}</span> already exists.
                          </p>
                          <p className="text-white/40 text-xs mb-6">
                            Would you like to sign in instead?
                          </p>
                          <div className="space-y-3">
                            <button
                              onClick={handleRedirectToSignIn}
                              className="w-full h-11 rounded-md bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:from-teal-600 hover:to-emerald-700 transition-all"
                            >
                              <ArrowRight className="w-4 h-4" />
                              Go to Sign In
                            </button>
                            <button
                              onClick={() => setUserExistsModal({ show: false, email: '' })}
                              className="w-full h-11 rounded-md bg-white/5 border border-white/10 text-white/70 font-medium text-sm hover:bg-white/10 transition-all"
                            >
                              Use Different Email
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}

            {currentStep === 'verification' && (
              <motion.div
                key="verification"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-6 py-8"
              >
                <div className="text-center">
                  <div className="w-16 h-16 bg-teal-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-teal-500/30">
                    <Mail className="w-8 h-8 text-teal-400" />
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Check Your Email</h2>
                  <p className="text-white/50 text-sm">
                    We sent a verification code to<br />
                    <span className="text-white font-medium">{formData.email}</span>
                  </p>
                </div>

                <form onSubmit={handleVerifyOtp} className="space-y-5">
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={otpData.code}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                        setOtpData(prev => ({ ...prev, code: value }))
                        if (errors.otp) setErrors(prev => ({ ...prev, otp: '' }))
                      }}
                      placeholder="000000"
                      className="w-full h-14 rounded-md text-white text-3xl font-mono text-center tracking-[0.5em] transition-all bg-white/5 border border-white/10 focus:border-teal-500/50 focus:bg-white/[0.08] outline-none placeholder:tracking-widest placeholder:text-white/10"
                      maxLength={6}
                      disabled={isLoading}
                    />
                    {errors.otp && <p className="text-red-400 text-xs text-center">{errors.otp}</p>}
                  </div>

                  {process.env.NODE_ENV === 'development' && otpData.developmentOtp && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 text-center" onClick={() => setOtpData(prev => ({ ...prev, code: otpData.developmentOtp || '' }))}>
                      <div className="text-yellow-400 text-[10px] font-medium uppercase tracking-wider">Dev Mode OTP</div>
                      <div className="text-yellow-300 text-base font-mono font-bold tracking-widest cursor-pointer">{otpData.developmentOtp}</div>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-2 text-white/50 text-xs">
                    <Timer className="w-3 h-3" />
                    <span>Expires in {formatTime(otpData.expiryTime)}</span>
                  </div>

                  <button
                    type="submit"
                    disabled={isVerifying || otpData.code.length !== 6}
                    className="w-full h-11 rounded-md bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:from-teal-600 hover:to-emerald-700 transition-all disabled:opacity-70"
                  >
                    {isVerifying ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Verifying...</>
                    ) : 'Verify & Create Account'}
                  </button>

                  <div className="space-y-3 text-center">
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={otpData.resendCooldown > 0 || isResending}
                      className="text-teal-400 hover:text-teal-300 font-medium text-xs hover:underline disabled:opacity-50 disabled:no-underline disabled:hover:text-teal-400"
                    >
                      {isResending ? 'Sending...' : otpData.resendCooldown > 0 ? `Resend in ${formatTime(otpData.resendCooldown)}` : 'Resend code'}
                    </button>
                    <div>
                      <button
                        type="button"
                        onClick={() => {
                          clearSignupStorage()
                          setCurrentStep('form')
                        }}
                        className="text-white/40 hover:text-white/60 text-xs transition-colors"
                      >
                        ← Back to form
                      </button>
                    </div>
                  </div>
                </form>
              </motion.div>
            )}

            {/* Onboarding Steps */}
            {currentStep.startsWith('onboarding-') && (
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.3 }}
                className="space-y-4 py-4"
              >
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-white/60">Step {getOnboardingStepNumber()} of {TOTAL_ONBOARDING_STEPS}</span>
                    <span className="text-teal-400">{Math.round((getOnboardingStepNumber() / TOTAL_ONBOARDING_STEPS) * 100)}% complete</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${(getOnboardingStepNumber() / TOTAL_ONBOARDING_STEPS) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Step 1: Profile */}
                {currentStep === 'onboarding-profile' && (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 border border-teal-500/30">
                        <User className="w-6 h-6 text-teal-400" />
                      </div>
                      <h2 className="text-xl font-bold text-white mb-1">Tell us about yourself</h2>
                      <p className="text-sm text-white/50">Help us personalize your VeeFore experience</p>
                      <button
                        type="button"
                        onClick={handleUseDifferentAccount}
                        disabled={isSwitchingAccount}
                        className="mt-2 text-xs text-white/40 hover:text-teal-300 underline underline-offset-2 transition-colors disabled:opacity-50"
                      >
                        Use a different account
                      </button>
                    </div>

                    <div className="space-y-3">
                      {/* Full Name - prefilled from the signup/Google account, but editable */}
                      <div className="space-y-1">
                        <Label htmlFor="onboarding-full-name" className="text-xs font-medium text-white/70">Full Name</Label>
                        <Input
                          id="onboarding-full-name"
                          name="fullName"
                          type="text"
                          autoComplete="name"
                          value={formData.fullName}
                          onChange={(e) => handleInputChange('fullName', e.target.value)}
                          placeholder="Enter your full name"
                          aria-label="Full Name"
                          className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-teal-500/50"
                        />
                      </div>

                      {/* Role */}
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-white/70">Your Role *</Label>
                        <Select value={onboardingData.role} onValueChange={(value) => handleOnboardingInputChange('role', value)}>
                          <SelectTrigger className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white focus:border-teal-500/50">
                            <SelectValue placeholder="Select your role" />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg border border-white/10 bg-gray-900">
                            <SelectItem value="founder">Founder/CEO</SelectItem>
                            <SelectItem value="marketing-manager">Marketing Manager</SelectItem>
                            <SelectItem value="social-media-manager">Social Media Manager</SelectItem>
                            <SelectItem value="content-creator">Content Creator</SelectItem>
                            <SelectItem value="freelancer">Freelancer</SelectItem>
                            <SelectItem value="agency-owner">Agency Owner</SelectItem>
                            <SelectItem value="influencer">Influencer</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Company Name */}
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-white/70">Company/Brand Name</Label>
                        <Input
                          value={onboardingData.companyName}
                          onChange={(e) => handleOnboardingInputChange('companyName', e.target.value)}
                          placeholder="Enter your company name"
                          className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-teal-500/50"
                        />
                      </div>

                      {/* Company Size */}
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-white/70">Company Size</Label>
                        <Select value={onboardingData.companySize} onValueChange={(value) => handleOnboardingInputChange('companySize', value)}>
                          <SelectTrigger className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white focus:border-teal-500/50">
                            <SelectValue placeholder="Select company size" />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg border border-white/10 bg-gray-900">
                            <SelectItem value="solo">Just me</SelectItem>
                            <SelectItem value="2-10">2-10 employees</SelectItem>
                            <SelectItem value="11-50">11-50 employees</SelectItem>
                            <SelectItem value="51-200">51-200 employees</SelectItem>
                            <SelectItem value="200+">200+ employees</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Goals */}
                {currentStep === 'onboarding-goals' && (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 border border-blue-500/30">
                        <Target className="w-6 h-6 text-blue-400" />
                      </div>
                      <h2 className="text-xl font-bold text-white mb-1">What are your goals?</h2>
                      <p className="text-sm text-white/50">Help us understand what you want to achieve</p>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-white/70">Primary Goals *</Label>
                        <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                          {[
                            'Increase followers', 'Drive website traffic', 'Generate leads', 'Boost engagement',
                            'Build brand awareness', 'Increase sales', 'Save time on content', 'Improve content quality'
                          ].map((goal) => (
                            <label
                              key={goal}
                              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition-all ${onboardingData.primaryGoals.includes(goal)
                                ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300'
                                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                                }`}
                            >
                              <Checkbox
                                checked={onboardingData.primaryGoals.includes(goal)}
                                onCheckedChange={() => handleArrayToggle('primaryGoals', goal)}
                                className="rounded-sm border-white/20 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                              />
                              <span className="flex-1">{goal}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-white/70">Biggest challenge</Label>
                        <Textarea
                          value={onboardingData.currentChallenges}
                          onChange={(e) => handleOnboardingInputChange('currentChallenges', e.target.value)}
                          placeholder="Tell us your main challenges..."
                          rows={2}
                          className="px-3 py-2 text-sm rounded-lg bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-teal-500/50 resize-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-white/70">Monthly Budget</Label>
                        <Select value={onboardingData.monthlyBudget} onValueChange={(value) => handleOnboardingInputChange('monthlyBudget', value)}>
                          <SelectTrigger className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white focus:border-teal-500/50">
                            <SelectValue placeholder="Select budget range" />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg border border-white/10 bg-gray-900">
                            <SelectItem value="0-500">$0 - $500</SelectItem>
                            <SelectItem value="500-1000">$500 - $1,000</SelectItem>
                            <SelectItem value="1000-5000">$1,000 - $5,000</SelectItem>
                            <SelectItem value="5000-10000">$5,000 - $10,000</SelectItem>
                            <SelectItem value="10000+">$10,000+</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 3: Platforms */}
                {currentStep === 'onboarding-platforms' && (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 border border-emerald-500/30">
                        <Settings className="w-6 h-6 text-emerald-400" />
                      </div>
                      <h2 className="text-xl font-bold text-white mb-1">Your content strategy</h2>
                      <p className="text-sm text-white/50">Tell us about your social media preferences</p>
                    </div>

                    <div className="space-y-3">
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-white/70">Platforms you use *</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {['Instagram', 'Facebook', 'Twitter/X', 'LinkedIn', 'TikTok', 'YouTube'].map((platform) => (
                            <label
                              key={platform}
                              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition-all ${onboardingData.platforms.includes(platform)
                                ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300'
                                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                                }`}
                            >
                              <Checkbox
                                checked={onboardingData.platforms.includes(platform)}
                                onCheckedChange={() => handleArrayToggle('platforms', platform)}
                                className="rounded-sm border-white/20 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                              />
                              <span className="flex-1">{platform}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-white/70">Content Types</Label>
                        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                          {['Photos', 'Videos', 'Stories', 'Reels/Shorts', 'Carousels', 'Text posts'].map((type) => (
                            <label
                              key={type}
                              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition-all ${onboardingData.contentTypes.includes(type)
                                ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300'
                                : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                                }`}
                            >
                              <Checkbox
                                checked={onboardingData.contentTypes.includes(type)}
                                onCheckedChange={() => handleArrayToggle('contentTypes', type)}
                                className="rounded-sm border-white/20 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                              />
                              <span className="flex-1">{type}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-white/70">Posting Frequency</Label>
                        <Select value={onboardingData.postingFrequency} onValueChange={(value) => handleOnboardingInputChange('postingFrequency', value)}>
                          <SelectTrigger className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white focus:border-teal-500/50">
                            <SelectValue placeholder="Select posting frequency" />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg border border-white/10 bg-gray-900">
                            <SelectItem value="multiple-daily">Multiple times per day</SelectItem>
                            <SelectItem value="daily">Once per day</SelectItem>
                            <SelectItem value="few-weekly">Few times per week</SelectItem>
                            <SelectItem value="weekly">Once per week</SelectItem>
                            <SelectItem value="irregular">Irregular/as needed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-white/70">Your Niche *</Label>
                        <Select value={onboardingData.contentNiche} onValueChange={(value) => handleOnboardingInputChange('contentNiche', value)}>
                          <SelectTrigger className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white focus:border-teal-500/50">
                            <SelectValue placeholder="Select your content niche" />
                          </SelectTrigger>
                          <SelectContent className="rounded-lg border border-white/10 bg-gray-900">
                            <SelectItem value="tech">Tech & AI</SelectItem>
                            <SelectItem value="business">Business & Entrepreneurship</SelectItem>
                            <SelectItem value="marketing">Marketing & Social Media</SelectItem>
                            <SelectItem value="finance">Finance & Investing</SelectItem>
                            <SelectItem value="fitness">Fitness & Health</SelectItem>
                            <SelectItem value="food">Food & Cooking</SelectItem>
                            <SelectItem value="travel">Travel</SelectItem>
                            <SelectItem value="fashion">Fashion & Beauty</SelectItem>
                            <SelectItem value="lifestyle">Lifestyle</SelectItem>
                            <SelectItem value="education">Education</SelectItem>
                            <SelectItem value="entertainment">Entertainment</SelectItem>
                            <SelectItem value="gaming">Gaming</SelectItem>
                            <SelectItem value="real-estate">Real Estate</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-[10px] text-white/40 mt-1">Powers your AI recommendations, captions, insights and trend listening. You can change this later in Settings.</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 4: Plan */}
                {currentStep === 'onboarding-plan' && (
                  <div className="space-y-4">
                    <div className="text-center">
                      <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 border border-yellow-500/30">
                        <span className="text-xl">💎</span>
                      </div>
                      <h2 className="text-xl font-bold text-white mb-1">Choose your plan</h2>
                      <p className="text-sm text-white/50">You can upgrade anytime</p>
                    </div>

                    <div className="space-y-2">
                      {[
                        { id: 'free', name: 'Free', price: '$0', features: ['1 social account', '10 posts/month', 'Basic analytics'] },
                        { id: 'basic', name: 'Basic', price: '$19', features: ['3 accounts', '100 posts/month', 'Advanced analytics'], popular: false },
                        { id: 'pro', name: 'Pro', price: '$49', features: ['10 accounts', 'Unlimited posts', 'AI content', 'Team collab'], popular: true }
                      ].map((plan) => (
                        <div
                          key={plan.id}
                          onClick={() => handleOnboardingInputChange('selectedPlan', plan.id)}
                          className={`relative p-3 rounded-xl cursor-pointer transition-all ${onboardingData.selectedPlan === plan.id
                            ? 'bg-teal-500/20 border-2 border-teal-500'
                            : 'bg-white/5 border border-white/10 hover:bg-white/10'
                            }`}
                        >
                          {plan.popular && (
                            <div className="absolute -top-2 right-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                              Most Popular
                            </div>
                          )}
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${onboardingData.selectedPlan === plan.id ? 'border-teal-500 bg-teal-500' : 'border-white/30'
                                }`}>
                                {onboardingData.selectedPlan === plan.id && (
                                  <CheckCircle className="w-3 h-3 text-white" />
                                )}
                              </div>
                              <div>
                                <h4 className="text-sm font-semibold text-white">{plan.name}</h4>
                                <p className="text-xs text-white/40">{plan.features.join(' • ')}</p>
                              </div>
                            </div>
                            <span className="text-lg font-bold text-white">{plan.price}<span className="text-xs text-white/50">/mo</span></span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 5: Connect Meta */}
                {currentStep === 'onboarding-connect-meta' && (
                  <OnboardingConnectMeta
                    setCurrentStep={setCurrentStep}
                    createdFirebaseUser={createdFirebaseUser}
                  />
                )}

                {/* Step 6: Brand Selection (shown when N > 1 authorized pages) */}
                {currentStep === 'onboarding-brand-selection' && (
                  <OnboardingBrandSelection
                    createdFirebaseUser={createdFirebaseUser}
                  />
                )}

                {/* Navigation Buttons — hidden on Meta connection steps (they have their own CTAs) */}
                {currentStep !== 'onboarding-connect-meta' && currentStep !== 'onboarding-brand-selection' && (
                  <div className="flex items-center justify-between pt-4 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleOnboardingPrev}
                    disabled={currentStep === 'onboarding-profile'}
                    className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all ${currentStep === 'onboarding-profile'
                      ? 'text-white/20 cursor-not-allowed'
                      : 'text-white/60 hover:text-white hover:bg-white/10'
                      }`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleOnboardingNext}
                    disabled={!isOnboardingStepValid() || isCompletingOnboarding}
                    className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-all ${isOnboardingStepValid() && !isCompletingOnboarding
                      ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white hover:from-teal-600 hover:to-emerald-600'
                      : 'bg-white/10 text-white/30 cursor-not-allowed'
                      }`}
                  >
                    {isCompletingOnboarding ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Completing...
                      </>
                    ) : currentStep === 'onboarding-plan' ? (
                      <>
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
                )}
              </motion.div>
            )}

            {currentStep === 'creating' && (
              <motion.div
                key="creating"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-20"
              >
                <motion.div
                  className="w-20 h-20 border-4 border-teal-200/20 border-t-teal-500 rounded-full mx-auto mb-8"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                />
                <h1 className="text-2xl font-bold text-white mb-4">Creating Account...</h1>
                <p className="text-white/60">Setting up your workspace</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer - Relative now, pushed to bottom */}
        <div className="py-6 mt-auto flex justify-center lg:justify-end gap-6 text-[10px] text-white/20 uppercase tracking-widest font-medium">
          <span onClick={() => setLocation('/terms-of-service')} className="hover:text-white transition-colors cursor-pointer">Terms</span>
          <span onClick={() => setLocation('/privacy-policy')} className="hover:text-white transition-colors cursor-pointer">Privacy</span>
          <span onClick={() => setLocation('/security')} className="hover:text-white transition-colors cursor-pointer">Security</span>
        </div>
      </div>
    </div>
  )
}

export default SignUpIntegrated