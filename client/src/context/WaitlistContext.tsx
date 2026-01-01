import React, { createContext, useContext, useState, useEffect } from 'react';

interface WaitlistContextType {
    isWaitlistOpen: boolean;
    openWaitlist: () => void;
    closeWaitlist: () => void;
}

const WaitlistContext = createContext<WaitlistContextType | undefined>(undefined);

export const WaitlistProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

    // Helper to handle external links/parameters opening the waitlist
    useEffect(() => {
        // Check for 'open-waitlist' query param
        const params = new URLSearchParams(window.location.search);
        if (params.get('action') === 'join-waitlist' || window.location.hash === '#beta-signup') {
            setIsWaitlistOpen(true);
        }
    }, []);

    const openWaitlist = () => setIsWaitlistOpen(true);
    const closeWaitlist = () => setIsWaitlistOpen(false);

    return (
        <WaitlistContext.Provider value={{ isWaitlistOpen, openWaitlist, closeWaitlist }}>
            {children}
        </WaitlistContext.Provider>
    );
};

export const useWaitlist = () => {
    const context = useContext(WaitlistContext);
    if (context === undefined) {
        throw new Error('useWaitlist must be used within a WaitlistProvider');
    }
    return context;
};
