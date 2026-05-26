/**
 * P8.1: Test Setup Configuration
 * 
 * Global test configuration for comprehensive testing suite
 */

// Mock environment variables
// Global type declarations
declare var jest: any;

// Mock environment variables
if (typeof window !== 'undefined') {
  (window as any).import = {
    meta: {
      env: {
        VITE_FIREBASE_API_KEY: 'mock-api-key',
        VITE_FIREBASE_AUTH_DOMAIN: 'mock-project.firebaseapp.com',
        VITE_FIREBASE_PROJECT_ID: 'mock-project',
        VITE_FIREBASE_STORAGE_BUCKET: 'mock-project.appspot.com',
        VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
        VITE_FIREBASE_APP_ID: '1:123456789:web:abcd1234',
        MODE: 'test'
      }
    }
  };
}

// Mock IntersectionObserver
if (typeof window !== 'undefined') {
  (window as any).IntersectionObserver = class IntersectionObserver {
    observe() { return null; }
    unobserve() { return null; }
    disconnect() { return null; }
  };
}

// Mock ResizeObserver
if (typeof window !== 'undefined') {
  (window as any).ResizeObserver = class ResizeObserver {
    observe() { return null; }
    unobserve() { return null; }
    disconnect() { return null; }
  };
}

// Mock Performance APIs
if (typeof window !== 'undefined') {
  Object.defineProperty(window.performance, 'mark', {
    value: () => null,
    writable: true
  });

  Object.defineProperty(window.performance, 'measure', {
    value: () => null,
    writable: true
  });

  Object.defineProperty(window.performance, 'getEntriesByType', {
    value: () => [],
    writable: true
  });
}

// Mock PerformanceObserver
if (typeof window !== 'undefined') {
  (window as any).PerformanceObserver = class PerformanceObserver {
    observe() { return null; }
    disconnect() { return null; }
  };
}

// Mock window.matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => null,
      removeListener: () => null,
      addEventListener: () => null,
      removeEventListener: () => null,
      dispatchEvent: () => null
    })
  });
}

// Mock fetch
if (typeof global !== 'undefined') {
  (global as any).fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve('')
  });
}