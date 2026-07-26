/**
 * Token Refresh Hook - Background Token Maintenance
 * 
 * This hook implements proactive background token refresh to maintain user sessions
 * without interrupting their activity. It refreshes tokens before they expire,
 * ensuring seamless authentication with Instagram-like persistence.
 * 
 * Features:
 * - Proactive refresh 5 minutes before token expiry
 * - Silent refresh without user interaction or loading states
 * - Exponential backoff retry on failure
 * - Activity-based refresh scheduling
 * - 30-day session persistence
 * 
 * Requirements: 6.10, 19.7
 * 
 * @requirement 6.10 - Token refresh endpoint integration
 * @requirement 19.7 - Background refresh without interrupting user activity
 */

import { useEffect, useRef, useCallback } from 'react';
import { auth } from '@/lib/firebase';
import { signInWithCustomToken } from 'firebase/auth';

/**
 * Hook to manage background token refresh
 * 
 * Automatically refreshes authentication tokens in the background to maintain
 * user sessions without interruption. Refreshes tokens 5 minutes before expiry.
 * Implements Instagram-style seamless authentication with 30-day persistence.
 * 
 * @param enabled - Whether background refresh is enabled (default: true)
 */
export function useTokenRefresh(enabled: boolean = true) {
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const maxRetries = 3;

  /**
   * Perform background token refresh with exponential backoff retry
   * 
   * Silently calls the /api/auth/refresh endpoint to refresh the authentication
   * token without interrupting the user's current activity or showing loading states.
   */
  const performBackgroundRefresh = useCallback(async () => {
    // Prevent concurrent refresh attempts
    if (isRefreshingRef.current) {
      console.log('[TokenRefresh] Refresh already in progress, skipping');
      return;
    }

    isRefreshingRef.current = true;

    try {
      console.log('[TokenRefresh] Performing background token refresh (silent)...');

      // PRIMARY PATH: refresh the Firebase ID token directly. This is the
      // authoritative session and works for BOTH email/password and Google OAuth
      // users. It avoids depending on the server-side Google refresh token, which
      // doesn't exist for email/password users (and previously caused logouts).
      if (auth.currentUser) {
        try {
          const idToken = await auth.currentUser.getIdToken(true);

          // Keep the server cookie in sync (best-effort, non-fatal).
          await fetch('/api/auth/update-token', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ idToken }),
          }).catch(() => { /* non-fatal */ });

          console.log('[TokenRefresh] ✅ Firebase ID token refreshed, cookie synced');
          retryCountRef.current = 0;
          scheduleNextRefresh();
          return;
        } catch (firebaseError) {
          console.warn('[TokenRefresh] Firebase token refresh failed, trying server refresh:', firebaseError);
          // Fall through to the server-side refresh below.
        }
      }

      // FALLBACK PATH: server-side Google OAuth refresh.
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include', // Include HTTP-only cookies
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        console.log('[TokenRefresh] Background refresh successful (silent)');
        
        // Get the custom token from response
        const data = await response.json();
        const customToken = data.customToken;
        
        if (customToken) {
          try {
            // Exchange custom token for ID token
            console.log('[TokenRefresh] Exchanging custom token for ID token...');
            const userCredential = await signInWithCustomToken(auth, customToken);
            const idToken = await userCredential.user.getIdToken();
            
            // Update server cookie with ID token
            await fetch('/api/auth/update-token', {
              method: 'POST',
              credentials: 'include',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ idToken })
            });
            
            console.log('[TokenRefresh] ✅ Token exchange complete, cookie updated');
          } catch (exchangeError) {
            console.error('[TokenRefresh] Token exchange failed:', exchangeError);
            // Continue with retry logic below
            throw exchangeError;
          }
        }
        
        // Reset retry count on success
        retryCountRef.current = 0;
        
        // Schedule next refresh
        scheduleNextRefresh();
      } else {
        console.warn('[TokenRefresh] Background refresh failed:', response.status, response.statusText);
        
        // If refresh fails with 401, the server-side Google session is gone.
        // This is NOT fatal — the Firebase client session (the authoritative one)
        // may still be valid. We already tried to refresh it via the SDK above.
        // Do NOT force a redirect/logout here; the next protected request will
        // re-attempt a Firebase refresh and only redirect if the session is truly gone.
        if (response.status === 401) {
          console.log('[TokenRefresh] Server session expired; relying on Firebase session. No logout forced.');
          // Don't schedule next refresh on the server path; the Firebase-first
          // path on next activity/visibility will keep the session alive.
        } else if (response.status === 429) {
          // Rate limited - wait longer before retry
          console.log('[TokenRefresh] Rate limited, scheduling retry in 5 minutes...');
          refreshTimerRef.current = setTimeout(performBackgroundRefresh, 5 * 60000); // 5 minutes
        } else {
          // For other errors, implement exponential backoff
          retryCountRef.current += 1;
          
          if (retryCountRef.current <= maxRetries) {
            // Exponential backoff: 1min, 2min, 4min
            const retryDelay = Math.min(60000 * Math.pow(2, retryCountRef.current - 1), 4 * 60000);
            console.log(`[TokenRefresh] Retry ${retryCountRef.current}/${maxRetries} in ${retryDelay/60000} minutes...`);
            refreshTimerRef.current = setTimeout(performBackgroundRefresh, retryDelay);
          } else {
            console.error('[TokenRefresh] Max retries reached, giving up');
            retryCountRef.current = 0; // Reset for next scheduled refresh
          }
        }
      }
    } catch (error) {
      console.error('[TokenRefresh] Background refresh error:', error);
      
      // Implement exponential backoff for network errors
      retryCountRef.current += 1;
      
      if (retryCountRef.current <= maxRetries) {
        // Exponential backoff: 1min, 2min, 4min
        const retryDelay = Math.min(60000 * Math.pow(2, retryCountRef.current - 1), 4 * 60000);
        console.log(`[TokenRefresh] Network error, retry ${retryCountRef.current}/${maxRetries} in ${retryDelay/60000} minutes...`);
        refreshTimerRef.current = setTimeout(performBackgroundRefresh, retryDelay);
      } else {
        console.error('[TokenRefresh] Max retries reached after network errors, giving up');
        retryCountRef.current = 0; // Reset for next scheduled refresh
      }
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
    // Only start background refresh if feature is enabled
    if (!enabled) {
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
  }, [enabled, scheduleNextRefresh]);

  /**
   * Handle visibility change - refresh when tab becomes visible
   * 
   * When user switches back to the tab after being away, check if we need
   * to refresh the token to ensure it's still valid.
   */
  useEffect(() => {
    if (!enabled) {
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
  }, [enabled, performBackgroundRefresh]);

  // Return refresh function for manual triggering if needed
  return {
    refresh: performBackgroundRefresh,
  };
}
