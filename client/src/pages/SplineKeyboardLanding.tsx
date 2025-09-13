import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, Loader2, Keyboard, Sparkles } from 'lucide-react'

// Spline Keyboard Component using iframe
const SplineKeyboardScene = ({ onKeyActivated }: { onKeyActivated: () => void }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [keyHoldProgress, setKeyHoldProgress] = useState(0)
  const [isHolding, setIsHolding] = useState(false)
  const [keyFound, setKeyFound] = useState(false)
  const [splineLoaded, setSplineLoaded] = useState(false)
  const holdTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Simulate loading time for the iframe
    const timer = setTimeout(() => {
      setIsLoading(false)
    }, 2000)

    return () => clearTimeout(timer)
  }, [])

  // Handle key hold interaction
  const handleKeyHold = () => {
    if (!keyFound) return

    setIsHolding(true)
    setKeyHoldProgress(0)
    
    // Start hold progress
    const startTime = Date.now()
    const holdDuration = 1000 // 1 second
    
    const updateProgress = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / holdDuration, 1)
      setKeyHoldProgress(progress)
      
      if (progress < 1) {
        holdTimeoutRef.current = setTimeout(updateProgress, 16) // ~60fps
      } else {
        onKeyActivated()
        setIsHolding(false)
        setKeyHoldProgress(0)
      }
    }
    
    updateProgress()
  }

  const handleKeyRelease = () => {
    if (isHolding) {
      setIsHolding(false)
      setKeyHoldProgress(0)
      if (holdTimeoutRef.current) {
        clearTimeout(holdTimeoutRef.current)
      }
    }
  }

  // Simulate finding the key after a delay
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        console.log('Key found - showing interactive button')
        setKeyFound(true)
      }, splineLoaded ? 3000 : 1000) // Faster if Spline didn't load
      return () => clearTimeout(timer)
    }
  }, [isLoading, splineLoaded])

  return (
    <div className="relative w-full h-screen bg-black">
      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            box-shadow: 0 0 40px rgba(16, 185, 129, 0.6), 0 0 80px rgba(16, 185, 129, 0.3);
          }
          50% {
            box-shadow: 0 0 60px rgba(16, 185, 129, 0.8), 0 0 120px rgba(16, 185, 129, 0.5);
          }
        }
        @keyframes glow {
          0%, 100% {
            transform: scale(1);
            opacity: 0.7;
          }
          50% {
            transform: scale(1.1);
            opacity: 1;
          }
        }
      `}</style>
      {/* Spline iframe */}
      <div className="absolute inset-0 z-0">
        <iframe
          ref={iframeRef}
          src="https://my.spline.design/chatgptkeyboard-XnnwlApQoq0SA1kcEfAfzbog/"
          frameBorder="0"
          width="100%"
          height="100%"
          allow="fullscreen"
          onLoad={() => {
            console.log('Spline 3D keyboard loaded successfully')
            setSplineLoaded(true)
            setIsLoading(false)
          }}
          onError={(e) => {
            console.error('Spline 3D keyboard failed to load:', e)
            setSplineLoaded(false)
            setIsLoading(false)
          }}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            background: '#000000',
            position: 'absolute',
            top: 0,
            left: 0
          }}
        />
      </div>
      
      {/* Loading Overlay */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            className="absolute inset-0 bg-black flex items-center justify-center z-10"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="text-center">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin mx-auto mb-4" />
              <p className="text-white text-lg">Loading 3D Keyboard...</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Key Hold Progress Overlay */}
      <AnimatePresence>
        {isHolding && (
          <motion.div
            className="absolute inset-0 bg-black/50 flex items-center justify-center z-20"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-center">
              <div className="w-32 h-32 mx-auto mb-4 relative">
                <div className="w-full h-full rounded-full border-4 border-white/20 flex items-center justify-center">
                  <div 
                    className="w-full h-full rounded-full border-4 border-blue-500 border-t-transparent"
                    style={{
                      transform: `rotate(${keyHoldProgress * 360}deg)`,
                      transition: 'transform 0.1s linear'
                    }}
                  />
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <Keyboard className="w-8 h-8 text-white" />
                </div>
              </div>
              <p className="text-white text-lg font-medium">
                Hold to activate... {Math.round(keyHoldProgress * 100)}%
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive Key Button - positioned over the green key */}
      <AnimatePresence>
        {keyFound && !isHolding && (
          <motion.div
            className="absolute z-50"
            style={{
              top: '45%', // Position over the green key in the 3D scene
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <motion.button
              className="w-24 h-24 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full shadow-2xl flex items-center justify-center text-white font-bold text-2xl hover:from-green-500 hover:to-emerald-600 transition-all duration-300 relative"
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
              <Keyboard className="w-10 h-10" />
              {/* Glowing effect */}
              <div 
                className="absolute inset-0 rounded-full bg-green-400/20"
                style={{ animation: 'glow 2s infinite' }}
              />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Instructions Overlay */}
      {!isLoading && !keyFound && (
        <motion.div
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-center z-40"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
        >
          <div className="bg-black/60 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/20">
            {!splineLoaded ? (
              <>
                <p className="text-white text-lg font-medium mb-2">
                  🎹 Loading 3D ChatGPT Keyboard...
                </p>
                <p className="text-white/70 text-sm">
                  If the 3D keyboard doesn't load, the interactive key will appear automatically
                </p>
              </>
            ) : (
              <>
                <p className="text-white text-lg font-medium mb-2">
                  🎹 Explore the 3D ChatGPT Keyboard...
                </p>
                <p className="text-white/70 text-sm">
                  The interactive key will appear soon
                </p>
              </>
            )}
          </div>
        </motion.div>
      )}

      {/* Key Found Instructions */}
      {keyFound && !isHolding && (
        <motion.div
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-center z-40"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="bg-gradient-to-r from-green-500/80 to-emerald-500/80 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/20">
            <p className="text-white text-lg font-medium mb-2">
              🎹 Green Key Found! Hold the button for 1 second
            </p>
            <p className="text-white/90 text-sm">
              Click and hold the glowing green key button to activate VeeFore
            </p>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// Main Content Component (what appears after key activation)
const MainContent = () => {
  return (
    <motion.div
      className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 1 }}
    >
      <div className="text-center max-w-4xl mx-auto px-8">
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mb-8"
        >
          <Sparkles className="w-20 h-20 text-blue-400 mx-auto mb-4" />
        </motion.div>
        
        <motion.h1
          className="text-6xl md:text-8xl font-bold text-white mb-6"
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.4 }}
        >
          Welcome to
          <br />
          <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            VeeFore
          </span>
        </motion.h1>
        
        <motion.p
          className="text-xl text-white/80 mb-8 max-w-2xl mx-auto"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.6 }}
        >
          Your AI-powered social media management platform is now activated. 
          Experience the future of content creation and automation.
        </motion.p>
        
        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
        >
          <button className="bg-gradient-to-r from-blue-500 to-purple-500 text-white px-8 py-4 rounded-full font-semibold text-lg hover:from-blue-600 hover:to-purple-600 transition-all duration-300 shadow-xl hover:shadow-2xl flex items-center space-x-2">
            <span>Get Started</span>
            <ArrowRight size={20} />
          </button>
          <button className="border-2 border-white/30 text-white px-8 py-4 rounded-full font-semibold text-lg hover:border-white/60 hover:bg-white/10 transition-all duration-300 backdrop-blur-sm">
            Learn More
          </button>
        </motion.div>
      </div>
    </motion.div>
  )
}

// Main Component
const SplineKeyboardLanding = () => {
  const [isActivated, setIsActivated] = useState(false)

  const handleKeyActivation = () => {
    setIsActivated(true)
  }

  if (isActivated) {
    return <MainContent />
  }

  return <SplineKeyboardScene onKeyActivated={handleKeyActivation} />
}

export default SplineKeyboardLanding
