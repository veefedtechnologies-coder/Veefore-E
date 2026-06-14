import React, { useState, useRef, useEffect, forwardRef } from 'react';

interface PreviewVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  poster?: string;
  alt?: string;
}

/**
 * PreviewVideo Component
 * Video player with automatic error handling and fallback to poster image
 * Supports autoplay with muted audio for Instagram previews
 */
export const PreviewVideo = forwardRef<HTMLVideoElement, PreviewVideoProps>(
  ({ src, poster, alt, id, onError, ...props }, forwardedRef) => {
    const [error, setError] = useState(false);
    const internalRef = useRef<HTMLVideoElement>(null);
    
    // Merge forwarded ref and internal ref
    const setRefs = React.useCallback(
      (node: HTMLVideoElement | null) => {
        // Update internal ref
        (internalRef as React.MutableRefObject<HTMLVideoElement | null>).current = node;
        
        // Update forwarded ref
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          (forwardedRef as React.MutableRefObject<HTMLVideoElement | null>).current = node;
        }
      },
      [forwardedRef]
    );

    // Force autoplay at the DOM level whenever src changes
    useEffect(() => {
      const video = internalRef.current;
      if (video && src && !error) {
        video.muted = true;
        video.defaultMuted = true;
        
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise.catch(err => {
            console.log('Autoplay prevented by browser policy:', err);
          });
        }
      }
    }, [src, error]);
    
    return (
      <>
        {(error || !src) && (
          <img 
            src={poster || src || ''} 
            alt={alt || 'Post'} 
            className={props.className || "w-full h-full object-cover"} 
          />
        )}
        <video
          ref={setRefs}
          src={src}
          className={props.className || "w-full h-full object-cover"}
          style={{ display: (error || !src) ? 'none' : 'block' }}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={poster}
          onError={(e) => {
            console.log('Video error:', id, e);
            setError(true);
            if (onError) onError(e);
          }}
          {...props}
        />
      </>
    );
  }
);

PreviewVideo.displayName = 'PreviewVideo';

export default PreviewVideo;
