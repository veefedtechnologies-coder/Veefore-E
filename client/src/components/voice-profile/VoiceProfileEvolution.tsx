import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  TrendingUp,
  TrendingDown,
  Sparkles, 
  Calendar,
  CheckCircle2,
  Brain,
  Target,
  Award,
  BarChart3,
  Loader2,
  AlertCircle,
  Clock,
  Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { apiRequest } from '@/lib/queryClient'

export interface VoiceProfileSnapshot {
  date: Date
  confidence: number
  sampleSize: number
  toneMarkers: {
    casual: number
    professional: number
    humorous: number
    inspirational: number
    educational: number
    conversational: number
  }
  topVocabulary: string[]
  signaturePhrases: string[]
  acceptanceRate?: number
}

export interface LearningMilestone {
  id: string
  date: Date
  type: 'pattern_discovered' | 'accuracy_improved' | 'profile_updated' | 'feedback_integrated'
  title: string
  description: string
  impact: 'high' | 'medium' | 'low'
}

export interface AcceptanceRateTrend {
  date: string
  acceptanceRate: number
  totalGenerated: number
  totalAccepted: number
}

export interface VoiceProfileEvolutionProps {
  workspaceId: string
  compact?: boolean
}


export default function VoiceProfileEvolution({ 
  workspaceId,
  compact = false
}: VoiceProfileEvolutionProps) {
  const [snapshots, setSnapshots] = useState<VoiceProfileSnapshot[]>([])
  const [milestones, setMilestones] = useState<LearningMilestone[]>([])
  const [acceptanceTrend, setAcceptanceTrend] = useState<AcceptanceRateTrend[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadEvolutionData()
  }, [workspaceId])

  const loadEvolutionData = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await apiRequest(`/api/voice-profile/${workspaceId}/evolution`, {
        method: 'GET'
      })

      if (response.success) {
        setSnapshots(response.snapshots || [])
        setMilestones(response.milestones || [])
        setAcceptanceTrend(response.acceptanceTrend || [])
      } else {
        throw new Error(response.error || 'Failed to load evolution data')
      }
    } catch (error) {
      console.error('Evolution data loading error:', error)
      setError(
        error instanceof Error 
          ? error.message 
          : 'Failed to load voice profile evolution data'
      )
    } finally {
      setIsLoading(false)
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


  const getTopTone = (toneMarkers: VoiceProfileSnapshot['toneMarkers']) => {
    return Object.entries(toneMarkers)
      .sort(([, a], [, b]) => b - a)[0]
  }

  const calculateGrowth = (snapshots: VoiceProfileSnapshot[]) => {
    if (snapshots.length < 2) return null
    const oldest = snapshots[0]
    const newest = snapshots[snapshots.length - 1]
    
    return {
      confidenceChange: ((newest.confidence - oldest.confidence) / oldest.confidence) * 100,
      sampleGrowth: newest.sampleSize - oldest.sampleSize,
      timeSpan: Math.floor((new Date(newest.date).getTime() - new Date(oldest.date).getTime()) / (1000 * 60 * 60 * 24))
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="w-8 h-8 text-purple-600 animate-spin" />
        <p className="text-gray-600">Loading evolution data...</p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="py-8">
        <Card className="border-2 border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900 mb-1">Error Loading Evolution Data</h3>
                <p className="text-sm text-red-800 mb-4">{error}</p>
                <button 
                  onClick={loadEvolutionData}
                  className="text-sm text-red-600 hover:text-red-700 underline"
                >
                  Try Again
                </button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }


  // No data state
  if (snapshots.length === 0 && milestones.length === 0 && acceptanceTrend.length === 0) {
    return (
      <div className="text-center py-12 space-y-4">
        <Brain className="h-12 w-12 mx-auto text-gray-400" />
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900">No Evolution Data Yet</h3>
          <p className="text-sm text-gray-600 max-w-md mx-auto">
            Your voice profile evolution will be tracked over time as you use AI-generated captions and provide feedback.
          </p>
        </div>
      </div>
    )
  }

  const growth = calculateGrowth(snapshots)
  const latestSnapshot = snapshots[snapshots.length - 1]

  // Compact view
  if (compact) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-600" />
            Learning Progress
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {growth && (
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-600 mb-1">Confidence</div>
                <div className={cn(
                  'text-lg font-bold flex items-center gap-1',
                  growth.confidenceChange >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  {growth.confidenceChange >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                  {Math.abs(growth.confidenceChange).toFixed(1)}%
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="text-gray-600 mb-1">Samples</div>
                <div className="text-lg font-bold text-gray-900">
                  +{growth.sampleGrowth}
                </div>
              </div>
            </div>
          )}
          
          {milestones.length > 0 && (
            <div>
              <div className="text-sm font-medium text-gray-600 mb-2">Recent Milestone</div>
              <div className="flex items-start gap-2 bg-purple-50 rounded-lg p-3">
                <Award className="w-4 h-4 text-purple-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-purple-900 truncate">
                    {milestones[milestones.length - 1].title}
                  </div>
                  <div className="text-xs text-purple-700">
                    {formatDate(milestones[milestones.length - 1].date)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }


  // Full view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Brain className="w-6 h-6 text-purple-600" />
          Voice Profile Evolution
        </h2>
        <p className="text-gray-600">
          Track how your voice profile has learned and improved over time
        </p>
      </div>

      {/* Growth Overview */}
      {growth && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-600" />
                Confidence Growth
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className={cn(
                  'text-3xl font-bold flex items-center gap-2',
                  growth.confidenceChange >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  {growth.confidenceChange >= 0 ? <TrendingUp className="w-6 h-6" /> : <TrendingDown className="w-6 h-6" />}
                  {growth.confidenceChange >= 0 ? '+' : ''}{growth.confidenceChange.toFixed(1)}%
                </div>
                <p className="text-sm text-gray-600">
                  Over {growth.timeSpan} days
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-600" />
                Sample Growth
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-blue-600">
                  +{growth.sampleGrowth}
                </div>
                <p className="text-sm text-gray-600">
                  captions analyzed
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Award className="w-4 h-4 text-purple-600" />
                Milestones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="text-3xl font-bold text-purple-600">
                  {milestones.length}
                </div>
                <p className="text-sm text-gray-600">
                  achievements unlocked
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}


      {/* Tabs */}
      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="timeline" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Timeline
          </TabsTrigger>
          <TabsTrigger value="milestones" className="flex items-center gap-2">
            <Award className="h-4 w-4" />
            Milestones ({milestones.length})
          </TabsTrigger>
          <TabsTrigger value="acceptance" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Acceptance Rate
          </TabsTrigger>
        </TabsList>

        {/* Timeline Tab */}
        <TabsContent value="timeline" className="space-y-6 mt-6">
          <div className="space-y-1">
            <h4 className="text-lg font-semibold text-gray-900">Profile Evolution Timeline</h4>
            <p className="text-sm text-gray-600">
              See how your voice profile characteristics have changed over time
            </p>
          </div>

          {snapshots.length > 0 ? (
            <div className="space-y-4">
              {snapshots.slice().reverse().map((snapshot, index) => {
                const [topToneName, topToneValue] = getTopTone(snapshot.toneMarkers)
                const isLatest = index === 0
                
                return (
                  <Card key={index} className={cn(
                    'transition-all',
                    isLatest && 'border-2 border-purple-200 bg-purple-50/50'
                  )}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-gray-600" />
                          <CardTitle className="text-base">
                            {formatDate(snapshot.date)}
                          </CardTitle>
                          {isLatest && (
                            <Badge variant="default" className="bg-purple-600">
                              Current
                            </Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-gray-600">Confidence</div>
                          <div className="text-lg font-bold text-purple-600">
                            {Math.round(snapshot.confidence * 100)}%
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium text-gray-600 mb-2">Primary Tone</div>
                          <Badge variant="secondary" className="capitalize">
                            {topToneName} ({Math.round(topToneValue * 100)}%)
                          </Badge>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-600 mb-2">Samples</div>
                          <div className="text-lg font-semibold text-gray-900">
                            {snapshot.sampleSize} captions
                          </div>
                        </div>
                      </div>


                      {snapshot.topVocabulary && snapshot.topVocabulary.length > 0 && (
                        <div>
                          <div className="text-sm font-medium text-gray-600 mb-2">Top Vocabulary</div>
                          <div className="flex flex-wrap gap-1">
                            {snapshot.topVocabulary.slice(0, 8).map((word, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {word}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {snapshot.signaturePhrases && snapshot.signaturePhrases.length > 0 && (
                        <div>
                          <div className="text-sm font-medium text-gray-600 mb-2">Signature Phrases</div>
                          <div className="flex flex-wrap gap-1">
                            {snapshot.signaturePhrases.slice(0, 3).map((phrase, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                "{phrase}"
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {snapshot.acceptanceRate !== undefined && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-gray-600">Acceptance Rate</span>
                            <span className="text-sm font-bold text-green-600">
                              {Math.round(snapshot.acceptanceRate * 100)}%
                            </span>
                          </div>
                          <Progress value={snapshot.acceptanceRate * 100} className="h-2" />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Clock className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">No timeline data available yet</p>
            </div>
          )}
        </TabsContent>


        {/* Milestones Tab */}
        <TabsContent value="milestones" className="space-y-6 mt-6">
          <div className="space-y-1">
            <h4 className="text-lg font-semibold text-gray-900">Learning Milestones</h4>
            <p className="text-sm text-gray-600">
              Key achievements and improvements in your AI caption generation
            </p>
          </div>

          {milestones.length > 0 ? (
            <div className="space-y-4">
              {milestones.slice().reverse().map((milestone) => {
                const icons = {
                  pattern_discovered: Sparkles,
                  accuracy_improved: Target,
                  profile_updated: Brain,
                  feedback_integrated: CheckCircle2
                }
                
                const colors = {
                  high: 'bg-purple-100 border-purple-300 text-purple-900',
                  medium: 'bg-blue-100 border-blue-300 text-blue-900',
                  low: 'bg-gray-100 border-gray-300 text-gray-900'
                }

                const Icon = icons[milestone.type] || Award

                return (
                  <Card key={milestone.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex gap-4">
                        <div className={cn(
                          'flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center border-2',
                          colors[milestone.impact]
                        )}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h5 className="font-semibold text-gray-900">
                              {milestone.title}
                            </h5>
                            <Badge variant="outline" className="text-xs flex-shrink-0">
                              {milestone.impact} impact
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            {milestone.description}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Calendar className="w-3 h-3" />
                            {formatDate(milestone.date)}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          ) : (
            <div className="text-center py-12">
              <Award className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">No milestones achieved yet</p>
            </div>
          )}
        </TabsContent>


        {/* Acceptance Rate Tab */}
        <TabsContent value="acceptance" className="space-y-6 mt-6">
          <div className="space-y-1">
            <h4 className="text-lg font-semibold text-gray-900">Acceptance Rate Trends</h4>
            <p className="text-sm text-gray-600">
              Track how often you accept AI-generated captions without edits
            </p>
          </div>

          {acceptanceTrend.length > 0 ? (
            <Card>
              <CardContent className="pt-6 space-y-4">
                {acceptanceTrend.map((trend, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        {new Date(trend.date).toLocaleDateString('en-US', { 
                          month: 'short', 
                          year: 'numeric' 
                        })}
                      </span>
                      <div className="flex items-center gap-4">
                        <span className="text-xs text-gray-500">
                          {trend.totalAccepted} / {trend.totalGenerated} accepted
                        </span>
                        <span className="font-bold text-gray-900">
                          {Math.round(trend.acceptanceRate * 100)}%
                        </span>
                      </div>
                    </div>
                    <Progress value={trend.acceptanceRate * 100} className="h-2" />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <div className="text-center py-12">
              <BarChart3 className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">No acceptance rate data available yet</p>
            </div>
          )}

          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-3">
              <Target className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-medium text-blue-900">
                  Improving Over Time
                </h4>
                <p className="text-xs text-blue-700">
                  A higher acceptance rate means the AI is learning your voice better. 
                  Keep using and providing feedback to improve caption quality.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
