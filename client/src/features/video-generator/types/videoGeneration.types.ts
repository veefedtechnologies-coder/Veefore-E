/**
 * Type definitions for video generation feature
 * Extracted from useVideoGeneration.ts to reduce file size
 */

// ============================================================================
// Core Video Generation Types
// ============================================================================

export interface ScriptScene {
  id: string;
  duration: number;
  description: string;
  visualStyle?: string;
  voiceover?: string;
  visualElements?: string;
  narration?: string;
  imagePrompt?: string;
}

export interface GeneratedScript {
  title: string;
  totalDuration: number;
  scenes: ScriptScene[];
  hook: string;
  callToAction: string;
  fullScript?: string;
}

export interface VideoSettings {
  // Video Quality & Duration
  duration: number;
  aspectRatio: string;
  resolution: string;
  fps: number;
  
  // Motion Engine
  motionEngine: string;
  visualStyle: string;
  
  // Voice & Audio
  voiceGender: string;
  voiceLanguage: string;
  voiceAccent: string;
  voiceTone: string;
  voiceStability: number;
  voiceSimilarity: number;
  
  // Background Audio
  backgroundMusic: boolean;
  musicGenre: string;
  musicVolume: number;
  
  // Avatar & Visual Features
  avatar: boolean;
  avatarStyle: string;
  avatarPosition: string;
  
  // Text & Captions
  language: string;
  captions: boolean;
  captionStyle: string;
  onScreenText: boolean;
  
  // Effects & Transitions
  transitions: string;
  colorScheme: string;
  zoomEffects: boolean;
  fadeTransitions: boolean;
  
  // Advanced Features
  enableWatermark: boolean;
  enableLogo: boolean;
  speedControl: number;
  enableColorGrading: boolean;
  
  // Additional properties
  voiceEnabled: boolean;
  effects: string[];
  transitionStyle: string;
}

export interface GeneratedImages {
  [sceneId: string]: string;
}

export interface ImageGenerationProgress {
  [sceneId: string]: number;
}

export interface VideoProject {
  id: string;
  title: string;
  prompt: string;
  script: GeneratedScript | null;
  settings: VideoSettings;
  status: 'draft' | 'generating' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
  jobId?: string;
  videoUrl?: string;
}

export interface VideoGenerationError {
  message: string;
  code?: string;
  details?: any;
}

// ============================================================================
// State Management Types
// ============================================================================

export interface VideoGenerationState {
  // Workflow State
  currentStep: 'prompt' | 'settings' | 'script' | 'advanced' | 'preview' | 'images';
  prompt: string;
  settings: VideoSettings;
  generatedScript: GeneratedScript | null;
  
  // Generation Status
  isGenerating: boolean;
  isGeneratingScript: boolean;
  isGeneratingImages: boolean;
  isGeneratingVideo: boolean;
  progress: number;
  currentJobId: string | null;
  
  // Image Generation
  generatedImages: GeneratedImages;
  imageGenerationProgress: ImageGenerationProgress;
  currentImageGeneratingScene: string | null;
  
  // Project Management
  currentProject: VideoProject | null;
  isSaving: boolean;
  
  // Error Handling
  error: VideoGenerationError | null;
  scriptError: VideoGenerationError | null;
  videoError: VideoGenerationError | null;
  imageError: VideoGenerationError | null;
  
  // UI State
  isScriptApproved: boolean;
  scriptAnimationStep: number;
}

export type VideoGenerationAction =
  | { type: 'SET_PROMPT'; payload: string }
  | { type: 'SET_STEP'; payload: VideoGenerationState['currentStep'] }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<VideoSettings> }
  | { type: 'SET_SETTINGS'; payload: VideoSettings }
  
  // Script Generation
  | { type: 'SCRIPT_GENERATION_START' }
  | { type: 'SCRIPT_GENERATION_SUCCESS'; payload: GeneratedScript }
  | { type: 'SCRIPT_GENERATION_ERROR'; payload: VideoGenerationError }
  | { type: 'APPROVE_SCRIPT' }
  | { type: 'UPDATE_SCRIPT'; payload: GeneratedScript }
  
  // Video Generation
  | { type: 'VIDEO_GENERATION_START' }
  | { type: 'VIDEO_GENERATION_SUCCESS'; payload: { jobId: string } }
  | { type: 'VIDEO_GENERATION_ERROR'; payload: VideoGenerationError }
  | { type: 'VIDEO_GENERATION_PROGRESS'; payload: number }
  | { type: 'VIDEO_GENERATION_COMPLETE'; payload: { videoUrl: string } }
  
  // Image Generation
  | { type: 'IMAGE_GENERATION_START' }
  | { type: 'IMAGE_GENERATION_PROGRESS'; payload: { sceneId: string; progress: number } }
  | { type: 'IMAGE_GENERATED'; payload: { sceneId: string; imageUrl: string } }
  | { type: 'IMAGE_GENERATION_COMPLETE' }
  | { type: 'IMAGE_GENERATION_ERROR'; payload: VideoGenerationError }
  | { type: 'SET_CURRENT_IMAGE_SCENE'; payload: string | null }
  
  // Project Management
  | { type: 'PROJECT_SAVE_START' }
  | { type: 'PROJECT_SAVE_SUCCESS'; payload: VideoProject }
  | { type: 'PROJECT_SAVE_ERROR'; payload: VideoGenerationError }
  | { type: 'PROJECT_LOAD'; payload: VideoProject }
  
  // General
  | { type: 'RESET_STATE' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_SCRIPT_ANIMATION_STEP'; payload: number };

// ============================================================================
// Hook Interface
// ============================================================================

export interface UseVideoGenerationReturn {
  // State
  state: VideoGenerationState;
  prompt: string;
  settings: VideoSettings;
  generatedScript: GeneratedScript | null;
  isGenerating: boolean;
  isGeneratingScript: boolean;
  isGeneratingImages: boolean;
  isGeneratingVideo: boolean;
  progress: number;
  currentJobId: string | null;
  currentStep: VideoGenerationState['currentStep'];
  generatedImages: GeneratedImages;
  imageGenerationProgress: ImageGenerationProgress;
  currentProject: VideoProject | null;
  error: VideoGenerationError | null;
  
  // Actions
  setPrompt: (prompt: string) => void;
  setStep: (step: VideoGenerationState['currentStep']) => void;
  updateSettings: (settings: Partial<VideoSettings>) => void;
  setSettings: (settings: VideoSettings) => void;
  generateScript: () => Promise<void>;
  generateVideo: () => Promise<void>;
  generateImages: () => Promise<void>;
  approveScript: () => void;
  updateScript: (script: GeneratedScript) => void;
  saveProject: (title?: string) => Promise<VideoProject | null>;
  loadProject: (projectId: string) => Promise<void>;
  resetState: () => void;
  clearError: () => void;
}
