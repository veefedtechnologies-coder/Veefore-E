import React, { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Lock, Loader2, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'
import { useLocation, useSearch } from 'wouter'
import { confirmPasswordReset, verifyPasswordResetCode, auth } from '@/lib/firebase'
import { useToast } from '@/hooks/use-toast'

// ============================================
// PASSWORD VALIDATION (Matching SignUp)
// ============================================

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
        special: /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/`~;']/.test(password),
        typesCount: 0
    }

    requirements.typesCount = [
        requirements.uppercase,
        requirements.lowercase,
        requirements.number,
        requirements.special
    ].filter(Boolean).length

    if (!requirements.length) {
        return { valid: false, error: 'Password must be at least 8 characters', strength: 1, requirements }
    }

    if (requirements.typesCount < 3) {
        return { valid: false, error: 'Include at least 3 of: uppercase, lowercase, number, special character', strength: 2, requirements }
    }

    let strength = 3
    if (password.length >= 12) strength++
    if (password.length >= 16 && requirements.typesCount === 4) strength++

    return { valid: true, strength: Math.min(5, strength), requirements }
}

const ResetPassword = () => {
    const [, setLocation] = useLocation()
    const search = useSearch()
    const { toast } = useToast()

    // Parse URL parameters
    const params = new URLSearchParams(search)
    const oobCode = params.get('oobCode')
    const mode = params.get('mode')

    // State
    const [step, setStep] = useState<'loading' | 'form' | 'success' | 'error'>('loading')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirmPassword, setShowConfirmPassword] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Validate the reset code on mount
    useEffect(() => {
        const verifyCode = async () => {
            if (!oobCode || mode !== 'resetPassword') {
                setStep('error')
                setError('Invalid or expired password reset link.')
                return
            }

            try {
                const userEmail = await verifyPasswordResetCode(auth, oobCode)
                setEmail(userEmail)
                setStep('form')
            } catch (err: any) {
                console.error('Code verification error:', err)
                setStep('error')
                if (err?.code === 'auth/expired-action-code') {
                    setError('This password reset link has expired. Please request a new one.')
                } else if (err?.code === 'auth/invalid-action-code') {
                    setError('This password reset link is invalid or has already been used.')
                } else {
                    setError('Failed to verify reset link. Please try again.')
                }
            }
        }

        verifyCode()
    }, [oobCode, mode])

    // Password validation
    const passwordValidation = validatePassword(password)
    const passwordsMatch = password === confirmPassword && confirmPassword.length > 0

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError(null)

        if (!passwordValidation.valid) {
            setError(passwordValidation.error || 'Invalid password')
            return
        }

        if (!passwordsMatch) {
            setError('Passwords do not match')
            return
        }

        if (!oobCode) {
            setError('Invalid reset code')
            return
        }

        setIsSubmitting(true)
        try {
            await confirmPasswordReset(auth, oobCode, password)
            setStep('success')
            toast({ title: "Success", description: "Your password has been reset successfully!" })
        } catch (err: any) {
            console.error('Password reset error:', err)
            if (err?.code === 'auth/expired-action-code') {
                setError('This reset link has expired. Please request a new one.')
            } else if (err?.code === 'auth/weak-password') {
                setError('Password is too weak. Please choose a stronger password.')
            } else {
                setError('Failed to reset password. Please try again.')
            }
        } finally {
            setIsSubmitting(false)
        }
    }

    // Strength bar colors
    const getStrengthColor = (level: number) => {
        if (passwordValidation.strength >= level) {
            if (passwordValidation.strength <= 2) return 'bg-red-500'
            if (passwordValidation.strength <= 3) return 'bg-yellow-500'
            return 'bg-emerald-500'
        }
        return 'bg-white/10'
    }

    return (
        <div className="min-h-screen bg-black flex items-center justify-center px-4 py-8">
            {/* Background Effects */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-black to-blue-950/30" />
                <motion.div
                    className="absolute top-1/4 right-1/4 w-64 h-64 bg-teal-500/10 rounded-full blur-3xl"
                    animate={{ y: [0, -30, 0], opacity: [0.1, 0.2, 0.1] }}
                    transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="absolute bottom-1/4 left-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl"
                    animate={{ x: [0, 30, 0], opacity: [0.1, 0.15, 0.1] }}
                    transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
                />
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative z-10 w-full max-w-md"
            >
                {/* Logo */}
                <div className="flex items-center justify-center mb-8 cursor-pointer" onClick={() => setLocation('/')}>
                    <img src="/veefore.svg" alt="V" className="w-10 h-10" />
                    <span className="text-2xl font-bold text-white -ml-1">eefore</span>
                </div>

                {/* Card */}
                <div className="bg-gray-900/80 backdrop-blur-xl rounded-2xl border border-white/10 p-8 shadow-2xl">

                    {/* Loading State */}
                    {step === 'loading' && (
                        <div className="text-center py-8">
                            <Loader2 className="w-12 h-12 text-teal-400 animate-spin mx-auto mb-4" />
                            <p className="text-white/60">Verifying reset link...</p>
                        </div>
                    )}

                    {/* Error State */}
                    {step === 'error' && (
                        <div className="text-center py-4">
                            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                                <AlertCircle className="w-8 h-8 text-red-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">Reset Link Invalid</h2>
                            <p className="text-white/60 text-sm mb-6">{error}</p>
                            <button
                                onClick={() => setLocation('/signin')}
                                className="w-full h-11 rounded-md bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                Back to Sign In
                            </button>
                        </div>
                    )}

                    {/* Success State */}
                    {step === 'success' && (
                        <div className="text-center py-4">
                            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-500/30">
                                <CheckCircle className="w-8 h-8 text-emerald-400" />
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">Password Reset Complete</h2>
                            <p className="text-white/60 text-sm mb-6">
                                Your password has been successfully reset. You can now sign in with your new password.
                            </p>
                            <button
                                onClick={() => setLocation('/signin')}
                                className="w-full h-11 rounded-md bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-colors"
                            >
                                Sign In Now
                            </button>
                        </div>
                    )}

                    {/* Form State */}
                    {step === 'form' && (
                        <>
                            <div className="text-center mb-6">
                                <div className="w-16 h-16 bg-teal-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-teal-500/30">
                                    <Lock className="w-8 h-8 text-teal-400" />
                                </div>
                                <h2 className="text-xl font-bold text-white mb-2">Create New Password</h2>
                                <p className="text-white/60 text-sm">
                                    Enter a new password for <span className="text-white font-medium">{email}</span>
                                </p>
                            </div>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                {/* New Password */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-white/70 block">
                                        New Password <span className="text-red-400">*</span>
                                    </label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                                            <Lock className="w-4 h-4 text-white/40" />
                                        </div>
                                        <input
                                            type={showPassword ? 'text' : 'password'}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="Enter new password"
                                            autoComplete="new-password"
                                            className="w-full h-11 pl-10 pr-10 rounded-md text-white text-base transition-all placeholder:text-white/30 bg-white/5 border border-white/10 focus:border-teal-500/50 focus:bg-white/[0.08] outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
                                        >
                                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>

                                    {/* Password Strength Bar */}
                                    {password && (
                                        <div className="pt-2">
                                            <div className="flex gap-1 h-1">
                                                {[1, 2, 3, 4, 5].map((level) => (
                                                    <div key={level} className={`flex-1 rounded-full transition-colors ${getStrengthColor(level)}`} />
                                                ))}
                                            </div>
                                            <p className={`text-xs mt-1 ${passwordValidation.valid ? 'text-emerald-400' : 'text-white/50'}`}>
                                                {passwordValidation.valid ? 'Strong password' : passwordValidation.error}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                {/* Confirm Password */}
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-white/70 block">
                                        Confirm Password <span className="text-red-400">*</span>
                                    </label>
                                    <div className="relative">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2">
                                            <Lock className="w-4 h-4 text-white/40" />
                                        </div>
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="Confirm new password"
                                            autoComplete="new-password"
                                            className={`w-full h-11 pl-10 pr-10 rounded-md text-white text-base transition-all placeholder:text-white/30 bg-white/5 border ${confirmPassword && !passwordsMatch ? 'border-red-500/50' : 'border-white/10'
                                                } focus:border-teal-500/50 focus:bg-white/[0.08] outline-none`}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/60 transition-colors"
                                        >
                                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    {confirmPassword && !passwordsMatch && (
                                        <p className="text-red-400 text-xs">Passwords do not match</p>
                                    )}
                                    {passwordsMatch && (
                                        <p className="text-emerald-400 text-xs flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" /> Passwords match
                                        </p>
                                    )}
                                </div>

                                {/* Error Message */}
                                {error && (
                                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                        <p className="text-red-400 text-sm">{error}</p>
                                    </div>
                                )}

                                {/* Submit Button */}
                                <button
                                    type="submit"
                                    disabled={isSubmitting || !passwordValidation.valid || !passwordsMatch}
                                    className="w-full h-11 rounded-md bg-teal-600 text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? (
                                        <><Loader2 className="w-4 h-4 animate-spin" /> Resetting Password...</>
                                    ) : 'Reset Password'}
                                </button>

                                {/* Back to Sign In */}
                                <button
                                    type="button"
                                    onClick={() => setLocation('/signin')}
                                    className="w-full h-10 rounded-md bg-white/5 border border-white/10 text-white/70 font-medium text-sm hover:bg-white/10 transition-colors flex items-center justify-center gap-2"
                                >
                                    <ArrowLeft className="w-4 h-4" />
                                    Back to Sign In
                                </button>
                            </form>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="mt-6 flex justify-center gap-6 text-xs text-white/30">
                    <span onClick={() => setLocation('/terms-of-service')} className="hover:text-white transition-colors cursor-pointer">Terms</span>
                    <span onClick={() => setLocation('/privacy-policy')} className="hover:text-white transition-colors cursor-pointer">Privacy</span>
                    <span onClick={() => setLocation('/security')} className="hover:text-white transition-colors cursor-pointer">Security</span>
                </div>
            </motion.div>
        </div>
    )
}

export default ResetPassword
