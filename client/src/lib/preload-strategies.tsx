/**
 * P7-6.4: Advanced Preloading Strategies for ≥90 Lighthouse Performance
 * Intelligent resource preloading and critical resource prioritization
 */

import { useEffect, useCallback } from 'react';

// P7-6.4.1: Critical Resource Preloader
export class CriticalResourcePreloader {
  private static instance: CriticalResourcePreloader;
  private preloadedResources = new Set<string>();
  private priorityQueue: Array<{ url: string; priority: number; type: string }> = [];

  public static getInstance(): CriticalResourcePreloader {
    if (!CriticalResourcePreloader.instance) {
      CriticalResourcePreloader.instance = new CriticalResourcePreloader();
    }
    return CriticalResourcePreloader.instance;
  }

  // Preload critical fonts and CSS
  public preloadCriticalResources() {
    const criticalResources = [
      {
        url: 'https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hiA.woff2',
        as: 'font',
        type: 'font/woff2',
        crossorigin: 'anonymous',
        priority: 100
      },
      {
        url: '/src/index.css',
        as: 'style',
        priority: 95
      },
      {
        url: '/src/main.tsx',
        as: 'script',
        priority: 90
      }
    ];

    criticalResources.forEach(resource => {
      this.preloadResource(resource.url, resource.as, resource.priority, {
        type: resource.type,
        crossorigin: resource.crossorigin
      });
    });
  }

  // Intelligent resource preloading based on priority
  public preloadResource(
    url: string, 
    as: string, 
    priority: number = 50,
    options: { type?: string; crossorigin?: string; media?: string } = {}
  ) {
    if (this.preloadedResources.has(url)) {
      return;
    }

    this.priorityQueue.push({ url, priority, type: as });
    this.priorityQueue.sort((a, b) => b.priority - a.priority);
    
    console.log(`[P7-6.4] Preloading resource: ${url} (priority: ${priority})`);

    const link = document.createElement('link');
    link.rel = 'preload';
    link.href = url;
    link.as = as;

    if (options.type) link.type = options.type;
    if (options.crossorigin) link.crossOrigin = options.crossorigin;
    if (options.media) link.media = options.media;

    // Add fetchpriority for modern browsers
    if ('fetchPriority' in link) {
      (link as any).fetchPriority = priority > 80 ? 'high' : priority > 50 ? 'auto' : 'low';
    }

    document.head.appendChild(link);
    this.preloadedResources.add(url);

    console.log(`[P7-6.4] Preloaded ${as}: ${url} (Priority: ${priority})`);
  }

  // Preload next likely routes based on user behavior
  public preloadRoutes(routes: string[], priority: number = 30) {
    routes.forEach(route => {
      this.preloadResource(route, 'document', priority);
    });
  }

  // Smart prefetch for API data
  public prefetchAPIData(endpoints: string[], priority: number = 20) {
    endpoints.forEach(endpoint => {
      if ('fetch' in window) {
        fetch(endpoint, {
          method: 'GET',
          headers: { 'Purpose': 'prefetch' }
        }).then(response => {
          if (response.ok) {
            console.log(`[P7-6.4] Prefetched API: ${endpoint}`);
          }
        }).catch(() => {
          console.log(`[P7-6.4] Failed to prefetch: ${endpoint}`);
        });
      }
    });
  }
}

// P7-6.4.2: Intersection Observer for Lazy Loading
export const useIntersectionPreload = () => {
  const createObserver = useCallback((callback: (entries: IntersectionObserverEntry[]) => void) => {
    const options = {
      root: null,
      rootMargin: '200px', // Start loading when element is 200px away
      threshold: 0.1
    };

    return new IntersectionObserver(callback, options);
  }, []);

  const observeElement = useCallback((element: HTMLElement, onIntersect: () => void) => {
    const observer = createObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          onIntersect();
          observer.disconnect();
        }
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, [createObserver]);

  return { observeElement };
};

// P7-6.4.3: User Behavior Prediction
export class UserBehaviorPreloader {
  private mouseDirection = { x: 0, y: 0 };
  private lastMouseMove = 0;
  private preloader = CriticalResourcePreloader.getInstance();
  
  constructor() {
    this.initializeTracking();
  }

  private initializeTracking() {
    // Track mouse movement for link prediction
    document.addEventListener('mousemove', (e) => {
      this.mouseDirection = { x: e.clientX, y: e.clientY };
      this.lastMouseMove = Date.now();
      this.predictUserIntent();
    });

    // Track scroll behavior for preloading
    let scrollTimeout: NodeJS.Timeout;
    document.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        this.preloadVisibleContent();
      }, 150);
    });
  }

  private predictUserIntent() {
    // Find links near mouse cursor
    const elements = document.elementsFromPoint(this.mouseDirection.x, this.mouseDirection.y);
    const link = elements.find(el => el.tagName === 'A') as HTMLAnchorElement;
    
    if (link && link.href) {
      // Preload the route if user is hovering near a link
      setTimeout(() => {
        if (Date.now() - this.lastMouseMove < 500) {
          this.preloader.preloadResource(link.href, 'document', 40);
        }
      }, 200);
    }
  }

  private preloadVisibleContent() {
    // Preload images and content that's about to become visible
    const viewportHeight = window.innerHeight;
    const scrollTop = window.scrollY;
    const preloadZone = scrollTop + viewportHeight + 500; // 500px ahead

    const images = document.querySelectorAll('img[data-src]');
    images.forEach(img => {
      const imgTop = (img as HTMLElement).offsetTop;
      if (imgTop < preloadZone) {
        const dataSrc = img.getAttribute('data-src');
        if (dataSrc) {
          this.preloader.preloadResource(dataSrc, 'image', 30);
        }
      }
    });
  }

  // Preload based on time on page
  public startTimeBasedPreloading() {
    // After 3 seconds, start preloading secondary content
    setTimeout(() => {
      this.preloader.preloadRoutes(['/dashboard', '/analytics'], 25);
    }, 3000);

    // After 10 seconds, preload everything else
    setTimeout(() => {
      this.preloader.preloadRoutes(['/automation', '/integration', '/profile'], 15);
    }, 10000);
  }
}

// P7-6.4.4: Service Worker Communication for Preloading
export const communicateWithServiceWorker = () => {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    const criticalRoutes = ['/dashboard', '/analytics'];
    
    navigator.serviceWorker.controller.postMessage({
      type: 'PREFETCH_ROUTES',
      routes: criticalRoutes
    });

    console.log('[P7-6.4] Requested service worker to prefetch critical routes');
  }
};

// P7-6.4.5: Network-Aware Preloading
export class NetworkAwarePreloader {
  private connection: any;
  private preloader = CriticalResourcePreloader.getInstance();

  constructor() {
    this.connection = (navigator as any).connection || 
                     (navigator as any).mozConnection || 
                     (navigator as any).webkitConnection;
    
    this.adjustPreloadingStrategy();
    this.monitorNetworkChanges();
  }

  private adjustPreloadingStrategy() {
    if (!this.connection) return;

    const { effectiveType, downlink, rtt } = this.connection;
    
    console.log(`[P7-6.4] Network: ${effectiveType}, Downlink: ${downlink}Mbps, RTT: ${rtt}ms`);

    if (effectiveType === '4g' && downlink > 5) {
      // Fast connection - aggressive preloading
      this.preloader.preloadRoutes(['/dashboard', '/analytics', '/automation'], 60);
    } else if (effectiveType === '3g' || downlink < 2) {
      // Slow connection - conservative preloading
      this.preloader.preloadRoutes(['/dashboard'], 30);
    } else {
      // Medium connection - balanced preloading
      this.preloader.preloadRoutes(['/dashboard', '/analytics'], 45);
    }
  }

  private monitorNetworkChanges() {
    if (this.connection) {
      this.connection.addEventListener('change', () => {
        console.log('[P7-6.4] Network condition changed, adjusting preloading strategy');
        this.adjustPreloadingStrategy();
      });
    }
  }
}

// P7-6.4.6: React Hook for Preloading Integration
export const usePreloadStrategies = () => {
  useEffect(() => {
    const preloader = CriticalResourcePreloader.getInstance();
    const behaviorPreloader = new UserBehaviorPreloader();
    new NetworkAwarePreloader(); // Initialize but don't store reference

    // Initialize preloading
    preloader.preloadCriticalResources();
    behaviorPreloader.startTimeBasedPreloading();
    communicateWithServiceWorker();

    console.log('[P7-6.4] Advanced preloading strategies initialized');

    return () => {
      // Cleanup if needed
    };
  }, []);

  const preloadOnDemand = useCallback((resources: Array<{ url: string; as: string; priority?: number }>) => {
    const preloader = CriticalResourcePreloader.getInstance();
    resources.forEach(resource => {
      preloader.preloadResource(resource.url, resource.as, resource.priority || 50);
    });
  }, []);

  return { preloadOnDemand };
};

// P7-6.4.7: Image Optimization and Lazy Loading
export const optimizeImages = () => {
  // Convert images to WebP where supported
  const images = document.querySelectorAll('img');
  
  images.forEach(img => {
    if (img.src && !img.src.includes('.webp')) {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      if (ctx && 'toBlob' in canvas) {
        // Check WebP support
        canvas.toBlob((blob) => {
          if (blob && blob.type === 'image/webp') {
            console.log('[P7-6.4] WebP support detected, optimizing images');
            // Implementation would convert and replace images
          }
        }, 'image/webp', 0.8);
      }
    }
  });
};

// Initialize preloading when module loads
if (typeof window !== 'undefined') {
  const preloader = CriticalResourcePreloader.getInstance();
  
  // Start immediate critical resource preloading
  document.addEventListener('DOMContentLoaded', () => {
    preloader.preloadCriticalResources();
    optimizeImages();
  });

  // If DOM is already loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      preloader.preloadCriticalResources();
    });
  } else {
    preloader.preloadCriticalResources();
  }
}