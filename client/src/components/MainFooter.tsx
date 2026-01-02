import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { useWaitlist } from '../context/WaitlistContext';
import { Twitter, Instagram, Linkedin, ArrowRight, Sparkles, Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const MainFooter = () => {
    const [location, setLocation] = useLocation();
    const { openWaitlist } = useWaitlist();
    const [email, setEmail] = useState('');
    const [isSubscribed, setIsSubscribed] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const isActive = (path: string) => location === path;

    // Email validation regex (same as waitlist)
    const validateEmail = (email: string): boolean => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    // Check for disposable/temporary email domains
    const isDisposableEmail = (email: string): boolean => {
        const disposableDomains = [
            'tempmail.com', 'throwaway.com', 'mailinator.com', 'guerrillamail.com',
            'temp-mail.org', 'fakeinbox.com', '10minutemail.com', 'trashmail.com',
            'getairmail.com', 'yopmail.com', 'sharklasers.com', 'spam4.me'
        ];
        const domain = email.split('@')[1]?.toLowerCase();
        return disposableDomains.includes(domain);
    };

    const handleSubscribe = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        const trimmedEmail = email.trim().toLowerCase();

        // Validation: Empty email
        if (!trimmedEmail) {
            setError('Please enter your email address');
            return;
        }

        // Validation: Invalid email format
        if (!validateEmail(trimmedEmail)) {
            setError('Please enter a valid email address (e.g., name@example.com)');
            return;
        }

        // Validation: Disposable email
        if (isDisposableEmail(trimmedEmail)) {
            setError('Please use a permanent email address, not a disposable one');
            return;
        }

        // Validation: Minimum domain length
        const domain = trimmedEmail.split('@')[1];
        if (!domain || domain.length < 4 || !domain.includes('.')) {
            setError('Please enter a valid email domain');
            return;
        }

        setIsLoading(true);

        try {
            // Step 1: Check if email already exists
            let checkResponse;
            try {
                checkResponse = await fetch(`/api/early-access/check-email?email=${encodeURIComponent(trimmedEmail)}`);
            } catch (fetchError) {
                // Network error during check - continue with registration anyway
                console.warn('Could not verify email, proceeding with registration:', fetchError);
            }

            if (checkResponse) {
                if (checkResponse.status === 429) {
                    setError('Too many requests. Please wait a moment and try again.');
                    setIsLoading(false);
                    return;
                }

                if (checkResponse.ok) {
                    const checkData = await checkResponse.json();
                    if (checkData.exists) {
                        setError(checkData.message || 'This email is already on our list! Check your inbox for updates.');
                        setIsLoading(false);
                        return;
                    }
                }
            }

            // Step 2: Submit to newsletter/waitlist API
            const response = await fetch('/api/early-access/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: trimmedEmail,
                    name: 'Newsletter Subscriber',
                    source: 'footer_newsletter',
                    orgType: 'newsletter',
                }),
            });

            // Handle various HTTP status codes
            if (response.status === 400) {
                const data = await response.json();
                setError(data.message || 'Invalid email address. Please check and try again.');
                setIsLoading(false);
                return;
            }

            if (response.status === 409) {
                setError('This email is already subscribed. Check your inbox for updates!');
                setIsLoading(false);
                return;
            }

            if (response.status === 429) {
                setError('Too many subscription attempts. Please try again in a few minutes.');
                setIsLoading(false);
                return;
            }

            if (response.status >= 500) {
                setError('Our servers are busy. Please try again in a moment.');
                setIsLoading(false);
                return;
            }

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                setError(data.message || 'Something went wrong. Please try again.');
                setIsLoading(false);
                return;
            }

            const data = await response.json();

            if (data.success) {
                setIsSubscribed(true);
                setEmail('');
                setTimeout(() => setIsSubscribed(false), 5000);
            } else {
                setError(data.message || 'Could not complete subscription. Please try again.');
            }
        } catch (err) {
            console.error('Newsletter subscription error:', err);

            // Determine error type
            if (err instanceof TypeError && err.message.includes('fetch')) {
                setError('Unable to connect. Please check your internet connection.');
            } else if (err instanceof SyntaxError) {
                setError('Server returned an invalid response. Please try again.');
            } else {
                setError('An unexpected error occurred. Please try again later.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    // Clear error when user starts typing
    const handleEmailChange = (value: string) => {
        setEmail(value);
        if (error) setError('');
    };

    const footerLinks = {
        product: [
            { name: 'Features', path: '/features' },
            { name: 'Pricing', path: '/pricing' },
            { name: 'Changelog', path: '/changelog' },
        ],
        company: [
            { name: 'About Us', path: '/about' },
            { name: 'Blog', path: '/blog' },
            { name: 'Careers', path: '/careers' },
            { name: 'Contact', path: '/contact' },
        ],
        resources: [
            { name: 'Help Center', path: '/help' },
            { name: 'Community', path: '/community' },
            { name: 'Status', path: '/status' },
        ],
        legal: [
            { name: 'Privacy Policy', path: '/privacy-policy' },
            { name: 'Terms of Service', path: '/terms-of-service' },
            { name: 'Security', path: '/security' },
            { name: 'Cookie Policy', path: '/cookies' },
            { name: 'GDPR', path: '/gdpr' },
        ],
    };

    const socialLinks = [
        { icon: Twitter, href: 'https://x.com/Veefore_inc', label: 'Twitter' },
        { icon: Instagram, href: 'https://www.instagram.com/veefore_inc/', label: 'Instagram' },
        { icon: Linkedin, href: 'https://linkedin.com/company/veefore', label: 'LinkedIn' },
    ];

    return (
        <footer className="relative bg-[#030303] text-white overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[150px]" />
                <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/5 rounded-full blur-[150px]" />
            </div>

            {/* Top gradient border */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

            {/* Main CTA Section */}
            <div className="relative z-10 py-10 sm:py-20 px-4 sm:px-6">
                <div className="max-w-4xl mx-auto text-center">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-white/10 mb-6">
                        <Sparkles className="w-4 h-4 text-blue-400" />
                        <span className="text-sm font-medium text-white/70">Join 500+ creators on the waitlist</span>
                    </div>
                    <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold mb-4 leading-tight">
                        Ready to <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">transform</span> your growth?
                    </h2>
                    <p className="text-white/50 text-base sm:text-lg max-w-2xl mx-auto mb-8">
                        Be among the first to experience AI-powered social media automation. Limited beta spots available.
                    </p>
                    <button
                        onClick={openWaitlist}
                        className="group inline-flex items-center gap-2 px-8 py-4 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold text-lg transition-all duration-300 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
                    >
                        Join the Waitlist
                        <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

            {/* Main Footer Content */}
            <div className="relative z-10 py-8 sm:py-16 px-4 sm:px-6">
                <div className="max-w-7xl mx-auto">
                    <div className="grid grid-cols-2 md:grid-cols-6 lg:grid-cols-12 gap-x-4 gap-y-8 lg:gap-12">

                        {/* Brand Column */}
                        <div className="col-span-2 md:col-span-6 lg:col-span-4 space-y-6">
                            <div className="flex items-center gap-1 group cursor-pointer" onClick={() => setLocation('/')}>
                                <img src="/veefore.svg" alt="Veefore" className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 object-contain" />
                                <span className="text-lg sm:text-xl md:text-2xl font-bold -ml-1.5 tracking-tight bg-gradient-to-r from-white to-white/80 bg-clip-text text-transparent group-hover:from-blue-400 group-hover:to-purple-400 transition-all duration-300">eefore</span>
                            </div>
                            <p className="text-white/50 text-sm leading-relaxed max-w-xs">
                                AI-powered Growth Engine that actively increases engagement, reach, and visibility for creators — automatically.
                            </p>

                            {/* Social Links */}
                            <div className="flex items-center gap-3">
                                {socialLinks.map(({ icon: Icon, href, label }) => (
                                    <a
                                        key={label}
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group/social p-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 hover:bg-white/10 text-white/50 hover:text-white transition-all duration-300"
                                        aria-label={label}
                                    >
                                        <Icon className="w-4 h-4" />
                                    </a>
                                ))}
                            </div>

                            {/* Contact Info */}
                            <div className="space-y-2 pt-2">
                                <a href="mailto:support@veefore.com" className="flex items-center gap-2 text-sm text-white/40 hover:text-white/70 transition-colors">
                                    <Mail className="w-4 h-4" />
                                    support@veefore.com
                                </a>
                            </div>
                        </div>

                        {/* Product Links */}
                        <div className="col-span-1 md:col-span-2 lg:col-span-2">
                            <h4 className="font-semibold text-white text-sm mb-4">Product</h4>
                            <ul className="space-y-2 sm:space-y-3">
                                {footerLinks.product.map((link) => (
                                    <li key={link.path}>
                                        <Link
                                            href={link.path}
                                            className={`text-sm transition-colors duration-200 ${isActive(link.path) ? 'text-blue-400' : 'text-white/50 hover:text-white'}`}
                                        >
                                            {link.name}
                                        </Link>
                                    </li>
                                ))}
                                <li>
                                    <button
                                        onClick={openWaitlist}
                                        className="text-sm text-white/50 hover:text-white transition-colors duration-200"
                                    >
                                        Join Waitlist
                                    </button>
                                </li>
                            </ul>
                        </div>

                        {/* Company Links */}
                        <div className="col-span-1 md:col-span-2 lg:col-span-2">
                            <h4 className="font-semibold text-white text-sm mb-4">Company</h4>
                            <ul className="space-y-2 sm:space-y-3">
                                {footerLinks.company.map((link) => (
                                    <li key={link.path}>
                                        <Link
                                            href={link.path}
                                            className={`text-sm transition-colors duration-200 ${isActive(link.path) ? 'text-blue-400' : 'text-white/50 hover:text-white'}`}
                                        >
                                            {link.name}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Resources Links */}
                        <div className="col-span-1 md:col-span-2 lg:col-span-2">
                            <h4 className="font-semibold text-white text-sm mb-4">Resources</h4>
                            <ul className="space-y-2 sm:space-y-3">
                                {footerLinks.resources.map((link) => (
                                    <li key={link.path}>
                                        <Link
                                            href={link.path}
                                            className={`text-sm transition-colors duration-200 ${isActive(link.path) ? 'text-blue-400' : 'text-white/50 hover:text-white'}`}
                                        >
                                            {link.name}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Legal Links */}
                        <div className="col-span-1 md:col-span-2 lg:col-span-2">
                            <h4 className="font-semibold text-white text-sm mb-4">Legal</h4>
                            <ul className="space-y-2 sm:space-y-3">
                                {footerLinks.legal.map((link) => (
                                    <li key={link.path}>
                                        <Link
                                            href={link.path}
                                            className={`text-sm transition-colors duration-200 ${isActive(link.path) ? 'text-blue-400' : 'text-white/50 hover:text-white'}`}
                                        >
                                            {link.name}
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Newsletter Section */}
                    <div className="mt-8 sm:mt-16 p-5 sm:p-8 rounded-2xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/10 relative overflow-hidden">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 via-transparent to-purple-500/5 pointer-events-none" />
                        <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-6">
                            <div className="text-center lg:text-left">
                                <h3 className="text-lg sm:text-xl font-bold mb-1">Stay in the loop</h3>
                                <p className="text-white/50 text-sm sm:text-base">Get growth tips and VeeFore updates in your inbox</p>
                            </div>
                            <form onSubmit={handleSubscribe} className="flex flex-col w-full lg:w-auto gap-2">
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <div className="relative flex-1 sm:min-w-[280px]">
                                        {/* Dynamic icon based on state */}
                                        {isSubscribed ? (
                                            <CheckCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />
                                        ) : error ? (
                                            <AlertCircle className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-red-400" />
                                        ) : (
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                                        )}
                                        <input
                                            type="email"
                                            name="email"
                                            autoComplete="email"
                                            placeholder="Enter your email"
                                            value={email}
                                            onChange={(e) => handleEmailChange(e.target.value)}
                                            disabled={isLoading || isSubscribed}
                                            className={`w-full pl-11 pr-4 py-3 rounded-xl bg-black/50 text-white placeholder-white/30 outline-none transition-all text-sm ${error
                                                ? 'border border-red-500/50 focus:border-red-500/70 focus:ring-2 focus:ring-red-500/20'
                                                : isSubscribed
                                                    ? 'border border-green-500/50'
                                                    : 'border border-white/10 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20'
                                                } ${isLoading || isSubscribed ? 'opacity-60 cursor-not-allowed' : ''}`}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={isLoading || isSubscribed}
                                        className={`px-6 py-3 rounded-xl font-medium text-sm transition-all duration-300 flex items-center justify-center gap-2 min-w-[120px] ${isSubscribed
                                            ? 'bg-green-600 text-white cursor-default'
                                            : isLoading
                                                ? 'bg-blue-600/50 text-white cursor-wait'
                                                : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white'
                                            }`}
                                    >
                                        {isLoading ? (
                                            <>
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                                <span>Subscribing...</span>
                                            </>
                                        ) : isSubscribed ? (
                                            <>
                                                <CheckCircle className="w-4 h-4" />
                                                <span>Subscribed!</span>
                                            </>
                                        ) : (
                                            'Subscribe'
                                        )}
                                    </button>
                                </div>
                                {/* Error Message */}
                                {error && (
                                    <p className="text-red-400 text-xs flex items-center gap-1 mt-1 lg:mt-0">
                                        <span className="inline-block w-1 h-1 bg-red-400 rounded-full"></span>
                                        {error}
                                    </p>
                                )}
                            </form>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Bar */}
            <div className="relative z-10 border-t border-white/10">
                <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <p className="text-xs sm:text-sm text-white/40 text-center sm:text-left">
                            © {new Date().getFullYear()} Veefed Technologies Pvt. Ltd. All rights reserved.
                        </p>
                        <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
                            <Link href="/privacy-policy" className="text-xs sm:text-sm text-white/40 hover:text-white transition-colors">Privacy</Link>
                            <Link href="/terms-of-service" className="text-xs sm:text-sm text-white/40 hover:text-white transition-colors">Terms</Link>
                            <Link href="/cookies" className="text-xs sm:text-sm text-white/40 hover:text-white transition-colors">Cookies</Link>
                            <Link href="/gdpr" className="text-xs sm:text-sm text-white/40 hover:text-white transition-colors">GDPR</Link>
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default MainFooter;
