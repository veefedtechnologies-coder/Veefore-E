import React from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  TrendingUp, 
  TrendingDown,
  Heart, 
  MessageCircle, 
  Bookmark, 
  Share2,
  BarChart3,
  Target,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Trophy,
  Brain
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PerformanceMetrics {
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  impressions: number;
  engagementRate: number;
}

export interface CaptionPerformanceData {
  captionId: string;
  caption: string;
  predictedMetrics: {
    likeRate: number;
    commentRate: number;
    saveRate: number;
    shareRate: number;
    confidence: number;
  };
  actualMetrics?: PerformanceMetrics;
  publishedAt?: Date;
  performanceRecordedAt?: Date;
  patternsUsed?: string[];
  hooksUsed?: string[];
  styleType?: 'viral' | 'authentic' | 'balanced';
}

export interface LearningInsight {
  type: 'success' | 'improvement' | 'warning' | 'info';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
}

export interface CaptionPerformanceInsightsProps {
  captions: CaptionPerformanceData[];
  learningInsights?: LearningInsight[];
  accuracyTrend?: Array<{ date: string; accuracy: number }>;
  overallStats?: {
    totalGenerated: number;
    totalPublished: number;
    avgActualEngagement: number;
    avgPredictedAccuracy: number;
    improvementRate: number;
  };
}

const MetricComparison = ({ 
  label, 
  predicted, 
  actual, 
  icon: Icon,
  color 
}: { 
  label: string; 
  predicted: number; 
  actual?: number; 
  icon: any;
  color: string;
}) => {
  const difference = actual !== undefined ? ((actual - predicted) / predicted) * 100 : null;
  const isPositive = difference !== null && difference > 0;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', color)} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        </div>
        {difference !== null && (
          <div className={cn(
            'flex items-center gap-1 text-xs font-semibold',
            isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
          )}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(difference).toFixed(1)}%
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-2">
          <div className="text-gray-600 dark:text-gray-400">Predicted</div>
          <div className="font-semibold text-gray-900 dark:text-gray-100">
            {(predicted * 100).toFixed(1)}%
          </div>
        </div>
        {actual !== undefined && (
          <div className="bg-gray-50 dark:bg-gray-800 rounded p-2">
            <div className="text-gray-600 dark:text-gray-400">Actual</div>
            <div className="font-semibold text-gray-900 dark:text-gray-100">
              {(actual * 100).toFixed(1)}%
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const PerformanceCard = ({ caption }: { caption: CaptionPerformanceData }) => {
  const hasActual = caption.actualMetrics !== undefined;
  const overallAccuracy = hasActual && caption.actualMetrics ? 
    calculateAccuracy(caption.predictedMetrics, caption.actualMetrics) : null;

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 space-y-1">
            <CardDescription className="text-xs line-clamp-2">
              {caption.caption}
            </CardDescription>
            <div className="flex items-center gap-2 flex-wrap">
              {caption.styleType && (
                <Badge variant="outline" className="text-xs">
                  {caption.styleType}
                </Badge>
              )}
              {caption.publishedAt && (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {new Date(caption.publishedAt).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>
          
          {overallAccuracy !== null && (
            <div className="flex flex-col items-end">
              <div className="text-xs text-gray-500 dark:text-gray-400">Accuracy</div>
              <div className={cn(
                'text-lg font-bold',
                overallAccuracy >= 80 ? 'text-green-600 dark:text-green-400' :
                overallAccuracy >= 60 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-red-600 dark:text-red-400'
              )}>
                {overallAccuracy.toFixed(0)}%
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <MetricComparison
          label="Likes"
          predicted={caption.predictedMetrics.likeRate}
          actual={caption.actualMetrics ? caption.actualMetrics.likes / caption.actualMetrics.impressions : undefined}
          icon={Heart}
          color="text-pink-500"
        />
        
        <MetricComparison
          label="Comments"
          predicted={caption.predictedMetrics.commentRate}
          actual={caption.actualMetrics ? caption.actualMetrics.comments / caption.actualMetrics.impressions : undefined}
          icon={MessageCircle}
          color="text-blue-500"
        />
        
        <MetricComparison
          label="Saves"
          predicted={caption.predictedMetrics.saveRate}
          actual={caption.actualMetrics ? caption.actualMetrics.saves / caption.actualMetrics.impressions : undefined}
          icon={Bookmark}
          color="text-purple-500"
        />
        
        <MetricComparison
          label="Shares"
          predicted={caption.predictedMetrics.shareRate}
          actual={caption.actualMetrics ? caption.actualMetrics.shares / caption.actualMetrics.impressions : undefined}
          icon={Share2}
          color="text-green-500"
        />

        {/* Patterns and Hooks Used */}
        {(caption.patternsUsed || caption.hooksUsed) && (
          <div className="pt-2 border-t border-gray-200 dark:border-gray-700 space-y-2">
            {caption.patternsUsed && caption.patternsUsed.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Patterns Used
                </div>
                <div className="flex flex-wrap gap-1">
                  {caption.patternsUsed.map((pattern, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {pattern}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {caption.hooksUsed && caption.hooksUsed.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Hooks Used
                </div>
                <div className="flex flex-wrap gap-1">
                  {caption.hooksUsed.map((hook, i) => (
                    <Badge key={i} variant="outline" className="text-xs">
                      {hook}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const InsightCard = ({ insight }: { insight: LearningInsight }) => {
  const icons = {
    success: CheckCircle2,
    improvement: Target,
    warning: AlertCircle,
    info: Sparkles
  };
  
  const colors = {
    success: 'text-green-500 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
    improvement: 'text-blue-500 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
    warning: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    info: 'text-purple-500 bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800'
  };

  const Icon = icons[insight.type];

  return (
    <div className={cn('rounded-lg border p-4', colors[insight.type])}>
      <div className="flex gap-3">
        <Icon className={cn('h-5 w-5 flex-shrink-0 mt-0.5', colors[insight.type].split(' ')[0])} />
        <div className="space-y-1 flex-1">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
              {insight.title}
            </h4>
            <Badge 
              variant="outline" 
              className={cn(
                'text-xs',
                insight.impact === 'high' && 'border-red-300 text-red-700 dark:border-red-700 dark:text-red-300',
                insight.impact === 'medium' && 'border-yellow-300 text-yellow-700 dark:border-yellow-700 dark:text-yellow-300',
                insight.impact === 'low' && 'border-gray-300 text-gray-700 dark:border-gray-700 dark:text-gray-300'
              )}
            >
              {insight.impact} impact
            </Badge>
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-300">
            {insight.description}
          </p>
        </div>
      </div>
    </div>
  );
};

const OverallStatsSection = ({ stats }: { stats: CaptionPerformanceInsightsProps['overallStats'] }) => {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400">Generated</span>
              <BarChart3 className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.totalGenerated}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {stats.totalPublished} published
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400">Avg Engagement</span>
              <Heart className="h-4 w-4 text-pink-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {(stats.avgActualEngagement * 100).toFixed(1)}%
            </div>
            <Progress value={stats.avgActualEngagement * 100} className="h-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400">Prediction Accuracy</span>
              <Target className="h-4 w-4 text-purple-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {stats.avgPredictedAccuracy.toFixed(0)}%
            </div>
            <Progress value={stats.avgPredictedAccuracy} className="h-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400">Improvement Rate</span>
              <TrendingUp className="h-4 w-4 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">
              +{stats.improvementRate.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              vs last period
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-600 dark:text-gray-400">AI Learning</span>
              <Brain className="h-4 w-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
              Active
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              Improving predictions
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

// Helper function to calculate overall accuracy
function calculateAccuracy(
  predicted: CaptionPerformanceData['predictedMetrics'],
  actual: PerformanceMetrics
): number {
  const actualRates = {
    likeRate: actual.likes / actual.impressions,
    commentRate: actual.comments / actual.impressions,
    saveRate: actual.saves / actual.impressions,
    shareRate: actual.shares / actual.impressions
  };

  const accuracies = [
    1 - Math.abs(predicted.likeRate - actualRates.likeRate) / predicted.likeRate,
    1 - Math.abs(predicted.commentRate - actualRates.commentRate) / predicted.commentRate,
    1 - Math.abs(predicted.saveRate - actualRates.saveRate) / predicted.saveRate,
    1 - Math.abs(predicted.shareRate - actualRates.shareRate) / predicted.shareRate
  ];

  const avgAccuracy = accuracies.reduce((sum, acc) => sum + acc, 0) / accuracies.length;
  return Math.max(0, Math.min(100, avgAccuracy * 100));
}

export function CaptionPerformanceInsights({
  captions,
  learningInsights = [],
  accuracyTrend = [],
  overallStats
}: CaptionPerformanceInsightsProps) {
  // Separate captions with and without actual metrics
  const captionsWithMetrics = captions.filter(c => c.actualMetrics !== undefined);
  const captionsWithoutMetrics = captions.filter(c => c.actualMetrics === undefined);

  if (captions.length === 0) {
    return (
      <div className="text-center py-12 space-y-4">
        <Trophy className="h-12 w-12 mx-auto text-gray-400" />
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            No performance data yet
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            Generate and publish captions to start seeing performance insights and analytics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-blue-500" />
          Caption Performance Insights
        </h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Track how your AI-generated captions perform and see learning improvements over time
        </p>
      </div>

      {/* Overall Stats */}
      {overallStats && <OverallStatsSection stats={overallStats} />}

      {/* Tabs for different views */}
      <Tabs defaultValue="performance" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="insights" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            Insights ({learningInsights.length})
          </TabsTrigger>
          <TabsTrigger value="trends" className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Trends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-6 mt-6">
          {/* Captions with actual metrics */}
          {captionsWithMetrics.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Published Captions
                </h4>
                <Badge variant="secondary">
                  {captionsWithMetrics.length} tracked
                </Badge>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {captionsWithMetrics.map(caption => (
                  <PerformanceCard key={caption.captionId} caption={caption} />
                ))}
              </div>
            </div>
          )}

          {/* Captions without actual metrics */}
          {captionsWithoutMetrics.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Awaiting Performance Data
                </h4>
                <Badge variant="outline">
                  {captionsWithoutMetrics.length} pending
                </Badge>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {captionsWithoutMetrics.map(caption => (
                  <PerformanceCard key={caption.captionId} caption={caption} />
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="insights" className="space-y-4 mt-6">
          {learningInsights.length > 0 ? (
            <>
              <div className="space-y-1">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Learning Insights
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  The AI is continuously learning from your caption performance
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {learningInsights.map((insight, index) => (
                  <InsightCard key={index} insight={insight} />
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 space-y-4">
              <Sparkles className="h-12 w-12 mx-auto text-gray-400" />
              <div className="space-y-2">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  No insights yet
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                  Insights will appear as the AI learns from your caption performance patterns.
                </p>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="trends" className="space-y-4 mt-6">
          {accuracyTrend.length > 0 ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Prediction Accuracy Over Time
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Track how prediction accuracy improves as the AI learns
                </p>
              </div>
              
              {/* Simple trend visualization */}
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    {accuracyTrend.map((point, index) => (
                      <div key={index} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-600 dark:text-gray-400">
                            {new Date(point.date).toLocaleDateString()}
                          </span>
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {point.accuracy.toFixed(1)}%
                          </span>
                        </div>
                        <Progress value={point.accuracy} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-12 space-y-4">
              <TrendingUp className="h-12 w-12 mx-auto text-gray-400" />
              <div className="space-y-2">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  No trend data yet
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
                  Accuracy trends will appear as you publish more captions and track their performance.
                </p>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Info Footer */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-3">
          <Brain className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Continuous Learning
            </h4>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              The AI analyzes your caption performance to improve predictions over time. 
              The more captions you publish and track, the more accurate future predictions become.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CaptionPerformanceInsights;
