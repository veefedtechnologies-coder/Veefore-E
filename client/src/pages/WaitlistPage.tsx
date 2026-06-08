
import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import {
    ChevronRight, Check, ChevronDown, ArrowLeft,
    User, Mail, Building2, Users, Rocket,
    Globe, Layers, Clock, Target,
    Briefcase, BarChart3, ShieldCheck, Wallet,
    Search, PieChart, Loader2
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
// CUSTOM DROPDOWN
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
// CUSTOM INPUT
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
        <div className="space-y-1.5">
            <label className="text-xs font-medium text-white/70 block">
                {label} {required && <span className="text-red-400">*</span>}
            </label>
            <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <Icon className={`w-4 h-4 ${hasError ? 'text-red-400' : isFocused ? 'text-white/60' : 'text-white/40'}`} />
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
                    className="w-full h-11 pl-10 pr-3 rounded-md text-white text-base transition-all placeholder:text-white/30 bg-white/5 border border-white/10 focus:border-white/30 focus:bg-white/[0.08] outline-none"
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
// MAIN PAGE COMPONENT
// ============================================
export default function WaitlistPage() {
    const { toast } = useToast();
    const [, setLocation] = useLocation();
    const [step, setStep] = useState(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isValidating, setIsValidating] = useState(false);
    const [networkError, setNetworkError] = useState<string | null>(null);
    const [isDuplicate, setIsDuplicate] = useState(false);

    const [formData, setFormData] = useState<WaitlistFormData>({
        name: '',
        email: '',
        orgType: null,
        painPoints: ''
    });
    const [hoveredRole, setHoveredRole] = useState<OrgType | null>(null);

    const [errors, setErrors] = useState<Record<string, string>>({});

    // PERSISTENCE CONSTANTS
    const STORAGE_KEY = 'veefore_waitlist_progress';
    const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

    // Load saved state on mount
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;

        try {
            const parsed = JSON.parse(saved);
            const age = Date.now() - (parsed.timestamp || 0);

            // Expired?
            if (age > CACHE_DURATION) {
                localStorage.removeItem(STORAGE_KEY);
                return;
            }

            // Valid cache found
            if (parsed.formData) {
                // If restoring to a later step, verify they aren't already registered
                // This handles the "user comes back after a few minutes" case
                if (parsed.formData.email && parsed.step > 1) {
                    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
                    fetch(`${apiBaseUrl}/api/early-access/check-email?email=${encodeURIComponent(parsed.formData.email)}&reason=restore`)
                        .then(res => res.json())
                        .then(data => {
                            if (data.exists) {
                                // Already on list! Clear cache and reset.
                                localStorage.removeItem(STORAGE_KEY);
                                setFormData({
                                    name: '',
                                    email: '',
                                    orgType: null,
                                    painPoints: ''
                                });
                                setStep(1);
                                toast({
                                    title: "Welcome Back! 👋",
                                    description: "Good news - you're already on the waitlist! We've cleared your unfinished draft.",
                                    variant: "default"
                                });
                            } else {
                                // Safe to restore
                                setFormData(parsed.formData);
                                setStep(parsed.step);
                                toast({
                                    title: "Progress Restored",
                                    description: "We've loaded your previous session.",
                                });
                            }
                        })
                        .catch(() => {
                            // On network error, just restore safely
                            setFormData(parsed.formData);
                            setStep(parsed.step);
                        });
                } else {
                    // Step 1 restore (safe)
                    setFormData(parsed.formData);
                    if (parsed.step) setStep(parsed.step);
                }
            }
        } catch (e) {
            localStorage.removeItem(STORAGE_KEY);
        }
    }, [toast]);

    // Save state on change
    useEffect(() => {
        // Don't save if empty or submitting
        if (isSubmitting || step === 5) return;

        // Only save if we have at least a name or email
        if (!formData.name && !formData.email) return;

        const state = {
            formData,
            step,
            timestamp: Date.now()
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, [formData, step, isSubmitting]);

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
        setIsValidating(true);
        setNetworkError(null);

        try {
            const isValid = await validateStep(step);
            if (!isValid) {
                setIsValidating(false);
                return;
            }
            setStep(prev => prev + 1);
        } catch (error) {
            console.error('[Waitlist] nextStep error:', error);
            setNetworkError('Connection issue. Please check your internet and try again.');
        } finally {
            setIsValidating(false);
        }
    };

    const prevStep = () => setStep(prev => prev - 1);

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

            if (!trimmedName) {
                newErrors.name = "Please enter your name";
                isValid = false;
            } else if (trimmedName.length < 2) {
                newErrors.name = "Name must be at least 2 characters";
                isValid = false;
            }

            if (!trimmedEmail) {
                newErrors.email = "Please enter your email address";
                isValid = false;
            } else {
                const emailRegex = /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z]{2,})+$/;

                if (!emailRegex.test(trimmedEmail)) {
                    newErrors.email = "Please enter a valid email address";
                    isValid = false;
                } else if (isDisposableEmail(trimmedEmail)) {
                    newErrors.email = "Disposable emails are not allowed";
                    isValid = false;
                } else {
                    const domain = trimmedEmail.split('@')[1];
                    const domainParts = domain.split('.');
                    const tld = domainParts[domainParts.length - 1];

                    if (tld.length < 2 || tld.length > 10 || !/^[a-zA-Z]+$/.test(tld)) {
                        newErrors.email = "Invalid domain extension";
                        isValid = false;
                    } else if (domain.length < 4) {
                        newErrors.email = "Invalid domain";
                        isValid = false;
                    } else {
                        try {
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 15000);

                            const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
                            const response = await fetch(
                                `${apiBaseUrl}/api/early-access/check-email?email=${encodeURIComponent(trimmedEmail)}`,
                                { signal: controller.signal }
                            );

                            clearTimeout(timeoutId);

                            if (response.status === 429) {
                                newErrors.email = "Too many requests. Please wait a moment.";
                                isValid = false;
                            } else if (response.ok) {
                                const data = await response.json();
                                if (data.exists) {
                                    newErrors.email = data.message || "This email is already registered.";
                                    isValid = false;
                                }
                            }
                        } catch (error) {
                            console.error('[Waitlist] Email check failed:', error);
                            // We don't block if network is error for existence checking, unless we want strict
                            // But usually better to let user try submit and fail there if it's generic error
                            // But keeping modal logic: modal logic re-throws.
                            throw error;
                        }
                    }
                }
            }
        }

        if (currentStep === 2 && !formData.orgType) {
            toast({ title: "Required", description: "Please select your profile type.", variant: "destructive" });
            return false;
        }

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

        if (currentStep === 4) {
            if (!formData.referralSource) { newErrors.referralSource = "Required"; isValid = false; }
            if (!formData.primaryGoal) { newErrors.primaryGoal = "Required"; isValid = false; }
        }

        setErrors(newErrors);
        return isValid;
    };

    const handleSubmit = async () => {
        console.log('[WaitlistPage] Submitting...');
        const isValid = await validateStep(4);
        if (!isValid) {
            console.log('[WaitlistPage] Validation failed');
            return;
        }

        setIsSubmitting(true);
        try {
            await new Promise(resolve => setTimeout(resolve, 1500));
            console.log('[WaitlistPage] Sending request...');
            const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || '';
            const response = await fetch(`${apiBaseUrl}/api/early-access/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: formData.name.trim(), email: formData.email.trim().toLowerCase(), role: formData.orgType, questionnaire: { ...formData } })
            });

            console.log('[WaitlistPage] Response status:', response.status);

            if (response.status === 409) {
                console.log('[WaitlistPage] 409 Duplicate detected. switching to duplicate view.');
                localStorage.removeItem(STORAGE_KEY);
                // Store email for early access check mechanism
                localStorage.setItem('veefore_early_access_email', formData.email.trim().toLowerCase());
                setIsDuplicate(true);
                setStep(5);
                return;
            }

            if (!response.ok) {
                console.log('[WaitlistPage] Response not OK');
                const data = await response.json().catch(() => ({}));
                toast({
                    title: "Registration Failed",
                    description: data.error || "Something went wrong.",
                    variant: "destructive"
                });
                return;
            }

            console.log('[WaitlistPage] Success');
            const data = await response.json();
            if (data.success !== false) {
                localStorage.removeItem(STORAGE_KEY); // Clear cache on success
                // Store email for early access check mechanism
                localStorage.setItem('veefore_early_access_email', formData.email.trim().toLowerCase());
                setStep(5);
            } else {
                toast({
                    title: "Registration Failed",
                    description: data.error || "Could not complete registration.",
                    variant: "destructive"
                });
            }
        } catch (error) {
            console.error('[WaitlistPage] Error:', error);
            toast({
                title: "Error",
                description: "An unexpected error occurred.",
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <div className="space-y-3">
                        <div className="mb-4">
                            <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">Get Early Access</h2>
                            <p className="text-white/50 text-sm">Be first to automate your social growth with AI</p>
                        </div>
                        <CustomInput label="Full Name" name="name" value={formData.name} onChange={(v) => handleInputChange('name', v)} icon={User} placeholder="Your Full Name" autoFocus autoComplete="name" error={errors.name} required />
                        <CustomInput label="Work Email" name="email" value={formData.email} onChange={(v) => handleInputChange('email', v)} icon={Mail} placeholder="name@company.com" type="email" autoComplete="email" error={errors.email} required />
                        {networkError && <p className="text-red-400 text-sm">{networkError}</p>}
                        <button
                            type="button"
                            onClick={nextStep}
                            disabled={isValidating}
                            className="w-full h-11 rounded-md bg-[#2563eb] text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-[#1d4ed8] transition-colors disabled:opacity-70"
                        >
                            {isValidating ? <><Loader2 className="w-5 h-5 animate-spin" /> Checking...</> : "Start Application"}
                        </button>
                        <p className="text-center text-white/40 text-sm mt-3">
                            Already have an account? <span className="text-white hover:underline cursor-pointer" onClick={() => setLocation('/signin')}>Sign in</span>
                        </p>
                    </div>
                );
            case 2:
                // Profile Type
                return (
                    <div className="space-y-6">
                        <div className="mb-8">
                            <h2 className="text-2xl font-bold text-white mb-2">How will you use Veefore?</h2>
                            <p className="text-white/50">Select your profile</p>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { id: 'solo', label: 'Creator', icon: User, desc: 'Personal' },
                                { id: 'startup', label: 'Startup', icon: Rocket, desc: 'Growth' },
                                { id: 'agency', label: 'Agency', icon: Briefcase, desc: 'Clients' },
                                { id: 'enterprise', label: 'Enterprise', icon: Building2, desc: 'Scale' },
                            ].map((item) => (
                                <motion.button
                                    key={item.id}
                                    type="button"
                                    whileHover={{ scale: 1.03 }}
                                    whileTap={{ scale: 0.98 }}
                                    onMouseEnter={() => setHoveredRole(item.id as OrgType)}
                                    onMouseLeave={() => setHoveredRole(null)}
                                    onClick={() => { handleInputChange('orgType', item.id as any); setTimeout(() => setStep(3), 200); }}
                                    className={`flex flex-col items-center p-4 rounded-xl border transition-all ${formData.orgType === item.id ? 'bg-indigo-500/20 border-indigo-500' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                                >
                                    <item.icon className="w-8 h-8 text-white mb-2" />
                                    <span className="text-white font-medium">{item.label}</span>
                                    <span className="text-white/40 text-xs">{item.desc}</span>
                                </motion.button>
                            ))}
                        </div>
                        <button onClick={prevStep} className="w-full text-white/40 hover:text-white transition-colors">← Back</button>
                    </div>
                );
            case 3:
                // Specifics
                return (
                    <div className="space-y-4">
                        <div className="mb-6">
                            <div className="inline-block px-3 py-1 bg-indigo-500/20 text-indigo-400 rounded-full text-xs font-semibold uppercase mb-2">
                                {formData.orgType}
                            </div>
                            <h2 className="text-2xl font-bold text-white">Tell us more details</h2>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            {formData.orgType === 'solo' && (
                                <>
                                    <CustomDropdown label="Platform" value={formData.primaryPlatform} onChange={(v) => handleInputChange('primaryPlatform', v)} options={[{ value: 'instagram', label: 'Instagram' }, { value: 'tiktok', label: 'TikTok' }, { value: 'youtube', label: 'YouTube' }, { value: 'linkedin', label: 'LinkedIn' }]} icon={Globe} error={errors.primaryPlatform} />
                                    <CustomDropdown label="Niche" value={formData.contentNiche} onChange={(v) => handleInputChange('contentNiche', v)} options={[{ value: 'tech', label: 'Tech & AI' }, { value: 'lifestyle', label: 'Lifestyle' }, { value: 'education', label: 'Education' }, { value: 'entertainment', label: 'Entertainment' }]} icon={Layers} error={errors.contentNiche} />
                                    <CustomDropdown label="Audience" value={formData.creatorAudienceSize} onChange={(v) => handleInputChange('creatorAudienceSize', v)} options={[{ value: '0-1k', label: 'Just Starting' }, { value: '1k-10k', label: '1k - 10k' }, { value: '10k-100k', label: '10k - 100k' }, { value: '100k+', label: '100k+' }]} icon={Users} error={errors.creatorAudienceSize} />
                                    <CustomDropdown label="Frequency" value={formData.postingFrequency} onChange={(v) => handleInputChange('postingFrequency', v)} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'sporadic', label: 'Sporadic' }]} icon={Clock} error={errors.postingFrequency} />
                                </>
                            )}
                            {/* Add other org types similarly if needed, or rely on them being optional in partial implementation? 
                                 Wait, I need to copy ALL logic. Users instructions said "logic ... are same".
                                 So I must include all fields for all types.
                             */}
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
                        <motion.button type="button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={nextStep} className="w-full h-12 mt-4 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors">
                            Continue <ChevronRight className="w-4 h-4" />
                        </motion.button>
                        <button onClick={prevStep} className="w-full mt-2 text-white/40 hover:text-white transition-colors">← Back</button>
                    </div>
                );
            case 4:
                return (
                    <div className="space-y-4">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold text-white mb-2">Final Step</h2>
                            <p className="text-white/50">Just a few more details</p>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <CustomDropdown label="Found us via" value={formData.referralSource} onChange={(v) => handleInputChange('referralSource', v)} options={[{ value: 'social', label: 'Social Media' }, { value: 'search', label: 'Search' }, { value: 'friend', label: 'Friend' }, { value: 'ads', label: 'Ads' }]} icon={Search} error={errors.referralSource} />
                            <CustomDropdown label="Primary Goal" value={formData.primaryGoal} onChange={(v) => handleInputChange('primaryGoal', v)} options={[{ value: 'viral', label: 'Viral Growth' }, { value: 'leads', label: 'Lead Gen' }, { value: 'quality', label: 'Scale Output' }, { value: 'automation', label: 'Automation' }]} icon={Target} error={errors.primaryGoal} />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-medium text-white/60 block uppercase tracking-wider">
                                Biggest Challenge? <span className="text-white/40 normal-case">(optional)</span>
                            </label>
                            <div className="relative">
                                <textarea
                                    value={formData.painPoints}
                                    onChange={(e) => handleInputChange('painPoints', e.target.value)}
                                    placeholder="What's slowing you down?"
                                    className="w-full h-24 p-4 rounded-xl bg-white/5 border border-white/10 text-white text-sm resize-none focus:border-indigo-500 outline-none"
                                />
                            </div>
                        </div>
                        <motion.button type="button" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleSubmit} disabled={isSubmitting} className="w-full h-12 rounded-xl bg-indigo-600 text-white font-bold flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors">
                            {isSubmitting ? "Processing..." : "Submit Application"}
                        </motion.button>
                        <button onClick={prevStep} className="w-full mt-2 text-white/40 hover:text-white transition-colors">← Back</button>
                    </div>
                );
            case 5:
                return (
                    <div className="text-center py-10">
                        <div className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center ${isDuplicate ? 'bg-indigo-500/20 text-indigo-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                            {isDuplicate ? (
                                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>✨</motion.div>
                            ) : (
                                <Check className="w-10 h-10" />
                            )}
                        </div>
                        {isDuplicate ? (
                            <>
                                <h2 className="text-3xl font-bold text-white mb-4">You're already on the list! 🚀</h2>
                                <p className="text-white/60 mb-8 max-w-sm mx-auto">
                                    Good news - <span className="text-indigo-400">{formData.email}</span> is already saved. We'll be in touch soon!
                                </p>
                            </>
                        ) : (
                            <>
                                <h2 className="text-3xl font-bold text-white mb-4">You're on the list! 🎉</h2>
                                <p className="text-white/60 mb-8">We'll notify <span className="text-indigo-400">{formData.email}</span> when your spot is ready.</p>
                            </>
                        )}
                        <button onClick={() => setLocation('/')} className="px-6 py-3 rounded-xl bg-white/10 text-white font-medium hover:bg-white/20 transition-colors">
                            Back to Home
                        </button>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="fixed inset-0 flex w-full bg-black overflow-hidden lg:relative lg:min-h-screen">
            {/* Mobile-only atmospheric background */}
            <div className="lg:hidden absolute inset-0 pointer-events-none">
                {/* Gradient background for mobile */}
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-black to-blue-950/30" />

                {/* Animated floating orbs - mobile only */}
                <motion.div
                    className="absolute top-20 right-10 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl"
                    animate={{
                        y: [0, -20, 0],
                        opacity: [0.2, 0.4, 0.2],
                    }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="absolute top-1/3 left-0 w-40 h-40 bg-blue-500/15 rounded-full blur-3xl"
                    animate={{
                        x: [0, 20, 0],
                        opacity: [0.15, 0.3, 0.15],
                    }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="absolute bottom-40 right-0 w-36 h-36 bg-purple-500/20 rounded-full blur-3xl"
                    animate={{
                        y: [0, 15, 0],
                        opacity: [0.2, 0.35, 0.2],
                    }}
                    transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                />
                <motion.div
                    className="absolute bottom-20 left-10 w-24 h-24 bg-cyan-500/15 rounded-full blur-2xl"
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.15, 0.25, 0.15],
                    }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* Subtle grid pattern */}
                <div
                    className="absolute inset-0 opacity-[0.03]"
                    style={{
                        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                                         linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
                        backgroundSize: '40px 40px'
                    }}
                />

                {/* Top gradient fade */}
                <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black via-black/50 to-transparent" />
            </div>

            {/* Left Side - Content */}
            <div className="w-full lg:w-[45%] flex flex-col px-5 sm:px-6 md:px-12 lg:pl-24 lg:pr-16 xl:pl-28 xl:pr-20 relative z-10 lg:justify-center lg:min-h-screen">
                {/* Header with back button and logo - flow-based on mobile, absolute on desktop */}
                <div className="pt-4 pb-3 sm:pt-6 sm:pb-6 lg:absolute lg:top-8 lg:left-24 xl:left-28 lg:pb-0 lg:pt-0 flex items-center gap-3 sm:gap-4">
                    {/* Back button */}
                    <button
                        onClick={() => setLocation('/')}
                        className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all"
                        aria-label="Go back to home"
                    >
                        <ArrowLeft className="w-4 h-4 sm:w-5 sm:h-5 text-white/70" />
                    </button>
                    {/* Logo */}
                    <div className="flex items-center cursor-pointer" onClick={() => setLocation('/')}>
                        <img src="/veefore.svg" alt="V" className="w-8 h-8 sm:w-9 sm:h-9" />
                        <span className="text-xl sm:text-2xl font-bold text-white -ml-1">eefore</span>
                    </div>
                </div>

                <div className="w-full max-w-sm mx-auto lg:mx-0 flex-1 lg:flex-none flex flex-col justify-center">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={step}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            transition={{ duration: 0.3 }}
                        >
                            {renderStepContent()}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Footer - flow-based on mobile, absolute on desktop */}
                <div className="pt-3 pb-3 sm:pt-6 sm:pb-6 lg:absolute lg:bottom-8 lg:left-12 lg:pt-0 lg:pb-0 flex gap-5 sm:gap-6 text-xs text-white/30">
                    <span onClick={() => setLocation('/terms-of-service')} className="hover:text-white transition-colors cursor-pointer">Terms</span>
                    <span onClick={() => setLocation('/privacy-policy')} className="hover:text-white transition-colors cursor-pointer">Privacy</span>
                    <span onClick={() => setLocation('/security')} className="hover:text-white transition-colors cursor-pointer">Security</span>
                </div>
            </div>

            {/* Right Side - Graphic (wider, extended left) */}
            <div className="hidden lg:flex lg:w-[55%] relative items-center justify-center">
                <div className="absolute inset-y-10 right-6 -left-24 bg-[#0f2744] rounded-2xl flex items-center justify-center overflow-hidden">
                    {/* Proper grainy texture overlay */}
                    <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-40">
                        <filter id="grain">
                            <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" seed="15" stitchTiles="stitch" />
                            <feColorMatrix type="saturate" values="0" />
                        </filter>
                        <rect width="100%" height="100%" filter="url(#grain)" />
                    </svg>

                    {/* Floating decorative elements */}
                    <div className="absolute top-20 left-20 w-32 h-32 bg-blue-400/10 rounded-full blur-3xl"></div>
                    <div className="absolute bottom-20 right-20 w-40 h-40 bg-indigo-400/10 rounded-full blur-3xl"></div>
                    <div className="absolute top-1/2 left-1/3 w-48 h-48 bg-sky-400/5 rounded-full blur-3xl"></div>

                    {/* Top Left Corner Flourish */}
                    <svg
                        className="absolute top-0 left-0 w-40 h-40 lg:w-52 lg:h-52 pointer-events-none z-[5]"
                        viewBox="0 0 200 200"
                        fill="none"
                    >
                        {/* Main corner curve */}
                        <motion.path
                            d="M 0 80 Q 40 80, 60 50 Q 80 20, 120 0"
                            stroke="#ef4444"
                            strokeWidth="3"
                            strokeLinecap="round"
                            fill="none"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 0.8 }}
                            transition={{ delay: 0.3, duration: 1.5, ease: "easeOut" }}
                            style={{ filter: 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.4))' }}
                        />
                        {/* Secondary swirl */}
                        <motion.path
                            d="M 0 50 Q 25 50, 40 30 Q 55 10, 80 0"
                            stroke="#f87171"
                            strokeWidth="2"
                            strokeLinecap="round"
                            fill="none"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 0.6 }}
                            transition={{ delay: 0.6, duration: 1.2, ease: "easeOut" }}
                        />
                        {/* Decorative spiral */}
                        <motion.path
                            d="M 30 100 Q 50 90, 45 70 Q 40 50, 60 45 Q 80 40, 75 60"
                            stroke="#ef4444"
                            strokeWidth="2"
                            strokeLinecap="round"
                            fill="none"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 0.5 }}
                            transition={{ delay: 1.0, duration: 1.5, ease: "easeInOut" }}
                        />
                        {/* Small heart accent */}
                        <motion.path
                            d="M 90 70 C 90 70, 80 60, 80 52 C 80 44, 90 40, 90 48 C 90 40, 100 44, 100 52 C 100 60, 90 70, 90 70"
                            stroke="#dc2626"
                            strokeWidth="1.5"
                            fill="none"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 0.7 }}
                            transition={{ delay: 1.8, duration: 0.8, ease: "easeOut" }}
                        />
                        {/* Dots */}
                        <motion.circle cx="120" cy="20" r="4" fill="#ef4444"
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            transition={{ delay: 1.5, type: "spring" }}
                        />
                        <motion.circle cx="60" cy="50" r="3" fill="#f87171"
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            transition={{ delay: 1.0, type: "spring" }}
                        />
                        <motion.circle cx="30" cy="100" r="5" fill="#dc2626"
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            transition={{ delay: 0.8, type: "spring" }}
                            style={{ filter: 'drop-shadow(0 0 4px rgba(220, 38, 38, 0.6))' }}
                        />
                    </svg>

                    {/* Top Right Corner Flourish */}
                    <svg
                        className="absolute top-0 right-0 w-40 h-40 lg:w-52 lg:h-52 pointer-events-none z-[5]"
                        viewBox="0 0 200 200"
                        fill="none"
                    >
                        {/* Main corner curve - mirrored */}
                        <motion.path
                            d="M 200 80 Q 160 80, 140 50 Q 120 20, 80 0"
                            stroke="#ef4444"
                            strokeWidth="3"
                            strokeLinecap="round"
                            fill="none"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 0.8 }}
                            transition={{ delay: 0.4, duration: 1.5, ease: "easeOut" }}
                            style={{ filter: 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.4))' }}
                        />
                        {/* Secondary swirl - mirrored */}
                        <motion.path
                            d="M 200 50 Q 175 50, 160 30 Q 145 10, 120 0"
                            stroke="#f87171"
                            strokeWidth="2"
                            strokeLinecap="round"
                            fill="none"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 0.6 }}
                            transition={{ delay: 0.7, duration: 1.2, ease: "easeOut" }}
                        />
                        {/* Decorative spiral - mirrored */}
                        <motion.path
                            d="M 170 100 Q 150 90, 155 70 Q 160 50, 140 45 Q 120 40, 125 60"
                            stroke="#ef4444"
                            strokeWidth="2"
                            strokeLinecap="round"
                            fill="none"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 0.5 }}
                            transition={{ delay: 1.1, duration: 1.5, ease: "easeInOut" }}
                        />
                        {/* Small heart accent - mirrored */}
                        <motion.path
                            d="M 110 70 C 110 70, 100 60, 100 52 C 100 44, 110 40, 110 48 C 110 40, 120 44, 120 52 C 120 60, 110 70, 110 70"
                            stroke="#dc2626"
                            strokeWidth="1.5"
                            fill="none"
                            initial={{ pathLength: 0, opacity: 0 }}
                            animate={{ pathLength: 1, opacity: 0.7 }}
                            transition={{ delay: 1.9, duration: 0.8, ease: "easeOut" }}
                        />
                        {/* Dots */}
                        <motion.circle cx="80" cy="20" r="4" fill="#ef4444"
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            transition={{ delay: 1.6, type: "spring" }}
                        />
                        <motion.circle cx="140" cy="50" r="3" fill="#f87171"
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            transition={{ delay: 1.1, type: "spring" }}
                        />
                        <motion.circle cx="170" cy="100" r="5" fill="#dc2626"
                            initial={{ scale: 0 }} animate={{ scale: 1 }}
                            transition={{ delay: 0.9, type: "spring" }}
                            style={{ filter: 'drop-shadow(0 0 4px rgba(220, 38, 38, 0.6))' }}
                        />
                    </svg>

                    <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-8 py-12">
                        {/* Dynamic Header based on step */}
                        <div className="text-center mb-6 lg:mb-10">
                            <motion.div
                                key={`badge-${step}`}
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="inline-block px-4 py-1.5 rounded-full border border-white/20 bg-white/10 backdrop-blur-sm text-white font-semibold text-sm mb-4 shadow-sm"
                            >
                                {step === 1 ? "✨ NEW" : step === 2 ? "🎯 PERSONALIZED" : step === 3 ? "⚡ ALMOST THERE" : step === 4 ? "🔒 FINAL STEP" : "🎉 SUCCESS"}
                            </motion.div>
                            <motion.h2
                                key={`title-${step}`}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="text-2xl lg:text-3xl xl:text-4xl font-bold text-white leading-tight max-w-sm lg:max-w-md"
                            >
                                {step === 1 ? "Reply to comments across your favorite platforms" :
                                    step === 2 ? "Tell us about yourself" :
                                        step === 3 && formData.orgType === 'solo' ? "Built for Creators Like You" :
                                            step === 3 && formData.orgType === 'startup' ? "Scale Your Startup" :
                                                step === 3 && formData.orgType === 'agency' ? "Agency Command Center" :
                                                    step === 3 && formData.orgType === 'enterprise' ? "Enterprise Grade Security" :
                                                        step === 4 ? "Complete your application" :
                                                            "Welcome to the future"}
                            </motion.h2>
                        </div>

                        {/* Dynamic Content - Role-based visuals for step 3+ */}
                        <AnimatePresence mode="wait">
                            {step === 2 ? (
                                <motion.div
                                    key="step2-visual"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    transition={{ duration: 0.5 }}
                                    className="relative w-full max-w-xl lg:max-w-2xl h-[360px] lg:h-[420px] flex items-center justify-center perspective-1000"
                                >
                                    {/* Background Network Nodes */}
                                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                        <svg className="absolute inset-0 w-full h-full opacity-30">
                                            <motion.path
                                                d="M100,300 Q250,100 400,300 T700,300"
                                                fill="none"
                                                stroke="url(#gradient-line)"
                                                strokeWidth="2"
                                                strokeDasharray="10 10"
                                                initial={{ pathLength: 0 }}
                                                animate={{ pathLength: 1 }}
                                                transition={{ duration: 3, ease: "easeInOut" }}
                                            />
                                            <defs>
                                                <linearGradient id="gradient-line" x1="0%" y1="0%" x2="100%" y2="0%">
                                                    <stop offset="0%" stopColor="rgba(59, 130, 246, 0)" />
                                                    <stop offset="50%" stopColor="rgba(59, 130, 246, 0.5)" />
                                                    <stop offset="100%" stopColor="rgba(59, 130, 246, 0)" />
                                                </linearGradient>
                                            </defs>
                                        </svg>
                                        {[1, 2, 3, 4, 5].map((i) => (
                                            <motion.div
                                                key={i}
                                                className="absolute w-1.5 h-1.5 bg-blue-400/50 rounded-full blur-[1px]"
                                                animate={{
                                                    y: [0, -20, 0],
                                                    opacity: [0.3, 0.8, 0.3]
                                                }}
                                                transition={{ duration: 3 + i, repeat: Infinity, ease: "easeInOut", delay: i }}
                                                style={{ left: `${20 * i}%`, top: `${30 + (i % 2) * 40}%` }}
                                            />
                                        ))}
                                    </div>

                                    {/* Main Profile Card */}
                                    <motion.div
                                        className="w-80 bg-white rounded-2xl shadow-2xl overflow-hidden z-20 relative"
                                        initial={{ rotateY: 15, rotateX: 5, opacity: 0, scale: 0.9 }}
                                        animate={{ rotateY: 0, rotateX: 0, opacity: 1, scale: 1 }}
                                        transition={{ type: "spring", stiffness: 50, damping: 20 }}
                                    >
                                        {/* Cover Photo Area */}
                                        <div className="h-28 bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-500 relative overflow-hidden">
                                            <motion.div
                                                className="absolute inset-0 bg-white/10"
                                                animate={{ x: ['-100%', '100%'] }}
                                                transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                                            />
                                            <div className="absolute top-3 right-3 flex gap-1.5">
                                                <div className="w-2 h-2 rounded-full bg-white/40"></div>
                                                <div className="w-2 h-2 rounded-full bg-white/40"></div>
                                            </div>
                                        </div>

                                        <div className="px-6 pb-6 relative">
                                            {/* Avatar with Ring */}
                                            <div className="relative -mt-12 mb-4 w-24 h-24 mx-auto">
                                                <motion.div
                                                    className="absolute inset-0 rounded-full border-2 border-blue-400"
                                                    animate={{ scale: [1, 1.3], opacity: [0.8, 0] }}
                                                    transition={{ repeat: Infinity, duration: 2 }}
                                                />
                                                <div className="w-full h-full rounded-full border-[4px] border-white bg-white overflow-hidden shadow-md relative z-10">
                                                    <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${hoveredRole || formData.orgType || formData.name || 'user'}`} alt="avatar" className="w-full h-full object-cover" />
                                                </div>
                                                {/* Verification Badge */}
                                                <motion.div
                                                    initial={{ scale: 0 }}
                                                    animate={{ scale: 1 }}
                                                    transition={{ delay: 0.8, type: "spring" }}
                                                    className="absolute bottom-1 right-1 w-6 h-6 bg-blue-500 rounded-full border-2 border-white flex items-center justify-center text-white text-[10px] z-20"
                                                >
                                                    ✓
                                                </motion.div>
                                            </div>

                                            {/* Name & Bio Animation */}
                                            <div className="space-y-3 text-center mb-6">
                                                <div className="h-5 bg-gray-100 rounded-full w-2/3 mx-auto overflow-hidden relative">
                                                    {(hoveredRole || formData.orgType) ? (
                                                        <motion.div
                                                            key="active"
                                                            className="absolute inset-0 bg-gradient-to-r from-gray-200 to-gray-100"
                                                            initial={{ width: 0 }}
                                                            animate={{ width: "100%" }}
                                                            transition={{ delay: 0, duration: 0.8 }}
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 font-medium">
                                                            Select your profile
                                                        </div>
                                                    )}
                                                </div>
                                                <div className={`h-2.5 rounded-full w-1/2 mx-auto transition-colors ${hoveredRole ? 'bg-blue-100' : 'bg-gray-50'}`}></div>
                                            </div>

                                            {/* Stats/Info Row */}
                                            <div className="flex justify-between items-center py-4 border-t border-gray-100">
                                                <div className="text-center group cursor-pointer">
                                                    <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold group-hover:text-blue-500 transition-colors">Setup</div>
                                                    <div className="text-sm font-bold text-gray-800 tabular-nums">
                                                        {(hoveredRole || formData.orgType) === 'solo' ? '85%' :
                                                            (hoveredRole || formData.orgType) === 'startup' ? '40%' :
                                                                (hoveredRole || formData.orgType) === 'agency' ? '92%' :
                                                                    (hoveredRole || formData.orgType) === 'enterprise' ? '20%' : '-'}
                                                    </div>
                                                </div>
                                                <div className="h-8 w-px bg-gray-100"></div>
                                                <div className="text-center group cursor-pointer w-24">
                                                    <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold group-hover:text-blue-500 transition-colors">Role</div>
                                                    <div className="text-sm font-bold text-gray-800 capitalize transition-all">
                                                        {hoveredRole || formData.orgType || "Select"}
                                                    </div>
                                                </div>
                                                <div className="h-8 w-px bg-gray-100"></div>
                                                <div className="text-center group cursor-pointer">
                                                    <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold group-hover:text-blue-500 transition-colors">Level</div>
                                                    <div className={`text-xs px-2 py-0.5 rounded-full font-bold transition-colors ${(hoveredRole || formData.orgType) ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'
                                                        }`}>
                                                        {(hoveredRole || formData.orgType) === 'solo' ? 'Pro' :
                                                            (hoveredRole || formData.orgType) === 'startup' ? 'Growth' :
                                                                (hoveredRole || formData.orgType) === 'agency' ? 'Elite' :
                                                                    (hoveredRole || formData.orgType) === 'enterprise' ? 'MAX' : '-'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>

                                    {/* Dynamic Floating Badges */}
                                    <motion.div
                                        className="absolute top-20 right-10 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-xl border border-white/50 z-30 flex items-center gap-2"
                                        initial={{ x: 50, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        transition={{ delay: 1, type: "spring" }}
                                    >
                                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                        <span className="text-xs font-bold text-gray-700">Profile Active</span>
                                    </motion.div>

                                    <motion.div
                                        className="absolute bottom-24 left-16 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg shadow-xl border border-white/50 z-30"
                                        initial={{ x: -50, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        transition={{ delay: 1.2, type: "spring" }}
                                    >
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs font-bold text-blue-600">#Growth</span>
                                            <span className="text-gray-300">|</span>
                                            <span className="text-xs font-bold text-purple-600">#Scale</span>
                                        </div>
                                    </motion.div>

                                    {/* NEW: Setup Checklist Card (Left) */}
                                    <motion.div
                                        className="absolute top-12 -left-4 w-48 bg-white/95 backdrop-blur rounded-xl p-3 shadow-lg border border-white/60 z-10 hidden lg:block"
                                        initial={{ x: -30, opacity: 0, rotate: -5 }}
                                        animate={{ x: 0, opacity: 1, rotate: -5 }}
                                        transition={{ delay: 1.4, duration: 0.6 }}
                                    >
                                        <div className="text-[10px] font-bold text-gray-400 mb-2 uppercase tracking-wide">Setup Checklist</div>
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                </div>
                                                <div className="text-xs text-gray-600 font-medium">Link Socials</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                                                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                                </div>
                                                <div className="text-xs text-gray-600 font-medium">Select Niche</div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <div className="w-4 h-4 bg-gray-200 rounded-full animate-pulse"></div>
                                                <div className="text-xs text-gray-400">Add Bio</div>
                                            </div>
                                        </div>
                                    </motion.div>

                                    {/* NEW: Potential Reach Card (Right Bottom) */}
                                    <motion.div
                                        className="absolute -bottom-4 -right-2 w-40 bg-white/95 backdrop-blur rounded-xl p-3 shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/60 z-40"
                                        initial={{ y: 20, opacity: 0 }}
                                        animate={{ y: 0, opacity: 1 }}
                                        transition={{ delay: 1.6, duration: 0.6 }}
                                    >
                                        <div className="flex justify-between items-end mb-1">
                                            <div className="text-[10px] text-gray-500">Est. Reach</div>
                                            <div className="text-xs font-bold text-green-600">+2.4k</div>
                                        </div>
                                        <div className="h-16 flex items-end justify-between gap-1">
                                            {[40, 65, 45, 80, 55, 90].map((h, i) => (
                                                <motion.div
                                                    key={i}
                                                    className="w-full bg-gradient-to-t from-blue-300 to-blue-500 rounded-t-[2px]"
                                                    initial={{ height: 0 }}
                                                    animate={{ height: `${h}%` }}
                                                    transition={{ delay: 1.8 + (i * 0.1), duration: 0.4 }}
                                                />
                                            ))}
                                        </div>
                                    </motion.div>
                                </motion.div>
                            ) : (step >= 3 && formData.orgType) ? (
                                <motion.div
                                    key={`role-${formData.orgType}`}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.5 }}
                                    className="relative w-full max-w-xl lg:max-w-2xl h-[360px] lg:h-[420px]"
                                >
                                    {/* --- CREATOR SCENE --- */}
                                    {formData.orgType === 'solo' && (
                                        <>
                                            {/* Main Content Card - Viral Post */}
                                            <motion.div
                                                initial={{ y: 20, opacity: 0, rotate: -2 }}
                                                animate={{ y: 0, opacity: 1, rotate: -2 }}
                                                transition={{ type: "spring", delay: 0.2 }}
                                                className="absolute left-1/2 -translate-x-1/2 top-8 w-64 bg-white rounded-2xl shadow-2xl p-4 z-20 border border-white/60"
                                                style={{ boxShadow: '0 25px 50px -12px rgba(244, 63, 94, 0.25)' }}
                                            >
                                                <div className="flex items-center gap-2 mb-3">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 p-0.5">
                                                        <div className="w-full h-full rounded-full bg-white border-2 border-transparent">
                                                            <div className="w-full h-full rounded-full bg-gray-200 overflow-hidden">
                                                                <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${formData.name}`} alt="avatar" className="w-full h-full object-cover" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <div className="h-2.5 w-20 bg-gray-200 rounded-full mb-1"></div>
                                                        <div className="h-2 w-12 bg-gray-100 rounded-full"></div>
                                                    </div>
                                                </div>
                                                <div className="w-full aspect-[4/5] bg-gray-100 rounded-lg mb-3 overflow-hidden relative group">
                                                    <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 flex flex-col justify-end p-3">
                                                        <div className="flex gap-2">
                                                            <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">❤️</div>
                                                            <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">💬</div>
                                                            <div className="h-8 w-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">🚀</div>
                                                        </div>
                                                    </div>
                                                    {/* Exploding likes animation */}
                                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                        <motion.div
                                                            animate={{ scale: [1, 1.5, 1], opacity: [0, 1, 0] }}
                                                            transition={{ repeat: Infinity, duration: 2 }}
                                                            className="text-6xl drop-shadow-lg"
                                                        >
                                                            ❤️
                                                        </motion.div>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="h-2 w-full bg-gray-100 rounded-full"></div>
                                                    <div className="h-2 w-3/4 bg-gray-100 rounded-full"></div>
                                                </div>
                                            </motion.div>

                                            {/* Floating Card - AI Ideas */}
                                            <motion.div
                                                initial={{ x: -50, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                transition={{ delay: 0.4 }}
                                                className="absolute left-0 top-20 w-48 bg-white/90 backdrop-blur-md rounded-xl p-3 shadow-xl z-30 border border-white/50"
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-lg">✨</span>
                                                    <span className="text-xs font-bold text-gray-800">AI Ideas</span>
                                                </div>
                                                <div className="space-y-1.5">
                                                    {['Summer Vlog', 'Day in life', 'Tech Review'].map((tag, i) => (
                                                        <motion.div
                                                            key={i}
                                                            initial={{ width: 0 }}
                                                            animate={{ width: '100%' }}
                                                            transition={{ delay: 0.6 + (i * 0.1) }}
                                                            className="flex items-center justify-between bg-pink-50 rounded-md px-2 py-1.5"
                                                        >
                                                            <span className="text-[10px] font-medium text-pink-600">{tag}</span>
                                                            <div className="w-1.5 h-1.5 rounded-full bg-pink-500"></div>
                                                        </motion.div>
                                                    ))}
                                                </div>
                                            </motion.div>

                                            {/* Floating Card - Trend Alert */}
                                            <motion.div
                                                initial={{ x: 50, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                transition={{ delay: 0.5 }}
                                                className="absolute right-0 bottom-32 w-44 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl p-3 shadow-xl z-30 text-white"
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-lg">📈</span>
                                                    <span className="text-xs font-bold">Trend Alert</span>
                                                </div>
                                                <div className="h-12 flex items-end gap-1 mb-1">
                                                    {[30, 50, 40, 70, 60, 90, 80].map((h, i) => (
                                                        <motion.div
                                                            key={i}
                                                            initial={{ height: 0 }}
                                                            animate={{ height: `${h}%` }}
                                                            transition={{ delay: 0.8 + (i * 0.05) }}
                                                            className="flex-1 bg-white/30 rounded-t-sm"
                                                        ></motion.div>
                                                    ))}
                                                </div>
                                                <div className="text-[10px] opacity-80">+145% vs last week</div>
                                            </motion.div>
                                        </>
                                    )}

                                    {/* --- STARTUP SCENE --- */}
                                    {formData.orgType === 'startup' && (
                                        <>
                                            {/* Main Chart Card - Revenue Growth */}
                                            <motion.div
                                                initial={{ scale: 0.95, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                transition={{ type: "spring", delay: 0.1 }}
                                                className="absolute inset-x-6 top-10 bottom-24 bg-white rounded-2xl shadow-2xl overflow-hidden border border-white/60 z-10"
                                            >
                                                {/* Header */}
                                                <div className="p-5 border-b border-gray-100 flex justify-between items-start">
                                                    <div>
                                                        <div className="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-1">Total Revenue</div>
                                                        <div className="flex items-baseline gap-2">
                                                            <span className="text-3xl font-bold text-gray-900">$124,500</span>
                                                            <span className="text-xs font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">+24% MoM</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <div className="px-2 py-1 bg-gray-50 rounded-md border border-gray-100 text-[10px] font-medium text-gray-500">USD</div>
                                                        <div className="px-2 py-1 bg-gray-50 rounded-md border border-gray-100 text-[10px] font-medium text-gray-500">30D</div>
                                                    </div>
                                                </div>

                                                {/* Professional Line Chart */}
                                                <div className="relative h-48 w-full mt-2">
                                                    {/* Grid Lines */}
                                                    <div className="absolute inset-0 flex flex-col justify-between px-5 pb-5 opacity-20 pointer-events-none">
                                                        {[...Array(5)].map((_, i) => (
                                                            <div key={i} className="w-full h-px bg-dashed border-t border-gray-300"></div>
                                                        ))}
                                                    </div>

                                                    <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 50" preserveAspectRatio="none">
                                                        <defs>
                                                            <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                                                                <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.25" />
                                                                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0" />
                                                            </linearGradient>
                                                        </defs>
                                                        <motion.path
                                                            d="M0,45 L10,42 L20,38 L30,40 L40,32 L50,35 L60,25 L70,28 L80,15 L90,18 L100,5 L100,50 L0,50 Z"
                                                            fill="url(#revenueGradient)"
                                                            initial={{ opacity: 0 }}
                                                            animate={{ opacity: 1 }}
                                                            transition={{ duration: 1 }}
                                                        />
                                                        <motion.path
                                                            d="M0,45 L10,42 L20,38 L30,40 L40,32 L50,35 L60,25 L70,28 L80,15 L90,18 L100,5"
                                                            fill="none"
                                                            stroke="#8b5cf6"
                                                            strokeWidth="1.5"
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            initial={{ pathLength: 0 }}
                                                            animate={{ pathLength: 1 }}
                                                            transition={{ duration: 1.5, ease: "easeOut" }}
                                                        />
                                                    </svg>

                                                    {/* Hover Tooltip Mockup */}
                                                    <motion.div
                                                        className="absolute top-[20%] right-[18%] bg-gray-900 text-white text-[10px] py-1 px-2 rounded-md shadow-lg"
                                                        initial={{ opacity: 0, y: 5 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        transition={{ delay: 1.5 }}
                                                    >
                                                        $12,450
                                                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-900 rotate-45"></div>
                                                    </motion.div>
                                                    <motion.div
                                                        className="absolute top-[30%] right-[18%] w-3 h-3 bg-white border-2 border-violet-500 rounded-full shadow z-10"
                                                        initial={{ scale: 0 }}
                                                        animate={{ scale: 1 }}
                                                        transition={{ delay: 1.5 }}
                                                    />
                                                </div>
                                            </motion.div>

                                            {/* Floating Panel 1 - Runway (Left) */}
                                            <motion.div
                                                initial={{ x: -20, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                transition={{ delay: 0.3 }}
                                                className="absolute left-0 bottom-8 w-40 bg-white/90 backdrop-blur rounded-xl p-3 shadow-lg border border-white/50 z-20"
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-orange-600 text-xs">🔥</div>
                                                    <div className="text-[10px] font-bold text-gray-600 uppercase">Runway</div>
                                                </div>
                                                <div className="text-xl font-bold text-gray-800 mb-1">18 Mos</div>
                                                <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                    <motion.div
                                                        className="h-full bg-gradient-to-r from-orange-400 to-red-400"
                                                        initial={{ width: 0 }}
                                                        animate={{ width: "65%" }}
                                                        transition={{ delay: 0.6, duration: 1 }}
                                                    />
                                                </div>
                                            </motion.div>

                                            {/* Floating Panel 2 - Active Users (Right) */}
                                            <motion.div
                                                initial={{ x: 20, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                transition={{ delay: 0.4 }}
                                                className="absolute right-0 bottom-12 w-44 bg-white/90 backdrop-blur rounded-xl p-3 shadow-lg border border-white/50 z-20"
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="text-[10px] font-bold text-gray-500 uppercase">Active Users</div>
                                                    <span className="flex h-2 w-2 relative">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                                    </span>
                                                </div>
                                                <div className="flex items-end justify-between">
                                                    <div className="text-2xl font-bold text-gray-800">14.2k</div>
                                                    <div className="flex -space-x-1.5">
                                                        {[1, 2, 3].map(i => (
                                                            <div key={i} className="w-5 h-5 rounded-full border border-white bg-gray-200"></div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </motion.div>

                                            {/* Floating Panel 3 - Infrastructure (Top Right) */}
                                            <motion.div
                                                initial={{ y: -10, opacity: 0 }}
                                                animate={{ y: 0, opacity: 1 }}
                                                transition={{ delay: 0.5 }}
                                                className="absolute right-4 top-4 bg-black/80 backdrop-blur text-white px-3 py-1.5 rounded-full text-[10px] font-medium flex items-center gap-1.5 shadow-xl z-20"
                                            >
                                                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></div>
                                                Systems Operational
                                            </motion.div>
                                        </>
                                    )}

                                    {/* --- AGENCY SCENE --- */}
                                    {formData.orgType === 'agency' && (
                                        <>
                                            {/* Stacked Client Cards */}
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                {[2, 1, 0].map((i) => (
                                                    <motion.div
                                                        key={i}
                                                        initial={{ y: 20 * i, scale: 1 - (i * 0.05), opacity: 0 }}
                                                        animate={{ y: 10 * i, scale: 1 - (i * 0.05), opacity: 1 - (i * 0.15) }}
                                                        transition={{ delay: 0.2 + (i * 0.1) }}
                                                        className="absolute top-12 w-72 bg-white rounded-xl shadow-2xl p-4 border border-white/60"
                                                        style={{
                                                            zIndex: 10 - i,
                                                            transformOrigin: 'top center'
                                                        }}
                                                    >
                                                        <div className="flex items-center justify-between mb-4">
                                                            <div className="flex items-center gap-2">
                                                                <div className={`w-8 h-8 rounded-lg ${i === 0 ? 'bg-blue-500' : 'bg-gray-200'} flex items-center justify-center text-white font-bold`}>
                                                                    {i === 0 ? 'C1' : `C${i + 1}`}
                                                                </div>
                                                                <div>
                                                                    <div className="text-xs font-bold text-gray-800">Client {i === 0 ? 'Alpha' : 'Beta'}</div>
                                                                    <div className="text-[10px] text-gray-400">Enterprise Plan</div>
                                                                </div>
                                                            </div>
                                                            <div className={`text-[10px] px-2 py-0.5 rounded-full ${i === 0 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                                                                {i === 0 ? 'Active' : 'Pending'}
                                                            </div>
                                                        </div>

                                                        {i === 0 && (
                                                            <div className="space-y-2">
                                                                <div className="flex justify-between text-[10px] text-gray-500">
                                                                    <span>Performance</span>
                                                                    <span className="font-bold text-gray-800">98/100</span>
                                                                </div>
                                                                <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                                                                    <motion.div
                                                                        initial={{ width: 0 }}
                                                                        animate={{ width: '98%' }}
                                                                        transition={{ delay: 0.8 }}
                                                                        className="h-full bg-blue-500 rounded-full"
                                                                    ></motion.div>
                                                                </div>
                                                                <div className="flex gap-2 mt-2">
                                                                    <div className="flex-1 bg-blue-50 p-2 rounded-lg text-center">
                                                                        <div className="text-lg font-bold text-blue-600">45k</div>
                                                                        <div className="text-[9px] text-blue-400">Reach</div>
                                                                    </div>
                                                                    <div className="flex-1 bg-cyan-50 p-2 rounded-lg text-center">
                                                                        <div className="text-lg font-bold text-cyan-600">8.2%</div>
                                                                        <div className="text-[9px] text-cyan-400">Conv.</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </motion.div>
                                                ))}
                                            </div>

                                            {/* Floating Success Notification */}
                                            <motion.div
                                                initial={{ x: 50, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                transition={{ delay: 1 }}
                                                className="absolute right-0 top-20 bg-white rounded-lg shadow-xl p-3 flex items-center gap-3 z-30"
                                            >
                                                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">✅</div>
                                                <div>
                                                    <div className="text-xs font-bold text-gray-800">Report Ready</div>
                                                    <div className="text-[10px] text-gray-400">Client Alpha - Oct</div>
                                                </div>
                                            </motion.div>
                                        </>
                                    )}

                                    {/* --- ENTERPRISE SCENE --- */}
                                    {formData.orgType === 'enterprise' && (
                                        <>
                                            {/* Shield/Security Central Visual */}
                                            <motion.div
                                                className="absolute inset-0 flex items-center justify-center"
                                                initial={{ scale: 0.8, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                transition={{ duration: 0.5 }}
                                            >
                                                <div className="relative w-64 h-64">
                                                    {/* Rotating rings */}
                                                    {[1, 2, 3].map((ring) => (
                                                        <motion.div
                                                            key={ring}
                                                            animate={{ rotate: ring % 2 === 0 ? -360 : 360 }}
                                                            transition={{
                                                                repeat: Infinity,
                                                                duration: 10 + ring * 5,
                                                                ease: "linear"
                                                            }}
                                                            className="absolute inset-0 border border-emerald-500/20 rounded-full"
                                                            style={{ margin: ring * 15 }}
                                                        >
                                                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 bg-emerald-400 rounded-full shadow-[0_0_10px_rgba(52,211,153,0.8)]"></div>
                                                        </motion.div>
                                                    ))}

                                                    {/* Central Shield */}
                                                    <div className="absolute inset-0 flex items-center justify-center">
                                                        <motion.div
                                                            initial={{ opacity: 0, scale: 0.5 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            transition={{ delay: 0.5, type: "spring" }}
                                                            className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-5xl shadow-[0_0_40px_rgba(16,185,129,0.4)]"
                                                        >
                                                            🛡️
                                                        </motion.div>
                                                    </div>
                                                </div>
                                            </motion.div>

                                            {/* Floating Compliance Cards */}
                                            <motion.div
                                                initial={{ x: -50, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                transition={{ delay: 0.8 }}
                                                className="absolute left-8 top-12 bg-white/90 backdrop-blur-md px-4 py-2 rounded-lg shadow-lg border-l-4 border-emerald-500"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                                    <span className="text-xs font-bold text-gray-800">SOC2 Compliant</span>
                                                </div>
                                            </motion.div>

                                            <motion.div
                                                initial={{ x: 50, opacity: 0 }}
                                                animate={{ x: 0, opacity: 1 }}
                                                transition={{ delay: 1 }}
                                                className="absolute right-8 bottom-32 bg-white/90 backdrop-blur-md px-4 py-2 rounded-lg shadow-lg border-l-4 border-teal-500"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="text-lg">🔐</span>
                                                    <span className="text-xs font-bold text-gray-800">SSO Enchanted</span>
                                                </div>
                                            </motion.div>

                                            {/* Data Flow Lines */}
                                            <svg className="absolute inset-0 pointer-events-none opacity-40">
                                                <motion.path
                                                    d="M 50 100 Q 150 50 250 100"
                                                    fill="none"
                                                    stroke="#10b981"
                                                    strokeWidth="2"
                                                    initial={{ pathLength: 0 }}
                                                    animate={{ pathLength: 1 }}
                                                    transition={{ duration: 2, repeat: Infinity }}
                                                />
                                            </svg>
                                        </>
                                    )}
                                </motion.div>
                            ) : (
                                /* Default Stacked Cards for steps 1-2 */
                                <div key="default-cards" className="relative w-full max-w-xl lg:max-w-2xl h-[320px] lg:h-[380px]">

                                    {/* Animated trailing heart line */}
                                    <svg
                                        className="absolute inset-0 w-full h-full pointer-events-none z-[60]"
                                        viewBox="0 0 500 400"
                                        fill="none"
                                        preserveAspectRatio="xMidYMid meet"
                                    >
                                        {/* Main heart trail */}
                                        <motion.path
                                            d="M 250 340 
                                       C 250 340, 100 220, 100 150 
                                       C 100 80, 175 50, 250 120 
                                       C 325 50, 400 80, 400 150 
                                       C 400 220, 250 340, 250 340"
                                            stroke="#ef4444"
                                            strokeWidth="4"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            fill="none"
                                            initial={{ pathLength: 0, opacity: 0 }}
                                            animate={{ pathLength: 1, opacity: 1 }}
                                            transition={{ delay: 0.5, duration: 2.5, ease: "easeInOut" }}
                                            style={{ filter: 'drop-shadow(0 0 8px rgba(239, 68, 68, 0.6))' }}
                                        />

                                        {/* Second smaller heart inside */}
                                        <motion.path
                                            d="M 250 280 
                                       C 250 280, 160 200, 160 155 
                                       C 160 110, 205 90, 250 135 
                                       C 295 90, 340 110, 340 155 
                                       C 340 200, 250 280, 250 280"
                                            stroke="#f87171"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            fill="none"
                                            initial={{ pathLength: 0, opacity: 0 }}
                                            animate={{ pathLength: 1, opacity: 0.7 }}
                                            transition={{ delay: 1.5, duration: 2, ease: "easeInOut" }}
                                            style={{ filter: 'drop-shadow(0 0 6px rgba(248, 113, 113, 0.5))' }}
                                        />

                                        {/* Decorative swirl from heart */}
                                        <motion.path
                                            d="M 100 150 Q 60 180, 80 220 Q 100 260, 60 280"
                                            stroke="#ef4444"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            fill="none"
                                            initial={{ pathLength: 0, opacity: 0 }}
                                            animate={{ pathLength: 1, opacity: 0.6 }}
                                            transition={{ delay: 2.0, duration: 1.2, ease: "easeOut" }}
                                        />

                                        {/* Decorative swirl on right */}
                                        <motion.path
                                            d="M 400 150 Q 440 180, 420 220 Q 400 260, 440 280"
                                            stroke="#ef4444"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            fill="none"
                                            initial={{ pathLength: 0, opacity: 0 }}
                                            animate={{ pathLength: 1, opacity: 0.6 }}
                                            transition={{ delay: 2.2, duration: 1.2, ease: "easeOut" }}
                                        />

                                        {/* Small hearts scattered */}
                                        <motion.path
                                            d="M 70 100 C 70 100, 55 85, 55 75 C 55 65, 70 60, 70 70 C 70 60, 85 65, 85 75 C 85 85, 70 100, 70 100"
                                            stroke="#f87171"
                                            strokeWidth="1.5"
                                            fill="none"
                                            initial={{ pathLength: 0, opacity: 0 }}
                                            animate={{ pathLength: 1, opacity: 0.8 }}
                                            transition={{ delay: 2.5, duration: 0.8, ease: "easeOut" }}
                                        />

                                        <motion.path
                                            d="M 430 90 C 430 90, 415 75, 415 65 C 415 55, 430 50, 430 60 C 430 50, 445 55, 445 65 C 445 75, 430 90, 430 90"
                                            stroke="#f87171"
                                            strokeWidth="1.5"
                                            fill="none"
                                            initial={{ pathLength: 0, opacity: 0 }}
                                            animate={{ pathLength: 1, opacity: 0.8 }}
                                            transition={{ delay: 2.7, duration: 0.8, ease: "easeOut" }}
                                        />

                                        <motion.path
                                            d="M 250 380 C 250 380, 240 370, 240 363 C 240 356, 250 352, 250 358 C 250 352, 260 356, 260 363 C 260 370, 250 380, 250 380"
                                            stroke="#ef4444"
                                            strokeWidth="1.5"
                                            fill="none"
                                            initial={{ pathLength: 0, opacity: 0 }}
                                            animate={{ pathLength: 1, opacity: 0.8 }}
                                            transition={{ delay: 2.9, duration: 0.8, ease: "easeOut" }}
                                        />

                                        {/* Animated dots along the path */}
                                        <motion.circle
                                            cx="250" cy="120" r="5"
                                            fill="#ef4444"
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ delay: 1.2, duration: 0.4, type: "spring" }}
                                            style={{ filter: 'drop-shadow(0 0 4px rgba(239, 68, 68, 0.8))' }}
                                        />
                                        <motion.circle
                                            cx="175" cy="85" r="4"
                                            fill="#f87171"
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ delay: 1.5, duration: 0.4, type: "spring" }}
                                        />
                                        <motion.circle
                                            cx="325" cy="85" r="4"
                                            fill="#f87171"
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ delay: 1.8, duration: 0.4, type: "spring" }}
                                        />
                                        <motion.circle
                                            cx="250" cy="340" r="6"
                                            fill="#dc2626"
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ delay: 2.5, duration: 0.4, type: "spring" }}
                                            style={{ filter: 'drop-shadow(0 0 6px rgba(220, 38, 38, 0.8))' }}
                                        />
                                    </svg>
                                    {/* Handwritten annotation with character-by-character writing animation */}
                                    <div className="absolute -top-4 right-0 xl:right-8 z-30">
                                        <p
                                            className="font-handwriting text-red-600 text-sm xl:text-base italic transform rotate-[-5deg]"
                                            style={{ fontFamily: 'Georgia, serif' }}
                                        >
                                            {"and track your consistency →".split("").map((char, index) => (
                                                <motion.span
                                                    key={index}
                                                    initial={{ opacity: 0, y: 5 }}
                                                    animate={{ opacity: 1, y: 0 }}
                                                    transition={{
                                                        delay: 1.5 + (index * 0.05),
                                                        duration: 0.1,
                                                        ease: "easeOut"
                                                    }}
                                                >
                                                    {char}
                                                </motion.span>
                                            ))}
                                        </p>
                                    </div>

                                    {/* Background Card - Channels List */}
                                    <motion.div
                                        initial={{ opacity: 0, x: -30, rotate: -8 }}
                                        animate={{ opacity: 1, x: 0, rotate: -6 }}
                                        transition={{ delay: 0.5, type: "spring" }}
                                        className="absolute left-0 lg:left-4 top-12 w-40 lg:w-48 bg-white rounded-xl shadow-2xl shadow-black/20 p-3 z-10 border border-white/50"
                                        style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 30px rgba(255, 255, 255, 0.1)' }}
                                    >
                                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
                                                <span className="text-white text-xs font-bold">V</span>
                                            </div>
                                            <span className="text-xs font-bold text-gray-800">Channels</span>
                                            <span className="ml-auto text-[10px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-bold">24</span>
                                        </div>
                                        <div className="space-y-2">
                                            {[
                                                { gradient: 'from-pink-500 to-rose-500', icon: '📸', name: 'Instagram', count: 12, active: true },
                                                { gradient: 'from-blue-400 to-blue-600', icon: '🐦', name: 'Twitter', count: 8, active: false },
                                                { gradient: 'from-red-500 to-red-600', icon: '▶️', name: 'YouTube', count: 4, active: false },
                                                { gradient: 'from-blue-600 to-blue-700', icon: '💼', name: 'LinkedIn', count: 3, active: false },
                                            ].map((item, i) => (
                                                <div key={i} className={`flex items-center gap-2 p-1.5 rounded-lg transition-colors ${item.active ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                                                    <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${item.gradient} flex items-center justify-center text-[10px] shadow-sm`}>
                                                        {item.icon}
                                                    </div>
                                                    <span className={`text-[11px] flex-1 ${item.active ? 'text-indigo-600 font-semibold' : 'text-gray-600'}`}>{item.name}</span>
                                                    <span className={`text-[10px] ${item.active ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-500'} px-1.5 py-0.5 rounded-full font-medium`}>{item.count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </motion.div>

                                    {/* Main Card - Community Dashboard */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.4, type: "spring" }}
                                        className="relative mx-auto w-[280px] lg:w-[320px] bg-white rounded-2xl shadow-2xl p-4 z-20 border border-white/50"
                                        style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 30px rgba(255, 255, 255, 0.1)' }}
                                    >
                                        {/* Window controls */}
                                        <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
                                            <div className="flex gap-1.5">
                                                <div className="w-3 h-3 rounded-full bg-red-400 shadow-inner"></div>
                                                <div className="w-3 h-3 rounded-full bg-amber-400 shadow-inner"></div>
                                                <div className="w-3 h-3 rounded-full bg-green-400 shadow-inner"></div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] bg-gradient-to-r from-indigo-100 to-purple-100 px-2.5 py-1 rounded-full text-indigo-600 font-semibold">Community</span>
                                            </div>
                                        </div>

                                        {/* Comment content */}
                                        <div className="space-y-3">
                                            <div className="flex items-start gap-3">
                                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-400 via-pink-400 to-rose-400 flex-shrink-0 shadow-lg shadow-purple-500/20 flex items-center justify-center text-white text-sm font-bold">
                                                    D
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-bold text-gray-800">The Dog Guy</span>
                                                        <span className="text-[9px] bg-green-100 text-green-600 px-1.5 py-0.5 rounded-full font-bold">⚡ 89</span>
                                                    </div>
                                                    <p className="text-[11px] text-gray-500 leading-relaxed">
                                                        @joey_01 commented on your post
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="bg-gradient-to-br from-gray-50 to-gray-100/50 rounded-xl p-3 border border-gray-100">
                                                <p className="text-xs text-gray-700 leading-relaxed">
                                                    "This is exactly what I needed! 🙌 Your tips are amazing. Keep up the great content!"
                                                </p>
                                                <div className="flex items-center gap-3 mt-2 pt-2 border-t border-gray-100">
                                                    <span className="text-[10px] text-gray-400">2 min ago</span>
                                                    <span className="text-[10px] text-gray-400">•</span>
                                                    <span className="text-[10px] text-pink-500 font-medium">❤️ 24 likes</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between pt-1">
                                                <div className="flex gap-3">
                                                    <span className="text-[11px] text-indigo-500 font-medium cursor-pointer hover:underline">💬 Reply</span>
                                                    <span className="text-[11px] text-gray-400 cursor-pointer hover:text-gray-600">❤️ Like</span>
                                                </div>
                                                <button className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white text-[11px] font-bold rounded-lg shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all hover:scale-105">
                                                    Quick Reply →
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>

                                    {/* Right Card - Analytics Overview */}
                                    <motion.div
                                        initial={{ opacity: 0, x: 30, rotate: 5 }}
                                        animate={{ opacity: 1, x: 0, rotate: 3 }}
                                        transition={{ delay: 0.6, type: "spring" }}
                                        className="absolute right-0 lg:right-4 top-8 w-44 lg:w-52 bg-white rounded-xl shadow-2xl p-3 z-10 border border-white/50"
                                        style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 30px rgba(255, 255, 255, 0.1)' }}
                                    >
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-[11px] font-bold text-gray-800">Analytics</span>
                                            <span className="text-[9px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-semibold">● Live</span>
                                        </div>

                                        {/* Mini chart */}
                                        <div className="flex items-end gap-1 h-12 mb-3">
                                            {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                                                <div key={i} className="flex-1 bg-gradient-to-t from-indigo-500 to-purple-400 rounded-t-sm" style={{ height: `${h}%` }}></div>
                                            ))}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="bg-gray-50 rounded-lg p-2 text-center">
                                                <p className="text-lg font-bold text-gray-800">24k</p>
                                                <p className="text-[9px] text-gray-400 font-medium">Followers</p>
                                            </div>
                                            <div className="bg-emerald-50 rounded-lg p-2 text-center">
                                                <p className="text-lg font-bold text-emerald-500">+18%</p>
                                                <p className="text-[9px] text-gray-400 font-medium">Growth</p>
                                            </div>
                                        </div>
                                    </motion.div>

                                    {/* Bottom Card - Engagement Stats */}
                                    <motion.div
                                        initial={{ opacity: 0, y: 20 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: 0.7 }}
                                        className="absolute left-1/2 -translate-x-1/2 bottom-0 w-72 lg:w-80 bg-white rounded-xl shadow-2xl p-3 z-15 border border-white/50"
                                        style={{ boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4), 0 0 30px rgba(255, 255, 255, 0.1)' }}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                                <span className="text-xl">📊</span>
                                            </div>
                                            <div className="flex-1">
                                                <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">This Week</p>
                                                <p className="text-base font-bold text-gray-800">+2,847 engagements</p>
                                            </div>
                                            <div className="text-right">
                                                <div className="flex items-center gap-1 text-emerald-500">
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                                                    </svg>
                                                    <span className="text-xl font-bold">23%</span>
                                                </div>
                                                <p className="text-[9px] text-gray-400">vs last week</p>
                                            </div>
                                        </div>
                                    </motion.div>

                                    {/* Floating notification badge */}
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: 1, type: "spring" }}
                                        className="absolute top-0 left-1/3 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded-full shadow-lg z-30"
                                    >
                                        +5 new
                                    </motion.div>
                                </div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
}
