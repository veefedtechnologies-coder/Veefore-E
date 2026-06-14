import React, { useRef } from 'react'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { useIsMobile } from '../../../hooks/use-is-mobile'

interface TiltCardProps {
  children: React.ReactNode
  className?: string
}

/**
 * TiltCard - 3D mouse-follow tilt effect wrapper.
 * Disabled on mobile (returns a plain GPU-accelerated div) to preserve
 * performance and avoid touch jank.
 */
export const TiltCard: React.FC<TiltCardProps> = ({ children, className = '' }) => {
  const isMobile = useIsMobile()
  const ref = useRef<HTMLDivElement>(null)

  // All hooks must be called unconditionally (Rules of Hooks)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useTransform(y, [-100, 100], [8, -8])
  const rotateY = useTransform(x, [-100, 100], [-8, 8])

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isMobile || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    x.set(e.clientX - centerX)
    y.set(e.clientY - centerY)
  }

  const handleMouseLeave = () => {
    if (isMobile) return
    x.set(0)
    y.set(0)
  }

  if (isMobile) {
    return <div ref={ref} className={`${className} transform-gpu`}>{children}</div>
  }

  return (
    <motion.div
      ref={ref}
      style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`${className} transform-gpu`}
    >
      {children}
    </motion.div>
  )
}

export default TiltCard
