import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Menu, X, ChevronRight } from 'lucide-react'
import { Link, useLocation } from 'wouter'
import { useWaitlist } from '../context/WaitlistContext'

interface MainNavigationProps {
    onNavigate?: (page: string) => void
}

export const MainNavigation: React.FC<MainNavigationProps> = ({ onNavigate }) => {
    const [isScrolled, setIsScrolled] = useState(false)
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [location, setLocation] = useLocation()
    const { openWaitlist } = useWaitlist()

    // Handle scroll effect
    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 20)
        }
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    // Helper for navigation
    const handleNav = (path: string) => {
        setMobileMenuOpen(false)
        if (path.startsWith('#')) {
            // For hash links, if we are not on home, go home first
            if (location !== '/' && location !== '/landing') {
                setLocation('/' + path)
            } else {
                // Just scroll
                const element = document.querySelector(path)
                element?.scrollIntoView({ behavior: 'smooth' })
            }
        } else {
            setLocation(path)
        }

        if (onNavigate && !path.startsWith('/')) {
            // Legacy support if needed, but mostly wouter handles it
        }
    }

    const isHome = location === '/' || location === '/landing'

    return (
        <motion.nav
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            className="fixed top-0 left-0 right-0 z-50"
        >
            <div className={`transition-all duration-300 ${isScrolled ? 'mx-3 sm:mx-4 md:mx-6 lg:mx-auto lg:max-w-5xl mt-2 sm:mt-2 md:mt-3' : ''}`}>
                <div className={`mx-auto px-3 sm:px-4 md:px-6 py-2 sm:py-3 md:py-4 transition-all duration-300 ${isScrolled
                    ? 'max-w-5xl bg-black/70 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-white/10'
                    : 'max-w-7xl bg-transparent'
                    }`}>
                    <div className="flex items-center justify-between">
                        {/* Logo */}
                        <div className="flex items-center gap-1 group cursor-pointer" onClick={() => setLocation('/')}>
                            <img src="/veefore.svg" alt="Veefore" className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 object-contain" />
                            <span className="text-lg sm:text-xl md:text-2xl font-bold -ml-1.5 tracking-tight group-hover:text-white/90 transition-colors">eefore</span>
                        </div>

                        {/* Desktop Nav */}
                        <div className="hidden md:flex items-center space-x-6 lg:space-x-8">
                            <Link href="/features" className="text-sm text-white/60 hover:text-white transition-colors cursor-pointer">Features</Link>
                            <a href={isHome ? "#how-it-works" : "/#how-it-works"} className="text-sm text-white/60 hover:text-white transition-colors cursor-pointer">How it Works</a>
                            <a href={isHome ? "#pricing" : "/#pricing"} className="text-sm text-white/60 hover:text-white transition-colors cursor-pointer">Pricing</a>
                            <a href={isHome ? "#faq" : "/#faq"} className="text-sm text-white/60 hover:text-white transition-colors cursor-pointer">FAQ</a>
                        </div>

                        {/* CTA Buttons */}
                        <div className="hidden md:flex items-center space-x-3 lg:space-x-4">
                            <button
                                onClick={openWaitlist}
                                className="px-3 lg:px-4 py-1.5 lg:py-2 text-xs lg:text-sm font-medium rounded-full bg-white text-black hover:bg-white/90 transition-colors cursor-pointer"
                            >
                                Join Waitlist
                            </button>
                        </div>

                        {/* Mobile Menu Button */}
                        <button
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            className="md:hidden p-1.5 sm:p-2 rounded-lg hover:bg-white/10"
                        >
                            {mobileMenuOpen ? <X className="w-5 h-5 sm:w-6 sm:h-6" /> : <Menu className="w-5 h-5 sm:w-6 sm:h-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            <AnimatePresence>
                {mobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: '100%' }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: '100%' }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="md:hidden fixed inset-0 z-[60] bg-[#030303] overflow-y-auto"
                    >
                        {/* Mobile Menu Header */}
                        <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
                            <div className="flex items-center gap-1" onClick={() => handleNav('/')}>
                                <img src="/veefore.svg" alt="Veefore" className="w-8 h-8 object-contain" />
                                <span className="text-xl font-bold -ml-1.5 tracking-tight text-white">eefore</span>
                            </div>
                            <button
                                onClick={() => setMobileMenuOpen(false)}
                                className="p-2 -mr-2 text-white/60 hover:text-white"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Mobile Menu Content */}
                        <div className="px-6 py-8 flex flex-col h-[calc(100vh-80px)]">
                            {/* Primary Actions */}
                            <div className="flex flex-col space-y-4 mb-8">
                                <button
                                    onClick={() => { setMobileMenuOpen(false); openWaitlist(); }}
                                    className="w-full py-4 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-lg shadow-lg shadow-purple-500/20 text-center"
                                >
                                    Join Waitlist
                                </button>
                            </div>

                            {/* Navigation Links as Cards */}
                            <div className="space-y-3">
                                {[
                                    { label: 'Features', href: '/features' },
                                    { label: 'How it Works', href: isHome ? '#how-it-works' : '/#how-it-works' },
                                    { label: 'Pricing', href: isHome ? '#pricing' : '/#pricing' },
                                    { label: 'FAQ', href: isHome ? '#faq' : '/#faq' }
                                ].map((item) => (
                                    <a
                                        key={item.label}
                                        href={item.href}
                                        onClick={() => setMobileMenuOpen(false)}
                                        className="flex items-center justify-between w-full p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 transition-all active:scale-[0.98]"
                                    >
                                        <span className="font-semibold text-white/90">{item.label}</span>
                                        <ChevronRight className="w-5 h-5 text-white/40" />
                                    </a>
                                ))}
                            </div>

                            <div className="mt-auto pt-8 pb-4 text-center">
                                <p className="text-white/20 text-xs">© 2025 Veefore Inc.</p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.nav>
    )
}
