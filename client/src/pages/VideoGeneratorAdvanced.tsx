/**
 * VideoGeneratorAdvanced - Main Orchestrator Component
 * 
 * Refactored from 3,125 lines monolithic file to use extracted feature modules.
 * This orchestrator coordinates between the extracted components:
 * - VideoPromptStep: Initial prompt input
 * - VideoSettingsStep: Video configuration
 * - VideoScriptEditor: Script editing
 * - VideoPreview: Final video preview and playback
 * - useVideoGeneration: State management hook
 * 
 * Task 3.7: Update imports and verify functionality
 * Requirements: 2.6, 16.4
 */

import React, { useState } from 'react';
import { SEO, generateStructuredData } from '@/lib/seo-optimization';
import { useUser } from '@/hooks/useUser';
import {
  VideoPromptStep,
  VideoSettingsStep,
  VideoScriptEditor,
  VideoPreview,
  useVideoGeneration,
} from '@/features/video-generator';

/**
 * VideoGeneratorAdvanced Component
 * 
 * Main orchestrator for the video generation workflow.
 * Manages step navigation and state coordination between components.
 */
const VideoGeneratorAdvanced: React.FC = () => {
  const { loading: userLoading, user: firebaseUser } = useUser();
  
  // Use the extracted video generation hook for state management
  const {
    currentStep,
    setStep,
    prompt,
    setPrompt,
    settings,
    updateSettings,
    generatedScript,
    updateScript,
    currentProject,
    isGenerating,
    generateScript,
    generateVideo,
    resetState,
  } = useVideoGeneration();

  // Tools modal state (for future implementation)
  const [isVideoSidebarCollapsed, setIsVideoSidebarCollapsed] = useState(false);

  /**
   * Handle script generation from prompt
   */
  const handleGenerateScript = async () => {
    if (!prompt.trim()) return;
    
    try {
      await generateScript();
      // After script generation, the hook will automatically move to 'script' step
    } catch (error) {
      console.error('[VIDEO GENERATOR] Script generation failed:', error);
    }
  };

  /**
   * Handle settings update - wrapper to match VideoSettingsStep interface
   */
  const handleSetSettings = (newSettings: React.SetStateAction<import('@/features/video-generator').VideoSettings>) => {
    if (typeof newSettings === 'function') {
      // If it's a function, call it with current settings and update
      const updatedSettings = newSettings(settings);
      updateSettings(updatedSettings);
    } else {
      // If it's a direct object, update settings
      updateSettings(newSettings);
    }
  };

  /**
   * Handle moving to script editor from settings
   */
  const handleSettingsNext = () => {
    setStep('script');
  };

  /**
   * Handle video generation from script
   */
  const handleGenerateVideo = async () => {
    if (!generatedScript) return;
    
    try {
      await generateVideo();
      // After video generation, the hook will automatically move to 'preview' step
    } catch (error) {
      console.error('[VIDEO GENERATOR] Video generation failed:', error);
    }
  };

  /**
   * Handle download video
   */
  const handleDownloadVideo = () => {
    if (currentProject?.videoUrl) {
      const link = document.createElement('a');
      link.href = currentProject.videoUrl;
      link.download = `${currentProject.title || 'video'}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  /**
   * Handle create new video
   */
  const handleCreateNew = () => {
    resetState();
    setStep('prompt');
  };

  /**
   * Handle edit settings
   */
  const handleEditSettings = () => {
    setStep('settings');
  };

  /**
   * Render current step
   */
  const renderCurrentStep = () => {
    switch (currentStep) {
      case 'prompt':
        return (
          <VideoPromptStep
            prompt={prompt}
            setPrompt={setPrompt}
            onGenerateClick={handleGenerateScript}
            isGenerating={isGenerating}
            isVideoSidebarCollapsed={isVideoSidebarCollapsed}
            onToggleSidebar={() => setIsVideoSidebarCollapsed(!isVideoSidebarCollapsed)}
            onToolsModalOpen={() => {/* Tools modal not yet implemented */}}
          />
        );

      case 'settings':
        return (
          <VideoSettingsStep
            settings={settings}
            setSettings={handleSetSettings}
            onNext={handleSettingsNext}
            onBack={() => setStep('prompt')}
          />
        );

      case 'script':
        return (
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
            <div className="max-w-7xl mx-auto">
              <div className="mb-6 flex items-center justify-between">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  Edit Your Video Script
                </h1>
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('settings')}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    Back to Settings
                  </button>
                  <button
                    onClick={handleGenerateVideo}
                    disabled={isGenerating}
                    className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                  >
                    {isGenerating ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Generating Video...
                      </>
                    ) : (
                      <>Generate Video</>
                    )}
                  </button>
                </div>
              </div>
              
              {generatedScript && (
                <VideoScriptEditor
                  script={generatedScript}
                  onScriptUpdate={updateScript}
                  autoSaveDelay={500}
                  onAutoSave={() => {
                    console.log('[VIDEO GENERATOR] Auto-saved script');
                  }}
                />
              )}
            </div>
          </div>
        );

      case 'preview':
        return (
          <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-8">
            <div className="max-w-7xl mx-auto">
              <VideoPreview
                videoJob={currentProject ? {
                  id: currentProject.id,
                  title: currentProject.title,
                  prompt: currentProject.prompt,
                  script: currentProject.script || undefined,
                  status: currentProject.status === 'generating' ? 'processing' : 
                         currentProject.status === 'completed' ? 'completed' : 'pending',
                  progress: 100,
                  finalVideo: currentProject.videoUrl,
                  thumbnailUrl: undefined,
                  createdAt: currentProject.createdAt,
                  updatedAt: currentProject.updatedAt,
                } : null}
                settings={settings}
                onDownload={handleDownloadVideo}
                onEditSettings={handleEditSettings}
                onCreateNew={handleCreateNew}
                isGenerating={isGenerating}
                generationProgress={100}
                currentStep={currentProject?.status || 'processing'}
              />
            </div>
          </div>
        );

      default:
        return (
          <div className="min-h-screen flex items-center justify-center">
            <p className="text-gray-500">Unknown step: {currentStep}</p>
          </div>
        );
    }
  };

  // Show loading state while user data is loading
  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // Show error state if user is not authenticated
  if (!firebaseUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Please sign in to use the video generator
          </p>
          <button
            onClick={() => window.location.href = '/signin'}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return <>{renderCurrentStep()}</>;
};

/**
 * VideoGeneratorAdvanced with SEO
 * 
 * Wrapper component that adds SEO metadata
 */
function VideoGeneratorAdvancedWithSEO() {
  return (
    <>
      <SEO
        title="AI Video Generator - Create Professional Videos | VeeFore"
        description="Generate professional videos with AI. Create engaging content with our advanced video generation platform powered by cutting-edge AI technology."
        structuredData={generateStructuredData.softwareApplication()}
      />
      <VideoGeneratorAdvanced />
    </>
  );
}

export default VideoGeneratorAdvancedWithSEO;
