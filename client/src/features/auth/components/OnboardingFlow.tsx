import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, ArrowRight, Loader2, User, Target, Settings, CheckCircle } from "lucide-react"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"

/**
 * OnboardingFlow Component
 * 
 * Multi-step onboarding wizard that guides new users through:
 * - Step 1: Profile Setup (role, company, size)
 * - Step 2: Goals & Budget (primary goals, challenges, budget)
 * - Step 3: Platforms & Content (social platforms, content types, frequency)
 * - Step 4: Plan Selection (free, basic, pro)
 * 
 * Features:
 * - Progress indicator showing step completion (1/4, 2/4, 3/4, 4/4)
 * - Navigation between steps (next, back)
 * - Form validation per step
 * - Smooth animations between steps
 * 
 * @requirements 2.2, 5.3
 */

type OnboardingStep = 'profile' | 'goals' | 'platforms' | 'plan'

export interface OnboardingData {
  // Step 1: Profile
  fullName: string
  role: string
  companyName: string
  companySize: string
  // Step 2: Goals
  primaryGoals: string[]
  currentChallenges: string
  monthlyBudget: string
  // Step 3: Platforms
  platforms: string[]
  contentTypes: string[]
  postingFrequency: string
  // Step 4: Plan
  selectedPlan: string
}

interface OnboardingFlowProps {
  fullName: string
  onComplete: (data: OnboardingData) => Promise<void>
  onSkip?: () => void
}

const ONBOARDING_STEPS: OnboardingStep[] = ['profile', 'goals', 'platforms', 'plan']

export function OnboardingFlow({ fullName, onComplete, onSkip }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>('profile')
  const [isCompleting, setIsCompleting] = useState(false)
  
  const [onboardingData, setOnboardingData] = useState<OnboardingData>({
    // Step 1: Profile (fullName pre-filled from signup)
    fullName,
    role: '',
    companyName: '',
    companySize: '',
    // Step 2: Goals
    primaryGoals: [],
    currentChallenges: '',
    monthlyBudget: '',
    // Step 3: Platforms
    platforms: [],
    contentTypes: [],
    postingFrequency: '',
    // Step 4: Plan
    selectedPlan: 'free'
  })

  const handleInputChange = (field: keyof OnboardingData, value: string) => {
    setOnboardingData(prev => ({ ...prev, [field]: value }))
  }

  const handleArrayToggle = (field: 'primaryGoals' | 'platforms' | 'contentTypes', value: string) => {
    setOnboardingData(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(item => item !== value)
        : [...prev[field], value]
    }))
  }

  const getStepNumber = (): number => {
    return ONBOARDING_STEPS.indexOf(currentStep) + 1
  }

  const isStepValid = (): boolean => {
    switch (currentStep) {
      case 'profile':
        return onboardingData.role !== ''
      case 'goals':
        return onboardingData.primaryGoals.length > 0
      case 'platforms':
        return onboardingData.platforms.length > 0
      case 'plan':
        return onboardingData.selectedPlan !== ''
      default:
        return false
    }
  }

  const handleNext = async () => {
    const currentIndex = ONBOARDING_STEPS.indexOf(currentStep)
    
    if (currentIndex < ONBOARDING_STEPS.length - 1) {
      // Move to next step
      setCurrentStep(ONBOARDING_STEPS[currentIndex + 1])
    } else {
      // Last step - complete onboarding
      setIsCompleting(true)
      try {
        await onComplete(onboardingData)
      } catch (error) {
        console.error('Onboarding completion failed:', error)
        setIsCompleting(false)
      }
    }
  }

  const handlePrev = () => {
    const currentIndex = ONBOARDING_STEPS.indexOf(currentStep)
    if (currentIndex > 0) {
      setCurrentStep(ONBOARDING_STEPS[currentIndex - 1])
    }
  }

  const progressPercentage = (getStepNumber() / ONBOARDING_STEPS.length) * 100

  return (
    <div className="space-y-4 py-4">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-white/60">Step {getStepNumber()} of {ONBOARDING_STEPS.length}</span>
          <span className="text-teal-400">{Math.round(progressPercentage)}% complete</span>
        </div>
        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progressPercentage}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {currentStep === 'profile' && (
          <motion.div
            key="profile"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="text-center">
              <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 border border-teal-500/30">
                <User className="w-6 h-6 text-teal-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Tell us about yourself</h2>
              <p className="text-sm text-white/50">Help us personalize your VeeFore experience</p>
            </div>

            <div className="space-y-3">
              {/* Full Name - Pre-filled from signup */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-white/70">Full Name</Label>
                <Input
                  value={onboardingData.fullName}
                  disabled
                  className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white/60"
                />
              </div>

              {/* Role */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-white/70">Your Role *</Label>
                <Select value={onboardingData.role} onValueChange={(value) => handleInputChange('role', value)}>
                  <SelectTrigger className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white focus:border-teal-500/50">
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border border-white/10 bg-gray-900">
                    <SelectItem value="founder">Founder/CEO</SelectItem>
                    <SelectItem value="marketing-manager">Marketing Manager</SelectItem>
                    <SelectItem value="social-media-manager">Social Media Manager</SelectItem>
                    <SelectItem value="content-creator">Content Creator</SelectItem>
                    <SelectItem value="freelancer">Freelancer</SelectItem>
                    <SelectItem value="agency-owner">Agency Owner</SelectItem>
                    <SelectItem value="influencer">Influencer</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Company Name */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-white/70">Company/Brand Name</Label>
                <Input
                  value={onboardingData.companyName}
                  onChange={(e) => handleInputChange('companyName', e.target.value)}
                  placeholder="Enter your company name"
                  className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-teal-500/50"
                />
              </div>

              {/* Company Size */}
              <div className="space-y-1">
                <Label className="text-xs font-medium text-white/70">Company Size</Label>
                <Select value={onboardingData.companySize} onValueChange={(value) => handleInputChange('companySize', value)}>
                  <SelectTrigger className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white focus:border-teal-500/50">
                    <SelectValue placeholder="Select company size" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border border-white/10 bg-gray-900">
                    <SelectItem value="solo">Just me</SelectItem>
                    <SelectItem value="2-10">2-10 employees</SelectItem>
                    <SelectItem value="11-50">11-50 employees</SelectItem>
                    <SelectItem value="51-200">51-200 employees</SelectItem>
                    <SelectItem value="200+">200+ employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>
        )}

        {currentStep === 'goals' && (
          <motion.div
            key="goals"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 border border-blue-500/30">
                <Target className="w-6 h-6 text-blue-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">What are your goals?</h2>
              <p className="text-sm text-white/50">Help us understand what you want to achieve</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-white/70">Primary Goals *</Label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {[
                    'Increase followers', 'Drive website traffic', 'Generate leads', 'Boost engagement',
                    'Build brand awareness', 'Increase sales', 'Save time on content', 'Improve content quality'
                  ].map((goal) => (
                    <label
                      key={goal}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition-all ${
                        onboardingData.primaryGoals.includes(goal)
                          ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300'
                          : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <Checkbox
                        checked={onboardingData.primaryGoals.includes(goal)}
                        onCheckedChange={() => handleArrayToggle('primaryGoals', goal)}
                        className="rounded-sm border-white/20 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                      />
                      <span className="flex-1">{goal}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-white/70">Biggest challenge</Label>
                <Textarea
                  value={onboardingData.currentChallenges}
                  onChange={(e) => handleInputChange('currentChallenges', e.target.value)}
                  placeholder="Tell us your main challenges..."
                  rows={2}
                  className="px-3 py-2 text-sm rounded-lg bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:border-teal-500/50 resize-none"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-white/70">Monthly Budget</Label>
                <Select value={onboardingData.monthlyBudget} onValueChange={(value) => handleInputChange('monthlyBudget', value)}>
                  <SelectTrigger className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white focus:border-teal-500/50">
                    <SelectValue placeholder="Select budget range" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border border-white/10 bg-gray-900">
                    <SelectItem value="0-500">$0 - $500</SelectItem>
                    <SelectItem value="500-1000">$500 - $1,000</SelectItem>
                    <SelectItem value="1000-5000">$1,000 - $5,000</SelectItem>
                    <SelectItem value="5000-10000">$5,000 - $10,000</SelectItem>
                    <SelectItem value="10000+">$10,000+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>
        )}

        {currentStep === 'platforms' && (
          <motion.div
            key="platforms"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="text-center">
              <div className="w-12 h-12 bg-emerald-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 border border-emerald-500/30">
                <Settings className="w-6 h-6 text-emerald-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Your content strategy</h2>
              <p className="text-sm text-white/50">Tell us about your social media preferences</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-medium text-white/70">Platforms you use *</Label>
                <div className="grid grid-cols-2 gap-2">
                  {['Instagram', 'Facebook', 'Twitter/X', 'LinkedIn', 'TikTok', 'YouTube'].map((platform) => (
                    <label
                      key={platform}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition-all ${
                        onboardingData.platforms.includes(platform)
                          ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300'
                          : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <Checkbox
                        checked={onboardingData.platforms.includes(platform)}
                        onCheckedChange={() => handleArrayToggle('platforms', platform)}
                        className="rounded-sm border-white/20 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                      />
                      <span className="flex-1">{platform}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-white/70">Content Types</Label>
                <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                  {['Photos', 'Videos', 'Stories', 'Reels/Shorts', 'Carousels', 'Text posts'].map((type) => (
                    <label
                      key={type}
                      className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer text-xs transition-all ${
                        onboardingData.contentTypes.includes(type)
                          ? 'bg-teal-500/20 border border-teal-500/40 text-teal-300'
                          : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
                      }`}
                    >
                      <Checkbox
                        checked={onboardingData.contentTypes.includes(type)}
                        onCheckedChange={() => handleArrayToggle('contentTypes', type)}
                        className="rounded-sm border-white/20 data-[state=checked]:bg-teal-500 data-[state=checked]:border-teal-500"
                      />
                      <span className="flex-1">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-medium text-white/70">Posting Frequency</Label>
                <Select value={onboardingData.postingFrequency} onValueChange={(value) => handleInputChange('postingFrequency', value)}>
                  <SelectTrigger className="h-10 px-3 text-sm rounded-lg bg-white/5 border-white/10 text-white focus:border-teal-500/50">
                    <SelectValue placeholder="Select posting frequency" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border border-white/10 bg-gray-900">
                    <SelectItem value="multiple-daily">Multiple times per day</SelectItem>
                    <SelectItem value="daily">Once per day</SelectItem>
                    <SelectItem value="few-weekly">Few times per week</SelectItem>
                    <SelectItem value="weekly">Once per week</SelectItem>
                    <SelectItem value="irregular">Irregular/as needed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </motion.div>
        )}

        {currentStep === 'plan' && (
          <motion.div
            key="plan"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="text-center">
              <div className="w-12 h-12 bg-yellow-500/20 rounded-xl flex items-center justify-center mx-auto mb-3 border border-yellow-500/30">
                <span className="text-xl">💎</span>
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Choose your plan</h2>
              <p className="text-sm text-white/50">You can upgrade anytime</p>
            </div>

            <div className="space-y-2">
              {[
                { id: 'free', name: 'Free', price: '$0', features: ['1 social account', '10 posts/month', 'Basic analytics'] },
                { id: 'basic', name: 'Basic', price: '$19', features: ['3 accounts', '100 posts/month', 'Advanced analytics'], popular: false },
                { id: 'pro', name: 'Pro', price: '$49', features: ['10 accounts', 'Unlimited posts', 'AI content', 'Team collab'], popular: true }
              ].map((plan) => (
                <div
                  key={plan.id}
                  onClick={() => handleInputChange('selectedPlan', plan.id)}
                  className={`relative p-3 rounded-xl cursor-pointer transition-all ${
                    onboardingData.selectedPlan === plan.id
                      ? 'bg-teal-500/20 border-2 border-teal-500'
                      : 'bg-white/5 border border-white/10 hover:bg-white/10'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-2 right-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                      Most Popular
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        onboardingData.selectedPlan === plan.id ? 'border-teal-500 bg-teal-500' : 'border-white/30'
                      }`}>
                        {onboardingData.selectedPlan === plan.id && (
                          <CheckCircle className="w-3 h-3 text-white" />
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">{plan.name}</h4>
                        <p className="text-xs text-white/40">{plan.features.join(' • ')}</p>
                      </div>
                    </div>
                    <span className="text-lg font-bold text-white">{plan.price}<span className="text-xs text-white/50">/mo</span></span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-white/10">
        <button
          type="button"
          onClick={handlePrev}
          disabled={currentStep === 'profile' || isCompleting}
          className={`flex items-center gap-2 px-4 py-2 text-sm rounded-lg transition-all ${
            currentStep === 'profile' || isCompleting
              ? 'text-white/20 cursor-not-allowed'
              : 'text-white/60 hover:text-white hover:bg-white/10'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={handleNext}
          disabled={!isStepValid() || isCompleting}
          className={`flex items-center gap-2 px-5 py-2 text-sm font-semibold rounded-lg transition-all ${
            isStepValid() && !isCompleting
              ? 'bg-gradient-to-r from-teal-500 to-emerald-500 text-white hover:from-teal-600 hover:to-emerald-600'
              : 'bg-white/10 text-white/30 cursor-not-allowed'
          }`}
        >
          {isCompleting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Completing...
            </>
          ) : currentStep === 'plan' ? (
            <>
              Get Started
              <ArrowRight className="w-4 h-4" />
            </>
          ) : (
            <>
              Continue
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>

      {/* Optional Skip Link */}
      {onSkip && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={onSkip}
            disabled={isCompleting}
            className="text-xs text-white/40 hover:text-white/60 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Skip for now
          </button>
        </div>
      )}
    </div>
  )
}
