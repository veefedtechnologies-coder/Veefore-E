import { useState, useEffect, useRef } from 'react'
import { X, Target, ArrowRight, ArrowLeft } from 'lucide-react'

interface TourStep {
  title: string
  description: string
  target: string
  position: 'top' | 'bottom' | 'left' | 'right'
}

interface GuidedTourProps {
  isActive: boolean
  onClose: () => void
}

const tourSteps: TourStep[] = [
  {
    title: "Welcome to VeeFore!",
    description: "Let's take a quick tour of your AI-powered social media management platform and discover how AI can transform your content strategy.",
    target: "h1",
    position: "bottom"
  },
  // DASHBOARD COMPONENTS FIRST
  {
    title: "🎨 Smart Content Creation Cards",
    description: "These AI-powered creation options help you generate content instantly. Choose from creating from scratch, posting across networks, trending topics, or starting with AI assistance.",
    target: ".dashboard-cards",
    position: "top"
  },
  {
    title: "📈 Performance Overview",
    description: "Monitor your social media performance with real-time analytics. Track engagement, reach, followers, and content performance across all connected platforms.",
    target: ".performance-overview",
    position: "top"
  },
  {
    title: "🔌 Connected Platforms",
    description: "View and manage all your connected social media accounts in one place. See connection status, account details, and manage platform integrations.",
    target: ".connected-platforms",
    position: "top"
  },
  {
    title: "🔍 View Details & Analytics",
    description: "Click 'View Details' to dive deeper into your performance analytics, get AI-powered insights, and track your growth metrics.",
    target: ".view-details",
    position: "left"
  },
  {
    title: "🎧 Social Listening Dashboard",
    description: "Monitor mentions, hashtags, and conversations about your brand across social platforms. Get AI-powered sentiment analysis and trend insights.",
    target: ".social-listening",
    position: "top"
  },
  {
    title: "🤖 AI Recommendations Engine",
    description: "Get personalized content suggestions, optimal posting times, and engagement strategies powered by AI analysis of your audience and performance data.",
    target: ".ai-recommendations",
    position: "top"
  },
  // SIDEBAR COMPONENTS SECOND
  {
    title: "🤖 VeeGPT - Your AI Assistant", 
    description: "Meet VeeGPT, your intelligent AI assistant that helps you create content, generate ideas, and manage your social media strategy with advanced AI capabilities.",
    target: "[data-nav='veegpt']",
    position: "right"
  },
  {
    title: "🎬 AI Video Generator",
    description: "Create professional videos with AI! Generate scripts, voiceovers, visuals, and complete videos from just a text prompt. Our most powerful feature.",
    target: "[data-nav='video-generator']", 
    position: "right"
  },
  {
    title: "⚡ Automation Hub",
    description: "Automate your social media interactions! Set up AI-powered DM responses, comment replies, and engagement automation to save time and boost efficiency.",
    target: "[data-nav='automation']",
    position: "right"
  },
  {
    title: "📊 AI Analytics Dashboard", 
    description: "Get AI-powered insights about your content performance, audience engagement, and growth opportunities across all your social platforms.",
    target: "[data-nav='analytics']",
    position: "right"
  },
  {
    title: "👥 Team Workspaces",
    description: "Collaborate with your team using AI-powered workspaces. Each workspace can have its own AI personality and content strategy.",
    target: "[data-nav='workspaces']", 
    position: "right"
  },
  {
    title: "🔗 Social Platform Integration",
    description: "Connect all your social media accounts and manage them from one AI-powered dashboard with seamless integrations.",
    target: "[data-nav='integration']",
    position: "right"
  },
  {
    title: "✨ AI Content Creation",
    description: "Use our AI content creation tools to generate posts, stories, captions, and more with just a few clicks.",
    target: "[data-nav='create']",
    position: "right"
  }
]

export function GuidedTour({ isActive, onClose }: GuidedTourProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 })
  const tooltipRef = useRef<HTMLDivElement>(null)

  const currentStepData = tourSteps[currentStep]

  // Find and highlight the target element for current step
  useEffect(() => {
    if (!isActive) return

    const findElement = () => {
      setTimeout(() => {
        let element: HTMLElement | null = null

        // Use data-nav attributes and dashboard selectors for precise targeting
        // NEW ORDER: Dashboard components first (1-6), then sidebar components (7-13)
        switch (currentStep) {
          case 0: // Welcome - target main heading
            element = document.querySelector('h1') || document.querySelector('.text-3xl') || document.querySelector('.text-2xl')
            break
          // DASHBOARD COMPONENTS (1-6)
          case 1: // Smart Content Creation Cards (Quick Actions)
            element = document.querySelector('[data-testid="quick-actions"]') as HTMLElement ||
                     document.querySelector('.grid.grid-cols-2.md\\:grid-cols-4') as HTMLElement ||
                     document.querySelector('.grid-cols-2') as HTMLElement ||
                     document.querySelector('.grid-cols-4') as HTMLElement
            break
          case 2: // Performance Overview
            element = document.querySelector('[data-testid="performance-score"]') as HTMLElement ||
                     (Array.from(document.querySelectorAll('h2, h3')).find(el => 
                       el.textContent?.toLowerCase().includes('performance overview')) as HTMLElement) ||
                     (Array.from(document.querySelectorAll('.text-xl')).find(el => 
                       el.textContent?.toLowerCase().includes('performance overview')) as HTMLElement)
            break
          case 3: // Connected Platforms
            element = (Array.from(document.querySelectorAll('h3')).find(el => 
                       el.textContent?.toLowerCase().includes('connected platforms')) as HTMLElement) ||
                     document.querySelector('[data-testid="connected-platforms"]') as HTMLElement ||
                     (Array.from(document.querySelectorAll('.text-lg')).find(el => 
                       el.textContent?.toLowerCase().includes('connected platforms')) as HTMLElement)
            break
          case 4: // View Details & Analytics Button
            element = (Array.from(document.querySelectorAll('button')).find(el => 
                       el.textContent?.toLowerCase().includes('view details')) as HTMLElement) ||
                     document.querySelector('[data-testid="view-details"]') as HTMLElement ||
                     document.querySelector('.btn-secondary') as HTMLElement
            break
          case 5: // Social Listening Dashboard
            element = (Array.from(document.querySelectorAll('h3, h2')).find(el => 
                       el.textContent?.toLowerCase().includes('social listening')) as HTMLElement) ||
                     document.querySelector('[data-testid="social-listening"]') as HTMLElement ||
                     (Array.from(document.querySelectorAll('.text-xl')).find(el => 
                       el.textContent?.toLowerCase().includes('listening')) as HTMLElement)
            break
          case 6: // AI Recommendations Engine
            element = document.querySelector('[data-testid="recommendations"]') as HTMLElement ||
                     (Array.from(document.querySelectorAll('h3, h2')).find(el => 
                       el.textContent?.toLowerCase().includes('recommendations')) as HTMLElement) ||
                     (Array.from(document.querySelectorAll('.text-xl')).find(el => 
                       el.textContent?.toLowerCase().includes('recommendations')) as HTMLElement)
            break
          // SIDEBAR COMPONENTS (7-13)
          case 7: // VeeGPT
            element = document.querySelector('[data-nav="veegpt"]')
            break
          case 8: // Video Generator
            element = document.querySelector('[data-nav="video-generator"]')
            break
          case 9: // Automation
            element = document.querySelector('[data-nav="automation"]')
            break
          case 10: // Analytics
            element = document.querySelector('[data-nav="analytics"]')
            break
          case 11: // Workspaces
            element = document.querySelector('[data-nav="workspaces"]')
            break
          case 12: // Integration
            element = document.querySelector('[data-nav="integration"]')
            break
          case 13: // Create
            element = document.querySelector('[data-nav="create"]')
            break
        }

        console.log(`🎯 Step ${currentStep + 1}: Looking for "${currentStepData.title}"`)
        console.log('📍 Found element:', element?.tagName, element?.textContent?.trim())
        
        if (!element) {
          console.log('❌ Element not found! Available elements:')
          document.querySelectorAll('[data-nav]').forEach(el => {
            console.log(`- [data-nav="${el.getAttribute('data-nav')}"]`)
          })
        }

        if (element) {
          setTargetElement(element)
          
          // Scroll element into view so users can see it
          element.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center'
          })
          
          // Position tooltip after scroll
          setTimeout(() => {
            positionTooltip(element)
          }, 300) // Wait for scroll animation to complete
        }
      }, 150)
    }

    findElement()
  }, [currentStep, isActive])

  // Position tooltip relative to target element
  const positionTooltip = (element: HTMLElement) => {
    if (!tooltipRef.current) return

    setTimeout(() => {
      const rect = element.getBoundingClientRect()
      const tooltip = tooltipRef.current?.getBoundingClientRect()
      const viewport = { width: window.innerWidth, height: window.innerHeight }
      
      let top = 0
      let left = 0
      const padding = viewport.width < 768 ? 16 : 20

      // Special positioning for dashboard components (steps 1-6) to avoid covering them
      const isDashboardStep = currentStep >= 1 && currentStep <= 6
      
      if (isDashboardStep) {
        // For dashboard components, ALWAYS position modal to the RIGHT to avoid covering content
        top = rect.top + (rect.height / 2) - (tooltip?.height || 0) / 2
        left = rect.right + 20
        
        // If modal goes off-screen to the right, position to the left instead
        if (left + (tooltip?.width || 0) > viewport.width - padding) {
          left = rect.left - (tooltip?.width || 0) - 20
        }
        
        // If still off-screen, position above/below
        if (left < padding) {
          if (rect.top > (tooltip?.height || 0) + 40) {
            // Position above if there's space
            top = rect.top - (tooltip?.height || 0) - 20
            left = rect.left + (rect.width / 2) - (tooltip?.width || 0) / 2
          } else {
            // Position below
            top = rect.bottom + 20
            left = rect.left + (rect.width / 2) - (tooltip?.width || 0) / 2
          }
        }
      } else {
        // Original positioning for sidebar components (steps 7-14)
        switch (currentStepData.position) {
          case 'right':
            top = rect.top + (rect.height / 2) - (tooltip?.height || 0) / 2
            left = rect.right + 20
            break
          case 'bottom':
            top = rect.bottom + 20
            left = rect.left + (rect.width / 2) - (tooltip?.width || 0) / 2
            break
          case 'left':
            top = rect.top + (rect.height / 2) - (tooltip?.height || 0) / 2
            left = rect.left - (tooltip?.width || 0) - 20
            break
          case 'top':
            top = rect.top - (tooltip?.height || 0) - 20
            left = rect.left + (rect.width / 2) - (tooltip?.width || 0) / 2
            break
        }
      }

      // Keep tooltip in viewport
      if (left < padding) left = padding
      if (left + (tooltip?.width || 0) > viewport.width - padding) {
        left = viewport.width - (tooltip?.width || 0) - padding
      }
      if (top < padding) top = padding
      if (top + (tooltip?.height || 0) > viewport.height - padding) {
        top = viewport.height - (tooltip?.height || 0) - padding
      }

      setTooltipPosition({ top, left })
    }, 50)
  }

  // Navigation functions
  const nextStep = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      onClose()
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const skipTour = () => {
    onClose()
  }

  // Block body scroll and interactions
  useEffect(() => {
    if (isActive) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = 'unset'
      }
    }
  }, [isActive])

  // Handle window resize
  useEffect(() => {
    if (!isActive || !targetElement) return

    const handleResize = () => {
      positionTooltip(targetElement)
    }

    window.addEventListener('resize', handleResize)
    window.addEventListener('orientationchange', handleResize)
    
    return () => {
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('orientationchange', handleResize)
    }
  }, [isActive, targetElement])

  if (!isActive) return null

  return (
    <>
      {/* Background overlay - light transparent overlay to block interactions only */}
      <div 
        className="fixed inset-0 z-50"
        style={{
          background: 'rgba(0, 0, 0, 0.1)',
          overscrollBehavior: 'contain'
        }}
        onWheel={(e) => e.preventDefault()}
        onTouchMove={(e) => e.preventDefault()}
        onScroll={(e) => e.preventDefault()}
        onMouseDown={(e) => e.preventDefault()}
      />

      {/* Highlight border around target element */}
      {targetElement && (() => {
        const rect = targetElement.getBoundingClientRect()
        const padding = window.innerWidth < 768 ? 4 : 6
        const shadowSize = window.innerWidth < 768 ? 20 : 30
        
        return (
          <div
            className="fixed z-50 pointer-events-none border-2 md:border-3 border-blue-400 rounded-lg shadow-lg"
            style={{
              top: rect.top - padding,
              left: rect.left - padding,
              width: rect.width + (padding * 2),
              height: rect.height + (padding * 2),
              boxShadow: `0 0 0 3px rgba(59, 130, 246, 0.2), 0 0 ${shadowSize}px rgba(59, 130, 246, 0.4)`,
              animation: 'pulse 2s infinite'
            }}
          />
        )
      })()}

      {/* Tooltip */}
      <div
        ref={tooltipRef}
        className="fixed z-50 bg-white rounded-2xl shadow-2xl p-4 md:p-6 max-w-xs md:max-w-sm border border-gray-200 pointer-events-auto"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          maxWidth: window.innerWidth < 768 ? '280px' : '384px',
        }}
      >
        {/* Progress indicator */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
              <Target className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-medium text-gray-500">
              Step {currentStep + 1} of {tourSteps.length}
            </span>
          </div>
          <button 
            onClick={skipTour}
            className="p-1 hover:bg-gray-100 rounded-full"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div 
            className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${((currentStep + 1) / tourSteps.length) * 100}%` }}
          />
        </div>

        {/* Content */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            {currentStepData.title}
          </h3>
          <p className="text-gray-600 text-sm leading-relaxed">
            {currentStepData.description}
          </p>
        </div>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between">
          <button
            onClick={prevStep}
            disabled={currentStep === 0}
            className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              currentStep === 0
                ? 'text-gray-400 cursor-not-allowed'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          <button
            onClick={nextStep}
            className="flex items-center space-x-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:from-blue-600 hover:to-purple-700 transition-all"
          >
            <span>{currentStep === tourSteps.length - 1 ? 'Finish' : 'Next'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  )
}