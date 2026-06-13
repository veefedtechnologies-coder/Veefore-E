import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

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

interface UseVideoGenerationReturn {
  // State
  prompt: string;
  setPrompt: (prompt: string) => void;
  settings: VideoSettings;
  setSettings: (settings: VideoSettings | ((prev: VideoSettings) => VideoSettings)) => void;
  generatedScript: GeneratedScript | null;
  isGenerating: boolean;
  progress: number;
  currentJobId: string | null;
  
  // Actions
  generateScript: () => Promise<void>;
  generateVideo: () => Promise<void>;
  resetState: () => void;
}

const defaultSettings: VideoSettings = {
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

/**
 * useVideoGeneration Hook
 * 
 * Manages state and logic for the video generation workflow:
 * - Prompt input and settings management
 * - Script generation via AI
 * - Video generation and progress tracking
 * - Job status monitoring
 * 
 * This hook extracts the state management logic from VideoGeneratorAdvanced.tsx
 * to enable component reusability and testability.
 */
export const useVideoGeneration = (): UseVideoGenerationReturn => {
  const [prompt, setPrompt] = useState('');
  const [settings, setSettings] = useState<VideoSettings>(defaultSettings);
  const [generatedScript, setGeneratedScript] = useState<GeneratedScript | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // Script generation mutation
  const generateScriptMutation = useMutation({
    mutationFn: async () => {
      console.log('[SCRIPT GEN] Starting script generation with:', {
        prompt,
        duration: settings.duration,
        visualStyle: settings.visualStyle,
        tone: settings.voiceTone,
        voiceGender: settings.voiceGender,
        language: settings.voiceLanguage,
        accent: settings.voiceAccent
      });
      
      const response = await apiRequest('/api/video/generate-script', {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          duration: settings.duration,
          visualStyle: settings.visualStyle,
          tone: settings.voiceTone,
          voiceGender: settings.voiceGender,
          language: settings.voiceLanguage,
          accent: settings.voiceAccent
        })
      });
      
      console.log('[SCRIPT GEN] API Response:', response);
      return response;
    },
    onSuccess: (data) => {
      console.log('[SCRIPT GEN] Success:', data);
      if (data.script) {
        setGeneratedScript(data.script);
      } else {
        console.error('[SCRIPT GEN] No script in response data');
      }
      setIsGenerating(false);
      setProgress(100);
    },
    onError: (error) => {
      console.error('[SCRIPT GEN] Script generation failed:', error);
      setIsGenerating(false);
      setProgress(0);
    }
  });

  // Video generation mutation
  const generateVideoMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/video/generate', {
        method: 'POST',
        body: JSON.stringify({
          title: generatedScript?.title || 'AI Generated Video',
          prompt,
          script: generatedScript,
          duration: settings.duration,
          voiceProfile: {
            gender: settings.voiceGender,
            language: settings.voiceLanguage,
            accent: settings.voiceAccent,
            tone: settings.voiceTone
          },
          enableAvatar: settings.avatar,
          enableMusic: settings.backgroundMusic,
          visualStyle: settings.visualStyle,
          motionEngine: settings.motionEngine,
          uploadedImages: []
        })
      });
      return response;
    },
    onSuccess: (data) => {
      if (data.jobId) {
        setCurrentJobId(data.jobId);
        queryClient.invalidateQueries({ queryKey: ['/api/video/jobs'] });
      }
      setIsGenerating(false);
    },
    onError: (error) => {
      console.error('Video generation failed:', error);
      setIsGenerating(false);
      setProgress(0);
    }
  });

  const generateScript = useCallback(async () => {
    if (!prompt.trim()) {
      alert('Please enter a video prompt first');
      return;
    }
    
    setIsGenerating(true);
    setProgress(0);
    
    // Show progress animation while API call is in progress
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90; // Stop at 90% until API returns
        }
        return prev + 10;
      });
    }, 500);
    
    try {
      await generateScriptMutation.mutateAsync();
      clearInterval(interval);
    } catch (error) {
      clearInterval(interval);
      setIsGenerating(false);
      setProgress(0);
    }
  }, [prompt, generateScriptMutation]);

  const generateVideo = useCallback(async () => {
    if (!generatedScript) {
      alert('Please generate a script first');
      return;
    }
    
    setIsGenerating(true);
    setProgress(0);
    
    try {
      await generateVideoMutation.mutateAsync();
    } catch (error) {
      setIsGenerating(false);
      setProgress(0);
    }
  }, [generatedScript, generateVideoMutation]);

  const resetState = useCallback(() => {
    setPrompt('');
    setSettings(defaultSettings);
    setGeneratedScript(null);
    setIsGenerating(false);
    setProgress(0);
    setCurrentJobId(null);
  }, []);

  return {
    // State
    prompt,
    setPrompt,
    settings,
    setSettings,
    generatedScript,
    isGenerating,
    progress,
    currentJobId,
    
    // Actions
    generateScript,
    generateVideo,
    resetState,
  };
};
