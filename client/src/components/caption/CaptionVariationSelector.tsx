import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Check, 
  RefreshCw, 
  TrendingUp, 
  Heart, 
  MessageCircle, 
  Bookmark, 
  Share2,
  Sparkles,
  Target,
  Zap,
  GitCompare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CaptionVariationComparison } from './CaptionVariationComparison';

export interface CaptionVariation {
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

export interface CaptionVariationSelectorProps {
  variations: CaptionVariation[];
  onSelectVariation: (index: number, variation: CaptionVariation) => void;
  onRegenerateAll: () => void;
  isLoading?: boolean;
  selectedIndex?: number;
}

const StyleIcon = ({ type }: { type: 'viral' | 'authentic' | 'balanced' }) => {
  switch (type) {
    case 'viral':
      return <Zap className="h-4 w-4" />;
    case 'authentic':
      return <Heart className="h-4 w-4" />;
    case 'balanced':
      return <Target className="h-4 w-4" />;
  }
};

const StyleBadge = ({ type }: { type: 'viral' | 'authentic' | 'balanced' }) => {
  const variants = {
    viral: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 border-purple-200 dark:border-purple-800',
    authentic: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    balanced: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-200 dark:border-green-800'
  };

  return (
    <Badge variant="outline" className={cn('flex items-center gap-1', variants[type])}>
      <StyleIcon type={type} />
      <span className="capitalize">{type}</span>
    </Badge>
  );
};

const AuthenticityMeter = ({ score }: { score: number }) => {
  const getColor = () => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 80) return 'bg-blue-500';
    if (score >= 70) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getTextColor = () => {
    if (score >= 90) return 'text-green-700 dark:text-green-300';
    if (score >= 80) return 'text-blue-700 dark:text-blue-300';
    if (score >= 70) return 'text-yellow-700 dark:text-yellow-300';
    return 'text-red-700 dark:text-red-300';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-600 dark:text-gray-400">Authenticity</span>
        <span className={cn('font-semibold', getTextColor())}>{score}/100</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
        <div 
          className={cn('h-full rounded-full transition-all duration-500', getColor())}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
};

const EngagementPreview = ({ prediction }: { prediction: CaptionVariation['engagementPrediction'] }) => {
  const metrics = [
    { icon: Heart, label: 'Likes', value: prediction.likeRate, color: 'text-pink-500' },
    { icon: MessageCircle, label: 'Comments', value: prediction.commentRate, color: 'text-blue-500' },
    { icon: Bookmark, label: 'Saves', value: prediction.saveRate, color: 'text-purple-500' },
    { icon: Share2, label: 'Shares', value: prediction.shareRate, color: 'text-green-500' }
  ];

  return (
    <div className="grid grid-cols-2 gap-2">
      {metrics.map(({ icon: Icon, label, value, color }) => (
        value !== undefined && (
          <div key={label} className="flex items-center gap-2 text-xs">
            <Icon className={cn('h-3 w-3', color)} />
            <span className="text-gray-600 dark:text-gray-400">{label}:</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">
              {(value * 100).toFixed(1)}%
            </span>
          </div>
        )
      ))}
    </div>
  );
};

export function CaptionVariationSelector({
  variations,
  onSelectVariation,
  onRegenerateAll,
  isLoading = false,
  selectedIndex
}: CaptionVariationSelectorProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showComparison, setShowComparison] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-4">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-blue-500" />
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Generating authentic caption variations...
          </p>
        </div>
      </div>
    );
  }

  if (!variations || variations.length === 0) {
    return (
      <div className="text-center py-12 space-y-4">
        <Sparkles className="h-12 w-12 mx-auto text-gray-400" />
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            No variations yet
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 max-w-md mx-auto">
            Generate AI-powered caption variations to see different styles and engagement predictions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Comparison View */}
      {showComparison ? (
        <CaptionVariationComparison
          variations={variations}
          selectedIndices={[0, 1, 2]}
          onClose={() => setShowComparison(false)}
        />
      ) : (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-blue-500" />
                Caption Variations
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Choose your favorite or regenerate for new options
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowComparison(true)}
                disabled={isLoading || variations.length < 2}
                className="flex items-center gap-2"
              >
                <GitCompare className="h-4 w-4" />
                Compare
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onRegenerateAll}
                disabled={isLoading}
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Regenerate All
              </Button>
            </div>
          </div>

      {/* Variations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {variations.map((variation, index) => {
          const isSelected = selectedIndex === index;
          const isHovered = hoveredIndex === index;

          return (
            <Card
              key={index}
              className={cn(
                'relative transition-all duration-300 cursor-pointer',
                'hover:shadow-lg hover:-translate-y-1',
                isSelected && 'ring-2 ring-blue-500 shadow-lg',
                isHovered && !isSelected && 'shadow-md'
              )}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {/* Selected Indicator */}
              {isSelected && (
                <div className="absolute -top-2 -right-2 bg-blue-500 text-white rounded-full p-1 shadow-lg">
                  <Check className="h-4 w-4" />
                </div>
              )}

              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <StyleBadge type={variation.styleCharacteristics.type} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Variation {index + 1}
                  </span>
                </div>
                
                <CardDescription className="text-xs">
                  {variation.styleCharacteristics.description}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Authenticity Score */}
                <AuthenticityMeter score={variation.authenticityScore} />

                {/* Caption Preview */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                    Caption
                  </label>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 max-h-32 overflow-y-auto text-sm text-gray-700 dark:text-gray-300">
                    {variation.caption}
                  </div>
                </div>

                {/* Engagement Predictions */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Predicted Engagement
                    </label>
                    {variation.engagementPrediction.confidence && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {(variation.engagementPrediction.confidence * 100).toFixed(0)}% confidence
                      </span>
                    )}
                  </div>
                  <EngagementPreview prediction={variation.engagementPrediction} />
                </div>

                {/* Patterns Used */}
                {variation.styleCharacteristics.patterns && variation.styleCharacteristics.patterns.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Patterns Used
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {variation.styleCharacteristics.patterns.slice(0, 2).map((pattern, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {pattern}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hooks Used */}
                {variation.styleCharacteristics.hooks && variation.styleCharacteristics.hooks.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Viral Hooks
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {variation.styleCharacteristics.hooks.slice(0, 2).map((hook, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          <TrendingUp className="h-3 w-3 mr-1" />
                          {hook}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={isSelected ? 'default' : 'outline'}
                  onClick={() => onSelectVariation(index, variation)}
                >
                  {isSelected ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Selected
                    </>
                  ) : (
                    'Use This Caption'
                  )}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* Additional Info */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex gap-3">
          <Sparkles className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
              About These Variations
            </h4>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Each variation is crafted using your unique voice profile, viral patterns from your niche, 
              and real high-performing examples. Authenticity scores above 80 ensure the captions sound 
              genuinely human-written.
            </p>
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
}

export default CaptionVariationSelector;
