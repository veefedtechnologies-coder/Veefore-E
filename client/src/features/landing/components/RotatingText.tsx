import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Tagline {
  w1: string
  w2: string
  w3: string
  w4: string
}

const taglines: Tagline[] = [
  { w1: "Posting is not", w2: "growth.", w3: "Engagement", w4: "is." },
  { w1: "Schedule", w2: "smarter.", w3: "Grow", w4: "faster." },
  { w1: "Publish with", w2: "precision.", w3: "Grow with", w4: "data." },
  { w1: "Smart", w2: "comments.", w3: "Smarter", w4: "DMs." }
]

/**
 * RotatingText Component
 * 
 * Displays rotating taglines with smooth fade/slide transitions
 * Optimized for performance with controlled animation timing
 * 
 * Requirements: 21.1, 21.3
 */
export const RotatingText: React.FC = () => {
  const [index, setIndex] = useState(0)
  const [isFirstRender, setIsFirstRender] = useState(true)

  useEffect(() => {
    // Mark that first render is complete
    setIsFirstRender(false)
    
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % taglines.length)
    }, 4000)
    
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="relative flex justify-center items-center w-full overflow-visible pb-4 md:pb-8">
      <AnimatePresence mode="popLayout">
        <motion.h1
          key={index}
          initial={isFirstRender ? { opacity: 1, y: 0, filter: 'blur(0px)' } : { opacity: 0, y: 40, filter: 'blur(10px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -40, filter: 'blur(10px)' }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="w-full px-4 font-normal leading-[1.1] md:leading-[0.95] tracking-[-1px] md:tracking-[-2px] text-white"
          style={{
            fontFamily: "'Instrument Serif', serif",
            fontSize: 'clamp(2.5rem, 5.5vw, 5rem)',
            transformOrigin: 'center center',
          }}
        >
          {taglines[index].w1}{' '}
          <em className="not-italic" style={{ color: 'hsl(240 4% 66%)' }}>
            {taglines[index].w2}
          </em>{' '}
          {taglines[index].w3}{' '}
          <em className="not-italic" style={{ color: 'hsl(240 4% 66%)' }}>
            {taglines[index].w4}
          </em>
        </motion.h1>
      </AnimatePresence>
    </div>
  )
}
