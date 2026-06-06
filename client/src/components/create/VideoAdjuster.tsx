import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Volume2, VolumeX } from 'lucide-react';
import type { Point, Area } from 'react-easy-crop';
import { auth } from '@/lib/firebase';

export interface VideoAdjusterProps {
  videoFile: File;
  onComplete: (processedFile: File) => void;
  onCancel: () => void;
  postType?: 'post' | 'story' | 'reel';
}

export function VideoAdjuster({ videoFile, onComplete, onCancel, postType = 'post' }: VideoAdjusterProps) {
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const videoSrc = React.useMemo(() => URL.createObjectURL(videoFile), [videoFile]);

  const isVerticalFormat = postType === 'story' || postType === 'reel';
  const initialAspect = isVerticalFormat ? 9 / 16 : 4 / 5;

  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number>(initialAspect);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  // Trimming State
  const [duration, setDuration] = useState(0);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);

  const maxDuration = postType === 'story' ? 60 : postType === 'reel' ? 90 : 600; // 10 mins max for post

  // Filmstrip generation
  const [frames, setFrames] = useState<string[]>([]);
  
  useEffect(() => {
    if (!duration || frames.length > 0) return;
    const v = document.createElement('video');
    v.src = videoSrc;
    v.muted = true;
    v.crossOrigin = "anonymous";
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    let currentFrame = 0;
    const numFrames = 8;
    const interval = duration / numFrames;
    
    v.onloadedmetadata = () => {
      canvas.width = Math.max(10, v.videoWidth / 4);
      canvas.height = Math.max(10, v.videoHeight / 4);
      v.currentTime = 0;
    };
    
    v.onseeked = () => {
      if (ctx) {
        ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
        setFrames(prev => {
           if (prev.length >= numFrames) return prev;
           return [...prev, canvas.toDataURL('image/jpeg', 0.5)];
        });
      }
      currentFrame++;
      if (currentFrame < numFrames) {
        v.currentTime = currentFrame * interval;
      }
    };
  }, [duration, videoSrc]);

  const cropperWrapperRef = useRef<HTMLDivElement>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Sync video loop to trimmed section smoothly
  const rafRef = useRef<number>();
  useEffect(() => {
    if (!cropperWrapperRef.current) return;
    
    const updateLoop = () => {
      if (!cropperWrapperRef.current) return;
      const videos = cropperWrapperRef.current.querySelectorAll('video');
      
      // We can use the first video to update the playhead
      if (videos.length > 0) {
        const masterVideo = videos[0];
        setCurrentTime(masterVideo.currentTime);

        const needsLoop = !isDragging && (masterVideo.ended || masterVideo.currentTime >= endTime - 0.05 || masterVideo.currentTime < startTime);

        videos.forEach(v => {
          v.loop = false; // Disable native loop
          if (needsLoop) {
            v.currentTime = startTime;
            v.play().catch(() => {});
          } else if (Math.abs(v.currentTime - masterVideo.currentTime) > 0.1) {
             // Keep secondary videos perfectly in sync with master if they drift
             v.currentTime = masterVideo.currentTime;
          }
        });
      }

      rafRef.current = requestAnimationFrame(updateLoop);
    };

    rafRef.current = requestAnimationFrame(updateLoop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [startTime, endTime, isDragging]);

  // Handle Mute
  useEffect(() => {
    if (!cropperWrapperRef.current) return;
    const internalVideo = cropperWrapperRef.current.querySelector('.internal-video') as HTMLVideoElement;
    if (internalVideo) {
      internalVideo.muted = isMuted;
      internalVideo.volume = 1;
    }
  }, [isMuted]);

  const seekVideos = useCallback((time: number) => {
    if (!cropperWrapperRef.current) return;
    const videos = cropperWrapperRef.current.querySelectorAll('video');
    videos.forEach(v => {
      v.currentTime = time;
    });
  }, []);

  const pauseVideos = useCallback(() => {
    if (!cropperWrapperRef.current) return;
    const videos = cropperWrapperRef.current.querySelectorAll('video');
    videos.forEach(v => v.pause());
  }, []);

  const playVideos = useCallback(() => {
    if (!cropperWrapperRef.current) return;
    const videos = cropperWrapperRef.current.querySelectorAll('video');
    videos.forEach(v => {
      v.play().catch(() => {});
    });
  }, []);

  useEffect(() => {
    setMounted(true);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
      URL.revokeObjectURL(videoSrc);
    };
  }, [videoSrc]);

  const onVideoLoad = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    setDuration(video.duration);
    setEndTime(Math.min(video.duration, maxDuration));
    playVideos();
  };

  const onCropCompleteHandler = useCallback((_: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleApply = async () => {
    if (!croppedAreaPixels) return;
    
    // Check if trimmed length exceeds max
    if (endTime - startTime > maxDuration) {
       toast({ title: 'Video too long', description: `Maximum duration for ${postType} is ${maxDuration} seconds.`, variant: 'destructive' });
       return;
    }

    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append('video', videoFile);
      formData.append('trimStart', startTime.toString());
      formData.append('trimEnd', endTime.toString());
      formData.append('cropX', croppedAreaPixels.x.toString());
      formData.append('cropY', croppedAreaPixels.y.toString());
      formData.append('cropWidth', croppedAreaPixels.width.toString());
      formData.append('cropHeight', croppedAreaPixels.height.toString());

      // Get actual Firebase auth token
      let authHeader = '';
      if (auth.currentUser) {
         const token = await auth.currentUser.getIdToken();
         authHeader = `Bearer ${token}`;
      }
      
      const response = await fetch('/api/video/adjust', {
        method: 'POST',
        headers: {
          ...(authHeader ? { 'Authorization': authHeader } : {})
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to process video');
      }

      const data = await response.json();
      if (data.success && data.url) {
         // Download the adjusted video via our reliable API proxy
         const downloadUrl = `/api/video/download?path=${encodeURIComponent(data.url)}`;
         const fileRes = await fetch(downloadUrl);
         
         const contentType = fileRes.headers.get('content-type');
         if (contentType && contentType.includes('text/html')) {
             throw new Error('Received HTML instead of video. The download proxy failed.');
         }
         
         const blob = await fileRes.blob();
         const newFile = new File([blob], `adjusted-${videoFile.name}`, { type: 'video/mp4' });
         onComplete(newFile);
      } else {
         throw new Error('Invalid response from server');
      }
    } catch (error: any) {
      toast({ title: 'Processing Failed', description: error.message || 'An error occurred while processing the video.', variant: 'destructive' });
    } finally {
      setIsProcessing(false);
    }
  };

  const content = (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col md:flex-row font-sans animate-in fade-in duration-200">
      
      {/* Cropper Area */}
      <div className="relative flex-1 flex flex-col min-h-0 bg-gray-950">
        <div className="flex justify-between items-center p-4 bg-gray-950/80 backdrop-blur-md z-20 border-b border-white/10 md:hidden">
          <h3 className="text-lg font-medium text-white">Adjust Video</h3>
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-white/80 hover:text-white hover:bg-white/10" disabled={isProcessing}>
            Cancel
          </Button>
        </div>
        
        <div className="relative flex-1 w-full h-full" ref={cropperWrapperRef}>
          {/* Hidden video just to load metadata and provide audio */}
          <video src={videoSrc} onLoadedMetadata={onVideoLoad} style={{ display: 'none' }} className="internal-video" muted playsInline />
          
          <Cropper
            video={videoSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspect}
            onCropChange={setCrop}
            onCropComplete={onCropCompleteHandler}
            onZoomChange={setZoom}
            restrictPosition={true}
            style={{
              containerStyle: { backgroundColor: 'transparent' },
            }}
          />
          
          <div className="absolute top-20 md:top-6 right-6 z-50">
            <Button
              variant="secondary"
              size="icon"
              className="rounded-full bg-black/50 hover:bg-black/70 text-white backdrop-blur-md border border-white/10"
              onClick={() => setIsMuted(!isMuted)}
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Control Panel */}
      <div className="w-full md:w-[350px] lg:w-[400px] bg-[#111] border-t md:border-t-0 md:border-l border-white/10 p-6 sm:p-8 flex flex-col z-20 shrink-0 overflow-y-auto">
        
        {/* Desktop Header */}
        <div className="hidden md:flex justify-between items-center mb-8">
          <h3 className="text-xl font-semibold text-white tracking-tight">Adjust Video</h3>
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-gray-400 hover:text-white hover:bg-white/10 rounded-full" disabled={isProcessing}>
            Cancel
          </Button>
        </div>

        <div className="flex flex-col gap-8 flex-1 justify-center md:justify-start">
          
          {/* Trimming Controls */}
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-400 uppercase tracking-wider">Trim Video</label>
              <span className="text-xs font-semibold text-white">
                {(endTime - startTime).toFixed(1)}s / {maxDuration}s max
              </span>
            </div>
            
            {duration > 0 ? (
              <TimelineTrimmer
                duration={duration}
                startTime={startTime}
                endTime={endTime}
                currentTime={currentTime}
                onStartTimeChange={(time: number) => { setStartTime(time); seekVideos(time); }}
                onEndTimeChange={(time: number) => { setEndTime(time); seekVideos(time); }}
                onDragStart={() => { setIsDragging(true); }}
                onDragEnd={() => { setIsDragging(false); playVideos(); }}
                frames={frames}
              />
            ) : (
              <div className="h-16 w-full rounded-md bg-white/5 animate-pulse flex items-center justify-center">
                <span className="text-xs text-white/50">Loading timeline...</span>
              </div>
            )}
          </div>

          {/* Aspect Ratio Presets */}
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-gray-400 uppercase tracking-wider">Aspect Ratio</label>
            <div className={`grid gap-2 ${isVerticalFormat ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-1' : 'grid-cols-1 sm:grid-cols-3 md:grid-cols-1'}`}>
              {!isVerticalFormat ? (
                <>
                  <Button variant={aspect === 4/5 ? "default" : "outline"} onClick={() => setAspect(4/5)} className={`justify-start px-4 h-11 transition-all ${aspect !== 4/5 ? "bg-white/5 text-white/70 border-white/10 hover:bg-white/10" : "bg-blue-600 hover:bg-blue-500 text-white border-blue-500"}`}>Portrait (4:5)</Button>
                  <Button variant={aspect === 1/1 ? "default" : "outline"} onClick={() => setAspect(1/1)} className={`justify-start px-4 h-11 transition-all ${aspect !== 1/1 ? "bg-white/5 text-white/70 border-white/10 hover:bg-white/10" : "bg-blue-600 hover:bg-blue-500 text-white border-blue-500"}`}>Square (1:1)</Button>
                  <Button variant={aspect === 1.91/1 ? "default" : "outline"} onClick={() => setAspect(1.91/1)} className={`justify-start px-4 h-11 transition-all ${aspect !== 1.91/1 ? "bg-white/5 text-white/70 border-white/10 hover:bg-white/10" : "bg-blue-600 hover:bg-blue-500 text-white border-blue-500"}`}>Landscape (1.91:1)</Button>
                </>
              ) : (
                <>
                  <Button variant={aspect === 9/16 ? "default" : "outline"} onClick={() => setAspect(9/16)} className={`justify-start px-4 h-11 transition-all ${aspect !== 9/16 ? "bg-white/5 text-white/70 border-white/10 hover:bg-white/10" : "bg-blue-600 hover:bg-blue-500 text-white border-blue-500"}`}>Story/Reel (9:16)</Button>
                  <Button variant={aspect === 16/9 ? "default" : "outline"} onClick={() => setAspect(16/9)} className={`justify-start px-4 h-11 transition-all ${aspect !== 16/9 ? "bg-white/5 text-white/70 border-white/10 hover:bg-white/10" : "bg-blue-600 hover:bg-blue-500 text-white border-blue-500"}`}>Landscape (16:9)</Button>
                </>
              )}
            </div>
          </div>

          {/* Zoom Slider */}
          <div className="flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <label className="text-sm font-medium text-gray-400 uppercase tracking-wider">Zoom</label>
              <span className="text-xs text-gray-500">{Math.round(zoom * 100)}%</span>
            </div>
            <input type="range" value={zoom} min={1} max={3} step={0.01} onChange={(e) => setZoom(Number(e.target.value))} className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all" />
          </div>

          {/* Action Buttons */}
          <div className="mt-auto pt-6">
            <Button 
              size="lg"
              onClick={handleApply} 
              disabled={isProcessing}
              className="w-full rounded-xl bg-white text-black hover:bg-gray-100 transition-colors font-semibold shadow-xl h-14 text-base flex items-center justify-center gap-2"
            >
              {isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                  Processing Video...
                </>
              ) : (
                'Apply Crop & Trim'
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}

function TimelineTrimmer({ duration, startTime, endTime, currentTime, onStartTimeChange, onEndTimeChange, onDragStart, onDragEnd, frames }: any) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDraggingLeft, setIsDraggingLeft] = useState(false);
  const [isDraggingRight, setIsDraggingRight] = useState(false);

  const handlePointerDownLeft = (e: React.PointerEvent) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    setIsDraggingLeft(true); 
    onDragStart();
  };
  const handlePointerDownRight = (e: React.PointerEvent) => { 
    e.preventDefault(); 
    e.stopPropagation(); 
    setIsDraggingRight(true); 
    onDragStart();
  };

  useEffect(() => {
    const handlePointerMove = (e: PointerEvent) => {
      if (!containerRef.current) return;
      if (!isDraggingLeft && !isDraggingRight) return;
      
      const rect = containerRef.current.getBoundingClientRect();
      let percent = (e.clientX - rect.left) / rect.width;
      percent = Math.max(0, Math.min(1, percent));
      
      const time = percent * duration;
      
      if (isDraggingLeft) {
         let newStart = Math.min(time, endTime - 0.5); // at least 0.5s gap
         onStartTimeChange(Math.max(0, newStart));
      } else if (isDraggingRight) {
         let newEnd = Math.max(time, startTime + 0.5);
         onEndTimeChange(Math.min(duration, newEnd));
      }
    };

    const handlePointerUp = () => {
      if (isDraggingLeft || isDraggingRight) {
        setIsDraggingLeft(false);
        setIsDraggingRight(false);
        onDragEnd();
      }
    };

    if (isDraggingLeft || isDraggingRight) {
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    }
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [isDraggingLeft, isDraggingRight, duration, startTime, endTime, onStartTimeChange, onEndTimeChange, onDragEnd]);

  const leftPercent = (startTime / duration) * 100;
  const rightPercent = ((duration - endTime) / duration) * 100;
  const currentPercent = Math.min(100, Math.max(0, (currentTime / duration) * 100));

  return (
    <div className="relative h-16 w-full select-none touch-none px-3" ref={containerRef}>
      {/* Visual background wrapper */}
      <div className="absolute inset-y-0 left-3 right-3 rounded-md overflow-hidden bg-gray-800/50 shadow-inner border border-white/10">
        {/* Filmstrip */}
        <div className="absolute inset-0 flex opacity-70">
           {frames.map((f: string, i: number) => (
              <img key={i} src={f} alt="" className="h-full flex-1 object-cover pointer-events-none" />
           ))}
        </div>
        
        {/* Darkened unselected areas */}
        <div className="absolute top-0 bottom-0 left-0 bg-black/80 backdrop-blur-[2px]" style={{ width: `${leftPercent}%` }} />
        <div className="absolute top-0 bottom-0 right-0 bg-black/80 backdrop-blur-[2px]" style={{ width: `${rightPercent}%` }} />
      </div>

      {/* Selected box border - separate from overflow-hidden so handles can stick out */}
      <div className="absolute top-0 bottom-0 left-3 right-3 pointer-events-none">
        <div className="absolute top-0 bottom-0 border-y-2 border-blue-500/80" style={{ left: `${leftPercent}%`, right: `${rightPercent}%` }}>
          {/* Playhead */}
          <div 
            className="absolute top-0 bottom-0 w-[2px] bg-white z-20 shadow-[0_0_8px_rgba(255,255,255,0.8)]"
            style={{ left: `${(currentTime - startTime) / (endTime - startTime) * 100}%`, display: (currentTime < startTime || currentTime > endTime) ? 'none' : 'block' }}
          />
        </div>
        
        {/* Left Handle */}
        <div 
          className="absolute top-0 bottom-0 w-3 bg-white hover:bg-blue-100 cursor-col-resize rounded-l-md shadow-[0_0_10px_rgba(0,0,0,0.5)] z-10 flex items-center justify-center transition-colors transform -translate-x-full pointer-events-auto" 
          style={{ left: `${leftPercent}%` }}
          onPointerDown={handlePointerDownLeft}
        >
          <div className="w-[2px] h-4 bg-gray-400 rounded-full" />
        </div>
        
        {/* Right Handle */}
        <div 
          className="absolute top-0 bottom-0 w-3 bg-white hover:bg-blue-100 cursor-col-resize rounded-r-md shadow-[0_0_10px_rgba(0,0,0,0.5)] z-10 flex items-center justify-center transition-colors transform translate-x-full pointer-events-auto" 
          style={{ right: `${rightPercent}%` }}
          onPointerDown={handlePointerDownRight}
        >
          <div className="w-[2px] h-4 bg-gray-400 rounded-full" />
        </div>
      </div>
    </div>
  )
}
