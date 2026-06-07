import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Save, 
  TrendingUp, 
  Heart, 
  MessageCircle, 
  Bookmark, 
  Share2,
  Sparkles,
  AlertCircle,
  CheckCircle,
  Edit3,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CaptionVariation } from './CaptionVariationSelector';

export interface CaptionEditorWithTrackingProps {
  // Initial caption to edit
  initialCaption: string;
  
  // Optional initial variation data (if editing a selected variation)
  initialVariation?: CaptionVariation;
  
  // Callback when caption is saved
  onSave: (editedCaption: string, originalCaption: string) => void;
  
  // Optional callback for real-time updates
  onChange?: (caption: string) => void;
  
  // Optional workspace ID for tracking
  workspaceId?: string;
  
  // Optional caption ID for tracking
  captionId?: string;
  
  // Character limit (Instagram default: 2200)
  maxLength?: number;
  
  // Placeholder text
  placeholder?: string;
  
  // Disabled state
  disabled?: boolean;
}

interface EditMetrics {
  authenticityScore: number;
  engagementPrediction: {
    likeRate?: number;
    commentRate?: number;
    saveRate?: number;
    shareRate?: number;
  };
  characterCount: number;
  hasChanges: boolean;
}

const AuthenticityIndicator = ({ score, isCalculating }: { score: number; isCalculating: boolean }) => {
  const getColor = () => {
    if (score >= 90) return 'bg-green-500 text-green-700 dark:text-green-300';
    if (score >= 80) return 'bg-blue-500 text-blue-700 dark:text-blue-300';
    if (score >= 70) return 'bg-yellow-500 text-yellow-700 dark:text-yellow-300';
    return 'bg-red-500 text-red-700 dark:text-red-300';
  };

  const getIcon = () => {
    if (isCalculating) return <Loader2 className="h-3 w-3 animate-spin" />;
    if (score >= 80) return <CheckCircle className="h-3 w-3" />;
    return <AlertCircle className="h-3 w-3" />;
  };

  const getMessage = () => {
    if (isCalculating) return 'Calculating...';
    if (score >= 90) return 'Excellent';
    if (score >= 80) return 'Good';
    if (score >= 70) return 'Fair';
    return 'Needs improvement';
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600 dark:text-gray-400">Authenticity:</span>
      <Badge variant="outline" className={cn('flex items-center gap-1 text-xs', getColor())}>
        {getIcon()}
        <span>{score}/100</span>
        <span className="ml-1 opacity-75">({getMessage()})</span>
      </Badge>
    </div>
  );
};

const EngagementMetrics = ({ 
  prediction, 
  isCalculating 
}: { 
  prediction: EditMetrics['engagementPrediction']; 
  isCalculating: boolean 
}) => {
  const metrics = [
    { icon: Heart, label: 'Likes', value: prediction.likeRate, color: 'text-pink-500' },
    { icon: MessageCircle, label: 'Comments', value: prediction.commentRate, color: 'text-blue-500' },
    { icon: Bookmark, label: 'Saves', value: prediction.saveRate, color: 'text-purple-500' },
    { icon: Share2, label: 'Shares', value: prediction.shareRate, color: 'text-green-500' }
  ];

  if (isCalculating) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Loader2 className="h-3 w-3 animate-spin" />
        <span>Updating predictions...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {metrics.map(({ icon: Icon, label, value, color }) => (
        value !== undefined && (
          <div key={label} className="flex items-center gap-1 text-xs">
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

export function CaptionEditorWithTracking({
  initialCaption,
  initialVariation,
  onSave,
  onChange,
  workspaceId,
  captionId,
  maxLength = 2200,
  placeholder = 'Write your caption here...',
  disabled = false
}: CaptionEditorWithTrackingProps) {
  const [caption, setCaption] = useState(initialCaption);
  const [metrics, setMetrics] = useState<EditMetrics>({
    authenticityScore: initialVariation?.authenticityScore || 0,
    engagementPrediction: initialVariation?.engagementPrediction || {},
    characterCount: initialCaption.length,
    hasChanges: false
  });
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const originalCaptionRef = useRef(initialCaption);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Calculate simple authenticity score based on common AI tells
  const calculateAuthenticityScore = useCallback((text: string): number => {
    if (!text || text.length < 10) return 0;
    
    let score = 100;
    
    // Common AI tells (reduce score)
    const aiTells = [
      /\b(delve|explore|journey|unlock|leverage|transform|revolutionize)\b/gi,
      /\b(synergy|paradigm|robust|optimize|innovative)\b/gi,
      /let's dive in|in today's digital age|are you ready to/gi,
      /buckle up|here's the thing/gi
    ];
    
    aiTells.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        score -= matches.length * 5;
      }
    });
    
    // Positive indicators (add score)
    const hasContractions = /\b(it's|don't|you're|we're|I'm|can't|won't)\b/gi.test(text);
    if (hasContractions) score += 5;
    
    const hasQuestion = /\?/.test(text);
    if (hasQuestion) score += 3;
    
    const hasEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(text);
    if (hasEmoji) score += 3;
    
    // Sentence variety
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 1) {
      const lengths = sentences.map(s => s.split(/\s+/).length);
      const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
      const variance = lengths.reduce((sum, len) => sum + Math.pow(len - avgLength, 2), 0) / lengths.length;
      if (variance > 10) score += 5; // Good sentence variety
    }
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }, []);

  // Calculate simple engagement prediction based on caption characteristics
  const calculateEngagementPrediction = useCallback((text: string) => {
    if (!text || text.length < 10) {
      return { likeRate: 0, commentRate: 0, saveRate: 0, shareRate: 0 };
    }
    
    let likeBonus = 0;
    let commentBonus = 0;
    let saveBonus = 0;
    let shareBonus = 0;
    
    // Hook strength (first 10 words)
    const firstWords = text.split(/\s+/).slice(0, 10).join(' ');
    if (/\b(POV|Hot take|Unpopular opinion|Real talk|Fun fact)\b/gi.test(firstWords)) {
      likeBonus += 0.01;
      commentBonus += 0.005;
    }
    
    // Engagement question
    if (/\?/.test(text)) {
      commentBonus += 0.01;
    }
    
    // Educational/value content
    if (/\b(tip|guide|how to|tutorial|learn|hack)\b/gi.test(text)) {
      saveBonus += 0.008;
    }
    
    // Controversial/opinionated
    if (/\b(controversial|opinion|disagree|debate)\b/gi.test(text)) {
      commentBonus += 0.008;
      shareBonus += 0.003;
    }
    
    // Emotional resonance
    if (/\b(love|hate|amazing|incredible|struggle|win|fail)\b/gi.test(text)) {
      likeBonus += 0.005;
      shareBonus += 0.002;
    }
    
    // Length optimization (Instagram sweet spot: 125-150 words)
    const wordCount = text.split(/\s+/).length;
    if (wordCount >= 100 && wordCount <= 200) {
      likeBonus += 0.005;
      saveBonus += 0.003;
    }
    
    // Base rates for Instagram
    const baseRates = {
      likeRate: 0.03,      // 3% base like rate
      commentRate: 0.003,  // 0.3% base comment rate
      saveRate: 0.005,     // 0.5% base save rate
      shareRate: 0.001     // 0.1% base share rate
    };
    
    return {
      likeRate: Math.min(0.15, baseRates.likeRate + likeBonus),
      commentRate: Math.min(0.05, baseRates.commentRate + commentBonus),
      saveRate: Math.min(0.08, baseRates.saveRate + saveBonus),
      shareRate: Math.min(0.03, baseRates.shareRate + shareBonus)
    };
  }, []);

  // Debounced metrics calculation
  const updateMetrics = useCallback((text: string) => {
    setIsCalculating(true);
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set new timer for debounced calculation
    debounceTimerRef.current = setTimeout(() => {
      const authenticityScore = calculateAuthenticityScore(text);
      const engagementPrediction = calculateEngagementPrediction(text);
      
      setMetrics({
        authenticityScore,
        engagementPrediction,
        characterCount: text.length,
        hasChanges: text !== originalCaptionRef.current
      });
      
      setIsCalculating(false);
    }, 500); // 500ms debounce
  }, [calculateAuthenticityScore, calculateEngagementPrediction]);

  // Handle caption change
  const handleCaptionChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newCaption = e.target.value;
    
    // Don't exceed max length
    if (newCaption.length > maxLength) return;
    
    setCaption(newCaption);
    updateMetrics(newCaption);
    
    // Call onChange callback if provided
    if (onChange) {
      onChange(newCaption);
    }
  };

  // Handle save
  const handleSave = async () => {
    if (!metrics.hasChanges) return;
    
    setIsSaving(true);
    try {
      // Call the onSave callback with edited and original captions
      await onSave(caption, originalCaptionRef.current);
      
      // Update the original caption ref to current caption
      originalCaptionRef.current = caption;
      
      // Reset hasChanges flag
      setMetrics(prev => ({ ...prev, hasChanges: false }));
    } catch (error) {
      console.error('Failed to save caption:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate initial metrics on mount
  useEffect(() => {
    updateMetrics(initialCaption);
  }, [initialCaption, updateMetrics]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const characterPercentage = (metrics.characterCount / maxLength) * 100;
  const isNearLimit = characterPercentage >= 90;
  const isAtLimit = metrics.characterCount >= maxLength;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Edit3 className="h-5 w-5 text-blue-500" />
              Edit Caption
            </CardTitle>
            <CardDescription>
              Edit your caption with real-time authenticity and engagement tracking
            </CardDescription>
          </div>
          
          <Button
            onClick={handleSave}
            disabled={!metrics.hasChanges || disabled || isSaving}
            className="flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Editor */}
        <div className="space-y-2">
          <Textarea
            value={caption}
            onChange={handleCaptionChange}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              'min-h-[200px] resize-y',
              isAtLimit && 'border-red-500 focus-visible:ring-red-500'
            )}
          />
          
          {/* Character Count */}
          <div className="flex items-center justify-between text-xs">
            <span className={cn(
              'font-medium',
              isAtLimit && 'text-red-600 dark:text-red-400',
              isNearLimit && !isAtLimit && 'text-yellow-600 dark:text-yellow-400',
              !isNearLimit && 'text-gray-500 dark:text-gray-400'
            )}>
              {metrics.characterCount} / {maxLength} characters
            </span>
            
            {metrics.hasChanges && (
              <Badge variant="outline" className="flex items-center gap-1 text-xs">
                <Sparkles className="h-3 w-3" />
                Unsaved changes
              </Badge>
            )}
          </div>
        </div>

        {/* Real-time Metrics */}
        <div className="space-y-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          {/* Authenticity Score */}
          <div className="space-y-2">
            <AuthenticityIndicator 
              score={metrics.authenticityScore} 
              isCalculating={isCalculating}
            />
            
            {/* Authenticity Tips */}
            {!isCalculating && metrics.authenticityScore < 80 && (
              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
                <div className="flex gap-2">
                  <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-yellow-900 dark:text-yellow-100">
                      Tips to improve authenticity:
                    </p>
                    <ul className="text-xs text-yellow-700 dark:text-yellow-300 space-y-1 list-disc list-inside">
                      <li>Use contractions (it's, don't, you're) for a conversational tone</li>
                      <li>Avoid corporate buzzwords and AI-like phrases</li>
                      <li>Add personal touches or specific details</li>
                      <li>Vary your sentence lengths naturally</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Engagement Predictions */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Predicted Engagement
              </span>
            </div>
            <EngagementMetrics 
              prediction={metrics.engagementPrediction} 
              isCalculating={isCalculating}
            />
          </div>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex gap-3">
            <Sparkles className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Learning from your edits
              </h4>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Your edits help improve future AI-generated captions by learning your unique style and preferences. 
                All changes are automatically tracked to refine your voice profile.
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CaptionEditorWithTracking;
