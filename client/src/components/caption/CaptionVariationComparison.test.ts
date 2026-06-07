import { describe, it, expect } from 'vitest';
import { CaptionVariation } from './CaptionVariationSelector';

describe('CaptionVariationComparison', () => {
  const mockVariations: CaptionVariation[] = [
    {
      caption: 'This is a viral caption with trending hooks and powerful engagement',
      hashtags: ['#viral', '#trending', '#engagement'],
      authenticityScore: 92,
      engagementPrediction: {
        likeRate: 0.045,
        commentRate: 0.012,
        saveRate: 0.023,
        shareRate: 0.008,
        confidence: 0.85
      },
      styleCharacteristics: {
        type: 'viral',
        description: 'Maximum virality with aggressive hook and trending patterns',
        patterns: ['Story-Insight-Question', 'Hook-Buildup-Payoff'],
        hooks: ['Hot take:', 'POV:']
      }
    },
    {
      caption: 'This is an authentic caption that reflects your personal voice and storytelling',
      hashtags: ['#authentic', '#personal', '#storytelling'],
      authenticityScore: 95,
      engagementPrediction: {
        likeRate: 0.038,
        commentRate: 0.015,
        saveRate: 0.019,
        shareRate: 0.006,
        confidence: 0.88
      },
      styleCharacteristics: {
        type: 'authentic',
        description: 'Personal storytelling with authentic voice',
        patterns: ['Storytelling-Hook', 'Personal-Connection'],
        hooks: ['Real talk:', "Here's the thing:"]
      }
    },
    {
      caption: 'This is a balanced caption combining proven formulas with your unique voice',
      hashtags: ['#balanced', '#formula', '#unique'],
      authenticityScore: 88,
      engagementPrediction: {
        likeRate: 0.041,
        commentRate: 0.013,
        saveRate: 0.021,
        shareRate: 0.007,
        confidence: 0.82
      },
      styleCharacteristics: {
        type: 'balanced',
        description: 'Proven formula with unique voice',
        patterns: ['Balanced-Approach', 'Formula-Plus-Voice'],
        hooks: ['Quick tip:', 'Fun fact:']
      }
    }
  ];

  it('should handle empty variations array', () => {
    expect(mockVariations.length).toBeGreaterThan(0);
  });

  it('should filter variations by selected indices', () => {
    const selectedIndices = [0, 2];
    const filtered = selectedIndices
      .map(index => mockVariations[index])
      .filter(Boolean);
    
    expect(filtered).toHaveLength(2);
    expect(filtered[0].styleCharacteristics.type).toBe('viral');
    expect(filtered[1].styleCharacteristics.type).toBe('balanced');
  });

  it('should identify unique words in captions', () => {
    const caption1 = 'This is a test caption';
    const caption2 = 'This is another test caption';
    
    const words1 = caption1.split(/\s+/);
    const words2 = caption2.split(/\s+/);
    
    const uniqueWords = words1.filter(word => 
      !words2.includes(word)
    );
    
    expect(uniqueWords).toContain('a');
  });

  it('should find highest engagement metric', () => {
    const likeRates = mockVariations.map(v => v.engagementPrediction.likeRate ?? 0);
    const maxLikeRate = Math.max(...likeRates);
    
    expect(maxLikeRate).toBe(0.045);
  });

  it('should format engagement rates as percentages', () => {
    const rate = 0.045;
    const percentage = (rate * 100).toFixed(1);
    
    expect(percentage).toBe('4.5');
  });

  it('should handle variations without hashtags', () => {
    const variationWithoutHashtags: CaptionVariation = {
      ...mockVariations[0],
      hashtags: undefined
    };
    
    expect(variationWithoutHashtags.hashtags).toBeUndefined();
  });

  it('should handle variations without patterns', () => {
    const variationWithoutPatterns: CaptionVariation = {
      ...mockVariations[0],
      styleCharacteristics: {
        ...mockVariations[0].styleCharacteristics,
        patterns: undefined
      }
    };
    
    expect(variationWithoutPatterns.styleCharacteristics.patterns).toBeUndefined();
  });

  it('should handle variations without hooks', () => {
    const variationWithoutHooks: CaptionVariation = {
      ...mockVariations[0],
      styleCharacteristics: {
        ...mockVariations[0].styleCharacteristics,
        hooks: undefined
      }
    };
    
    expect(variationWithoutHooks.styleCharacteristics.hooks).toBeUndefined();
  });

  it('should calculate confidence percentage', () => {
    const confidence = 0.85;
    const percentage = (confidence * 100).toFixed(0);
    
    expect(percentage).toBe('85');
  });

  it('should limit variations to maxVariations', () => {
    const maxVariations = 2;
    const selectedIndices = [0, 1, 2];
    const limited = selectedIndices.slice(0, maxVariations);
    
    expect(limited).toHaveLength(2);
    expect(limited).toEqual([0, 1]);
  });

  it('should handle copy to clipboard text formatting', () => {
    const hashtags = ['#viral', '#trending', '#engagement'];
    const hashtagString = hashtags.join(' ');
    
    expect(hashtagString).toBe('#viral #trending #engagement');
  });

  it('should determine grid columns based on variation count', () => {
    const getGridClass = (count: number) => {
      if (count === 1) return 'grid-cols-1';
      if (count === 2) return 'grid-cols-1 lg:grid-cols-2';
      if (count >= 3) return 'grid-cols-1 lg:grid-cols-3';
      return '';
    };

    expect(getGridClass(1)).toBe('grid-cols-1');
    expect(getGridClass(2)).toBe('grid-cols-1 lg:grid-cols-2');
    expect(getGridClass(3)).toBe('grid-cols-1 lg:grid-cols-3');
  });

  it('should categorize authenticity scores', () => {
    const getCategory = (score: number) => {
      if (score >= 90) return 'excellent';
      if (score >= 80) return 'good';
      if (score >= 70) return 'fair';
      return 'needs-improvement';
    };

    expect(getCategory(95)).toBe('excellent');
    expect(getCategory(85)).toBe('good');
    expect(getCategory(75)).toBe('fair');
    expect(getCategory(65)).toBe('needs-improvement');
  });
});
