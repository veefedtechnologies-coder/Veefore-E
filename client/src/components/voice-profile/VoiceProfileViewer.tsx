import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { 
  RefreshCw,
  Sparkles, 
  MessageSquare, 
  AlertCircle,
  Loader2,
  Calendar,
  TrendingUp,
  Edit3,
  ChevronRight
} from 'lucide-react'
import { apiRequest } from '@/lib/queryClient'

interface VoiceProfileViewerProps {
  workspaceId: string
  onRecalibrate?: () => void
  onEdit?: () => void
  compact?: boolean
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

export default function VoiceProfileViewer({ 
  workspaceId, 
  onRecalibrate,
  onEdit,
  compact = false
}: VoiceProfileViewerProps) {
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRecalibrating, setIsRecalibrating] = useState(false)

  // Load voice profile
  useEffect(() => {
    loadVoiceProfile()
  }, [workspaceId])

  const loadVoiceProfile = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await apiRequest(`/api/voice-profile/${workspaceId}`, {
        method: 'GET'
      })

      if (response.success && response.voiceProfile) {
        setVoiceProfile(response.voiceProfile)
      } else {
        throw new Error(response.error || 'Failed to load voice profile')
      }
    } catch (error) {
      console.error('Voice profile loading error:', error)
      setError(
        error instanceof Error 
          ? error.message 
          : 'Failed to load your voice profile. Please try again.'
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleRecalibrate = async () => {
    try {
      setIsRecalibrating(true)
      setError(null)

      const response = await apiRequest(`/api/voice-profile/${workspaceId}/recalibrate`, {
        method: 'PUT'
      })

      if (response.success && response.voiceProfile) {
        setVoiceProfile(response.voiceProfile)
        if (onRecalibrate) {
          onRecalibrate()
        }
      } else {
        throw new Error(response.error || 'Failed to recalibrate voice profile')
      }
    } catch (error) {
      console.error('Voice profile recalibration error:', error)
      setError(
        error instanceof Error 
          ? error.message 
          : 'Failed to recalibrate your voice profile. Please try again.'
      )
    } finally {
      setIsRecalibrating(false)
    }
  }

  const formatDate = (date: Date | string) => {
    const d = new Date(date)
    return d.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    })
  }

  const getTopVocabulary = (vocab: Record<string, number>, limit = 10) => {
    return Object.entries(vocab)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([word]) => word)
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
        <p className="text-gray-600">Loading your voice profile...</p>
      </div>
    )
  }

  // Error state
  if (error || !voiceProfile) {
    return (
      <div className="py-8">
        <Card className="border-2 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-1">
                  {error ? 'Error Loading Profile' : 'No Voice Profile Found'}
                </h3>
                <p className="text-sm text-red-800 mb-4">
                  {error || 'You haven\'t created a voice profile yet. Create one to get personalized AI-generated captions.'}
                </p>
                <Button 
                  onClick={loadVoiceProfile}
                  variant="outline"
                  size="sm"
                >
                  Try Again
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Compact view (for dashboard/sidebar)
  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              Voice Profile
            </CardTitle>
            {onEdit && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onEdit}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Confidence Score */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Confidence</span>
              <span className="text-sm font-bold text-purple-600">
                {Math.round(voiceProfile.confidence * 100)}%
              </span>
            </div>
            <Progress value={voiceProfile.confidence * 100} className="h-2" />
          </div>

          {/* Top Tones */}
          <div>
            <span className="text-sm font-medium text-gray-600 block mb-2">Your Style</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(voiceProfile.toneMarkers)
                .filter(([_, score]) => score > 0.3)
                .sort(([_, a], [__, b]) => b - a)
                .slice(0, 3)
                .map(([tone]) => (
                  <Badge key={tone} variant="secondary" className="capitalize text-xs">
                    {tone}
                  </Badge>
                ))}
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
            <div>
              <span className="block">Samples</span>
              <span className="font-semibold text-gray-900">{voiceProfile.sampleSize}</span>
            </div>
            <div>
              <span className="block">Updated</span>
              <span className="font-semibold text-gray-900">
                {formatDate(voiceProfile.lastUpdated)}
              </span>
            </div>
          </div>

          {/* Recalibrate Button */}
          <Button
            onClick={handleRecalibrate}
            disabled={isRecalibrating}
            variant="outline"
            size="sm"
            className="w-full"
          >
            {isRecalibrating ? (
              <>
                <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                Recalibrating...
              </>
            ) : (
              <>
                <RefreshCw className="w-3 h-3 mr-2" />
                Recalibrate
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Full view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-purple-600" />
            Your Voice Profile
          </h2>
          <p className="text-gray-600">
            AI-learned patterns from your writing style to generate authentic captions
          </p>
        </div>
        <div className="flex gap-2">
          {onEdit && (
            <Button
              variant="outline"
              onClick={onEdit}
            >
              <Edit3 className="w-4 h-4 mr-2" />
              Edit Samples
            </Button>
          )}
          <Button
            onClick={handleRecalibrate}
            disabled={isRecalibrating}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          >
            {isRecalibrating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Recalibrating...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Recalibrate Profile
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Profile Metadata */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-600" />
              Confidence Score
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-green-600">
                  {Math.round(voiceProfile.confidence * 100)}%
                </span>
                <span className="text-sm text-gray-600 mb-1">accuracy</span>
              </div>
              <Progress value={voiceProfile.confidence * 100} className="h-2" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-blue-600" />
              Sample Size
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="text-3xl font-bold text-gray-900">
                {voiceProfile.sampleSize}
              </div>
              <p className="text-sm text-gray-600">
                caption{voiceProfile.sampleSize !== 1 ? 's' : ''} analyzed
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="w-4 h-4 text-purple-600" />
              Last Updated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="text-lg font-bold text-gray-900">
                {formatDate(voiceProfile.lastUpdated)}
              </div>
              <p className="text-sm text-gray-600">
                Created {formatDate(voiceProfile.createdAt)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tone Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Your Tone Profile</CardTitle>
          <CardDescription>How your writing comes across to your audience</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(voiceProfile.toneMarkers)
            .filter(([_, score]) => score > 0.2)
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

      {/* Writing Style Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Emoji Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Emoji Style</CardTitle>
            <CardDescription>Your emoji patterns and preferences</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
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

        {/* Punctuation Style */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Punctuation Style</CardTitle>
            <CardDescription>How you use punctuation marks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Exclamation Points:</span>
                <Badge variant="secondary" className="capitalize">
                  {voiceProfile.punctuationStyle.exclamationUsage}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Questions:</span>
                <Badge variant="secondary" className="capitalize">
                  {voiceProfile.punctuationStyle.questionUsage}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Ellipsis (...):</span>
                <Badge variant="secondary">
                  {voiceProfile.punctuationStyle.ellipsisUsage ? 'Yes' : 'No'}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Signature Phrases */}
      {voiceProfile.signaturePhrases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Signature Phrases</CardTitle>
            <CardDescription>Words and phrases you use frequently</CardDescription>
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

      {/* Vocabulary */}
      {voiceProfile.vocabularyFrequency && Object.keys(voiceProfile.vocabularyFrequency).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Common Vocabulary</CardTitle>
            <CardDescription>Words you use most frequently</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {getTopVocabulary(voiceProfile.vocabularyFrequency, 15).map((word, idx) => (
                <Badge key={idx} variant="secondary" className="text-sm">
                  {word}
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
        <CardContent className="space-y-4">
          <div>
            <span className="text-sm font-medium block mb-3">Sentence Length Distribution:</span>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-600 mb-1">Short (1-5 words)</div>
                <div className="text-2xl font-bold text-gray-900">
                  {Math.round(voiceProfile.sentenceLengthDistribution.short * 100)}%
                </div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-600 mb-1">Medium (6-15 words)</div>
                <div className="text-2xl font-bold text-gray-900">
                  {Math.round(voiceProfile.sentenceLengthDistribution.medium * 100)}%
                </div>
              </div>
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-xs text-gray-600 mb-1">Long (16+ words)</div>
                <div className="text-2xl font-bold text-gray-900">
                  {Math.round(voiceProfile.sentenceLengthDistribution.long * 100)}%
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="text-sm font-medium">Paragraph Style:</span>
            <Badge variant="secondary" className="capitalize">
              {voiceProfile.paragraphStructure.replace('-', ' ')}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Storytelling Structure:</span>
            <Badge variant="secondary" className="capitalize">
              {voiceProfile.storytellingStructure}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Hook Patterns */}
      {voiceProfile.hookPatterns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Hook Patterns</CardTitle>
            <CardDescription>Your typical opening sentence structures</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {voiceProfile.hookPatterns.slice(0, 5).map((pattern, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg text-sm">
                  "{pattern}"
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Engagement Question Style */}
      {voiceProfile.engagementQuestionStyle.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Engagement Question Style</CardTitle>
            <CardDescription>How you ask questions to engage your audience</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {voiceProfile.engagementQuestionStyle.slice(0, 5).map((style, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg text-sm">
                  "{style}"
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
