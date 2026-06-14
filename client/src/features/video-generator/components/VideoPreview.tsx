/**
 * VideoPreview Component
 * 
 * Displays video player with timeline scrubbing, playback controls,
 * and thumbnail preview grid for scene navigation.
 * Extracted from VideoGeneratorAdvanced.tsx (Task 3.4).
 * 
 * Requirements: 2.2, 5.4
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Maximize, Download, Settings } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Slider } from '@/components/ui/slider';
import { VideoJob, VideoSettings, ScriptScene } from '../types';

export interface VideoPreviewProps {
  /** Video job containing the video URL and metadata */
  videoJob: VideoJob | null;
  /** Video settings for displaying configuration details */
  settings: VideoSettings;
  /** Callback when download button is clicked */
  onDownload?: () => void;
  /** Callback when edit settings button is clicked */
  onEditSettings?: () => void;
  /** Callback when create new button is clicked */
  onCreateNew?: () => void;
  /** Whether the video is currently generating */
  isGenerating?: boolean;
  /** Generation progress (0-100) */
  generationProgress?: number;
  /** Current generation step description */
  currentStep?: string;
}

interface ThumbnailScene {
  id: string;
  timestamp: number;
  thumbnailUrl?: string;
  description: string;
}

/**
 * VideoPreview Component
 * 
 * Displays a video player with advanced controls including:
 * - Play/pause, skip forward/backward
 * - Timeline scrubbing with hover preview
 * - Volume control
 * - Fullscreen mode
 * - Thumbnail grid for scene navigation
 * - Video details and configuration display
 * - Action buttons (download, edit, create new)
 */
export const VideoPreview: React.FC<VideoPreviewProps> = ({
  videoJob,
  settings,
  onDownload,
  onEditSettings,
  onCreateNew,
  isGenerating = false,
  generationProgress = 0,
  currentStep = 'Starting video generation...',
}) => {
  // Video player refs and state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  
  // Scene thumbnails (generated from script scenes if available)
  const [sceneThumbnails, setSceneThumbnails] = useState<ThumbnailScene[]>([]);

  // Update duration when video metadata loads
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [videoJob?.finalVideo]);

  // Generate scene thumbnails from script
  useEffect(() => {
    if (!videoJob?.script?.scenes) return;

    const thumbnails: ThumbnailScene[] = videoJob.script.scenes.map((scene: ScriptScene, index: number) => {
      // Calculate timestamp based on scene durations
      const timestamp = videoJob.script!.scenes
        .slice(0, index)
        .reduce((sum, s) => sum + s.duration, 0);

      return {
        id: scene.id,
        timestamp,
        thumbnailUrl: undefined, // Could be populated with actual scene thumbnails
        description: scene.description,
      };
    });

    setSceneThumbnails(thumbnails);
  }, [videoJob?.script]);

  // Playback controls
  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = value[0];
    setCurrentTime(value[0]);
  }, []);

  const skipBackward = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = Math.max(0, video.currentTime - 10);
  }, []);

  const skipForward = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = Math.min(duration, video.currentTime + 10);
  }, [duration]);

  const handleVolumeChange = useCallback((value: number[]) => {
    const video = videoRef.current;
    if (!video) return;

    const newVolume = value[0];
    video.volume = newVolume;
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
  }, []);

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isMuted) {
      video.volume = volume || 0.5;
      setIsMuted(false);
    } else {
      video.volume = 0;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  const toggleFullscreen = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (!isFullscreen) {
      if (video.requestFullscreen) {
        video.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
    setIsFullscreen(!isFullscreen);
  }, [isFullscreen]);

  const seekToScene = useCallback((timestamp: number) => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = timestamp;
    setShowThumbnails(false);
  }, []);

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Render generation progress
  if (isGenerating) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-8">
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <Play className="w-10 h-10 text-white" />
              </div>
              <h3 className="text-xl font-semibold mb-2">Creating Your Video</h3>
              <p className="text-gray-600 mb-4">{currentStep}</p>
              <Progress value={generationProgress} className="h-3 mb-2" />
              <p className="text-sm text-gray-500">{generationProgress}% complete</p>
            </div>
            
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 p-6 rounded-lg">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Generation Process</h4>
              <div className="space-y-2 text-sm">
                <GenerationStepIndicator label="Script processed" isComplete={generationProgress > 0} />
                <GenerationStepIndicator label="AI scenes generated" isComplete={generationProgress > 20} />
                <GenerationStepIndicator label="Motion applied" isComplete={generationProgress > 50} />
                <GenerationStepIndicator label="Voiceover added" isComplete={generationProgress > 80} />
                <GenerationStepIndicator label="Final video compilation" isComplete={generationProgress >= 100} />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Render empty state if no video
  if (!videoJob?.finalVideo) {
    return (
      <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
        <CardContent className="p-8">
          <div className="aspect-video bg-gray-900 rounded-lg flex items-center justify-center">
            <div className="text-center text-white">
              <Play className="w-20 h-20 mx-auto mb-4 opacity-70" />
              <p className="text-xl">Generated Video Preview</p>
              <p className="text-gray-400">Your video will appear here once generated</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
      <CardContent className="p-8">
        {/* Video Player */}
        <div className="aspect-video bg-gray-900 rounded-lg mb-6 relative overflow-hidden group">
          <video
            ref={videoRef}
            src={videoJob.finalVideo}
            poster={videoJob.thumbnailUrl}
            className="w-full h-full object-contain"
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onClick={togglePlay}
          />
          
          {/* Play/Pause Overlay */}
          <div 
            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
            onClick={togglePlay}
          >
            <div className="bg-black/50 rounded-full p-4">
              {isPlaying ? (
                <Pause className="w-12 h-12 text-white" />
              ) : (
                <Play className="w-12 h-12 text-white" />
              )}
            </div>
          </div>

          {/* Video Controls */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* Timeline */}
            <div className="mb-3">
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={0.1}
                onValueChange={handleSeek}
                className="cursor-pointer"
              />
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* Play/Pause */}
                <button
                  onClick={togglePlay}
                  className="p-2 hover:bg-white/20 rounded transition-colors"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 text-white" />
                  ) : (
                    <Play className="w-5 h-5 text-white" />
                  )}
                </button>

                {/* Skip Backward */}
                <button
                  onClick={skipBackward}
                  className="p-2 hover:bg-white/20 rounded transition-colors"
                  aria-label="Skip backward 10 seconds"
                >
                  <SkipBack className="w-5 h-5 text-white" />
                </button>

                {/* Skip Forward */}
                <button
                  onClick={skipForward}
                  className="p-2 hover:bg-white/20 rounded transition-colors"
                  aria-label="Skip forward 10 seconds"
                >
                  <SkipForward className="w-5 h-5 text-white" />
                </button>

                {/* Volume Control */}
                <div className="flex items-center gap-2 ml-2">
                  <button
                    onClick={toggleMute}
                    className="p-2 hover:bg-white/20 rounded transition-colors"
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted ? (
                      <VolumeX className="w-5 h-5 text-white" />
                    ) : (
                      <Volume2 className="w-5 h-5 text-white" />
                    )}
                  </button>
                  <div className="w-24">
                    <Slider
                      value={[isMuted ? 0 : volume]}
                      max={1}
                      step={0.1}
                      onValueChange={handleVolumeChange}
                      className="cursor-pointer"
                    />
                  </div>
                </div>

                {/* Time Display */}
                <span className="text-white text-sm ml-2">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Right side controls */}
              <div className="flex items-center gap-2">
                {/* Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  className="p-2 hover:bg-white/20 rounded transition-colors"
                  aria-label="Fullscreen"
                >
                  <Maximize className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scene Thumbnails Grid */}
        {sceneThumbnails.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Scenes</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowThumbnails(!showThumbnails)}
              >
                {showThumbnails ? 'Hide' : 'Show'} Thumbnails
              </Button>
            </div>
            
            {showThumbnails && (
              <div className="grid grid-cols-4 gap-3">
                {sceneThumbnails.map((scene) => (
                  <button
                    key={scene.id}
                    onClick={() => seekToScene(scene.timestamp)}
                    className="group relative aspect-video bg-gray-800 rounded-lg overflow-hidden hover:ring-2 ring-blue-500 transition-all"
                  >
                    {/* Thumbnail placeholder - could show actual scene thumbnails */}
                    <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-500/20 to-blue-500/20">
                      <Play className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    
                    {/* Scene info */}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                      <p className="text-white text-xs truncate">{scene.description}</p>
                      <p className="text-gray-400 text-xs">{formatTime(scene.timestamp)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Video Details */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Video Details</h3>
            <div className="text-sm space-y-1">
              <DetailRow label="Duration" value={`${settings.duration}s`} />
              <DetailRow label="Resolution" value={settings.resolution} />
              <DetailRow label="Style" value={settings.visualStyle} />
              <DetailRow label="Aspect Ratio" value={settings.aspectRatio} />
            </div>
          </div>
          
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Features</h3>
            <div className="flex flex-wrap gap-2">
              {settings.backgroundMusic && <Badge variant="secondary">Music</Badge>}
              {settings.avatar && <Badge variant="secondary">AI Avatar</Badge>}
              {settings.captions && <Badge variant="secondary">Captions</Badge>}
              {settings.voiceEnabled && <Badge variant="secondary">{settings.voiceGender} Voice</Badge>}
              {settings.zoomEffects && <Badge variant="secondary">Zoom Effects</Badge>}
              {settings.fadeTransitions && <Badge variant="secondary">Transitions</Badge>}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button 
            className="flex-1 bg-green-600 hover:bg-green-700"
            onClick={onDownload}
          >
            <Download className="w-4 h-4 mr-2" />
            Download Video
          </Button>
          
          <Button 
            variant="outline" 
            className="flex-1"
            onClick={onEditSettings}
          >
            <Settings className="w-4 h-4 mr-2" />
            Edit Settings
          </Button>
          
          <Button 
            variant="outline"
            onClick={onCreateNew}
          >
            Create New
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

// Helper Components

interface GenerationStepIndicatorProps {
  label: string;
  isComplete: boolean;
}

const GenerationStepIndicator: React.FC<GenerationStepIndicatorProps> = ({ label, isComplete }) => (
  <div className="flex items-center gap-2">
    <div className={`w-2 h-2 rounded-full ${isComplete ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
    <span className="text-gray-700 dark:text-gray-300">{label}</span>
  </div>
);

interface DetailRowProps {
  label: string;
  value: string;
}

const DetailRow: React.FC<DetailRowProps> = ({ label, value }) => (
  <div className="flex justify-between">
    <span className="text-gray-600 dark:text-gray-400">{label}:</span>
    <span className="text-gray-900 dark:text-gray-100">{value}</span>
  </div>
);

export default VideoPreview;
