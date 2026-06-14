/**
 * React Query mutations for video generation
 * Extracted from useVideoGeneration.ts to reduce file size and improve maintainability
 */

import { useMutation, QueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type {
  VideoGenerationState,
  VideoGenerationAction
} from '../types/videoGeneration.types';

type DispatchFn = React.Dispatch<VideoGenerationAction>;

// ============================================================================
// Script Generation Mutation
// ============================================================================

export function useGenerateScriptMutation(
  dispatch: DispatchFn,
  state: VideoGenerationState
) {
  return useMutation({
    mutationFn: async () => {
      console.log('[SCRIPT GEN] Starting script generation with:', {
        prompt: state.prompt,
        duration: state.settings.duration,
        visualStyle: state.settings.visualStyle,
        tone: state.settings.voiceTone,
        voiceGender: state.settings.voiceGender,
        language: state.settings.voiceLanguage,
        accent: state.settings.voiceAccent
      });
      
      const response = await apiRequest('/api/video/generate-script', {
        method: 'POST',
        body: JSON.stringify({
          prompt: state.prompt,
          duration: state.settings.duration,
          visualStyle: state.settings.visualStyle,
          tone: state.settings.voiceTone,
          voiceGender: state.settings.voiceGender,
          language: state.settings.voiceLanguage,
          accent: state.settings.voiceAccent
        })
      });
      
      console.log('[SCRIPT GEN] API Response:', response);
      return response;
    },
    onSuccess: (data: any) => {
      console.log('[SCRIPT GEN] Success:', data);
      if (data.script) {
        dispatch({ type: 'SCRIPT_GENERATION_SUCCESS', payload: data.script });
      } else {
        console.error('[SCRIPT GEN] No script in response data');
        dispatch({
          type: 'SCRIPT_GENERATION_ERROR',
          payload: { message: 'No script in response data' }
        });
      }
    },
    onError: (error: any) => {
      console.error('[SCRIPT GEN] Script generation failed:', error);
      dispatch({
        type: 'SCRIPT_GENERATION_ERROR',
        payload: {
          message: error?.message || 'Script generation failed',
          code: error?.code,
          details: error
        }
      });
    }
  });
}

// ============================================================================
// Video Generation Mutation
// ============================================================================

export function useGenerateVideoMutation(
  dispatch: DispatchFn,
  state: VideoGenerationState,
  queryClient: QueryClient
) {
  return useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/video/generate', {
        method: 'POST',
        body: JSON.stringify({
          title: state.generatedScript?.title || 'AI Generated Video',
          prompt: state.prompt,
          script: state.generatedScript,
          duration: state.settings.duration,
          voiceProfile: {
            gender: state.settings.voiceGender,
            language: state.settings.voiceLanguage,
            accent: state.settings.voiceAccent,
            tone: state.settings.voiceTone
          },
          enableAvatar: state.settings.avatar,
          enableMusic: state.settings.backgroundMusic,
          visualStyle: state.settings.visualStyle,
          motionEngine: state.settings.motionEngine,
          uploadedImages: Object.values(state.generatedImages)
        })
      });
      return response;
    },
    onSuccess: (data: any) => {
      console.log('[VIDEO GEN] Success:', data);
      if (data.jobId) {
        dispatch({ type: 'VIDEO_GENERATION_SUCCESS', payload: { jobId: data.jobId } });
        queryClient.invalidateQueries({ queryKey: ['/api/video/jobs'] });
      } else {
        dispatch({
          type: 'VIDEO_GENERATION_ERROR',
          payload: { message: 'No job ID in response' }
        });
      }
    },
    onError: (error: any) => {
      console.error('[VIDEO GEN] Video generation failed:', error);
      dispatch({
        type: 'VIDEO_GENERATION_ERROR',
        payload: {
          message: error?.message || 'Video generation failed',
          code: error?.code,
          details: error
        }
      });
    }
  });
}

// ============================================================================
// Image Generation Mutation
// ============================================================================

export function useGenerateImagesMutation(
  dispatch: DispatchFn,
  state: VideoGenerationState
) {
  return useMutation({
    mutationFn: async () => {
      if (!state.generatedScript) {
        throw new Error('No script available for image generation');
      }

      console.log('[IMAGE GEN] Starting AI image generation for script:', state.generatedScript.title);
      
      const response = await apiRequest('/api/video/generate-images', {
        method: 'POST',
        body: JSON.stringify({
          script: state.generatedScript,
          scenes: state.generatedScript.scenes
        })
      });
      
      console.log('[IMAGE GEN] API Response:', response);
      return response;
    },
    onSuccess: async (data: any) => {
      console.log('[IMAGE GEN] Success:', data);
      if (data.success && data.generatedImages) {
        const imageKeys = Object.keys(data.generatedImages);
        
        // Animate images appearing one by one
        for (let i = 0; i < imageKeys.length; i++) {
          const sceneId = imageKeys[i];
          dispatch({ type: 'SET_CURRENT_IMAGE_SCENE', payload: sceneId });
          
          // Simulate progress for visual feedback
          for (let progress = 0; progress <= 100; progress += 20) {
            dispatch({
              type: 'IMAGE_GENERATION_PROGRESS',
              payload: { sceneId, progress }
            });
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Add the generated image
          dispatch({
            type: 'IMAGE_GENERATED',
            payload: { sceneId, imageUrl: data.generatedImages[sceneId] }
          });
          
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        dispatch({ type: 'IMAGE_GENERATION_COMPLETE' });
        console.log('[IMAGE GEN] All AI images loaded and displayed');
      } else {
        throw new Error('Invalid response format');
      }
    },
    onError: async (error: any) => {
      console.error('[IMAGE GEN] Image generation failed:', error);
      
      // Fallback to placeholder images
      if (state.generatedScript) {
        console.log('[IMAGE GEN] Falling back to placeholder images...');
        for (let i = 0; i < state.generatedScript.scenes.length; i++) {
          const scene = state.generatedScript.scenes[i];
          dispatch({ type: 'SET_CURRENT_IMAGE_SCENE', payload: scene.id });
          
          // Simulate progress
          for (let progress = 0; progress <= 100; progress += 25) {
            dispatch({
              type: 'IMAGE_GENERATION_PROGRESS',
              payload: { sceneId: scene.id, progress }
            });
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          
          // Use fallback image
          const fallbackImage = `https://picsum.photos/800/600?random=${scene.id}`;
          dispatch({
            type: 'IMAGE_GENERATED',
            payload: { sceneId: scene.id, imageUrl: fallbackImage }
          });
          
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      dispatch({
        type: 'IMAGE_GENERATION_ERROR',
        payload: {
          message: error?.message || 'Image generation failed',
          code: error?.code,
          details: error
        }
      });
    }
  });
}

// ============================================================================
// Project Save Mutation
// ============================================================================

export function useSaveProjectMutation(
  dispatch: DispatchFn,
  state: VideoGenerationState,
  queryClient: QueryClient
) {
  return useMutation({
    mutationFn: async (title: string) => {
      const projectData = {
        title,
        prompt: state.prompt,
        script: state.generatedScript,
        settings: state.settings,
        status: state.currentJobId ? 'generating' : state.generatedScript ? 'draft' : 'draft',
        jobId: state.currentJobId
      };

      console.log('[PROJECT] Saving project:', projectData);
      
      const response = await apiRequest('/api/video/projects', {
        method: 'POST',
        body: JSON.stringify(projectData)
      });
      
      return response;
    },
    onSuccess: (data: any) => {
      console.log('[PROJECT] Save success:', data);
      dispatch({ type: 'PROJECT_SAVE_SUCCESS', payload: data.project });
      queryClient.invalidateQueries({ queryKey: ['/api/video/projects'] });
    },
    onError: (error: any) => {
      console.error('[PROJECT] Save failed:', error);
      dispatch({
        type: 'PROJECT_SAVE_ERROR',
        payload: {
          message: error?.message || 'Failed to save project',
          code: error?.code,
          details: error
        }
      });
    }
  });
}

// ============================================================================
// Project Load Mutation
// ============================================================================

export function useLoadProjectMutation(dispatch: DispatchFn) {
  return useMutation({
    mutationFn: async (projectId: string) => {
      console.log('[PROJECT] Loading project:', projectId);
      const response = await apiRequest(`/api/video/projects/${projectId}`);
      return response;
    },
    onSuccess: (data: any) => {
      console.log('[PROJECT] Load success:', data);
      dispatch({ type: 'PROJECT_LOAD', payload: data.project });
    },
    onError: (error: any) => {
      console.error('[PROJECT] Load failed:', error);
      dispatch({
        type: 'PROJECT_SAVE_ERROR',
        payload: {
          message: error?.message || 'Failed to load project',
          code: error?.code,
          details: error
        }
      });
    }
  });
}
