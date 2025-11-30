/**
 * CRITICAL FIX: Workspace ID Validation Utility
 * 
 * This utility ensures workspace IDs are always correct and prevents
 * the critical bug where frontend shows one workspace but API calls
 * go to a different workspace ID.
 */

import { apiRequest } from '@/lib/queryClient'

interface WorkspaceValidationResult {
  valid: boolean
  corrupted?: boolean
  suggestedWorkspace?: {
    id: string
    name: string
    slug: string
    userId: string
  }
  message?: string
}

interface Workspace {
  id: string
  name: string
  slug?: string
  userId?: string
}

class WorkspaceValidator {
  private validationCache = new Map<string, WorkspaceValidationResult>()
  private readonly CACHE_DURATION = 5 * 60 * 1000 // 5 minutes
  private readonly MAX_RETRIES = 3

  /**
   * Validate workspace ID and auto-correct if corrupted
   */
  async validateWorkspaceId(workspaceId: string): Promise<WorkspaceValidationResult> {
    // Check cache first
    const cached = this.validationCache.get(workspaceId)
    if (cached && this.isCacheValid(cached)) {
      return cached
    }

    try {
      console.log(`[WORKSPACE VALIDATOR] 🔍 Validating workspace ID: ${workspaceId}`)
      
      const response = await apiRequest(`/api/workspace/validate/${workspaceId}`)
      
      // Cache the result
      this.validationCache.set(workspaceId, {
        ...response,
        timestamp: Date.now()
      } as any)
      
      if (!response.valid && response.corrupted) {
        console.warn(`[WORKSPACE VALIDATOR] 🚨 CORRUPTED WORKSPACE ID DETECTED!`, {
          invalidId: workspaceId,
          suggestedId: response.suggestedWorkspace?.id,
          suggestedName: response.suggestedWorkspace?.name,
          message: response.message
        })
        
        // Auto-correct localStorage if we have a suggestion
        if (response.suggestedWorkspace) {
          this.autoCorrectWorkspaceId(workspaceId, response.suggestedWorkspace.id)
        }
      }
      
      return response
    } catch (error) {
      console.error(`[WORKSPACE VALIDATOR] ❌ Validation failed for ${workspaceId}:`, error)
      
      // Return a safe fallback
      return {
        valid: false,
        corrupted: true,
        message: `Validation failed: ${error}`
      }
    }
  }

  /**
   * Auto-correct workspace ID in localStorage
   */
  private autoCorrectWorkspaceId(oldId: string, newId: string): void {
    try {
      const currentStoredId = localStorage.getItem('currentWorkspaceId')
      
      if (currentStoredId === oldId) {
        console.log(`[WORKSPACE VALIDATOR] 🔧 AUTO-CORRECTING localStorage:`, {
          from: oldId,
          to: newId
        })
        
        localStorage.setItem('currentWorkspaceId', newId)
        
        // Dispatch event to notify components
        window.dispatchEvent(new CustomEvent('workspace-id-corrected', {
          detail: { oldId, newId }
        }))
      }
    } catch (error) {
      console.error('[WORKSPACE VALIDATOR] ❌ Failed to auto-correct localStorage:', error)
    }
  }

  /**
   * Check if cached validation is still valid
   */
  private isCacheValid(cached: any): boolean {
    return cached.timestamp && (Date.now() - cached.timestamp) < this.CACHE_DURATION
  }

  /**
   * Clear validation cache
   */
  clearCache(): void {
    this.validationCache.clear()
  }

  /**
   * Validate workspace ID before making API calls
   */
  async validateBeforeApiCall(workspaceId: string): Promise<string> {
    const validation = await this.validateWorkspaceId(workspaceId)
    
    if (validation.valid) {
      return workspaceId
    }
    
    if (validation.suggestedWorkspace) {
      console.log(`[WORKSPACE VALIDATOR] 🔄 Using suggested workspace ID: ${validation.suggestedWorkspace.id}`)
      return validation.suggestedWorkspace.id
    }
    
    // Fallback: return original ID (let the API handle the error)
    console.warn(`[WORKSPACE VALIDATOR] ⚠️ No valid workspace ID found, using original: ${workspaceId}`)
    return workspaceId
  }
}

// Export singleton instance
export const workspaceValidator = new WorkspaceValidator()

// Export utility functions
export const validateWorkspaceId = (workspaceId: string) => workspaceValidator.validateWorkspaceId(workspaceId)
export const validateBeforeApiCall = (workspaceId: string) => workspaceValidator.validateBeforeApiCall(workspaceId)
export const clearWorkspaceCache = () => workspaceValidator.clearCache()




