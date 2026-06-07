import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  ChevronRight, 
  ChevronLeft, 
  Sparkles, 
  MessageSquare, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Info,
  Instagram,
  Upload,
  Link as LinkIcon
} from 'lucide-react'
import { apiRequest } from '@/lib/queryClient'
import { useSocialAccounts } from '@/hooks/useSocialAccounts'
import { useCurrentWorkspace } from '@/components/WorkspaceSwitcher'

interface VoiceProfileSetupProps {
  workspaceId: string
  onComplete?: (profile: VoiceProfile) => void
  onSkip?: () => void
}

interface VoiceProfile {
  userId: string
  workspaceId: string
  vocabularyFrequency: Record<string, number>
  signaturePhrases: string[]
  sentenceLengthDistribution: {
    short: number
    medium: number
    long: number
  }
  paragraphStructure: string
  emojiUsagePattern: {
    frequency: string
    placement: string
    topEmojis: string[]
  }
  punctuationStyle: {
    exclamationUsage: string
    questionUsage: string
    ellipsisUsage: boolean
  }
  toneMarkers: {
    casual: number
    professional: number
    humorous: number
    inspirational: number
    educational: number
    conversational: number
  }
  hookPatterns: string[]
  engagementQuestionStyle: string[]
  storytellingStructure: string
  sampleSize: number
  confidence: number
  lastUpdated: Date
  createdAt: Date
}

const MINIMUM_CAPTIONS = 5

export default function VoiceProfileSetup({ 
  workspaceId, 
  onComplete,
  onSkip 
}: VoiceProfileSetupProps) {
  const [currentStep, setCurrentStep] = useState(1)
  const [sourceType, setSourceType] = useState<'manual' | 'instagram'>('manual')
  const [captions, setCaptions] = useState<string[]>(['', '', '', '', ''])
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null)
  const [isFetchingCaptions, setIsFetchingCaptions] = useState(false)

  const { currentWorkspace } = useCurrentWorkspace()
  const { socialAccounts, isLoading: loadingAccounts } = useSocialAccounts(workspaceId)

  const totalSteps = 4

  // Check if Instagram is connected
  const instagramAccount = socialAccounts?.find((acc: any) => 
    acc.platform === 'instagram' && acc.isActive && acc.tokenStatus === 'valid'
  )

  // Fetch captions from Instagram
  const fetchInstagramCaptions = async () => {
    if (!instagramAccount) return

    try {
      setIsFetchingCaptions(true)
      setAnalysisError(null)

      // Fetch user's recent posts from Instagram
      const response = await apiRequest(`/api/instagram/user-media/${instagramAccount._id || instagramAccount.id}`, {
        method: 'GET'
      })

      if (response.success && response.media) {
        // Extract captions from the media
        const instagramCaptions = response.media
          .filter((post: any) => post.caption && post.caption.trim().length > 50)
          .slice(0, 10)
          .map((post: any) => post.caption)

        if (instagramCaptions.length >= MINIMUM_CAPTIONS) {
          setCaptions(instagramCaptions.slice(0, 10))
          setSourceType('instagram')
        } else {
          throw new Error(`Found only ${instagramCaptions.length} captions. Please add more manually or post more content on Instagram.`)
        }
      } else {
        throw new Error(response.error || 'Failed to fetch Instagram captions')
      }
    } catch (error) {
      console.error('Failed to fetch Instagram captions:', error)
      setAnalysisError(
        error instanceof Error 
          ? error.message 
          : 'Failed to fetch captions from Instagram. You can still add them manually.'
      )
    } finally {
      setIsFetchingCaptions(false)
    }
  }

  // Handle Instagram connection
  const handleConnectInstagram = () => {
    if (!currentWorkspace?.id) {
      setAnalysisError('No workspace found. Please select a workspace first.')
      return
    }
    // Redirect to Instagram OAuth
    window.location.href = `/api/v1/social-auth/instagram/authorize?workspaceId=${currentWorkspace.id}`
  }

  // Add a new caption field
  const addCaptionField = () => {
    setCaptions([...captions, ''])
  }

  // Remove a caption field
  const removeCaptionField = (index: number) => {
    if (captions.length > MINIMUM_CAPTIONS) {
      const newCaptions = captions.filter((_, i) => i !== index)
      setCaptions(newCaptions)
    }
  }

  // Update caption at specific index
  const updateCaption = (index: number, value: string) => {
    const newCaptions = [...captions]
    newCaptions[index] = value
    setCaptions(newCaptions)
  }

  // Count filled captions
  const filledCaptions = captions.filter(c => c.trim().length > 0)
  const isMinimumMet = filledCaptions.length >= MINIMUM_CAPTIONS

  // Analyze captions
  const analyzeVoiceProfile = async () => {
    try {
      setIsAnalyzing(true)
      setAnalysisError(null)

      const response = await apiRequest('/api/voice-profile/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          workspaceId,
          sampleCaptions: filledCaptions
        })
      })

      if (response.success && response.voiceProfile) {
        setVoiceProfile(response.voiceProfile)
        setCurrentStep(4) // Move to results step
      } else {
        throw new Error(response.error || 'Failed to analyze voice profile')
      }
    } catch (error) {
      console.error('Voice profile analysis error:', error)
      setAnalysisError(
        error instanceof Error 
          ? error.message 
          : 'Failed to analyze your writing style. Please try again.'
      )
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleComplete = () => {
    if (voiceProfile && onComplete) {
      onComplete(voiceProfile)
    }
  }

  const nextStep = () => {
    if (currentStep < totalSteps) {
      if (currentStep === 2 && isMinimumMet) {
        // Move to analysis step and start analyzing
        setCurrentStep(3)
        analyzeVoiceProfile()
      } else {
        setCurrentStep(currentStep + 1)
      }
    }
  }

  const prevStep = () => {
    if (currentStep > 1 && currentStep !== 3) {
      setCurrentStep(currentStep - 1)
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-100 to-pink-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-purple-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Create Your Voice Profile
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Your Voice Profile helps our AI understand your unique writing style so it can 
                generate captions that sound exactly like you wrote them.
              </p>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-blue-900 mb-1">How it works</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Share 5+ of your best-performing captions</li>
                    <li>• Our AI analyzes your vocabulary, tone, emoji usage, and patterns</li>
                    <li>• Get captions that match your authentic voice</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-purple-600" />
                    Vocabulary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Words you use most, signature phrases, and language patterns
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-pink-600" />
                    Tone & Style
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Casual vs. professional, humorous, inspirational, or educational
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                    Formatting
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600">
                    Emoji placement, punctuation style, and sentence structure
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Share Your Captions
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Connect your Instagram account to automatically import captions, or paste them manually below.
              </p>
            </div>

            {/* Source Selection Tabs */}
            <Tabs value={sourceType} onValueChange={(val) => setSourceType(val as 'manual' | 'instagram')} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="manual" className="flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Upload Manually
                </TabsTrigger>
                <TabsTrigger value="instagram" className="flex items-center gap-2">
                  <Instagram className="w-4 h-4" />
                  Connect Instagram
                </TabsTrigger>
              </TabsList>

              <TabsContent value="instagram" className="space-y-4">
                {loadingAccounts ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    <span className="ml-3 text-gray-600">Checking Instagram connection...</span>
                  </div>
                ) : instagramAccount ? (
                  <Card className="border-2 border-green-200 bg-green-50">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        Instagram Connected
                      </CardTitle>
                      <CardDescription>
                        @{instagramAccount.username} is connected
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button
                        onClick={fetchInstagramCaptions}
                        disabled={isFetchingCaptions}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                      >
                        {isFetchingCaptions ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Fetching Your Captions...
                          </>
                        ) : (
                          <>
                            <Instagram className="w-4 h-4 mr-2" />
                            Import Captions from Instagram
                          </>
                        )}
                      </Button>
                      {isFetchingCaptions && (
                        <p className="text-sm text-gray-600 mt-3 text-center">
                          Analyzing your recent posts...
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ) : (
                  <Card className="border-2 border-blue-200 bg-blue-50">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Instagram className="w-5 h-5 text-blue-600" />
                        Connect Your Instagram
                      </CardTitle>
                      <CardDescription>
                        Automatically import your best-performing captions
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="bg-white rounded-lg p-4 space-y-2">
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-gray-700">Instant caption import from your feed</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-gray-700">Analyzes your authentic writing style</p>
                        </div>
                        <div className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-gray-700">More accurate voice profile</p>
                        </div>
                      </div>
                      <Button
                        onClick={handleConnectInstagram}
                        className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                      >
                        <Instagram className="w-4 h-4 mr-2" />
                        Connect Instagram Account
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {analysisError && sourceType === 'instagram' && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-amber-800">{analysisError}</p>
                        <Button
                          variant="link"
                          onClick={() => setSourceType('manual')}
                          className="text-amber-700 underline p-0 h-auto mt-2"
                        >
                          Switch to manual upload
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="manual" className="space-y-4">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-bold text-amber-900">
                        {filledCaptions.length}/{MINIMUM_CAPTIONS}
                      </span>
                      <span className="text-sm text-amber-800">captions provided</span>
                    </div>
                    {isMinimumMet ? (
                      <Badge variant="default" className="bg-green-500">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Ready to analyze
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        {MINIMUM_CAPTIONS - filledCaptions.length} more needed
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                  {captions.map((caption, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor={`caption-${index}`} className="text-sm font-semibold">
                          Caption {index + 1} {index < MINIMUM_CAPTIONS && <span className="text-red-500">*</span>}
                        </Label>
                        {captions.length > MINIMUM_CAPTIONS && index >= MINIMUM_CAPTIONS && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeCaptionField(index)}
                            className="h-6 text-xs text-red-600 hover:text-red-700"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                      <Textarea
                        id={`caption-${index}`}
                        value={caption}
                        onChange={(e) => updateCaption(index, e.target.value)}
                        placeholder="Paste your Instagram caption here..."
                        rows={4}
                        className="resize-none"
                      />
                    </div>
                  ))}
                </div>

                <Button
                  variant="outline"
                  onClick={addCaptionField}
                  className="w-full"
                >
                  + Add Another Caption
                </Button>

                {!isMinimumMet && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-800">
                      💡 Tip: Include captions that got good engagement and represent your typical style
                    </p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Analyzing Your Voice
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto mb-6">
                Our AI is analyzing your writing patterns to create your unique voice profile...
              </p>

              <div className="space-y-4 max-w-md mx-auto">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Extracting vocabulary patterns</span>
                    {isAnalyzing && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                  </div>
                  <Progress value={isAnalyzing ? 30 : 100} className="h-2" />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Analyzing tone and style</span>
                    {isAnalyzing && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                  </div>
                  <Progress value={isAnalyzing ? 60 : 100} className="h-2" />
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Identifying signature phrases</span>
                    {isAnalyzing && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}
                  </div>
                  <Progress value={isAnalyzing ? 90 : 100} className="h-2" />
                </div>
              </div>

              {analysisError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-6">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-red-900 mb-1">Analysis Failed</h3>
                      <p className="text-sm text-red-800">{analysisError}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Voice Profile Created!
              </h2>
              <p className="text-gray-600 max-w-2xl mx-auto">
                Your unique voice profile is ready. Here's what we learned about your writing style:
              </p>
            </div>

            {voiceProfile && (
              <div className="space-y-4">
                {/* Confidence Score */}
                <Card className="border-2 border-green-200 bg-green-50">
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-green-600" />
                      Confidence Score
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <Progress 
                          value={voiceProfile.confidence * 100} 
                          className="h-3"
                        />
                      </div>
                      <span className="text-2xl font-bold text-green-600">
                        {Math.round(voiceProfile.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      Based on {voiceProfile.sampleSize} caption{voiceProfile.sampleSize !== 1 ? 's' : ''}
                    </p>
                  </CardContent>
                </Card>

                {/* Tone Markers */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Your Tone Profile</CardTitle>
                    <CardDescription>How your writing comes across</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {Object.entries(voiceProfile.toneMarkers)
                      .filter(([_, score]) => score > 0.3)
                      .sort(([_, a], [__, b]) => b - a)
                      .map(([tone, score]) => (
                        <div key={tone} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="capitalize font-medium">{tone}</span>
                            <span className="text-gray-600">{Math.round(score * 100)}%</span>
                          </div>
                          <Progress value={score * 100} className="h-2" />
                        </div>
                      ))}
                  </CardContent>
                </Card>

                {/* Emoji Usage */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Emoji Style</CardTitle>
                    <CardDescription>Your emoji patterns</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Frequency:</span>
                        <Badge variant="secondary" className="capitalize">
                          {voiceProfile.emojiUsagePattern.frequency}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Placement:</span>
                        <Badge variant="secondary" className="capitalize">
                          {voiceProfile.emojiUsagePattern.placement}
                        </Badge>
                      </div>
                      {voiceProfile.emojiUsagePattern.topEmojis.length > 0 && (
                        <div>
                          <span className="text-sm font-medium block mb-2">Top Emojis:</span>
                          <div className="flex gap-2 flex-wrap">
                            {voiceProfile.emojiUsagePattern.topEmojis.map((emoji, idx) => (
                              <span key={idx} className="text-2xl">{emoji}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Signature Phrases */}
                {voiceProfile.signaturePhrases.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Signature Phrases</CardTitle>
                      <CardDescription>Words and phrases you use often</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {voiceProfile.signaturePhrases.map((phrase, idx) => (
                          <Badge key={idx} variant="outline" className="text-sm">
                            "{phrase}"
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Writing Structure */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Writing Structure</CardTitle>
                    <CardDescription>Your sentence and paragraph patterns</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <span className="text-sm font-medium block mb-2">Sentence Length:</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center p-2 bg-gray-50 rounded">
                          <div className="text-xs text-gray-600">Short</div>
                          <div className="text-lg font-semibold">
                            {Math.round(voiceProfile.sentenceLengthDistribution.short * 100)}%
                          </div>
                        </div>
                        <div className="text-center p-2 bg-gray-50 rounded">
                          <div className="text-xs text-gray-600">Medium</div>
                          <div className="text-lg font-semibold">
                            {Math.round(voiceProfile.sentenceLengthDistribution.medium * 100)}%
                          </div>
                        </div>
                        <div className="text-center p-2 bg-gray-50 rounded">
                          <div className="text-xs text-gray-600">Long</div>
                          <div className="text-lg font-semibold">
                            {Math.round(voiceProfile.sentenceLengthDistribution.long * 100)}%
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Paragraph Style:</span>
                      <Badge variant="secondary" className="capitalize">
                        {voiceProfile.paragraphStructure.replace('-', ' ')}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Progress Indicator */}
      {currentStep !== 3 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">
              Step {currentStep} of {totalSteps}
            </span>
            <span className="text-sm text-gray-500">
              {Math.round((currentStep / totalSteps) * 100)}% Complete
            </span>
          </div>
          <Progress value={(currentStep / totalSteps) * 100} className="h-2" />
        </div>
      )}

      {/* Step Content */}
      <div className="mb-8">
        {renderStepContent()}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between pt-6 border-t">
        <div>
          {currentStep > 1 && currentStep !== 3 && (
            <Button
              variant="outline"
              onClick={prevStep}
              disabled={isAnalyzing}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}
          {onSkip && currentStep === 1 && (
            <Button
              variant="ghost"
              onClick={onSkip}
              className="text-gray-600"
            >
              Skip for now
            </Button>
          )}
        </div>

        <div className="flex gap-3">
          {currentStep === 2 && (
            <Button
              onClick={nextStep}
              disabled={!isMinimumMet}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              Analyze Voice Profile
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          {currentStep === 1 && (
            <Button
              onClick={nextStep}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              Get Started
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
          {currentStep === 3 && analysisError && (
            <Button
              onClick={() => setCurrentStep(2)}
              variant="outline"
            >
              Try Again
            </Button>
          )}
          {currentStep === 4 && (
            <Button
              onClick={handleComplete}
              className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Complete Setup
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
