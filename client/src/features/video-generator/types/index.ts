/**
 * Video Generator Type Definitions
 * 
 * Shared type definitions for the video generator feature.
 * Extracted from VideoGeneratorAdvanced.tsx for better organization.
 */

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
  
  // Motion Engine (core feature from video-generator.md)
  motionEngine: string; // Auto, Runway Gen-2, AnimateDiff + Interpolation
  visualStyle: string;
  
  // Voice & Audio (comprehensive ElevenLabs integration)
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
  
  // Avatar & Visual Features (Hedra integration)
  avatar: boolean;
  avatarStyle: string;
  avatarPosition: string; // corner, fullscreen, intro-only
  
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
  speedControl: number; // 0.5x to 2.0x
  enableColorGrading: boolean;
  
  // Additional properties for Generate Modal
  voiceEnabled: boolean;
  effects: string[];
  transitionStyle: string;
}

export interface VideoJob {
  id: string;
  title: string;
  prompt: string;
  script?: GeneratedScript;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  finalVideo?: string;
  thumbnailUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface VideoProject {
  id: string;
  title: string;
  thumbnail: string;
  lastEdited: string;
  status: string;
}

export type CurrentStep = 'prompt' | 'settings' | 'script' | 'advanced' | 'preview';
