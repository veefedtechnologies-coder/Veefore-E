import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Cropper from 'react-easy-crop';
import { Button } from '@/components/ui/button';

interface Point {
  x: number;
  y: number;
}

interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageCropperProps {
  imageSrc: string;
  onCropComplete: (croppedFile: File) => void;
  onCancel: () => void;
  postType?: 'post' | 'story' | 'reel';
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.setAttribute('crossOrigin', 'anonymous');
    image.src = url;
  });

async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area,
  rotation = 0
): Promise<File | null> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // Draw the cropped image onto the canvas
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      const file = new File([blob], 'cropped-image.jpeg', { type: 'image/jpeg', lastModified: Date.now() });
      resolve(file);
    }, 'image/jpeg', 0.95);
  });
}

export function ImageCropper({ imageSrc, onCropComplete, onCancel, postType = 'post' }: ImageCropperProps) {
  const isVerticalFormat = postType === 'story' || postType === 'reel';
  const initialAspect = isVerticalFormat ? 9 / 16 : 4 / 5;

  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspect, setAspect] = useState<number>(initialAspect);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const onCropCompleteHandler = useCallback((croppedArea: Area, croppedAreaPixels: Area) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleApply = async () => {
    if (croppedAreaPixels) {
      const file = await getCroppedImg(imageSrc, croppedAreaPixels);
      if (file) {
        onCropComplete(file);
      }
    }
  };

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Prevent scrolling on body when modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const content = (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col md:flex-row font-sans animate-in fade-in duration-200">
      
      {/* Cropper Area - Left side on desktop, Top on mobile */}
      <div className="relative flex-1 flex flex-col min-h-0 bg-gray-950">
        <div className="flex justify-between items-center p-4 bg-gray-950/80 backdrop-blur-md z-20 border-b border-white/10 md:hidden">
          <h3 className="text-lg font-medium text-white">Adjust Image</h3>
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-white/80 hover:text-white hover:bg-white/10">
            Cancel
          </Button>
        </div>
        
        <div className="relative flex-1 w-full h-full">
          <Cropper
            image={imageSrc}
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
        </div>
      </div>

      {/* Control Panel - Right side on desktop, Bottom on mobile */}
      <div className="w-full md:w-[350px] lg:w-[400px] bg-[#111] border-t md:border-t-0 md:border-l border-white/10 p-6 sm:p-8 flex flex-col z-20 shrink-0 overflow-y-auto">
        
        {/* Desktop Header */}
        <div className="hidden md:flex justify-between items-center mb-8">
          <h3 className="text-xl font-semibold text-white tracking-tight">Adjust Image</h3>
          <Button variant="ghost" size="sm" onClick={onCancel} className="text-gray-400 hover:text-white hover:bg-white/10 rounded-full">
            Cancel
          </Button>
        </div>

        <div className="flex flex-col gap-8 flex-1 justify-center md:justify-start">
          {/* Aspect Ratio Presets */}
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium text-gray-400 uppercase tracking-wider">Aspect Ratio</label>
            <div className={`grid gap-2 ${isVerticalFormat ? 'grid-cols-1 sm:grid-cols-2 md:grid-cols-1' : 'grid-cols-1 sm:grid-cols-3 md:grid-cols-1'}`}>
              {!isVerticalFormat ? (
                <>
                  <Button 
                    variant={aspect === 4/5 ? "default" : "outline"} 
                    onClick={() => setAspect(4/5)}
                    className={`justify-start px-4 h-11 transition-all ${aspect !== 4/5 ? "bg-white/5 text-white/70 border-white/10 hover:bg-white/10" : "bg-blue-600 hover:bg-blue-500 text-white border-blue-500"}`}
                  >
                    Portrait (4:5)
                  </Button>
                  <Button 
                    variant={aspect === 1/1 ? "default" : "outline"} 
                    onClick={() => setAspect(1/1)}
                    className={`justify-start px-4 h-11 transition-all ${aspect !== 1/1 ? "bg-white/5 text-white/70 border-white/10 hover:bg-white/10" : "bg-blue-600 hover:bg-blue-500 text-white border-blue-500"}`}
                  >
                    Square (1:1)
                  </Button>
                  <Button 
                    variant={aspect === 1.91/1 ? "default" : "outline"} 
                    onClick={() => setAspect(1.91/1)}
                    className={`justify-start px-4 h-11 transition-all ${aspect !== 1.91/1 ? "bg-white/5 text-white/70 border-white/10 hover:bg-white/10" : "bg-blue-600 hover:bg-blue-500 text-white border-blue-500"}`}
                  >
                    Landscape (1.91:1)
                  </Button>
                </>
              ) : (
                <>
                  <Button 
                    variant={aspect === 9/16 ? "default" : "outline"} 
                    onClick={() => setAspect(9/16)}
                    className={`justify-start px-4 h-11 transition-all ${aspect !== 9/16 ? "bg-white/5 text-white/70 border-white/10 hover:bg-white/10" : "bg-blue-600 hover:bg-blue-500 text-white border-blue-500"}`}
                  >
                    Story/Reel (9:16)
                  </Button>
                  <Button 
                    variant={aspect === 16/9 ? "default" : "outline"} 
                    onClick={() => setAspect(16/9)}
                    className={`justify-start px-4 h-11 transition-all ${aspect !== 16/9 ? "bg-white/5 text-white/70 border-white/10 hover:bg-white/10" : "bg-blue-600 hover:bg-blue-500 text-white border-blue-500"}`}
                  >
                    Landscape (16:9)
                  </Button>
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
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.01}
              aria-labelledby="Zoom"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer accent-blue-500 hover:accent-blue-400 transition-all"
            />
          </div>

          {/* Action Buttons */}
          <div className="mt-auto pt-6">
            <Button 
              size="lg"
              onClick={handleApply} 
              className="w-full rounded-xl bg-white text-black hover:bg-gray-100 transition-colors font-semibold shadow-xl h-14 text-base"
            >
              Apply Crop
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
