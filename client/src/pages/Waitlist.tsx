import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import veeforeLogo from '@assets/output-onlinepngtools_1754852514040.png';
import { 
  Sparkles, 
  ArrowRight,
  ArrowLeft,
  Mail,
  User,
  Copy,
  Check,
  Users,
  Crown,
  Gift,
  Heart,
  Zap,
  Shield,
  ChevronRight,
  ChevronLeft,
  Award,
  CheckCircle,
  Flame,
  Brain,
  BarChart3,
  Calendar,
  Clock,
  Rocket,
  Play,
  Pause,
  Bot,
  Share2,
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface WaitlistFormData {
  name: string;
  email: string;
  referredBy: string;
}

interface WaitlistResponse {
  success: boolean;
  message: string;
  referralCode?: string;
  position?: number;
  estimatedAccess?: string;
}

const Waitlist = () => {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [formData, setFormData] = useState<WaitlistFormData>({
    name: '',
    email: '',
    referredBy: ''
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [waitlistData, setWaitlistData] = useState<WaitlistResponse | null>(null);
  
  // OTP Verification state
  const [showOTPModal, setShowOTPModal] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [developmentOtp, setDevelopmentOtp] = useState<string | null>(null);
  const [pendingUser, setPendingUser] = useState<{ name: string; email: string } | null>(null);
  
  // Questionnaire state
  const [showQuestionnaire, setShowQuestionnaire] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [questionnaireData, setQuestionnaireData] = useState({
    businessType: '',
    teamSize: '',
    currentTools: [],
    primaryGoal: '',
    contentTypes: [],
    budget: '',
    urgency: ''
  });

  // Questionnaire questions
  const questions = [
    {
      id: 'businessType',
      title: 'What describes you best?',
      type: 'single-choice',
      options: [
        { value: 'creator', label: 'Content Creator', icon: '🎨', desc: 'Individual influencer or creator' },
        { value: 'business', label: 'Business Owner', icon: '🏢', desc: 'Running a business or brand' },
        { value: 'agency', label: 'Marketing Agency', icon: '📈', desc: 'Managing multiple clients' },
        { value: 'freelancer', label: 'Freelancer', icon: '💼', desc: 'Providing social media services' }
      ]
    },
    {
      id: 'teamSize',
      title: 'How big is your team?',
      type: 'single-choice',
      options: [
        { value: 'solo', label: 'Just Me', icon: '👤', desc: 'Working alone' },
        { value: 'small', label: '2-5 People', icon: '👥', desc: 'Small team' },
        { value: 'medium', label: '6-20 People', icon: '👨‍👩‍👧‍👦', desc: 'Growing team' },
        { value: 'large', label: '20+ People', icon: '🏘️', desc: 'Large organization' }
      ]
    },
    {
      id: 'currentTools',
      title: 'What tools do you currently use?',
      type: 'multiple-choice',
      options: [
        { value: 'canva', label: 'Canva', icon: '🎨' },
        { value: 'hootsuite', label: 'Hootsuite', icon: '📅' },
        { value: 'buffer', label: 'Buffer', icon: '⏰' },
        { value: 'later', label: 'Later', icon: '📱' },
        { value: 'photoshop', label: 'Photoshop', icon: '🖼️' },
        { value: 'figma', label: 'Figma', icon: '✨' },
        { value: 'none', label: 'None / Manual', icon: '✋' }
      ]
    },
    {
      id: 'primaryGoal',
      title: 'What\'s your primary goal?',
      type: 'single-choice',
      options: [
        { value: 'growth', label: 'Grow Followers', icon: '📈', desc: 'Increase audience size' },
        { value: 'engagement', label: 'Boost Engagement', icon: '❤️', desc: 'More likes, comments, shares' },
        { value: 'sales', label: 'Drive Sales', icon: '💰', desc: 'Convert followers to customers' },
        { value: 'efficiency', label: 'Save Time', icon: '⏱️', desc: 'Automate repetitive tasks' }
      ]
    },
    {
      id: 'contentTypes',
      title: 'What content do you create?',
      type: 'multiple-choice',
      options: [
        { value: 'posts', label: 'Social Posts', icon: '📝' },
        { value: 'stories', label: 'Stories', icon: '📸' },
        { value: 'videos', label: 'Videos', icon: '🎥' },
        { value: 'reels', label: 'Reels/Shorts', icon: '🎬' },
        { value: 'graphics', label: 'Graphics', icon: '🖌️' },
        { value: 'blogs', label: 'Blog Content', icon: '📄' }
      ]
    },
    {
      id: 'urgency',
      title: 'When do you need this solution?',
      type: 'single-choice',
      options: [
        { value: 'asap', label: 'Right Now', icon: '🚀', desc: 'Urgent need for solution' },
        { value: 'month', label: 'Within a Month', icon: '📅', desc: 'Planning ahead' },
        { value: 'quarter', label: 'Next Quarter', icon: '🗓️', desc: 'Part of strategy planning' },
        { value: 'exploring', label: 'Just Exploring', icon: '🔍', desc: 'Learning about options' }
      ]
    }
  ];

  const [copiedReferral, setCopiedReferral] = useState(false);
  const [currentDemo, setCurrentDemo] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [typedText, setTypedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [focusedField, setFocusedField] = useState('');
  const [ripples, setRipples] = useState<Array<{id: number, x: number, y: number}>>([]);
  const [currentFeature, setCurrentFeature] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const [cursorTrail, setCursorTrail] = useState<Array<{id: number, x: number, y: number, opacity: number}>>([]);
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);
  const [glowIntensity, setGlowIntensity] = useState(0);

  // Advanced demo scenarios for the interactive showcase
  const demoScenarios = [
    {
      title: "AI Content Generation",
      description: "VeeGPT creates viral content that resonates with your audience",
      gradient: "from-violet-600 via-purple-600 to-blue-600",
      icon: Brain,
      metrics: { engagement: "+384%", reach: "3.2M", conversion: "+89%" },
      demo: "Generating Instagram post about tech trends..."
    },
    {
      title: "Smart Automation",
      description: "Intelligent scheduling across all your social platforms",
      gradient: "from-blue-600 via-cyan-600 to-emerald-600",
      icon: Zap,
      metrics: { efficiency: "+450%", saved: "25h/week", posts: "1,247" },
      demo: "Optimizing posting schedule for maximum reach..."
    },
    {
      title: "Advanced Analytics",
      description: "Predictive insights that show what content will go viral",
      gradient: "from-emerald-600 via-teal-600 to-cyan-600",
      icon: BarChart3,
      metrics: { accuracy: "96.8%", insights: "312", trends: "+67%" },
      demo: "Analyzing viral patterns and audience behavior..."
    },
    {
      title: "Team Collaboration",
      description: "Seamless workflow for creative teams and agencies",
      gradient: "from-orange-600 via-red-600 to-pink-600",
      icon: Users,
      metrics: { productivity: "+340%", approval: "2x faster", teams: "890+" },
      demo: "Streamlining approval workflow with clients..."
    }
  ];

  // Interactive feature showcase
  const featureShowcase = [
    {
      icon: Bot,
      title: "VeeGPT Assistant",
      description: "AI that understands your brand voice and creates authentic content",
      color: "from-purple-500 to-blue-500"
    },
    {
      icon: Calendar,
      title: "Smart Scheduling",
      description: "AI-powered timing optimization for maximum engagement",
      color: "from-blue-500 to-cyan-500"
    },
    {
      icon: BarChart3,
      title: "Predictive Analytics",
      description: "Know what content will perform before you post it",
      color: "from-cyan-500 to-emerald-500"
    },
    {
      icon: Users,
      title: "Team Workspace",
      description: "Collaborate seamlessly with advanced approval workflows",
      color: "from-emerald-500 to-green-500"
    }
  ];

  // Advanced mouse tracking with cursor trail
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({ x: e.clientX, y: e.clientY });
      
      // Create cursor trail effect
      const newTrail = { 
        id: Date.now(), 
        x: e.clientX, 
        y: e.clientY, 
        opacity: 1 
      };
      setCursorTrail(prev => [...prev.slice(-8), newTrail]);
      
      // Update glow intensity based on mouse movement speed
      const speed = Math.sqrt(e.movementX ** 2 + e.movementY ** 2);
      setGlowIntensity(Math.min(speed * 0.1, 1));
    };
    
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Fade cursor trail - REMOVED to prevent re-renders
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     setCursorTrail(prev => prev.map(trail => ({
  //       ...trail,
  //       opacity: trail.opacity * 0.8
  //     })).filter(trail => trail.opacity > 0.1));
  //   }, 50);
  //   return () => clearInterval(interval);
  // }, []);

  // Remove all intervals to prevent re-renders and button blinking
  // Auto-advance demo scenarios - REMOVED
  // useEffect(() => {
  //   if (!isPlaying) return;
  //   const interval = setInterval(() => {
  //     setCurrentDemo((prev) => (prev + 1) % demoScenarios.length);
  //   }, 5000);
  //   return () => clearInterval(interval);
  // }, [isPlaying]);

  // Feature showcase rotation - REMOVED
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     setCurrentFeature((prev) => (prev + 1) % featureShowcase.length);
  //   }, 3000);
  //   return () => clearInterval(interval);
  // }, []);

  // Advanced typing animation - REMOVED
  // useEffect(() => {
  //   const messages = [
  //     "Join 2,000+ creators revolutionizing social media",
  //     "Early access to AI-powered content creation",
  //     "Be part of the future of social media management",
  //     "Exclusive access to VeeFore's advanced features"
  //   ];
  //   
  //   let messageIndex = 0;
  //   let charIndex = 0;
  //   let isDeleting = false;
  //   
  //   const typeWriter = () => {
  //     const currentMessage = messages[messageIndex];
  //     
  //     if (!isDeleting && charIndex < currentMessage.length) {
  //       setTypedText(currentMessage.substring(0, charIndex + 1));
  //       setIsTyping(true);
  //       charIndex++;
  //       setTimeout(typeWriter, 80);
  //     } else if (isDeleting && charIndex > 0) {
  //       setTypedText(currentMessage.substring(0, charIndex - 1));
  //       charIndex--;
  //       setTimeout(typeWriter, 40);
  //     } else if (!isDeleting && charIndex === currentMessage.length) {
  //       setIsTyping(false);
  //       setTimeout(() => {
  //         isDeleting = true;
  //         typeWriter();
  //       }, 3000);
  //     } else if (isDeleting && charIndex === 0) {
  //       isDeleting = false;
  //       messageIndex = (messageIndex + 1) % messages.length;
  //       setTimeout(typeWriter, 500);
  //     }
  //   };
  //   
  //   const timeout = setTimeout(typeWriter, 1000);
  //   return () => clearTimeout(timeout);
  // }, []);

  // Interactive ripple effects
  const createRipple = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const newRipple = { id: Date.now(), x, y };
    
    setRipples(prev => [...prev, newRipple]);
    setTimeout(() => {
      setRipples(prev => prev.filter(ripple => ripple.id !== newRipple.id));
    }, 600);
  };

  // Get referral code from URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const referralCode = urlParams.get('ref');
    if (referralCode) {
      setFormData(prev => ({ ...prev, referredBy: referralCode }));
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // First send OTP email
      const response = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: formData.email }),
      });

      const data = await response.json();
      console.log('[WAITLIST] Send OTP response:', data);
      console.log('[WAITLIST] Response success field:', data.success);
      console.log('[WAITLIST] Response message:', data.message);

      if (response.ok && (data.message || data.success !== false)) {
        // Store pending user data
        setPendingUser({ name: formData.name, email: formData.email });
        setShowOTPModal(true);
        
        // Set development OTP if available
        if (data.developmentOtp) {
          setDevelopmentOtp(data.developmentOtp);
        }
        
        toast({
          title: "Verification email sent",
          description: "Please check your email for the verification code.",
        });
      } else {
        toast({
          title: "Failed to send verification email",
          description: data.message || "Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Verification email error:', error);
      toast({
        title: "Connection error",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // OTP Verification Functions
  const handleOTPSubmit = async () => {
    if (!otpCode || otpCode.length !== 6) {
      setOtpError(true);
      toast({
        title: "Invalid Code",
        description: "Please enter the 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }

    setOtpLoading(true);
    setOtpError(false);
    
    try {
      console.log('[WAITLIST OTP] Verifying code:', { email: pendingUser?.email, code: otpCode });
      
      const response = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: pendingUser?.email,
          code: otpCode
        }),
      });

      const responseData = await response.json();
      console.log('[WAITLIST OTP] Verification response:', responseData);

      if (!response.ok) {
        setOtpError(true);
        throw new Error(responseData.message || 'Verification failed');
      }

      // Email verified successfully, now show questionnaire
      setShowOTPModal(false);
      setOtpCode('');
      setShowQuestionnaire(true);
      setCurrentQuestion(0);
      
      toast({
        title: "Email verified!",
        description: "Let's learn more about your needs to personalize your experience.",
      });
      
    } catch (error: any) {
      console.error('[WAITLIST OTP] Verification error:', error);
      setOtpError(true);
      toast({
        title: "Verification failed",
        description: error.message || "Invalid or expired code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setOtpLoading(false);
    }
  };

  // Questionnaire handlers
  const handleQuestionnaireAnswer = (questionId: string, value: string) => {
    const question = questions[currentQuestion];
    
    if (question.type === 'multiple-choice') {
      const currentValues = questionnaireData[questionId as keyof typeof questionnaireData] as string[];
      const newValues = currentValues.includes(value) 
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];
      
      setQuestionnaireData(prev => ({
        ...prev,
        [questionId]: newValues
      }));
    } else {
      setQuestionnaireData(prev => ({
        ...prev,
        [questionId]: value
      }));
    }
  };

  const handleNextQuestion = () => {
    console.log('[NEXT QUESTION] Current question:', currentQuestion, 'Total questions:', questions.length);
    
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      console.log('[NEXT QUESTION] Completing survey, calling submitToWaitlist');
      // All questions answered, submit to waitlist with questionnaire data
      submitToWaitlist();
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion(currentQuestion - 1);
    }
  };

  const canProceed = () => {
    const question = questions[currentQuestion];
    const currentValue = questionnaireData[question.id as keyof typeof questionnaireData];
    
    if (question.type === 'multiple-choice') {
      return Array.isArray(currentValue) && currentValue.length > 0;
    }
    return currentValue && currentValue !== '';
  };

  const submitToWaitlist = async () => {
    console.log('[SUBMIT WAITLIST] Starting submission with data:', { 
      pendingUser, 
      questionnaireData,
      referredBy: formData.referredBy 
    });
    
    try {
      const response = await fetch('/api/early-access/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: pendingUser?.name,
          email: pendingUser?.email,
          referredBy: formData.referredBy,
          verified: true,
          questionnaire: questionnaireData
        }),
      });

      console.log('[SUBMIT WAITLIST] Response received, status:', response.status);
      
      const data = await response.json();
      console.log('[SUBMIT WAITLIST] Response data:', data);

      if (data.success) {
        console.log('[SUBMIT WAITLIST] Success! Redirecting to status page');
        console.log('[SUBMIT WAITLIST] User data:', data.user);
        
        // Clear current state
        setShowQuestionnaire(false);
        setShowOTPModal(false);
        setOtpCode('');
        setDevelopmentOtp(null);
        
        // Redirect to waitlist status page with user email
        const userEmail = data.user?.email || pendingUser?.email;
        if (userEmail) {
          // Use window.location to ensure fresh page load with encoded email
          window.location.href = `/waitlist-status?user=${encodeURIComponent(userEmail)}`;
        } else {
          // Fallback to toast if no user email
          toast({
            title: "Welcome to VeeFore!",
            description: "You've successfully joined our exclusive waitlist!",
          });
        }
      } else {
        console.error('[SUBMIT WAITLIST] Failed response:', data);
        toast({
          title: "Waitlist submission failed",
          description: data.message || "Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('[SUBMIT WAITLIST] Exception:', error);
      toast({
        title: "Connection error",
        description: "Please check your connection and try again.",
        variant: "destructive",
      });
    }
  };

  const handleResendOTP = async () => {
    try {
      const response = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: pendingUser?.email }),
      });

      const data = await response.json();
      
      if (data.success) {
        if (data.developmentOtp) {
          setDevelopmentOtp(data.developmentOtp);
        }
        toast({
          title: "Code resent",
          description: "A new verification code has been sent to your email.",
        });
      } else {
        toast({
          title: "Failed to resend code",
          description: data.message || "Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Resend OTP error:', error);
      toast({
        title: "Connection error",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const copyReferralCode = async () => {
    if (waitlistData?.referralCode) {
      const referralUrl = `${window.location.origin}/waitlist?ref=${waitlistData.referralCode}`;
      await navigator.clipboard.writeText(referralUrl);
      setCopiedReferral(true);
      toast({
        title: "Link copied",
        description: "Referral link copied to clipboard.",
      });
      setTimeout(() => setCopiedReferral(false), 2000);
    }
  };

  // World-Class Modern Professional Success Modal
  const SuccessModal = () => {
    if (!isSubmitted || !waitlistData) return null;
    
    console.log('[SUCCESS MODAL] Rendering with data:', { isSubmitted, waitlistData });
    
    return (
      <div 
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{ 
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)'
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden"
          style={{ zIndex: 10000 }}
        >
          {/* Gradient Header */}
          <div className="relative bg-gradient-to-br from-emerald-500 via-blue-500 to-purple-600 px-8 py-12 text-center">
            <div className="absolute inset-0 bg-black/5"></div>
            
            {/* Success Icon with Animation */}
            <motion.div
              initial={{ scale: 0, rotate: -90 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, duration: 0.6, type: "spring", bounce: 0.4 }}
              className="relative inline-flex items-center justify-center w-20 h-20 bg-white rounded-full shadow-lg mb-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, duration: 0.3 }}
              >
                <Check className="w-10 h-10 text-emerald-500" strokeWidth={3} />
              </motion.div>
              
              {/* Pulse rings */}
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-white/50"
                animate={{ scale: [1, 1.5, 1], opacity: [0.8, 0, 0.8] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-3xl font-bold text-white mb-2"
            >
              🎉 You're In!
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-white/90 text-lg"
            >
              Welcome to VeeFore's exclusive community!
            </motion.p>
          </div>

          {/* Content Section */}
          <div className="px-8 py-8 space-y-6">
            {/* Position Badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 }}
              className="text-center"
            >
              <div className="inline-flex items-center bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-full px-6 py-3">
                <img src={veeforeLogo} alt="VeeFore" className="w-6 h-6 mr-2" />
                <span className="text-blue-900 font-bold text-lg">
                  Position #{waitlistData.user?.id?.slice(-3) || Math.floor(Math.random() * 999)}
                </span>
              </div>
            </motion.div>

            {/* Benefits Grid */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="grid grid-cols-2 gap-4"
            >
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
                <Clock className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                <div className="font-bold text-purple-900 text-sm">2-3 weeks</div>
                <div className="text-purple-700 text-xs">Early Access</div>
              </div>
              
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <Gift className="w-6 h-6 text-green-600 mx-auto mb-2" />
                <div className="font-bold text-green-900 text-sm">50% OFF</div>
                <div className="text-green-700 text-xs">Launch Discount</div>
              </div>
            </motion.div>

            {/* Referral Section */}
            {waitlistData.user?.referralCode && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-xl p-4"
              >
                <div className="flex items-center mb-3">
                  <Share2 className="w-4 h-4 text-orange-600 mr-2" />
                  <h3 className="font-bold text-orange-900 text-sm">Skip the Line!</h3>
                </div>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={`${window.location.origin}/waitlist?ref=${waitlistData.user.referralCode}`}
                    readOnly
                    className="flex-1 bg-white border border-orange-200 rounded-lg px-3 py-2 text-xs text-gray-700 focus:outline-none"
                  />
                  <motion.button
                    onClick={copyReferralCode}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-lg transition-colors flex items-center"
                  >
                    {copiedReferral ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Action Buttons */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
              className="flex gap-3 pt-2"
            >
              <motion.button
                onClick={() => {
                  setIsSubmitted(false);
                  setWaitlistData(null);
                  window.location.reload();
                }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl transition-all duration-200 text-sm"
              >
                Join Again
              </motion.button>
              
              <motion.button
                onClick={() => setLocation('/signin')}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold py-3 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 text-sm"
              >
                <span>Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </motion.div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 relative overflow-hidden">
      {/* Enhanced background effects */}
      <div className="fixed inset-0 bg-gradient-to-br from-blue-50/40 to-purple-50/40 pointer-events-none" />
      
      {/* Animated mesh gradient background */}
      <div className="fixed inset-0 opacity-30 pointer-events-none">
        <div 
          className="absolute inset-0 bg-gradient-to-r from-blue-400/20 via-purple-400/20 to-pink-400/20 blur-3xl transform-gpu"
          style={{
            transform: `translateY(${scrollY * 0.5}px) rotate(${scrollY * 0.1}deg)`,
          }}
        />
        <div 
          className="absolute inset-0 bg-gradient-to-l from-cyan-400/20 via-blue-400/20 to-indigo-400/20 blur-3xl transform-gpu"
          style={{
            transform: `translateY(${scrollY * -0.3}px) rotate(${scrollY * -0.05}deg)`,
          }}
        />
      </div>
      
      {/* Advanced interactive mouse follower */}
      <div
        className="fixed w-96 h-96 rounded-full pointer-events-none transition-all duration-1000 ease-out blur-3xl mix-blend-multiply"
        style={{
          left: mousePosition.x - 192,
          top: mousePosition.y - 192,
          background: `radial-gradient(circle, rgba(59, 130, 246, ${0.1 + glowIntensity * 0.2}) 0%, rgba(147, 51, 234, ${0.1 + glowIntensity * 0.15}) 50%, transparent 100%)`,
          transform: `scale(${1 + glowIntensity * 0.3})`,
        }}
      />

      {/* Cursor trail effect */}
      {cursorTrail.map((trail, i) => (
        <div
          key={trail.id}
          className="fixed w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full pointer-events-none mix-blend-multiply"
          style={{
            left: trail.x - 6,
            top: trail.y - 6,
            opacity: trail.opacity * 0.6,
            transform: `scale(${trail.opacity})`,
            transition: 'opacity 0.1s ease-out',
          }}
        />
      ))}

      {/* Enhanced floating particles */}
      {[...Array(25)].map((_, i) => (
        <motion.div
          key={i}
          className="fixed rounded-full opacity-40 mix-blend-multiply"
          style={{
            width: Math.random() * 4 + 2,
            height: Math.random() * 4 + 2,
            background: `linear-gradient(${Math.random() * 360}deg, hsl(${210 + Math.random() * 60}, 70%, 60%), hsl(${270 + Math.random() * 60}, 70%, 60%))`,
          }}
          animate={{
            x: [Math.random() * window.innerWidth, Math.random() * window.innerWidth],
            y: [Math.random() * window.innerHeight, Math.random() * window.innerHeight],
            scale: [0, Math.random() * 1.5 + 0.5, 0],
            opacity: [0, 0.8, 0],
            rotate: [0, Math.random() * 360]
          }}
          transition={{
            duration: Math.random() * 20 + 20,
            repeat: Infinity,
            delay: Math.random() * 10,
            ease: "easeInOut"
          }}
        />
      ))}

      {/* Geometric patterns */}
      <div className="fixed inset-0 opacity-5 pointer-events-none">
        <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="m 60 0 l 0 60 l -60 0 l 0 -60 z" fill="none" stroke="currentColor" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" className="text-blue-600" />
        </svg>
      </div>

      {/* Ultra-enhanced header */}
      <header className="relative bg-white/90 backdrop-blur-2xl border-b border-white/30 shadow-2xl z-50">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-50/50 via-transparent to-purple-50/50" />
        <div className="max-w-7xl mx-auto px-6 py-5 relative">
          <div className="flex justify-between items-center">
            {/* Back button */}
            <motion.button
              onClick={() => setLocation('/')}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors bg-white/70 backdrop-blur-sm border border-gray-200 rounded-xl px-4 py-2 shadow-md hover:shadow-lg"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="font-medium text-sm">Back to Home</span>
            </motion.button>

            <motion.div 
              className="flex items-center space-x-4"
              whileHover={{ scale: 1.03 }}
              transition={{ type: "spring", stiffness: 500 }}
            >
              <motion.div 
                className="relative w-16 h-16 flex items-center justify-center"
                animate={{ 
                  filter: [
                    "drop-shadow(0 10px 25px rgba(59, 130, 246, 0.3))",
                    "drop-shadow(0 10px 25px rgba(147, 51, 234, 0.3))",
                    "drop-shadow(0 10px 25px rgba(236, 72, 153, 0.3))",
                    "drop-shadow(0 10px 25px rgba(59, 130, 246, 0.3))"
                  ]
                }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                >
                  <img src={veeforeLogo} alt="VeeFore" className="w-16 h-16" />
                </motion.div>

              </motion.div>
              <div>
                <motion.span 
                  className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-blue-600 to-purple-600 bg-clip-text text-transparent"
                  animate={{ 
                    backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"]
                  }}
                  transition={{ duration: 5, repeat: Infinity }}
                  style={{ backgroundSize: "200% 200%" }}
                >
                  VeeFore
                </motion.span>
                <motion.div 
                  className="text-sm text-gray-500 font-medium"
                  animate={{ opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 3, repeat: Infinity }}
                >
                  AI Social Media Revolution
                </motion.div>
              </div>
            </motion.div>
            
            <div className="flex items-center space-x-6">
              <motion.div 
                className="hidden sm:flex items-center space-x-3 bg-gradient-to-r from-green-50 to-emerald-50 px-5 py-3 rounded-full border border-green-200/50 shadow-lg backdrop-blur-sm"
                animate={{ 
                  scale: [1, 1.03, 1],
                  boxShadow: [
                    "0 4px 15px rgba(34, 197, 94, 0.2)",
                    "0 4px 20px rgba(34, 197, 94, 0.3)",
                    "0 4px 15px rgba(34, 197, 94, 0.2)"
                  ]
                }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <motion.div 
                  className="w-3 h-3 bg-green-500 rounded-full"
                  animate={{ 
                    scale: [1, 1.2, 1],
                    opacity: [1, 0.7, 1] 
                  }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <span className="text-green-700 font-bold text-sm">3,247+ joined today</span>
                <motion.div
                  className="text-green-600"
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  🚀
                </motion.div>
              </motion.div>
              
              <motion.button
                onClick={() => setLocation('/signin')}
                whileHover={{ 
                  scale: 1.05,
                  boxShadow: "0 10px 30px rgba(0, 0, 0, 0.3)"
                }}
                whileTap={{ scale: 0.95 }}
                className="relative bg-gradient-to-r from-gray-900 to-black text-white px-8 py-3 rounded-xl font-semibold transition-all duration-300 shadow-2xl overflow-hidden"
              >
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 -skew-x-12"
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                />
                <span className="relative">Sign In</span>
              </motion.button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex min-h-[calc(100vh-88px)]">
        {/* Left side - Interactive demo */}
        <div className="flex-1 p-8 flex flex-col justify-center relative">
          <div className="max-w-2xl">
            {/* Typing animation header */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="mb-8"
            >
              <h1 className="text-6xl font-bold text-gray-900 mb-6 leading-tight">
                The Future of{' '}
                <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
                  Social Media
                </span>
              </h1>
              <div className="text-2xl text-gray-600 h-16 flex items-center">
                <span>{typedText}</span>
                <motion.span
                  animate={{ opacity: isTyping ? [1, 0] : 1 }}
                  transition={{ duration: 0.5, repeat: isTyping ? Infinity : 0 }}
                  className="ml-1 text-blue-600"
                >
                  |
                </motion.span>
              </div>
            </motion.div>

            {/* Interactive demo showcase */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="bg-white/80 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20 mb-8 relative overflow-hidden"
            >
              {/* Demo header */}
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-2xl font-bold text-gray-900">Live Demo</h3>
                <div className="flex items-center space-x-3">
                  <motion.button
                    onClick={() => setIsPlaying(!isPlaying)}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white shadow-lg"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                  </motion.button>
                  <div className="flex space-x-1">
                    {demoScenarios.map((_, index) => (
                      <div
                        key={index}
                        className={`w-2 h-2 rounded-full transition-all duration-300 ${
                          index === currentDemo ? 'bg-blue-500' : 'bg-gray-300'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Current demo */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentDemo}
                  initial={{ opacity: 0, x: 50 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -50 }}
                  transition={{ duration: 0.5 }}
                  className="space-y-6"
                >
                  <div className={`w-16 h-16 bg-gradient-to-r ${demoScenarios[currentDemo].gradient} rounded-2xl flex items-center justify-center shadow-lg mb-4`}>
                    {React.createElement(demoScenarios[currentDemo].icon, { className: "w-8 h-8 text-white" })}
                  </div>
                  
                  <div>
                    <h4 className="text-2xl font-bold text-gray-900 mb-2">
                      {demoScenarios[currentDemo].title}
                    </h4>
                    <p className="text-gray-600 text-lg leading-relaxed">
                      {demoScenarios[currentDemo].description}
                    </p>
                  </div>

                  {/* Demo metrics */}
                  <div className="grid grid-cols-3 gap-4">
                    {Object.entries(demoScenarios[currentDemo].metrics).map(([key, value], i) => (
                      <motion.div
                        key={key}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.1 * i }}
                        className="bg-gray-50 rounded-xl p-4 text-center border border-gray-100"
                      >
                        <div className="text-2xl font-bold text-gray-900">{value}</div>
                        <div className="text-gray-500 text-sm capitalize">{key}</div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Demo status */}
                  <div className="flex items-center space-x-3 text-blue-600">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full"
                    />
                    <span className="font-medium">{demoScenarios[currentDemo].demo}</span>
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* Enhanced feature showcase */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="grid grid-cols-2 gap-6"
            >
              {featureShowcase.map((feature, index) => (
                <motion.div
                  key={index}
                  whileHover={{ 
                    scale: 1.05, 
                    rotateY: 8,
                    z: 50
                  }}
                  whileTap={{ scale: 0.98 }}
                  onHoverStart={() => setHoveredCard(index)}
                  onHoverEnd={() => setHoveredCard(null)}
                  className={`relative p-6 rounded-2xl backdrop-blur-xl border shadow-2xl transition-all duration-500 overflow-hidden cursor-pointer group ${
                    index === currentFeature 
                      ? 'ring-2 ring-blue-500/50 bg-white/90 border-blue-200/50 shadow-blue-500/20' 
                      : 'bg-white/70 border-white/30 hover:bg-white/90'
                  }`}
                  style={{
                    background: hoveredCard === index 
                      ? `linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 100%)`
                      : undefined
                  }}
                >
                  {/* Animated background gradient */}
                  <motion.div
                    className={`absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 rounded-2xl`}
                    style={{
                      background: `linear-gradient(135deg, ${feature.color.replace('from-', '').replace('to-', ', ')})`.replace(' ', ', ')
                    }}
                  />
                  
                  {/* Shimmer effect */}
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -skew-x-12 opacity-0 group-hover:opacity-100"
                    animate={hoveredCard === index ? { x: ["-100%", "100%"] } : {}}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                  />

                  <motion.div 
                    className={`relative w-14 h-14 bg-gradient-to-r ${feature.color} rounded-2xl flex items-center justify-center mb-5 shadow-xl group-hover:shadow-2xl transition-all duration-500`}
                    animate={{
                      rotate: hoveredCard === index ? [0, 5, -5, 0] : 0,
                      scale: hoveredCard === index ? 1.1 : 1
                    }}
                    transition={{ duration: 0.5 }}
                  >
                    <feature.icon className="w-7 h-7 text-white" />
                    
                    {/* Icon glow effect */}
                    <motion.div
                      className={`absolute inset-0 bg-gradient-to-r ${feature.color} rounded-2xl opacity-0 group-hover:opacity-30 blur-lg`}
                      animate={{ scale: hoveredCard === index ? [1, 1.2, 1] : 1 }}
                      transition={{ duration: 1, repeat: hoveredCard === index ? Infinity : 0 }}
                    />
                  </motion.div>

                  <motion.h4 
                    className="font-bold text-gray-900 mb-3 text-lg group-hover:text-gray-800 transition-colors duration-300"
                    animate={{ y: hoveredCard === index ? -2 : 0 }}
                  >
                    {feature.title}
                  </motion.h4>
                  
                  <motion.p 
                    className="text-gray-600 text-sm leading-relaxed group-hover:text-gray-700 transition-colors duration-300"
                    animate={{ y: hoveredCard === index ? -1 : 0 }}
                  >
                    {feature.description}
                  </motion.p>

                  {/* Interactive corner accent */}
                  <motion.div
                    className="absolute top-4 right-4 w-2 h-2 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: `linear-gradient(135deg, ${feature.color.replace('from-', '').replace('to-', ', ')})`.replace(' ', ', ')
                    }}
                    animate={hoveredCard === index ? { 
                      scale: [1, 1.5, 1],
                      opacity: [0.7, 1, 0.7]
                    } : {}}
                    transition={{ duration: 1, repeat: hoveredCard === index ? Infinity : 0 }}
                  />

                  {/* Active indicator */}
                  {index === currentFeature && (
                    <motion.div
                      className="absolute bottom-4 right-4 w-3 h-3 bg-blue-500 rounded-full"
                      animate={{ 
                        scale: [1, 1.3, 1],
                        opacity: [0.7, 1, 0.7]
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  )}
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Right side - Advanced waitlist form */}
        <div className="w-1/2 p-8 flex items-center justify-center">
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="w-full max-w-md bg-white/90 backdrop-blur-2xl rounded-3xl shadow-2xl border border-white/30 p-10 relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.7) 100%)',
            }}
          >
            {/* Form background effects */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50/30 via-purple-50/20 to-pink-50/30 rounded-3xl" />
            
            {/* Ripple effects container */}
            <div className="absolute inset-0 overflow-hidden rounded-3xl">
              {ripples.map((ripple) => (
                <motion.div
                  key={ripple.id}
                  className="absolute bg-blue-500/20 rounded-full"
                  style={{ left: ripple.x - 25, top: ripple.y - 25 }}
                  initial={{ width: 0, height: 0, opacity: 1 }}
                  animate={{ width: 100, height: 100, opacity: 0 }}
                  transition={{ duration: 0.6 }}
                />
              ))}
            </div>

            {/* Ultra-enhanced form header */}
            <div className="text-center mb-12 relative">
              <motion.div
                className="relative w-24 h-24 mx-auto mb-8"
                animate={{ 
                  rotate: [0, 5, -5, 0],
                  scale: [1, 1.1, 1]
                }}
                transition={{ duration: 6, repeat: Infinity }}
              >
                <div className="w-24 h-24 flex items-center justify-center relative">
                  <img src={veeforeLogo} alt="VeeFore" className="w-24 h-24 z-10 drop-shadow-2xl" />

                </div>
                
                {/* Floating sparkle effects */}
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full"
                    style={{
                      left: `${Math.cos(i * 60 * Math.PI / 180) * 60 + 50}%`,
                      top: `${Math.sin(i * 60 * Math.PI / 180) * 60 + 50}%`,
                    }}
                    animate={{
                      scale: [0, 1, 0],
                      opacity: [0, 1, 0],
                      rotate: [0, 180]
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.3,
                      ease: "easeInOut"
                    }}
                  />
                ))}
              </motion.div>

              <motion.h2 
                className="text-4xl font-bold mb-4 relative"
                style={{
                  background: "linear-gradient(135deg, #1f2937 0%, #3b82f6 25%, #8b5cf6 50%, #ec4899 75%, #f59e0b 100%)",
                  backgroundSize: "300% 300%",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text"
                }}
                animate={{
                  backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"]
                }}
                transition={{ duration: 10, repeat: Infinity }}
              >
                Join the Revolution
              </motion.h2>

              <motion.p 
                className="text-gray-600 leading-relaxed text-lg max-w-sm mx-auto"
                animate={{ 
                  opacity: [0.8, 1, 0.8],
                  y: [0, -1, 0]
                }}
                transition={{ duration: 4, repeat: Infinity }}
              >
                Get exclusive early access to VeeFore's revolutionary AI-powered social media platform
              </motion.p>

              {/* Decorative elements */}
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-blue-400 to-transparent rounded-full opacity-50" />
              <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-purple-400 to-transparent rounded-full opacity-50" />
            </div>

            {/* Enhanced form */}
            <form onSubmit={handleSubmit} className="space-y-8 relative" onClick={createRipple}>
              <motion.div
                whileHover={{ scale: 1.02, y: -2 }}
                className="relative group"
              >
                <motion.label 
                  className="block text-gray-700 font-bold mb-4 text-lg relative"
                  animate={{ 
                    color: focusedField === 'name' ? '#3b82f6' : '#374151' 
                  }}
                  transition={{ duration: 0.3 }}
                >
                  Full Name
                  <motion.div
                    className="absolute -bottom-1 left-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 origin-left"
                    animate={{ 
                      scaleX: focusedField === 'name' ? 1 : 0,
                      opacity: focusedField === 'name' ? 1 : 0 
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </motion.label>
                
                <div className="relative">
                  <User className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-gray-400 z-20" />
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    onFocus={() => setFocusedField('name')}
                    onBlur={() => setFocusedField('')}
                    required
                    className="relative z-30 w-full bg-white border-2 border-gray-200 rounded-2xl pl-14 pr-6 py-5 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-300 text-lg font-medium"
                    placeholder="Enter your full name"
                  />
                </div>
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02, y: -2 }}
                className="relative group"
              >
                <motion.label 
                  className="block text-gray-700 font-bold mb-4 text-lg relative"
                  animate={{ 
                    color: focusedField === 'email' ? '#3b82f6' : '#374151' 
                  }}
                  transition={{ duration: 0.3 }}
                >
                  Email Address
                  <motion.div
                    className="absolute -bottom-1 left-0 h-0.5 bg-gradient-to-r from-blue-500 to-purple-500 origin-left"
                    animate={{ 
                      scaleX: focusedField === 'email' ? 1 : 0,
                      opacity: focusedField === 'email' ? 1 : 0 
                    }}
                    transition={{ duration: 0.3 }}
                  />
                </motion.label>
                
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-gray-400 z-20" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField('')}
                    required
                    className="relative z-30 w-full bg-white border-2 border-gray-200 rounded-2xl pl-14 pr-6 py-5 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition-all duration-300 text-lg font-medium"
                    placeholder="Enter your email address"
                  />
                </div>
              </motion.div>

              {formData.referredBy && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  whileHover={{ scale: 1.02 }}
                >
                  <label className="block text-gray-700 font-semibold mb-3 text-lg">
                    Referral Code
                  </label>
                  <div className="relative">
                    <Gift className="absolute left-4 top-1/2 transform -translate-y-1/2 w-6 h-6 text-orange-400" />
                    <input
                      type="text"
                      name="referredBy"
                      value={formData.referredBy}
                      onChange={handleInputChange}
                      className="w-full bg-orange-50/80 border-2 border-orange-200 rounded-2xl pl-14 pr-4 py-4 text-gray-800 placeholder-gray-500 focus:outline-none focus:ring-4 focus:ring-orange-500/20 focus:border-orange-500 transition-all duration-300 backdrop-blur-sm"
                      placeholder="Referral code"
                    />
                  </div>
                </motion.div>
              )}

              <motion.button
                type="submit"
                disabled={isLoading}
                whileHover={{ 
                  scale: isLoading ? 1 : 1.02,
                  boxShadow: isLoading ? 
                    "0 8px 20px rgba(0, 0, 0, 0.15)" : 
                    "0 12px 30px rgba(0, 0, 0, 0.2)",
                  y: isLoading ? 0 : -1
                }}
                whileTap={{ scale: isLoading ? 1 : 0.99 }}
                className="group relative w-full bg-gray-900 hover:bg-black disabled:bg-gray-400 text-white font-bold py-5 px-8 rounded-xl transition-all duration-300 flex items-center justify-center space-x-3 shadow-xl text-lg overflow-hidden"
              >
                {/* Subtle shine effect */}
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12 opacity-0 group-hover:opacity-100"
                  animate={{ x: ["-100%", "100%"] }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity, 
                    ease: "linear",
                    repeatDelay: 3
                  }}
                />
                
                {/* Loading spinner */}
                {isLoading && (
                  <motion.div 
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  />
                )}
                
                <motion.div
                  className="relative z-10 flex items-center space-x-3"
                  animate={{
                    opacity: isLoading ? 0.8 : 1,
                  }}
                  transition={{ duration: 0.3 }}
                >
                  {!isLoading && (
                    <>
                      <motion.div
                        animate={{
                          scale: [1, 1.05, 1]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <Sparkles className="w-5 h-5" />
                      </motion.div>
                      
                      <span className="font-bold tracking-wide">
                        {isSubmitted ? 'Welcome to VeeFore!' : 'Join the Waitlist'}
                      </span>
                      
                      <motion.div
                        animate={{
                          x: [0, 2, 0]
                        }}
                        transition={{ duration: 2, repeat: Infinity }}
                      >
                        <ArrowRight className="w-5 h-5" />
                      </motion.div>
                    </>
                  )}
                  
                  {isLoading && (
                    <span className="font-bold tracking-wide">
                      Joining waitlist...
                    </span>
                  )}
                </motion.div>
                
                {/* Success effect */}
                {isSubmitted && (
                  <motion.div
                    className="absolute inset-0 bg-green-600 rounded-xl"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3 }}
                  />
                )}
              </motion.button>

              {/* Enhanced benefits section */}
              <div className="space-y-6 pt-4">
                <p className="text-gray-500 text-sm text-center">
                  By joining, you agree to our{' '}
                  <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">Terms</a> and{' '}
                  <a href="#" className="text-blue-600 hover:text-blue-700 font-medium">Privacy Policy</a>
                </p>

                <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-200/50 shadow-lg">
                  <div className="flex items-center justify-center mb-4">
                    <Award className="w-6 h-6 text-green-600 mr-3" />
                    <span className="text-green-700 font-bold text-lg">Exclusive Benefits:</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm text-green-600">
                    {[
                      { icon: Heart, text: "50% Launch Discount" },
                      { icon: () => <img src={veeforeLogo} alt="VeeFore" className="w-4 h-4" />, text: "Priority Access" },
                      { icon: Zap, text: "Beta Features" },
                      { icon: Shield, text: "Premium Support" }
                    ].map((benefit, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-center justify-center bg-white/60 rounded-xl p-3"
                      >
                        <benefit.icon className="w-4 h-4 mr-2" />
                        <span>{benefit.text}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Social proof */}
                <div className="flex items-center justify-center space-x-6 pt-4">
                  <div className="flex -space-x-3">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <motion.div
                        key={i}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                        whileHover={{ scale: 1.2, zIndex: 10 }}
                        className="w-10 h-10 bg-gradient-to-r from-blue-400 to-purple-500 rounded-full border-3 border-white flex items-center justify-center text-white text-xs font-bold shadow-lg cursor-pointer"
                      >
                        {String.fromCharCode(65 + i)}
                      </motion.div>
                    ))}
                  </div>
                  <div className="text-gray-600">
                    <span className="font-bold text-gray-800">2,847+</span> innovators joined today
                  </div>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    </div>

    {/* OTP Verification Modal */}
    {showOTPModal && (
      <div className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        {/* Floating gradient orbs for depth */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-blue-400/10 to-cyan-400/10 rounded-full blur-3xl animate-pulse"></div>
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-purple-400/10 to-pink-400/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
        </div>
        
        <div className="relative bg-gradient-to-br from-white/20 via-white/10 to-white/5 backdrop-blur-2xl rounded-3xl shadow-2xl max-w-md w-full p-8 border border-white/20 before:absolute before:inset-0 before:rounded-3xl before:bg-gradient-to-br before:from-white/30 before:via-transparent before:to-transparent before:pointer-events-none">
          <div className="relative z-10 text-center space-y-8">
            {/* Premium Header with Glass Effect */}
            <div className="space-y-6">
              <div className="relative">
                <div className="w-20 h-20 bg-gradient-to-br from-blue-500/80 via-indigo-500/80 to-purple-600/80 backdrop-blur-xl rounded-2xl flex items-center justify-center mx-auto shadow-2xl border border-white/20">
                  <Mail className="w-10 h-10 text-white drop-shadow-lg" />
                  <div className="absolute -top-1 -right-1 w-6 h-6 bg-green-400/90 backdrop-blur-sm rounded-full border-2 border-white/50 flex items-center justify-center shadow-lg">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  </div>
                </div>
                <div className="absolute inset-0 bg-gradient-to-br from-blue-400/20 to-purple-400/20 rounded-2xl blur-xl animate-pulse"></div>
              </div>
              
              <div className="space-y-3">
                <h2 className="text-3xl font-black text-white tracking-tight drop-shadow-lg">Verify Your Email</h2>
                <div className="space-y-2">
                  <p className="text-white/80 font-medium drop-shadow">
                    We've sent a 6-digit verification code to
                  </p>
                  <div className="inline-flex items-center space-x-2 bg-white/20 backdrop-blur-xl px-4 py-2 rounded-xl border border-white/30 shadow-lg">
                    <Mail className="w-4 h-4 text-white/90" />
                    <span className="font-bold text-white">{pendingUser?.email}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Revolutionary OTP Input Grid */}
            <div className="space-y-6">
              <div className="space-y-4">
                <div className={`text-sm font-bold tracking-wide drop-shadow transition-colors duration-300 ${
                  otpError ? 'text-red-300' : 'text-white/90'
                }`}>
                  {otpError ? 'INVALID CODE' : 'VERIFICATION CODE'}
                </div>
                <div className="flex justify-center space-x-3">
                  {[...Array(6)].map((_, index) => (
                    <div key={index} className="relative">
                      <input
                        type="text"
                        value={otpCode[index] || ''}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '')
                          if (value.length <= 1) {
                            const newCode = otpCode.split('')
                            newCode[index] = value
                            setOtpCode(newCode.join('').slice(0, 6))
                            
                            // Clear error state when user starts typing
                            if (otpError) {
                              setOtpError(false)
                            }
                            
                            // Auto-focus next input
                            if (value && index < 5) {
                              const nextInput = e.target.parentElement?.parentElement?.children[index + 1]?.querySelector('input')
                              nextInput?.focus()
                            }
                          }
                        }}
                        onKeyDown={(e) => {
                          // Handle backspace to focus previous input
                          if (e.key === 'Backspace' && !otpCode[index] && index > 0) {
                            const prevInput = e.target.parentElement?.parentElement?.children[index - 1]?.querySelector('input')
                            prevInput?.focus()
                          }
                        }}
                        className={`w-12 h-14 text-center text-2xl font-black border-2 rounded-xl transition-all duration-300 backdrop-blur-xl ${
                          otpError 
                            ? 'border-red-400/60 bg-red-500/20 text-white shadow-lg shadow-red-400/30 animate-pulse' 
                            : otpCode[index] 
                              ? 'border-green-400/60 bg-green-500/20 text-white shadow-lg shadow-green-400/30' 
                              : 'border-white/30 bg-white/10 text-white placeholder-white/50 focus:border-blue-400/60 focus:bg-blue-500/20 focus:shadow-lg focus:shadow-blue-400/30'
                        }`}
                        maxLength={1}
                        autoFocus={index === 0}
                      />
                      {otpCode[index] && !otpError && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg border border-white/30">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                      {otpCode[index] && otpError && (
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-400/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg border border-white/30">
                          <X className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                
                {/* Progress indicator */}
                <div className="flex justify-center space-x-1">
                  {[...Array(6)].map((_, index) => (
                    <div key={index} className={`h-1 w-8 rounded-full transition-all duration-300 ${
                      otpError && otpCode[index] 
                        ? 'bg-red-400/80 shadow-lg shadow-red-400/50' 
                        : otpCode[index] 
                          ? 'bg-green-400/80 shadow-lg shadow-green-400/50' 
                          : 'bg-white/20'
                    }`}></div>
                  ))}
                </div>
              </div>

              {/* Development OTP Display - Only in Development */}
              {import.meta.env.DEV && developmentOtp && (
                <div className="bg-gradient-to-r from-orange-500/20 to-amber-500/20 backdrop-blur-xl rounded-xl p-6 border border-orange-400/30 shadow-lg">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-3 h-3 bg-orange-400 rounded-full animate-pulse"></div>
                    <span className="text-orange-200 font-bold text-sm">DEVELOPMENT MODE</span>
                  </div>
                  <div className="text-center">
                    <p className="text-orange-100 text-sm mb-2">Development OTP Code:</p>
                    <div className="bg-orange-900/50 border border-orange-400/50 rounded-lg p-4">
                      <span className="text-orange-200 font-mono font-bold text-2xl tracking-widest">
                        {developmentOtp}
                      </span>
                    </div>
                    <p className="text-orange-200/80 text-xs mt-2">
                      Use this code for testing or check your email
                    </p>
                  </div>
                </div>
              )}

              {/* Premium Action Buttons */}
              <div className="space-y-4">
                <button
                  onClick={handleOTPSubmit}
                  disabled={otpLoading || otpCode.length !== 6}
                  className="w-full bg-gradient-to-r from-blue-600/80 via-indigo-600/80 to-purple-600/80 backdrop-blur-xl border border-white/20 text-white py-4 px-6 rounded-xl font-bold text-lg hover:from-blue-700/90 hover:via-indigo-700/90 hover:to-purple-700/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-xl hover:shadow-2xl hover:scale-[1.02] disabled:hover:scale-100 relative overflow-hidden group"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  {otpLoading ? (
                    <div className="flex items-center justify-center space-x-3 relative z-10">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span>Verifying Your Code...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center space-x-3 relative z-10">
                      <Check className="w-5 h-5" />
                      <span>Verify & Join Waitlist</span>
                    </div>
                  )}
                </button>

                {/* Resend and Cancel Options */}
                <div className="flex items-center justify-between text-sm space-x-4">
                  <button
                    onClick={handleResendOTP}
                    disabled={otpLoading}
                    className="flex items-center space-x-2 text-white/80 hover:text-white font-semibold transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Mail className="w-4 h-4" />
                    <span>Resend Code</span>
                  </button>
                  
                  <button
                    onClick={() => {
                      setShowOTPModal(false);
                      setOtpCode('');
                      setOtpError(false);
                      setDevelopmentOtp(null);
                      setPendingUser(null);
                    }}
                    disabled={otpLoading}
                    className="flex items-center space-x-2 text-white/60 hover:text-white/80 font-semibold transition-colors duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <X className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Professional Light Theme Questionnaire Modal */}
    {showQuestionnaire && (
      <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[95vh] overflow-hidden shadow-2xl border border-gray-100">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-8 py-6 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Tell us about yourself</h1>
                <p className="text-gray-600 text-sm mt-1">Help us personalize your VeeFore experience</p>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-gray-500 mb-1">
                  Question {currentQuestion + 1} of {questions.length}
                </div>
                <div className="text-xs text-gray-400">
                  {Math.round(((currentQuestion + 1) / questions.length) * 100)}% Complete
                </div>
              </div>
            </div>
            
            {/* Progress Bar */}
            <div className="relative">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-700 ease-out shadow-sm"
                  style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="p-8 max-h-[60vh] overflow-y-auto">
            {/* Question Title */}
            <div className="mb-8">
              <h2 className="text-3xl font-bold text-gray-900 mb-2">{questions[currentQuestion]?.title}</h2>
              {questions[currentQuestion]?.type === 'multiple-choice' && (
                <p className="text-gray-500 text-sm">Select all that apply</p>
              )}
            </div>
            
            {/* Options Grid */}
            <div className="grid gap-3">
              {questions[currentQuestion]?.options.map((option, index) => {
                const isSelected = questions[currentQuestion].type === 'multiple-choice'
                  ? (questionnaireData[questions[currentQuestion].id as keyof typeof questionnaireData] as string[])?.includes(option.value)
                  : questionnaireData[questions[currentQuestion].id as keyof typeof questionnaireData] === option.value;

                return (
                  <button
                    key={option.value}
                    onClick={() => handleQuestionnaireAnswer(questions[currentQuestion].id, option.value)}
                    className={`group relative p-5 rounded-2xl border-2 transition-all duration-300 text-left flex items-center space-x-4 hover:shadow-lg hover:-translate-y-0.5 ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-50 shadow-lg shadow-blue-100' 
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                    style={{
                      animationDelay: `${index * 50}ms`
                    }}
                  >
                    {/* Icon */}
                    <div className={`text-3xl p-3 rounded-xl transition-all duration-300 ${
                      isSelected 
                        ? 'bg-blue-100' 
                        : 'bg-gray-100 group-hover:bg-gray-200'
                    }`}>
                      {option.icon}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className={`font-bold text-lg mb-1 transition-colors duration-300 ${
                        isSelected ? 'text-blue-900' : 'text-gray-900'
                      }`}>
                        {option.label}
                      </div>
                      {option.desc && (
                        <div className={`text-sm transition-colors duration-300 ${
                          isSelected ? 'text-blue-700' : 'text-gray-500'
                        }`}>
                          {option.desc}
                        </div>
                      )}
                    </div>
                    
                    {/* Selection Indicator */}
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                      isSelected 
                        ? 'border-blue-500 bg-blue-500' 
                        : 'border-gray-300 group-hover:border-gray-400'
                    }`}>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                      )}
                    </div>

                    {/* Subtle Selection Glow */}
                    {isSelected && (
                      <div className="absolute inset-0 rounded-2xl bg-blue-500/5 pointer-events-none"></div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Footer Navigation */}
          <div className="px-8 py-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <button
              onClick={handlePreviousQuestion}
              disabled={currentQuestion === 0}
              className="flex items-center space-x-2 px-6 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold transition-all duration-300 hover:bg-gray-50 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            {/* Step Indicators */}
            <div className="flex space-x-2">
              {questions.map((_, index) => (
                <div
                  key={index}
                  className={`w-2 h-2 rounded-full transition-all duration-300 ${
                    index === currentQuestion
                      ? 'bg-blue-500 w-6'
                      : index < currentQuestion
                      ? 'bg-blue-300'
                      : 'bg-gray-300'
                  }`}
                />
              ))}
            </div>

            <button
              onClick={handleNextQuestion}
              disabled={!canProceed()}
              className="flex items-center space-x-2 px-8 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold transition-all duration-300 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              <span>{currentQuestion === questions.length - 1 ? 'Complete Survey' : 'Next'}</span>
              {currentQuestion === questions.length - 1 ? (
                <Check className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    )}

    </>
  );
};

export default Waitlist;