import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Copy, 
  Check,
  Heart, 
  MessageCircle, 
  Bookmark, 
  Share2,
  TrendingUp,
  Zap,
  Target,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CaptionVariation } from './CaptionVariationSelector';

export interface CaptionVariationComparisonProps {
  variations: CaptionVariation[];
  selectedIndices?: number[];
  onClose?: () => void;
  maxVariations?: number;
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

const CopyButton = ({ text, label = 'Copy' }: { text: string; label?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="flex items-center gap-2"
    >
      {copied ? (
        <>
          <Check className="h-4 w-4 text-green-500" />
          <span className="text-green-500">Copied!</span>
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
};

const DifferenceHighlight = ({ 
  text, 
  otherTexts 
}: { 
  text: string; 
  otherTexts: string[] 
}) => {
  // Simple word-level difference highlighting
  const words = text.split(/\s+/);
  const otherWords = otherTexts.flatMap(t => t.split(/\s+/));
  
  return (
    <div className="text-sm leading-relaxed">
      {words.map((word, index) => {
        const isUnique = !otherWords.some(ow => 
          ow.toLowerCase() === word.toLowerCase()
        );
        
        return (
          <span
            key={index}
            className={cn(
              'inline-block mr-1',
              isUnique && 'bg-yellow-100 dark:bg-yellow-900/30 px-0.5 rounded'
            )}
          >
            {word}
          </span>
        );
      })}
    </div>
  );
};

const MetricComparison = ({ 
  variations, 
  metric 
}: { 
  variations: CaptionVariation[];
  metric: keyof CaptionVariation['engagementPrediction'];
}) => {
  const metricConfig = {
    likeRate: { icon: Heart, label: 'Likes', color: 'text-pink-500' },
    commentRate: { icon: MessageCircle, label: 'Comments', color: 'text-blue-500' },
    saveRate: { icon: Bookmark, label: 'Saves', color: 'text-purple-500' },
    shareRate: { icon: Share2, label: 'Shares', color: 'text-green-500' },
  };

  const config = metricConfig[metric as keyof typeof metricConfig];
  if (!config) return null;

  const Icon = config.icon;
  const values = variations.map(v => v.engagementPrediction[metric] ?? 0);
  const maxValue = Math.max(...values);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
        <Icon className={cn('h-3 w-3', config.color)} />
        <span>{config.label}</span>
      </div>
      <div className="flex items-center gap-2">
        {values.map((value, index) => {
          const isHighest = value === maxValue && maxValue > 0;
          return (
            <div key={index} className="flex-1">
              <div className={cn(
                'text-center text-xs font-semibold py-1 rounded',
                isHighest 
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300'
              )}>
                {(value * 100).toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export function CaptionVariationComparison({
  variations,
  selectedIndices = [0, 1, 2],
  onClose,
  maxVariations = 3
}: CaptionVariationComparisonProps) {
  // Limit to maxVariations and filter by selected indices
  const compareVariations = selectedIndices
    .slice(0, maxVariations)
    .map(index => variations[index])
    .filter(Boolean);

  if (compareVariations.length === 0) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          No variations to compare
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Side-by-Side Comparison
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Compare variations to understand differences and choose the best fit
          </p>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="flex items-center gap-2"
          >
            <X className="h-4 w-4" />
            Close
          </Button>
        )}
      </div>

      {/* Comparison Grid */}
      <div className={cn(
        'grid gap-4',
        compareVariations.length === 1 && 'grid-cols-1',
        compareVariations.length === 2 && 'grid-cols-1 lg:grid-cols-2',
        compareVariations.length >= 3 && 'grid-cols-1 lg:grid-cols-3'
      )}>
        {compareVariations.map((variation, index) => {
          const actualIndex = selectedIndices[index];
          const otherCaptions = compareVariations
            .filter((_, i) => i !== index)
            .map(v => v.caption);

          return (
            <Card key={actualIndex} className="h-full">
              <CardHeader className="space-y-3">
                <div className="flex items-center justify-between">
                  <StyleBadge type={variation.styleCharacteristics.type} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Variation {actualIndex + 1}
                  </span>
                </div>
                
                <CardDescription className="text-xs">
                  {variation.styleCharacteristics.description}
                </CardDescription>

                {/* Authenticity Score */}
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Authenticity</span>
                  <span className={cn(
                    'text-sm font-semibold',
                    variation.authenticityScore >= 90 ? 'text-green-700 dark:text-green-300' :
                    variation.authenticityScore >= 80 ? 'text-blue-700 dark:text-blue-300' :
                    'text-yellow-700 dark:text-yellow-300'
                  )}>
                    {variation.authenticityScore}/100
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Caption with Difference Highlighting */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Caption
                    </label>
                    <CopyButton text={variation.caption} label="Copy" />
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-3 max-h-48 overflow-y-auto">
                    {compareVariations.length > 1 ? (
                      <DifferenceHighlight 
                        text={variation.caption} 
                        otherTexts={otherCaptions}
                      />
                    ) : (
                      <p className="text-sm text-gray-700 dark:text-gray-300">
                        {variation.caption}
                      </p>
                    )}
                  </div>
                </div>

                {/* Hashtags */}
                {variation.hashtags && variation.hashtags.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                        Hashtags ({variation.hashtags.length})
                      </label>
                      <CopyButton 
                        text={variation.hashtags.join(' ')} 
                        label="Copy" 
                      />
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-md p-2 max-h-24 overflow-y-auto">
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {variation.hashtags.slice(0, 10).join(' ')}
                        {variation.hashtags.length > 10 && ' ...'}
                      </p>
                    </div>
                  </div>
                )}

                <Separator />

                {/* Patterns Used */}
                {variation.styleCharacteristics.patterns && variation.styleCharacteristics.patterns.length > 0 && (
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      Patterns Used
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {variation.styleCharacteristics.patterns.map((pattern, i) => (
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
                      {variation.styleCharacteristics.hooks.map((hook, i) => (
                        <Badge key={i} variant="secondary" className="text-xs flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {hook}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Engagement Metrics Comparison */}
      {compareVariations.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Engagement Prediction Comparison</CardTitle>
            <CardDescription className="text-xs">
              Side-by-side metrics to help you choose the best performing variation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <MetricComparison variations={compareVariations} metric="likeRate" />
              <MetricComparison variations={compareVariations} metric="commentRate" />
              <MetricComparison variations={compareVariations} metric="saveRate" />
              <MetricComparison variations={compareVariations} metric="shareRate" />
            </div>

            {/* Confidence Scores */}
            <Separator />
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Prediction Confidence
              </div>
              <div className="flex items-center gap-2">
                {compareVariations.map((variation, index) => {
                  const confidence = variation.engagementPrediction.confidence ?? 0;
                  return (
                    <div key={index} className="flex-1">
                      <div className="text-center text-xs font-semibold py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
                        {(confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Banner */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
            💡 Comparison Tips
          </h4>
          <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1 list-disc list-inside">
            <li>Highlighted words are unique to each variation</li>
            <li>Green metrics indicate the highest predicted performance</li>
            <li>Use "Copy" buttons to quickly test captions in your workflow</li>
            <li>Consider both authenticity scores and engagement predictions</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default CaptionVariationComparison;
