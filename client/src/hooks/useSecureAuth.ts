import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { useFirebaseAuth } from './useFirebaseAuth';
import { 
  migrateToSecureCookies, 
  isAuthenticatedViaCookies, 
  getCSRFToken,
  logoutWithCookies 
} from '@/lib/auth-cookies';

interface SecureAuthState {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  usingSecureCookies: boolean;
  csrfToken: string | null;
  migrateToSecure: () => Promise<boolean>;
  secureLogout: () => Promise<boolean>;
}

/**
 * P1 SECURITY: Enhanced authentication hook with HTTP-only cookie support
 * 
 * This hook provides a secure authentication layer that:
 * - Maintains Firebase Auth for user management
 * - Migrates to HTTP-only cookies for API authentication  
 * - Provides CSRF protection for state-changing operations
 * - Supports gradual migration from localStorage
 */
export const useSecureAuth = (): SecureAuthState => {
  const { user, loading, isAuthenticated } = useFirebaseAuth();
  const [usingSecureCookies, setUsingSecureCookies] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [migrationChecked, setMigrationChecked] = useState(false);

  // Check if user is already using secure cookies
  useEffect(() => {
    const checkCookieAuth = async () => {
      if (isAuthenticated && !migrationChecked) {
        console.log('🔍 SECURITY: Checking cookie authentication status...');
        
        const cookieAuthStatus = await isAuthenticatedViaCookies();
        const currentCsrfToken = getCSRFToken();
        
        setUsingSecureCookies(cookieAuthStatus);
        setCsrfToken(currentCsrfToken);
        setMigrationChecked(true);
        
        if (cookieAuthStatus) {
          console.log('✅ SECURITY: User is already using secure cookie authentication');
        } else {
          console.log('⚠️ SECURITY: User is using localStorage authentication - recommend migration');
        }
      }
    };

    checkCookieAuth();
  }, [isAuthenticated, migrationChecked]);

  // Auto-migrate new authentications to secure cookies
  useEffect(() => {
    const autoMigrate = async () => {
      if (isAuthenticated && !loading && !usingSecureCookies && migrationChecked) {
        console.log('🔄 SECURITY: Auto-migrating to secure cookies...');
        
        const migrationSuccess = await migrateToSecureCookies();
        if (migrationSuccess) {
          setUsingSecureCookies(true);
          setCsrfToken(getCSRFToken());
          console.log('✅ SECURITY: Auto-migration to secure cookies successful');
        }
      }
    };

    // Auto-migrate after a short delay to allow Firebase auth to stabilize
    const timer = setTimeout(autoMigrate, 1000);
    return () => clearTimeout(timer);
  }, [isAuthenticated, loading, usingSecureCookies, migrationChecked]);

  // Manual migration function
  const migrateToSecure = async (): Promise<boolean> => {
    if (!isAuthenticated) {
      console.warn('🚨 SECURITY: Cannot migrate - user not authenticated');
      return false;
    }

    console.log('🔄 SECURITY: Manual migration to secure cookies initiated...');
    const success = await migrateToSecureCookies();
    
    if (success) {
      setUsingSecureCookies(true);
      setCsrfToken(getCSRFToken());
      console.log('✅ SECURITY: Manual migration successful');
    }
    
    return success;
  };

  // Secure logout function
  const secureLogout = async (): Promise<boolean> => {
    console.log('🔒 SECURITY: Initiating secure logout...');
    
    try {
      // Clear cookies first
      if (usingSecureCookies) {
        await logoutWithCookies();
      }
      
      // Then sign out from Firebase
      const { signOut, auth } = await import('@/lib/firebase');
      await signOut(auth);
      
      // Reset state
      setUsingSecureCookies(false);
      setCsrfToken(null);
      setMigrationChecked(false);
      
      console.log('✅ SECURITY: Secure logout completed');
      return true;
    } catch (error) {
      console.error('🚨 SECURITY: Secure logout failed:', error);
      return false;
    }
  };

  return {
    user,
    loading,
    isAuthenticated,
    usingSecureCookies,
    csrfToken,
    migrateToSecure,
    secureLogout
  };
};