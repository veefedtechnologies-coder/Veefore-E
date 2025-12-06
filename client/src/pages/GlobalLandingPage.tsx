import React, { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, Lock, ArrowRight, Play, Instagram, Youtube, CheckCircle, Zap, Shield, BarChart3 } from 'lucide-react'

const GlobalLandingPage = React.memo(() => {
  const [isLoading, setIsLoading] = useState(true)
  const [splineLoaded, setSplineLoaded] = useState(false)
  const [shouldLoadSpline, setShouldLoadSpline] = useState(false)
  const [isSlowNetwork, setIsSlowNetwork] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isHolding, setIsHolding] = useState(false)
  const [keyHoldProgress, setKeyHoldProgress] = useState(0)
  const [isActivated, setIsActivated] = useState(false)

  const iframeRef = React.useRef<HTMLIFrameElement>(null)
  const splineContainerRef = React.useRef<HTMLDivElement>(null)
  const initRef = React.useRef(false)

  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    const nav = (navigator as any)
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection
    const effectiveType = conn?.effectiveType || '4g'
    const slowConnection = effectiveType === '2g' || effectiveType === 'slow-2g' || effectiveType === '3g'
    
    if (slowConnection) {
      setIsSlowNetwork(true)
      setIsLoading(false)
      return
    }

    setIsLoading(false)
    
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !shouldLoadSpline) {
          setTimeout(() => setShouldLoadSpline(true), 500)
          observer.disconnect()
        }
      },
      { threshold: 0.1 }
    )

    if (splineContainerRef.current) {
      observer.observe(splineContainerRef.current)
    }

    return () => observer.disconnect()
  }, [])

  // Memoized animation variants to prevent recreation on re-renders
  const navItemVariants = useMemo(() => ({
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0 }
  }), [])

  const navContainerVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.3
      }
    }
  }), [])

  const heroContentVariants = useMemo(() => ({
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0 }
  }), [])

  const heroContainerVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.3,
        delayChildren: 0.5
      }
    }
  }), [])

  const featureCardVariants = useMemo(() => ({
    hidden: { opacity: 0, y: 50 },
    visible: { opacity: 1, y: 0 }
  }), [])

  const featuresContainerVariants = useMemo(() => ({
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1
      }
    }
  }), [])

  // Handle key hold interaction
  const handleKeyHold = () => {
    setIsHolding(true)
    setKeyHoldProgress(0)
  }

  const handleKeyRelease = () => {
    setIsHolding(false)
    setKeyHoldProgress(0)
  }

  // Progress animation
  useEffect(() => {
    if (isHolding) {
      const interval = setInterval(() => {
        setKeyHoldProgress(prev => {
          const newProgress = prev + 0.02
          if (newProgress >= 1) {
            setIsActivated(true)
            setIsHolding(false)
            return 1
          }
          return newProgress
        })
      }, 20)
      return () => clearInterval(interval)
    }
  }, [isHolding])

  // No debug logging to prevent re-renders

  return (
    <div 
      className="relative w-full min-h-screen bg-black overflow-hidden"
      style={{
        width: '100vw',
        height: '100vh',
        margin: 0,
        padding: 0
      }}
    >
      <style>{`
        /* Simplified animations to avoid conflicts with Framer Motion */
        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 0 40px rgba(16, 185, 129, 0.6);
          }
          50% {
            box-shadow: 0 0 60px rgba(16, 185, 129, 0.8);
          }
        }
        @keyframes glow {
          0%, 100% {
            opacity: 0.7;
          }
          50% {
            opacity: 1;
          }
        }
        
        /* Ensure full viewport coverage */
        html, body {
          margin: 0;
          padding: 0;
          width: 100vw;
          height: 100vh;
          overflow-x: hidden;
        }
        
        /* 3D Model container */
        .spline-container {
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          z-index: 0 !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
        }
        
        .spline-iframe {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          width: 100vw !important;
          height: 100vh !important;
          border: none !important;
          margin: 0 !important;
          padding: 0 !important;
          z-index: 0 !important;
          overflow: hidden !important;
          transform: translateZ(0);
          -webkit-transform: translateZ(0);
          object-fit: cover !important;
        }
        
        /* Ensure full coverage on all devices */
        @media (max-width: 768px) {
          .spline-container,
          .spline-iframe {
            width: 100vw !important;
            height: 100vh !important;
            min-width: 100vw !important;
            min-height: 100vh !important;
          }
        }
        
        @media (max-width: 480px) {
          .spline-container,
          .spline-iframe {
            width: 100vw !important;
            height: 100vh !important;
            min-width: 100vw !important;
            min-height: 100vh !important;
          }
        }
      `}</style>

      {/* 3D Spline Model - Full Screen Coverage - Smart Loading */}
      <div className="spline-container" ref={splineContainerRef}>
        {isSlowNetwork ? (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-900/30 via-transparent to-transparent" />
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
          </div>
        ) : shouldLoadSpline ? (
          <iframe
            ref={iframeRef}
            src="https://my.spline.design/landingpagepageglobal-SHtJNWPOGOGxOIGjpxtg8hG7/"
            frameBorder="0"
            allow="fullscreen"
            className="spline-iframe"
            onLoad={() => {
              setSplineLoaded(true)
            }}
            onError={() => {
              setSplineLoaded(false)
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 border-3 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-b border-white/20">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <motion.div
              className="flex items-center space-x-2"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg flex items-center justify-center">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-white">VeeFore</span>
            </motion.div>

            {/* Desktop Navigation with Stagger Animation */}
            <motion.div 
              className="hidden md:flex items-center space-x-8"
              variants={navContainerVariants}
              initial="hidden"
              animate="visible"
            >
              {['PRODUCT', 'SOLUTIONS', 'PRICING', 'DEVELOPERS', 'RESOURCES', 'SUPPORT'].map((item) => (
                <motion.a
                  key={item}
                  href="#"
                  className="text-white/80 hover:text-white transition-colors duration-200 font-medium"
                  variants={navItemVariants}
                >
                  {item}
                </motion.a>
              ))}
            </motion.div>

            {/* Login Button */}
            <motion.button
              className="hidden md:flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg border border-white/20 transition-all duration-200"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Lock className="w-4 h-4" />
              <span>Login Dashboard</span>
            </motion.button>

            {/* Mobile Menu Button */}
            <button
              className="md:hidden text-white"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* Mobile Menu */}
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                className="md:hidden mt-4 py-4 border-t border-white/10"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                {['PRODUCT', 'SOLUTIONS', 'PRICING', 'DEVELOPERS', 'RESOURCES', 'SUPPORT'].map((item) => (
                  <a
                    key={item}
                    href="#"
                    className="block py-2 text-white/80 hover:text-white transition-colors duration-200"
                  >
                    {item}
                  </a>
                ))}
                <button className="flex items-center space-x-2 bg-white/10 hover:bg-white/20 text-white px-6 py-2 rounded-lg border border-white/20 transition-all duration-200 mt-4">
                  <Lock className="w-4 h-4" />
                  <span>Login Dashboard</span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      {/* Main Content */}
      <div className="relative z-10 pt-20">
        {/* Hero Section */}
        <section 
          className="relative min-h-screen flex items-center justify-center px-6"
          style={{
            minHeight: '100vh',
            width: '100vw',
            position: 'relative',
            zIndex: 10
          }}
        >
          {/* Hero Content Overlay with Stagger Animation */}
          <motion.div 
            className="relative z-20 text-center max-w-6xl mx-auto"
            variants={heroContainerVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Main Headline */}
            <motion.h1
              className="text-6xl md:text-8xl font-bold text-white mb-6 leading-tight"
              variants={heroContentVariants}
              style={{
                background: 'linear-gradient(135deg, #ffffff, #a0a0a0)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: '0 0 30px rgba(255, 255, 255, 0.3)'
              }}
            >
              PUT YOUR BILLING
              <br />
              <span className="text-7xl md:text-9xl">OPERATIONS ON AUTOPILOT</span>
            </motion.h1>

            {/* Subtitle */}
            <motion.p
              className="text-xl md:text-2xl text-white/80 mb-12 max-w-4xl mx-auto leading-relaxed"
              variants={heroContentVariants}
            >
              As your merchant of record, we manage your payments, tax and compliance needs, 
              so you can focus on growth.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-6 mb-16"
              variants={heroContentVariants}
            >
              <motion.button
                className="bg-gradient-to-r from-blue-500 to-purple-600 text-white px-8 py-4 rounded-full font-semibold text-lg hover:from-blue-600 hover:to-purple-700 transition-all duration-300 flex items-center gap-2 shadow-2xl"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Get Started Free
                <ArrowRight className="w-5 h-5" />
              </motion.button>
              
              <motion.button
                className="bg-white/10 backdrop-blur-md text-white px-8 py-4 rounded-full font-semibold text-lg hover:bg-white/20 transition-all duration-300 flex items-center gap-2 border border-white/20"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <Play className="w-5 h-5" />
                Watch Demo
              </motion.button>
            </motion.div>

            {/* Social Media Icons */}
            <motion.div
              className="flex items-center justify-center gap-6"
              variants={heroContentVariants}
            >
              <motion.a
                href="#"
                className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors duration-200"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <Youtube className="w-6 h-6 text-white" />
              </motion.a>
              
              <motion.a
                href="#"
                className="w-12 h-12 bg-gradient-to-r from-pink-500 to-orange-500 rounded-full flex items-center justify-center hover:from-pink-600 hover:to-orange-600 transition-all duration-200"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
              >
                <Instagram className="w-6 h-6 text-white" />
              </motion.a>
            </motion.div>
          </motion.div>

          {/* Interactive Key Button - positioned over the 3D scene */}
          <AnimatePresence>
            {splineLoaded && !isHolding && !isActivated && (
              <motion.div
                className="absolute z-30"
                style={{
                  top: '70%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)'
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, delay: 2 }}
              >
                <motion.button
                  className="w-20 h-20 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full shadow-2xl flex items-center justify-center text-white font-bold text-2xl hover:from-green-500 hover:to-emerald-600 transition-all duration-300 relative group"
                  onMouseDown={handleKeyHold}
                  onMouseUp={handleKeyRelease}
                  onMouseLeave={handleKeyRelease}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    background: 'linear-gradient(135deg, #10B981, #059669)',
                    boxShadow: '0 0 40px rgba(16, 185, 129, 0.6), 0 0 80px rgba(16, 185, 129, 0.3)',
                    border: '3px solid rgba(255, 255, 255, 0.3)',
                    animation: 'pulse 2s infinite'
                  }}
                >
                  <Zap className="w-8 h-8" />
                  {/* Glowing effect */}
                  <div 
                    className="absolute inset-0 rounded-full bg-green-400/20"
                    style={{ animation: 'glow 2s infinite' }}
                  />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Key Hold Progress Overlay */}
          <AnimatePresence>
            {isHolding && (
              <motion.div
                className="absolute inset-0 bg-black/50 flex items-center justify-center z-40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="text-center">
                  <div className="w-32 h-32 mx-auto mb-4 relative">
                    <div className="w-full h-full rounded-full border-4 border-white/20 flex items-center justify-center">
                      <div 
                        className="w-full h-full rounded-full border-4 border-green-500 border-t-transparent"
                        style={{
                          transform: `rotate(${keyHoldProgress * 360}deg)`,
                          transition: 'transform 0.1s linear'
                        }}
                      />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Zap className="w-8 h-8 text-white" />
                    </div>
                  </div>
                  <p className="text-white text-lg font-medium">
                    Activating VeeFore... {Math.round(keyHoldProgress * 100)}%
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Features Section */}
        <section className="relative z-20 py-20 px-6">
          <div className="max-w-7xl mx-auto">
            <motion.div
              className="text-center mb-16"
              initial={{ opacity: 0, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              viewport={{ once: true }}
            >
              <h2 className="text-4xl md:text-6xl font-bold text-white mb-6">
                Why Choose VeeFore?
              </h2>
              <p className="text-xl text-white/70 max-w-3xl mx-auto">
                Powerful features designed to streamline your billing operations and boost your revenue.
              </p>
            </motion.div>

            <motion.div 
              className="grid md:grid-cols-3 gap-8"
              variants={featuresContainerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {[
                {
                  icon: <Zap className="w-8 h-8" />,
                  title: "Lightning Fast",
                  description: "Process payments in milliseconds with our optimized infrastructure."
                },
                {
                  icon: <Shield className="w-8 h-8" />,
                  title: "Bank-Level Security",
                  description: "Your data is protected with enterprise-grade encryption and compliance."
                },
                {
                  icon: <BarChart3 className="w-8 h-8" />,
                  title: "Advanced Analytics",
                  description: "Get insights into your revenue with detailed reporting and analytics."
                }
              ].map((feature) => (
                <motion.div
                  key={feature.title}
                  className="bg-white/5 backdrop-blur-md rounded-2xl p-8 border border-white/10 hover:bg-white/10 transition-all duration-300"
                  variants={featureCardVariants}
                >
                  <div className="text-blue-400 mb-4">{feature.icon}</div>
                  <h3 className="text-2xl font-bold text-white mb-4">{feature.title}</h3>
                  <p className="text-white/70">{feature.description}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Success State */}
        <AnimatePresence>
          {isActivated && (
            <motion.div
              className="fixed inset-0 bg-gradient-to-br from-green-900/20 to-emerald-900/20 flex items-center justify-center z-50 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                className="text-center bg-black/80 backdrop-blur-md rounded-3xl p-12 border border-white/20"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200 }}
              >
                <motion.div
                  className="w-32 h-32 mx-auto mb-6 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                >
                  <CheckCircle className="w-16 h-16 text-white" />
                </motion.div>
                <h2 className="text-4xl font-bold text-white mb-4">
                  Welcome to VeeFore!
                </h2>
                <p className="text-xl text-white/80 mb-8">
                  Your billing operations are now on autopilot
                </p>
                <motion.button
                  className="bg-gradient-to-r from-green-500 to-emerald-600 text-white px-8 py-4 rounded-full font-semibold text-lg hover:from-green-600 hover:to-emerald-700 transition-all duration-300 flex items-center gap-2 mx-auto"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Continue to Dashboard
                  <ArrowRight className="w-5 h-5" />
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Floating Particles Effect - Reduced from 30 to 10 for performance */}
      <div className="fixed inset-0 pointer-events-none z-5">
        {[...Array(10)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-1 h-1 bg-white/20 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
            }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1, 0],
              y: [0, -100, 0]
            }}
            transition={{
              duration: 4,
              repeat: Infinity,
              delay: Math.random() * 3
            }}
          />
        ))}
      </div>
    </div>
  )
})

export default GlobalLandingPage
