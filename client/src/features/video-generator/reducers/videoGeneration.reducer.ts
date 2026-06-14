/**
 * Reducer for video generation state management
 * Extracted from useVideoGeneration.ts to reduce file size
 */

import type {
  VideoGenerationState,
  VideoGenerationAction
} from '../types/videoGeneration.types';

export function videoGenerationReducer(
  state: VideoGenerationState,
  action: VideoGenerationAction
): VideoGenerationState {
  switch (action.type) {
    case 'SET_PROMPT':
      return { ...state, prompt: action.payload, error: null };
    
    case 'SET_STEP':
      return { ...state, currentStep: action.payload };
    
    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: { ...state.settings, ...action.payload },
      };
    
    case 'SET_SETTINGS':
      return { ...state, settings: action.payload };
    
    // Script Generation
    case 'SCRIPT_GENERATION_START':
      return {
        ...state,
        isGenerating: true,
        isGeneratingScript: true,
        progress: 0,
        scriptError: null,
        error: null,
      };
    
    case 'SCRIPT_GENERATION_SUCCESS':
      return {
        ...state,
        generatedScript: action.payload,
        isGenerating: false,
        isGeneratingScript: false,
        progress: 100,
        currentStep: 'script',
        scriptError: null,
      };
    
    case 'SCRIPT_GENERATION_ERROR':
      return {
        ...state,
        isGenerating: false,
        isGeneratingScript: false,
        progress: 0,
        scriptError: action.payload,
        error: action.payload,
      };
    
    case 'APPROVE_SCRIPT':
      return { ...state, isScriptApproved: true };
    
    case 'UPDATE_SCRIPT':
      return { ...state, generatedScript: action.payload };
    
    // Video Generation
    case 'VIDEO_GENERATION_START':
      return {
        ...state,
        isGenerating: true,
        isGeneratingVideo: true,
        progress: 0,
        videoError: null,
        error: null,
      };
    
    case 'VIDEO_GENERATION_SUCCESS':
      return {
        ...state,
        currentJobId: action.payload.jobId,
        currentStep: 'preview',
      };
    
    case 'VIDEO_GENERATION_ERROR':
      return {
        ...state,
        isGenerating: false,
        isGeneratingVideo: false,
        progress: 0,
        videoError: action.payload,
        error: action.payload,
      };
    
    case 'VIDEO_GENERATION_PROGRESS':
      return { ...state, progress: action.payload };
    
    case 'VIDEO_GENERATION_COMPLETE':
      return {
        ...state,
        isGenerating: false,
        isGeneratingVideo: false,
        progress: 100,
        currentProject: state.currentProject
          ? { ...state.currentProject, videoUrl: action.payload.videoUrl, status: 'completed' }
          : null,
      };
    
    // Image Generation
    case 'IMAGE_GENERATION_START':
      return {
        ...state,
        isGeneratingImages: true,
        generatedImages: {},
        imageGenerationProgress: {},
        imageError: null,
        currentStep: 'images',
      };
    
    case 'IMAGE_GENERATION_PROGRESS':
      return {
        ...state,
        imageGenerationProgress: {
          ...state.imageGenerationProgress,
          [action.payload.sceneId]: action.payload.progress,
        },
      };
    
    case 'IMAGE_GENERATED':
      return {
        ...state,
        generatedImages: {
          ...state.generatedImages,
          [action.payload.sceneId]: action.payload.imageUrl,
        },
      };
    
    case 'IMAGE_GENERATION_COMPLETE':
      return {
        ...state,
        isGeneratingImages: false,
        currentImageGeneratingScene: null,
      };
    
    case 'IMAGE_GENERATION_ERROR':
      return {
        ...state,
        isGeneratingImages: false,
        imageError: action.payload,
        error: action.payload,
      };
    
    case 'SET_CURRENT_IMAGE_SCENE':
      return {
        ...state,
        currentImageGeneratingScene: action.payload,
      };
    
    // Project Management
    case 'PROJECT_SAVE_START':
      return { ...state, isSaving: true, error: null };
    
    case 'PROJECT_SAVE_SUCCESS':
      return {
        ...state,
        isSaving: false,
        currentProject: action.payload,
      };
    
    case 'PROJECT_SAVE_ERROR':
      return {
        ...state,
        isSaving: false,
        error: action.payload,
      };
    
    case 'PROJECT_LOAD':
      return {
        ...state,
        currentProject: action.payload,
        prompt: action.payload.prompt,
        settings: action.payload.settings,
        generatedScript: action.payload.script,
        currentJobId: action.payload.jobId || null,
      };
    
    // General
    case 'RESET_STATE':
      return {
        currentStep: 'prompt',
        prompt: '',
        settings: state.settings, // Preserve settings on reset
        generatedScript: null,
        isGenerating: false,
        isGeneratingScript: false,
        isGeneratingImages: false,
        isGeneratingVideo: false,
        progress: 0,
        currentJobId: null,
        generatedImages: {},
        imageGenerationProgress: {},
        currentImageGeneratingScene: null,
        currentProject: null,
        isSaving: false,
        error: null,
        scriptError: null,
        videoError: null,
        imageError: null,
        isScriptApproved: false,
        scriptAnimationStep: 0,
      };
    
    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
        scriptError: null,
        videoError: null,
        imageError: null,
      };
    
    case 'SET_SCRIPT_ANIMATION_STEP':
      return { ...state, scriptAnimationStep: action.payload };
    
    default:
      return state;
  }
}
