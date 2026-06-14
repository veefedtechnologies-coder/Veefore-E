/**
 * Mobile Touch Handlers and Gesture Detection
 * 
 * Provides utilities for touch event handling, gesture recognition,
 * and swipe detection optimized for mobile devices.
 * 
 * @module shared/utils/mobile/touchHandlers
 */

export interface TouchPoint {
  x: number;
  y: number;
  time: number;
}

export interface SwipeEvent {
  direction: 'up' | 'down' | 'left' | 'right';
  distance: number;
  velocity: number;
  duration: number;
  startPoint: TouchPoint;
  endPoint: TouchPoint;
}

export interface PinchEvent {
  scale: number;
  center: { x: number; y: number };
  distance: number;
}

export interface TapEvent {
  x: number;
  y: number;
  tapCount: number;
  duration: number;
}

export interface GestureConfig {
  minSwipeDistance?: number;
  minSwipeVelocity?: number;
  maxTapDuration?: number;
  doubleTapDelay?: number;
  longPressDelay?: number;
}

const DEFAULT_GESTURE_CONFIG: Required<GestureConfig> = {
  minSwipeDistance: 50,
  minSwipeVelocity: 0.3,
  maxTapDuration: 200,
  doubleTapDelay: 300,
  longPressDelay: 500,
};

/**
 * Touch Gesture Handler
 * Manages touch event detection and gesture recognition
 */
export class TouchGestureHandler {
  private config: Required<GestureConfig>;
  private touchStartPoint: TouchPoint | null = null;
  private touchHistory: TouchPoint[] = [];
  private lastTapTime = 0;
  private tapCount = 0;
  private longPressTimer: NodeJS.Timeout | null = null;
  private initialTouches: Touch[] = [];

  constructor(config?: GestureConfig) {
    this.config = { ...DEFAULT_GESTURE_CONFIG, ...config };
  }

  /**
   * Handle touch start event
   */
  handleTouchStart(event: TouchEvent): void {
    const touch = event.touches[0];
    const now = Date.now();

    this.touchStartPoint = {
      x: touch.clientX,
      y: touch.clientY,
      time: now,
    };

    this.touchHistory = [this.touchStartPoint];
    this.initialTouches = Array.from(event.touches);

    // Setup long press detection
    this.longPressTimer = setTimeout(() => {
      this.onLongPress(this.touchStartPoint!);
    }, this.config.longPressDelay);
  }

  /**
   * Handle touch move event
   */
  handleTouchMove(event: TouchEvent): void {
    // Clear long press timer on move
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    const touch = event.touches[0];
    const now = Date.now();

    const point: TouchPoint = {
      x: touch.clientX,
      y: touch.clientY,
      time: now,
    };

    this.touchHistory.push(point);

    // Keep only recent history (last 500ms)
    const cutoff = now - 500;
    this.touchHistory = this.touchHistory.filter((p) => p.time > cutoff);
  }

  /**
   * Handle touch end event
   */
  handleTouchEnd(event: TouchEvent): SwipeEvent | TapEvent | null {
    // Clear long press timer
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }

    if (!this.touchStartPoint) return null;

    const touch = event.changedTouches[0];
    const now = Date.now();

    const endPoint: TouchPoint = {
      x: touch.clientX,
      y: touch.clientY,
      time: now,
    };

    const duration = endPoint.time - this.touchStartPoint.time;
    const distance = this.calculateDistance(this.touchStartPoint, endPoint);

    // Check for tap gesture
    if (duration < this.config.maxTapDuration && distance < 10) {
      return this.handleTap(endPoint, duration);
    }

    // Check for swipe gesture
    if (
      distance >= this.config.minSwipeDistance &&
      this.touchHistory.length > 2
    ) {
      const swipeEvent = this.detectSwipe(this.touchStartPoint, endPoint, duration);
      if (swipeEvent) {
        this.touchStartPoint = null;
        this.touchHistory = [];
        return swipeEvent;
      }
    }

    this.touchStartPoint = null;
    this.touchHistory = [];
    return null;
  }

  /**
   * Handle tap gesture with double-tap detection
   */
  private handleTap(point: TouchPoint, duration: number): TapEvent {
    const now = Date.now();
    const timeSinceLastTap = now - this.lastTapTime;

    if (timeSinceLastTap < this.config.doubleTapDelay) {
      this.tapCount++;
    } else {
      this.tapCount = 1;
    }

    this.lastTapTime = now;

    return {
      x: point.x,
      y: point.y,
      tapCount: this.tapCount,
      duration,
    };
  }

  /**
   * Detect swipe direction and velocity
   */
  private detectSwipe(
    start: TouchPoint,
    end: TouchPoint,
    duration: number
  ): SwipeEvent | null {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const velocity = distance / duration;

    if (velocity < this.config.minSwipeVelocity) {
      return null;
    }

    // Determine primary direction
    let direction: SwipeEvent['direction'];
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      direction = deltaX > 0 ? 'right' : 'left';
    } else {
      direction = deltaY > 0 ? 'down' : 'up';
    }

    return {
      direction,
      distance,
      velocity,
      duration,
      startPoint: start,
      endPoint: end,
    };
  }

  /**
   * Calculate distance between two points
   */
  private calculateDistance(p1: TouchPoint, p2: TouchPoint): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Long press callback (override in subclass or use event system)
   */
  private onLongPress(point: TouchPoint): void {
    // Emit custom event
    window.dispatchEvent(
      new CustomEvent('mobile:longpress', {
        detail: { x: point.x, y: point.y },
      })
    );
  }

  /**
   * Detect pinch gesture (two-finger)
   */
  detectPinch(event: TouchEvent): PinchEvent | null {
    if (event.touches.length !== 2 || this.initialTouches.length !== 2) {
      return null;
    }

    const touch1 = event.touches[0];
    const touch2 = event.touches[1];
    const initialTouch1 = this.initialTouches[0];
    const initialTouch2 = this.initialTouches[1];

    const currentDistance = this.calculateTouchDistance(touch1, touch2);
    const initialDistance = this.calculateTouchDistance(
      initialTouch1,
      initialTouch2
    );

    const scale = currentDistance / initialDistance;

    // Calculate center point
    const center = {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2,
    };

    return {
      scale,
      center,
      distance: currentDistance,
    };
  }

  /**
   * Calculate distance between two touches
   */
  private calculateTouchDistance(touch1: Touch, touch2: Touch): number {
    const dx = touch2.clientX - touch1.clientX;
    const dy = touch2.clientY - touch1.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Reset handler state
   */
  reset(): void {
    this.touchStartPoint = null;
    this.touchHistory = [];
    this.tapCount = 0;
    this.initialTouches = [];
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}

/**
 * Swipe Handler
 * Specialized handler for swipe navigation
 */
export class SwipeHandler {
  private gestureHandler: TouchGestureHandler;
  private onSwipeCallback?: (event: SwipeEvent) => void;
  private element: HTMLElement;

  constructor(element: HTMLElement, onSwipe?: (event: SwipeEvent) => void) {
    this.element = element;
    this.onSwipeCallback = onSwipe;
    this.gestureHandler = new TouchGestureHandler();
    this.attach();
  }

  /**
   * Attach event listeners
   */
  private attach(): void {
    this.element.addEventListener(
      'touchstart',
      this.handleTouchStart.bind(this),
      { passive: true }
    );
    this.element.addEventListener(
      'touchmove',
      this.handleTouchMove.bind(this),
      { passive: true }
    );
    this.element.addEventListener(
      'touchend',
      this.handleTouchEnd.bind(this),
      { passive: true }
    );
  }

  /**
   * Handle touch events
   */
  private handleTouchStart(event: TouchEvent): void {
    this.gestureHandler.handleTouchStart(event);
  }

  private handleTouchMove(event: TouchEvent): void {
    this.gestureHandler.handleTouchMove(event);
  }

  private handleTouchEnd(event: TouchEvent): void {
    const result = this.gestureHandler.handleTouchEnd(event);
    if (result && 'direction' in result && this.onSwipeCallback) {
      this.onSwipeCallback(result);
    }
  }

  /**
   * Update swipe callback
   */
  onSwipe(callback: (event: SwipeEvent) => void): void {
    this.onSwipeCallback = callback;
  }

  /**
   * Detach event listeners and cleanup
   */
  destroy(): void {
    this.element.removeEventListener('touchstart', this.handleTouchStart);
    this.element.removeEventListener('touchmove', this.handleTouchMove);
    this.element.removeEventListener('touchend', this.handleTouchEnd);
    this.gestureHandler.reset();
  }
}

/**
 * Reduce touch delay (eliminate 300ms tap delay on mobile)
 */
export function reduceTouchDelay(element: HTMLElement = document.body): void {
  let lastTouchEnd = 0;

  element.addEventListener(
    'touchend',
    (event) => {
      const now = Date.now();
      // Prevent double-tap zoom
      if (now - lastTouchEnd <= 300) {
        event.preventDefault();
      }
      lastTouchEnd = now;
    },
    { passive: false }
  );
}

/**
 * Prevent default touch behaviors
 */
export function preventDefaultTouchBehaviors(element: HTMLElement): void {
  // Prevent pull-to-refresh on some browsers
  element.addEventListener(
    'touchstart',
    (event) => {
      if (element.scrollTop === 0) {
        // At top of scroll, allow default
      } else if (
        element.scrollHeight - element.scrollTop ===
        element.clientHeight
      ) {
        // At bottom of scroll, allow default
      } else {
        // In the middle, prevent overscroll
        event.preventDefault();
      }
    },
    { passive: false }
  );

  // Prevent pinch-zoom
  element.addEventListener(
    'gesturestart',
    (event) => {
      event.preventDefault();
    },
    { passive: false }
  );
}

/**
 * Create touch ripple effect
 */
export function createTouchRipple(
  element: HTMLElement,
  color = 'rgba(255, 255, 255, 0.3)'
): void {
  element.style.position = 'relative';
  element.style.overflow = 'hidden';

  element.addEventListener('touchstart', (event) => {
    const touch = event.touches[0];
    const rect = element.getBoundingClientRect();

    const ripple = document.createElement('span');
    ripple.style.position = 'absolute';
    ripple.style.borderRadius = '50%';
    ripple.style.backgroundColor = color;
    ripple.style.width = '0';
    ripple.style.height = '0';
    ripple.style.left = `${touch.clientX - rect.left}px`;
    ripple.style.top = `${touch.clientY - rect.top}px`;
    ripple.style.transform = 'translate(-50%, -50%)';
    ripple.style.pointerEvents = 'none';
    ripple.style.animation = 'ripple-effect 0.6s ease-out';

    element.appendChild(ripple);

    // Remove ripple after animation
    setTimeout(() => {
      ripple.remove();
    }, 600);
  });

  // Add ripple animation CSS
  if (!document.getElementById('touch-ripple-styles')) {
    const style = document.createElement('style');
    style.id = 'touch-ripple-styles';
    style.textContent = `
      @keyframes ripple-effect {
        to {
          width: 200px;
          height: 200px;
          opacity: 0;
        }
      }
    `;
    document.head.appendChild(style);
  }
}

/**
 * Utility: Check if device supports touch
 */
export function isTouchDevice(): boolean {
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    (window as any).DocumentTouch !== undefined
  );
}

/**
 * Utility: Get touch coordinates relative to element
 */
export function getTouchCoordinates(
  touch: Touch,
  element: HTMLElement
): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  return {
    x: touch.clientX - rect.left,
    y: touch.clientY - rect.top,
  };
}
