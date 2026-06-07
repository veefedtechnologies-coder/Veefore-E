# Caption Variation Selector Component

## Overview

The `CaptionVariationSelector` component displays multiple AI-generated caption variations with authenticity scores and engagement predictions. Users can compare different styles (viral, authentic, balanced) and select their preferred caption.

## Features

- **Multiple Variations Display**: Shows 3 caption variations side-by-side in a responsive grid
- **Authenticity Scoring**: Visual meter showing how human-like each caption sounds (0-100 scale)
- **Engagement Predictions**: Displays predicted like rate, comment rate, save rate, and share rate
- **Style Characteristics**: Shows the type (viral/authentic/balanced) with visual badges
- **Pattern & Hook Display**: Shows which viral patterns and hooks were used
- **Selection State**: Visual feedback for selected variation
- **Regenerate Function**: Button to generate new variations
- **Loading State**: Animated loading indicator during generation
- **Empty State**: Helpful placeholder when no variations exist

## Props

```typescript
interface CaptionVariationSelectorProps {
  // Array of caption variations to display
  variations: CaptionVariation[];
  
  // Callback when user selects a variation
  onSelectVariation: (index: number, variation: CaptionVariation) => void;
  
  // Callback when user clicks "Regenerate All"
  onRegenerateAll: () => void;
  
  // Loading state during generation
  isLoading?: boolean;
  
  // Currently selected variation index
  selectedIndex?: number;
}

interface CaptionVariation {
  // The generated caption text
  caption: string;
  
  // Optional hashtags array
  hashtags?: string[];
  
  // Authenticity score (0-100)
  authenticityScore: number;
  
  // Engagement predictions
  engagementPrediction: {
    likeRate?: number;      // 0-1 decimal
    commentRate?: number;   // 0-1 decimal
    saveRate?: number;      // 0-1 decimal
    shareRate?: number;     // 0-1 decimal
    confidence?: number;    // 0-1 decimal
  };
  
  // Style information
  styleCharacteristics: {
    type: 'viral' | 'authentic' | 'balanced';
    description: string;
    patterns?: string[];    // Viral patterns used
    hooks?: string[];       // Hooks used
  };
}
```

## Usage Example

### Basic Usage

```tsx
import { CaptionVariationSelector, CaptionVariation } from '@/components/caption';

function CaptionGenerator() {
  const [variations, setVariations] = useState<CaptionVariation[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>();
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectVariation = (index: number, variation: CaptionVariation) => {
    setSelectedIndex(index);
    // Apply the selected caption to your form
    console.log('Selected caption:', variation.caption);
  };

  const handleRegenerate = async () => {
    setIsLoading(true);
    try {
      // Call your API to generate new variations
      const response = await apiRequest('/api/ai/generate-captions', {
        method: 'POST',
        body: JSON.stringify({ /* your params */ })
      });
      setVariations(response.variations);
    } catch (error) {
      console.error('Failed to generate variations:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <CaptionVariationSelector
      variations={variations}
      onSelectVariation={handleSelectVariation}
      onRegenerateAll={handleRegenerate}
      isLoading={isLoading}
      selectedIndex={selectedIndex}
    />
  );
}
```

### Integration with Create Post Form

```tsx
import { CaptionVariationSelector } from '@/components/caption';

function CreatePost() {
  const [postContent, setPostContent] = useState('');
  const [variations, setVariations] = useState([]);
  const [selectedVariationIndex, setSelectedVariationIndex] = useState<number>();

  const handleGenerateAI = async () => {
    // Generate variations from API
    const response = await apiRequest('/api/v1/ai/generate-content', {
      method: 'POST',
      body: JSON.stringify({
        postType: 'post',
        platform: 'instagram',
        workspaceId: currentWorkspace.id,
        mediaUrl: uploadedUrls[0],
        existingCaption: postContent
      })
    });

    if (response.success && response.variations) {
      setVariations(response.variations);
    }
  };

  const handleSelectVariation = (index: number, variation: CaptionVariation) => {
    setSelectedVariationIndex(index);
    // Apply the selected caption to the post content
    setPostContent(variation.caption);
    
    // Optionally apply hashtags
    if (variation.hashtags) {
      setHashtags(prev => [...prev, ...variation.hashtags]);
    }
  };

  return (
    <div>
      {/* Your existing post form */}
      <textarea value={postContent} onChange={(e) => setPostContent(e.target.value)} />
      
      <Button onClick={handleGenerateAI}>
        Generate AI Captions
      </Button>

      {/* Caption variation selector */}
      {variations.length > 0 && (
        <CaptionVariationSelector
          variations={variations}
          onSelectVariation={handleSelectVariation}
          onRegenerateAll={handleGenerateAI}
          selectedIndex={selectedVariationIndex}
        />
      )}
    </div>
  );
}
```

## Visual States

### Authenticity Score Colors
- **90-100**: Green (Excellent, very human-like)
- **80-89**: Blue (Good, passes threshold)
- **70-79**: Yellow (Fair, needs improvement)
- **0-69**: Red (Poor, sounds AI-generated)

### Style Badge Colors
- **Viral**: Purple - Maximum engagement, trending patterns
- **Authentic**: Blue - Voice-first, personal storytelling
- **Balanced**: Green - Proven formula + unique voice

## Accessibility

- All interactive elements are keyboard accessible
- Color-coded information also includes text labels
- Hover states for better user feedback
- ARIA labels for screen readers (can be enhanced further)

## Responsive Design

- **Desktop (lg+)**: 3-column grid
- **Tablet/Mobile**: Single column stacked layout
- Touch-friendly button sizes
- Scrollable caption preview for long content

## Design System

The component uses the existing UI component library:
- `Card`, `CardHeader`, `CardTitle`, etc. from `@/components/ui/card`
- `Button` from `@/components/ui/button`
- `Badge` from `@/components/ui/badge`
- Tailwind CSS for styling with dark mode support
- Lucide React icons for consistent iconography

## Future Enhancements

Potential improvements that could be added:
1. Side-by-side comparison view
2. Hashtag preview and selection per variation
3. Copy-to-clipboard functionality
4. Variation favoriting/saving
5. Performance tracking after selection
6. A/B testing suggestions
7. Voice profile match indicator
8. Niche trend indicators

## Related Components

- `VoiceProfileSetup` - Set up user voice profile
- `VoiceProfileViewer` - View voice characteristics
- `CaptionEditorWithTracking` (planned) - Edit with learning
- `CaptionPerformanceInsights` (planned) - Track performance

## Testing

To test this component:

```tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { CaptionVariationSelector } from './CaptionVariationSelector';

const mockVariations = [
  {
    caption: 'Test caption 1',
    authenticityScore: 85,
    engagementPrediction: { likeRate: 0.05, commentRate: 0.02 },
    styleCharacteristics: {
      type: 'viral',
      description: 'High engagement viral pattern'
    }
  }
];

test('renders variations correctly', () => {
  render(
    <CaptionVariationSelector
      variations={mockVariations}
      onSelectVariation={jest.fn()}
      onRegenerateAll={jest.fn()}
    />
  );
  
  expect(screen.getByText('Test caption 1')).toBeInTheDocument();
  expect(screen.getByText('85/100')).toBeInTheDocument();
});
```

## Spec Requirements Validation

This component implements Task 19.1 from the spec:

✅ **Display 3 caption variations** - Grid layout with responsive design  
✅ **Show authenticity score** - Visual meter with color coding  
✅ **Show engagement prediction** - All 4 metrics displayed  
✅ **Display style characteristics** - Badge with icon and description  
✅ **Select button** - Interactive selection with visual feedback  
✅ **Regenerate all button** - Top-right placement with loading state  

Maps to Requirements:
- Requirement 8.1, 8.2, 8.3: Multi-variation generation and selection
- Requirement 4.2: Authenticity scoring display
- Requirement 9.2, 9.3: Engagement prediction display
