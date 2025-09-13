import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Keyboard, ArrowRight, Sparkles } from 'lucide-react'

const RobotHeroLanding = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [robotLoaded, setRobotLoaded] = useState(false)
  const [keyFound, setKeyFound] = useState(false)
  const [isHolding, setIsHolding] = useState(false)
  const [keyHoldProgress, setKeyHoldProgress] = useState(0)
  const [isActivated, setIsActivated] = useState(false)
  const [progress, setProgress] = useState(0)

  const iframeRef = React.useRef<HTMLIFrameElement>(null)

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

  // Simulate finding the key after robot loads
  useEffect(() => {
    if (!isLoading) {
      const timer = setTimeout(() => {
        console.log('Robot loaded - showing interactive key')
        setKeyFound(true)
      }, robotLoaded ? 2000 : 1000) // Faster if robot didn't load
      return () => clearTimeout(timer)
    }
  }, [isLoading, robotLoaded])

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
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
        @keyframes float {
          0%, 100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
        }
        @keyframes sparkle {
          0%, 100% {
            opacity: 0;
            transform: scale(0);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>

      {/* Full 3D Robot Hero Section */}
      <div className="absolute inset-0 z-0">
        <iframe
          ref={iframeRef}
          src="https://my.spline.design/nexbotrobotcharacterconcept-uuzDQRESzeoSz5hmrJwuSV2e/"
          frameBorder="0"
          width="100%"
          height="100%"
          allow="fullscreen"
          onLoad={() => {
            console.log('3D Robot loaded successfully')
            setRobotLoaded(true)
            setIsLoading(false)
          }}
          onError={(e) => {
            console.error('3D Robot failed to load:', e)
            setRobotLoaded(false)
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
            className="absolute inset-0 bg-black/90 flex items-center justify-center z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 relative">
                <div className="w-full h-full rounded-full border-4 border-white/20 flex items-center justify-center">
                  <div className="w-full h-full rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
                </div>
              </div>
              <p className="text-white text-lg font-medium">
                {!robotLoaded ? 'Loading 3D Robot...' : 'Initializing AI Assistant...'}
              </p>
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
                    className="w-full h-full rounded-full border-4 border-green-500 border-t-transparent"
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
                Activating AI... {Math.round(keyHoldProgress * 100)}%
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Interactive Key Button - positioned over the robot */}
      <AnimatePresence>
        {keyFound && !isHolding && !isActivated && (
          <motion.div
            className="absolute z-50"
            style={{
              top: '60%', // Position over the robot
              left: '50%',
              transform: 'translate(-50%, -50%)'
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <motion.button
              className="w-24 h-24 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full shadow-2xl flex items-center justify-center text-white font-bold text-2xl hover:from-green-500 hover:to-emerald-600 transition-all duration-300 relative group"
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
              {/* Floating animation */}
              <motion.div
                className="absolute inset-0 rounded-full bg-green-400/10"
                animate={{ y: [0, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Content Overlay */}
      <div className="absolute inset-0 z-10 flex items-center justify-center">
        <div className="text-center max-w-4xl mx-auto px-6">
          {/* Main Title */}
          <motion.h1
            className="text-6xl md:text-8xl font-bold text-white mb-6"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.5 }}
            style={{
              background: 'linear-gradient(135deg, #ffffff, #a0a0a0)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 0 30px rgba(255, 255, 255, 0.3)'
            }}
          >
            VeeFore AI
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            className="text-xl md:text-2xl text-white/80 mb-8 max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.8 }}
          >
            Your AI-powered content creation assistant
          </motion.p>

          {/* Floating particles effect */}
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 bg-white/30 rounded-full"
                style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                }}
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0, 1, 0],
                  y: [0, -50, 0]
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  delay: Math.random() * 2
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Instructions Overlay */}
      {!isLoading && !keyFound && (
        <motion.div
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-center z-40"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
        >
          <div className="bg-black/60 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/20">
            {!robotLoaded ? (
              <>
                <p className="text-white text-lg font-medium mb-2">
                  🤖 Loading 3D AI Robot...
                </p>
                <p className="text-white/70 text-sm">
                  If the robot doesn't load, the interactive key will appear automatically
                </p>
              </>
            ) : (
              <>
                <p className="text-white text-lg font-medium mb-2">
                  🤖 Explore the 3D AI Robot...
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
      {keyFound && !isHolding && !isActivated && (
        <motion.div
          className="absolute bottom-8 left-1/2 transform -translate-x-1/2 text-center z-40"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="bg-gradient-to-r from-green-500/80 to-emerald-500/80 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/20">
            <p className="text-white text-lg font-medium mb-2">
              🤖 AI Robot Ready! Hold the key to activate
            </p>
            <p className="text-white/90 text-sm">
              Click and hold the glowing key to start your AI journey
            </p>
          </div>
        </motion.div>
      )}

      {/* Success State */}
      <AnimatePresence>
        {isActivated && (
          <motion.div
            className="absolute inset-0 bg-gradient-to-br from-green-900/20 to-emerald-900/20 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="text-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200 }}
            >
              <motion.div
                className="w-32 h-32 mx-auto mb-6 bg-gradient-to-r from-green-400 to-emerald-500 rounded-full flex items-center justify-center"
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Sparkles className="w-16 h-16 text-white" />
              </motion.div>
              <h2 className="text-4xl font-bold text-white mb-4">
                Welcome to VeeFore AI!
              </h2>
              <p className="text-xl text-white/80 mb-8">
                Your AI assistant is now active
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
  )
}

export default RobotHeroLanding
