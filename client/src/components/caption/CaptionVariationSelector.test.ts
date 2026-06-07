import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CaptionVariationSelector, CaptionVariation } from './CaptionVariationSelector';

describe('CaptionVariationSelector', () => {
  const mockVariations: CaptionVariation[] = [
    {
      caption: 'Test caption 1 with viral hook',
      authenticityScore: 85,
      engagementPrediction: {
        likeRate: 0.05,
        commentRate: 0.02,
        saveRate: 0.03,
        shareRate: 0.01,
        confidence: 0.8
      },
      styleCharacteristics: {
        type: 'viral',
        description: 'High engagement viral pattern',
        patterns: ['POV Hook'],
        hooks: ['POV:']
      }
    },
    {
      caption: 'Test caption 2 with authentic storytelling',
      authenticityScore: 92,
      engagementPrediction: {
        likeRate: 0.04,
        commentRate: 0.03,
        confidence: 0.85
      },
      styleCharacteristics: {
        type: 'authentic',
        description: 'Personal storytelling approach',
        patterns: ['Story-Insight']
      }
    },
    {
      caption: 'Test caption 3 with balanced approach',
      authenticityScore: 88,
      engagementPrediction: {
        likeRate: 0.045,
        commentRate: 0.025,
        confidence: 0.82
      },
      styleCharacteristics: {
        type: 'balanced',
        description: 'Proven formula with authentic voice'
      }
    }
  ];

  it('renders all variations correctly', () => {
    render(
      <CaptionVariationSelector
        variations={mockVariations}
        onSelectVariation={vi.fn()}
        onRegenerateAll={vi.fn()}
      />
    );

    expect(screen.getByText('Test caption 1 with viral hook')).toBeInTheDocument();
    expect(screen.getByText('Test caption 2 with authentic storytelling')).toBeInTheDocument();
    expect(screen.getByText('Test caption 3 with balanced approach')).toBeInTheDocument();
  });

  it('displays authenticity scores', () => {
    render(
      <CaptionVariationSelector
        variations={mockVariations}
        onSelectVariation={vi.fn()}
        onRegenerateAll={vi.fn()}
      />
    );

    expect(screen.getByText('85/100')).toBeInTheDocument();
    expect(screen.getByText('92/100')).toBeInTheDocument();
    expect(screen.getByText('88/100')).toBeInTheDocument();
  });

  it('displays style badges', () => {
    render(
      <CaptionVariationSelector
        variations={mockVariations}
        onSelectVariation={vi.fn()}
        onRegenerateAll={vi.fn()}
      />
    );

    expect(screen.getByText('Viral')).toBeInTheDocument();
    expect(screen.getByText('Authentic')).toBeInTheDocument();
    expect(screen.getByText('Balanced')).toBeInTheDocument();
  });

  it('calls onSelectVariation when a variation is selected', () => {
    const handleSelect = vi.fn();
    render(
      <CaptionVariationSelector
        variations={mockVariations}
        onSelectVariation={handleSelect}
        onRegenerateAll={vi.fn()}
      />
    );

    const selectButtons = screen.getAllByText('Use This Caption');
    fireEvent.click(selectButtons[0]);

    expect(handleSelect).toHaveBeenCalledWith(0, mockVariations[0]);
  });

  it('calls onRegenerateAll when regenerate button is clicked', () => {
    const handleRegenerate = vi.fn();
    render(
      <CaptionVariationSelector
        variations={mockVariations}
        onSelectVariation={vi.fn()}
        onRegenerateAll={handleRegenerate}
      />
    );

    const regenerateButton = screen.getByText('Regenerate All');
    fireEvent.click(regenerateButton);

    expect(handleRegenerate).toHaveBeenCalled();
  });

  it('shows loading state', () => {
    render(
      <CaptionVariationSelector
        variations={[]}
        onSelectVariation={vi.fn()}
        onRegenerateAll={vi.fn()}
        isLoading={true}
      />
    );

    expect(screen.getByText('Generating authentic caption variations...')).toBeInTheDocument();
  });

  it('shows empty state when no variations', () => {
    render(
      <CaptionVariationSelector
        variations={[]}
        onSelectVariation={vi.fn()}
        onRegenerateAll={vi.fn()}
        isLoading={false}
      />
    );

    expect(screen.getByText('No variations yet')).toBeInTheDocument();
  });

  it('highlights selected variation', () => {
    const { container } = render(
      <CaptionVariationSelector
        variations={mockVariations}
        onSelectVariation={vi.fn()}
        onRegenerateAll={vi.fn()}
        selectedIndex={1}
      />
    );

    // Check that "Selected" button appears for the selected variation
    const selectedButton = screen.getByText('Selected');
    expect(selectedButton).toBeInTheDocument();
  });

  it('displays engagement predictions', () => {
    render(
      <CaptionVariationSelector
        variations={mockVariations}
        onSelectVariation={vi.fn()}
        onRegenerateAll={vi.fn()}
      />
    );

    // Check for like rate display (converted to percentage)
    expect(screen.getByText('5.0%')).toBeInTheDocument(); // 0.05 * 100
    expect(screen.getByText('2.0%')).toBeInTheDocument(); // 0.02 * 100
  });

  it('displays confidence levels', () => {
    render(
      <CaptionVariationSelector
        variations={mockVariations}
        onSelectVariation={vi.fn()}
        onRegenerateAll={vi.fn()}
      />
    );

    expect(screen.getByText('80% confidence')).toBeInTheDocument();
    expect(screen.getByText('85% confidence')).toBeInTheDocument();
    expect(screen.getByText('82% confidence')).toBeInTheDocument();
  });

  it('displays viral patterns when available', () => {
    render(
      <CaptionVariationSelector
        variations={mockVariations}
        onSelectVariation={vi.fn()}
        onRegenerateAll={vi.fn()}
      />
    );

    expect(screen.getByText('POV Hook')).toBeInTheDocument();
    expect(screen.getByText('Story-Insight')).toBeInTheDocument();
  });

  it('displays viral hooks when available', () => {
    render(
      <CaptionVariationSelector
        variations={mockVariations}
        onSelectVariation={vi.fn()}
        onRegenerateAll={vi.fn()}
      />
    );

    expect(screen.getByText('POV:')).toBeInTheDocument();
  });

  it('disables regenerate button when loading', () => {
    render(
      <CaptionVariationSelector
        variations={mockVariations}
        onSelectVariation={vi.fn()}
        onRegenerateAll={vi.fn()}
        isLoading={true}
      />
    );

    // When loading, it should show the loading state instead of variations
    expect(screen.queryByText('Regenerate All')).not.toBeInTheDocument();
  });

  it('handles variations without optional fields', () => {
    const minimalVariations: CaptionVariation[] = [
      {
        caption: 'Minimal caption',
        authenticityScore: 80,
        engagementPrediction: {},
        styleCharacteristics: {
          type: 'viral',
          description: 'Simple variation'
        }
      }
    ];

    render(
      <CaptionVariationSelector
        variations={minimalVariations}
        onSelectVariation={vi.fn()}
        onRegenerateAll={vi.fn()}
      />
    );

    expect(screen.getByText('Minimal caption')).toBeInTheDocument();
    expect(screen.getByText('80/100')).toBeInTheDocument();
  });
});
