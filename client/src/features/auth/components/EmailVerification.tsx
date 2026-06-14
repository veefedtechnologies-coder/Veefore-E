import { useState, useEffect, FormEvent } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Mail, Timer, Loader2, ArrowLeft } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

/**
 * EmailVerification Component
 * 
 * Handles email verification with 6-digit PIN entry and resend functionality.
 * Implements rate limiting UI with countdown timers for expiry and resend.
 * 
 * Requirements:
 * - 2.2: Large file decomposition - extracted from SignUpIntegrated.tsx
 * - 5.3: Component architecture optimization - focused component with single responsibility
 */

interface EmailVerificationProps {
  /** Email address to verify */
  email: string
  /** Callback fired when verification is successful */
  onVerificationSuccess: () => void
  /** Callback fired when user wants to go back */
  onBack?: () => void
  /** Development mode OTP for testing (optional) */
  developmentOtp?: string
  /** Custom className for styling */
  className?: string
}

interface VerificationState {
  code: string
  expiryTime: number  // seconds remaining
  resendCooldown: number  // seconds remaining
  developmentOtp: string
}

const EXPIRY_DURATION = 900 // 15 minutes in seconds
const RESEND_COOLDOWN = 60 // 60 seconds cooldown

/**
 * Format seconds into MM:SS format
 */
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

/**
 * EmailVerification Component
 * 
 * Features:
 * - 6-digit PIN entry with automatic formatting
 * - Visual countdown timer for code expiry
 * - Resend functionality with rate limiting
 * - Accessibility: keyboard navigation, ARIA labels
 * - Real-time validation feedback
 */
export function EmailVerification({
  email,
  onVerificationSuccess,
  onBack,
  developmentOtp = '',
  className = ''
}: EmailVerificationProps) {
  const [state, setState] = useState<VerificationState>({
    code: '',
    expiryTime: EXPIRY_DURATION,
    resendCooldown: RESEND_COOLDOWN,
    developmentOtp
  })
  const [errors, setErrors] = useState<string>('')
  const [isVerifying, setIsVerifying] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const { toast } = useToast()

  const isLoading = isVerifying || isResending

  // Persistence keys for localStorage
  const STORAGE_KEY = 'email_verification_state'

  /**
   * Load persisted verification state on mount
   */
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const { timestamp, devOtp } = JSON.parse(saved)
        const now = Date.now()
        const elapsedSeconds = Math.floor((now - timestamp) / 1000)

        // Only restore if not expired
        if (elapsedSeconds < EXPIRY_DURATION) {
          setState(prev => ({
            ...prev,
            expiryTime: Math.max(0, EXPIRY_DURATION - elapsedSeconds),
            resendCooldown: Math.max(0, RESEND_COOLDOWN - elapsedSeconds),
            developmentOtp: devOtp || developmentOtp
          }))
        } else {
          localStorage.removeItem(STORAGE_KEY)
        }
      }
    } catch (e) {
      console.warn('Failed to load verification state', e)
    }
  }, [developmentOtp])

  /**
   * Save verification state to localStorage
   */
  const saveState = (devOtp: string = state.developmentOtp) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        timestamp: Date.now(),
        devOtp
      }))
    } catch (e) {
      console.warn('Failed to save verification state', e)
    }
  }

  /**
   * Clear verification state from localStorage
   */
  const clearState = () => {
    localStorage.removeItem(STORAGE_KEY)
  }

  /**
   * Update countdown timers every second
   */
  useEffect(() => {
    const interval = setInterval(() => {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const { timestamp } = JSON.parse(saved)
        const now = Date.now()
        const elapsedSeconds = Math.floor((now - timestamp) / 1000)

        setState(prev => ({
          ...prev,
          expiryTime: Math.max(0, EXPIRY_DURATION - elapsedSeconds),
          resendCooldown: Math.max(0, RESEND_COOLDOWN - elapsedSeconds)
        }))
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  /**
   * Handle code input change
   * - Only allows numeric input
   * - Limits to 6 digits
   * - Clears errors on change
   */
  const handleCodeChange = (value: string) => {
    const sanitized = value.replace(/\D/g, '').slice(0, 6)
    setState(prev => ({ ...prev, code: sanitized }))
    if (errors) setErrors('')
  }

  /**
   * Handle verification form submission
   */
  const handleVerify = async (e: FormEvent) => {
    e.preventDefault()

    // Validate code format
    if (!state.code || state.code.length !== 6) {
      setErrors('Please enter the 6-digit verification code')
      return
    }

    // Check if code has expired
    if (state.expiryTime <= 0) {
      setErrors('This code has expired. Please request a new one.')
      return
    }

    setIsVerifying(true)
    setErrors('')

    try {
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          code: state.code
        })
      })

      const data = await response.json()

      if (!response.ok) {
        // Parse nested error object from BaseController
        const message = data.error?.message || data.message || 'Verification failed'
        throw new Error(message)
      }

      // Success!
      toast({
        title: "Email verified!",
        description: "Your email has been successfully verified.",
      })

      clearState()
      onVerificationSuccess()

    } catch (error: any) {
      console.error('Verification error:', error)
      
      // User-friendly error messages
      let errorMessage = 'Verification failed. Please try again.'
      
      if (error.message.includes('expired')) {
        errorMessage = 'This code has expired. Please request a new one.'
      } else if (error.message.includes('Invalid verification code') || error.message.includes('invalid')) {
        errorMessage = 'Incorrect code. Please check and try again.'
      } else if (error.message.includes('NOT_ON_WAITLIST')) {
        errorMessage = '🚫 Access Denied - This email isn\'t on our waitlist. Join at veefore.com/waitlist!'
      } else if (error.message.includes('PENDING_APPROVAL')) {
        errorMessage = '⏳ Almost There! Your application is under review. We\'ll email you once approved.'
      } else if (error.message.includes('ACCESS_REJECTED')) {
        errorMessage = '😔 Unfortunately, your application wasn\'t approved. Contact support@veefore.com.'
      }

      setErrors(errorMessage)
      
      toast({
        title: "Verification Failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsVerifying(false)
    }
  }

  /**
   * Handle resend verification code
   * - Respects cooldown period
   * - Resets timers on success
   */
  const handleResend = async () => {
    // Check cooldown
    if (state.resendCooldown > 0) {
      return
    }

    setIsResending(true)
    setErrors('')

    try {
      const response = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          firstName: email.split('@')[0] // Extract first part of email as fallback name
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || 'Failed to resend code')
      }

      // Reset state and timers
      setState(prev => ({
        ...prev,
        code: '',
        expiryTime: EXPIRY_DURATION,
        resendCooldown: RESEND_COOLDOWN,
        developmentOtp: data.developmentOtp || ''
      }))

      // Save new timestamp
      saveState(data.developmentOtp || '')

      toast({
        title: "Code resent!",
        description: "Check your email for the new verification code.",
      })

      // Show dev OTP in development mode
      if (process.env.NODE_ENV === 'development' && data.developmentOtp) {
        console.log('Development OTP:', data.developmentOtp)
        toast({
          title: "Development Mode",
          description: `OTP: ${data.developmentOtp}`,
        })
      }

    } catch (error: any) {
      console.error('Resend error:', error)
      
      toast({
        title: "Resend Failed",
        description: error.message || "Could not resend verification code.",
        variant: "destructive",
      })
    } finally {
      setIsResending(false)
    }
  }

  /**
   * Handle clicking the development OTP (auto-fill)
   */
  const handleDevOtpClick = () => {
    if (state.developmentOtp) {
      setState(prev => ({ ...prev, code: state.developmentOtp }))
    }
  }

  return (
    <motion.div
      key="verification"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className={`space-y-6 py-8 ${className}`}
    >
      {/* Header */}
      <div className="text-center">
        <div 
          className="w-16 h-16 bg-teal-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-teal-500/30"
          role="img"
          aria-label="Email verification icon"
        >
          <Mail className="w-8 h-8 text-teal-400" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2">
          Check Your Email
        </h2>
        <p className="text-white/50 text-sm">
          We sent a verification code to<br />
          <span className="text-white font-medium">{email}</span>
        </p>
      </div>

      {/* Verification Form */}
      <form onSubmit={handleVerify} className="space-y-5">
        {/* PIN Input */}
        <div className="space-y-2">
          <label htmlFor="verification-code" className="sr-only">
            Enter 6-digit verification code
          </label>
          <input
            id="verification-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={state.code}
            onChange={(e) => handleCodeChange(e.target.value)}
            placeholder="000000"
            className="w-full h-14 rounded-md text-white text-3xl font-mono text-center tracking-[0.5em] transition-all bg-white/5 border border-white/10 focus:border-teal-500/50 focus:bg-white/[0.08] outline-none placeholder:tracking-widest placeholder:text-white/10"
            maxLength={6}
            disabled={isLoading}
            autoComplete="one-time-code"
            aria-invalid={!!errors}
            aria-describedby={errors ? "code-error" : "code-expiry"}
          />
          
          {/* Error Message */}
          <AnimatePresence>
            {errors && (
              <motion.p
                id="code-error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-red-400 text-xs text-center"
                role="alert"
              >
                {errors}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Development Mode OTP Display */}
        {process.env.NODE_ENV === 'development' && state.developmentOtp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-2 text-center cursor-pointer hover:bg-yellow-500/20 transition-colors"
            onClick={handleDevOtpClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleDevOtpClick()}
            aria-label="Click to auto-fill development OTP"
          >
            <div className="text-yellow-400 text-[10px] font-medium uppercase tracking-wider">
              Dev Mode OTP (Click to Fill)
            </div>
            <div className="text-yellow-300 text-base font-mono font-bold tracking-widest">
              {state.developmentOtp}
            </div>
          </motion.div>
        )}

        {/* Expiry Timer */}
        <div 
          id="code-expiry"
          className="flex items-center justify-center gap-2 text-white/50 text-xs"
          role="timer"
          aria-live="polite"
          aria-atomic="true"
        >
          <Timer className="w-3 h-3" aria-hidden="true" />
          <span>
            {state.expiryTime > 0 
              ? `Expires in ${formatTime(state.expiryTime)}`
              : 'Code expired'
            }
          </span>
        </div>

        {/* Verify Button */}
        <button
          type="submit"
          disabled={isVerifying || state.code.length !== 6 || state.expiryTime <= 0}
          className="w-full h-11 rounded-md bg-gradient-to-r from-teal-500 to-emerald-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:from-teal-600 hover:to-emerald-700 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          aria-busy={isVerifying}
        >
          {isVerifying ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Verifying...
            </>
          ) : (
            'Verify & Create Account'
          )}
        </button>

        {/* Resend and Back Actions */}
        <div className="space-y-3 text-center">
          {/* Resend Button */}
          <button
            type="button"
            onClick={handleResend}
            disabled={state.resendCooldown > 0 || isResending}
            className="text-teal-400 hover:text-teal-300 font-medium text-xs hover:underline disabled:opacity-50 disabled:no-underline disabled:hover:text-teal-400 disabled:cursor-not-allowed"
            aria-label={
              state.resendCooldown > 0 
                ? `Resend available in ${formatTime(state.resendCooldown)}`
                : 'Resend verification code'
            }
          >
            {isResending ? (
              'Sending...'
            ) : state.resendCooldown > 0 ? (
              `Resend in ${formatTime(state.resendCooldown)}`
            ) : (
              'Resend code'
            )}
          </button>

          {/* Back Button */}
          {onBack && (
            <div>
              <button
                type="button"
                onClick={() => {
                  clearState()
                  onBack()
                }}
                className="text-white/40 hover:text-white/60 text-xs transition-colors inline-flex items-center gap-1"
                aria-label="Go back to sign up form"
              >
                <ArrowLeft className="w-3 h-3" aria-hidden="true" />
                Back to form
              </button>
            </div>
          )}
        </div>
      </form>
    </motion.div>
  )
}

export default EmailVerification
