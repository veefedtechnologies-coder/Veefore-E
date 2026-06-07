# CaptionVariationComparison Component

## Overview

The `CaptionVariationComparison` component provides a side-by-side comparison view for analyzing multiple caption variations. It helps users understand differences, evaluate patterns, and make informed decisions about which variation to use.

## Features

### Core Functionality
- **Side-by-Side Layout**: Display 1-3 variations in a responsive grid
- **Difference Highlighting**: Automatically highlight unique words in each variation
- **Pattern & Hook Display**: Show which viral patterns and hooks each variation uses
- **Copy-to-Clipboard**: Quick copy functionality for captions and hashtags
- **Engagement Comparison**: Visual comparison of predicted engagement metrics
- **Mobile Responsive**: Adapts to all screen sizes

### Visual Indicators
- **Style Badges**: Color-coded badges for viral/authentic/balanced types
- **Authenticity Scores**: Clear display of authenticity ratings
- **Metric Highlights**: Green highlighting for highest predicted metrics
- **Confidence Scores**: Prediction confidence displayed for transparency

## Usage

### Basic Example

```tsx
import { CaptionVariationComparison } from '@/components/caption';

function MyComponent() {
  const variations = [
    // ... caption variations data
  ];

  return (
    <CaptionVariationComparison
      variations={variations}
      selectedIndices={[0, 1, 2]}
    />
  );
}
```

### With Close Handler

```tsx
import { CaptionVariationComparison } from '@/components/caption';

function MyComponent() {
  const [showComparison, setShowComparison] = useState(false);
  
  return (
    <>
      <Button onClick={() => setShowComparison(true)}>
        Compare Variations
      </Button>
      
      {showComparison && (
        <CaptionVariationComparison
          variations={variations}
          selectedIndices={[0, 1, 2]}
          onClose={() => setShowComparison(false)}
        />
      )}
    </>
  );
}
```

### Comparing Specific Variations

```tsx
// Compare only variations at index 0 and 2
<CaptionVariationComparison
  variations={variations}
  selectedIndices={[0, 2]}
  maxVariations={2}
/>
```

## Props

### CaptionVariationComparisonProps

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `variations` | `CaptionVariation[]` | Yes | - | Array of caption variations to compare |
| `selectedIndices` | `number[]` | No | `[0, 1, 2]` | Indices of variations to display |
| `onClose` | `() => void` | No | - | Callback when close button is clicked |
| `maxVariations` | `number` | No | `3` | Maximum number of variations to display |

### CaptionVariation Type

```typescript
interface CaptionVariation {
  caption: string;
  hashtags?: string[];
  authenticityScore: number;
  engagementPrediction: {
    likeRate?: number;
    commentRate?: number;
    saveRate?: number;
    shareRate?: number;
    confidence?: number;
  };
  styleCharacteristics: {
    type: 'viral' | 'authentic' | 'balanced';
    description: string;
    patterns?: string[];
    hooks?: string[];
  };
}
```

## Component Sections

### Header Section
- Title and description
- Close button (if `onClose` provided)

### Variation Cards
Each variation displays:
- Style badge and variation number
- Style description
- Authenticity score
- Caption text with difference highlighting
- Hashtags with copy button
- Patterns used
- Viral hooks used

### Engagement Metrics Comparison
When comparing 2+ variations:
- Side-by-side metric comparison
- Green highlighting for highest values
- Like rate, comment rate, save rate, share rate
- Prediction confidence scores

### Tips Banner
Educational content about:
- How to interpret highlighted differences
- What green metrics indicate
- How to use copy buttons
- Best practices for choosing variations

## Features Detail

### Difference Highlighting

The component automatically identifies unique words in each caption and highlights them with a yellow background. This helps users quickly spot what makes each variation distinct.

**Algorithm**:
1. Split each caption into words
2. Compare against words from other captions
3. Highlight words that don't appear in any other variation

### Copy to Clipboard

Each caption and hashtag set has a dedicated copy button:
- Click to copy text to clipboard
- Visual feedback with checkmark
- Returns to copy icon after 2 seconds

### Metric Comparison

Engagement metrics are displayed side-by-side:
- Each metric shows percentage values
- Highest value highlighted in green
- Helps identify which variation is predicted to perform best

### Responsive Layout

- **Mobile**: Single column, stacked cards
- **Tablet**: Two columns for 2 variations
- **Desktop**: Three columns for 3 variations

## Styling

The component uses:
- Tailwind CSS utility classes
- Dark mode support with `dark:` variants
- Color-coded badges for variation types:
  - **Viral**: Purple
  - **Authentic**: Blue
  - **Balanced**: Green

## Integration with CaptionVariationSelector

The comparison view is integrated into `CaptionVariationSelector`:

```tsx
import { CaptionVariationSelector } from '@/components/caption';

function MyComponent() {
  return (
    <CaptionVariationSelector
      variations={variations}
      onSelectVariation={handleSelect}
      onRegenerateAll={handleRegenerate}
    />
  );
}
```

Users can click the "Compare" button to toggle between:
- Grid view (default)
- Comparison view

## Accessibility

- Semantic HTML structure
- ARIA labels for icons
- Keyboard navigation support
- High contrast color choices
- Screen reader friendly

## Performance Considerations

- Lightweight word comparison algorithm
- Efficient state management
- No heavy computations
- Memoization opportunities for large variation sets

## Future Enhancements

Potential improvements:
- More sophisticated diff algorithm (Myers, word-diff)
- Adjustable comparison criteria
- Export comparison as image/PDF
- Side-by-side preview with Instagram mockup
- A/B testing recommendations
- Historical comparison with past captions

## Related Components

- `CaptionVariationSelector`: Main variation selection interface
- `CaptionEditorWithTracking`: Caption editing with tracking
- `CaptionPerformanceInsights`: Performance analysis after publishing

## Testing

Run tests with:
```bash
npm test CaptionVariationComparison.test.ts
```

Test coverage includes:
- Empty variation handling
- Filtering by selected indices
- Unique word identification
- Metric calculations
- Edge cases (missing hashtags, patterns, hooks)

## Examples

See `CaptionVariationComparison.example.tsx` for:
- Comparing all variations
- Comparing two variations
- With close handler
- Integration examples

## Support

For issues or questions:
1. Check the example file
2. Review the test file for expected behavior
3. Refer to the main README in `/components/caption/`
