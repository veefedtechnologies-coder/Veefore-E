/**
 * MOBILE PERFORMANCE OPTIMIZER
 * Comprehensive mobile performance utility for VeeFore
 * 
 * Features:
 * - Device detection & adaptive rendering
 * - Quality tier system (ultra, high, medium, low)
 * - Adaptive animation system with framer-motion presets
 * - Performance monitoring (FPS, memory, auto-downgrade)
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type QualityTier = 'ultra' | 'high' | 'medium' | 'low';

export interface DeviceCapabilities {
  deviceMemory: number;
  cpuCores: number;
  connectionType: string;
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
  isLowEndDevice: boolean;
  isMobile: boolean;
  isTablet: boolean;
  pixelRatio: number;
  screenWidth: number;
  screenHeight: number;
  touchSupport: boolean;
  batteryLevel: number | null;
  isCharging: boolean | null;
  supportsWebGL: boolean;
  supportsWebGL2: boolean;
  gpuTier: 'low' | 'medium' | 'high' | 'unknown';
}

export interface AnimationSettings {
  duration: number;
  stiffness: number;
  damping: number;
  mass: number;
  enableParallax: boolean;
  enableBlur: boolean;
  enableShadows: boolean;
  enable3D: boolean;
  maxParticles: number;
  imagePriority: 'low' | 'auto' | 'high';
  prefersReducedMotion: boolean;
}

export interface PerformanceMetrics {
  fps: number;
  averageFps: number;
  memoryUsage: number;
  memoryLimit: number;
  memoryPercentage: number;
  jank: number;
  longTasks: number;
}

export interface MobilePerformanceState {
  qualityTier: QualityTier;
  fps: number;
  isLowEnd: boolean;
  shouldReduceMotion: boolean;
  animationSettings: AnimationSettings;
  deviceCapabilities: DeviceCapabilities;
  performanceMetrics: PerformanceMetrics;
  isMonitoring: boolean;
}

export interface MobilePerformanceContextValue extends MobilePerformanceState {
  setQualityTier: (tier: QualityTier) => void;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  forceDowngrade: () => void;
  forceUpgrade: () => void;
  resetToAuto: () => void;
}

// ============================================================================
// ANIMATION PRESETS FOR FRAMER-MOTION
// ============================================================================

export const ANIMATION_PRESETS = {
  ultra: {
    fadeIn: {
      initial: { opacity: 0, y: 20, scale: 0.95, filter: 'blur(4px)' },
      animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
      exit: { opacity: 0, y: -20, scale: 0.95, filter: 'blur(4px)' },
      transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }
    },
    slideIn: {
      initial: { x: -100, opacity: 0, rotateY: -15 },
      animate: { x: 0, opacity: 1, rotateY: 0 },
      exit: { x: 100, opacity: 0, rotateY: 15 },
      transition: { type: 'spring', stiffness: 300, damping: 30 }
    },
    scale: {
      initial: { scale: 0.8, opacity: 0, rotateZ: -5 },
      animate: { scale: 1, opacity: 1, rotateZ: 0 },
      exit: { scale: 0.8, opacity: 0, rotateZ: 5 },
      transition: { type: 'spring', stiffness: 400, damping: 25 }
    },
    stagger: { staggerChildren: 0.08, delayChildren: 0.1 },
    hover: { scale: 1.05, y: -5, boxShadow: '0 20px 40px rgba(0,0,0,0.15)' },
    tap: { scale: 0.95 },
    spring: { type: 'spring', stiffness: 400, damping: 25, mass: 1 }
  },
  high: {
    fadeIn: {
      initial: { opacity: 0, y: 15 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -15 },
      transition: { duration: 0.3, ease: [0.4, 0, 0.2, 1] }
    },
    slideIn: {
      initial: { x: -60, opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: 60, opacity: 0 },
      transition: { type: 'spring', stiffness: 350, damping: 35 }
    },
    scale: {
      initial: { scale: 0.9, opacity: 0 },
      animate: { scale: 1, opacity: 1 },
      exit: { scale: 0.9, opacity: 0 },
      transition: { type: 'spring', stiffness: 400, damping: 30 }
    },
    stagger: { staggerChildren: 0.06, delayChildren: 0.05 },
    hover: { scale: 1.03, y: -3 },
    tap: { scale: 0.97 },
    spring: { type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }
  },
  medium: {
    fadeIn: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.2, ease: 'easeOut' }
    },
    slideIn: {
      initial: { x: -30, opacity: 0 },
      animate: { x: 0, opacity: 1 },
      exit: { x: 30, opacity: 0 },
      transition: { duration: 0.25, ease: 'easeOut' }
    },
    scale: {
      initial: { scale: 0.95, opacity: 0 },
      animate: { scale: 1, opacity: 1 },
      exit: { scale: 0.95, opacity: 0 },
      transition: { duration: 0.2, ease: 'easeOut' }
    },
    stagger: { staggerChildren: 0.04, delayChildren: 0 },
    hover: { scale: 1.02 },
    tap: { scale: 0.98 },
    spring: { type: 'tween', duration: 0.2, ease: 'easeOut' }
  },
  low: {
    fadeIn: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.1 }
    },
    slideIn: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.1 }
    },
    scale: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0.1 }
    },
    stagger: { staggerChildren: 0, delayChildren: 0 },
    hover: {},
    tap: {},
    spring: { type: 'tween', duration: 0.1 }
  },
  reducedMotion: {
    fadeIn: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0 }
    },
    slideIn: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0 }
    },
    scale: {
      initial: { opacity: 0 },
      animate: { opacity: 1 },
      exit: { opacity: 0 },
      transition: { duration: 0 }
    },
    stagger: { staggerChildren: 0, delayChildren: 0 },
    hover: {},
    tap: {},
    spring: { type: 'tween', duration: 0 }
  }
} as const;

// ============================================================================
// ANIMATION SETTINGS PER QUALITY TIER
// ============================================================================

const ANIMATION_SETTINGS_BY_TIER: Record<QualityTier, AnimationSettings> = {
  ultra: {
    duration: 0.4,
    stiffness: 300,
    damping: 25,
    mass: 1,
    enableParallax: true,
    enableBlur: true,
    enableShadows: true,
    enable3D: true,
    maxParticles: 1000,
    imagePriority: 'high',
    prefersReducedMotion: false
  },
  high: {
    duration: 0.3,
    stiffness: 350,
    damping: 30,
    mass: 0.8,
    enableParallax: true,
    enableBlur: true,
    enableShadows: true,
    enable3D: true,
    maxParticles: 500,
    imagePriority: 'auto',
    prefersReducedMotion: false
  },
  medium: {
    duration: 0.2,
    stiffness: 400,
    damping: 35,
    mass: 0.6,
    enableParallax: false,
    enableBlur: false,
    enableShadows: true,
    enable3D: false,
    maxParticles: 200,
    imagePriority: 'auto',
    prefersReducedMotion: false
  },
  low: {
    duration: 0.1,
    stiffness: 500,
    damping: 40,
    mass: 0.4,
    enableParallax: false,
    enableBlur: false,
    enableShadows: false,
    enable3D: false,
    maxParticles: 50,
    imagePriority: 'low',
    prefersReducedMotion: false
  }
};

// ============================================================================
// DEVICE DETECTION
// ============================================================================

interface NetworkInformation {
  effectiveType: string;
  downlink: number;
  rtt: number;
  saveData: boolean;
  type?: string;
  addEventListener?: (type: string, callback: () => void) => void;
  removeEventListener?: (type: string, callback: () => void) => void;
}

declare global {
  interface Navigator {
    deviceMemory?: number;
    connection?: NetworkInformation;
    mozConnection?: NetworkInformation;
    webkitConnection?: NetworkInformation;
    getBattery?: () => Promise<{
      level: number;
      charging: boolean;
      addEventListener: (type: string, callback: () => void) => void;
      removeEventListener: (type: string, callback: () => void) => void;
    }>;
  }
}

function detectWebGLSupport(): { webgl: boolean; webgl2: boolean } {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { webgl: false, webgl2: false };
  }
  try {
    const canvas = document.createElement('canvas');
    const webgl = !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    const webgl2 = !!(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
    return { webgl, webgl2 };
  } catch {
    return { webgl: false, webgl2: false };
  }
}

function detectGPUTier(): 'low' | 'medium' | 'high' | 'unknown' {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return 'unknown';
  }
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl) return 'unknown';
    
    const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'unknown';
    
    const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();
    
    const lowEndIndicators = ['intel', 'mesa', 'llvmpipe', 'swiftshader', 'software'];
    const highEndIndicators = ['nvidia', 'geforce', 'radeon', 'amd', 'rx', 'rtx', 'gtx'];
    
    if (lowEndIndicators.some(indicator => renderer.includes(indicator))) return 'low';
    if (highEndIndicators.some(indicator => renderer.includes(indicator))) return 'high';
    
    return 'medium';
  } catch {
    return 'unknown';
  }
}

const DEFAULT_DEVICE_CAPABILITIES: DeviceCapabilities = {
  deviceMemory: 4,
  cpuCores: 4,
  connectionType: 'unknown',
  effectiveType: '4g',
  downlink: 10,
  rtt: 50,
  saveData: false,
  isLowEndDevice: false,
  isMobile: false,
  isTablet: false,
  pixelRatio: 1,
  screenWidth: 1920,
  screenHeight: 1080,
  touchSupport: false,
  batteryLevel: null,
  isCharging: null,
  supportsWebGL: false,
  supportsWebGL2: false,
  gpuTier: 'unknown'
};

export function getDeviceCapabilities(): DeviceCapabilities {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return DEFAULT_DEVICE_CAPABILITIES;
  }
  
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  const webglSupport = detectWebGLSupport();
  const gpuTier = detectGPUTier();
  
  const deviceMemory = navigator.deviceMemory || 4;
  const cpuCores = navigator.hardwareConcurrency || 4;
  const userAgent = navigator.userAgent?.toLowerCase() || '';
  
  const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent) ||
                   (window.innerWidth <= 768 && 'ontouchstart' in window);
  const isTablet = /ipad|android(?=.*tablet)|tablet/i.test(userAgent) ||
                   (window.innerWidth > 768 && window.innerWidth <= 1024 && 'ontouchstart' in window);
  
  const isLowEndDevice = deviceMemory <= 2 || cpuCores <= 2 || 
                         (connection?.effectiveType === '2g') ||
                         (connection?.effectiveType === 'slow-2g') ||
                         connection?.saveData === true;
  
  return {
    deviceMemory,
    cpuCores,
    connectionType: connection?.type || 'unknown',
    effectiveType: connection?.effectiveType || '4g',
    downlink: connection?.downlink || 10,
    rtt: connection?.rtt || 50,
    saveData: connection?.saveData || false,
    isLowEndDevice,
    isMobile,
    isTablet,
    pixelRatio: window.devicePixelRatio || 1,
    screenWidth: window.screen?.width || 1920,
    screenHeight: window.screen?.height || 1080,
    touchSupport: 'ontouchstart' in window,
    batteryLevel: null,
    isCharging: null,
    supportsWebGL: webglSupport.webgl,
    supportsWebGL2: webglSupport.webgl2,
    gpuTier
  };
}

function determineQualityTier(capabilities: DeviceCapabilities, prefersReducedMotion: boolean): QualityTier {
  if (prefersReducedMotion) return 'low';
  
  const { deviceMemory, cpuCores, effectiveType, saveData, gpuTier, isLowEndDevice } = capabilities;
  
  if (isLowEndDevice || saveData) return 'low';
  
  let score = 0;
  
  if (deviceMemory >= 8) score += 3;
  else if (deviceMemory >= 4) score += 2;
  else if (deviceMemory >= 2) score += 1;
  
  if (cpuCores >= 8) score += 3;
  else if (cpuCores >= 4) score += 2;
  else if (cpuCores >= 2) score += 1;
  
  if (effectiveType === '4g') score += 2;
  else if (effectiveType === '3g') score += 1;
  
  if (gpuTier === 'high') score += 3;
  else if (gpuTier === 'medium') score += 2;
  else if (gpuTier === 'low') score += 1;
  
  if (score >= 10) return 'ultra';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  return 'low';
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

class PerformanceMonitor {
  private fpsHistory: number[] = [];
  private frameCount = 0;
  private lastTime = 0;
  private currentFps = 60;
  private averageFps = 60;
  private rafId: number | null = null;
  private longTaskCount = 0;
  private jankCount = 0;
  private observer: PerformanceObserver | null = null;
  private callbacks: Set<(metrics: PerformanceMetrics) => void> = new Set();
  
  start(): void {
    this.lastTime = performance.now();
    this.measureFrame();
    this.setupLongTaskObserver();
  }
  
  stop(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
  
  subscribe(callback: (metrics: PerformanceMetrics) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  
  private measureFrame = (): void => {
    const now = performance.now();
    const delta = now - this.lastTime;
    
    if (delta > 0) {
      this.frameCount++;
      
      if (delta > 50) {
        this.jankCount++;
      }
      
      if (now - this.fpsHistory[this.fpsHistory.length - 1] >= 1000 || this.fpsHistory.length === 0) {
        this.currentFps = Math.round(this.frameCount);
        this.fpsHistory.push(this.currentFps);
        
        if (this.fpsHistory.length > 10) {
          this.fpsHistory.shift();
        }
        
        this.averageFps = Math.round(this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length);
        this.frameCount = 0;
        
        this.notifySubscribers();
      }
    }
    
    this.lastTime = now;
    this.rafId = requestAnimationFrame(this.measureFrame);
  };
  
  private setupLongTaskObserver(): void {
    if ('PerformanceObserver' in window) {
      try {
        this.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration > 50) {
              this.longTaskCount++;
            }
          }
        });
        this.observer.observe({ entryTypes: ['longtask'] });
      } catch {
        // longtask not supported
      }
    }
  }
  
  private notifySubscribers(): void {
    const metrics = this.getMetrics();
    this.callbacks.forEach(callback => callback(metrics));
  }
  
  getMetrics(): PerformanceMetrics {
    let memoryUsage = 0;
    let memoryLimit = 0;
    let memoryPercentage = 0;
    
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      memoryUsage = memory.usedJSHeapSize;
      memoryLimit = memory.jsHeapSizeLimit;
      memoryPercentage = (memoryUsage / memoryLimit) * 100;
    }
    
    return {
      fps: this.currentFps,
      averageFps: this.averageFps,
      memoryUsage,
      memoryLimit,
      memoryPercentage,
      jank: this.jankCount,
      longTasks: this.longTaskCount
    };
  }
  
  reset(): void {
    this.fpsHistory = [];
    this.frameCount = 0;
    this.longTaskCount = 0;
    this.jankCount = 0;
  }
}

// ============================================================================
// REACT CONTEXT & PROVIDER
// ============================================================================

const MobilePerformanceContext = createContext<MobilePerformanceContextValue | null>(null);

const DEFAULT_PERFORMANCE_METRICS: PerformanceMetrics = {
  fps: 60,
  averageFps: 60,
  memoryUsage: 0,
  memoryLimit: 0,
  memoryPercentage: 0,
  jank: 0,
  longTasks: 0
};

interface AdaptiveAnimationProviderProps {
  children: ReactNode;
  autoMonitor?: boolean;
  autoDowngradeThreshold?: number;
  autoUpgradeThreshold?: number;
  onQualityChange?: (tier: QualityTier) => void;
}

export function AdaptiveAnimationProvider({
  children,
  autoMonitor = true,
  autoDowngradeThreshold = 30,
  autoUpgradeThreshold = 55,
  onQualityChange
}: AdaptiveAnimationProviderProps): React.ReactElement {
  const monitorRef = useRef<PerformanceMonitor | null>(null);
  const manualTierRef = useRef<QualityTier | null>(null);
  const downgradeCountRef = useRef(0);
  const upgradeCountRef = useRef(0);
  const isSettledRef = useRef(false);
  
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  });
  
  const [deviceCapabilities, setDeviceCapabilities] = useState<DeviceCapabilities>(() => getDeviceCapabilities());
  
  const [qualityTier, setQualityTierState] = useState<QualityTier>(() => 
    determineQualityTier(deviceCapabilities, prefersReducedMotion)
  );
  
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics>(DEFAULT_PERFORMANCE_METRICS);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      isSettledRef.current = true;
    }, 3000);
    return () => clearTimeout(timer);
  }, []);
  
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
      if (e.matches && manualTierRef.current === null && isSettledRef.current) {
        setQualityTierState('low');
      }
    };
    
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);
  
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    
    const handleConnectionChange = () => {
      const newCapabilities = getDeviceCapabilities();
      setDeviceCapabilities(newCapabilities);
      
      if (manualTierRef.current === null && isSettledRef.current) {
        const newTier = determineQualityTier(newCapabilities, prefersReducedMotion);
        setQualityTierState(newTier);
      }
    };
    
    connection?.addEventListener?.('change', handleConnectionChange);
    window.addEventListener('resize', handleConnectionChange);
    
    return () => {
      connection?.removeEventListener?.('change', handleConnectionChange);
      window.removeEventListener('resize', handleConnectionChange);
    };
  }, [prefersReducedMotion]);
  
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    
    const fetchBatteryInfo = async () => {
      try {
        if (navigator.getBattery) {
          const battery = await navigator.getBattery();
          
          const updateBattery = () => {
            setDeviceCapabilities(prev => ({
              ...prev,
              batteryLevel: battery.level,
              isCharging: battery.charging
            }));
            
            if (battery.level < 0.15 && !battery.charging && manualTierRef.current === null && isSettledRef.current) {
              setQualityTierState(prev => prev === 'ultra' ? 'high' : prev === 'high' ? 'medium' : prev);
            }
          };
          
          updateBattery();
          battery.addEventListener('levelchange', updateBattery);
          battery.addEventListener('chargingchange', updateBattery);
          
          return () => {
            battery.removeEventListener('levelchange', updateBattery);
            battery.removeEventListener('chargingchange', updateBattery);
          };
        }
      } catch {
        // Battery API not available
      }
    };
    
    fetchBatteryInfo();
  }, []);
  
  const startMonitoring = useCallback(() => {
    if (!monitorRef.current) {
      monitorRef.current = new PerformanceMonitor();
    }
    
    monitorRef.current.subscribe((metrics) => {
      setPerformanceMetrics(metrics);
      
      if (manualTierRef.current !== null) return;
      
      if (metrics.averageFps < autoDowngradeThreshold) {
        downgradeCountRef.current++;
        upgradeCountRef.current = 0;
        
        if (downgradeCountRef.current >= 3 && isSettledRef.current) {
          setQualityTierState(prev => {
            const tiers: QualityTier[] = ['ultra', 'high', 'medium', 'low'];
            const currentIndex = tiers.indexOf(prev);
            const newTier = tiers[Math.min(currentIndex + 1, tiers.length - 1)];
            if (newTier !== prev) {
              onQualityChange?.(newTier);
            }
            return newTier;
          });
          downgradeCountRef.current = 0;
        }
      } else if (metrics.averageFps > autoUpgradeThreshold) {
        upgradeCountRef.current++;
        downgradeCountRef.current = 0;
        
        if (upgradeCountRef.current >= 5 && isSettledRef.current) {
          setQualityTierState(prev => {
            const tiers: QualityTier[] = ['ultra', 'high', 'medium', 'low'];
            const currentIndex = tiers.indexOf(prev);
            const optimalTier = determineQualityTier(deviceCapabilities, prefersReducedMotion);
            const optimalIndex = tiers.indexOf(optimalTier);
            const newTier = tiers[Math.max(currentIndex - 1, optimalIndex)];
            if (newTier !== prev) {
              onQualityChange?.(newTier);
            }
            return newTier;
          });
          upgradeCountRef.current = 0;
        }
      } else {
        downgradeCountRef.current = Math.max(0, downgradeCountRef.current - 1);
        upgradeCountRef.current = Math.max(0, upgradeCountRef.current - 1);
      }
    });
    
    monitorRef.current.start();
    setIsMonitoring(true);
  }, [autoDowngradeThreshold, autoUpgradeThreshold, deviceCapabilities, prefersReducedMotion, onQualityChange]);
  
  const stopMonitoring = useCallback(() => {
    monitorRef.current?.stop();
    setIsMonitoring(false);
  }, []);
  
  useEffect(() => {
    if (autoMonitor) {
      startMonitoring();
    }
    
    return () => {
      monitorRef.current?.stop();
    };
  }, [autoMonitor, startMonitoring]);
  
  const setQualityTier = useCallback((tier: QualityTier) => {
    manualTierRef.current = tier;
    setQualityTierState(tier);
    onQualityChange?.(tier);
  }, [onQualityChange]);
  
  const forceDowngrade = useCallback(() => {
    setQualityTierState(prev => {
      const tiers: QualityTier[] = ['ultra', 'high', 'medium', 'low'];
      const currentIndex = tiers.indexOf(prev);
      const newTier = tiers[Math.min(currentIndex + 1, tiers.length - 1)];
      manualTierRef.current = newTier;
      onQualityChange?.(newTier);
      return newTier;
    });
  }, [onQualityChange]);
  
  const forceUpgrade = useCallback(() => {
    setQualityTierState(prev => {
      const tiers: QualityTier[] = ['ultra', 'high', 'medium', 'low'];
      const currentIndex = tiers.indexOf(prev);
      const newTier = tiers[Math.max(currentIndex - 1, 0)];
      manualTierRef.current = newTier;
      onQualityChange?.(newTier);
      return newTier;
    });
  }, [onQualityChange]);
  
  const resetToAuto = useCallback(() => {
    manualTierRef.current = null;
    const optimalTier = determineQualityTier(deviceCapabilities, prefersReducedMotion);
    setQualityTierState(optimalTier);
    onQualityChange?.(optimalTier);
  }, [deviceCapabilities, prefersReducedMotion, onQualityChange]);
  
  const animationSettings: AnimationSettings = {
    ...ANIMATION_SETTINGS_BY_TIER[qualityTier],
    prefersReducedMotion
  };
  
  const value: MobilePerformanceContextValue = {
    qualityTier,
    fps: performanceMetrics.fps,
    isLowEnd: deviceCapabilities.isLowEndDevice,
    shouldReduceMotion: prefersReducedMotion || qualityTier === 'low',
    animationSettings,
    deviceCapabilities,
    performanceMetrics,
    isMonitoring,
    setQualityTier,
    startMonitoring,
    stopMonitoring,
    forceDowngrade,
    forceUpgrade,
    resetToAuto
  };
  
  return React.createElement(MobilePerformanceContext.Provider, { value }, children);
}

// ============================================================================
// HOOKS
// ============================================================================

export function useMobilePerformance(): MobilePerformanceContextValue {
  const context = useContext(MobilePerformanceContext);
  
  if (!context) {
    const defaultCapabilities = getDeviceCapabilities();
    const prefersReducedMotion = typeof window !== 'undefined' 
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
      : false;
    const qualityTier = determineQualityTier(defaultCapabilities, prefersReducedMotion);
    
    return {
      qualityTier,
      fps: 60,
      isLowEnd: defaultCapabilities.isLowEndDevice,
      shouldReduceMotion: prefersReducedMotion || qualityTier === 'low',
      animationSettings: { ...ANIMATION_SETTINGS_BY_TIER[qualityTier], prefersReducedMotion },
      deviceCapabilities: defaultCapabilities,
      performanceMetrics: DEFAULT_PERFORMANCE_METRICS,
      isMonitoring: false,
      setQualityTier: () => {},
      startMonitoring: () => {},
      stopMonitoring: () => {},
      forceDowngrade: () => {},
      forceUpgrade: () => {},
      resetToAuto: () => {}
    };
  }
  
  return context;
}

export function useAnimationPreset() {
  const { qualityTier, shouldReduceMotion } = useMobilePerformance();
  
  if (shouldReduceMotion) {
    return ANIMATION_PRESETS.reducedMotion;
  }
  
  return ANIMATION_PRESETS[qualityTier];
}

export function useAdaptiveAnimation() {
  const { animationSettings, qualityTier } = useMobilePerformance();
  const presets = useAnimationPreset();
  
  return {
    settings: animationSettings,
    presets,
    tier: qualityTier,
    shouldAnimate: qualityTier !== 'low',
    getTransition: (type: 'fast' | 'normal' | 'slow' = 'normal') => {
      const multiplier = type === 'fast' ? 0.5 : type === 'slow' ? 2 : 1;
      return {
        type: 'spring',
        stiffness: animationSettings.stiffness,
        damping: animationSettings.damping,
        mass: animationSettings.mass * multiplier
      };
    }
  };
}

export function usePerformanceMetrics() {
  const { performanceMetrics, isMonitoring, startMonitoring, stopMonitoring } = useMobilePerformance();
  return { metrics: performanceMetrics, isMonitoring, startMonitoring, stopMonitoring };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export function getOptimalImageQuality(tier: QualityTier): number {
  switch (tier) {
    case 'ultra': return 100;
    case 'high': return 85;
    case 'medium': return 70;
    case 'low': return 50;
  }
}

export function getOptimalImageSize(tier: QualityTier, baseSize: number): number {
  const multipliers: Record<QualityTier, number> = {
    ultra: 1,
    high: 0.85,
    medium: 0.7,
    low: 0.5
  };
  return Math.round(baseSize * multipliers[tier]);
}

export function shouldEnableEffect(tier: QualityTier, effect: 'blur' | 'shadow' | 'parallax' | '3d'): boolean {
  const settings = ANIMATION_SETTINGS_BY_TIER[tier];
  switch (effect) {
    case 'blur': return settings.enableBlur;
    case 'shadow': return settings.enableShadows;
    case 'parallax': return settings.enableParallax;
    case '3d': return settings.enable3D;
  }
}

export { determineQualityTier };
