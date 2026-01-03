import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useWaitlist } from '../../context/WaitlistContext';
import { useToast } from '@/hooks/use-toast';
import {
    ChevronRight, Check, ChevronDown,
    User, Mail, Building2, Users, Rocket,
    Globe, Layers, Clock, Target, MessageSquare,
    Briefcase, BarChart3, ShieldCheck, Wallet,
    ArrowRight, Search, PieChart, Star, Loader2, AlertTriangle
} from 'lucide-react';

// ============================================
// TYPES
// ============================================
type OrgType = 'solo' | 'startup' | 'agency' | 'enterprise';

interface WaitlistFormData {
    name: string;
    email: string;
    orgType: OrgType | null;
    primaryPlatform?: string;
    contentNiche?: string;
    creatorAudienceSize?: string;
    postingFrequency?: string;
    startupStage?: string;
    startupGrowthChannel?: string;
    startupTeamSize?: string;
    agencyClientCount?: string;
    agencyServices?: string;
    agencyNiche?: string;
    agencyMonthlyOutput?: string;
    enterpriseIndustry?: string;
    enterpriseDepartment?: string;
    enterpriseSecurity?: string;
    enterpriseBudget?: string;
    timeline?: string;
    referralSource?: string;
    primaryGoal?: string;
    painPoints: string;
}

interface DropdownOption {
    value: string;
    label: string;
}

// ============================================
// CUSTOM DROPDOWN - Enhanced Design
// ============================================
interface CustomDropdownProps {
    label: string;
    value?: string;
    onChange: (value: string) => void;
    options: DropdownOption[];
    icon: React.ElementType;
    placeholder?: string;
    required?: boolean;
    error?: string;
}

const CustomDropdown: React.FC<CustomDropdownProps> = ({
    label, value, onChange, options, placeholder = "Select...", required = true, error
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Calculate menu position when opening
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setMenuPosition({
                top: rect.bottom + 4,
                left: rect.left,
                width: rect.width
            });
        }
    }, [isOpen]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (buttonRef.current && !buttonRef.current.contains(target) &&
                menuRef.current && !menuRef.current.contains(target)) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }
    }, [isOpen]);

    // Close on escape
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, []);

    const selectedOption = options.find(opt => opt.value === value);

    return (
        <div className="space-y-1 md:space-y-2">
            <label className="text-[10px] md:text-xs font-medium text-white/60 block uppercase tracking-wider">
                {label} {required && <span className="text-red-400">*</span>}
            </label>
            <div className="relative">
                <button
                    ref={buttonRef}
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    className="w-full h-10 md:h-12 px-3 md:px-4 pr-8 rounded-lg md:rounded-xl text-left text-xs md:text-sm transition-all duration-200 hover:bg-white/[0.08]"
                    style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        border: error ? '1px solid rgba(239, 68, 68, 0.5)' : (isFocused || isOpen ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)'),
                        color: selectedOption ? 'white' : 'rgba(255, 255, 255, 0.4)',
                        outline: 'none',
                    }}
                >
                    {selectedOption ? selectedOption.label : placeholder}
                </button>
                <ChevronDown className={`absolute right-2 md:right-3 top-1/2 -translate-y-1/2 w-3 h-3 md:w-4 md:h-4 text-white/40 pointer-events-none transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
            </div>

            {/* Portal dropdown menu - renders at document body level */}
            {isOpen && ReactDOM.createPortal(
                <div
                    ref={menuRef}
                    className="fixed z-[9999] rounded-lg overflow-hidden"
                    style={{
                        top: menuPosition.top,
                        left: menuPosition.left,
                        width: menuPosition.width,
                        backgroundColor: '#0a0a0c',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
                    }}
                >
                    {options.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            onClick={() => { onChange(option.value); setIsOpen(false); }}
                            className="w-full px-3 py-2 text-left text-xs md:text-sm text-white transition-all flex items-center gap-2 hover:bg-white/10"
                            style={{
                                backgroundColor: value === option.value ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                                border: 'none',
                                outline: 'none',
                            }}
                        >
                            {value === option.value && <Check className="w-3 h-3 text-indigo-400" />}
                            <span className={value === option.value ? 'text-indigo-300' : ''}>{option.label}</span>
                        </button>
                    ))}
                </div>,
                document.body
            )}
            {error && <p className="text-red-400 text-[10px] md:text-xs mt-1">{error}</p>}
        </div>
    );
};

// ============================================
// CUSTOM INPUT - Enhanced Design
// ============================================
interface CustomInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    icon: React.ElementType;
    placeholder?: string;
    type?: string;
    autoFocus?: boolean;
    autoComplete?: string;
    name?: string;
    error?: string;
    required?: boolean;
}

const CustomInput: React.FC<CustomInputProps> = ({
    label, value, onChange, icon: Icon, placeholder, type = "text", autoFocus, autoComplete, name, error, required
}) => {
    const [isFocused, setIsFocused] = useState(false);
    const hasError = !!error;

    return (
        <div className="space-y-1 md:space-y-2">
            <label className="text-[10px] md:text-xs font-medium text-white/60 block uppercase tracking-wider">
                {label} {required && <span className="text-red-400">*</span>}
            </label>
            <div className="relative group">
                <div className={`absolute left-2 md:left-3 top-1/2 -translate-y-1/2 w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl flex items-center justify-center transition-all duration-200 ${hasError ? 'bg-red-500/20' : isFocused ? 'bg-indigo-500/20 scale-110' : 'bg-white/5'}`}>
                    <Icon className={`w-4 h-4 md:w-5 md:h-5 transition-colors ${hasError ? 'text-red-400' : isFocused ? 'text-indigo-400' : 'text-white/40'}`} />
                </div>
                <input
                    type={type}
                    name={name}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder={placeholder}
                    autoFocus={autoFocus}
                    autoComplete={autoComplete}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    className="w-full h-12 md:h-14 pl-12 md:pl-16 pr-4 rounded-lg md:rounded-xl text-white text-sm md:text-base transition-all duration-200 placeholder:text-white/25"
                    style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        border: hasError ? '1px solid rgba(239, 68, 68, 0.5)' : isFocused ? '1px solid rgba(99, 102, 241, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                        boxShadow: hasError ? '0 0 20px rgba(239, 68, 68, 0.1)' : isFocused ? '0 0 20px rgba(99, 102, 241, 0.15)' : 'none',
                        outline: 'none',
                    }}
                />
            </div>
            {error && (
                <p className="text-red-400 text-[10px] md:text-xs flex items-center gap-1 mt-1">
                    <span className="inline-block w-1 h-1 bg-red-400 rounded-full"></span>
                    {error}
                </p>
            )}
        </div>
    );
};

// ============================================
// FLOATING PARTICLES COMPONENT - Disabled to prevent flickering
// ============================================
const FloatingParticles = () => null;

// ============================================
// MAIN MODAL COMPONENT
// ============================================
export const WaitlistModal = () => {
    const { toast } = useToast();
    const { isWaitlistOpen, closeWaitlist } = useWaitlist();
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [networkError, setNetworkError] = useState<string | null>(null);

    const [formData, setFormData] = useState<WaitlistFormData>({
        name: '',
        email: '',
        orgType: null,
        painPoints: ''
    });

    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (isWaitlistOpen) {
            setStep(1);
            setErrors({});
        }
    }, [isWaitlistOpen]);

    const handleInputChange = (field: keyof WaitlistFormData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Clear error when user types
        if (errors[field]) {
            setErrors(prev => {
                const newErrors = { ...prev };
                delete newErrors[field];
                return newErrors;
            });
        }
    };

    const nextStep = async () => {
        console.log('[Waitlist] nextStep called, current step:', step);
        setIsValidating(true);
        setNetworkError(null);

        try {
            const isValid = await validateStep(step);
            console.log('[Waitlist] validateStep returned:', isValid);
            if (!isValid) {
                console.log('[Waitlist] Validation failed, not advancing');
                setIsValidating(false);
                return;
            }
            setStep(prev => prev + 1);
            console.log('[Waitlist] Advanced to step:', step + 1);
        } catch (error) {
            console.error('[Waitlist] nextStep error:', error);
            setNetworkError('Connection issue. Please check your internet and try again.');
        } finally {
            setIsValidating(false);
        }
    };

    const prevStep = () => setStep(prev => prev - 1);

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

    const validateStep = async (currentStep: number): Promise<boolean> => {
        const newErrors: Record<string, string> = {};
        let isValid = true;

        if (currentStep === 1) {
            const trimmedName = formData.name.trim();
            const trimmedEmail = formData.email.trim().toLowerCase();

            // Name validation
            if (!trimmedName) {
                newErrors.name = "Please enter your name";
                isValid = false;
            } else if (trimmedName.length < 2) {
                newErrors.name = "Name must be at least 2 characters";
                isValid = false;
            }

            // Email validation - comprehensive checks
            if (!trimmedEmail) {
                newErrors.email = "Please enter your email address";
                isValid = false;
            } else {
                // Basic format check with stricter regex
                // Requires: alphanumeric/dots/hyphens before @, then domain with letters/numbers, then TLD with letters only
                const emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;

                if (!emailRegex.test(trimmedEmail)) {
                    newErrors.email = "Please enter a valid email address (e.g., name@company.com)";
                    isValid = false;
                } else if (isDisposableEmail(trimmedEmail)) {
                    newErrors.email = "Please use a permanent email address, not a disposable one";
                    isValid = false;
                } else {
                    // Additional domain checks
                    const domain = trimmedEmail.split('@')[1];
                    const domainParts = domain.split('.');
                    const tld = domainParts[domainParts.length - 1];

                    // Check TLD is valid (2-10 chars, letters only)
                    if (tld.length < 2 || tld.length > 10 || !/^[a-zA-Z]+$/.test(tld)) {
                        newErrors.email = "Please enter a valid email domain";
                        isValid = false;
                    } else if (domain.length < 4) {
                        newErrors.email = "Please enter a valid email domain";
                        isValid = false;
                    } else {
                        // Check if email already exists on waitlist (with 5s timeout)
                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 15000);

                            const response = await fetch(
                                `/api/early-access/check-email?email=${encodeURIComponent(trimmedEmail)}`,
                                { signal: controller.signal }
                            );

                            clearTimeout(timeoutId);

                            if (response.status === 429) {
                                newErrors.email = "Too many requests. Please wait a moment and try again.";
                                isValid = false;
                            } else if (response.ok) {
                                const data = await response.json();
                                if (data.exists) {
                                    newErrors.email = data.message || "This email is already on the waitlist! Check your inbox for updates.";
                                    isValid = false;
                                }
                            }
                        } catch (error) {
                            // Re-throw error to be handled by nextStep (shows retry UI)
                            console.error('[Waitlist] Email check failed:', error);
                            throw error;
                        }
                    }
                }
            }
        }

        // Step 2: Profile type validation
        if (currentStep === 2 && !formData.orgType) {
            toast({ title: "Required", description: "Please select your profile type.", variant: "destructive" });
            return false;
        }

        // Step 3: Profile-specific fields validation
        if (currentStep === 3) {
            if (formData.orgType === 'solo') {
                if (!formData.primaryPlatform) { newErrors.primaryPlatform = "Required"; isValid = false; }
                if (!formData.contentNiche) { newErrors.contentNiche = "Required"; isValid = false; }
                if (!formData.creatorAudienceSize) { newErrors.creatorAudienceSize = "Required"; isValid = false; }
                if (!formData.postingFrequency) { newErrors.postingFrequency = "Required"; isValid = false; }
            } else if (formData.orgType === 'startup') {
                if (!formData.startupStage) { newErrors.startupStage = "Required"; isValid = false; }
                if (!formData.startupTeamSize) { newErrors.startupTeamSize = "Required"; isValid = false; }
                if (!formData.startupGrowthChannel) { newErrors.startupGrowthChannel = "Required"; isValid = false; }
                if (!formData.timeline) { newErrors.timeline = "Required"; isValid = false; }
            } else if (formData.orgType === 'agency') {
                if (!formData.agencyClientCount) { newErrors.agencyClientCount = "Required"; isValid = false; }
                if (!formData.agencyServices) { newErrors.agencyServices = "Required"; isValid = false; }
                if (!formData.agencyNiche) { newErrors.agencyNiche = "Required"; isValid = false; }
                if (!formData.agencyMonthlyOutput) { newErrors.agencyMonthlyOutput = "Required"; isValid = false; }
            } else if (formData.orgType === 'enterprise') {
                if (!formData.enterpriseIndustry) { newErrors.enterpriseIndustry = "Required"; isValid = false; }
                if (!formData.enterpriseDepartment) { newErrors.enterpriseDepartment = "Required"; isValid = false; }
                if (!formData.enterpriseSecurity) { newErrors.enterpriseSecurity = "Required"; isValid = false; }
                if (!formData.enterpriseBudget) { newErrors.enterpriseBudget = "Required"; isValid = false; }
            }
        }

        // Step 4: Use Case validation (Biggest Challenge is optional)
        if (currentStep === 4) {
            if (!formData.referralSource) { newErrors.referralSource = "Required"; isValid = false; }
            if (!formData.primaryGoal) { newErrors.primaryGoal = "Required"; isValid = false; }
            // painPoints (Biggest Challenge) is optional - no validation needed
        }

        setErrors(newErrors);
        return isValid;
    };

    const handleSubmit = async () => {
        // Validate Step 4 required fields before submitting
        const isValid = await validateStep(4);
        if (!isValid) {
            return; // Don't proceed if validation fails
        }

        setIsSubmitting(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 1500));
            const response = await fetch('/api/early-access/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: formData.name.trim(), email: formData.email.trim().toLowerCase(), role: formData.orgType, questionnaire: { ...formData } })
            });

            // Handle various HTTP status codes
            if (response.status === 400) {
                const data = await response.json().catch(() => ({}));
                toast({
                    title: "Invalid Data",
                    description: data.error || "Please check your information and try again.",
                    variant: "destructive"
                });
                return;
            }

            if (response.status === 409) {
                toast({
                    title: "Already Registered",
                    description: "This email is already on the waitlist. Check your inbox for updates!",
                    variant: "destructive"
                });
                return;
            }

            if (response.status === 429) {
                toast({
                    title: "Too Many Requests",
                    description: "Please wait a few minutes and try again.",
                    variant: "destructive"
                });
                return;
            }

            if (response.status >= 500) {
                toast({
                    title: "Server Busy",
                    description: "Our servers are busy. Please try again in a moment.",
                    variant: "destructive"
                });
                return;
            }

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                toast({
                    title: "Registration Failed",
                    description: data.error || "Something went wrong. Please try again.",
                    variant: "destructive"
                });
                return;
            }

            const data = await response.json();

            if (data.success !== false) {
                setStep(5);
            } else {
                toast({
                    title: "Registration Failed",
                    description: data.error || "Could not complete registration. Please try again.",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('Submission error:', error);

            // Determine error type
            if (error instanceof TypeError && error.message.includes('fetch')) {
                toast({
                    title: "Connection Error",
                    description: "Unable to connect. Please check your internet connection.",
                    variant: "destructive"
                });
            } else if (error instanceof SyntaxError) {
                toast({
                    title: "Server Error",
                    description: "Server returned an invalid response. Please try again.",
                    variant: "destructive"
                });
            } else {
                toast({
                    title: "Unexpected Error",
                    description: "An unexpected error occurred. Please try again later.",
                    variant: "destructive"
                });
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    // ============================================
    // STEP CONTENT RENDERER
    // ============================================
    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <div className="space-y-4 md:space-y-6">
                        {/* Header with logo */}
                        <div className="text-center mb-4 md:mb-8">
                            <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-3 md:mb-4 rounded-xl md:rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center"
                            >
                                <img src="/veefore.svg" alt="Veefore" className="w-7 h-7 md:w-10 md:h-10 object-contain" />
                            </motion.div>
                            <h2 className="text-2xl md:text-3xl font-bold mb-1 md:mb-2">
                                <span className="bg-gradient-to-r from-white via-indigo-200 to-white bg-clip-text text-transparent">
                                    Apply for Access
                                </span>
                            </h2>
                            <p className="text-white/50 text-sm md:text-base">Join the next generation of creators</p>
                        </div>

                        <CustomInput
                            label="Full Name"
                            name="name"
                            value={formData.name}
                            onChange={(v) => handleInputChange('name', v)}
                            icon={User}
                            placeholder="Your Full Name"
                            autoFocus
                            autoComplete="name"
                            error={errors.name}
                            required
                        />
                        <CustomInput
                            label="Work Email"
                            name="email"
                            value={formData.email}
                            onChange={(v) => handleInputChange('email', v)}
                            icon={Mail}
                            placeholder="name@company.com"
                            type="email"
                            autoComplete="email"
                            error={errors.email}
                            required
                        />

                        {networkError ? (
                            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex flex-col md:flex-row items-center gap-3 animate-in fade-in slide-in-from-top-2">
                                <div className="p-2 bg-red-500/10 rounded-full shrink-0">
                                    <AlertTriangle className="w-5 h-5 text-red-500" />
                                </div>
                                <div className="flex-1 text-center md:text-left">
                                    <p className="text-white text-sm font-medium">Connection Failed</p>
                                    <p className="text-white/50 text-xs">{networkError}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={nextStep}
                                    className="px-4 py-2 bg-red-500 text-white text-xs font-bold rounded-lg hover:bg-red-600 transition-colors w-full md:w-auto"
                                >
                                    Try Again
                                </button>
                            </div>
                        ) : (
                            <motion.button
                                type="button"
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={nextStep}
                                disabled={isValidating}
                                className="w-full h-12 md:h-14 rounded-xl bg-white text-black font-bold text-sm md:text-base flex items-center justify-center gap-2 relative overflow-hidden group z-10 disabled:opacity-70 disabled:pointer-events-none"
                                style={{ border: 'none', outline: 'none' }}
                            >
                                {isValidating ? (
                                    <>
                                        <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                                        <span>Checking...</span>
                                    </>
                                ) : (
                                    <>
                                        <span className="relative z-10">Start Application</span>
                                        <ArrowRight className="w-4 h-4 md:w-5 md:h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
                                        <div className="absolute inset-0 bg-gradient-to-r from-white via-gray-100 to-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                                    </>
                                )}
                            </motion.button>
                        )}

                        {/* Trust badges */}
                        <div className="flex items-center justify-center gap-4 md:gap-6 pt-2 md:pt-4">
                            <div className="flex items-center gap-1 text-white/30 text-[10px] md:text-xs">
                                <ShieldCheck className="w-3 h-3" /> Secure
                            </div>
                            <div className="flex items-center gap-1 text-white/30 text-[10px] md:text-xs">
                                <Star className="w-3 h-3" /> 5,000+ waitlisted
                            </div>
                        </div>
                    </div>
                );

            case 2:
                return (
                    <div className="space-y-4 md:space-y-6">
                        <div className="text-center mb-4 md:mb-6">
                            <h2 className="text-xl md:text-2xl font-bold text-white">How will you use Veefore?</h2>
                            <p className="text-white/50 text-xs md:text-sm">Select your profile for a personalized experience</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:gap-3">
                            {[
                                { id: 'solo', label: 'Creator', icon: User, desc: 'Personal Brand', color: 'from-pink-500 to-rose-500' },
                                { id: 'startup', label: 'Startup', icon: Rocket, desc: 'Growth Focused', color: 'from-orange-500 to-amber-500' },
                                { id: 'agency', label: 'Agency', icon: Briefcase, desc: 'Client Services', color: 'from-cyan-500 to-blue-500' },
                                { id: 'enterprise', label: 'Enterprise', icon: Building2, desc: 'Large Scale', color: 'from-violet-500 to-purple-500' },
                            ].map((item) => (
                                <motion.button
                                    key={item.id}
                                    type="button"
                                    whileHover={{ scale: 1.03, y: -4 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => { handleInputChange('orgType', item.id); setTimeout(() => setStep(3), 200); }}
                                    className="flex flex-col items-center p-3 md:p-5 rounded-xl transition-all relative overflow-hidden group"
                                    style={{
                                        backgroundColor: formData.orgType === item.id ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                                        border: formData.orgType === item.id ? '1px solid rgba(99, 102, 241, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                                        outline: 'none',
                                    }}
                                >
                                    <div className={`w-10 h-10 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center mb-2 md:mb-3 bg-gradient-to-br ${item.color} shadow-lg`}>
                                        <item.icon className="w-5 h-5 md:w-6 md:h-6 text-white" />
                                    </div>
                                    <span className="text-white font-semibold text-sm md:text-base">{item.label}</span>
                                    <span className="text-white/40 text-[10px] md:text-xs">{item.desc}</span>

                                    {/* Hover glow effect */}
                                    <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 group-hover:opacity-5 transition-opacity rounded-xl`} />
                                </motion.button>
                            ))}
                        </div>
                        <button onClick={prevStep} className="w-full py-2 md:py-3 text-white/40 text-xs md:text-sm hover:text-white/60 transition-colors" style={{ border: 'none', background: 'none', outline: 'none' }}>
                            ← Back
                        </button>
                    </div>
                );

            case 3:
                return (
                    <div className="space-y-3 md:space-y-5">
                        <div className="text-center mb-3 md:mb-4">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 mb-2 md:mb-3">
                                <span className="text-indigo-400 text-[10px] md:text-xs font-medium capitalize">{formData.orgType}</span>
                            </div>
                            <h2 className="text-xl md:text-2xl font-bold text-white">Tell us more</h2>
                            <p className="text-white/50 text-xs md:text-sm">Help us customize your experience</p>
                            <p className="text-white/40 text-[10px] md:text-xs mt-1">Fields marked with <span className="text-red-400">*</span> are required</p>
                        </div>
                        <div className="grid grid-cols-2 gap-2 md:gap-4">
                            {formData.orgType === 'solo' && (
                                <>
                                    <CustomDropdown label="Platform" value={formData.primaryPlatform} onChange={(v) => handleInputChange('primaryPlatform', v)} options={[{ value: 'instagram', label: 'Instagram' }, { value: 'tiktok', label: 'TikTok' }, { value: 'youtube', label: 'YouTube' }, { value: 'linkedin', label: 'LinkedIn' }]} icon={Globe} error={errors.primaryPlatform} />
                                    <CustomDropdown label="Niche" value={formData.contentNiche} onChange={(v) => handleInputChange('contentNiche', v)} options={[{ value: 'tech', label: 'Tech & AI' }, { value: 'lifestyle', label: 'Lifestyle' }, { value: 'education', label: 'Education' }, { value: 'entertainment', label: 'Entertainment' }]} icon={Layers} error={errors.contentNiche} />
                                    <CustomDropdown label="Audience" value={formData.creatorAudienceSize} onChange={(v) => handleInputChange('creatorAudienceSize', v)} options={[{ value: '0-1k', label: 'Just Starting' }, { value: '1k-10k', label: '1k - 10k' }, { value: '10k-100k', label: '10k - 100k' }, { value: '100k+', label: '100k+' }]} icon={Users} error={errors.creatorAudienceSize} />
                                    <CustomDropdown label="Frequency" value={formData.postingFrequency} onChange={(v) => handleInputChange('postingFrequency', v)} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'sporadic', label: 'Sporadic' }]} icon={Clock} error={errors.postingFrequency} />
                                </>
                            )}
                            {formData.orgType === 'startup' && (
                                <>
                                    <CustomDropdown label="Stage" value={formData.startupStage} onChange={(v) => handleInputChange('startupStage', v)} options={[{ value: 'bootstrap', label: 'Bootstrapped' }, { value: 'pre-seed', label: 'Pre-Seed' }, { value: 'seed', label: 'Seed' }, { value: 'series-a', label: 'Series A+' }]} icon={Rocket} error={errors.startupStage} />
                                    <CustomDropdown label="Team Size" value={formData.startupTeamSize} onChange={(v) => handleInputChange('startupTeamSize', v)} options={[{ value: '1-10', label: '1 - 10' }, { value: '11-50', label: '11 - 50' }, { value: '51-200', label: '51 - 200' }]} icon={Users} error={errors.startupTeamSize} />
                                    <CustomDropdown label="Growth Channel" value={formData.startupGrowthChannel} onChange={(v) => handleInputChange('startupGrowthChannel', v)} options={[{ value: 'organic', label: 'Organic Social' }, { value: 'ads', label: 'Paid Ads' }, { value: 'content', label: 'Content Marketing' }, { value: 'sales', label: 'Outbound Sales' }]} icon={BarChart3} error={errors.startupGrowthChannel} />
                                    <CustomDropdown label="Timeline" value={formData.timeline} onChange={(v) => handleInputChange('timeline', v)} options={[{ value: 'urgent', label: 'Immediately' }, { value: 'q3', label: 'This Quarter' }, { value: 'q4', label: 'Next Quarter' }]} icon={Clock} error={errors.timeline} />
                                </>
                            )}
                            {formData.orgType === 'agency' && (
                                <>
                                    <CustomDropdown label="Clients" value={formData.agencyClientCount} onChange={(v) => handleInputChange('agencyClientCount', v)} options={[{ value: '1-5', label: '1 - 5' }, { value: '6-20', label: '6 - 20' }, { value: '20+', label: '20+' }]} icon={Briefcase} error={errors.agencyClientCount} />
                                    <CustomDropdown label="Service" value={formData.agencyServices} onChange={(v) => handleInputChange('agencyServices', v)} options={[{ value: 'smm', label: 'Social Media' }, { value: 'ads', label: 'Paid Media' }, { value: 'content', label: 'Content' }, { value: 'full', label: 'Full Service' }]} icon={Layers} error={errors.agencyServices} />
                                    <CustomDropdown label="Niche" value={formData.agencyNiche} onChange={(v) => handleInputChange('agencyNiche', v)} options={[{ value: 'ecom', label: 'E-Commerce' }, { value: 'b2b', label: 'B2B Tech' }, { value: 'local', label: 'Local' }, { value: 'mixed', label: 'Mixed' }]} icon={Target} error={errors.agencyNiche} />
                                    <CustomDropdown label="Output" value={formData.agencyMonthlyOutput} onChange={(v) => handleInputChange('agencyMonthlyOutput', v)} options={[{ value: 'low', label: '< 20 videos' }, { value: 'medium', label: '20 - 100' }, { value: 'high', label: '100+' }]} icon={PieChart} error={errors.agencyMonthlyOutput} />
                                </>
                            )}
                            {formData.orgType === 'enterprise' && (
                                <>
                                    <CustomDropdown label="Industry" value={formData.enterpriseIndustry} onChange={(v) => handleInputChange('enterpriseIndustry', v)} options={[{ value: 'fintech', label: 'Finance' }, { value: 'health', label: 'Healthcare' }, { value: 'retail', label: 'Retail' }, { value: 'tech', label: 'Technology' }]} icon={Building2} error={errors.enterpriseIndustry} />
                                    <CustomDropdown label="Department" value={formData.enterpriseDepartment} onChange={(v) => handleInputChange('enterpriseDepartment', v)} options={[{ value: 'marketing', label: 'Marketing' }, { value: 'product', label: 'Product' }, { value: 'sales', label: 'Sales' }, { value: 'hr', label: 'HR' }]} icon={Briefcase} error={errors.enterpriseDepartment} />
                                    <CustomDropdown label="Security" value={formData.enterpriseSecurity} onChange={(v) => handleInputChange('enterpriseSecurity', v)} options={[{ value: 'soc2', label: 'SOC2' }, { value: 'gdpr', label: 'GDPR' }, { value: 'on-prem', label: 'On-Premise' }, { value: 'standard', label: 'Standard' }]} icon={ShieldCheck} error={errors.enterpriseSecurity} />
                                    <CustomDropdown label="Budget" value={formData.enterpriseBudget} onChange={(v) => handleInputChange('enterpriseBudget', v)} options={[{ value: '10k', label: '$10k - $50k' }, { value: '50k', label: '$50k - $200k' }, { value: '200k+', label: '$200k+' }, { value: 'undecided', label: 'Undecided' }]} icon={Wallet} error={errors.enterpriseBudget} />
                                </>
                            )}
                        </div>
                        <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={nextStep}
                            className="w-full h-10 md:h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold text-sm md:text-base flex items-center justify-center gap-2 hover:from-indigo-600 hover:to-purple-600 transition-all shadow-lg shadow-indigo-500/20"
                            style={{ border: 'none', outline: 'none' }}
                        >
                            Continue <ChevronRight className="w-4 h-4" />
                        </motion.button>
                        <button onClick={prevStep} className="w-full py-2 text-white/40 text-xs md:text-sm hover:text-white/60 transition-colors" style={{ border: 'none', background: 'none', outline: 'none' }}>← Back</button>
                    </div>
                );

            case 4:
                return (
                    <div className="space-y-5">
                        <div className="text-center mb-4">
                            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center">
                                <Target className="w-6 h-6 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold text-white">Almost there!</h2>
                            <p className="text-white/50 text-sm">Just a few more details</p>
                            <p className="text-white/40 text-[10px] md:text-xs mt-1">Fields marked with <span className="text-red-400">*</span> are required</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <CustomDropdown label="How did you find us?" value={formData.referralSource} onChange={(v) => handleInputChange('referralSource', v)} options={[{ value: 'social', label: 'Social Media' }, { value: 'search', label: 'Search' }, { value: 'friend', label: 'Friend' }, { value: 'ads', label: 'Ads' }]} icon={Search} error={errors.referralSource} />
                            <CustomDropdown label="Primary Goal" value={formData.primaryGoal} onChange={(v) => handleInputChange('primaryGoal', v)} options={[{ value: 'viral', label: 'Viral Growth' }, { value: 'leads', label: 'Lead Gen' }, { value: 'quality', label: 'Scale Output' }, { value: 'automation', label: 'Automation' }]} icon={Target} error={errors.primaryGoal} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-white/60 block uppercase tracking-wider">
                                Biggest Challenge? <span className="text-white/40 normal-case">(optional)</span>
                            </label>
                            <div className="relative">
                                <MessageSquare className="absolute left-4 top-4 w-5 h-5 text-white/40 pointer-events-none" />
                                <textarea
                                    value={formData.painPoints}
                                    onChange={(e) => handleInputChange('painPoints', e.target.value)}
                                    placeholder="What's slowing you down the most?"
                                    className="w-full h-24 pl-12 pt-4 pr-4 rounded-xl text-white text-sm resize-none placeholder:text-white/25 focus:ring-0"
                                    style={{ backgroundColor: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)', outline: 'none' }}
                                />
                            </div>
                        </div>
                        <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleSubmit}
                            disabled={isSubmitting}
                            className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold flex items-center justify-center gap-3 transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/20"
                            style={{ border: 'none', outline: 'none' }}
                        >
                            {isSubmitting ? (
                                <>
                                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    Submit Application
                                    <ArrowRight className="w-4 h-4" />
                                </>
                            )}
                        </motion.button>
                        <button onClick={prevStep} disabled={isSubmitting} className="w-full py-2 text-white/40 text-sm hover:text-white/60 transition-colors" style={{ border: 'none', background: 'none', outline: 'none' }}>← Back</button>
                    </div>
                );

            case 5:
                return (
                    <div className="text-center py-8">
                        <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                            className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/30"
                        >
                            <Check className="w-12 h-12 text-white" strokeWidth={3} />
                        </motion.div>
                        <motion.h2 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-3xl font-bold text-white mb-2">
                            You're on the list! 🎉
                        </motion.h2>
                        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="text-white/50 mb-8 max-w-xs mx-auto">
                            We'll reach out to <span className="text-indigo-400 font-medium">{formData.email}</span> with your exclusive invite.
                        </motion.p>
                        <motion.button
                            type="button"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.6 }}
                            whileHover={{ scale: 1.02 }}
                            onClick={() => { closeWaitlist(); setTimeout(() => setStep(1), 300); }}
                            className="w-full h-12 rounded-xl bg-white/10 text-white font-semibold hover:bg-white/20 transition-all"
                            style={{ border: '1px solid rgba(255, 255, 255, 0.1)', outline: 'none' }}
                        >
                            Close
                        </motion.button>
                    </div>
                );

            default:
                return null;
        }
    };

    if (!isWaitlistOpen) return null;

    // ============================================
    // MODAL RENDER
    // ============================================
    return (
        <AnimatePresence>
            {isWaitlistOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 md:p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={closeWaitlist}
                        className="absolute inset-0 bg-black/85"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                        className="relative w-full max-h-[85vh] max-w-3xl overflow-hidden rounded-2xl"
                        style={{
                            backgroundColor: '#050507',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
                        }}
                    >
                        <FloatingParticles />

                        <div className="relative flex flex-col md:flex-row h-full">
                            {/* Sidebar - hidden on mobile */}
                            <div className="hidden md:flex w-1/3 flex-col justify-between p-6 border-r border-white/5" style={{ backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                                <div>
                                    <div className="flex items-center gap-1 mb-10">
                                        <img src="/veefore.svg" alt="Veefore" className="w-8 h-8 object-contain" />
                                        <span className="font-bold text-white text-lg -ml-1 tracking-tight">eefore</span>
                                    </div>
                                    <div className="space-y-4">
                                        {[{ s: 1, label: "Identity" }, { s: 2, label: "Profile" }, { s: 3, label: "Specifics" }, { s: 4, label: "Use Case" }].map((item) => (
                                            <div key={item.s} className="flex items-center gap-3">
                                                <motion.div
                                                    animate={{
                                                        scale: step === item.s ? 1.1 : 1,
                                                        boxShadow: step === item.s ? '0 0 20px rgba(20, 184, 166, 0.5)' : 'none'
                                                    }}
                                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step > item.s ? 'bg-emerald-500 text-white' :
                                                        step === item.s ? 'bg-teal-500 text-white' :
                                                            'border border-white/20 text-white/30'
                                                        }`}
                                                >
                                                    {step > item.s ? <Check className="w-4 h-4" /> : item.s}
                                                </motion.div>
                                                <span className={`text-sm font-medium ${step >= item.s ? 'text-white' : 'text-white/30'}`}>{item.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                                    <p className="text-white/20 text-xs">© 2024 Veefore Inc.<br />All rights reserved.</p>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="flex-1 p-4 md:p-6 flex flex-col overflow-hidden">
                                <div className="flex justify-end items-center mb-3 md:mb-6 flex-shrink-0">
                                    <button
                                        onClick={closeWaitlist}
                                        className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
                                        style={{ border: 'none', outline: 'none' }}
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                                    <div className="w-full max-w-sm mx-auto">
                                        <AnimatePresence mode="wait">
                                            <motion.div
                                                key={step}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.15 }}
                                            >
                                                {renderStepContent()}
                                            </motion.div>
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
