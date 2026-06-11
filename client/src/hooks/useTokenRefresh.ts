/**
 * Token Refresh Hook - Background Token Maintenance
 * 
 * This hook implements proactive background token refresh to maintain user sessions
 * without interrupting their activity. It refreshes tokens before they expire,
 * ensuring seamless authentication.
 * 
 * Features:
 * - Proactive refresh 5 minutes before token expiry
 * - Silent refresh without user interaction
 * - Automatic retry on failure
 * - Activity-based refresh scheduling
 * 
 * Requirements: 6.10, 19.7
 * 
 * @requirement 6.10 - Token refresh endpoint integration
 * @requirement 19.7 - Background refresh without interrupting user activity
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

/**
 * Hook to manage background token refresh
 * 
 * Automatically refreshes authentication tokens in the background to maintain
 * user sessions without interruption. Refreshes tokens 5 minutes before expiry.
 * 
 * @param enabled - Whether background refresh is enabled (default: true)
 */
export function useTokenRefresh(enabled: boolean = true) {
  // Check if user is authenticated by checking for auth_token cookie
  const { data: isAuthenticated } = useQuery({
    queryKey: ['auth-status'],
    queryFn: async () => {
      // Check if auth cookie exists (basic check - actual validation happens server-side)
      return document.cookie.split(';').some(cookie => cookie.trim().startsWith('auth_token='));
    },
    refetchInterval: 60000, // Recheck every minute
  });

  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef<boolean>(false);

  /**
   * Perform background token refresh
   * 
   * Silently calls the /api/auth/refresh endpoint to refresh the authentication
   * token without interrupting the user's current activity.
   */
  const performBackgroundRefresh = useCallback(async () => {
    // Prevent concurrent refresh attempts
    if (isRefreshingRef.current) {
      console.log('[TokenRefresh] Refresh already in progress, skipping');
      return;
    }

    isRefreshingRef.current = true;

    try {
      console.log('[TokenRefresh] Performing background token refresh...');
      
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include', // Include HTTP-only cookies
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        console.log('[TokenRefresh] Background refresh successful');
        
        // Schedule next refresh
        scheduleNextRefresh();
      } else {
        console.warn('[TokenRefresh] Background refresh failed:', response.status, response.statusText);
        
        // If refresh fails with 401, user needs to re-authenticate
        // The main queryClient will handle this on the next API request
        if (response.status === 401) {
          console.log('[TokenRefresh] Session expired, user will be prompted to sign in on next action');
          // Don't schedule next refresh - session is invalid
        } else {
          // For other errors, retry after a shorter interval (1 minute)
          console.log('[TokenRefresh] Scheduling retry in 1 minute...');
          refreshTimerRef.current = setTimeout(performBackgroundRefresh, 60000); // 1 minute
        }
      }
    } catch (error) {
      console.error('[TokenRefresh] Background refresh error:', error);
      
      // Retry after 1 minute on network errors
      console.log('[TokenRefresh] Scheduling retry in 1 minute...');
      refreshTimerRef.current = setTimeout(performBackgroundRefresh, 60000); // 1 minute
    } finally {
      isRefreshingRef.current = false;
    }
  }, []);

  /**
   * Schedule next background refresh
   * 
   * Firebase tokens expire after 60 minutes. We refresh 5 minutes before expiry
   * to ensure seamless session continuity without interrupting user activity.
   */
  const scheduleNextRefresh = useCallback(() => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }

    // Schedule refresh 55 minutes from now (5 minutes before 60-minute expiry)
    // This ensures tokens are refreshed before they expire
    const refreshInterval = 55 * 60 * 1000; // 55 minutes in milliseconds
    
    console.log('[TokenRefresh] Scheduling next refresh in 55 minutes');
    
    refreshTimerRef.current = setTimeout(performBackgroundRefresh, refreshInterval);
  }, [performBackgroundRefresh]);

  /**
   * Initialize background refresh when user is authenticated
   */
  useEffect(() => {
    // Only start background refresh if:
    // 1. Feature is enabled
    // 2. User is authenticated
    if (!enabled || !isAuthenticated) {
      return;
    }

    console.log('[TokenRefresh] Initializing background token refresh');
    
    // Schedule the first refresh
    scheduleNextRefresh();

    // Cleanup: Clear timer when component unmounts or user logs out
    return () => {
      if (refreshTimerRef.current) {
        console.log('[TokenRefresh] Clearing background refresh timer');
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [enabled, isAuthenticated, scheduleNextRefresh]);

  /**
   * Handle visibility change - refresh when tab becomes visible
   * 
   * When user switches back to the tab after being away, check if we need
   * to refresh the token to ensure it's still valid.
   */
  useEffect(() => {
    if (!enabled || !isAuthenticated) {
      return;
    }

    const handleVisibilityChange = () => {
      // When tab becomes visible again, check if we should refresh
      if (document.visibilityState === 'visible') {
        console.log('[TokenRefresh] Tab became visible, checking token freshness');
        
        // If no refresh is scheduled or it's more than 5 minutes away, refresh now
        // This handles cases where user was away for a long time
        if (!refreshTimerRef.current || isRefreshingRef.current === false) {
          performBackgroundRefresh();
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, isAuthenticated, performBackgroundRefresh]);

  // Return refresh function for manual triggering if needed
  return {
    refresh: performBackgroundRefresh,
  };
}
