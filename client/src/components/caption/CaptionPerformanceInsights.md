# CaptionPerformanceInsights Component

## Overview

The `CaptionPerformanceInsights` component displays performance analytics and insights for AI-generated Instagram captions. It shows predicted vs. actual engagement metrics, learning insights from the AI system, and accuracy trends over time.

## Purpose

This component is part of the Authentic Instagram Caption Generation feature (Task 20.1) and serves to:

1. **Track Performance**: Display predicted vs actual engagement metrics for published captions
2. **Show Learning Progress**: Visualize how the AI's prediction accuracy improves over time
3. **Provide Insights**: Surface actionable insights about what caption styles and patterns work best
4. **Build Trust**: Demonstrate the AI is learning and improving from user feedback

## Features

### Three Main Views (Tabs)

1. **Performance Tab**
   - Published captions with actual metrics vs predictions
   - Pending captions awaiting performance data
   - Metric-by-metric comparison (likes, comments, saves, shares)
   - Accuracy percentage for each caption
   - Patterns and hooks used for each caption

2. **Insights Tab**
   - Learning insights from the AI system
   - Success stories (what's working well)
   - Improvement suggestions (what could be better)
   - Warnings about underperforming patterns
   - Impact level indicators (high/medium/low)

3. **Trends Tab**
   - Prediction accuracy over time
   - Visual progress tracking
   - Historical accuracy data

### Overall Statistics Dashboard

- Total captions generated
- Total captions published
- Average actual engagement rate
- Average prediction accuracy
- Improvement rate vs previous period

## Props Interface

```typescript
interface CaptionPerformanceInsightsProps {
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
```

### Data Types

```typescript
interface CaptionPerformanceData {
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

interface PerformanceMetrics {
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  impressions: number;
  engagementRate: number;
}

interface LearningInsight {
  type: 'success' | 'improvement' | 'warning' | 'info';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
}
```

## Usage

### Basic Usage

```tsx
import { CaptionPerformanceInsights } from '@/components/caption';

function MyPage() {
  const captions = [
    {
      captionId: 'cap-001',
      caption: 'My awesome caption...',
      predictedMetrics: {
        likeRate: 0.10,
        commentRate: 0.02,
        saveRate: 0.015,
        shareRate: 0.005,
        confidence: 0.85
      },
      actualMetrics: {
        likes: 1000,
        comments: 200,
        saves: 150,
        shares: 50,
        impressions: 10000,
        engagementRate: 0.14
      }
    }
  ];

  return <CaptionPerformanceInsights captions={captions} />;
}
```

### With All Props

```tsx
<CaptionPerformanceInsights
  captions={captionData}
  learningInsights={insights}
  accuracyTrend={accuracyHistory}
  overallStats={{
    totalGenerated: 100,
    totalPublished: 60,
    avgActualEngagement: 0.12,
    avgPredictedAccuracy: 85,
    improvementRate: 15
  }}
/>
```

### With Data Fetching

```tsx
function PerformanceInsightsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['caption-insights'],
    queryFn: () => fetch('/api/ai/caption-insights').then(r => r.json())
  });

  if (isLoading) return <LoadingSpinner />;

  return (
    <CaptionPerformanceInsights
      captions={data.captions}
      learningInsights={data.insights}
      accuracyTrend={data.accuracyTrend}
      overallStats={data.stats}
    />
  );
}
```

## Component Behavior

### Empty States

The component gracefully handles empty states:
- **No captions**: Shows message to generate and publish captions
- **No insights**: Shows message that insights will appear as AI learns
- **No trends**: Shows message that trends will appear over time

### Caption Separation

Captions are automatically separated into two groups:
1. **Published Captions**: Have `actualMetrics` defined
2. **Awaiting Performance Data**: No `actualMetrics` yet

### Accuracy Calculation

The component calculates prediction accuracy by:
1. Converting actual metrics to rates (value / impressions)
2. Comparing predicted rates to actual rates
3. Calculating percentage difference for each metric
4. Averaging all metric accuracies for overall score

### Visual Indicators

- **Trending Up/Down Icons**: Show if actual performance exceeded/missed predictions
- **Color Coding**: Green for positive variance, red for negative
- **Accuracy Meter**: Visual progress bar for accuracy percentage
- **Impact Badges**: Show importance level of insights

## Styling

The component uses:
- Tailwind CSS for styling
- Dark mode support via `dark:` variants
- Responsive grid layouts
- Card-based UI from shadcn/ui
- Lucide icons for visual elements

### Color Scheme

- **Success/Positive**: Green (`text-green-600`, `bg-green-50`)
- **Improvement**: Blue (`text-blue-600`, `bg-blue-50`)
- **Warning**: Yellow (`text-yellow-600`, `bg-yellow-50`)
- **Info**: Purple (`text-purple-600`, `bg-purple-50`)
- **Error/Negative**: Red (`text-red-600`, `bg-red-50`)

## Accessibility

- Semantic HTML structure
- Clear labels and descriptions
- Color + icon combinations (not relying on color alone)
- Keyboard navigation support via tabs
- ARIA labels for screen readers

## Integration Points

### Backend API Endpoints

The component expects data from:
- `POST /api/ai/record-performance` - Submit actual metrics
- `GET /api/ai/caption-insights/:captionId` - Get performance comparison (planned)
- Generated caption tracking system

### Related Components

Works with:
- `CaptionVariationSelector` - Generates captions with predictions
- Performance tracking system (backend)
- Analytics dashboard

## Requirements Satisfied

This component satisfies the following requirements from the spec:

- **Requirement 9.2**: Display predicted engagement metrics (like rate, comment rate, save rate, share rate)
- **Requirement 9.3**: Show engagement predictions for each caption variation
- **Requirement 9.5**: Track actual performance of published captions
- **Requirement 10.3**: Correlate caption characteristics with actual engagement performance
- **Requirement 10.5**: Identify successful patterns from published content

## Examples

See `CaptionPerformanceInsights.example.tsx` for:
- Full component with all data
- Published captions only
- Pending captions only
- Empty state
- Single caption view
- Data fetching integration

## Testing

Unit tests are provided in `CaptionPerformanceInsights.test.ts` covering:
- Type definitions
- Props validation
- Data structure validation
- Accuracy calculation logic
- Edge cases
- Overall stats validation

Run tests with:
```bash
npm test -- CaptionPerformanceInsights.test.ts --run
```

## Future Enhancements

Potential improvements:
1. Interactive charts for trend visualization
2. Export insights to PDF/CSV
3. Comparison between different time periods
4. Filter by style type, patterns, or hooks
5. Deep-dive into individual metric trends
6. A/B testing capabilities
7. Recommendations engine

## Notes

- All rates are stored as decimals (0-1) but displayed as percentages
- Impressions are required to calculate actual rates
- Zero impressions are handled safely (avoids division by zero)
- Component is fully responsive (mobile, tablet, desktop)
- Dark mode is fully supported
