import React, { useState } from 'react'
import { X, ChevronLeft, ChevronRight, Check, Sparkles, Target, BarChart3, Calendar, Users, Zap, Star, PlayCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface WalkthroughStep {
  id: number
  title: string
  subtitle: string
  description: string
  icon: React.ElementType
  gradient: string
  features: string[]
  action?: {
    text: string
    highlight: boolean
  }
  image?: string
  tip?: string
}

const walkthroughSteps: WalkthroughStep[] = [
  {
    id: 1,
    title: "Welcome to VeeFore",
    subtitle: "Your Social Media Command Center",
    description: "Transform your social media presence with AI-powered content creation, analytics, and automation. Let's take you on a tour of your new favorite platform.",
    icon: Sparkles,
    gradient: "from-purple-600 via-pink-600 to-blue-600",
    features: [
      "AI-powered content creation",
      "Multi-platform publishing", 
      "Advanced analytics & insights",
      "Automated scheduling",
      "Performance optimization"
    ],
    tip: "VeeFore helps creators and businesses grow their social media presence 10x faster"
  },
  {
    id: 2,
    title: "Quick Actions Hub",
    subtitle: "Create Content in Seconds",
    description: "Your content creation starts here. Choose from AI-powered tools, trending topics, or start from scratch. Our intelligent system adapts to your brand voice and audience preferences.",
    icon: Zap,
    gradient: "from-emerald-500 via-teal-600 to-blue-600",
    features: [
      "Create from scratch with templates",
      "Post across multiple networks",
      "AI-powered trend discovery",
      "Brand voice optimization",
      "Smart hashtag generation"
    ],
    action: {
      text: "Try creating your first post",
      highlight: true
    },
    tip: "Our AI learns from your best-performing content to suggest improvements"
  },
  {
    id: 3,
    title: "Performance Dashboard",
    subtitle: "Real-Time Social Intelligence",
    description: "Monitor your social media performance with comprehensive analytics. Track followers, engagement, reach, and identify your top-performing content across all platforms.",
    icon: BarChart3,
    gradient: "from-blue-600 via-indigo-600 to-purple-600",
    features: [
      "Real-time follower tracking",
      "Engagement rate analysis", 
      "Cross-platform insights",
      "Performance benchmarking",
      "Growth trend predictions"
    ],
    tip: "Check your dashboard daily to spot trending patterns and optimize your strategy"
  },
  {
    id: 4,
    title: "Social Accounts",
    subtitle: "Unified Platform Management", 
    description: "Connect and manage all your social media accounts from one place. Switch between platforms seamlessly and maintain consistent branding across your entire presence.",
    icon: Users,
    gradient: "from-pink-500 via-rose-500 to-orange-500",
    features: [
      "Multi-platform integration",
      "Account health monitoring",
      "Automated sync & backup",
      "Cross-platform analytics",
      "Unified content distribution"
    ],
    action: {
      text: "Connect more accounts",
      highlight: false
    },
    tip: "The more accounts you connect, the more powerful your analytics become"
  },
  {
    id: 5,
    title: "Content Scheduler",
    subtitle: "Plan Your Success",
    description: "Schedule posts weeks in advance with our intelligent scheduling system. Optimize posting times for maximum engagement and maintain a consistent presence.",
    icon: Calendar,
    gradient: "from-cyan-500 via-blue-500 to-indigo-600",
    features: [
      "Smart scheduling optimization",
      "Bulk content upload",
      "Visual content calendar",
      "Time zone optimization",
      "Audience activity tracking"
    ],
    action: {
      text: "Schedule your first post",
      highlight: true
    },
    tip: "Consistent posting is key - our AI suggests the best times for your audience"
  },
  {
    id: 6,
    title: "AI Recommendations",
    subtitle: "Personalized Growth Insights",
    description: "Get personalized recommendations based on your performance data, industry trends, and competitor analysis. Our AI continuously learns and adapts to your goals.",
    icon: Target,
    gradient: "from-violet-600 via-purple-600 to-pink-600",
    features: [
      "Personalized content suggestions",
      "Optimal posting times",
      "Hashtag recommendations",
      "Audience insights",
      "Competitor analysis"
    ],
    tip: "Act on recommendations weekly to see significant growth improvements"
  },
  {
    id: 7,
    title: "You're Ready to Grow!",
    subtitle: "Start Your Social Media Journey",
    description: "You now have everything you need to dominate social media. Create engaging content, schedule strategically, and watch your audience grow with VeeFore's powerful tools.",
    icon: Star,
    gradient: "from-yellow-400 via-orange-500 to-red-500",
    features: [
      "✓ Dashboard tour completed",
      "✓ Features explored", 
      "✓ Tools ready to use",
      "✓ Growth strategy activated",
      "✓ Success journey begins"
    ],
    action: {
      text: "Start Creating Content",
      highlight: true
    },
    tip: "Your social media growth journey starts now - we're here to help every step!"
  }
]

interface WalkthroughModalProps {
  isOpen?: boolean
  open?: boolean
  onClose: () => void
  userData?: any
  userName?: string
}

export function WalkthroughModal({ isOpen, open, onClose, userData = null, userName = null }: WalkthroughModalProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isAnimating, setIsAnimating] = useState(false)
  const [completedSteps, setCompletedSteps] = useState<number[]>([])

  const modalOpen = isOpen || open
  
  // Use userData for personalization
  const displayName = userData?.displayName || userData?.fullName || userName || 'User'
  const step = walkthroughSteps[currentStep]
  const progress = ((currentStep + 1) / walkthroughSteps.length) * 100

  // Smooth step transitions
  const goToStep = (stepIndex: number) => {
    if (stepIndex < 0 || stepIndex >= walkthroughSteps.length) return
    
    setIsAnimating(true)
    setTimeout(() => {
      setCurrentStep(stepIndex)
      if (stepIndex > currentStep && !completedSteps.includes(currentStep)) {
        setCompletedSteps(prev => [...prev, currentStep])
      }
      setIsAnimating(false)
    }, 150)
  }

  const nextStep = () => goToStep(currentStep + 1)
  const prevStep = () => goToStep(currentStep - 1)

  const handleClose = () => {
    setIsAnimating(true)
    setTimeout(() => {
      onClose()
      // Reset state for next time
      setTimeout(() => {
        setCurrentStep(0)
        setCompletedSteps([])
        setIsAnimating(false)
      }, 300)
    }, 150)
  }

  if (!modalOpen) return null


  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden transform transition-all duration-300 ${isAnimating ? 'scale-95 opacity-50' : 'scale-100 opacity-100'}`}>
        
        {/* Header */}
        <div className="relative p-6 bg-gradient-to-r from-gray-50 to-blue-50 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-3">
              <div className={`w-12 h-12 rounded-2xl bg-gradient-to-r ${step.gradient} flex items-center justify-center shadow-lg`}>
                <step.icon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">{step.title}</h2>
                <p className="text-sm text-gray-600">{step.subtitle}</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <span className="text-sm text-gray-500 font-medium">
                {currentStep + 1} of {walkthroughSteps.length}
              </span>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={handleClose}
                className="hover:bg-red-50 hover:text-red-600 rounded-xl"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div 
              className={`h-full bg-gradient-to-r ${step.gradient} transition-all duration-500 ease-out rounded-full`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="p-8 max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Left Column - Content */}
            <div className="space-y-6">
              <div>
                <p className="text-gray-700 text-lg leading-relaxed mb-6">
                  {step.description}
                </p>
                
                {/* Features List */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide mb-3">
                    Key Features
                  </h4>
                  {step.features.map((feature, index) => (
                    <div 
                      key={index} 
                      className="flex items-center space-x-3 p-3 rounded-xl bg-gradient-to-r from-gray-50 to-blue-50/30 hover:from-blue-50 hover:to-purple-50/50 transition-all duration-200"
                    >
                      <div className={`w-8 h-8 rounded-lg bg-gradient-to-r ${step.gradient} flex items-center justify-center flex-shrink-0`}>
                        {feature.startsWith('✓') ? (
                          <Check className="w-4 h-4 text-white" />
                        ) : (
                          <div className="w-2 h-2 bg-white rounded-full" />
                        )}
                      </div>
                      <span className="text-gray-700 font-medium">
                        {feature.replace('✓ ', '')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column - Visual */}
            <div className="flex flex-col items-center justify-center">
              {/* Large Feature Icon */}
              <div className={`w-32 h-32 rounded-3xl bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-2xl mb-6 transform hover:scale-105 transition-all duration-300`}>
                <step.icon className="w-16 h-16 text-white" />
              </div>

              {/* Action Button */}
              {step.action && (
                <div className="text-center mb-6">
                  <Button
                    className={`px-8 py-3 rounded-xl font-semibold text-lg shadow-lg transform hover:scale-105 transition-all duration-300 ${
                      step.action.highlight 
                        ? `bg-gradient-to-r ${step.gradient} text-white border-0 hover:shadow-xl` 
                        : 'bg-white text-gray-700 border-2 border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => {/* Add action handler */}}
                  >
                    <PlayCircle className="w-5 h-5 mr-2" />
                    {step.action.text}
                  </Button>
                </div>
              )}

              {/* Pro Tip */}
              {step.tip && (
                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-2xl p-4 w-full">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-white" />
                    </div>
                    <div>
                      <h5 className="font-semibold text-gray-900 text-sm mb-1">💡 Pro Tip</h5>
                      <p className="text-gray-700 text-sm leading-relaxed">{step.tip}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <Button
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 0}
            className="flex items-center space-x-2 px-6 py-2 rounded-xl disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </Button>

          {/* Step Indicators */}
          <div className="flex space-x-2">
            {walkthroughSteps.map((_, index) => (
              <button
                key={index}
                onClick={() => goToStep(index)}
                className={`w-3 h-3 rounded-full transition-all duration-200 ${
                  index === currentStep 
                    ? `bg-gradient-to-r ${step.gradient}` 
                    : completedSteps.includes(index)
                    ? 'bg-green-500'
                    : 'bg-gray-300 hover:bg-gray-400'
                }`}
              />
            ))}
          </div>

          {currentStep < walkthroughSteps.length - 1 ? (
            <Button
              onClick={nextStep}
              className={`flex items-center space-x-2 px-6 py-2 rounded-xl bg-gradient-to-r ${step.gradient} text-white border-0 hover:shadow-lg transform hover:scale-105 transition-all duration-200`}
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              onClick={handleClose}
              className="flex items-center space-x-2 px-8 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0 hover:shadow-lg transform hover:scale-105 transition-all duration-200"
            >
              <Check className="w-4 h-4" />
              <span>Get Started</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default WalkthroughModal