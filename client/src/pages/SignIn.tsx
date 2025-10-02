import React, { useState, useEffect, memo } from 'react'
import { Button } from '@/components/ui/button'
import { Eye, EyeOff, ArrowLeft, Sparkles, Brain, Play, Pause } from 'lucide-react'
import { Link, useLocation } from 'wouter'
import { signInWithEmailAndPassword, signInWithPopup, auth, googleProvider } from '@/lib/firebase'
import { useToast } from '@/hooks/use-toast'
import veeforceLogo from '@assets/output-onlinepngtools_1754815000405.png'

interface SignInProps {
  onNavigate: (view: string) => void
}

// Memoized button components to prevent unnecessary re-renders
const MemoizedSignInButton = memo(({ isLoading, onSubmit }: { isLoading: boolean, onSubmit: (e: React.FormEvent) => void }) => (
  <Button 
    type="submit" 
    disabled={isLoading}
    className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-semibold text-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
  >
    {isLoading ? (
      <div className="flex items-center justify-center space-x-2">
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        <span>Signing in...</span>
      </div>
    ) : (
      'Sign In'
    )}
  </Button>
))

const MemoizedGoogleButton = memo(({ isLoading, onClick }: { isLoading: boolean, onClick: () => void }) => (
  <Button 
    type="button" 
    variant="outline"
    disabled={isLoading}
    onClick={onClick}
    className="w-full bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border-2 border-gray-200/60 dark:border-gray-600/60 text-gray-700 dark:text-gray-300 py-6 rounded-2xl font-bold text-xl hover:bg-gray-50/90 dark:hover:bg-gray-700/90 hover:border-gray-300/60 dark:hover:border-gray-500/60 transition-all duration-300 shadow-lg hover:shadow-xl transform hover:-translate-y-1 disabled:opacity-50"
  >
    <div className="flex items-center justify-center space-x-4">
      <svg className="w-6 h-6" viewBox="0 0 24 24">
        <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#fbbc05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      <span>{isLoading ? 'Signing in...' : 'Continue with Google'}</span>
    </div>
  </Button>
))

const SignIn = ({ onNavigate }: SignInProps) => {
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  })
  const [errors, setErrors] = useState({
    email: '',
    password: ''
  })
  const { toast } = useToast()
  const [, setLocation] = useLocation()
  const [isLoading, setIsLoading] = useState(false)
  // Remove all unnecessary state variables that cause re-renders
  // const [currentDemo, setCurrentDemo] = useState(0)
  // const [isPlaying, setIsPlaying] = useState(true)
  // const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })
  // const [isTyping, setIsTyping] = useState(false)
  // const [typedText, setTypedText] = useState('')
  // const [focusedField, setFocusedField] = useState('')
  // const particleCount = 0

  // Advanced interactive demo data
  const demoScenarios = [
    {
      title: "AI Content Generation",
      description: "Watch VeeGPT create engaging social media content",
      gradient: "from-violet-600 via-purple-600 to-blue-600",
      icon: Brain,
      metrics: { engagement: "+284%", reach: "2.4M", conversion: "+67%" }
    },
    {
      title: "Smart Automation",
      description: "Automated scheduling and optimization in action",
      gradient: "from-blue-600 via-cyan-600 to-emerald-600",
      icon: Play,
      metrics: { efficiency: "+340%", saved: "15h/week", posts: "847" }
    },
    {
      title: "Analytics Intelligence",
      description: "Real-time insights and performance tracking",
      gradient: "from-emerald-600 via-teal-600 to-cyan-600",
      icon: Brain,
      metrics: { accuracy: "94.8%", insights: "156", trends: "+45%" }
    }
  ]

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

  // Remove auto-advance demo to prevent re-renders
  // useEffect(() => {
  //   if (!isPlaying) return
  //   const interval = setInterval(() => {
  //     setCurrentDemo((prev) => (prev + 1) % demoScenarios.length)
  //   }, 4000)
  //   return () => clearInterval(interval)
  // }, [isPlaying, demoScenarios.length])

  // Remove typing animation to prevent re-renders
  // useEffect(() => {
  //   const messages = [
  //     "Welcome back to VeeFore AI",
  //     "Your intelligent workspace awaits",
  //     "AI-powered content creation ready",
  //     "Advanced analytics at your fingertips"
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
  //       timeoutId = setTimeout(typeWriter, 150)
  //     } else if (isDeleting && charIndex > 0) {
  //       setTypedText(currentMessage.substring(0, charIndex - 1))
  //       charIndex--
  //       timeoutId = setTimeout(typeWriter, 75)
  //     } else if (!isDeleting && charIndex === currentMessage.length) {
  //       setIsTyping(false)
  //       timeoutId = setTimeout(() => {
  //         isDeleting = true
  //         typeWriter()
  //       }, 2000)
  //     } else if (isDeleting && charIndex === 0) {
  //       isDeleting = false
  //       messageIndex = (messageIndex + 1) % messages.length
  //       timeoutId = setTimeout(typeWriter, 500)
  //     }
  //   }
  //   
  //   timeoutId = setTimeout(typeWriter, 1000)
  //   return () => clearTimeout(timeoutId)
  // }, [])

  // Remove ripple effects to prevent button blinking
  // const createRipple = (e: React.MouseEvent) => {
  //   const rect = e.currentTarget.getBoundingClientRect()
  //   const x = e.clientX - rect.left
  //   const y = e.clientY - rect.top
  //   const newRipple = { id: Date.now(), x, y }
  //   
  //   setRipples(prev => [...prev, newRipple])
  //   setTimeout(() => {
  //     setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id))
  //   }, 1000)
  // }
  
  // Interactive effects removed to prevent re-renders



  const handleBackToLanding = () => {
    // Use the prop function for smooth SPA navigation
    onNavigate('')
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear error when user starts typing
    if (errors[field as keyof typeof errors]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    const newErrors = {
      email: '',
      password: ''
    }

    // Validate email
    if (!formData.email.trim()) {
      newErrors.email = 'Please enter your email'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address'
    }

    // Validate password
    if (!formData.password.trim()) {
      newErrors.password = 'Please enter your password'
    }

    setErrors(newErrors)

    if (!newErrors.email && !newErrors.password) {
      setIsLoading(true)
      try {
        // Sign in with Firebase
        await signInWithEmailAndPassword(formData.email, formData.password)
        
        // Send user data to backend - with error handling
        const signinResponse = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email
          })
        })

        // Check if backend signin was successful
        if (!signinResponse.ok) {
          const errorData = await signinResponse.json().catch(() => ({ message: 'Backend signin failed' }))
          console.warn('Backend signin issue:', errorData.message)
          // Don't block user - Firebase auth succeeded, backend will auto-create user on next request
        }
        
        toast({
          title: "Success",
          description: "Signed in successfully!",
        })
        
        // Redirect to home page
        setLocation('/')
      } catch (error: any) {
        console.error('Sign in error:', error)
        toast({
          title: "Error",
          description: error.message || "Failed to sign in. Please try again.",
          variant: "destructive",
        })
      } finally {
        setIsLoading(false)
      }
    }
  }

  const handleGoogleSignIn = async () => {
    setIsLoading(true)
    try {
      console.log('🚀 Starting Google sign-in process...')
      
      // Validate Firebase auth is available
      if (!auth) {
        throw new Error('Firebase authentication is not available')
      }
      
      if (!googleProvider) {
        throw new Error('Google provider is not available')
      }
      
      console.log('✅ Firebase auth and Google provider are available')
      
      // Use popup method for better localhost compatibility
      console.log('🔄 Starting popup authentication...')
      const result = await signInWithPopup(auth, googleProvider)
      
      console.log('✅ Google sign-in successful:', result.user.email)
      console.log('User details:', {
        email: result.user.email,
        displayName: result.user.displayName,
        uid: result.user.uid
      })
      
      // Link Firebase user with backend MongoDB database
      console.log('🔗 Linking Firebase user with backend...')
      const idToken = await result.user.getIdToken()
      
      const linkResponse = await fetch('/api/auth/link-firebase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          firebaseUid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName || result.user.email?.split('@')[0],
          photoURL: result.user.photoURL
        })
      })

      if (!linkResponse.ok) {
        const errorData = await linkResponse.json().catch(() => ({ message: 'Failed to link user' }))
        console.error('❌ Backend linking failed:', errorData)
        throw new Error(errorData.message || 'Failed to link user account')
      }

      console.log('✅ User linked with backend successfully')
      
      toast({
        title: "Success",
        description: "Signed in with Google successfully!",
      })
      
      // Redirect to home page
      setLocation('/')
      
    } catch (error: any) {
      console.error('❌ Google sign in error:', error)
      
      let errorMessage = "Failed to sign in with Google. Please try again."
      
      // Handle popup errors
      if (error.code === 'auth/popup-closed-by-user') {
        errorMessage = "Sign-in popup was closed. Please try again."
      } else if (error.code === 'auth/popup-blocked') {
        errorMessage = "Popup was blocked. Please allow popups for this site."
      } else if (error.message) {
        errorMessage = error.message
      }
      
      toast({
        title: "Google Sign-in Failed",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Add a test function to check Firebase
  const testFirebase = () => {
    console.log('🧪 Testing Firebase...')
    console.log('Auth object:', auth)
    console.log('Current user:', auth.currentUser)
    
    if (auth) {
      console.log('✅ Firebase Auth is working')
    } else {
      console.log('❌ Firebase Auth is not working')
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50/30 dark:from-gray-900 dark:via-gray-800 dark:to-blue-900/30 relative overflow-hidden">
      {/* Animated background gradients */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/40 via-transparent to-purple-50/30 dark:from-blue-900/20 dark:via-transparent dark:to-purple-900/20" />
      
      {/* Floating animated elements */}
      <div 
        className="absolute w-96 h-96 rounded-full bg-gradient-to-r from-blue-100/40 to-purple-100/30 dark:from-blue-900/20 dark:to-purple-900/20 blur-3xl animate-pulse"
        style={{ 
          top: '20%', 
          left: '10%',
          animationDelay: '0s'
        }} 
      />
      <div 
        className="absolute w-80 h-80 rounded-full bg-gradient-to-r from-violet-100/30 to-blue-100/40 dark:from-violet-900/20 dark:to-blue-900/20 blur-2xl animate-pulse delay-1000"
        style={{ 
          top: '60%', 
          right: '15%',
          animationDelay: '1s'
        }} 
      />

      {/* Advanced animated grid pattern */}
      <div className="absolute inset-0 opacity-[0.02]" style={{
        backgroundImage: `
          radial-gradient(circle at 2px 2px, rgba(99, 102, 241, 0.3) 1px, transparent 0),
          linear-gradient(90deg, rgba(59, 130, 246, 0.05) 1px, transparent 1px),
          linear-gradient(rgba(59, 130, 246, 0.05) 1px, transparent 1px)
        `,
        backgroundSize: '60px 60px, 30px 30px, 30px 30px',
        animation: 'gridMove 30s linear infinite'
      }} />

      {/* Interactive floating particles */}
      {[...Array(15)].map((_, i) => (
        <div
          key={i}
          className="absolute w-1 h-1 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full opacity-30"
          style={{
            left: `${10 + (i * 6)}%`,
            top: `${20 + Math.sin(i) * 30}%`,
            animation: `particles-float ${3 + (i % 3)}s ease-in-out infinite`,
            animationDelay: `${i * 0.5}s`
          }}
        />
      ))}

      {/* Dynamic mesh overlay */}
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          background: `
            radial-gradient(circle at 25% 25%, rgba(99, 102, 241, 0.4) 0%, transparent 50%),
            radial-gradient(circle at 75% 75%, rgba(139, 92, 246, 0.3) 0%, transparent 50%)
          `
        }}
      />

      {/* Professional Navigation */}
      <nav className="relative z-50 w-full px-6 py-8">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button 
            onClick={handleBackToLanding}
            className="group flex items-center space-x-3 text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-all duration-300"
          >
            <div className="w-11 h-11 rounded-2xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl border border-gray-200/60 dark:border-gray-700/60 flex items-center justify-center shadow-lg group-hover:shadow-xl transition-all duration-300 group-hover:scale-105">
              <ArrowLeft className="w-5 h-5" />
            </div>
            <span className="font-semibold text-lg">Back to VeeFore</span>
          </button>

          <div className="flex items-center space-x-4 bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-2xl px-6 py-3 border border-gray-200/50 dark:border-gray-700/50 shadow-lg">
            <img src={veeforceLogo} alt="VeeFore" className="w-10 h-10" />
            <span className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent">
              VeeFore
            </span>
            <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
          </div>
        </div>
      </nav>

      <div className="flex min-h-[calc(100vh-140px)] relative z-40">
        {/* Left Side - Professional Content Preview */}
        <div className="lg:w-3/5 flex flex-col justify-center p-8 lg:p-16 relative">
          {/* Hero Content */}
          <div className="max-w-2xl mb-16">
            {/* Advanced Status Badge with Typing Effect */}
            <div className="inline-flex items-center bg-white/95 backdrop-blur-xl rounded-full px-8 py-4 mb-12 border border-gray-200/50 shadow-xl group hover:scale-105 transition-all duration-500 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 to-purple-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="flex items-center space-x-3 relative z-10">
                <div className="relative">
                  <div className="w-4 h-4 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full animate-pulse" />
                  <div className="absolute inset-0 w-4 h-4 bg-gradient-to-r from-emerald-500 to-blue-500 rounded-full animate-ping opacity-40" />
                  <div className="absolute -inset-1 w-6 h-6 bg-gradient-to-r from-emerald-400/20 to-blue-400/20 rounded-full animate-pulse delay-300" />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-gray-800 font-semibold text-lg min-w-[300px] text-left">
                    Welcome back! Sign in to continue
                  </span>
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
                <Sparkles className="w-5 h-5 text-blue-600 group-hover:rotate-12 transition-transform duration-500" />
              </div>
            </div>

            <h1 className="text-6xl lg:text-7xl font-black mb-8 leading-[0.9]">
              <span className="block text-gray-900 mb-4">
                Continue Your
              </span>
              <span className="block bg-gradient-to-r from-blue-600 via-purple-600 to-violet-600 bg-clip-text text-transparent mb-4">
                AI Journey
              </span>
              <span className="block text-gray-600 text-4xl lg:text-5xl font-light">
                with Professional Excellence
              </span>
            </h1>

            <p className="text-2xl text-gray-600 leading-relaxed font-light mb-12 max-w-xl">
              Access your personalized AI workspace where intelligent content creation meets strategic social media management.
            </p>
          </div>

          {/* Professional Preview Panel */}
          <div className="relative">
            <div className="bg-white/90 backdrop-blur-xl rounded-3xl border border-gray-200/50 shadow-2xl overflow-hidden">
              {/* Panel Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-200/50">
                <div className="flex items-center space-x-4">
                  <div className="flex space-x-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full" />
                    <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                    <div className="w-3 h-3 bg-green-500 rounded-full" />
                  </div>
                  <span className="text-gray-900 font-semibold text-lg">VeeFore AI Workspace</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div
                    className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600"
                  >
                    <Play className="w-4 h-4" />
                  </div>
                  <div className="flex space-x-1">
                    {demoScenarios.map((_, index) => (
                      <div
                        key={index}
                        className={`w-3 h-3 rounded-full transition-all duration-300 ${
                          index === 0 ? 'bg-blue-600 scale-125' : 'bg-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Panel Content */}
              <div className="p-8">
                <div className="flex items-center space-x-4 mb-6">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-r ${demoScenarios[0].gradient} flex items-center justify-center shadow-lg`}>
                    {(() => {
                      const IconComponent = demoScenarios[0].icon;
                      return <IconComponent className="w-8 h-8 text-white" />;
                    })()}
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{demoScenarios[0].title}</h3>
                    <p className="text-gray-600">{demoScenarios[0].description}</p>
                  </div>
                </div>

                {/* Clean Professional Metrics */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {Object.entries(demoScenarios[0].metrics).map(([key, value], index) => (
                    <div key={key} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200">
                      <div className="text-2xl font-bold text-gray-900 mb-1">{value}</div>
                      <div className="text-gray-600 text-sm capitalize font-medium mb-3">{key}</div>
                      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${60 + index * 15}%` }}
                        />
                      </div>
                      <div className="flex items-center justify-end mt-1">
                        <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* AI Content Engine Section */}
                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3">
                      <img src={veeforceLogo} alt="VeeFore" className="w-8 h-8" />
                      <div>
                        <span className="text-gray-900 font-semibold text-lg">AI Content Engine</span>
                        <div className="text-sm text-purple-600 font-medium">Generating 247 posts/hour</div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 bg-white rounded-full px-3 py-1 border border-gray-200">
                      <div className="w-2 h-2 bg-emerald-500 rounded-full" />
                      <span className="text-emerald-700 text-sm font-medium">Active</span>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    {['Post Generation', 'Caption Writing', 'Hashtag Research'].map((task, index) => (
                      <div key={task}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-gray-800 text-sm font-medium">{task}</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-purple-600 text-sm font-semibold">{88 + (index * 4)}%</span>
                            <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center">
                              <span className="text-emerald-600 text-xs">✓</span>
                            </div>
                          </div>
                        </div>
                        <div className="w-full h-2 bg-white rounded-full border border-gray-200">
                          <div 
                            className="h-full bg-purple-500 rounded-full transition-all duration-1000"
                            style={{ width: `${88 + (index * 4)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Simple Bottom Stats */}
                  <div className="mt-6 grid grid-cols-3 gap-3">
                    <div className="text-center p-3 bg-white rounded-lg border border-gray-200">
                      <div className="text-lg font-bold text-purple-600">42</div>
                      <div className="text-xs text-gray-600">Posts</div>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border border-gray-200">
                      <div className="text-lg font-bold text-blue-600">28K</div>
                      <div className="text-xs text-gray-600">Words</div>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border border-gray-200">
                      <div className="text-lg font-bold text-indigo-600">4.8</div>
                      <div className="text-xs text-gray-600">Rating</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>



        {/* Right Side - Professional Sign In */}
        <div className="lg:w-2/5 flex items-center justify-center p-8 lg:p-16">
          <div className="w-full max-w-lg">
            {/* Professional Sign In Card */}
            <div className="relative">
              {/* Subtle glow effect */}
              <div className="absolute -inset-1 bg-gradient-to-r from-blue-200/50 via-purple-200/50 to-violet-200/50 rounded-3xl blur-xl opacity-60" />
              
              <div className="relative bg-white/95 backdrop-blur-xl rounded-3xl p-10 border border-gray-200/60 shadow-2xl overflow-hidden">
                {/* Removed ripple effects to prevent button blinking */}
                
                {/* Clean Professional Header */}
                <div className="text-center mb-10 relative z-10">
                  {/* Simple Elegant VeeFore Logo */}
                  <div className="mb-8 flex justify-center">
                    <div className="relative p-6 rounded-2xl hover:scale-105 transition-all duration-500 ease-out group">
                      <img 
                        src={veeforceLogo} 
                        alt="VeeFore" 
                        className="w-24 h-24 transform hover:scale-110 transition-all duration-500 ease-out filter drop-shadow-lg hover:drop-shadow-xl animate-[simpleEntrance_1s_ease-out_forwards]" 
                        style={{
                          animationDelay: '0.5s',
                          opacity: 0,
                          transform: 'translateY(20px) scale(0.9)'
                        }}
                      />
                    </div>
                  </div>

                  {/* Clean Welcome Text */}
                  <h1 className="text-4xl font-bold text-gray-900 mb-4">
                    Welcome Back
                  </h1>
                  
                  {/* Simple subtitle */}
                  <p className="text-lg text-gray-600 mb-8">
                    Sign in to your VeeFore workspace
                  </p>
                </div>

                {/* Completely New Card-Style Sign In Form */}
                <div className="bg-gradient-to-br from-blue-50/80 to-indigo-50/80 dark:from-blue-900/30 dark:to-indigo-900/30 p-8 rounded-3xl border border-blue-100/50 dark:border-blue-600/50 shadow-xl backdrop-blur-sm">
                  <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Card-Style Email Field */}
                    <div className="space-y-3">
                      <label className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">
                        Email Address
                      </label>
                      <div className="relative">
                        <div className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10">
                          <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                          </svg>
                        </div>
                        <input
                          type="email"
                          id="email"
                          value={formData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          className={`w-full pl-12 pr-12 py-4 bg-white/90 dark:bg-gray-800/90 border-2 ${
                            errors.email 
                              ? 'border-red-400 focus:border-red-500' 
                              : 'border-transparent hover:border-blue-200 dark:hover:border-blue-600 focus:border-blue-500'
                          } rounded-2xl focus:outline-none transition-all duration-300 text-gray-900 dark:text-gray-100 text-base shadow-lg hover:shadow-xl focus:shadow-2xl`}
                          placeholder="Enter your email address"
                        />
                        
                        {/* Success/Error Icon */}
                        {formData.email && (
                          <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
                            {formData.email.includes('@') && formData.email.includes('.') ? (
                              <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              </div>
                            ) : (
                              <div className="w-6 h-6 bg-orange-400 rounded-full flex items-center justify-center">
                                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                </svg>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {/* Enhanced Error Display */}
                      {errors.email && (
                        <div className="bg-red-100/80 dark:bg-red-900/30 border border-red-300/50 dark:border-red-600/50 rounded-xl p-3 flex items-start space-x-3">
                          <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <p className="text-red-800 dark:text-red-200 text-sm font-medium">{errors.email}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Card-Style Password Field */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-bold text-gray-800 dark:text-gray-200 uppercase tracking-wide">
                          Password
                        </label>
                        <Link 
                          href="/forgot-password" 
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 text-sm font-medium hover:underline transition-colors bg-blue-100/50 dark:bg-blue-900/30 hover:bg-blue-200/50 dark:hover:bg-blue-800/30 px-3 py-1 rounded-full"
                        >
                          Forgot?
                        </Link>
                      </div>
                      
                      <div className="relative">
                        <div className="absolute left-4 top-1/2 transform -translate-y-1/2 z-10">
                          <svg className="w-5 h-5 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          id="password"
                          value={formData.password}
                          onChange={(e) => handleInputChange('password', e.target.value)}
                          className={`w-full pl-12 pr-16 py-4 bg-white/90 dark:bg-gray-800/90 border-2 ${
                            errors.password 
                              ? 'border-red-400 focus:border-red-500' 
                              : 'border-transparent hover:border-blue-200 dark:hover:border-blue-600 focus:border-blue-500'
                          } rounded-2xl focus:outline-none transition-all duration-300 text-gray-900 dark:text-gray-100 text-base shadow-lg hover:shadow-xl focus:shadow-2xl`}
                          placeholder="Enter your password"
                        />
                        
                        {/* Enhanced Password Toggle */}
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 transform -translate-y-1/2 w-8 h-8 bg-gray-200/80 dark:bg-gray-700/80 hover:bg-gray-300/80 dark:hover:bg-gray-600/80 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-all duration-300"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      
                      {/* Enhanced Password Strength */}
                      {formData.password && (
                        <div className="bg-white/60 dark:bg-gray-700/60 rounded-xl p-3 border border-gray-200/50 dark:border-gray-600/50">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">Password Strength</span>
                            <span className={`text-xs font-bold ${
                              formData.password.length >= 8 
                                ? 'text-emerald-600 dark:text-emerald-400' 
                                : formData.password.length >= 6 
                                  ? 'text-amber-600 dark:text-amber-400'
                                  : formData.password.length >= 4
                                    ? 'text-orange-600 dark:text-orange-400'
                                    : 'text-red-600 dark:text-red-400'
                            }`}>
                              {formData.password.length >= 8 
                                ? 'STRONG' 
                                : formData.password.length >= 6 
                                  ? 'GOOD'
                                  : formData.password.length >= 4
                                    ? 'FAIR'
                                    : 'WEAK'}
                            </span>
                          </div>
                          <div className="flex space-x-1">
                            {[...Array(4)].map((_, i) => (
                              <div
                                key={i}
                                className={`flex-1 h-3 rounded-full transition-all duration-500 ${
                                  formData.password.length > i * 2 
                                    ? formData.password.length >= 8 
                                      ? 'bg-emerald-500' 
                                      : formData.password.length >= 6 
                                        ? 'bg-amber-500'
                                        : formData.password.length >= 4
                                          ? 'bg-orange-500'
                                          : 'bg-red-500'
                                    : 'bg-gray-200 dark:bg-gray-600'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Enhanced Error Display */}
                      {errors.password && (
                        <div className="bg-red-100/80 dark:bg-red-900/30 border border-red-300/50 dark:border-red-600/50 rounded-xl p-3 flex items-start space-x-3">
                          <svg className="w-5 h-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <p className="text-red-800 dark:text-red-200 text-sm font-medium">{errors.password}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Clean Professional Sign In Button */}
                  <MemoizedSignInButton isLoading={isLoading} onSubmit={handleSubmit} />

                  {/* Clean Divider */}
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200 dark:border-gray-600" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="px-4 text-gray-500 dark:text-gray-400 font-medium bg-white dark:bg-gray-800">or</span>
                    </div>
                  </div>

                  {/* Google Sign In */}
                  <MemoizedGoogleButton isLoading={isLoading} onClick={handleGoogleSignIn} />

                  {/* Test Firebase Button */}
                  <Button 
                    type="button" 
                    variant="outline"
                    onClick={testFirebase}
                    className="w-full mt-4 bg-yellow-100/90 dark:bg-yellow-900/30 border-2 border-yellow-300/60 dark:border-yellow-600/60 text-yellow-800 dark:text-yellow-200 py-3 rounded-xl font-medium hover:bg-yellow-200/90 dark:hover:bg-yellow-800/30 transition-all duration-200"
                  >
                    🧪 Test Firebase Connection
                  </Button>
                  </form>
                </div>

                {/* Sign Up Link */}
                <div className="text-center mt-10">
                  <p className="text-gray-600 dark:text-gray-400 text-lg">
                    Don't have an account?{' '}
                    <button 
                      onClick={() => onNavigate('signup')}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-bold hover:underline transition-colors"
                    >
                      Get early access
                    </button>
                  </p>
                </div>

                {/* Terms */}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-8 text-center leading-relaxed">
                  By signing in, you agree to our{' '}
                  <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">Terms of Service</a>{' '}
                  and{' '}
                  <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">Privacy Policy</a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Custom animations are handled by Tailwind */}
    </div>
  )
}

export default SignIn