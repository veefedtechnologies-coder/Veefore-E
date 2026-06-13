import React, { useState, useRef, useEffect } from 'react'
import { ArrowRight, ArrowLeft, CheckCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/lib/queryClient'
import { useToast } from '@/hooks/use-toast'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'
import { useAuth } from '@/hooks/useAuth'
import { 
  saveAutomationState, 
  loadAutomationState, 
  clearAutomationCache,
  clearUserAutomationCache 
} from '@/lib/cache'

// Types
import { 
  AutomationBuilderProps, 
  AutomationFlowState, 
  AutomationRule,
  SocialAccount 
} from '../types/automation.types'

// Utilities
import { 
  getCurrentKeywords, 
  getCurrentResponses, 
  getSteps, 
  canProceedToNext,
  getInitialFlowState
} from '../utils/automationHelpers'

import { 
  transformSocialAccounts, 
  transformPosts 
} from '../utils/dataTransformers'

/**
 * AutomationBuilder - Main orchestrator component for automation workflow
 * 
 * This component manages the end-to-end automation creation flow:
 * - Step 1: Account and content selection
 * - Step 2: Automation type and trigger configuration
 * - Step 3: DM configuration (for comment_dm type)
 * - Step 4: Advanced settings (timing, AI personality)
 * - Step 5: Review and activation
 * 
 * Requirements: 2.1, 2.2, 2.3
 */

// ============================================================================
// Main Component
// ============================================================================

export const AutomationBuilder: React.FC<AutomationBuilderProps> = ({
  currentStep: externalStep,
  onStepChange,
  showList = false,
  onToggleList
}) => {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { currentWorkspace } = useCurrentWorkspace()
  const { user } = useAuth()

  // ============================================================================
  // State Management
  // ============================================================================

  const [currentStep, setCurrentStep] = useState(externalStep || 1)
  const [showAutomationList, setShowAutomationList] = useState(showList)
  
  // Flow state with initial values from helper
  const [flowState, setFlowState] = useState<AutomationFlowState>(getInitialFlowState())

  // UI state
  const [newKeyword, setNewKeyword] = useState('')
  const [accountDropdownOpen, setAccountDropdownOpen] = useState(false)
  const [contentTypeDropdownOpen, setContentTypeDropdownOpen] = useState(false)
  const [automationTypeDropdownOpen, setAutomationTypeDropdownOpen] = useState(false)

  // Refs for dropdown management
  const accountDropdownRef = useRef<HTMLDivElement>(null)
  const contentTypeDropdownRef = useRef<HTMLDivElement>(null)
  const automationTypeDropdownRef = useRef<HTMLDivElement>(null)

  // ============================================================================
  // Data Fetching
  // ============================================================================

  // Fetch social accounts
  const { data: socialAccountsData, isLoading: accountsLoading } = useQuery({
    queryKey: ['automation-social-accounts', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace?.id) return []
      const response = await apiRequest(`/api/social-accounts?workspaceId=${currentWorkspace.id}`)
      if (Array.isArray(response)) return response
      if (response && Array.isArray(response.data)) return response.data
      return []
    },
    enabled: !!currentWorkspace?.id,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    retry: 1,
  })

  // Transform accounts data using utility function
  const realAccounts = transformSocialAccounts(socialAccountsData || [])

  // Get selected account data
  const selectedAccountData = realAccounts.find((acc: SocialAccount) => acc.id === flowState.selectedAccount)

  // Fetch posts for selected account
  const { data: postsData, isLoading: postsLoading } = useQuery({
    queryKey: ['automation-instagram-content', flowState.selectedAccount, selectedAccountData?.workspaceId],
    queryFn: async () => {
      if (!flowState.selectedAccount || !selectedAccountData?.workspaceId) return []
      
      const response = await apiRequest(
        `/api/v1/content/workspace/${selectedAccountData.workspaceId}?accountId=${flowState.selectedAccount}&limit=100&page=1`
      )
      const items = Array.isArray(response) ? response : (response?.data || [])
      return items
    },
    enabled: !!flowState.selectedAccount && !!selectedAccountData?.workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    keepPreviousData: true,
    retry: false,
    refetchOnReconnect: false,
  })

  // Transform posts data using utility function
  const realPosts = transformPosts(postsData || [])

  // Fetch automation rules
  const { data: automationRules, isLoading: rulesLoading, refetch: refetchRules } = useQuery({
    queryKey: ['automation-rules', realAccounts?.[0]?.workspaceId],
    queryFn: async () => {
      const workspaceId = realAccounts?.[0]?.workspaceId
      if (!workspaceId) return []
      const response = await apiRequest(`/api/automation/rules?workspaceId=${workspaceId}`)
      return response.rules || []
    },
    enabled: !!realAccounts?.[0]?.workspaceId,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    keepPreviousData: true,
    retry: false,
  })

  // ============================================================================
  // Mutations
  // ============================================================================

  const createAutomationMutation = useMutation({
    mutationFn: async (automationData: any) => {
      return await apiRequest('/api/automation/rules', {
        method: 'POST',
        body: JSON.stringify(automationData)
      })
    },
    onSuccess: () => {
      toast({
        title: "Success!",
        description: "Automation rule created successfully",
      })
      refetchRules()
      // Reset to step 1
      handleStepChange(1)
      clearAutomationCache()
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create automation rule",
        variant: "destructive",
      })
    }
  })

  // ============================================================================
  // Helper Functions (using imported utilities)
  // ============================================================================

  const handleStepChange = (step: number) => {
    setCurrentStep(step)
    if (onStepChange) {
      onStepChange(step)
    }
  }

  const handleNext = () => {
    if (canProceedToNext(currentStep, flowState) && currentStep < getSteps(flowState.automationType).length) {
      if (currentStep === 1) {
        setFlowState(prev => ({ ...prev, contentType: '' }))
      }
      handleStepChange(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      handleStepChange(currentStep - 1)
    }
  }

  const handleFinish = async () => {
    if (!flowState.selectedAccount || !flowState.selectedPost || !flowState.automationType) {
      toast({
        title: "Error",
        description: "Please complete all required fields",
        variant: "destructive",
      })
      return
    }

    const workspaceId = selectedAccountData?.workspaceId
    if (!workspaceId) {
      toast({
        title: "Error",
        description: "No workspace found for selected account.",
        variant: "destructive",
      })
      return
    }

    const currentKeywords = getCurrentKeywords(flowState)
    const currentResponses = getCurrentResponses(flowState)
    
    const ruleData: AutomationRule = {
      name: `${flowState.automationType === 'comment_only' ? 'Comment' : 
              flowState.automationType === 'dm_only' ? 'DM' : 'Comment to DM'} Automation`,
      workspaceId: workspaceId,
      type: flowState.automationType,
      matchMode: flowState.matchMode,
      negativeKeywords: flowState.negativeKeywords,
      aiIntents: flowState.aiIntents,
      keywords: currentKeywords,
      targetMediaIds: flowState.selectedPost ? [flowState.selectedPost.id] : [],
      responses: currentResponses,
      isActive: true
    }

    try {
      await createAutomationMutation.mutateAsync(ruleData)
    } catch (error: any) {
      console.error('Error creating automation rule:', error)
    }
  }

  const updateFlowState = (updates: Partial<AutomationFlowState>) => {
    setFlowState(prev => ({ ...prev, ...updates }))
  }

  // ============================================================================
  // Effects
  // ============================================================================

  // Load cached state on mount
  useEffect(() => {
    if (!user?.uid) return
    
    const cachedState = loadAutomationState(user.uid)
    if (cachedState) {
      if (cachedState.selectedAccount && realAccounts.length > 0) {
        const isValidAccount = realAccounts.some((account: any) => account.id === cachedState.selectedAccount)
        if (isValidAccount) {
          updateFlowState({ selectedAccount: cachedState.selectedAccount })
        } else {
          clearUserAutomationCache(user.uid)
        }
      }
      
      if (cachedState.contentType) {
        updateFlowState({ contentType: cachedState.contentType })
      }
    }
  }, [user?.uid])

  // Save state to cache when it changes
  useEffect(() => {
    if (!user?.uid) return
    
    if (flowState.selectedAccount || flowState.contentType) {
      const stateToCache = {
        selectedAccount: flowState.selectedAccount,
        contentType: flowState.contentType
      }
      
      saveAutomationState(stateToCache, user.uid)
    }
  }, [user?.uid, flowState.selectedAccount, flowState.contentType])

  // Handle click outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(event.target as Node)) {
        setAccountDropdownOpen(false)
      }
      if (contentTypeDropdownRef.current && !contentTypeDropdownRef.current.contains(event.target as Node)) {
        setContentTypeDropdownOpen(false)
      }
      if (automationTypeDropdownRef.current && !automationTypeDropdownRef.current.contains(event.target as Node)) {
        setAutomationTypeDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // ============================================================================
  // Render
  // ============================================================================

  const steps = getSteps(flowState.automationType)

  return (
    <div className="automation-builder">
      {/* Progress Steps */}
      <div className="mb-12">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center font-bold text-lg transition-all ${
                  currentStep === step.id
                    ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-lg scale-110'
                    : currentStep > step.id
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}>
                  {currentStep > step.id ? <CheckCircle className="w-6 h-6" /> : step.id}
                </div>
                <div className="mt-3 text-center">
                  <div className={`text-sm font-semibold ${
                    currentStep === step.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-gray-400'
                  }`}>
                    {step.title}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    {step.description}
                  </div>
                </div>
              </div>
              {index < steps.length - 1 && (
                <div className={`flex-1 h-1 mx-6 mt-[-25px] rounded-full transition-all ${
                  currentStep > step.id ? 'bg-green-500' : 'bg-gray-200 dark:bg-gray-700'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content - Placeholder for child components */}
      <div className="max-w-7xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
          <h2 className="text-2xl font-bold mb-6">Step {currentStep}: {steps[currentStep - 1].title}</h2>
          
          {/* TODO: Render TriggerSelector, ActionConfigurator, or PreviewPanel based on currentStep */}
          <div className="text-gray-500 text-center py-12">
            Step content will be rendered here by child components:
            <ul className="mt-4 text-left max-w-md mx-auto space-y-2">
              <li>• TriggerSelector (Step 1 & 2)</li>
              <li>• ActionConfigurator (Step 2 & 3)</li>
              <li>• PreviewPanel (All steps)</li>
            </ul>
          </div>

          {/* Navigation */}
          <div className="flex justify-between mt-8">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 1}
              className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg 
                         disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 
                         transition-colors flex items-center gap-2"
            >
              <ArrowLeft className="w-5 h-5" />
              Previous
            </button>

            {currentStep < steps.length ? (
              <button
                onClick={handleNext}
                disabled={!canProceedToNext(currentStep, flowState)}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-lg 
                           disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all 
                           flex items-center gap-2"
              >
                Next
                <ArrowRight className="w-5 h-5" />
              </button>
            ) : (
              <button
                onClick={handleFinish}
                disabled={createAutomationMutation.isLoading}
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg 
                           disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg transition-all 
                           flex items-center gap-2"
              >
                <CheckCircle className="w-5 h-5" />
                {createAutomationMutation.isLoading ? 'Creating...' : 'Create Automation'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AutomationBuilder
