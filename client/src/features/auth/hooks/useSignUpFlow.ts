import { useState, useEffect, useCallback } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';

/**
 * useSignUpFlow Hook
 * 
 * Manages the complete signup workflow state machine:
 * - Form submission (form → verification)
 * - Email verification (verification → creating)
 * - Firebase user creation (creating → onboarding-profile)
 * - Onboarding steps (profile → goals → platforms → plan)
 * - Session creation and completion
 * 
 * This hook extracts the state management logic from SignUpIntegrated.tsx
 * to enable component reusability and testability.
 * 
 * **Validates: Requirements 5.2, 5.3**
 */

// Types
export type SignupStep = 
  | 'form' 
  | 'verification' 
  | 'creating' 
  | 'onboarding-profile' 
  | 'onboarding-goals' 
  | 'onboarding-platforms' 
  | 'onboarding-plan'
  | 'onboarding-connect-meta'     // NEW: "Connect your Meta account" CTA screen
  | 'onboarding-brand-selection'; // NEW: Shown only when N > 1 authorized pages

export interface SignUpFormData {
  fullName: string;
  email: string;
  password: string;
}

export interface OTPData {
  code: string;
  expiryTime: number;
  resendCooldown: number;
  developmentOtp: string;
}

export interface OnboardingData {
  // Step 1: Profile
  role: string;
  companyName: string;
  companySize: string;
  // Step 2: Goals
  primaryGoals: string[];
  currentChallenges: string;
  monthlyBudget: string;
  // Step 3: Platforms
  platforms: string[];
  contentTypes: string[];
  postingFrequency: string;
  // Step 4: Plan
  selectedPlan: string;
}

export interface UseSignUpFlowReturn {
  // State
  currentStep: SignupStep;
  formData: SignUpFormData;
  otpData: OTPData;
  onboardingData: OnboardingData;
  errors: Record<string, string>;
  isVerifying: boolean;
  isResending: boolean;
  isCheckingEmail: boolean;
  isCompletingOnboarding: boolean;
  createdFirebaseUser: any | null;
  
  // Actions
  setCurrentStep: (step: SignupStep) => void;
  handleInputChange: (field: string, value: string) => void;
  handleSendOtp: (e: React.FormEvent) => Promise<void>;
  handleVerifyOtp: (e: React.FormEvent) => Promise<void>;
  handleResendOtp: () => Promise<void>;
  handleOTPCodeChange: (code: string) => void;
  handleOnboardingInputChange: (field: string, value: any) => void;
  handleArrayToggle: (field: string, value: string) => void;
  handleOnboardingNext: () => void;
  handleOnboardingPrev: () => void;
  handleCompleteOnboarding: () => Promise<void>;
  isOnboardingStepValid: () => boolean;
  getOnboardingStepNumber: () => number;
  clearErrors: (field?: string) => void;
  formatTime: (seconds: number) => string;
}

// Constants
const STORAGE_KEY_FORM = 'signup_form_data_v1';
const STORAGE_KEY_STATE = 'signup_state_v1';
const OTP_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const RESEND_COOLDOWN_SECONDS = 60;
const OTP_VALIDITY_SECONDS = 900; // 15 minutes

// Initial State
const initialFormData: SignUpFormData = {
  fullName: '',
  email: '',
  password: ''
};

const initialOTPData: OTPData = {
  code: '',
  expiryTime: 0,
  resendCooldown: 0,
  developmentOtp: ''
};

const initialOnboardingData: OnboardingData = {
  role: '',
  companyName: '',
  companySize: '',
  primaryGoals: [],
  currentChallenges: '',
  monthlyBudget: '',
  platforms: [],
  contentTypes: [],
  postingFrequency: '',
  selectedPlan: 'free'
};

/**
 * useSignUpFlow Hook Implementation
 */
export const useSignUpFlow = (
  toast: any,
  validateForm: () => Promise<boolean>
): UseSignUpFlowReturn => {
  // State Management
  const [currentStep, setCurrentStep] = useState<SignupStep>('form');
  const [formData, setFormData] = useState<SignUpFormData>(initialFormData);
  const [otpData, setOtpData] = useState<OTPData>(initialOTPData);
  const [onboardingData, setOnboardingData] = useState<OnboardingData>(initialOnboardingData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isVerifying, setIsVerifying] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [isCompletingOnboarding, setIsCompletingOnboarding] = useState(false);
  const [createdFirebaseUser, setCreatedFirebaseUser] = useState<any>(null);

  // Persistence: Load persisted state on mount
  useEffect(() => {
    try {
      // Restore Form Data
      const savedForm = localStorage.getItem(STORAGE_KEY_FORM);
      if (savedForm) {
        const parsed = JSON.parse(savedForm);
        setFormData(prev => ({ ...prev, ...parsed }));
      }

      // Restore Flow State (OTP Step)
      const savedState = localStorage.getItem(STORAGE_KEY_STATE);
      if (savedState) {
        const { step, email, timestamp, developmentOtp } = JSON.parse(savedState);
        const now = Date.now();

        if (step === 'verification' && (now - timestamp < OTP_EXPIRY_MS)) {
          setFormData(prev => ({ ...prev, email }));
          setCurrentStep('verification');
          const elapsedSeconds = Math.floor((now - timestamp) / 1000);

          setOtpData(prev => ({
            ...prev,
            expiryTime: Math.max(0, OTP_VALIDITY_SECONDS - elapsedSeconds),
            resendCooldown: Math.max(0, RESEND_COOLDOWN_SECONDS - elapsedSeconds),
            developmentOtp: developmentOtp || ''
          }));
        } else {
          localStorage.removeItem(STORAGE_KEY_STATE);
        }
      }
    } catch (e) {
      console.warn('Failed to load signup state', e);
    }
  }, []);

  // Persistence: Save form data on change (debounced)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      // Security: Exclude password from persistence
      const { password, ...dataToSave } = formData;
      localStorage.setItem(STORAGE_KEY_FORM, JSON.stringify(dataToSave));
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [formData]);

  // Timer: Update OTP expiry and resend cooldown
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (currentStep === 'verification') {
      const updateTimer = () => {
        const savedState = localStorage.getItem(STORAGE_KEY_STATE);
        if (savedState) {
          const { timestamp } = JSON.parse(savedState);
          const now = Date.now();
          const elapsedSeconds = Math.floor((now - timestamp) / 1000);

          setOtpData(prev => ({
            ...prev,
            expiryTime: Math.max(0, OTP_VALIDITY_SECONDS - elapsedSeconds),
            resendCooldown: Math.max(0, RESEND_COOLDOWN_SECONDS - elapsedSeconds)
          }));
        }
      };

      updateTimer();
      interval = setInterval(updateTimer, 1000);
    }
    return () => clearInterval(interval);
  }, [currentStep]);

  // Helper: Clear signup storage
  const clearSignupStorage = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY_FORM);
    localStorage.removeItem(STORAGE_KEY_STATE);
  }, []);

  // Action: Handle input change
  const handleInputChange = useCallback((field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  }, [errors]);

  // Action: Clear errors
  const clearErrors = useCallback((field?: string) => {
    if (field) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    } else {
      setErrors({});
    }
  }, []);

  // Action: Send OTP (form → verification)
  const handleSendOtp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setIsResending(true);

      const isValid = await validateForm();
      if (!isValid) {
        setIsResending(false);
        return;
      }

      const response = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase(),
          firstName: formData.fullName.trim().split(' ')[0]
        })
      });

      const data = await response.json();

      if (!response.ok) {
        console.log('[EARLY ACCESS] Error response:', { status: response.status, data });

        if (response.status === 403) {
          const errorCode = data.error?.code || data.code;
          const errorMessage = data.error?.message || data.message;

          switch (errorCode) {
            case 'NOT_ON_WAITLIST':
              setErrors({ 
                email: '🚫 Access Denied - This email isn\'t on our waitlist yet. Join us at veefore.com/waitlist!' 
              });
              toast({
                title: "Join Our Waitlist First",
                description: "Sign up for early access at veefore.com/waitlist to get started.",
                variant: "destructive",
              });
              setIsResending(false);
              return;
              
            case 'PENDING_APPROVAL':
              setErrors({ 
                email: '⏳ Almost There! Your application is under review. We\'ll email you once approved (usually 24-48 hours).' 
              });
              toast({
                title: "Hang Tight!",
                description: "We're reviewing your application. Check your email for updates!",
                variant: "default",
              });
              setIsResending(false);
              return;
              
            case 'ACCESS_REJECTED':
              setErrors({ 
                email: '😔 Unfortunately, your application wasn\'t approved this time. Contact support@veefore.com for details.' 
              });
              toast({
                title: "Application Not Approved",
                description: "Reach out to support@veefore.com for more information.",
                variant: "destructive",
              });
              setIsResending(false);
              return;
              
            default:
              setErrors({ 
                email: '🔒 Early Access Required - This product is invite-only. Join our waitlist to get access!' 
              });
              toast({
                title: "Early Access Required",
                description: "Visit veefore.com/waitlist to request access.",
                variant: "destructive",
              });
              setIsResending(false);
              return;
          }
        }

        throw new Error(data.message || 'Failed to send verification email');
      }

      setOtpData({
        code: '',
        expiryTime: OTP_VALIDITY_SECONDS,
        resendCooldown: RESEND_COOLDOWN_SECONDS,
        developmentOtp: data.developmentOtp || ''
      });

      setCurrentStep('verification');

      toast({
        title: "Verification email sent!",
        description: `Please check your email at ${formData.email} for the verification code.`,
      });

      if (data.developmentOtp) {
        console.log('Development OTP:', data.developmentOtp);
        toast({
          title: "Development Mode",
          description: `OTP: ${data.developmentOtp}`,
          variant: "default",
        });
      }

      // Save state for persistence
      localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify({
        step: 'verification',
        email: formData.email.trim().toLowerCase(),
        timestamp: Date.now(),
        developmentOtp: data.developmentOtp
      }));

    } catch (error: any) {
      console.error('❌ Send OTP error:', error);
      setErrors({ email: error.message });
    } finally {
      setIsResending(false);
    }
  }, [formData, validateForm, toast]);

  // Action: Verify OTP (verification → creating → onboarding-profile)
  const handleVerifyOtp = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!otpData.code || otpData.code.length !== 6) {
      setErrors({ otp: 'Please enter the 6-digit verification code' });
      return;
    }

    setIsVerifying(true);
    setErrors(prev => ({ ...prev, otp: '' }));

    try {
      const verifyResponse = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase(),
          code: otpData.code
        })
      });

      const verifyData = await verifyResponse.json();

      if (!verifyResponse.ok) {
        const message = verifyData.error?.message || verifyData.message || 'Verification failed';
        throw new Error(message);
      }

      // Pre-validation check before Firebase user creation
      console.log('[EARLY ACCESS] Pre-validation check before Firebase user creation');
      
      const preValidationResponse = await fetch('/api/auth/check-early-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase()
        })
      });

      if (!preValidationResponse.ok) {
        const preValidationData = await preValidationResponse.json();
        
        if (preValidationResponse.status === 403) {
          const errorCode = preValidationData.error?.code || preValidationData.code;
          
          switch (errorCode) {
            case 'NOT_ON_WAITLIST':
              setErrors({ 
                otp: '🚫 Access Denied - This email isn\'t on our waitlist. Join at veefore.com/waitlist to get started!' 
              });
              toast({
                title: "Join Our Waitlist First",
                description: "Sign up for early access at veefore.com/waitlist.",
                variant: "destructive",
              });
              throw new Error('NOT_ON_WAITLIST');
              
            case 'PENDING_APPROVAL':
              setErrors({ 
                otp: '⏳ Almost There! Your application is under review. We\'ll email you once approved (usually 24-48 hours).' 
              });
              toast({
                title: "Hang Tight!",
                description: "We're reviewing your application. Check your email for updates!",
                variant: "default",
              });
              throw new Error('PENDING_APPROVAL');
              
            default:
              setErrors({ 
                otp: '🔒 Early Access Required - This product is invite-only. Join our waitlist to get access!' 
              });
              toast({
                title: "Early Access Required",
                description: "Visit veefore.com/waitlist to request access.",
                variant: "destructive",
              });
              throw new Error('Early access validation failed');
          }
        }
        
        throw new Error('Validation check failed');
      }

      console.log('[EARLY ACCESS] Pre-validation passed - proceeding with Firebase user creation');

      // Create Firebase user
      const userCredential = await createUserWithEmailAndPassword(
        auth, 
        formData.email, 
        formData.password
      );
      console.log('✅ Firebase user created successfully:', userCredential.user.uid);

      // Create backend session
      console.log('[SignUp] Creating backend session after Firebase user creation');
      try {
        const signinResponse = await fetch('/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: formData.email.trim().toLowerCase() })
        });

        if (signinResponse.ok) {
          console.log('[SignUp] Backend session created successfully');
        }
      } catch (sessionError) {
        console.warn('[SignUp] Backend session creation error:', sessionError);
      }

      // Link Firebase user to backend
      const linkResponse = await fetch('/api/auth/link-firebase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email.trim().toLowerCase(),
          firebaseUid: userCredential.user.uid,
          displayName: formData.fullName
        })
      });

      if (!linkResponse.ok) {
        const errorData = await linkResponse.json();
        
        if (linkResponse.status === 403) {
          // Delete Firebase user if backend validation fails
          try {
            await userCredential.user.delete();
            console.log('[AUTH] Deleted Firebase user due to early access validation failure');
          } catch (deleteError) {
            await auth.signOut();
          }
          
          throw new Error('Failed to complete account setup');
        }
        
        throw new Error('Failed to complete account setup');
      }

      toast({
        title: "Email verified!",
        description: "Just a few more steps to set up your account.",
      });

      setCreatedFirebaseUser(userCredential.user);
      clearSignupStorage();
      setCurrentStep('onboarding-profile');

    } catch (error: any) {
      console.error('❌ Verification error:', error);
      setCurrentStep('verification');

      const earlyAccessErrors = ['NOT_ON_WAITLIST', 'PENDING_APPROVAL', 'ACCESS_REJECTED', 'INVALID_STATUS'];
      
      if (earlyAccessErrors.includes(error.message)) {
        return;
      }

      let errorMessage = 'Verification failed. Please try again.';
      if (error.message.includes('expired')) {
        errorMessage = 'This code has expired. Please request a new one.';
      } else if (error.message.includes('Invalid verification code') || error.message.includes('invalid')) {
        errorMessage = 'Incorrect code. Please check and try again.';
      }

      setErrors({ otp: errorMessage });
      toast({
        title: "Verification Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsVerifying(false);
    }
  }, [otpData, formData, toast, clearSignupStorage]);

  // Action: Resend OTP
  const handleResendOtp = useCallback(async () => {
    if (otpData.resendCooldown > 0) return;

    setIsResending(true);
    setErrors(prev => ({ ...prev, otp: '' }));

    try {
      const response = await fetch('/api/auth/send-verification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          firstName: formData.fullName.split(' ')[0]
        })
      });

      const data = await response.json();

      if (response.ok) {
        setOtpData({
          code: '',
          expiryTime: OTP_VALIDITY_SECONDS,
          resendCooldown: RESEND_COOLDOWN_SECONDS,
          developmentOtp: data.developmentOtp || ''
        });

        toast({
          title: "New code sent!",
          description: "Please check your email inbox.",
        });

        localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify({
          step: 'verification',
          email: formData.email,
          timestamp: Date.now(),
          developmentOtp: data.developmentOtp
        }));
      } else {
        throw new Error(data.message || 'Failed to resend code');
      }
    } catch (error: any) {
      toast({
        title: "Resend Failed",
        description: error.message || "Could not resend verification code.",
        variant: "destructive",
      });
    } finally {
      setIsResending(false);
    }
  }, [otpData, formData, toast]);

  // Action: Handle OTP code change
  const handleOTPCodeChange = useCallback((code: string) => {
    setOtpData(prev => ({ ...prev, code }));
    if (errors.otp) {
      setErrors(prev => ({ ...prev, otp: '' }));
    }
  }, [errors]);

  // Action: Handle onboarding input change
  const handleOnboardingInputChange = useCallback((field: string, value: any) => {
    setOnboardingData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Action: Handle array toggle (for multi-select fields)
  const handleArrayToggle = useCallback((field: string, value: string) => {
    setOnboardingData(prev => ({
      ...prev,
      [field]: (prev[field as keyof typeof prev] as string[]).includes(value)
        ? (prev[field as keyof typeof prev] as string[]).filter(item => item !== value)
        : [...(prev[field as keyof typeof prev] as string[]), value]
    }));
  }, []);

  // Helper: Check if current onboarding step is valid
  const isOnboardingStepValid = useCallback(() => {
    switch (currentStep) {
      case 'onboarding-profile':
        return onboardingData.role !== '';
      case 'onboarding-goals':
        return onboardingData.primaryGoals.length > 0;
      case 'onboarding-platforms':
        return onboardingData.platforms.length > 0;
      case 'onboarding-plan':
        return onboardingData.selectedPlan !== '';
      case 'onboarding-connect-meta': return true;
      case 'onboarding-brand-selection': return true;
      default:
        return true;
    }
  }, [currentStep, onboardingData]);

  // Action: Navigate to next onboarding step
  const handleOnboardingNext = useCallback(() => {
    switch (currentStep) {
      case 'onboarding-profile':
        setCurrentStep('onboarding-goals');
        break;
      case 'onboarding-goals':
        setCurrentStep('onboarding-platforms');
        break;
      case 'onboarding-platforms':
        setCurrentStep('onboarding-plan');
        break;
      case 'onboarding-plan':
        setCurrentStep('onboarding-connect-meta');
        break;
    }
  }, [currentStep]);

  // Action: Navigate to previous onboarding step
  const handleOnboardingPrev = useCallback(() => {
    switch (currentStep) {
      case 'onboarding-goals':
        setCurrentStep('onboarding-profile');
        break;
      case 'onboarding-platforms':
        setCurrentStep('onboarding-goals');
        break;
      case 'onboarding-plan':
        setCurrentStep('onboarding-platforms');
        break;
      case 'onboarding-connect-meta':
        setCurrentStep('onboarding-plan');
        break;
    }
  }, [currentStep]);

  // Action: Complete onboarding
  const handleCompleteOnboarding = useCallback(async () => {
    if (isCompletingOnboarding) return;
    setIsCompletingOnboarding(true);

    try {
      const authToken = await createdFirebaseUser?.getIdToken();

      if (!authToken) {
        throw new Error('No authentication token available');
      }

      const response = await fetch('/api/user/complete-onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          preferences: {
            fullName: formData.fullName,
            ...onboardingData
          }
        })
      });

      if (!response.ok) {
        throw new Error('Failed to complete onboarding');
      }

      toast({
        title: "Welcome to VeeFore! 🎉",
        description: "Your account is ready. Let's grow your social presence!",
      });

      await new Promise(resolve => setTimeout(resolve, 500));
      window.location.href = '/';

    } catch (error: any) {
      console.error('Failed to complete onboarding:', error);
      toast({
        title: "Onboarding Failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCompletingOnboarding(false);
    }
  }, [isCompletingOnboarding, createdFirebaseUser, formData, onboardingData, toast]);

  // Helper: Get onboarding step number
  const getOnboardingStepNumber = useCallback(() => {
    switch (currentStep) {
      case 'onboarding-profile': return 1;
      case 'onboarding-goals': return 2;
      case 'onboarding-platforms': return 3;
      case 'onboarding-plan': return 4;
      case 'onboarding-connect-meta': return 5;
      case 'onboarding-brand-selection': return 6;
      default: return 0;
    }
  }, [currentStep]);

  // Helper: Format time (MM:SS)
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    // State
    currentStep,
    formData,
    otpData,
    onboardingData,
    errors,
    isVerifying,
    isResending,
    isCheckingEmail,
    isCompletingOnboarding,
    createdFirebaseUser,
    
    // Actions
    setCurrentStep,
    handleInputChange,
    handleSendOtp,
    handleVerifyOtp,
    handleResendOtp,
    handleOTPCodeChange,
    handleOnboardingInputChange,
    handleArrayToggle,
    handleOnboardingNext,
    handleOnboardingPrev,
    handleCompleteOnboarding,
    isOnboardingStepValid,
    getOnboardingStepNumber,
    clearErrors,
    formatTime,
  };
};
