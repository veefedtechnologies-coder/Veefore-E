import React from 'react';
import { CaptionPerformanceInsights } from './CaptionPerformanceInsights';
import type { CaptionPerformanceData, LearningInsight } from './CaptionPerformanceInsights';

/**
 * Example usage of the CaptionPerformanceInsights component
 * 
 * This component displays performance insights and analytics for generated captions,
 * showing predicted vs actual metrics, learning insights, and accuracy trends.
 */

// Sample caption data with actual performance metrics
const sampleCaptionsWithMetrics: CaptionPerformanceData[] = [
  {
    captionId: 'caption-001',
    caption: '🔥 Hot take: The best content strategy is the one you actually stick to. Stop overthinking, start creating. What\'s holding you back? 👇',
    predictedMetrics: {
      likeRate: 0.08,
      commentRate: 0.015,
      saveRate: 0.012,
      shareRate: 0.003,
      confidence: 0.85
    },
    actualMetrics: {
      likes: 950,
      comments: 180,
      saves: 145,
      shares: 35,
      impressions: 10000,
      engagementRate: 0.131
    },
    publishedAt: new Date('2024-01-15'),
    performanceRecordedAt: new Date('2024-01-16'),
    patternsUsed: ['story-insight-question', 'emotional-hook'],
    hooksUsed: ['hot-take'],
    styleType: 'viral'
  },
  {
    captionId: 'caption-002',
    caption: 'Let me be real with you for a second... I used to think I needed to post every day to grow. Turns out, quality > quantity every single time. Here\'s what actually works:',
    predictedMetrics: {
      likeRate: 0.10,
      commentRate: 0.020,
      saveRate: 0.015,
      shareRate: 0.005,
      confidence: 0.88
    },
    actualMetrics: {
      likes: 1200,
      comments: 240,
      saves: 180,
      shares: 60,
      impressions: 12000,
      engagementRate: 0.140
    },
    publishedAt: new Date('2024-01-18'),
    performanceRecordedAt: new Date('2024-01-19'),
    patternsUsed: ['authentic-storytelling', 'value-proposition'],
    hooksUsed: ['let-me-be-real'],
    styleType: 'authentic'
  },
  {
    captionId: 'caption-003',
    caption: 'POV: You finally figured out the algorithm 🎯 Three simple rules that changed everything for me. Swipe to see them all →',
    predictedMetrics: {
      likeRate: 0.095,
      commentRate: 0.018,
      saveRate: 0.013,
      shareRate: 0.004,
      confidence: 0.82
    },
    actualMetrics: {
      likes: 850,
      comments: 160,
      saves: 120,
      shares: 30,
      impressions: 9000,
      engagementRate: 0.129
    },
    publishedAt: new Date('2024-01-20'),
    performanceRecordedAt: new Date('2024-01-21'),
    patternsUsed: ['listicle-teaser', 'call-to-action'],
    hooksUsed: ['pov'],
    styleType: 'balanced'
  }
];

// Sample caption data without actual metrics (pending)
const sampleCaptionsPending: CaptionPerformanceData[] = [
  {
    captionId: 'caption-004',
    caption: 'Unpopular opinion: You don\'t need more followers, you need more engaged followers. Here\'s the difference and why it matters 💡',
    predictedMetrics: {
      likeRate: 0.09,
      commentRate: 0.017,
      saveRate: 0.014,
      shareRate: 0.004,
      confidence: 0.86
    },
    publishedAt: new Date('2024-01-22'),
    patternsUsed: ['opinion-piece', 'educational'],
    hooksUsed: ['unpopular-opinion'],
    styleType: 'balanced'
  },
  {
    captionId: 'caption-005',
    caption: 'The content that got me 10k followers in 90 days wasn\'t what I expected. Thread 🧵',
    predictedMetrics: {
      likeRate: 0.12,
      commentRate: 0.022,
      saveRate: 0.018,
      shareRate: 0.006,
      confidence: 0.90
    },
    publishedAt: new Date('2024-01-23'),
    patternsUsed: ['results-storytelling', 'thread-teaser'],
    hooksUsed: ['results-hook'],
    styleType: 'viral'
  }
];

// Sample learning insights
const sampleInsights: LearningInsight[] = [
  {
    type: 'success',
    title: 'Viral hooks performing exceptionally well',
    description: 'Captions using "Hot take:" and "POV:" hooks are achieving 35% higher engagement than predicted. The AI is adjusting to favor these patterns in future generations.',
    impact: 'high'
  },
  {
    type: 'improvement',
    title: 'Authentic style building stronger connections',
    description: 'Your authentic storytelling captions have a 28% higher save rate than viral-style captions. Consider using more personal narratives for long-term audience building.',
    impact: 'high'
  },
  {
    type: 'info',
    title: 'Prediction accuracy improving',
    description: 'Your caption prediction accuracy has improved from 78% to 89% over the last 30 days as the AI learns from your unique audience preferences.',
    impact: 'medium'
  },
  {
    type: 'warning',
    title: 'Balanced captions underperforming slightly',
    description: 'Balanced-style captions are performing 8% below predictions. This may indicate your audience prefers more distinct, personality-driven content.',
    impact: 'low'
  }
];

// Sample accuracy trend data
const sampleAccuracyTrend = [
  { date: '2024-01-01', accuracy: 75 },
  { date: '2024-01-05', accuracy: 78 },
  { date: '2024-01-10', accuracy: 81 },
  { date: '2024-01-15', accuracy: 85 },
  { date: '2024-01-20', accuracy: 87 },
  { date: '2024-01-23', accuracy: 89 }
];

// Sample overall stats
const sampleOverallStats = {
  totalGenerated: 125,
  totalPublished: 78,
  avgActualEngagement: 0.135,
  avgPredictedAccuracy: 89,
  improvementRate: 18.5
};

/**
 * Example 1: Full component with all data
 */
export function CaptionPerformanceInsightsFullExample() {
  return (
    <div className="max-w-7xl mx-auto p-6">
      <CaptionPerformanceInsights
        captions={[...sampleCaptionsWithMetrics, ...sampleCaptionsPending]}
        learningInsights={sampleInsights}
        accuracyTrend={sampleAccuracyTrend}
        overallStats={sampleOverallStats}
      />
    </div>
  );
}

/**
 * Example 2: Only published captions with metrics
 */
export function CaptionPerformanceInsightsPublishedOnly() {
  return (
    <div className="max-w-7xl mx-auto p-6">
      <CaptionPerformanceInsights
        captions={sampleCaptionsWithMetrics}
        learningInsights={sampleInsights.slice(0, 2)}
        overallStats={sampleOverallStats}
      />
    </div>
  );
}

/**
 * Example 3: Minimal data (pending captions only)
 */
export function CaptionPerformanceInsightsPendingOnly() {
  return (
    <div className="max-w-7xl mx-auto p-6">
      <CaptionPerformanceInsights
        captions={sampleCaptionsPending}
      />
    </div>
  );
}

/**
 * Example 4: Empty state
 */
export function CaptionPerformanceInsightsEmpty() {
  return (
    <div className="max-w-7xl mx-auto p-6">
      <CaptionPerformanceInsights
        captions={[]}
      />
    </div>
  );
}

/**
 * Example 5: Single caption detailed view
 */
export function CaptionPerformanceInsightsSingle() {
  return (
    <div className="max-w-7xl mx-auto p-6">
      <CaptionPerformanceInsights
        captions={[sampleCaptionsWithMetrics[0]]}
        learningInsights={[sampleInsights[0]]}
        accuracyTrend={sampleAccuracyTrend}
      />
    </div>
  );
}

/**
 * Example 6: Integration with data fetching
 */
export function CaptionPerformanceInsightsWithFetching() {
  const [captions, setCaptions] = React.useState<CaptionPerformanceData[]>([]);
  const [insights, setInsights] = React.useState<LearningInsight[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    // Simulate API fetch
    const fetchData = async () => {
      setIsLoading(true);
      try {
        // In real implementation, fetch from API:
        // const response = await fetch('/api/ai/caption-insights');
        // const data = await response.json();
        
        // Simulated delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        setCaptions([...sampleCaptionsWithMetrics, ...sampleCaptionsPending]);
        setInsights(sampleInsights);
      } catch (error) {
        console.error('Failed to fetch insights:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <div className="flex items-center justify-center py-12">
          <div className="text-center space-y-4">
            <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
            <p className="text-sm text-gray-600">Loading performance insights...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <CaptionPerformanceInsights
        captions={captions}
        learningInsights={insights}
        accuracyTrend={sampleAccuracyTrend}
        overallStats={sampleOverallStats}
      />
    </div>
  );
}

/**
 * Usage notes:
 * 
 * 1. The component requires at minimum a `captions` array
 * 2. Other props (learningInsights, accuracyTrend, overallStats) are optional
 * 3. Captions can have actualMetrics or not (for pending performance data)
 * 4. The component will automatically separate captions into "Published" and "Awaiting Performance Data"
 * 5. Empty states are handled gracefully
 * 6. All metrics are displayed as rates (0-1 scale, displayed as percentages)
 * 7. Accuracy is calculated by comparing predicted vs actual rates
 * 8. The component uses tabs to organize different views (Performance, Insights, Trends)
 */

export default CaptionPerformanceInsightsFullExample;
