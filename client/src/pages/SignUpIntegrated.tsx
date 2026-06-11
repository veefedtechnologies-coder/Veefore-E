import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Mail, Eye, EyeOff, User, Lock, ArrowRight, ArrowLeft, Loader2, Timer, Check, Target, Settings, CheckCircle, RefreshCw } from "lucide-react"
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth"
import { createUserWithEmailAndPassword } from "firebase/auth"
import { auth } from "@/lib/firebase"
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

// ============================================
// ENTERPRISE-LEVEL VALIDATION UTILITIES
// ============================================

// Strict email validation (matching waitlist standards)
const isValidEmail = (email: string): boolean => {
  // RFC 5322 compliant email regex - stricter than basic validation
  const emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/
  return emailRegex.test(email.toLowerCase().trim())
}

// Block disposable/temporary email providers
const isDisposableEmail = (email: string): boolean => {
  const disposableDomains = [
    'tempmail.com', 'throwaway.com', 'mailinator.com', 'guerrillamail.com',
    'temp-mail.org', 'fakeinbox.com', '10minutemail.com', 'trashmail.com',
    'getairmail.com', 'yopmail.com', 'sharklasers.com', 'spam4.me',
    'tempinbox.com', 'discard.email', 'mailnesia.com', 'maildrop.cc',
    'guerrillamail.org', 'guerrillamail.net', 'throwawaymail.com',
    'getnada.com', 'tempail.com', 'mohmal.com', 'emailondeck.com'
  ]
  const domain = email.split('@')[1]?.toLowerCase()
  return disposableDomains.includes(domain)
}

// Validate domain structure
const isValidDomain = (email: string): { valid: boolean; error?: string } => {
  const domain = email.split('@')[1]?.toLowerCase()
  if (!domain) return { valid: false, error: 'Invalid email format' }

  const domainParts = domain.split('.')
  const tld = domainParts[domainParts.length - 1]

  if (tld.length < 2 || tld.length > 10) {
    return { valid: false, error: 'Invalid domain extension' }
  }
  if (!/^[a-zA-Z]+$/.test(tld)) {
    return { valid: false, error: 'Invalid domain extension' }
  }
  if (domain.length < 4) {
    return { valid: false, error: 'Invalid domain name' }
  }

  return { valid: true }
}

// Name validation (enterprise standard)
const validateName = (name: string): { valid: boolean; error?: string } => {
  const trimmed = name.trim()

  if (!trimmed) {
    return { valid: false, error: 'Full name is required' }
  }
  if (trimmed.length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters' }
  }
  if (trimmed.length > 100) {
    return { valid: false, error: 'Name is too long (max 100 characters)' }
  }
  // Allow letters, spaces, hyphens, apostrophes (for real names like O'Connor, Mary-Jane)
  if (!/^[a-zA-ZÀ-ÿ\s'-]+$/.test(trimmed)) {
    return { valid: false, error: 'Name contains invalid characters' }
  }
  // Check for at least one letter
  if (!/[a-zA-ZÀ-ÿ]/.test(trimmed)) {
    return { valid: false, error: 'Name must contain at least one letter' }
  }

  return { valid: true }
}

// Password strength validation (enterprise standard)
const validatePassword = (password: string): {
  valid: boolean;
  error?: string;
  strength: number;
  requirements: {
    length: boolean;
    uppercase: boolean;
    lowercase: boolean;
    number: boolean;
    special: boolean;
    typesCount: number;
  }
} => {
  const requirements = {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(password),
    typesCount: 0
  }

  requirements.typesCount = [
    requirements.uppercase,
    requirements.lowercase,
    requirements.number,
    requirements.special
  ].filter(Boolean).length

  let strength = 0
  if (requirements.length) strength += 1
  if (requirements.typesCount >= 2) strength += 1
  if (requirements.typesCount >= 3) strength += 1
  if (requirements.typesCount === 4) strength += 1
  if (password.length >= 12) strength += 1

  // Normalize strength to 0-5 range for UI
  // 1: Weak, 2: Fair, 3: Good, 4: Strong, 5: Very Strong

  // Validation Logic
  if (!password) {
    return { valid: false, error: 'Password is required', strength: 0, requirements }
  }
  if (!requirements.length) {
    return { valid: false, error: 'Password must be at least 8 characters', strength: 1, requirements }
  }
  if (password.length > 128) {
    return { valid: false, error: 'Password is too long', strength: 1, requirements }
  }
  if (requirements.typesCount < 3) {
    return {
      valid: false,
      error: 'Password must include at least 3 types: uppercase, lowercase, number, special',
      strength: 2,
      requirements
    }
  }

  // Check for common patterns
  const commonPatterns = ['password', '12345678', 'qwerty', 'abc123', 'letmein', 'welcome', 'admin', 'login']
  if (commonPatterns.some(pattern => password.toLowerCase().includes(pattern))) {
    return {
      valid: false,
      error: 'Password is too common. Please choose a stronger password.',
      strength: 2,
      requirements
    }
  }

  return { valid: true, strength: Math.max(3, strength), requirements }
}

// Comprehensive email validation (matching waitlist)
const validateEmailComplete = (email: string): { valid: boolean; error?: string } => {
  const trimmed = email.trim().toLowerCase()

  if (!trimmed) {
    return { valid: false, error: 'Email address is required' }
  }

  if (!isValidEmail(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address' }
  }

  if (isDisposableEmail(trimmed)) {
    return { valid: false, error: 'Disposable/temporary emails are not allowed' }
  }

  const domainCheck = isValidDomain(trimmed)
  if (!domainCheck.valid) {
    return { valid: false, error: domainCheck.error }
  }

  return { valid: true }
}

type SignupStep = 'form' | 'verification' | 'creating' | 'onboarding-profile' | 'onboarding-goals' | 'onboarding-platforms' | 'onboarding-plan'

// User exists redirect modal state
interface UserExistsModal {
  show: boolean
  email: string
}

const RequirementItem = ({ met, label }: { met: boolean; label: string }) => (
  <div className="flex items-center gap-1.5">
    <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center border ${met ? 'bg-emerald-500/10 border-emerald-500 text-emerald-500' : 'bg-white/5 border-white/10 text-white/20'}`}>
      {met && <Check className="w-2.5 h-2.5" />}
    </div>
    <span className={`text-[10px] ${met ? 'text-emerald-400 font-medium' : 'text-white/40'}`}>{label}</span>
  </div>
)

function SignUpIntegrated() {
  const [currentStep, setCurrentStep] = useState<SignupStep>('form')
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
    // Step 4: Plan
    selectedPlan: 'free'
  })

  const { toast } = useToast()
  const { user } = useFirebaseAuth()
  const [, setLocation] = useLocation()

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const email = urlParams.get('email')
    if (email && isValidEmail(email)) {
      setFormData(prev => ({ ...prev, email }))
    }

    // Check for OAuth errors on mount
    const error = parseOAuthError(urlParams)
    if (error) {
      setOauthError(error)
      toast({
        title: 'Authentication Failed',
        description: error.userMessage,
        variant: 'destructive',
      })
    }

    // Check for OAuth success
    if (checkOAuthSuccess(urlParams)) {
      setShowOAuthSuccess(true)
      toast({
        title: 'Success!',
        description: 'Signed up with Google successfully',
      })
      
      // Show success message for 2 seconds then redirect (Requirement 19.4)
      setTimeout(() => {
        clearOAuthSuccess()
        setLocation('/')
      }, 2000)
    }

    // Restore form data if user is returning from OAuth (Requirement 19.6)
    const restored = restoreFormData()
    if (restored) {
      setFormData(prev => ({ ...prev, ...restored }))
    }
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
    setIsResending(true)
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

    if (user && !currentStep.startsWith('onboarding-')) {
      if (isResuming) {
        // User needs to complete onboarding - go to profile step and store Firebase user
        console.log('[ONBOARDING] Resuming onboarding for authenticated user')
        setCreatedFirebaseUser(user)
        setCurrentStep('onboarding-profile')
      } else {
        // User is fully authenticated and doesn't need onboarding - redirect to dashboard
        window.location.href = '/'
      }
    }
  }, [user, currentStep])

  // Show loading when authenticated user is being redirected (only if not resuming)
  const urlParams = new URLSearchParams(window.location.search)
  const isResuming = urlParams.get('resume') === 'true'
  if (user && !currentStep.startsWith('onboarding-') && !isResuming) {
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
        return onboardingData.platforms.length > 0
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
        handleCompleteOnboarding()
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
  const getOnboardingStepNumber = () => {
    switch (currentStep) {
      case 'onboarding-profile': return 1
      case 'onboarding-goals': return 2
      case 'onboarding-platforms': return 3
      case 'onboarding-plan': return 4
      default: return 0
    }
  }

  return (
    <div className="fixed inset-0 flex w-full bg-black overflow-hidden lg:relative lg:min-h-screen">
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
      <div className="hidden lg:flex lg:w-[55%] relative items-center justify-center">
        <div className="absolute inset-y-10 left-6 -right-24 bg-[#0d4f4f] rounded-2xl flex items-center justify-center overflow-hidden">
          {/* Grain texture */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
            <filter id="grain-signup">
              <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" seed="15" stitchTiles="stitch" />
              <feColorMatrix type="saturate" values="0" />
            </filter>
            <rect width="100%" height="100%" filter="url(#grain-signup)" />
          </svg>

          {/* Floating blur orbs */}
          <div className="absolute top-20 left-20 w-32 h-32 bg-teal-300/15 rounded-full blur-3xl"></div>
          <div className="absolute bottom-20 right-20 w-40 h-40 bg-cyan-400/10 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-emerald-400/10 rounded-full blur-3xl"></div>

          {/* Top Left Corner Flourish */}
          <svg className="absolute top-0 left-0 w-40 h-40 lg:w-52 lg:h-52 pointer-events-none z-[5]" viewBox="0 0 200 200" fill="none">
            <motion.path
              d="M 0 80 Q 40 80, 60 50 Q 80 20, 120 0"
              stroke="#14b8a6"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.8 }}
              transition={{ delay: 0.3, duration: 1.5, ease: "easeOut" }}
              style={{ filter: 'drop-shadow(0 0 4px rgba(20, 184, 166, 0.4))' }}
            />
            <motion.circle cx="120" cy="20" r="4" fill="#14b8a6"
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ delay: 1.5, type: "spring" }}
            />
          </svg>

          {/* Bottom Right Corner Flourish */}
          <svg className="absolute bottom-0 right-0 w-40 h-40 lg:w-52 lg:h-52 pointer-events-none z-[5]" viewBox="0 0 200 200" fill="none">
            <motion.path
              d="M 200 120 Q 160 120, 140 150 Q 120 180, 80 200"
              stroke="#14b8a6"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 0.8 }}
              transition={{ delay: 0.5, duration: 1.5, ease: "easeOut" }}
              style={{ filter: 'drop-shadow(0 0 4px rgba(20, 184, 166, 0.4))' }}
            />
            <motion.circle cx="80" cy="180" r="4" fill="#14b8a6"
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              transition={{ delay: 1.8, type: "spring" }}
            />
          </svg>

          {/* Main Content - PHONE MOCKUP + BEFORE/AFTER + TESTIMONIAL + 3D ELEMENTS */}
          <div className="relative z-10 flex flex-col items-center justify-center px-6 py-4 w-full h-full">

            {/* 3D Floating Social Icons - Orbiting */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
              {/* Instagram - Top */}
              <motion.div
                className="absolute top-16 left-1/4 w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #833AB4 0%, #FD1D1D 50%, #FCAF45 100%)', boxShadow: '0 8px 32px rgba(131, 58, 180, 0.5)' }}
                initial={{ y: -50, opacity: 0, rotateY: -30 }}
                animate={{ y: 0, opacity: 1, rotateY: 0 }}
                transition={{ delay: 0.4, type: "spring" }}
                whileHover={{ scale: 1.2, rotate: 10 }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-6 h-6">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                </svg>
              </motion.div>

              {/* TikTok - Right */}
              <motion.div
                className="absolute top-1/3 right-8 w-11 h-11 rounded-xl bg-black flex items-center justify-center border border-white/20"
                style={{ boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)' }}
                initial={{ x: 50, opacity: 0, rotateY: 30 }}
                animate={{ x: 0, opacity: 1, rotateY: 0 }}
                transition={{ delay: 0.5, type: "spring" }}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                </svg>
              </motion.div>

              {/* YouTube - Bottom Right */}
              <motion.div
                className="absolute bottom-32 right-16 w-10 h-10 rounded-xl bg-[#FF0000] flex items-center justify-center"
                style={{ boxShadow: '0 8px 32px rgba(255, 0, 0, 0.5)' }}
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6, type: "spring" }}
              >
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                </svg>
              </motion.div>

              {/* LinkedIn - Left */}
              <motion.div
                className="absolute top-1/2 left-6 w-10 h-10 rounded-xl bg-[#0A66C2] flex items-center justify-center"
                style={{ boxShadow: '0 8px 32px rgba(10, 102, 194, 0.5)' }}
                initial={{ x: -50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.7, type: "spring" }}
              >
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                </svg>
              </motion.div>

              {/* Floating Stats Bubbles */}
              <motion.div
                className="absolute top-24 right-1/4 bg-white/10 backdrop-blur-md rounded-full px-4 py-2 border border-white/20"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 1.0, type: "spring" }}
              >
                <span className="text-white text-sm font-bold">+847K</span>
                <span className="text-white/60 text-xs ml-1">followers</span>
              </motion.div>

              <motion.div
                className="absolute bottom-40 left-12 bg-white/10 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/20"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 1.1, type: "spring" }}
              >
                <span className="text-emerald-400 text-xs font-bold">▲ 284%</span>
              </motion.div>
            </div>

            {/* Main Visual Container */}
            <div className="relative w-full max-w-md">

              {/* iPhone Mockup - Central */}
              <motion.div
                initial={{ y: 40, opacity: 0, rotateX: 10 }}
                animate={{ y: 0, opacity: 1, rotateX: 0 }}
                transition={{ delay: 0.3, type: "spring", stiffness: 100 }}
                className="relative mx-auto"
                style={{ perspective: '1000px' }}
              >
                {/* Phone Frame */}
                <div className="relative w-48 h-[380px] mx-auto bg-gray-900 rounded-[2.5rem] p-2 shadow-2xl border-4 border-gray-800"
                  style={{ boxShadow: '0 25px 80px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(20, 184, 166, 0.15)' }}
                >
                  {/* Notch */}
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-24 h-6 bg-gray-900 rounded-b-2xl z-20"></div>

                  {/* Screen Content */}
                  <div className="w-full h-full bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900 rounded-[2rem] overflow-hidden relative">
                    {/* App Header */}
                    <div className="px-4 pt-8 pb-3 bg-gradient-to-b from-teal-600/20 to-transparent">
                      <div className="flex items-center gap-2">
                        <img src="/veefore.svg" alt="V" className="w-6 h-6" />
                        <span className="text-white font-bold text-sm">VeeFore</span>
                      </div>
                    </div>

                    {/* Stats Cards */}
                    <div className="px-3 space-y-2">
                      <motion.div
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="bg-white/10 backdrop-blur-sm rounded-xl p-3 border border-white/10"
                      >
                        <div className="text-white/60 text-[10px] mb-1">Total Followers</div>
                        <div className="text-white text-xl font-bold">248.5K</div>
                        <div className="text-emerald-400 text-xs">↗ +12.4% this week</div>
                      </motion.div>

                      <motion.div
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.7 }}
                        className="bg-gradient-to-r from-teal-500/20 to-cyan-500/20 rounded-xl p-3 border border-teal-500/30"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">🚀</span>
                          <span className="text-white text-xs font-medium">AI Post Ready</span>
                        </div>
                        <div className="text-white/80 text-[10px] leading-relaxed">
                          "5 productivity hacks that changed my business..."
                        </div>
                        <div className="flex gap-1 mt-2">
                          {['#growth', '#tips'].map((tag, i) => (
                            <span key={i} className="text-[8px] px-2 py-0.5 bg-teal-500/30 rounded-full text-teal-300">{tag}</span>
                          ))}
                        </div>
                      </motion.div>

                      {/* Mini Chart */}
                      <motion.div
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className="bg-white/5 rounded-xl p-3"
                      >
                        <div className="text-white/60 text-[10px] mb-2">Growth Chart</div>
                        <div className="flex items-end gap-1 h-12">
                          {[30, 45, 40, 60, 55, 75, 70, 90, 85, 100].map((h, i) => (
                            <motion.div
                              key={i}
                              className="flex-1 bg-gradient-to-t from-teal-500 to-cyan-400 rounded-t"
                              initial={{ height: 0 }}
                              animate={{ height: `${h}%` }}
                              transition={{ delay: 1.0 + i * 0.05, duration: 0.4 }}
                            />
                          ))}
                        </div>
                      </motion.div>
                    </div>
                  </div>
                </div>

                {/* Phone Reflection/Glow */}
                <div className="absolute -inset-4 bg-gradient-to-b from-teal-500/10 to-transparent rounded-[3rem] -z-10 blur-xl"></div>
              </motion.div>

              {/* BEFORE/AFTER Card - Left Side */}
              <motion.div
                initial={{ x: -60, opacity: 0, rotate: -5 }}
                animate={{ x: 0, opacity: 1, rotate: -5 }}
                transition={{ delay: 0.5, type: "spring" }}
                whileHover={{ rotate: 0, scale: 1.02 }}
                className="absolute -left-8 top-16 bg-white rounded-2xl shadow-2xl p-4 w-36 cursor-pointer"
                style={{ boxShadow: '0 20px 60px -15px rgba(0, 0, 0, 0.3)' }}
              >
                <div className="text-center mb-3">
                  <div className="text-gray-400 text-[10px] font-medium uppercase tracking-wide">Transformation</div>
                </div>
                <div className="space-y-3">
                  <div className="text-center">
                    <div className="text-gray-400 text-[9px] mb-0.5">BEFORE</div>
                    <div className="text-gray-600 text-lg font-bold">2.4K</div>
                  </div>
                  <div className="flex items-center justify-center">
                    <motion.div
                      animate={{ y: [0, -3, 0] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                      className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-sm"
                    >
                      ↓
                    </motion.div>
                  </div>
                  <div className="text-center">
                    <div className="text-emerald-500 text-[9px] mb-0.5">AFTER</div>
                    <div className="text-emerald-600 text-xl font-bold">247K</div>
                  </div>
                </div>
                <div className="mt-3 text-center">
                  <span className="text-[9px] px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full font-medium">+10,191% Growth</span>
                </div>
              </motion.div>

              {/* TESTIMONIAL Card - Right Side */}
              <motion.div
                initial={{ x: 60, opacity: 0, rotate: 5 }}
                animate={{ x: 0, opacity: 1, rotate: 5 }}
                transition={{ delay: 0.6, type: "spring" }}
                whileHover={{ rotate: 0, scale: 1.02 }}
                className="absolute -right-6 top-24 bg-white rounded-2xl shadow-2xl p-4 w-40 cursor-pointer"
                style={{ boxShadow: '0 20px 60px -15px rgba(0, 0, 0, 0.3)' }}
              >
                {/* Stars */}
                <div className="flex gap-0.5 mb-2">
                  {[1, 2, 3, 4, 5].map((_, i) => (
                    <motion.span
                      key={i}
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: 0.9 + i * 0.1, type: "spring" }}
                      className="text-yellow-400 text-sm"
                    >★</motion.span>
                  ))}
                </div>
                <p className="text-gray-600 text-[10px] leading-relaxed mb-3 italic">
                  "VeeFore transformed my content game. 10x growth in just 3 months!"
                </p>
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center text-white text-[10px] font-bold">
                    SM
                  </div>
                  <div>
                    <div className="text-gray-800 text-[10px] font-semibold">Sarah M.</div>
                    <div className="text-gray-400 text-[8px]">@sarahcreates</div>
                  </div>
                </div>
              </motion.div>

              {/* AI Badge - Bottom */}
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.8, type: "spring" }}
                className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-teal-500 to-cyan-500 rounded-full px-5 py-2 shadow-lg flex items-center gap-2"
                style={{ boxShadow: '0 10px 40px -10px rgba(20, 184, 166, 0.5)' }}
              >
                <motion.div
                  animate={{ rotate: [0, 360] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                  className="text-white text-sm"
                >✨</motion.div>
                <span className="text-white text-xs font-semibold">Powered by AI</span>
              </motion.div>
            </div>

            {/* Headline - Below Visual */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 1.0 }}
              className="text-center mt-12"
            >
              <h2 className="text-2xl lg:text-3xl font-bold text-white mb-2">
                Your Growth <span className="text-teal-300">Starts Here</span>
              </h2>
              <p className="text-white/50 text-sm">Join 10,000+ creators already growing with AI</p>
            </motion.div>
          </div>
        </div>
      </div>

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
                          disabled={isLoading}
                          className={`mt-3 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                            oauthError.severity === 'error' 
                              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-200' 
                              : oauthError.severity === 'warning'
                              ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200'
                              : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-200'
                          } disabled:opacity-50`}
                        >
                          <RefreshCw className="w-3 h-3" />
                          {isLoading ? 'Retrying...' : 'Try Again'}
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
                    setIsResending(true)
                    // Redirect to server-side OAuth start endpoint
                    window.location.href = import.meta.env.VITE_OAUTH_START_URL || `${import.meta.env.VITE_API_BASE_URL}/api/auth/google/start`
                  }}
                  disabled={isLoading || isCheckingEmail || showOAuthSuccess}
                  className="w-full h-11 rounded-md bg-white text-gray-700 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors border border-gray-300 disabled:opacity-70"
                >
                  {isLoading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Redirecting to Google...</>
                  ) : (
                    <>
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                      </svg>
                      Continue with Google
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
                    <span className="text-white/60">Step {getOnboardingStepNumber()} of 4</span>
                    <span className="text-teal-400">{Math.round((getOnboardingStepNumber() / 4) * 100)}% complete</span>
                  </div>
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-500"
                      style={{ width: `${(getOnboardingStepNumber() / 4) * 100}%` }}
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
                    </div>

                    <div className="space-y-3">
                      {/* Full Name - Pre-filled from signup */}
                      <div className="space-y-1">
                        <Label className="text-xs font-medium text-white/70">Full Name</Label>
                        <Input
                          value={formData.fullName}
                          disabled
                          className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white/60"
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

                {/* Navigation Buttons */}
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
                        Get Started
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