import { useState, useEffect } from "react"
import { Mail, ArrowRight, Loader2, CheckCircle, RefreshCw } from "lucide-react"
import { motion } from "framer-motion"
import { useToast } from "@/hooks/use-toast"
import { useLocation } from "wouter"
import {
  parseOAuthError,
  clearOAuthError,
  preserveFormData,
  restoreFormData,
  getErrorColorClasses,
  checkOAuthSuccess,
  clearOAuthSuccess,
} from "@/utils/oauthErrorHandler"
import { validateName, validateEmailComplete, validatePassword } from "../utils/validation"
import { NameInput } from "./NameInput"
import { EmailInput } from "./EmailInput"
import { PasswordInput } from "./PasswordInput"

interface SignUpFormData {
  fullName: string
  email: string
  password: string
}

interface SignUpFormProps {
  onSuccess: (data: SignUpFormData) => void
  initialEmail?: string
}

interface UserExistsModal {
  show: boolean
  email: string
}

export function SignUpForm({ onSuccess, initialEmail = '' }: SignUpFormProps) {
  const [formData, setFormData] = useState<SignUpFormData>({
    fullName: '',
    email: initialEmail,
    password: ''
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
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

  // OAuth error handling state
  const [oauthError, setOauthError] = useState<ReturnType<typeof parseOAuthError>>(null)
  const [showOAuthSuccess, setShowOAuthSuccess] = useState(false)

  const { toast } = useToast()
  const [, setLocation] = useLocation()

  // Persistence Keys
  const STORAGE_KEY_FORM = 'signup_form_data_v1'

  // Load persisted state on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const emailParam = urlParams.get('email')
    if (emailParam) {
      setFormData(prev => ({ ...prev, email: emailParam }))
    }

    // Check for OAuth errors on mount
    const error = parseOAuthError(urlParams)
    const hasOAuthSuccess = checkOAuthSuccess(urlParams)
    
    if (error) {
      setOauthError(error)
      setIsGoogleLoading(false)
      toast({
        title: 'Authentication Failed',
        description: error.userMessage,
        variant: 'destructive',
      })
    }

    // If no OAuth success or error params, reset Google loading state
    if (!hasOAuthSuccess && !error) {
      setIsGoogleLoading(false)
    }

    // Restore form data if user is returning from OAuth
    const restored = restoreFormData()
    if (restored) {
      setFormData(prev => ({ ...prev, ...restored }))
    }

    // Load saved form data
    try {
      const savedForm = localStorage.getItem(STORAGE_KEY_FORM)
      if (savedForm) {
        const parsed = JSON.parse(savedForm)
        setFormData(prev => ({ ...prev, ...parsed }))
      }
    } catch (e) {
      console.warn('Failed to load signup form data', e)
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

  // Add visibility change listener to reset loading state if user returns without OAuth params
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const urlParams = new URLSearchParams(window.location.search)
        const hasOAuthParams = checkOAuthSuccess(urlParams) || parseOAuthError(urlParams)
        
        if (!hasOAuthParams) {
          setIsGoogleLoading(false)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  const handleInputChange = (field: keyof SignUpFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

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
        if (data.data?.exists) {
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
        console.warn('Email check timed out, proceeding anyway')
      } else {
        console.error('Email check failed:', error)
      }
    }
    setIsCheckingEmail(false)

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const isValid = await validateForm()
    if (!isValid) {
      return
    }

    onSuccess(formData)
  }

  const handleRedirectToSignIn = () => {
    setUserExistsModal({ show: false, email: '' })
    setLocation(`/signin?email=${encodeURIComponent(userExistsModal.email)}`)
  }

  const handleOAuthRetry = () => {
    clearOAuthError()
    setOauthError(null)
    preserveFormData(formData)
    setIsGoogleLoading(true)
    window.location.href = import.meta.env.VITE_OAUTH_START_URL || `${import.meta.env.VITE_API_BASE_URL}/api/auth/google/start`
  }

  const handleDismissOAuthError = () => {
    clearOAuthError()
    setOauthError(null)
  }

  const handleGoogleSignUp = () => {
    preserveFormData(formData)
    setIsGoogleLoading(true)
    window.location.href = import.meta.env.VITE_OAUTH_START_URL || `${import.meta.env.VITE_API_BASE_URL}/api/auth/google/start`
  }

  const isLoading = isCheckingEmail

  return (
    <div className="space-y-4 py-4">
      <div className="mb-2">
        <div
          className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{
            background: 'rgba(76,130,247,0.10)',
            border: '1px solid rgba(76,130,247,0.22)',
          }}
        >
          <span className="text-xs font-medium" style={{ color: '#7FA8FF' }}>✨ Free Trial · No Credit Card</span>
        </div>
        <h2 className="mb-2 text-2xl font-bold text-white sm:text-3xl">Get Started Free</h2>
        <p className="text-sm" style={{ color: '#5A6172' }}>Create your account in 30 seconds</p>
      </div>

      {/* OAuth Success Message */}
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

      {/* OAuth Error Display */}
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

      <form onSubmit={handleSubmit} className="space-y-3">
        <NameInput
          value={formData.fullName}
          onChange={(value) => handleInputChange('fullName', value)}
          error={errors.fullName}
          disabled={isLoading}
        />

        <EmailInput
          value={formData.email}
          onChange={(value) => handleInputChange('email', value)}
          error={errors.email}
          disabled={isLoading}
        />

        <PasswordInput
          value={formData.password}
          onChange={(value) => handleInputChange('password', value)}
          error={errors.password}
          disabled={isLoading}
          strength={passwordStrength}
          requirements={passwordRequirements}
          showStrengthIndicator={true}
        />

        <button
          type="submit"
          disabled={isLoading}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-70"
          style={{
            background: isLoading ? 'rgba(76,130,247,0.7)' : '#4C82F7',
            boxShadow: isLoading ? 'none' : '0 0 24px rgba(76,130,247,0.35)',
          }}
          onMouseEnter={e => { if (!isLoading) e.currentTarget.style.background = '#3A6FE6' }}
          onMouseLeave={e => { if (!isLoading) e.currentTarget.style.background = '#4C82F7' }}
        >
          {isLoading ? (
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

      {/* Google OAuth Button */}
      <button
        type="button"
        onClick={handleGoogleSignUp}
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

      {/* User Exists Modal */}
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
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border" style={{ background: 'rgba(76,130,247,0.12)', borderColor: 'rgba(76,130,247,0.28)' }}>
                <Mail className="h-8 w-8" style={{ color: '#4C82F7' }} />
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
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold text-white transition-all"
                  style={{ background: '#4C82F7' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#3A6FE6' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#4C82F7' }}
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
    </div>
  )
}
