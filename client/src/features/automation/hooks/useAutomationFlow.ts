/**
 * useAutomationFlow - Custom hook for automation creation workflow
 * 
 * Manages state for the automation builder flow and provides methods
 * for updating triggers, adding actions, validating, and saving automations.
 * 
 * Refactored from 627 lines to use reducer pattern and extracted modules.
 * 
 * Requirements: 2.2, 5.2
 */

import { useReducer, useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import type { 
  AutomationFlowState, 
  AutomationRule, 
  DmButton 
} from '../types/automation.types';
import type {
  TriggerUpdate,
  ActionUpdate,
  AdvancedSettingsUpdate,
  UseAutomationFlowReturn,
  ValidationResult
} from '../types/automationFlow.types';
import { getInitialFlowState } from '../constants/automationFlow.constants';
import { automationFlowReducer } from '../reducers/automationFlow.reducer';
import { useCreateAutomationMutation } from './useAutomationFlowMutations';
import { validateAutomationFlow } from '../utils/automationFlowValidation';
import { 
  getCurrentKeywords, 
  getCurrentResponses, 
  canProceedToNext 
} from '../utils/automationHelpers';
import { 
  saveAutomationState, 
  loadAutomationState, 
  clearAutomationCache,
  clearUserAutomationCache 
} from '@/lib/cache';

/**
 * Custom hook for managing automation flow state and operations
 */
export const useAutomationFlow = (
  initialStep: number = 1,
  userId?: string
): UseAutomationFlowReturn => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ============================================================================
  // State Management with Reducer
  // ============================================================================

  const [flow, dispatch] = useReducer(automationFlowReducer, getInitialFlowState());
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [isValid, setIsValid] = useState(false);

  // ============================================================================
  // Load cached state on mount
  // ============================================================================

  useEffect(() => {
    if (userId) {
      const cachedState = loadAutomationState(userId);
      if (cachedState && Object.keys(cachedState).length > 0) {
        // Convert cache data (which has nullable fields) to flow state
        const flowState: Partial<AutomationFlowState> = {
          selectedAccount: cachedState.selectedAccount || '',
          contentType: cachedState.contentType || '',
          automationType: cachedState.automationType,
          keywords: cachedState.keywords,
        };
        dispatch({ type: 'LOAD_FROM_CACHE', payload: flowState });
      }
    }
  }, [userId]);

  // ============================================================================
  // Save state to cache when it changes
  // ============================================================================

  useEffect(() => {
    if (userId && (flow.selectedAccount || flow.contentType)) {
      const stateToCache = {
        selectedAccount: flow.selectedAccount,
        contentType: flow.contentType,
        automationType: flow.automationType,
        keywords: flow.keywords,
      };
      saveAutomationState(stateToCache, userId);
    }
  }, [userId, flow.selectedAccount, flow.contentType, flow.automationType, flow.keywords]);

  // ============================================================================
  // Validation
  // ============================================================================

  const validateFlow = useCallback((): ValidationResult => {
    const result = validateAutomationFlow(flow);
    setIsValid(result.isValid);
    return result;
  }, [flow]);

  // ============================================================================
  // Reset and Cache Management
  // ============================================================================

  const resetFlow = useCallback(() => {
    dispatch({ type: 'RESET_FLOW' });
    setCurrentStep(1);
    setIsValid(false);
  }, []);

  const clearCache = useCallback((userId?: string) => {
    if (userId) {
      clearUserAutomationCache(userId);
    } else {
      clearAutomationCache();
    }
  }, []);

  // ============================================================================
  // Mutations
  // ============================================================================

  const createAutomationMutation = useCreateAutomationMutation(
    resetFlow,
    clearCache,
    userId,
    queryClient
  );

  // ============================================================================
  // Update Methods
  // ============================================================================

  const updateTrigger = useCallback((updates: TriggerUpdate) => {
    dispatch({ type: 'UPDATE_TRIGGER', payload: updates });
  }, []);

  const addAction = useCallback((updates: ActionUpdate) => {
    dispatch({ type: 'ADD_ACTION', payload: updates });
  }, []);

  const updateAdvancedSettings = useCallback((updates: AdvancedSettingsUpdate) => {
    dispatch({ type: 'UPDATE_ADVANCED_SETTINGS', payload: updates });
  }, []);

  const updateFlow = useCallback((updates: Partial<AutomationFlowState>) => {
    dispatch({ type: 'UPDATE_FLOW', payload: updates });
  }, []);

  // ============================================================================
  // Helper Methods
  // ============================================================================

  const addKeyword = useCallback((keyword: string) => {
    dispatch({ type: 'ADD_KEYWORD', payload: keyword });
  }, []);

  const removeKeyword = useCallback((keyword: string) => {
    dispatch({ type: 'REMOVE_KEYWORD', payload: keyword });
  }, []);

  const addCommentReply = useCallback((reply: string) => {
    dispatch({ type: 'ADD_COMMENT_REPLY', payload: reply });
  }, []);

  const removeCommentReply = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_COMMENT_REPLY', payload: index });
  }, []);

  const addDmButton = useCallback((button: DmButton) => {
    dispatch({ type: 'ADD_DM_BUTTON', payload: button });
  }, []);

  const updateDmButton = useCallback((index: number, updates: Partial<DmButton>) => {
    dispatch({ type: 'UPDATE_DM_BUTTON', payload: { index, updates } });
  }, []);

  const removeDmButton = useCallback((index: number) => {
    dispatch({ type: 'REMOVE_DM_BUTTON', payload: index });
  }, []);

  // ============================================================================
  // Save Automation
  // ============================================================================

  const saveAutomation = useCallback(async (workspaceId: string) => {
    // Validate before saving
    const validation = validateFlow();
    
    if (!validation.isValid) {
      toast({
        title: "Validation Error",
        description: validation.errors[0]?.message || "Please complete all required fields",
        variant: "destructive",
      });
      return;
    }

    if (!flow.selectedPost) {
      toast({
        title: "Error",
        description: "No post selected",
        variant: "destructive",
      });
      return;
    }

    // Build automation rule data
    const keywords = getCurrentKeywords(flow);
    const responses = getCurrentResponses(flow);
    
    const ruleData: AutomationRule = {
      name: `${
        flow.automationType === 'comment_only' ? 'Comment' : 
        flow.automationType === 'dm_only' ? 'DM' : 
        'Comment to DM'
      } Automation`,
      workspaceId: workspaceId,
      type: flow.automationType,
      matchMode: flow.matchMode,
      negativeKeywords: flow.negativeKeywords,
      aiIntents: flow.aiIntents,
      keywords: keywords,
      targetMediaIds: [flow.selectedPost.id],
      responses: responses,
      isActive: true
    };

    try {
      await createAutomationMutation.mutateAsync(ruleData);
    } catch (error: any) {
      console.error('Error creating automation rule:', error);
      // Error toast is handled in mutation onError
    }
  }, [flow, validateFlow, createAutomationMutation, toast]);

  const canProceed = useCallback((step: number): boolean => {
    return canProceedToNext(step, flow);
  }, [flow]);

  // ============================================================================
  // Cache Management
  // ============================================================================

  const loadFromCache = useCallback((userId: string) => {
    const cachedState = loadAutomationState(userId);
    if (cachedState && Object.keys(cachedState).length > 0) {
      // Convert cache data (which has nullable fields) to flow state
      const flowState: Partial<AutomationFlowState> = {
        selectedAccount: cachedState.selectedAccount || '',
        contentType: cachedState.contentType || '',
        automationType: cachedState.automationType,
        keywords: cachedState.keywords,
      };
      dispatch({ type: 'LOAD_FROM_CACHE', payload: flowState });
    }
  }, []);

  const saveToCache = useCallback((userId: string) => {
    const stateToCache = {
      selectedAccount: flow.selectedAccount,
      contentType: flow.contentType,
      automationType: flow.automationType,
      keywords: flow.keywords,
      dmKeywords: flow.dmKeywords,
      commentKeywords: flow.commentKeywords,
    };
    saveAutomationState(stateToCache, userId);
  }, [flow]);

  // ============================================================================
  // Return Hook Interface
  // ============================================================================

  return {
    // State
    flow,
    currentStep,
    isValid,
    isSaving: createAutomationMutation.isPending,
    
    // Methods
    updateTrigger,
    addAction,
    updateAdvancedSettings,
    updateFlow,
    validateFlow,
    saveAutomation,
    resetFlow,
    setCurrentStep,
    canProceed,
    
    // Helpers
    addKeyword,
    removeKeyword,
    addCommentReply,
    removeCommentReply,
    addDmButton,
    updateDmButton,
    removeDmButton,
    
    // Cache management
    loadFromCache,
    saveToCache,
    clearCache,
  };
};

// Re-export types for convenience
export type {
  TriggerUpdate,
  ActionUpdate,
  AdvancedSettingsUpdate,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  UseAutomationFlowReturn
} from '../types/automationFlow.types';

export default useAutomationFlow;
