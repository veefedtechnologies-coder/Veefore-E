import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cookie, Shield, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'wouter';

interface CookiePreferences {
    essential: boolean;
    analytics: boolean;
    marketing: boolean;
    preferences: boolean;
}

const COOKIE_CONSENT_KEY = 'veefore_cookie_consent';
const COOKIE_PREFERENCES_KEY = 'veefore_cookie_preferences';

const getStoredConsent = (): string | null => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(COOKIE_CONSENT_KEY);
};

const getStoredPreferences = (): CookiePreferences | null => {
    if (typeof window === 'undefined') return null;
    const stored = localStorage.getItem(COOKIE_PREFERENCES_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch {
            return null;
        }
    }
    return null;
};

const saveConsent = (consent: string, preferences: CookiePreferences) => {
    localStorage.setItem(COOKIE_CONSENT_KEY, consent);
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(preferences));
    const expiryDate = new Date();
    expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    document.cookie = `cookie_consent=${consent}; expires=${expiryDate.toUTCString()}; path=/; SameSite=Lax`;
};

const CookieConsentBanner: React.FC = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [showPreferences, setShowPreferences] = useState(false);
    const [preferences, setPreferences] = useState<CookiePreferences>({
        essential: true,
        analytics: true,
        marketing: false,
        preferences: true,
    });

    useEffect(() => {
        const consent = getStoredConsent();
        if (!consent) {
            const timer = setTimeout(() => setIsVisible(true), 1000);
            return () => clearTimeout(timer);
        } else {
            const storedPrefs = getStoredPreferences();
            if (storedPrefs) setPreferences(storedPrefs);
        }
    }, []);

    const handleAcceptAll = () => {
        saveConsent('granted', { essential: true, analytics: true, marketing: true, preferences: true });
        setIsVisible(false);
    };

    const handleEssentialOnly = () => {
        saveConsent('essential-only', { essential: true, analytics: false, marketing: false, preferences: false });
        setIsVisible(false);
    };

    const handleSavePreferences = () => {
        const consent = preferences.analytics || preferences.marketing ? 'custom' : 'essential-only';
        saveConsent(consent, preferences);
        setIsVisible(false);
    };

    const togglePreference = (key: keyof CookiePreferences) => {
        if (key === 'essential') return;
        setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const cookieTypes = [
        { key: 'essential' as const, name: 'Essential', required: true },
        { key: 'analytics' as const, name: 'Analytics', required: false },
        { key: 'marketing' as const, name: 'Marketing', required: false },
        { key: 'preferences' as const, name: 'Preferences', required: false },
    ];

    if (!isVisible) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.2 }}
                className="fixed bottom-0 left-0 right-0 z-[9999]"
            >
                <div className="bg-[#0a0a0a]/98 backdrop-blur-xl border-t border-white/10">
                    <div className="h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />

                    <div className="px-3 py-2.5 sm:px-4 sm:py-2.5 lg:px-6 lg:py-2.5">
                        {/* Single row on desktop, stacked on mobile */}
                        <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 lg:gap-4">
                            {/* Text with icon */}
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Cookie className="w-4 h-4 text-blue-400 shrink-0" />
                                <p className="text-xs sm:text-sm text-white/70">
                                    <span className="font-medium text-white/90">We value your privacy.</span>
                                    <span className="hidden sm:inline"> We use cookies to personalize content, analyze traffic, and improve your experience.</span>
                                    <span className="sm:hidden"> Cookies help us improve your experience.</span>
                                    {' '}
                                    <Link href="/cookies" className="text-blue-400 hover:underline">Learn more</Link>
                                </p>
                            </div>

                            {/* Buttons - always horizontal, slim on mobile */}
                            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
                                <button
                                    onClick={() => setShowPreferences(!showPreferences)}
                                    className="flex items-center gap-0.5 sm:gap-1 px-2 py-[5px] sm:px-3 sm:py-1.5 rounded bg-white/5 border border-white/10 text-white/50 hover:text-white text-[10px] sm:text-xs transition-all"
                                >
                                    <span className="hidden sm:inline">Customize</span>
                                    <span className="sm:hidden">Options</span>
                                    {showPreferences ? <ChevronUp className="w-2.5 h-2.5 sm:w-3 sm:h-3" /> : <ChevronDown className="w-2.5 h-2.5 sm:w-3 sm:h-3" />}
                                </button>

                                <button
                                    onClick={handleEssentialOnly}
                                    className="px-2 py-[5px] sm:px-3 sm:py-1.5 rounded bg-white/5 border border-white/10 text-white/60 hover:text-white text-[10px] sm:text-xs font-medium transition-all"
                                >
                                    <span className="hidden sm:inline">Essential Only</span>
                                    <span className="sm:hidden">Essential</span>
                                </button>

                                <button
                                    onClick={handleAcceptAll}
                                    className="flex items-center gap-0.5 sm:gap-1 px-2 py-[5px] sm:px-3 sm:py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] sm:text-xs font-medium transition-all"
                                >
                                    <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                                    <span className="hidden sm:inline">Accept All</span>
                                    <span className="sm:hidden">Accept</span>
                                </button>
                            </div>
                        </div>

                        {/* Collapsible preferences */}
                        <AnimatePresence>
                            {showPreferences && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.15 }}
                                    className="overflow-hidden"
                                >
                                    <div className="pt-2.5 mt-2.5 border-t border-white/5">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {cookieTypes.map((cookie) => (
                                                <button
                                                    key={cookie.key}
                                                    onClick={() => togglePreference(cookie.key)}
                                                    disabled={cookie.required}
                                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-all ${preferences[cookie.key]
                                                        ? 'bg-blue-500/15 border border-blue-500/30 text-blue-300'
                                                        : 'bg-white/[0.03] border border-white/10 text-white/50'
                                                        } ${cookie.required ? 'opacity-60' : 'hover:border-white/20'}`}
                                                >
                                                    <span>{cookie.name}</span>
                                                    {cookie.required ? (
                                                        <span className="text-[9px] bg-blue-500/30 px-1 rounded">Required</span>
                                                    ) : (
                                                        <div className={`w-5 h-3 rounded-full flex items-center px-0.5 ${preferences[cookie.key] ? 'bg-blue-500' : 'bg-white/20'
                                                            }`}>
                                                            <motion.div
                                                                animate={{ x: preferences[cookie.key] ? 8 : 0 }}
                                                                className="w-2 h-2 rounded-full bg-white"
                                                            />
                                                        </div>
                                                    )}
                                                </button>
                                            ))}

                                            <div className="flex-1" />

                                            <div className="hidden sm:flex items-center gap-2 text-[10px] text-white/30">
                                                <Shield className="w-3 h-3 text-green-400/50" />
                                                <span>GDPR Compliant</span>
                                            </div>

                                            <button
                                                onClick={handleSavePreferences}
                                                className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-all"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default CookieConsentBanner;
