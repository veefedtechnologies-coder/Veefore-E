import React, { useState } from 'react';

import { Twitter, Instagram, Linkedin } from 'lucide-react';

const MainFooter = () => {
    // Basic location check for highlighting, but navigation is forced
    const location = window.location.pathname;
    const [email, setEmail] = useState('');

    const isActive = (path: string) => location === path;

    const handleNav = (e: React.MouseEvent, path: string) => {
        e.preventDefault();
        // Force full page navigation to ensure correct rendering
        window.location.assign(path);
    };

    const handleSubscribe = (e: React.FormEvent) => {
        e.preventDefault();
        // Placeholder for newsletter subscription logic
        console.log('Subscribing email:', email);
        setEmail('');
        alert('Thanks for subscribing!');
    };

    const footerLinks = {
        product: [
            { name: 'Features', path: '/features' },
            { name: 'Pricing', path: '/pricing' },
            { name: 'Free Trial', path: '/waitlist' }, // Assuming free trial maps to waitlist or similar
            { name: 'Changelog', path: '/changelog' },
        ],
        company: [
            { name: 'About', path: '/about' },
            { name: 'Blog', path: '/blog' },
            { name: 'Careers', path: '/careers' },
            { name: 'Contact', path: '/contact' },
        ],
        legal: [
            { name: 'Privacy', path: '/privacy-policy' },
            { name: 'Terms', path: '/terms-of-service' },
            { name: 'Security', path: '/security' },
            { name: 'GDPR', path: '/gdpr' },
        ],
    };

    return (
        <footer className="py-16 px-4 sm:px-6 border-t border-white/10 bg-[#030303] text-white">
            <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-12 mb-16">

                    {/* Brand Column */}
                    <div className="md:col-span-4 lg:col-span-5 space-y-6">
                        <a href="/" className="flex items-center space-x-2" onClick={(e) => handleNav(e, '/')}>
                            <img src="/veefore-logo.png" alt="Veefore" className="w-8 h-8 object-contain" />
                            <span className="text-xl font-bold">Veefore</span>
                        </a>
                        <p className="text-white/50 max-w-sm leading-relaxed">
                            AI-powered Growth Engine that actively increases engagement, reach, and visibility for creators — automatically.
                        </p>
                        <div className="flex space-x-4">
                            <a href="#" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                                <Twitter className="w-5 h-5" />
                            </a>
                            <a href="#" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                                <Instagram className="w-5 h-5" />
                            </a>
                            <a href="#" className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-colors">
                                <Linkedin className="w-5 h-5" />
                            </a>
                        </div>
                    </div>

                    {/* Links Columns */}
                    <div className="md:col-span-8 lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8">
                        {/* Product */}
                        <div>
                            <h4 className="font-semibold text-white/40 tracking-wider text-sm uppercase mb-6">Product</h4>
                            <ul className="space-y-4">
                                {footerLinks.product.map((link) => (
                                    <li key={link.path}>
                                        <a
                                            href={link.path}
                                            className={`text-sm transition-colors cursor-pointer block ${isActive(link.path) ? 'text-blue-400 font-medium' : 'text-white/60 hover:text-white'}`}
                                            onClick={(e) => handleNav(e, link.path)}
                                        >
                                            {link.name}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Company */}
                        <div>
                            <h4 className="font-semibold text-white/40 tracking-wider text-sm uppercase mb-6">Company</h4>
                            <ul className="space-y-4">
                                {footerLinks.company.map((link) => (
                                    <li key={link.path}>
                                        <a
                                            href={link.path}
                                            className={`text-sm transition-colors cursor-pointer block ${isActive(link.path) ? 'text-blue-400 font-medium' : 'text-white/60 hover:text-white'}`}
                                            onClick={(e) => handleNav(e, link.path)}
                                        >
                                            {link.name}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Legal */}
                        <div>
                            <h4 className="font-semibold text-white/40 tracking-wider text-sm uppercase mb-6">Legal</h4>
                            <ul className="space-y-4">
                                {footerLinks.legal.map((link) => (
                                    <li key={link.path}>
                                        <a
                                            href={link.path}
                                            className={`text-sm transition-colors cursor-pointer block ${isActive(link.path) ? 'text-blue-400 font-medium' : 'text-white/60 hover:text-white'}`}
                                            onClick={(e) => handleNav(e, link.path)}
                                        >
                                            {link.name}
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Newsletter Section */}
                <div className="mb-16 p-8 rounded-3xl bg-white/[0.03] border border-white/10 relative overflow-hidden">
                    <div className="absolute inset-0 bg-blue-500/5 blur-3xl pointer-events-none" />
                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                        <div className="text-center md:text-left">
                            <h3 className="text-xl font-bold mb-2">Stay in the loop</h3>
                            <p className="text-white/50">Get growth tips and Veefore updates in your inbox</p>
                        </div>
                        <form onSubmit={handleSubscribe} className="flex w-full md:w-auto max-w-md gap-2">
                            <div className="relative flex-1">
                                <input
                                    type="email"
                                    placeholder="Enter your email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 text-white placeholder-white/30 outline-none transition-all"
                                    required
                                />
                                <MailIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 pointer-events-none" />
                            </div>
                            <button
                                type="submit"
                                className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
                            >
                                Subscribe
                            </button>
                        </form>
                    </div>
                </div>

                {/* Bottom Bar */}
                <div className="pt-8 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <p className="text-sm text-white/40">
                        © {new Date().getFullYear()} Veefed Technologies Pvt. Ltd. All rights reserved.
                    </p>
                    <div className="flex gap-6 text-sm text-white/40">
                        <a href="/privacy-policy" className="hover:text-white transition-colors cursor-pointer" onClick={(e) => handleNav(e, '/privacy-policy')}>Privacy Policy</a>
                        <a href="/terms-of-service" className="hover:text-white transition-colors cursor-pointer" onClick={(e) => handleNav(e, '/terms-of-service')}>Terms of Service</a>
                        <a href="/gdpr" className="hover:text-white transition-colors cursor-pointer" onClick={(e) => handleNav(e, '/gdpr')}>GDPR</a>
                    </div>
                </div>
            </div>
        </footer>
    );
};

const MailIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <rect width="20" height="16" x="2" y="4" rx="2" />
        <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
    </svg>
)

export default MainFooter;
