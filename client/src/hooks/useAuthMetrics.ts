/**
 * useAuthMetrics Hook
 * 
 * Provides real-time auth validation metrics for monitoring and debugging
 * Useful for:
 * - Performance monitoring
 * - Cache effectiveness tracking
 * - Error rate monitoring
 * - Production debugging
 */

import { useState, useEffect } from 'react'
import { authSessionValidator } from '@/lib/auth-session-validator'

export function useAuthMetrics() {
  const [metrics, setMetrics] = useState(authSessionValidator.getMetrics())
  
  useEffect(() => {
    // Update metrics every 5 seconds
    const interval = setInterval(() => {
      setMetrics(authSessionValidator.getMetrics())
    }, 5000)
    
    return () => clearInterval(interval)
  }, [])
  
  // Log metrics to console (only in development)
  useEffect(() => {
    if (import.meta.env.DEV && metrics.totalValidations > 0) {
      authSessionValidator.logMetrics()
    }
  }, [metrics.totalValidations])
  
  return metrics
}

