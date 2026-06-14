/**
 * Constants and default values for video generation
 * Extracted from useVideoGeneration.ts to reduce file size
 */

import type {
  VideoSettings,
  VideoGenerationState
} from '../types/videoGeneration.types';

export const defaultSettings: VideoSettings = {
  // Video Quality & Duration
  duration: 60,
  aspectRatio: '16:9',
  resolution: '1080p',
  fps: 30,
  
  // Motion Engine
  motionEngine: 'Auto',
  visualStyle: 'cinematic',
  
  // Voice & Audio
  voiceGender: 'female',
  voiceLanguage: 'English',
  voiceAccent: 'American',
  voiceTone: 'professional',
  voiceStability: 0.4,
  voiceSimilarity: 0.75,
  
  // Background Audio
  backgroundMusic: true,
  musicGenre: 'corporate',
  musicVolume: 0.3,
  
  // Avatar & Visual Features
  avatar: false,
  avatarStyle: 'realistic',
  avatarPosition: 'corner',
  
  // Text & Captions
  language: 'en',
  captions: true,
  captionStyle: 'modern',
  onScreenText: true,
  
  // Effects & Transitions
  transitions: 'smooth',
  colorScheme: 'vibrant',
  zoomEffects: true,
  fadeTransitions: true,
  
  // Advanced Features
  enableWatermark: true,
  enableLogo: false,
  speedControl: 1.0,
  enableColorGrading: true,
  
  // Additional properties
  voiceEnabled: false,
  effects: [],
  transitionStyle: 'smooth'
};

export const initialState: VideoGenerationState = {
  currentStep: 'prompt',
  prompt: '',
  settings: defaultSettings,
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
