import { useState, useCallback, useEffect } from 'react';

interface EarlyAccessStatus {
    hasEarlyAccess: boolean;
    status: string | null;
    email?: string;
}

export function useEarlyAccessCheck() {
    const [isLoading, setIsLoading] = useState(false);
    const [status, setStatus] = useState<EarlyAccessStatus>({
        hasEarlyAccess: false,
        status: null
    });

    // Check status against API
    const checkStatus = useCallback(async (email: string) => {
        if (!email) return null;

        setIsLoading(true);
        try {
            const response = await fetch(`/api/early-access/status?email=${encodeURIComponent(email)}`);
            const data = await response.json();

            const newStatus = {
                hasEarlyAccess: data.hasEarlyAccess,
                status: data.status,
                email
            };

            if (data.hasEarlyAccess) {
                // Store in localStorage for persistence across sessions/pages
                localStorage.setItem('veefore_early_access_email', email);
                localStorage.setItem('veefore_early_access_status', 'approved');
            } else {
                // If explicitly rejected/waitlisted, clear approval but keep email ?
                // Or just don't store "approved"
                if (localStorage.getItem('veefore_early_access_email') === email) {
                    localStorage.removeItem('veefore_early_access_status');
                }
            }

            setStatus(newStatus);
            return newStatus;
        } catch (error) {
            console.error('Failed to check early access status:', error);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Initialize from localStorage
    useEffect(() => {
        const cachedEmail = localStorage.getItem('veefore_early_access_email');
        const cachedStatus = localStorage.getItem('veefore_early_access_status');

        if (cachedEmail) {
            if (cachedStatus === 'approved') {
                setStatus({
                    hasEarlyAccess: true,
                    status: 'early_access',
                    email: cachedEmail
                });
            }
            // Re-verify in background
            checkStatus(cachedEmail);
        }
    }, [checkStatus]);

    const clearEarlyAccess = useCallback(() => {
        localStorage.removeItem('veefore_early_access_email');
        localStorage.removeItem('veefore_early_access_status');
        setStatus({ hasEarlyAccess: false, status: null });
    }, []);

    return {
        isLoading,
        ...status,
        checkStatus,
        clearEarlyAccess
    };
}
