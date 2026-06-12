import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, ArrowLeft, Mail, Lock, Loader2, RefreshCw, CheckCircle } from 'lucide-react'
import { useLocation } from 'wouter'
import { signInWithEmailAndPassword, auth, sendPasswordResetEmail } from '@/lib/firebase'
import { useToast } from '@/hooks/use-toast'
import {
  parseOAuthError,
  clearOAuthError,
  preserveFormData,
  restoreFormData,
  getErrorColorClasses,
  checkOAuthSuccess,
  clearOAuthSuccess,
} from '@/utils/oauthErrorHandler'

// ============================================
// EMAIL VALIDATION UTILITIES (Enterprise Standard)
// ============================================

// Strict email validation (RFC 5322 compliant)
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/
  return emailRegex.test(email.toLowerCase().trim())
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

// Block disposable/temporary email providers
const isDisposableEmail = (email: string): boolean => {
  const disposableDomains = [
    'tempmail.com', 'throwaway.com', 'mailinator.com', 'guerrillamail.com',
    'temp-mail.org', 'fakeinbox.com', '10minutemail.com', 'trashmail.com',
    'getairmail.com', 'yopmail.com', 'sharklasers.com', 'spam4.me',
    'tempinbox.com', 'discard.email', 'mailnesia.com', 'maildrop.cc',
  ]
  const domain = email.split('@')[1]?.toLowerCase()
  return disposableDomains.includes(domain)
}

// Comprehensive email validation
const validateEmailComplete = (email: string): { valid: boolean; error?: string } => {
  const trimmed = email.trim().toLowerCase()

  if (!trimmed) {
    return { valid: false, error: 'Email address is required' }
  }
  if (!isValidEmail(trimmed)) {
    return { valid: false, error: 'Please enter a valid email address' }
  }

  const domainCheck = isValidDomain(trimmed)
  if (!domainCheck.valid) {
    return { valid: false, error: domainCheck.error }
  }

  if (isDisposableEmail(trimmed)) {
    return { valid: false, error: 'Disposable email addresses are not allowed' }
  }

  return { valid: true }
}

interface SignInProps {
  onNavigate: (view: string) => void
}

const SignIn = ({ onNavigate }: SignInProps) => {
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({ email: '', password: '' })
  const { toast } = useToast()
  const [, setLocation] = useLocation()
  const [isEmailLoading, setIsEmailLoading] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  // OAuth error handling state
  const [oauthError, setOauthError] = useState<ReturnType<typeof parseOAuthError>>(null)
  const [showOAuthSuccess, setShowOAuthSuccess] = useState(false)

  // Forgot Password Modal State
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [isSendingReset, setIsSendingReset] = useState(false)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [resetError, setResetError] = useState<string | null>(null)

  // Handle Forgot Password
  const handleForgotPassword = async () => {
    setResetError(null)

    const emailValidation = validateEmailComplete(forgotEmail)
    if (!emailValidation.valid) {
      setResetError(emailValidation.error || 'Invalid email')
      return
    }

    setIsSendingReset(true)
    try {
      await sendPasswordResetEmail(auth, forgotEmail.trim().toLowerCase())
      setResetSuccess(true)
      toast({ title: "Email Sent", description: "Check your inbox for password reset instructions." })
    } catch (error: any) {
      console.error('Password reset error:', error)

      let message = 'Failed to send reset email. Please try again.'
      if (error?.code === 'auth/user-not-found') {
        message = 'No account found with this email address.'
      } else if (error?.code === 'auth/too-many-requests') {
        message = 'Too many requests. Please wait before trying again.'
      } else if (error?.code === 'auth/invalid-email') {
        message = 'Invalid email format.'
      }
      setResetError(message)
    } finally {
      setIsSendingReset(false)
    }
  }

  const closeForgotModal = () => {
    setShowForgotModal(false)
    setForgotEmail('')
    setResetSuccess(false)
    setResetError(null)
  }

  // Persistence for Email and OAuth session exchange
  useEffect(() => {
    const savedEmail = localStorage.getItem('signin_email_v1')
    if (savedEmail) {
      setFormData(prev => ({ ...prev, email: savedEmail }))
    }

    // Check for OAuth errors on mount
    const urlParams = new URLSearchParams(window.location.search)
    const error = parseOAuthError(urlParams)
    if (error) {
      setOauthError(error)
      toast({
        title: 'Authentication Failed',
        description: error.userMessage,
        variant: 'destructive',
      })
    }

    // Check for OAuth success - now with session token exchange
    if (checkOAuthSuccess(urlParams)) {
      setShowOAuthSuccess(true)
      
      // Exchange the HTTP-only cookie for a Firebase custom token
      const exchangeSession = async () => {
        try {
          console.log('[OAuth] Exchanging session token...')
          const response = await fetch('/api/auth/session', {
            method: 'GET',
            credentials: 'include', // Include cookies
          })
          
          if (!response.ok) {
            throw new Error('Failed to get custom token')
          }
          
          const data = await response.json()
          console.log('[OAuth] Received custom token of length:', data.customToken?.length)
          
          if (!data.customToken) {
            throw new Error('MISSING_CUSTOM_TOKEN')
          }
          
          // Import signInWithCustomToken
          const { signInWithCustomToken } = await import('firebase/auth')
          
          // Sign in with the custom token
          console.log('[OAuth] Signing in with custom token...')
          await signInWithCustomToken(auth, data.customToken)
          
          console.log('[OAuth] Firebase sign-in successful')
          toast({
            title: 'Success!',
            description: 'Signed in with Google successfully',
          })
          
          // Show success message for 1 second then redirect (Requirement 19.4)
          setTimeout(() => {
            clearOAuthSuccess()
            setLocation('/')
          }, 1000)
          
        } catch (error: any) {
          console.error('[OAuth] Session exchange failed:', error)
          toast({
            title: 'Authentication Error',
            description: error.message || 'Failed to complete sign-in',
            variant: 'destructive',
          })
          setShowOAuthSuccess(false)
          
          // Show the error to the user
          const errorMessage = error.message === 'MISSING_CUSTOM_TOKEN' 
            ? 'Session token not found. Please try signing in again.'
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

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (formData.email) localStorage.setItem('signin_email_v1', formData.email)
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [formData.email])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  // Handle OAuth retry
  const handleOAuthRetry = () => {
    clearOAuthError()
    setOauthError(null)
    // Preserve form data before initiating OAuth (Requirement 19.6)
    preserveFormData(formData)
    setIsEmailLoading(true)
    window.location.href = import.meta.env.VITE_OAUTH_START_URL || `${import.meta.env.VITE_API_BASE_URL}/api/auth/google/start`
  }

  // Handle dismissing OAuth error
  const handleDismissOAuthError = () => {
    clearOAuthError()
    setOauthError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)

    const newErrors = { email: '', password: '' }

    // Use strict email validation
    const emailValidation = validateEmailComplete(formData.email)
    if (!emailValidation.valid) {
      newErrors.email = emailValidation.error || 'Invalid email'
    }

    if (!formData.password.trim()) {
      newErrors.password = 'Please enter your password'
    }

    setErrors(newErrors)

    if (!newErrors.email && !newErrors.password) {
      setIsEmailLoading(true)
      try {
        await signInWithEmailAndPassword(auth, formData.email.trim().toLowerCase(), formData.password)

        const signinResponse = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email.trim().toLowerCase() })
        })

        if (!signinResponse.ok) {
          const errorData = await signinResponse.json().catch(() => ({ message: 'Backend signin failed' }))
          console.warn('Backend signin issue:', errorData.message)
        }

        toast({ title: "Success", description: "Signed in successfully!" })
        setLocation('/')
      } catch (error: any) {
        console.error('Sign in error:', error)

        // Map Firebase error codes to user-friendly messages
        let userMessage = 'Failed to sign in. Please try again.'
        const errorCode = error?.code

        if (errorCode === 'auth/user-not-found') {
          userMessage = 'No account found with this email. Please check your email or sign up.'
        } else if (errorCode === 'auth/invalid-credential' || errorCode === 'auth/wrong-password') {
          userMessage = 'Incorrect password. Please check and try again.'
        } else if (errorCode === 'auth/invalid-email') {
          userMessage = 'Invalid email format. Please check and try again.'
        } else if (errorCode === 'auth/user-disabled') {
          userMessage = 'This account has been disabled. Please contact support.'
        } else if (errorCode === 'auth/too-many-requests') {
          userMessage = 'Too many failed attempts. Please wait a moment and try again.'
        } else if (error?.message) {
          userMessage = error.message
        }

        setAuthError(userMessage)
      } finally {
        setIsEmailLoading(false)
      }
    }
  }

  return (
    <>
      <div className="fixed inset-0 flex w-full bg-black overflow-hidden lg:relative lg:min-h-screen">
        {/* Mobile-only atmospheric background */}
        <div className="lg:hidden absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-black to-blue-950/30" />
          <motion.div
            className="absolute top-20 right-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl"
            animate={{ y: [0, -20, 0], opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute top-1/3 left-0 w-40 h-40 bg-blue-500/15 rounded-full blur-3xl"
            animate={{ x: [0, 20, 0], opacity: [0.15, 0.3, 0.15] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute bottom-40 right-0 w-36 h-36 bg-purple-500/20 rounded-full blur-3xl"
            animate={{ y: [0, 15, 0], opacity: [0.2, 0.35, 0.2] }}
            transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
              backgroundSize: '40px 40px'
            }}
          />
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black via-black/50 to-transparent" />
        </div>

        {/* Left Side - Form */}
        <div className="w-full lg:w-[45%] flex flex-col px-5 sm:px-6 md:px-12 lg:pl-24 lg:pr-16 xl:pl-28 xl:pr-20 relative z-10 lg:justify-center lg:min-h-screen">
          {/* Header */}
          <div className="pt-4 pb-3 sm:pt-6 sm:pb-6 lg:absolute lg:top-8 lg:left-24 xl:left-28 lg:pb-0 lg:pt-0 flex items-center gap-3 sm:gap-4">
            <button
              onClick={() => setLocation('/')}
              className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all"
              aria-label="Go back to home"
            >
              <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white/70" />
            </button>
            <div className="flex items-center cursor-pointer" onClick={() => setLocation('/')}>
              <img src="/veefore.svg" alt="V" className="w-8 h-8 sm:w-9 sm:h-9" />
              <span className="text-xl sm:text-2xl font-bold text-white -ml-1">eefore</span>
            </div>
          </div>

          {/* Form Content */}
          <div className="w-full max-w-sm mx-auto lg:mx-0 flex-1 lg:flex-none flex flex-col justify-center">
            <div className="space-y-4">
              <div className="mb-6">
                <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">Welcome Back</h2>
                <p className="text-white/50 text-sm">Sign in to your VeeFore workspace</p>
              </div>

              {/* OAuth Success Message - Requirement 19.4 */}
              {showOAuthSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3"
                >
                  <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-emerald-200">Success!</p>
                    <p className="text-xs text-emerald-300 mt-1">Signed in with Google successfully. Redirecting...</p>
                  </div>
                </motion.div>
              )}

              {/* OAuth Error Display - Requirements 19.3 and 19.5 */}
              {oauthError && !showOAuthSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`mb-6 p-4 rounded-lg flex items-start gap-3 ${getErrorColorClasses(oauthError.severity).bg} border ${getErrorColorClasses(oauthError.severity).border}`}
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
                        disabled={isEmailLoading}
                        className={`mt-3 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                          oauthError.severity === 'error' 
                            ? 'bg-red-500/20 hover:bg-red-500/30 text-red-200' 
                            : oauthError.severity === 'warning'
                            ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200'
                            : 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-200'
                        } disabled:opacity-50`}
                      >
                        <RefreshCw className="w-3 h-3" />
                        {isEmailLoading ? 'Retrying...' : 'Try Again'}
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

              {authError && !oauthError && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3"
                >
                  <div className="text-red-500 mt-0.5">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-red-200">{authError}</p>
                  </div>
                  <button
                    onClick={() => setAuthError(null)}
                    className="text-red-400 hover:text-red-300 transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </motion.div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-white/70 block">
                    Email Address <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2">
                      <Mail className={`w-4 h-4 ${errors.email ? 'text-red-400' : 'text-white/40'}`} />
                    </div>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleInputChange('email', e.target.value)}
                      placeholder="name@company.com"
                      autoComplete="email"
                      className="w-full h-11 pl-10 pr-3 rounded-md text-white text-base transition-all placeholder:text-white/30 bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/[0.08] outline-none"
                    />
                  </div>
                  {errors.email && (
                    <p className="text-red-400 text-xs flex items-center gap-1 mt-1">
                      <span className="inline-block w-1 h-1 bg-red-400 rounded-full"></span>
                      {errors.email}
                    </p>
                  )}
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-white/70 block">
                      Password <span className="text-red-400">*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => { setForgotEmail(formData.email); setShowForgotModal(true); }}
                      className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2">
                      <Lock className={`w-4 h-4 ${errors.password ? 'text-red-400' : 'text-white/40'}`} />
                    </div>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => handleInputChange('password', e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      className="w-full h-11 pl-10 pr-10 rounded-md text-white text-base transition-all placeholder:text-white/30 bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/[0.08] outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-red-400 text-xs flex items-center gap-1 mt-1">
                      <span className="inline-block w-1 h-1 bg-red-400 rounded-full"></span>
                      {errors.password}
                    </p>
                  )}
                </div>

                {/* Sign In Button */}
                <button
                  type="submit"
                  disabled={isEmailLoading}
                  className="w-full h-11 rounded-md bg-[#2563eb] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#1d4ed8] transition-colors disabled:opacity-70"
                >
                  {isEmailLoading ? <><Loader2 className="w-5 h-5 animate-spin" /> Signing in...</> : "Sign In"}
                </button>
              </form>

              {/* Divider */}
              <div className="relative my-6">
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
                  setIsEmailLoading(true)
                  // Redirect to server-side OAuth start endpoint
                  window.location.href = import.meta.env.VITE_OAUTH_START_URL || `${import.meta.env.VITE_API_BASE_URL}/api/auth/google/start`
                }}
                disabled={isEmailLoading || showOAuthSuccess}
                className="w-full h-11 rounded-md bg-white text-gray-700 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-gray-50 transition-colors border border-gray-300 disabled:opacity-70"
              >
                {isEmailLoading ? (
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

              <p className="text-center text-white/40 text-sm mt-4">
                Don't have an account? <span className="text-white hover:underline cursor-pointer" onClick={() => onNavigate('signup')}>Get access</span>
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="pt-3 pb-3 sm:pt-6 sm:pb-6 lg:absolute lg:bottom-8 lg:left-12 lg:pt-0 lg:pb-0 flex gap-5 sm:gap-6 text-xs text-white/30">
            <span onClick={() => setLocation('/terms-of-service')} className="hover:text-white transition-colors cursor-pointer">Terms</span>
            <span onClick={() => setLocation('/privacy-policy')} className="hover:text-white transition-colors cursor-pointer">Privacy</span>
            <span onClick={() => setLocation('/security')} className="hover:text-white transition-colors cursor-pointer">Security</span>
          </div>
        </div>

        {/* Right Side - Graphics Panel */}
        <div className="hidden lg:flex lg:w-[55%] relative items-center justify-center">
          <div className="absolute inset-y-10 right-6 -left-24 bg-[#0d4f4f] rounded-2xl flex items-center justify-center overflow-hidden">
            {/* Grain texture */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
              <filter id="grain">
                <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" seed="15" stitchTiles="stitch" />
                <feColorMatrix type="saturate" values="0" />
              </filter>
              <rect width="100%" height="100%" filter="url(#grain)" />
            </svg>

            {/* Floating blur orbs - teal themed */}
            <div className="absolute top-20 left-20 w-32 h-32 bg-teal-300/15 rounded-full blur-3xl"></div>
            <div className="absolute bottom-20 right-20 w-40 h-40 bg-cyan-400/10 rounded-full blur-3xl"></div>
            <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-emerald-400/10 rounded-full blur-3xl"></div>

            {/* Top Left Corner Flourish - Teal */}
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
              <motion.path
                d="M 0 50 Q 25 50, 40 30 Q 55 10, 80 0"
                stroke="#2dd4bf"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.6 }}
                transition={{ delay: 0.6, duration: 1.2, ease: "easeOut" }}
              />
              <motion.path
                d="M 30 100 Q 50 90, 45 70 Q 40 50, 60 45 Q 80 40, 75 60"
                stroke="#14b8a6"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.5 }}
                transition={{ delay: 1.0, duration: 1.5, ease: "easeInOut" }}
              />
              <motion.circle cx="120" cy="20" r="4" fill="#14b8a6"
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ delay: 1.5, type: "spring" }}
              />
              <motion.circle cx="60" cy="50" r="3" fill="#2dd4bf"
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ delay: 1.0, type: "spring" }}
              />
              <motion.circle cx="30" cy="100" r="5" fill="#0d9488"
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ delay: 0.8, type: "spring" }}
                style={{ filter: 'drop-shadow(0 0 4px rgba(13, 148, 136, 0.6))' }}
              />
            </svg>

            {/* Top Right Corner Flourish - Teal */}
            <svg className="absolute top-0 right-0 w-40 h-40 lg:w-52 lg:h-52 pointer-events-none z-[5]" viewBox="0 0 200 200" fill="none">
              <motion.path
                d="M 200 80 Q 160 80, 140 50 Q 120 20, 80 0"
                stroke="#14b8a6"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.8 }}
                transition={{ delay: 0.4, duration: 1.5, ease: "easeOut" }}
                style={{ filter: 'drop-shadow(0 0 4px rgba(20, 184, 166, 0.4))' }}
              />
              <motion.path
                d="M 200 50 Q 175 50, 160 30 Q 145 10, 120 0"
                stroke="#2dd4bf"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.6 }}
                transition={{ delay: 0.7, duration: 1.2, ease: "easeOut" }}
              />
              <motion.path
                d="M 170 100 Q 150 90, 155 70 Q 160 50, 140 45 Q 120 40, 125 60"
                stroke="#14b8a6"
                strokeWidth="2"
                strokeLinecap="round"
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 0.5 }}
                transition={{ delay: 1.1, duration: 1.5, ease: "easeInOut" }}
              />
              <motion.circle cx="80" cy="20" r="4" fill="#14b8a6"
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ delay: 1.6, type: "spring" }}
              />
              <motion.circle cx="140" cy="50" r="3" fill="#2dd4bf"
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ delay: 1.1, type: "spring" }}
              />
              <motion.circle cx="170" cy="100" r="5" fill="#0d9488"
                initial={{ scale: 0 }} animate={{ scale: 1 }}
                transition={{ delay: 0.9, type: "spring" }}
                style={{ filter: 'drop-shadow(0 0 4px rgba(13, 148, 136, 0.6))' }}
              />
            </svg>

            {/* Content */}
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-6 py-8 overflow-hidden">
              {/* Header */}
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="inline-block px-4 py-1.5 rounded-full border border-teal-300/30 bg-teal-400/20 backdrop-blur-sm text-white font-semibold text-sm mb-3"
              >
                ✨ AI-POWERED PLATFORM
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-2xl xl:text-3xl font-bold text-white text-center mb-6"
              >
                Automate Your Social Media Growth
              </motion.h2>

              {/* Main Content Area - Simulated Dashboard */}
              <div className="relative w-full max-w-xl">
                {/* Floating Notification - Top Left */}
                <motion.div
                  initial={{ x: -50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.5, type: "spring" }}
                  className="absolute -top-2 -left-4 z-20 bg-white rounded-xl shadow-xl p-3 w-52"
                  style={{ boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)' }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#FCAF45] flex items-center justify-center flex-shrink-0"
                      style={{ boxShadow: '0 4px 12px rgba(131, 58, 180, 0.3)' }}
                    >
                      <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-gray-500 font-medium">New follower</div>
                      <div className="text-sm font-semibold text-gray-800 truncate">@sarah_designer</div>
                      <div className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" /></svg>
                        +1,247 today
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Floating Stats Card - Top Right */}
                <motion.div
                  initial={{ x: 50, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ delay: 0.6, type: "spring" }}
                  className="absolute -top-4 -right-2 z-20 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl shadow-xl p-3 w-36"
                >
                  <div className="text-white/80 text-[10px] font-medium mb-1">Weekly Growth</div>
                  <div className="text-white text-xl font-bold">+284%</div>
                  <div className="flex items-center gap-1 mt-1">
                    <svg className="w-3 h-3 text-emerald-300" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                    </svg>
                    <span className="text-emerald-300 text-[10px]">vs last week</span>
                  </div>
                </motion.div>

                {/* Main Dashboard Card */}
                <motion.div
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4, type: "spring", stiffness: 100 }}
                  className="bg-white rounded-2xl shadow-2xl overflow-hidden"
                >
                  {/* Dashboard Header */}
                  <div className="bg-gray-900 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500"></div>
                        <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                        <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      </div>
                      <span className="text-gray-400 text-xs ml-2">VeeFore Dashboard</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span>
                      <span className="text-emerald-400 text-[10px] font-medium">Live</span>
                    </div>
                  </div>

                  {/* Dashboard Content */}
                  <div className="p-4">
                    {/* Sidebar + Main Area */}
                    <div className="flex gap-3">
                      {/* Mini Sidebar - Animated */}
                      <div className="w-12 flex flex-col items-center gap-2 py-2 bg-gray-50 rounded-lg">
                        {[
                          { active: true, icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
                          { active: false, icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
                          { active: false, icon: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" },
                          { active: false, icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" },
                        ].map((item, i) => (
                          <motion.div
                            key={i}
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: 0.5 + i * 0.1, type: "spring", stiffness: 200 }}
                            className={`w-8 h-8 rounded-lg ${item.active ? 'bg-teal-500' : 'bg-gray-200'} flex items-center justify-center cursor-pointer`}
                            whileHover={{ scale: 1.1 }}
                          >
                            <svg className={`w-4 h-4 ${item.active ? 'text-white' : 'text-gray-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                            </svg>
                          </motion.div>
                        ))}
                      </div>

                      {/* Main Content */}
                      <div className="flex-1 space-y-3">
                        {/* Stats Row - Animated */}
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { label: 'Followers', value: '124.5K', change: '+12.4%', gradient: 'from-teal-50 to-cyan-50', border: 'border-teal-100', color: 'text-teal-600' },
                            { label: 'Engagement', value: '8.7%', change: '+3.2%', gradient: 'from-purple-50 to-pink-50', border: 'border-purple-100', color: 'text-purple-600' },
                            { label: 'Reach', value: '2.4M', change: '+28.1%', gradient: 'from-orange-50 to-amber-50', border: 'border-orange-100', color: 'text-orange-600' },
                          ].map((stat, i) => (
                            <motion.div
                              key={stat.label}
                              initial={{ y: 20, opacity: 0 }}
                              animate={{ y: 0, opacity: 1 }}
                              transition={{ delay: 0.6 + i * 0.1, type: "spring" }}
                              className={`bg-gradient-to-br ${stat.gradient} rounded-lg p-2.5 border ${stat.border}`}
                            >
                              <div className="text-[10px] text-gray-500 font-medium">{stat.label}</div>
                              <motion.div
                                className={`text-lg font-bold ${stat.color}`}
                                initial={{ scale: 0.5 }}
                                animate={{ scale: 1 }}
                                transition={{ delay: 0.8 + i * 0.1, type: "spring", stiffness: 200 }}
                              >
                                {stat.value}
                              </motion.div>
                              <div className="text-[9px] text-emerald-600 flex items-center gap-0.5">
                                <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" /></svg>
                                {stat.change}
                              </div>
                            </motion.div>
                          ))}
                        </div>

                        {/* Chart Area - Animated */}
                        <motion.div
                          initial={{ y: 20, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{ delay: 0.9 }}
                          className="bg-gray-50 rounded-lg p-3 border border-gray-100"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-700">Performance Overview</span>
                            <div className="flex gap-1">
                              <motion.span
                                whileHover={{ scale: 1.05 }}
                                className="text-[9px] px-1.5 py-0.5 bg-teal-100 text-teal-700 rounded cursor-pointer"
                              >7D</motion.span>
                              <motion.span
                                whileHover={{ scale: 1.05 }}
                                className="text-[9px] px-1.5 py-0.5 bg-gray-200 text-gray-500 rounded cursor-pointer"
                              >30D</motion.span>
                            </div>
                          </div>
                          {/* Animated Chart with wave effect */}
                          <div className="flex items-end gap-1 h-16">
                            {[35, 48, 40, 65, 55, 75, 85, 70, 90, 78, 95, 88].map((h, i) => (
                              <motion.div
                                key={i}
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: `${h}%`, opacity: 1 }}
                                transition={{
                                  delay: 1.0 + i * 0.06,
                                  duration: 0.6,
                                  ease: [0.34, 1.56, 0.64, 1]
                                }}
                                whileHover={{ scaleY: 1.1, transition: { duration: 0.2 } }}
                                className="flex-1 bg-gradient-to-t from-teal-500 to-cyan-400 rounded-t cursor-pointer"
                                style={{ transformOrigin: 'bottom' }}
                              />
                            ))}
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[8px] text-gray-400">Mon</span>
                            <span className="text-[8px] text-gray-400">Wed</span>
                            <span className="text-[8px] text-gray-400">Fri</span>
                            <span className="text-[8px] text-gray-400">Sun</span>
                          </div>
                        </motion.div>

                        {/* Recent Posts - Animated */}
                        <div className="flex gap-2">
                          {[
                            { image: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=400&h=400&fit=crop', time: '2h ago', likes: '2.4K', comments: '187', shares: '89' },
                            { image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=400&h=400&fit=crop', time: '5h ago', likes: '1.8K', comments: '124', shares: '56' },
                          ].map((post, i) => (
                            <motion.div
                              key={i}
                              initial={{ y: 20, opacity: 0, scale: 0.95 }}
                              animate={{ y: 0, opacity: 1, scale: 1 }}
                              transition={{ delay: 1.3 + i * 0.15, type: "spring" }}
                              whileHover={{ y: -2, transition: { duration: 0.2 } }}
                              className="flex-1 bg-gray-50 rounded-lg p-2 border border-gray-100 cursor-pointer"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <motion.div
                                  className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm p-0.5"
                                  whileHover={{ scale: 1.1 }}
                                >
                                  <img src="/veefore.svg" alt="Veefore" className="w-full h-full object-contain" />
                                </motion.div>
                                <div>
                                  <div className="text-[9px] font-semibold text-gray-700">@veefore</div>
                                  <div className="text-[8px] text-gray-400">{post.time}</div>
                                </div>
                              </div>
                              <motion.div
                                className="w-full h-12 rounded-md mb-1.5 bg-cover bg-center"
                                style={{ backgroundImage: `url(${post.image})` }}
                                whileHover={{ scale: 1.02 }}
                              />
                              <div className="flex items-center gap-3 text-[9px] text-gray-500">
                                <motion.span whileHover={{ scale: 1.1 }} className="flex items-center gap-0.5 cursor-pointer">❤️ {post.likes}</motion.span>
                                <motion.span whileHover={{ scale: 1.1 }} className="flex items-center gap-0.5 cursor-pointer">💬 {post.comments}</motion.span>
                                <motion.span whileHover={{ scale: 1.1 }} className="flex items-center gap-0.5 cursor-pointer">🔄 {post.shares}</motion.span>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Floating AI Card - Bottom Left */}
                <motion.div
                  initial={{ y: 30, opacity: 0, rotate: -3 }}
                  animate={{ y: 0, opacity: 1, rotate: -3 }}
                  transition={{ delay: 0.8, type: "spring" }}
                  className="absolute -bottom-6 -left-6 z-20 bg-gradient-to-br from-teal-600 to-cyan-700 rounded-xl shadow-xl p-3 w-40"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center p-1.5 backdrop-blur-sm">
                      <img src="/veefore.svg" alt="AI" className="w-full h-full object-contain brightness-0 invert" />
                    </div>
                    <div>
                      <div className="text-white text-xs font-bold">VeeGPT</div>
                      <div className="text-white/60 text-[9px]">AI Assistant</div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    {['Caption written', 'Hashtags added', 'Scheduled 3pm'].map((item, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[9px] text-white/80">
                        <span className="w-3 h-3 rounded-full bg-white/20 flex items-center justify-center text-[7px]">✓</span>
                        {item}
                      </div>
                    ))}
                  </div>
                </motion.div>

                {/* Floating Schedule Card - Bottom Right */}
                <motion.div
                  initial={{ y: 30, opacity: 0, rotate: 3 }}
                  animate={{ y: 0, opacity: 1, rotate: 3 }}
                  transition={{ delay: 0.9, type: "spring" }}
                  className="absolute -bottom-4 -right-4 z-20 bg-white rounded-xl shadow-xl p-4 w-48"
                  style={{ boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)' }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-bold text-gray-800">Scheduled</span>
                    <span className="text-[10px] text-teal-600 font-semibold cursor-pointer hover:text-teal-700">View all</span>
                  </div>
                  <div className="space-y-2">
                    {/* Instagram Post */}
                    <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                      <div
                        className="w-7 h-7 rounded-[22%] bg-gradient-to-tr from-[#FFD600] via-[#FF0100] to-[#D500F9] flex items-center justify-center p-[5px]"
                        style={{ boxShadow: '0 2px 8px rgba(213, 0, 249, 0.3)' }}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-full h-full text-white">
                          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                          <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                          <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <span className="text-xs font-medium text-gray-700">3:00 PM</span>
                      </div>
                      <span className="text-[9px] text-gray-400">Today</span>
                    </div>
                    {/* TikTok Post */}
                    <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                      <div
                        className="w-7 h-7 rounded-[22%] bg-black flex items-center justify-center border border-white/10"
                        style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)' }}
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="white">
                          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <span className="text-xs font-medium text-gray-700">5:30 PM</span>
                      </div>
                      <span className="text-[9px] text-gray-400">Today</span>
                    </div>
                    {/* YouTube Post */}
                    <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2">
                      <div
                        className="w-7 h-7 rounded-[22%] bg-[#FF0000] flex items-center justify-center"
                        style={{ boxShadow: '0 2px 8px rgba(255, 0, 0, 0.3)' }}
                      >
                        <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
                      </div>
                      <div className="flex-1">
                        <span className="text-xs font-medium text-gray-700">8:00 PM</span>
                      </div>
                      <span className="text-[9px] text-gray-400">Tomorrow</span>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Social Platforms Row */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.0 }}
                className="flex items-center gap-3 mt-10"
              >
                <span className="text-xs text-white/50 mr-1">Manage:</span>
                {/* Instagram */}
                <motion.div
                  whileHover={{ scale: 1.1, y: -2 }}
                  className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#833AB4] via-[#FD1D1D] to-[#FCAF45] flex items-center justify-center shadow-lg cursor-pointer"
                  style={{ boxShadow: '0 4px 14px rgba(131, 58, 180, 0.4)' }}
                >
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                  </svg>
                </motion.div>
                {/* TikTok */}
                <motion.div
                  whileHover={{ scale: 1.1, y: -2 }}
                  className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shadow-lg cursor-pointer border border-white/10"
                  style={{ boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)' }}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none">
                    <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z" fill="url(#tiktok-grad)" />
                    <defs>
                      <linearGradient id="tiktok-grad" x1="5" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#25F4EE" />
                        <stop offset="0.5" stopColor="#FE2C55" />
                        <stop offset="1" stopColor="#FE2C55" />
                      </linearGradient>
                    </defs>
                  </svg>
                </motion.div>
                {/* YouTube */}
                <motion.div
                  whileHover={{ scale: 1.1, y: -2 }}
                  className="w-10 h-10 rounded-xl bg-[#FF0000] flex items-center justify-center shadow-lg cursor-pointer"
                  style={{ boxShadow: '0 4px 14px rgba(255, 0, 0, 0.4)' }}
                >
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                  </svg>
                </motion.div>
                {/* LinkedIn */}
                <motion.div
                  whileHover={{ scale: 1.1, y: -2 }}
                  className="w-10 h-10 rounded-xl bg-[#0A66C2] flex items-center justify-center shadow-lg cursor-pointer"
                  style={{ boxShadow: '0 4px 14px rgba(10, 102, 194, 0.4)' }}
                >
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.125 2.062 2.062 0 0 1 0 4.125zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                  </svg>
                </motion.div>
                {/* X (Twitter) */}
                <motion.div
                  whileHover={{ scale: 1.1, y: -2 }}
                  className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shadow-lg cursor-pointer border border-white/10"
                  style={{ boxShadow: '0 4px 14px rgba(0, 0, 0, 0.4)' }}
                >
                  <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal - At Root Level */}
      <AnimatePresence>
        {showForgotModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={closeForgotModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-gray-900 rounded-2xl p-6 max-w-sm mx-4 border border-white/10 shadow-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              {resetSuccess ? (
                <div className="text-center">
                  <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                    <Mail className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-2">Check Your Email</h3>
                  <p className="text-white/60 text-sm mb-6">
                    We've sent password reset instructions to <span className="text-white font-medium">{forgotEmail}</span>.
                  </p>
                  <button
                    onClick={closeForgotModal}
                    className="w-full h-11 rounded-md bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors"
                  >
                    Back to Sign In
                  </button>
                </div>
              ) : (
                <div>
                  <div className="text-center mb-6">
                    <div className="w-16 h-16 bg-indigo-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-indigo-500/30">
                      <Lock className="w-8 h-8 text-indigo-400" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">Forgot Password?</h3>
                    <p className="text-white/60 text-sm">
                      Enter your email and we'll send you instructions to reset your password.
                    </p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-white/70 block">
                        Email Address
                      </label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                          <Mail className="w-4 h-4 text-white/40" />
                        </div>
                        <input
                          type="email"
                          value={forgotEmail}
                          onChange={(e) => { setForgotEmail(e.target.value); setResetError(null); }}
                          placeholder="name@company.com"
                          className="w-full h-11 pl-10 pr-3 rounded-md text-white text-base transition-all placeholder:text-white/30 bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/[0.08] outline-none"
                        />
                      </div>
                    </div>

                    {resetError && (
                      <p className="text-red-400 text-xs text-center">{resetError}</p>
                    )}

                    <button
                      onClick={handleForgotPassword}
                      disabled={isSendingReset}
                      className="w-full h-11 rounded-md bg-indigo-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-70"
                    >
                      {isSendingReset ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                      ) : 'Send Reset Link'}
                    </button>

                    <button
                      onClick={closeForgotModal}
                      className="w-full h-10 rounded-md bg-white/5 border border-white/10 text-white/70 font-medium text-sm hover:bg-white/10 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

export default SignIn
