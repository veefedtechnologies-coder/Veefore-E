import { useState, useEffect } from "react"
import { useToast } from "@/hooks/use-toast"
import { Mail, ArrowLeft, Eye, EyeOff, User, Lock, Sparkles, ArrowRight, Shield, Heart, Crown, TrendingUp, Zap, Users, BarChart3, Rocket, Star, Award, CheckCircle, Timer } from "lucide-react"
import { useFirebaseAuth } from "@/hooks/useFirebaseAuth"
import { createUserWithEmailAndPassword } from "firebase/auth"
import { auth } from "@/lib/firebase"
import { useLocation } from "wouter"
import { motion, AnimatePresence } from "framer-motion"

const validateEmail = (email: string) => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

// Step types for the signup flow
type SignupStep = 'form' | 'verification' | 'creating'

function SignUpIntegrated() {
  const [currentStep, setCurrentStep] = useState<SignupStep>('form')
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    password: ''
  })
  const [otpData, setOtpData] = useState({
    code: '',
    timeRemaining: 0,
    canResend: false,
    developmentOtp: '' // Store development OTP for display
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  // Remove state variables that cause re-renders
  // const [currentFeature, setCurrentFeature] = useState(0)
  // const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  // const [typedText, setTypedText] = useState('')
  // const [isTyping, setIsTyping] = useState(false)
  
  const { toast } = useToast()
  const { user } = useFirebaseAuth()
  const [, setLocation] = useLocation()

  // Handle URL parameters for pre-filling email
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const email = urlParams.get('email')
    if (email && validateEmail(email)) {
      setFormData(prev => ({ ...prev, email }))
    }
  }, [])

  // Unique feature highlights for signup (different from sign in)
  const signupFeatures = [
    {
      title: "Start with AI Content",
      description: "Generate your first 100 posts instantly",
      icon: Rocket,
      color: "from-emerald-500 to-teal-600",
      benefit: "Save 20+ hours weekly"
    },
    {
      title: "Multi-Platform Ready",
      description: "Connect Instagram, Twitter, LinkedIn instantly",
      icon: Users,
      color: "from-blue-500 to-indigo-600", 
      benefit: "3x faster growth"
    },
    {
      title: "Smart Analytics",
      description: "Get insights from day one",
      icon: BarChart3,
      color: "from-purple-500 to-violet-600",
      benefit: "+340% engagement"
    },
    {
      title: "Team Collaboration",
      description: "Invite teammates and clients",
      icon: Star,
      color: "from-orange-500 to-red-600",
      benefit: "Enterprise ready"
    }
  ]

  // OTP Timer countdown
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (currentStep === 'verification' && otpData.timeRemaining > 0) {
      interval = setInterval(() => {
        setOtpData(prev => {
          const newTime = prev.timeRemaining - 1
          if (newTime <= 0) {
            return { ...prev, timeRemaining: 0, canResend: true }
          }
          return { ...prev, timeRemaining: newTime }
        })
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [currentStep, otpData.timeRemaining])

  // Remove mouse tracking to prevent re-renders
  // useEffect(() => {
  //   let timeoutId: NodeJS.Timeout
  //   const handleMouseMove = (e: MouseEvent) => {
  //     clearTimeout(timeoutId)
  //     timeoutId = setTimeout(() => {
  //       setMousePosition({ x: e.clientX, y: e.clientY })
  //     }, 100)
  //   }
  //   window.addEventListener('mousemove', handleMouseMove)
  //   return () => {
  //     window.removeEventListener('mousemove', handleMouseMove)
  //     clearTimeout(timeoutId)
  //   }
  // }, [])

  // Remove auto-advance features to prevent re-renders
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     setCurrentFeature((prev) => (prev + 1) % signupFeatures.length)
  //   }, 3500)
  //   return () => clearInterval(interval)
  // }, [])

  // Remove typing animation to prevent re-renders
  // useEffect(() => {
  //   const messages = [
  //     "Join 500+ growing businesses",
  //     "Start your AI transformation today",
  //     "Everything you need to succeed",
  //     "Professional tools, instant results"
  //   ]
  //   
  //   let messageIndex = 0
  //   let charIndex = 0
  //   let isDeleting = false
  //   let timeoutId: NodeJS.Timeout
  //   
  //   const typeWriter = () => {
  //     const currentMessage = messages[messageIndex]
  //     
  //     if (!isDeleting && charIndex < currentMessage.length) {
  //       setTypedText(currentMessage.substring(0, charIndex + 1))
  //       setIsTyping(true)
  //       charIndex++
  //       timeoutId = setTimeout(typeWriter, 120)
  //     } else if (isDeleting && charIndex > 0) {
  //       setTypedText(currentMessage.substring(0, charIndex - 1))
  //       charIndex--
  //       timeoutId = setTimeout(typeWriter, 60)
  //     } else if (!isDeleting && charIndex === currentMessage.length) {
  //       setIsTyping(false)
  //       timeoutId = setTimeout(() => {
  //         isDeleting = true
  //         typeWriter()
  //       }, 1500)
  //     } else if (isDeleting && charIndex === 0) {
  //       isDeleting = false
  //       messageIndex = (messageIndex + 1) % messages.length
  //       timeoutId = setTimeout(typeWriter, 300)
  //     }
  //   }
  //   
  //   timeoutId = setTimeout(typeWriter, 800)
  //   return () => clearTimeout(timeoutId)
  // }, [])

  // Show loading state when we have a user
  if (user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-emerald-50/30 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <motion.div 
            className="w-20 h-20 border-4 border-emerald-200 border-t-emerald-600 rounded-full mx-auto mb-8"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <motion.h1 
            className="text-3xl font-bold text-gray-900 mb-4"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Setting up your workspace
          </motion.h1>
          <p className="text-gray-600 text-lg">Welcome to VeeFore!</p>
        </motion.div>
      </div>
    )
  }

  const handleBackToLanding = () => {
    setLocation('/')
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.fullName.trim()) {
      newErrors.fullName = 'Full name is required'
    }
    
    if (!formData.email) {
      newErrors.email = 'Email is required'
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }
    
    if (!formData.password) {
      newErrors.password = 'Password is required'
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (validateForm()) {
      setIsLoading(true)
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

        if (!response.ok) {
          if (data.userExists && data.shouldSignIn) {
            setErrors({ email: 'An account with this email already exists. Please sign in instead.' })
            return
          }
          throw new Error(data.message || 'Failed to send verification email')
        }

        // Start OTP timer (15 minutes)
        setOtpData({
          code: '',
          timeRemaining: 900, // 15 minutes
          canResend: false,
          developmentOtp: data.developmentOtp || '' // Store development OTP
        })

        setCurrentStep('verification')
        
        toast({
          title: "Verification email sent!",
          description: `Please check your email at ${formData.email} for the verification code.`,
        })

        // Show development OTP in console/toast for testing
        if (data.developmentOtp) {
          console.log('Development OTP:', data.developmentOtp)
          toast({
            title: "Development Mode",
            description: `OTP: ${data.developmentOtp}`,
            variant: "default",
          })
        }

      } catch (error: any) {
        console.error('❌ Send OTP error:', error)
        setErrors({ email: error.message })
      } finally {
        setIsLoading(false)
      }
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!otpData.code || otpData.code.length !== 6) {
      setErrors({ otp: 'Please enter the 6-digit verification code' })
      return
    }

    setIsLoading(true)
    setCurrentStep('creating')
    
    try {
      // First verify the OTP with backend
      const verifyResponse = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          code: otpData.code
        })
      })

      const verifyData = await verifyResponse.json()

      if (!verifyResponse.ok) {
        throw new Error(verifyData.message || 'Invalid verification code')
      }

      // Now create Firebase account
      const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password)
      console.log('✅ Firebase user created successfully:', userCredential.user.uid)

      // Update backend with Firebase UID - with proper error handling and timeout
      console.log('🔗 Linking Firebase account to backend...')
      
      // Use AbortController to cancel the request if timeout occurs
      const abortController = new AbortController()
      const timeoutId = setTimeout(() => abortController.abort(), 15000)
      
      try {
        const linkResponse = await fetch('/api/auth/link-firebase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            firebaseUid: userCredential.user.uid,
            displayName: formData.fullName
          }),
          signal: abortController.signal
        })

        clearTimeout(timeoutId)

        if (!linkResponse.ok) {
          const errorData = await linkResponse.json().catch(() => ({ message: 'Failed to link account' }))
          throw new Error(errorData.message || 'Failed to create account in database')
        }

        const linkData = await linkResponse.json()
        console.log('✅ Account linked successfully:', linkData)
        
        toast({
          title: "Account created successfully!",
          description: "Welcome to VeeFore! Let's get you set up.",
        })
        
        // Wait a moment to ensure backend is ready, then redirect
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // The app will automatically redirect and show onboarding modal
        setLocation('/')
      } catch (fetchError: any) {
        clearTimeout(timeoutId)
        
        // Handle AbortController timeout
        if (fetchError.name === 'AbortError') {
          throw new Error('timeout')
        }
        throw fetchError
      }

    } catch (error: any) {
      console.error('❌ Verification error:', error)
      setCurrentStep('verification') // Go back to verification step
      
      let errorMessage = 'Verification failed. Please try again.'
      let toastTitle = "Verification Failed"
      
      if (error.message === 'timeout') {
        errorMessage = 'Account creation is taking longer than expected. Please try signing in - your account may have been created.'
        toastTitle = "Request Timeout"
      } else if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'An account with this email already exists. Please try signing in instead.'
      } else if (error.message.includes('expired') || error.message.includes('invalid')) {
        errorMessage = 'Invalid or expired verification code. Please try again.'
      } else if (error.message.includes('timeout')) {
        errorMessage = 'The request timed out. Please try signing in - your account may have been created.'
        toastTitle = "Request Timeout"
      }
      
      setErrors({ otp: errorMessage })
      toast({
        title: toastTitle,
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendOtp = async () => {
    if (!otpData.canResend) return

    setIsLoading(true)
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
          timeRemaining: 900, // Reset to 15 minutes
          canResend: false,
          developmentOtp: data.developmentOtp || '' // Store new development OTP
        })

        toast({
          title: "Verification code resent!",
          description: "Please check your email for the new verification code.",
        })

        // Show development OTP for testing
        if (data.developmentOtp) {
          console.log('Development OTP:', data.developmentOtp)
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to resend verification code. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-emerald-50/50 relative overflow-hidden">
      {/* Unique Background - Different from Sign In */}
      <div className="absolute inset-0">
        {/* Different gradient pattern */}
        <div className="absolute inset-0 bg-gradient-to-tr from-emerald-50/60 via-white to-blue-50/40" />
        
        {/* Unique floating shapes */}
        <div 
          className="absolute w-[500px] h-[500px] rounded-full bg-gradient-to-r from-emerald-100/30 to-teal-100/40 blur-3xl"
          style={{
            right: '20%',
            top: '10%',
            transform: 'translate(50%, -50%)'
          }}
        />
        <div 
          className="absolute w-[400px] h-[400px] rounded-full bg-gradient-to-r from-blue-100/40 to-indigo-100/30 blur-2xl"
          style={{
            left: '15%',
            bottom: '20%',
            transform: 'translate(-50%, 50%)'
          }}
        />

        {/* Different pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `
            radial-gradient(circle at 3px 3px, rgba(16, 185, 129, 0.4) 1px, transparent 0),
            linear-gradient(45deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px, 25px 25px',
        }} />

        {/* Unique animated elements */}
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full opacity-40"
            style={{
              left: `${15 + (i * 8)}%`,
              top: `${30 + Math.cos(i) * 25}%`,
            }}
            animate={{
              y: [0, -30, 0],
              opacity: [0.4, 0.8, 0.4],
              scale: [1, 1.2, 1]
            }}
            transition={{
              duration: 4 + (i % 2),
              repeat: Infinity,
              delay: i * 0.3
            }}
          />
        ))}
      </div>

      {/* Different Navigation Style */}
      <nav className="relative z-50 w-full px-8 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button 
            onClick={handleBackToLanding}
            className="group flex items-center space-x-3 text-gray-700 hover:text-gray-900 transition-all duration-300"
          >
            <div className="w-12 h-12 rounded-xl bg-white shadow-lg border border-gray-100 flex items-center justify-center group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
              <ArrowLeft className="w-6 h-6" />
            </div>
            <span className="font-semibold text-lg">Back</span>
          </button>

          <div className="flex items-center space-x-3 bg-white shadow-lg rounded-xl px-5 py-3 border border-gray-100">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
              V
            </div>
            <span className="text-xl font-bold text-gray-900">VeeFore</span>
            <div className="text-xs text-emerald-600 font-medium bg-emerald-50 px-2 py-1 rounded-full">BETA</div>
          </div>

          <motion.button
            onClick={() => setLocation('/signin')}
            className="bg-gray-900 hover:bg-gray-800 text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Sign In
          </motion.button>
        </div>
      </nav>

      <div className="flex min-h-[calc(100vh-120px)] relative z-40">
        {/* Left Side - Unique Signup Experience */}
        <div className="lg:w-1/2 flex flex-col justify-center p-8 lg:p-16 relative">
          {/* Different Hero Content */}
          <div className="max-w-xl">
            {/* Unique Status Badge */}
            <motion.div 
              className="inline-flex items-center bg-white shadow-lg rounded-full px-6 py-3 mb-8 border border-gray-200 group hover:shadow-xl transition-all duration-500"
              whileHover={{ scale: 1.05 }}
            >
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
                  <div className="absolute inset-0 w-3 h-3 bg-emerald-400 rounded-full animate-ping opacity-30" />
                </div>
                <span className="text-gray-800 font-medium text-base min-w-[280px] text-left">
                  Join thousands of creators building their brand
                </span>
                <Sparkles className="w-4 h-4 text-emerald-500 group-hover:rotate-12 transition-transform duration-500" />
              </div>
            </motion.div>

            <h1 className="text-5xl lg:text-6xl font-black mb-6 leading-tight">
              <span className="block text-gray-900 mb-3">
                Transform Your
              </span>
              <span className="block bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 bg-clip-text text-transparent mb-3">
                Social Media
              </span>
              <span className="block text-gray-700 text-3xl lg:text-4xl font-semibold">
                with AI Power
              </span>
            </h1>

            <p className="text-xl text-gray-600 leading-relaxed mb-8 max-w-lg">
              Join thousands of creators and businesses who've revolutionized their content strategy with our AI-powered platform.
            </p>

            {/* Unique Benefits Grid */}
            <div className="grid grid-cols-2 gap-4 mb-12">
              {[
                { icon: CheckCircle, text: "AI Content Generation", color: "text-emerald-600" },
                { icon: Zap, text: "Auto Scheduling", color: "text-blue-600" },
                { icon: TrendingUp, text: "Growth Analytics", color: "text-purple-600" },
                { icon: Shield, text: "Enterprise Security", color: "text-gray-600" }
              ].map((benefit, index) => (
                <motion.div
                  key={benefit.text}
                  className="flex items-center space-x-3"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <benefit.icon className={`w-5 h-5 ${benefit.color}`} />
                  <span className="text-gray-700 font-medium">{benefit.text}</span>
                </motion.div>
              ))}
            </div>

            {/* Interactive Feature Showcase */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
              <div className="p-6">
                <div className="flex items-center space-x-4 mb-4">
                  <motion.div 
                    className={`w-12 h-12 rounded-xl bg-gradient-to-r ${signupFeatures[0].color} flex items-center justify-center shadow-lg`}
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    {(() => {
                      const IconComponent = signupFeatures[0].icon;
                      return <IconComponent className="w-6 h-6 text-white" />;
                    })()}
                  </motion.div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{signupFeatures[0].title}</h3>
                    <p className="text-gray-600 text-sm">{signupFeatures[0].description}</p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 font-medium">Expected Result:</span>
                    <span className="text-emerald-600 font-bold">{signupFeatures[0].benefit}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full mt-3">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: '85%' }}
                      transition={{ duration: 1.5, delay: 0.5 }}
                    />
                  </div>
                </div>

                {/* Feature indicators */}
                <div className="flex space-x-2 mt-4">
                  {signupFeatures.map((_, index) => (
                    <div
                      key={index}
                      className={`w-2 h-2 rounded-full transition-all duration-300 ${
                        index === 0 ? 'bg-emerald-500 scale-125' : 'bg-gray-300'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Side - Multi-Step Signup Form */}
        <div className="lg:w-1/2 flex items-center justify-center p-8 lg:p-16">
          <div className="w-full max-w-md">
            <motion.div
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.8 }}
              className="relative"
            >
              {/* Different glow effect */}
              <div className="absolute -inset-2 bg-gradient-to-r from-emerald-200/40 via-teal-200/40 to-blue-200/40 rounded-3xl blur-xl opacity-70" />
              
              <div className="relative bg-white rounded-2xl p-8 shadow-2xl border border-gray-200">
                {/* Step-based Content */}
                <AnimatePresence mode="wait">
                  {currentStep === 'form' && (
                    <motion.div
                      key="form"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      {/* Form Header */}
                      <div className="text-center mb-8">
                        <div className="inline-flex items-center space-x-2 bg-emerald-50 rounded-full px-4 py-2 border border-emerald-200 mb-6">
                          <Crown className="w-4 h-4 text-emerald-600" />
                          <span className="text-emerald-700 font-semibold text-sm">Free Trial • No Credit Card</span>
                        </div>
                        
                        <h1 className="text-3xl font-black text-gray-900 mb-3">
                          Get Started Free
                        </h1>
                        <p className="text-gray-600 font-medium">
                          Create your account in 30 seconds
                        </p>
                      </div>

                      {/* Signup Form */}
                      <form onSubmit={handleSendOtp} className="space-y-5">
                        {/* Name Field */}
                        <div className="relative">
                          <div className="absolute inset-0 bg-gray-50 rounded-xl border border-gray-200" />
                          <div className="relative z-10 flex items-center p-4">
                            <User className="w-5 h-5 text-gray-400 mr-3" />
                            <input
                              id="fullName"
                              name="fullName"
                              type="text"
                              value={formData.fullName}
                              onChange={(e) => handleInputChange('fullName', e.target.value)}
                              placeholder="Your full name"
                              className="flex-1 bg-transparent border-0 outline-none text-gray-900 placeholder-gray-500 font-medium"
                              disabled={isLoading}
                            />
                          </div>
                          {errors.fullName && (
                            <p className="text-red-500 text-sm mt-2 ml-4">{errors.fullName}</p>
                          )}
                        </div>

                        {/* Email Field */}
                        <div className="relative">
                          <div className="absolute inset-0 bg-gray-50 rounded-xl border border-gray-200" />
                          <div className="relative z-10 flex items-center p-4">
                            <Mail className="w-5 h-5 text-gray-400 mr-3" />
                            <input
                              id="email"
                              name="email"
                              type="email"
                              value={formData.email}
                              onChange={(e) => handleInputChange('email', e.target.value)}
                              placeholder="Your email address"
                              className="flex-1 bg-transparent border-0 outline-none text-gray-900 placeholder-gray-500 font-medium"
                              disabled={isLoading}
                            />
                          </div>
                          {errors.email && (
                            <p className="text-red-500 text-sm mt-2 ml-4">{errors.email}</p>
                          )}
                        </div>

                        {/* Password Field */}
                        <div className="relative">
                          <div className="absolute inset-0 bg-gray-50 rounded-xl border border-gray-200" />
                          <div className="relative z-10 flex items-center p-4">
                            <Lock className="w-5 h-5 text-gray-400 mr-3" />
                            <input
                              id="password"
                              name="password"
                              type={showPassword ? "text" : "password"}
                              value={formData.password}
                              onChange={(e) => handleInputChange('password', e.target.value)}
                              placeholder="Create a password"
                              className="flex-1 bg-transparent border-0 outline-none text-gray-900 placeholder-gray-500 font-medium"
                              disabled={isLoading}
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                              disabled={isLoading}
                            >
                              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                            </button>
                          </div>
                          {errors.password && (
                            <p className="text-red-500 text-sm mt-2 ml-4">{errors.password}</p>
                          )}
                        </div>

                        {/* Send Verification Button */}
                        <motion.button
                          type="submit"
                          disabled={isLoading}
                          className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-4 rounded-xl font-bold text-base transition-all shadow-lg hover:shadow-xl disabled:opacity-50 relative overflow-hidden group"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                          {isLoading ? (
                            <div className="flex items-center justify-center space-x-3 relative z-10">
                              <motion.div 
                                className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                              />
                              <span>Sending verification...</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center space-x-3 relative z-10">
                              <Mail className="w-5 h-5" />
                              <span>Send Verification Code</span>
                              <ArrowRight className="w-5 h-5" />
                            </div>
                          )}
                        </motion.button>
                      </form>
                    </motion.div>
                  )}

                  {currentStep === 'verification' && (
                    <motion.div
                      key="verification"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.3 }}
                    >
                      {/* Verification Header */}
                      <div className="text-center mb-8">
                        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-200">
                          <Mail className="w-8 h-8 text-emerald-600" />
                        </div>
                        
                        <h1 className="text-3xl font-black text-gray-900 mb-3">
                          Check Your Email
                        </h1>
                        <p className="text-gray-600 font-medium">
                          We sent a verification code to<br />
                          <span className="font-bold text-gray-900">{formData.email}</span>
                        </p>
                      </div>

                      {/* OTP Form */}
                      <form onSubmit={handleVerifyOtp} className="space-y-6">
                        <div className="relative">
                          <div className="absolute inset-0 bg-gray-50 rounded-xl border border-gray-200" />
                          <div className="relative z-10 p-4">
                            <input
                              id="otpCode"
                              name="otpCode"
                              type="text"
                              value={otpData.code}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, '').slice(0, 6)
                                setOtpData(prev => ({ ...prev, code: value }))
                                if (errors.otp) setErrors(prev => ({ ...prev, otp: '' }))
                              }}
                              placeholder="Enter 6-digit code"
                              className="w-full bg-transparent border-0 outline-none text-gray-900 placeholder-gray-500 font-mono text-lg text-center tracking-[0.5em]"
                              maxLength={6}
                              disabled={isLoading}
                            />
                          </div>
                          {errors.otp && (
                            <p className="text-red-500 text-sm mt-2 text-center">{errors.otp}</p>
                          )}
                        </div>

                        {/* Development OTP Display */}
                        {process.env.NODE_ENV === 'development' && otpData.developmentOtp && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-4">
                            <div className="flex items-center space-x-2 mb-2">
                              <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                              <span className="text-yellow-700 font-medium text-sm">Development Mode</span>
                            </div>
                            <div className="text-center">
                              <span className="text-gray-600 text-sm">Your verification code:</span>
                              <div className="text-2xl font-mono font-bold text-yellow-700 mt-1 tracking-[0.3em]">
                                {otpData.developmentOtp}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setOtpData(prev => ({ ...prev, code: otpData.developmentOtp }))
                                  if (errors.otp) setErrors(prev => ({ ...prev, otp: '' }))
                                }}
                                className="text-xs text-yellow-600 hover:text-yellow-700 underline mt-2"
                              >
                                Click to auto-fill
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Timer */}
                        <div className="flex items-center justify-center space-x-2 text-gray-600">
                          <Timer className="w-4 h-4" />
                          <span className="font-medium">
                            Code expires in {formatTime(otpData.timeRemaining)}
                          </span>
                        </div>

                        {/* Verify Button */}
                        <motion.button
                          type="submit"
                          disabled={isLoading || otpData.code.length !== 6}
                          className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 text-white py-4 rounded-xl font-bold text-base transition-all shadow-lg hover:shadow-xl disabled:opacity-50"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          {isLoading ? 'Verifying...' : 'Verify & Create Account'}
                        </motion.button>

                        {/* Resend */}
                        <div className="text-center">
                          <button
                            type="button"
                            onClick={handleResendOtp}
                            disabled={!otpData.canResend || isLoading}
                            className="text-emerald-600 hover:text-emerald-700 font-medium underline disabled:opacity-50 disabled:no-underline"
                          >
                            {otpData.canResend ? 'Resend code' : 'Resend in ' + formatTime(otpData.timeRemaining)}
                          </button>
                        </div>

                        {/* Back to form */}
                        <div className="text-center">
                          <button
                            type="button"
                            onClick={() => setCurrentStep('form')}
                            className="text-gray-600 hover:text-gray-800 font-medium"
                            disabled={isLoading}
                          >
                            ← Back to form
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  )}

                  {currentStep === 'creating' && (
                    <motion.div
                      key="creating"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="text-center py-12"
                    >
                      <motion.div 
                        className="w-20 h-20 border-4 border-emerald-200 border-t-emerald-600 rounded-full mx-auto mb-8"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      />
                      <h1 className="text-2xl font-bold text-gray-900 mb-4">
                        Creating your account...
                      </h1>
                      <p className="text-gray-600">
                        Setting up your AI-powered workspace
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Simple Terms - Only show on form step */}
                {currentStep === 'form' && (
                  <div className="text-center text-sm text-gray-500 pt-3 mt-6 border-t border-gray-100">
                    <p>
                      By signing up, you agree to our{' '}
                      <a href="#" className="text-emerald-600 hover:text-emerald-700 font-medium underline">Terms</a>{' '}
                      and{' '}
                      <a href="#" className="text-emerald-600 hover:text-emerald-700 font-medium underline">Privacy Policy</a>
                    </p>
                    <div className="flex items-center justify-center space-x-4 pt-2">
                      <div className="flex items-center space-x-1">
                        <Shield className="w-3 h-3 text-emerald-500" />
                        <span className="text-emerald-600 text-xs font-medium">Secure</span>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Heart className="w-3 h-3 text-red-500" />
                        <span className="text-red-600 text-xs font-medium">Trusted</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SignUpIntegrated