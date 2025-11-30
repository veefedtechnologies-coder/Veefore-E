/**
 * CRITICAL FIX: Global Workspace Validation Hook
 * 
 * This hook runs on app startup to validate and auto-correct
 * workspace IDs, preventing the critical production bug.
 */

import { useEffect, useState } from 'react'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { validateWorkspaceId, clearWorkspaceCache } from '@/utils/workspaceValidator'
import { useFirebaseAuth } from './useFirebaseAuth'

interface ValidationState {
  isValidating: boolean
  isValid: boolean
  isCorrected: boolean
  error: string | null
}

export function useWorkspaceValidation() {
  const { currentWorkspace, currentWorkspaceId } = useCurrentWorkspace()
  const { user, loading } = useFirebaseAuth() // Add authentication state
  const [validationState, setValidationState] = useState<ValidationState>({
    isValidating: false,
    isValid: true,
    isCorrected: false,
    error: null
  })
  
  // Track if validation has already been attempted to prevent duplicate calls
  const [hasValidated, setHasValidated] = useState(false)

  useEffect(() => {
    // CRITICAL FIX: Only validate after user is authenticated
    if (!currentWorkspaceId || !currentWorkspace) {
      console.log('[WORKSPACE VALIDATION] ⏸️ Waiting for workspace data')
      return
    }
    
    if (!user || loading) {
      console.log('[WORKSPACE VALIDATION] ⏸️ Waiting for authentication', { user: !!user, loading })
      return
    }
    
    // Only validate once per workspace to prevent duplicate API calls
    if (hasValidated) {
      console.log('[WORKSPACE VALIDATION] ✅ Already validated this workspace')
      return
    }
    
    console.log('[WORKSPACE VALIDATION] ✅ Ready to validate - user authenticated')
    setHasValidated(true) // Mark as validated to prevent duplicate calls

    const validateWorkspace = async () => {
      setValidationState(prev => ({ ...prev, isValidating: true, error: null }))

      try {
        console.log('[WORKSPACE VALIDATION] 🔍 Starting validation for:', {
          workspaceId: currentWorkspaceId,
          workspaceName: currentWorkspace.name
        })

        const validation = await validateWorkspaceId(currentWorkspaceId)

        if (validation.valid) {
          console.log('[WORKSPACE VALIDATION] ✅ Workspace ID is valid')
          setValidationState({
            isValidating: false,
            isValid: true,
            isCorrected: false,
            error: null
          })
        } else if (validation.corrupted && validation.suggestedWorkspace) {
          console.log('[WORKSPACE VALIDATION] 🔧 Workspace ID was corrupted and auto-corrected')
          setValidationState({
            isValidating: false,
            isValid: true,
            isCorrected: true,
            error: null
          })
        } else {
          console.warn('[WORKSPACE VALIDATION] ❌ Workspace validation failed:', validation.message)
          setValidationState({
            isValidating: false,
            isValid: false,
            isCorrected: false,
            error: validation.message || 'Unknown validation error'
          })
        }
      } catch (error) {
        console.error('[WORKSPACE VALIDATION] ❌ Validation error:', error)
        setValidationState({
          isValidating: false,
          isValid: false,
          isCorrected: false,
          error: error instanceof Error ? error.message : 'Validation failed'
        })
      }
    }

    // Run validation with a small delay to avoid race conditions
    const timeoutId = setTimeout(validateWorkspace, 100)

    return () => clearTimeout(timeoutId)
  }, [currentWorkspaceId, currentWorkspace, user, loading, hasValidated])

  // Listen for workspace ID correction events
  useEffect(() => {
    const handleWorkspaceCorrection = (event: CustomEvent) => {
      const { oldId, newId } = event.detail
      console.log('[WORKSPACE VALIDATION] 🔄 Workspace ID corrected:', { oldId, newId })
      
      setValidationState(prev => ({
        ...prev,
        isCorrected: true,
        isValid: true
      }))

      // Clear cache to force re-validation
      clearWorkspaceCache()
    }

    window.addEventListener('workspace-id-corrected', handleWorkspaceCorrection as EventListener)
    
    return () => {
      window.removeEventListener('workspace-id-corrected', handleWorkspaceCorrection as EventListener)
    }
  }, [])

  return {
    ...validationState,
    currentWorkspace,
    currentWorkspaceId
  }
}
