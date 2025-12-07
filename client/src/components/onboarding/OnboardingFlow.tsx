import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogOverlay } from '@/components/ui/dialog'
import { ChevronRight, ChevronLeft, CheckCircle, User, Target, Settings, Rocket, Loader2 } from 'lucide-react'

interface OnboardingFlowProps {
  open: boolean
  onComplete: (data: any) => void
  userData?: any
}

export default function OnboardingFlow({ open, onComplete, userData }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [isLoadingPrefill, setIsLoadingPrefill] = useState(false)
  const [isCompleting, setIsCompleting] = useState(false)
  const [prefillDataApplied, setPrefillDataApplied] = useState(false)
  const [formData, setFormData] = useState({
    // Step 1: Personal Info
    fullName: '',
    role: '',
    companyName: '',
    companySize: '',
    
    // Step 2: Goals & Objectives
    primaryGoals: [] as string[],
    currentChallenges: '',
    monthlyBudget: '',
    
    // Step 3: Social Media Preferences
    platforms: [] as string[],
    contentTypes: [] as string[],
    postingFrequency: '',
    
    // Step 4: Subscription Plan
    selectedPlan: 'free'
  })

  // Fetch prefill data when modal opens
  useEffect(() => {
    if (open && !prefillDataApplied) {
      // If user is already onboarded, use their existing preferences
      if (userData && userData.isOnboarded && userData.preferences) {
        console.log('[ONBOARDING] Using existing user preferences for prefill:', userData.preferences)
        const prefs = userData.preferences
        setFormData({
          fullName: prefs.fullName || '',
          role: prefs.role || '',
          companyName: prefs.companyName || '',
          companySize: prefs.companySize || '',
          primaryGoals: Array.isArray(prefs.primaryGoals) ? prefs.primaryGoals : [],
          currentChallenges: prefs.currentChallenges || '',
          monthlyBudget: prefs.monthlyBudget || '',
          platforms: Array.isArray(prefs.platforms) ? prefs.platforms : [],
          contentTypes: Array.isArray(prefs.contentTypes) ? prefs.contentTypes : [],
          postingFrequency: prefs.postingFrequency || '',
          selectedPlan: prefs.selectedPlan || 'free'
        })
        setPrefillDataApplied(true)
        console.log('[ONBOARDING] Form data updated with existing preferences')
      } else {
        // For new users, fetch waitlist prefill data
        fetchPrefillData()
      }
    }
  }, [open, prefillDataApplied, userData])

  const fetchPrefillData = async () => {
    try {
      setIsLoadingPrefill(true)
      
      // Get Firebase auth token from the current user
      const { getAuth } = await import('firebase/auth')
      const auth = getAuth()
      const user = auth.currentUser
      
      if (!user) {
        console.log('[ONBOARDING] No authenticated user found')
        return
      }

      const authToken = await user.getIdToken()
      
      const { apiRequest } = await import('@/lib/queryClient')
      const response = await apiRequest('/api/onboarding/prefill', {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      })
      const result = response
      console.log('[ONBOARDING] API response received:', result)
      
      if (result.success && result.prefillData) {
        const prefill = result.prefillData
        console.log('[ONBOARDING] Pre-fill data from waitlist:', prefill)
        
        // Apply prefill data to form
        setFormData(prev => ({
          ...prev,
          fullName: prefill.fullName || prev.fullName,
          role: prefill.role || prev.role,
          companySize: prefill.companySize || prev.companySize,
          primaryGoals: prefill.primaryGoals?.length > 0 ? prefill.primaryGoals : prev.primaryGoals,
          contentTypes: prefill.contentTypes?.length > 0 ? prefill.contentTypes : prev.contentTypes,
          platforms: prefill.platforms?.length > 0 ? prefill.platforms : prev.platforms
        }))
        
        setPrefillDataApplied(true)
        console.log('[ONBOARDING] Form data updated with pre-fill values')
      } else {
        console.log('[ONBOARDING] No waitlist data to pre-fill')
      }
    } catch (error) {
      console.error('[ONBOARDING] Failed to fetch prefill data:', error)
    } finally {
      setIsLoadingPrefill(false)
    }
  }

  const totalSteps = 4

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleArrayToggle = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: prev[field as keyof typeof prev].includes(value)
        ? (prev[field as keyof typeof prev] as string[]).filter(item => item !== value)
        : [...(prev[field as keyof typeof prev] as string[]), value]
    }))
  }

  const nextStep = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleComplete = async () => {
    if (isCompleting) return // Prevent multiple clicks
    setIsCompleting(true)
    try {
      await onComplete(formData)
      // Success - the parent component will close the modal
    } catch (error) {
      console.error('Failed to complete onboarding:', error)
      // Show user-friendly error message could be added here via toast
    } finally {
      // Always reset isCompleting state regardless of success/failure
      setIsCompleting(false)
    }
  }

  const handlePlatformConnect = (platform: string) => {
    // Placeholder for platform connection logic
    // This would typically redirect to OAuth flow or open connection modal
    console.log(`Connecting to ${platform}...`)
    // For now, just show an alert
    alert(`Opening ${platform} connection flow...`)
  }

  const getPlatformIcon = (platform: string) => {
    const iconComponents: { [key: string]: JSX.Element } = {
      'Instagram': (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      ),
      'Facebook': (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      ),
      'Twitter/X': (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      ),
      'LinkedIn': (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      ),
      'TikTok': (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
        </svg>
      ),
      'YouTube': (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      ),
      'Pinterest': (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.174-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.098.119.112.222.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.402.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.357-.629-2.746-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24.009 12.017 24.009c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001.012.001z"/>
        </svg>
      ),
      'Snapchat': (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.174-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.098.119.112.222.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.402.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.357-.629-2.746-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24.009 12.017 24.009c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001.012.001z"/>
        </svg>
      )
    }
    return iconComponents[platform] || (
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
        <path d="M10.59 13.41c.41.39.41 1.03 0 1.42-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0 5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24 2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24zm2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0 5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24 2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24.996.996 0 0 1 0-1.42z"/>
      </svg>
    )
  }

  const getPlatformColors = (platform: string) => {
    const colorMap: { [key: string]: { bg: string, hover: string, text: string } } = {
      'Instagram': { bg: 'bg-gradient-to-r from-purple-500 to-pink-500', hover: 'hover:from-purple-600 hover:to-pink-600', text: 'text-white' },
      'Facebook': { bg: 'bg-blue-600', hover: 'hover:bg-blue-700', text: 'text-white' },
      'Twitter/X': { bg: 'bg-black', hover: 'hover:bg-gray-800', text: 'text-white' },
      'LinkedIn': { bg: 'bg-blue-700', hover: 'hover:bg-blue-800', text: 'text-white' },
      'TikTok': { bg: 'bg-black', hover: 'hover:bg-gray-800', text: 'text-white' },
      'YouTube': { bg: 'bg-red-600', hover: 'hover:bg-red-700', text: 'text-white' },
      'Pinterest': { bg: 'bg-red-500', hover: 'hover:bg-red-600', text: 'text-white' },
      'Snapchat': { bg: 'bg-yellow-400', hover: 'hover:bg-yellow-500', text: 'text-black' }
    }
    return colorMap[platform] || { bg: 'bg-emerald-500', hover: 'hover:bg-emerald-600', text: 'text-white' }
  }

  const getStepIcon = (step: number) => {
    const icons = [User, Target, Settings, Rocket]
    const Icon = icons[step - 1]
    return <Icon className="w-5 h-5" />
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <User className="w-6 h-6 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Tell us about yourself</h2>
              <p className="text-sm text-gray-600 max-w-md mx-auto">
                Help us personalize your VeeFore experience with some basic information about you and your business.
              </p>
              {isLoadingPrefill && (
                <div className="flex items-center justify-center mt-3 text-sm text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Loading your waitlist preferences...
                </div>
              )}
              {prefillDataApplied && !isLoadingPrefill && (
                <div className="flex items-center justify-center mt-3 text-sm text-green-600 bg-green-50 rounded-lg px-3 py-2 mx-auto w-fit">
                  <CheckCircle className="w-4 h-4 mr-2" />
                  We've pre-filled some information from your waitlist signup
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="fullName" className="text-xs font-semibold text-gray-700">Full Name *</Label>
                <Input
                  id="fullName"
                  value={formData.fullName}
                  onChange={(e) => handleInputChange('fullName', e.target.value)}
                  placeholder="Enter your full name"
                  required
                  className="h-8 px-3 text-sm rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-0 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="role" className="text-xs font-semibold text-gray-700">Your Role *</Label>
                <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value)}>
                  <SelectTrigger className="h-8 px-3 text-sm rounded-lg border border-gray-200 focus:border-emerald-500">
                    <SelectValue placeholder="Select your role" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border shadow-xl">
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

              <div className="space-y-1">
                <Label htmlFor="companyName" className="text-xs font-semibold text-gray-700">Company/Brand Name</Label>
                <Input
                  id="companyName"
                  value={formData.companyName}
                  onChange={(e) => handleInputChange('companyName', e.target.value)}
                  placeholder="Enter your company or brand name"
                  className="h-8 px-3 text-sm rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-0 transition-colors"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="companySize" className="text-xs font-semibold text-gray-700">Company Size</Label>
                <Select value={formData.companySize} onValueChange={(value) => handleInputChange('companySize', value)}>
                  <SelectTrigger className="h-8 px-3 text-sm rounded-lg border border-gray-200 focus:border-emerald-500">
                    <SelectValue placeholder="Select company size" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border shadow-xl">
                    <SelectItem value="solo">Just me</SelectItem>
                    <SelectItem value="2-10">2-10 employees</SelectItem>
                    <SelectItem value="11-50">11-50 employees</SelectItem>
                    <SelectItem value="51-200">51-200 employees</SelectItem>
                    <SelectItem value="200+">200+ employees</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-4 overflow-y-auto max-h-80">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <Target className="w-6 h-6 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">What are your goals?</h2>
              <p className="text-sm text-gray-600 max-w-md mx-auto">
                Help us understand what you want to achieve with VeeFore.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-700">Primary Goals</Label>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      'Increase followers',
                      'Drive website traffic', 
                      'Generate leads',
                      'Boost engagement',
                      'Build brand awareness',
                      'Increase sales',
                      'Save time on content',
                      'Improve content quality'
                    ].map((goal) => (
                      <label key={goal} className="flex items-center space-x-2 p-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                        <Checkbox
                          checked={formData.primaryGoals.includes(goal)}
                          onCheckedChange={() => handleArrayToggle('primaryGoals', goal)}
                          className="rounded-sm"
                        />
                        <span className="text-xs text-gray-900 flex-1">{goal}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="currentChallenges" className="text-xs font-semibold text-gray-700">Biggest social media challenge?</Label>
                <Textarea
                  id="currentChallenges"
                  value={formData.currentChallenges}
                  onChange={(e) => handleInputChange('currentChallenges', e.target.value)}
                  placeholder="Tell us your main challenges..."
                  rows={3}
                  className="px-3 py-2 text-sm rounded-lg border border-gray-200 focus:border-emerald-500 focus:ring-0 transition-colors resize-none"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="monthlyBudget" className="text-xs font-semibold text-gray-700">Monthly Marketing Budget</Label>
                <Select value={formData.monthlyBudget} onValueChange={(value) => handleInputChange('monthlyBudget', value)}>
                  <SelectTrigger className="h-8 px-3 text-sm rounded-lg border border-gray-200 focus:border-emerald-500">
                    <SelectValue placeholder="Select budget range" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border shadow-xl">
                    <SelectItem value="0-500">$0 - $500</SelectItem>
                    <SelectItem value="500-1000">$500 - $1,000</SelectItem>
                    <SelectItem value="1000-5000">$1,000 - $5,000</SelectItem>
                    <SelectItem value="5000-10000">$5,000 - $10,000</SelectItem>
                    <SelectItem value="10000+">$10,000+</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )

      case 3:
        return (
          <div className="space-y-4 overflow-y-auto max-h-80">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Settings className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Configure your content strategy</h3>
              <p className="text-sm text-gray-600 mt-1">Tell us about your social media preferences</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-700">Which platforms do you use?</Label>
                <Select>
                  <SelectTrigger className="h-8 px-3 text-sm rounded-lg border border-gray-200 focus:border-emerald-500">
                    <SelectValue placeholder={formData.platforms.length > 0 ? `${formData.platforms.length} platforms selected` : "Select platforms"} />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border shadow-xl max-h-60 overflow-y-auto">
                    {[
                      'Instagram',
                      'Facebook',
                      'Twitter/X',
                      'LinkedIn',
                      'TikTok',
                      'YouTube',
                      'Pinterest',
                      'Snapchat'
                    ].map((platform) => (
                      <div key={platform} className="flex items-center space-x-2 px-3 py-2 hover:bg-gray-100 cursor-pointer" 
                           onClick={() => handleArrayToggle('platforms', platform)}>
                        <Checkbox
                          checked={formData.platforms.includes(platform)}
                          className="rounded-sm"
                        />
                        <span className="text-sm text-gray-900">{platform}</span>
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold text-gray-700">Content Types</Label>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      'Photos',
                      'Videos',
                      'Stories',
                      'Reels/Shorts',
                      'Carousels',
                      'Text posts',
                      'Live streams',
                      'User-generated content'
                    ].map((type) => (
                      <label key={type} className="flex items-center space-x-2 p-2 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
                        <Checkbox
                          checked={formData.contentTypes.includes(type)}
                          onCheckedChange={() => handleArrayToggle('contentTypes', type)}
                          className="rounded-sm"
                        />
                        <span className="text-xs text-gray-900 flex-1">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="postingFrequency" className="text-xs font-semibold text-gray-700">How often do you post?</Label>
                <Select value={formData.postingFrequency} onValueChange={(value) => handleInputChange('postingFrequency', value)}>
                  <SelectTrigger className="h-8 px-3 text-sm rounded-lg border border-gray-200 focus:border-emerald-500">
                    <SelectValue placeholder="Select posting frequency" />
                  </SelectTrigger>
                  <SelectContent className="rounded-lg border shadow-xl">
                    <SelectItem value="multiple-daily">Multiple times per day</SelectItem>
                    <SelectItem value="daily">Once per day</SelectItem>
                    <SelectItem value="few-weekly">Few times per week</SelectItem>
                    <SelectItem value="weekly">Once per week</SelectItem>
                    <SelectItem value="monthly">Once per month</SelectItem>
                    <SelectItem value="irregular">Irregular/as needed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Connect Platform Section */}
              {formData.platforms.length > 0 && (
                <div className="space-y-2 mt-4 pt-3 border-t border-gray-200">
                  <Label className="text-xs font-semibold text-gray-700">Connect Your Platforms</Label>
                  <p className="text-xs text-gray-500">Connect your selected platforms to start managing them</p>
                  <div className="grid grid-cols-1 gap-2">
                    {formData.platforms.map((platform) => {
                      const colors = getPlatformColors(platform)
                      return (
                        <button
                          key={platform}
                          onClick={() => handlePlatformConnect(platform)}
                          className={`flex items-center justify-center space-x-3 px-4 py-3 text-sm font-semibold rounded-lg transition-all transform hover:scale-105 ${colors.bg} ${colors.hover} ${colors.text} shadow-lg`}
                        >
                          <span className="flex items-center justify-center">
                            {getPlatformIcon(platform)}
                          </span>
                          <span>Connect {platform}</span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-gray-400 italic">You can skip this step and connect platforms later from your dashboard</p>
                </div>
              )}
            </div>
          </div>
        )

      case 4:
        return (
          <div className="space-y-4 overflow-y-auto max-h-80">
            <div className="text-center mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-yellow-100 to-orange-100 rounded-xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-semibold text-gray-900">Choose Your Plan</h3>
              <p className="text-sm text-gray-600 mt-1">Select the perfect plan for your social media needs</p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {/* Free Plan */}
              <div 
                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  formData.selectedPlan === 'free' 
                    ? 'border-emerald-500 bg-emerald-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => handleInputChange('selectedPlan', 'free')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        formData.selectedPlan === 'free' 
                          ? 'border-emerald-500 bg-emerald-500' 
                          : 'border-gray-300'
                      } flex items-center justify-center`}>
                        {formData.selectedPlan === 'free' && (
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">Free Plan</h4>
                        <p className="text-xs text-gray-600">Perfect for getting started</p>
                      </div>
                    </div>
                    <div className="mt-2 ml-7">
                      <p className="text-lg font-bold text-gray-900">$0<span className="text-xs font-normal">/month</span></p>
                      <ul className="text-xs text-gray-600 mt-1 space-y-1">
                        <li>• 1 social account</li>
                        <li>• 10 posts per month</li>
                        <li>• Basic analytics</li>
                      </ul>
                    </div>
                  </div>
                </div>
                {formData.selectedPlan === 'free' && (
                  <div className="absolute top-2 right-2">
                    <div className="bg-emerald-500 text-white text-xs px-2 py-1 rounded-full">Selected</div>
                  </div>
                )}
              </div>

              {/* Basic Plan */}
              <div 
                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  formData.selectedPlan === 'basic' 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => handleInputChange('selectedPlan', 'basic')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        formData.selectedPlan === 'basic' 
                          ? 'border-blue-500 bg-blue-500' 
                          : 'border-gray-300'
                      } flex items-center justify-center`}>
                        {formData.selectedPlan === 'basic' && (
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">Basic Plan</h4>
                        <p className="text-xs text-gray-600">For small businesses</p>
                      </div>
                    </div>
                    <div className="mt-2 ml-7">
                      <p className="text-lg font-bold text-gray-900">$19<span className="text-xs font-normal">/month</span></p>
                      <ul className="text-xs text-gray-600 mt-1 space-y-1">
                        <li>• 3 social accounts</li>
                        <li>• 100 posts per month</li>
                        <li>• Advanced analytics</li>
                        <li>• Content scheduling</li>
                      </ul>
                    </div>
                  </div>
                </div>
                {formData.selectedPlan === 'basic' && (
                  <div className="absolute top-2 right-2">
                    <div className="bg-blue-500 text-white text-xs px-2 py-1 rounded-full">Selected</div>
                  </div>
                )}
              </div>

              {/* Pro Plan */}
              <div 
                className={`relative p-4 rounded-xl border-2 cursor-pointer transition-all ${
                  formData.selectedPlan === 'pro' 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => handleInputChange('selectedPlan', 'pro')}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        formData.selectedPlan === 'pro' 
                          ? 'border-purple-500 bg-purple-500' 
                          : 'border-gray-300'
                      } flex items-center justify-center`}>
                        {formData.selectedPlan === 'pro' && (
                          <div className="w-2 h-2 bg-white rounded-full"></div>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">Pro Plan</h4>
                        <p className="text-xs text-gray-600">Most popular choice</p>
                      </div>
                    </div>
                    <div className="mt-2 ml-7">
                      <p className="text-lg font-bold text-gray-900">$49<span className="text-xs font-normal">/month</span></p>
                      <ul className="text-xs text-gray-600 mt-1 space-y-1">
                        <li>• 10 social accounts</li>
                        <li>• Unlimited posts</li>
                        <li>• AI content generation</li>
                        <li>• Team collaboration</li>
                        <li>• Priority support</li>
                      </ul>
                    </div>
                  </div>
                </div>
                {formData.selectedPlan === 'pro' && (
                  <div className="absolute top-2 right-2">
                    <div className="bg-purple-500 text-white text-xs px-2 py-1 rounded-full">Selected</div>
                  </div>
                )}
                <div className="absolute -top-2 left-1/2 transform -translate-x-1/2">
                  <div className="bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs px-3 py-1 rounded-full">
                    Most Popular
                  </div>
                </div>
              </div>
            </div>

            <div className="text-center mt-4">
              <p className="text-xs text-gray-500">
                You can upgrade or downgrade your plan anytime from your dashboard
              </p>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.fullName && formData.role
      case 2:
        return formData.primaryGoals.length > 0
      case 3:
        return formData.platforms.length > 0
      case 4:
        return formData.selectedPlan
      default:
        return true
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="relative w-full max-w-4xl h-[85vh] bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          {/* Header Section - Ultra Compact */}
          <div className="relative bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 px-4 py-3 flex-shrink-0">
            <div className="absolute inset-0 bg-gradient-to-r from-emerald-600/90 to-teal-600/90"></div>
            <div className="relative">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-lg font-bold text-white">Welcome to VeeFore</h1>
                    <p className="text-emerald-50/90 text-xs">Let's set up your account in {totalSteps} simple steps</p>
                  </div>
                </div>
                <button 
                  className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 transition-colors flex items-center justify-center backdrop-blur-sm"
                  onClick={() => {}}
                >
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Progress Bar - Ultra Compact */}
          <div className="px-4 py-2 bg-gray-50/50 border-b flex-shrink-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-600">Step {currentStep} of {totalSteps}</span>
              <span className="text-xs text-gray-500">{Math.round((currentStep / totalSteps) * 100)}% complete</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-1.5">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-teal-500 h-1.5 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              ></div>
            </div>
          </div>

          {/* Steps Indicator - Ultra Compact */}
          <div className="px-4 py-3 border-b bg-white flex-shrink-0">
            <div className="flex items-center justify-center space-x-3">
              {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
                <div key={step} className="flex items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center border transition-all duration-300 ${
                        step === currentStep
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-md scale-105'
                          : step < currentStep
                          ? 'bg-emerald-100 border-emerald-200 text-emerald-600'
                          : 'bg-gray-100 border-gray-200 text-gray-400'
                      }`}
                    >
                      {step < currentStep ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        getStepIcon(step)
                      )}
                    </div>
                    <span className={`text-xs mt-1 font-medium transition-colors ${
                      step === currentStep ? 'text-emerald-600' : step < currentStep ? 'text-emerald-500' : 'text-gray-400'
                    }`}>
                      {step === 1 ? 'Profile' : step === 2 ? 'Goals' : step === 3 ? 'Platforms' : 'Plan'}
                    </span>
                  </div>
                  {step < totalSteps && (
                    <div className={`w-8 h-0.5 mx-2 rounded-full transition-all duration-300 ${
                      step < currentStep ? 'bg-emerald-300' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Content Area - Flexible Height */}
          <div className="flex-1 px-4 py-3 overflow-hidden">
            <div className="max-w-2xl mx-auto h-full flex flex-col justify-center">
              {renderStep()}
            </div>
          </div>

          {/* Footer - Ultra Compact */}
          <div className="px-4 py-3 bg-gray-50/50 border-t flex items-center justify-between flex-shrink-0">
            <button
              type="button"
              onClick={prevStep}
              disabled={currentStep === 1}
              className={`px-3 py-2 text-sm rounded-lg font-medium transition-all duration-200 ${
                currentStep === 1
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-100'
              }`}
            >
              <ChevronLeft className="w-4 h-4 mr-1 inline" />
              Previous
            </button>

            <div className="flex items-center space-x-3">
              {currentStep === totalSteps ? (
                <button
                  onClick={handleComplete}
                  disabled={!isStepValid() || isCompleting}
                  className="px-5 py-2 text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  {isCompleting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Completing...
                    </>
                  ) : (
                    <>
                      Complete Setup
                      <Rocket className="w-4 h-4 ml-2" />
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={nextStep}
                  disabled={!isStepValid()}
                  className="px-5 py-2 text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                >
                  Continue
                  <ChevronRight className="w-4 h-4 ml-2" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  )
}
