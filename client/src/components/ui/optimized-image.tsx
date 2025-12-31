import React, { useState, useRef, useEffect, useCallback, useMemo, forwardRef, ImgHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type PlaceholderType = 'blur' | 'empty' | 'skeleton';

interface OptimizedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'placeholder'> {
  src: string;
  alt: string;
  placeholder?: PlaceholderType;
  blurDataURL?: string;
  priority?: boolean;
  quality?: number;
  fill?: boolean;
  sizes?: string;
  srcSet?: string;
  onLoadingComplete?: (result: { naturalWidth: number; naturalHeight: number }) => void;
  fallbackSrc?: string;
  aspectRatio?: string;
}

interface ImageFormatSupport {
  webp: boolean;
  avif: boolean;
}

const formatSupportCache: ImageFormatSupport = {
  webp: false,
  avif: false
};

let formatSupportChecked = false;

const checkImageFormatSupport = (): Promise<ImageFormatSupport> => {
  if (formatSupportChecked) {
    return Promise.resolve(formatSupportCache);
  }

  if (typeof window === 'undefined') {
    return Promise.resolve(formatSupportCache);
  }

  const checkFormat = (format: 'webp' | 'avif'): Promise<boolean> => {
    return new Promise((resolve) => {
      const testImages: Record<string, string> = {
        webp: 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
        avif: 'data:image/avif;base64,AAAAIGZ0eXBhdmlmAAAAAGF2aWZtaWYxbWlhZk1BMUIAAADybWV0YQAAAAAAAAAoaGRscgAAAAAAAAAAcGljdAAAAAAAAAAAAAAAAGxpYmF2aWYAAAAADnBpdG0AAAAAAAEAAAAeaWxvYwAAAABEAAABAAEAAAABAAABGgAAAB0AAAAoaWluZgAAAAAAAQAAABppbmZlAgAAAAABAABhdjAxQ29sb3IAAAAAamlwcnAAAABLaXBjbwAAABRpc3BlAAAAAAAAAAIAAAACAAAAEHBpeGkAAAAAAwgICAAAAAxhdjFDgQ0MAAAAABNjb2xybmNseAACAAIAAYAAAAAXaXBtYQAAAAAAAAABAAEEAQKDBAAAACVtZGF0EgAKBzgABpAQ0AIyExAAAAAAAA4gfggADAG4AQAAAAA='
      };

      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = testImages[format];
    });
  };

  return Promise.all([
    checkFormat('webp'),
    checkFormat('avif')
  ]).then(([webp, avif]) => {
    formatSupportCache.webp = webp;
    formatSupportCache.avif = avif;
    formatSupportChecked = true;
    return formatSupportCache;
  });
};

const useImageFormatSupport = (): ImageFormatSupport => {
  const [support, setSupport] = useState<ImageFormatSupport>(formatSupportCache);

  useEffect(() => {
    if (!formatSupportChecked) {
      checkImageFormatSupport().then(setSupport);
    }
  }, []);

  return support;
};

const RESPONSIVE_BREAKPOINTS = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];

const generateSrcSet = (
  src: string,
  widths: number[] = RESPONSIVE_BREAKPOINTS,
  quality: number = 80
): string => {
  if (!src || src.startsWith('data:')) return '';
  
  if (typeof window === 'undefined') {
    return widths.map((width) => `${src} ${width}w`).join(', ');
  }
  
  return widths
    .map((width) => {
      try {
        const url = new URL(src, window.location.origin);
        url.searchParams.set('w', width.toString());
        url.searchParams.set('q', quality.toString());
        return `${url.toString()} ${width}w`;
      } catch {
        return `${src} ${width}w`;
      }
    })
    .join(', ');
};

const generateDefaultSizes = (fill?: boolean): string => {
  if (fill) {
    return '100vw';
  }
  return '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw';
};

const getOptimalImageUrl = (
  src: string,
  formatSupport: ImageFormatSupport,
  quality: number = 80
): string => {
  if (!src || src.startsWith('data:') || src.startsWith('blob:')) {
    return src;
  }

  if (typeof window === 'undefined') {
    return src;
  }

  try {
    const url = new URL(src, window.location.origin);
    
    if (formatSupport.avif) {
      url.searchParams.set('format', 'avif');
    } else if (formatSupport.webp) {
      url.searchParams.set('format', 'webp');
    }
    
    url.searchParams.set('q', quality.toString());
    return url.toString();
  } catch {
    return src;
  }
};

const generateBlurDataURL = (color: string = '#e5e7eb'): string => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8">
      <filter id="b" color-interpolation-filters="sRGB">
        <feGaussianBlur stdDeviation="1" />
      </filter>
      <rect width="100%" height="100%" fill="${color}" filter="url(#b)" />
    </svg>
  `;
  
  // SSR guard: btoa is only available in browser
  if (typeof window === 'undefined' || typeof btoa === 'undefined') {
    // Return a simple inline SVG data URL that works without btoa
    return `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;
  }
  
  return `data:image/svg+xml;base64,${btoa(svg.trim())}`;
};

const ImageSkeleton: React.FC<{ className?: string; aspectRatio?: string }> = ({ 
  className, 
  aspectRatio 
}) => (
  <div
    className={cn(
      'animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200',
      'dark:from-gray-700 dark:via-gray-600 dark:to-gray-700',
      'bg-[length:200%_100%] rounded-lg',
      className
    )}
    style={{
      aspectRatio,
      animation: 'shimmer 1.5s ease-in-out infinite'
    }}
    aria-hidden="true"
  />
);

const BlurPlaceholder: React.FC<{ 
  blurDataURL: string; 
  className?: string;
  isLoaded: boolean;
}> = ({ blurDataURL, className, isLoaded }) => (
  <div
    className={cn(
      'absolute inset-0 overflow-hidden',
      'transition-opacity duration-500 ease-out',
      isLoaded ? 'opacity-0' : 'opacity-100',
      className
    )}
    style={{
      backgroundImage: `url(${blurDataURL})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      filter: 'blur(20px)',
      transform: 'scale(1.1)'
    }}
    aria-hidden="true"
  />
);

const OptimizedImage = forwardRef<HTMLImageElement, OptimizedImageProps>(
  (
    {
      src,
      alt,
      placeholder = 'empty',
      blurDataURL,
      priority = false,
      quality = 80,
      fill = false,
      sizes,
      srcSet,
      className,
      style,
      onLoad,
      onError,
      onLoadingComplete,
      fallbackSrc,
      aspectRatio,
      width,
      height,
      ...props
    },
    ref
  ) => {
    const [isLoaded, setIsLoaded] = useState(false);
    const [isError, setIsError] = useState(false);
    const [isInView, setIsInView] = useState(priority);
    const [currentSrc, setCurrentSrc] = useState(src);
    
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    const formatSupport = useImageFormatSupport();

    const optimizedSrc = useMemo(() => {
      if (priority || isInView) {
        return getOptimalImageUrl(currentSrc, formatSupport, quality);
      }
      return '';
    }, [currentSrc, formatSupport, quality, priority, isInView]);

    const generatedSrcSet = useMemo(() => {
      if (srcSet) return srcSet;
      if (!optimizedSrc || optimizedSrc.startsWith('data:')) return undefined;
      return generateSrcSet(optimizedSrc, RESPONSIVE_BREAKPOINTS, quality);
    }, [srcSet, optimizedSrc, quality]);

    const computedSizes = useMemo(() => {
      return sizes || generateDefaultSizes(fill);
    }, [sizes, fill]);

    const placeholderDataURL = useMemo(() => {
      if (placeholder === 'blur') {
        return blurDataURL || generateBlurDataURL();
      }
      return '';
    }, [placeholder, blurDataURL]);

    useEffect(() => {
      if (priority) {
        setIsInView(true);
        return;
      }

      const element = containerRef.current;
      if (!element) return;

      if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                setIsInView(true);
                observer.disconnect();
              }
            });
          },
          {
            rootMargin: '200px',
            threshold: 0.01
          }
        );

        observer.observe(element);
        return () => observer.disconnect();
      } else {
        setIsInView(true);
      }
    }, [priority]);

    const handleLoad = useCallback(
      (event: React.SyntheticEvent<HTMLImageElement>) => {
        const img = event.currentTarget;
        setIsLoaded(true);
        setIsError(false);

        onLoad?.(event);
        onLoadingComplete?.({
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight
        });
      },
      [onLoad, onLoadingComplete]
    );

    const handleError = useCallback(
      (event: React.SyntheticEvent<HTMLImageElement>) => {
        setIsError(true);

        if (fallbackSrc && currentSrc !== fallbackSrc) {
          setCurrentSrc(fallbackSrc);
          setIsError(false);
        } else {
          onError?.(event);
        }
      },
      [onError, fallbackSrc, currentSrc]
    );

    useEffect(() => {
      if (src !== currentSrc && src !== fallbackSrc) {
        setCurrentSrc(src);
        setIsLoaded(false);
        setIsError(false);
      }
    }, [src, currentSrc, fallbackSrc]);

    const combinedRef = useCallback(
      (node: HTMLImageElement | null) => {
        (imgRef as React.MutableRefObject<HTMLImageElement | null>).current = node;
        if (typeof ref === 'function') {
          ref(node);
        } else if (ref) {
          ref.current = node;
        }
      },
      [ref]
    );

    const containerStyles: React.CSSProperties = {
      position: fill ? 'absolute' : 'relative',
      ...(fill && { inset: 0 }),
      ...(aspectRatio && !fill && { aspectRatio }),
      ...style
    };

    const imageStyles: React.CSSProperties = {
      ...(fill && {
        position: 'absolute',
        width: '100%',
        height: '100%',
        objectFit: 'cover'
      }),
      opacity: isLoaded ? 1 : 0,
      transform: isLoaded ? 'translateZ(0) scale(1)' : 'translateZ(0) scale(1.02)',
      transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
      willChange: 'opacity, transform'
    };

    if (!alt) {
      console.warn('OptimizedImage: alt prop is required for accessibility');
    }

    return (
      <div
        ref={containerRef}
        className={cn(
          'overflow-hidden',
          fill && 'absolute inset-0',
          className
        )}
        style={containerStyles}
      >
        {placeholder === 'skeleton' && !isLoaded && !isError && (
          <ImageSkeleton 
            className="absolute inset-0 w-full h-full" 
            aspectRatio={aspectRatio}
          />
        )}

        {placeholder === 'blur' && placeholderDataURL && (
          <BlurPlaceholder
            blurDataURL={placeholderDataURL}
            isLoaded={isLoaded}
          />
        )}

        {isInView && (
          <img
            ref={combinedRef}
            src={optimizedSrc}
            alt={alt || ''}
            srcSet={generatedSrcSet}
            sizes={computedSizes}
            width={fill ? undefined : width}
            height={fill ? undefined : height}
            loading={priority ? 'eager' : 'lazy'}
            decoding={priority ? 'sync' : 'async'}
            fetchPriority={priority ? 'high' : 'auto'}
            onLoad={handleLoad}
            onError={handleError}
            className={cn(
              fill && 'object-cover w-full h-full',
              isError && 'hidden'
            )}
            style={imageStyles}
            {...props}
          />
        )}

        {isError && !fallbackSrc && (
          <div
            className={cn(
              'absolute inset-0 flex items-center justify-center',
              'bg-gray-100 dark:bg-gray-800 rounded-lg'
            )}
            role="img"
            aria-label={alt || 'Image failed to load'}
          >
            <div className="text-center p-4">
              <svg
                className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Image unavailable
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
);

OptimizedImage.displayName = 'OptimizedImage';

interface ResponsiveImageProps extends OptimizedImageProps {
  sources?: Array<{
    media: string;
    srcSet: string;
    type?: string;
  }>;
}

const ResponsiveImage = forwardRef<HTMLImageElement, ResponsiveImageProps>(
  ({ sources, src, alt, className, ...props }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);

    if (!sources || sources.length === 0) {
      return <OptimizedImage ref={ref} src={src} alt={alt} className={className} {...props} />;
    }

    return (
      <div ref={containerRef} className={cn('overflow-hidden', className)}>
        <picture>
          {sources.map((source, index) => (
            <source
              key={index}
              media={source.media}
              srcSet={source.srcSet}
              type={source.type}
            />
          ))}
          <OptimizedImage
            ref={ref}
            src={src}
            alt={alt}
            {...props}
          />
        </picture>
      </div>
    );
  }
);

ResponsiveImage.displayName = 'ResponsiveImage';

const useImagePreload = (src: string | string[]): boolean => {
  const [isPreloaded, setIsPreloaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const sources = Array.isArray(src) ? src : [src];
    let loadedCount = 0;

    const handleLoad = () => {
      loadedCount++;
      if (loadedCount === sources.length) {
        setIsPreloaded(true);
      }
    };

    sources.forEach((imageSrc) => {
      const img = new Image();
      img.onload = handleLoad;
      img.onerror = handleLoad;
      img.src = imageSrc;
    });
  }, [src]);

  return isPreloaded;
};

const preloadImage = (src: string): Promise<void> => {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = src;
  });
};

const preloadImages = (sources: string[]): Promise<void[]> => {
  return Promise.all(sources.map(preloadImage));
};

export {
  OptimizedImage,
  ResponsiveImage,
  ImageSkeleton,
  BlurPlaceholder,
  useImageFormatSupport,
  useImagePreload,
  generateSrcSet,
  generateDefaultSizes,
  getOptimalImageUrl,
  generateBlurDataURL,
  checkImageFormatSupport,
  preloadImage,
  preloadImages,
  RESPONSIVE_BREAKPOINTS
};

export type {
  OptimizedImageProps,
  ResponsiveImageProps,
  ImageFormatSupport,
  PlaceholderType
};

export default OptimizedImage;
