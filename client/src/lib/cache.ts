/**
 * Cache utility for storing user preferences and data with expiration
 */

export interface CacheData {
  data: any;
  timestamp: number;
  expiresIn: number; // in milliseconds
}

export interface AutomationCacheData {
  selectedAccount: string | null;
  contentType: string | null;
}

const CACHE_PREFIX = 'veefore_automation_';
const DEFAULT_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds (effectively persistent)

// Cache is now persistent - no blocking needed

/**
 * Save data to localStorage with timestamp and expiration
 */
export function saveToCache<T>(key: string, data: T, expiresIn: number = DEFAULT_EXPIRY): void {
  try {
    const cacheData: CacheData = {
      data,
      timestamp: Date.now(),
      expiresIn
    };
    
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(cacheData));
  } catch (error) {
    console.warn('Failed to save to cache:', error);
  }
}

/**
 * Load data from localStorage (no expiration check to prevent app refresh)
 */
export function loadFromCache<T>(key: string): T | null {
  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!cached) return null;

    const cacheData: CacheData = JSON.parse(cached);
    console.log(`Cache loaded for key: ${key}`);
    return cacheData.data;
  } catch (error) {
    console.warn('Failed to load from cache:', error);
    return null;
  }
}

/**
 * Remove specific cache entry
 */
export function removeFromCache(key: string): void {
  try {
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
  } catch (error) {
    console.warn('Failed to remove from cache:', error);
  }
}

/**
 * Clear all automation-related cache entries
 */
export function clearAutomationCache(): void {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith(CACHE_PREFIX)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('Failed to clear automation cache:', error);
  }
}

/**
 * Clear automation cache for a specific user
 */
export function clearUserAutomationCache(userId: string): void {
  try {
    const key = `automation_state_${userId}`;
    localStorage.removeItem(`${CACHE_PREFIX}${key}`);
  } catch (error) {
    console.warn('Failed to clear user automation cache:', error);
  }
}

/**
 * Save automation page state (user-specific)
 */
export function saveAutomationState(state: Partial<AutomationCacheData>, userId?: string): void {
  const key = userId ? `automation_state_${userId}` : 'automation_state';
  saveToCache(key, state);
}

/**
 * Load automation page state (user-specific)
 */
export function loadAutomationState(userId?: string): Partial<AutomationCacheData> | null {
  const key = userId ? `automation_state_${userId}` : 'automation_state';
  return loadFromCache<Partial<AutomationCacheData>>(key);
}

// Cache monitoring functions removed - cache is now persistent
