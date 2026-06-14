/**
 * useVideoGeneration Hook
 * 
 * Comprehensive state management for the video generation workflow using reducer pattern.
 * 
 * Features:
 * - Reducer-based state management for predictable state transitions
 * - Script generation via AI with progress tracking
 * - Video generation and job monitoring
 * - Image generation for script scenes
 * - Project persistence (save/load)
 * - Comprehensive error handling
 * - Settings management
 * 
 * Refactored from VideoGeneratorAdvanced.tsx for reusability and maintainability.
 */

import { useReducer, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type {
  VideoSettings,
  GeneratedScript,
  VideoProject,
  UseVideoGenerationReturn
} from '../types/videoGeneration.types';
import { initialState } from '../constants/videoGeneration.constants';
import { videoGenerationReducer } from '../reducers/videoGeneration.reducer';
import {
  useGenerateScriptMutation,
  useGenerateVideoMutation,
  useGenerateImagesMutation,
  useSaveProjectMutation,
  useLoadProjectMutation
} from './useVideoGenerationMutations';

export const useVideoGeneration = (): UseVideoGenerationReturn => {
  const [state, dispatch] = useReducer(videoGenerationReducer, initialState);
  const queryClient = useQueryClient();

  // ============================================================================
  // Mutations
  // ============================================================================

  const generateScriptMutation = useGenerateScriptMutation(dispatch, state);
  const generateVideoMutation = useGenerateVideoMutation(dispatch, state, queryClient);
  const generateImagesMutation = useGenerateImagesMutation(dispatch, state);
  const saveProjectMutation = useSaveProjectMutation(dispatch, state, queryClient);
  const loadProjectMutation = useLoadProjectMutation(dispatch);

  // ============================================================================
  // Action Handlers
  // ============================================================================

  const setPrompt = useCallback((prompt: string) => {
    dispatch({ type: 'SET_PROMPT', payload: prompt });
  }, []);

  const setStep = useCallback((step: typeof state.currentStep) => {
    dispatch({ type: 'SET_STEP', payload: step });
  }, []);

  const updateSettings = useCallback((settings: Partial<VideoSettings>) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: settings });
  }, []);

  const setSettings = useCallback((settings: VideoSettings) => {
    dispatch({ type: 'SET_SETTINGS', payload: settings });
  }, []);

  const generateScript = useCallback(async () => {
    if (!state.prompt.trim()) {
      dispatch({
        type: 'SCRIPT_GENERATION_ERROR',
        payload: { message: 'Please enter a video prompt first' }
      });
      return;
    }
    
    dispatch({ type: 'SCRIPT_GENERATION_START' });
    
    // Show progress animation while API call is in progress
    const interval = setInterval(() => {
      dispatch({ type: 'VIDEO_GENERATION_PROGRESS', payload: Math.min(state.progress + 10, 90) });
    }, 500);
    
    try {
      await generateScriptMutation.mutateAsync();
    } finally {
      clearInterval(interval);
    }
  }, [state.prompt, state.progress, generateScriptMutation]);

  const generateVideo = useCallback(async () => {
    if (!state.generatedScript) {
      dispatch({
        type: 'VIDEO_GENERATION_ERROR',
        payload: { message: 'Please generate a script first' }
      });
      return;
    }
    
    dispatch({ type: 'VIDEO_GENERATION_START' });
    
    try {
      await generateVideoMutation.mutateAsync();
    } catch (error) {
      // Error handling is done in mutation callbacks
    }
  }, [state.generatedScript, generateVideoMutation]);

  const generateImages = useCallback(async () => {
    if (!state.generatedScript) {
      dispatch({
        type: 'IMAGE_GENERATION_ERROR',
        payload: { message: 'Please generate a script first' }
      });
      return;
    }
    
    dispatch({ type: 'IMAGE_GENERATION_START' });
    
    try {
      await generateImagesMutation.mutateAsync();
    } catch (error) {
      // Error handling is done in mutation callbacks
    }
  }, [state.generatedScript, generateImagesMutation]);

  const approveScript = useCallback(() => {
    dispatch({ type: 'APPROVE_SCRIPT' });
  }, []);

  const updateScript = useCallback((script: GeneratedScript) => {
    dispatch({ type: 'UPDATE_SCRIPT', payload: script });
  }, []);

  const saveProject = useCallback(async (title?: string): Promise<VideoProject | null> => {
    const projectTitle = title || state.generatedScript?.title || `Project ${new Date().toLocaleDateString()}`;
    
    dispatch({ type: 'PROJECT_SAVE_START' });
    
    try {
      await saveProjectMutation.mutateAsync(projectTitle);
      return state.currentProject;
    } catch (error) {
      return null;
    }
  }, [state.generatedScript, state.currentProject, saveProjectMutation]);

  const loadProject = useCallback(async (projectId: string) => {
    try {
      await loadProjectMutation.mutateAsync(projectId);
    } catch (error) {
      // Error handling is done in mutation callbacks
    }
  }, [loadProjectMutation]);

  const resetState = useCallback(() => {
    dispatch({ type: 'RESET_STATE' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  // ============================================================================
  // Return Value
  // ============================================================================

  return {
    // State
    state,
    prompt: state.prompt,
    settings: state.settings,
    generatedScript: state.generatedScript,
    isGenerating: state.isGenerating,
    isGeneratingScript: state.isGeneratingScript,
    isGeneratingImages: state.isGeneratingImages,
    isGeneratingVideo: state.isGeneratingVideo,
    progress: state.progress,
    currentJobId: state.currentJobId,
    currentStep: state.currentStep,
    generatedImages: state.generatedImages,
    imageGenerationProgress: state.imageGenerationProgress,
    currentProject: state.currentProject,
    error: state.error,
    
    // Actions
    setPrompt,
    setStep,
    updateSettings,
    setSettings,
    generateScript,
    generateVideo,
    generateImages,
    approveScript,
    updateScript,
    saveProject,
    loadProject,
    resetState,
    clearError,
  };
};

// Re-export types for convenience
export type {
  VideoSettings,
  GeneratedScript,
  ScriptScene,
  VideoProject,
  VideoGenerationError,
  VideoGenerationState,
  UseVideoGenerationReturn
} from '../types/videoGeneration.types';
